const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

// モデルクラスをインポート
const Game = require('./src/models/Game');
const Player = require('./src/models/Player');
const GameEngine = require('./src/models/GameEngine');
const JudgmentEngine = require('./src/models/JudgmentEngine');
const JudgmentErrorHandler = require('./src/utils/JudgmentErrorHandler');
const StateValidator = require('./src/utils/StateValidator');
const { ErrorHandler, ERROR_TYPES } = require('./src/utils/ErrorHandler');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = process.env.PORT || 3000;

// ゲームエンジンのインスタンス
const gameEngine = new GameEngine();
// 判定エンジンのインスタンス
const judgmentEngine = new JudgmentEngine();

// 入力検証スキーマ
const VALIDATION_SCHEMAS = {
  joinGame: {
    playerName: {
      required: false,
      type: 'string',
      maxLength: 20,
      minLength: 1,
      validator: (value) => {
        if (value && !/^[a-zA-Z0-9あ-んア-ンー一-龯\s]+$/.test(value)) {
          return 'プレイヤー名に使用できない文字が含まれています';
        }
        if (value && value.trim().length === 0) {
          return 'プレイヤー名は空白のみにはできません';
        }
        return true;
      }
    }
  },
  discardTile: {
    tileId: {
      required: true,
      type: 'string',
      validator: (value) => {
        if (!value || typeof value !== 'string') {
          return '牌IDが指定されていません';
        }
        if (!/^(bamboo_[1-9]|honor_(white|green|red))$/.test(value)) {
          return '無効な牌IDです';
        }
        return true;
      }
    }
  },
  drawTile: {
    // drawTileは追加パラメータ不要だが、将来の拡張のため
  },
  declareRiichi: {
    // riichiも追加パラメータ不要だが、将来の拡張のため
  }
};

// 静的ファイルの配信
app.use(express.static(path.join(__dirname, 'public')));

// ゲーム管理
const playerGameMap = new Map(); // playerId -> gameId
const waitingPlayers = new Set(); // 待機中のプレイヤー
const playerTimers = new Map(); // playerId -> timeout ID for turn timer

// メインページ
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// エラー統計エンドポイント（開発・デバッグ用）
app.get('/api/error-stats', (req, res) => {
  try {
    const stats = ErrorHandler.getErrorStats();
    res.json({
      success: true,
      data: stats,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    ErrorHandler.log('error', 'エラー統計取得でエラー', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'エラー統計を取得できませんでした'
    });
  }
});

// ヘルスチェックエンドポイント
app.get('/api/health', (req, res) => {
  try {
    const activeGames = gameEngine.getActiveGameCount();
    const waitingPlayers = waitingPlayers.size;

    res.json({
      success: true,
      status: 'healthy',
      data: {
        activeGames,
        waitingPlayers,
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    ErrorHandler.log('error', 'ヘルスチェックでエラー', { error: error.message });
    res.status(500).json({
      success: false,
      status: 'unhealthy',
      error: 'ヘルスチェックに失敗しました'
    });
  }
});

/**
 * 待機中のプレイヤーとマッチングを試行
 * @param {string} playerId - 新しいプレイヤーのID
 * @param {string} playerName - プレイヤー名
 * @returns {Game|null} 作成されたゲームまたはnull
 */
function tryMatchmaking(playerId, playerName) {
  // 既に待機中のプレイヤーがいる場合、マッチング
  if (waitingPlayers.size > 0) {
    const waitingPlayerId = waitingPlayers.values().next().value;
    waitingPlayers.delete(waitingPlayerId);

    // 新しいゲームを作成（GameEngineを使用）
    const game = gameEngine.createGame();

    // 待機中のプレイヤーの名前を取得（簡易実装）
    const waitingPlayerName = `プレイヤー${waitingPlayerId.substr(0, 4)}`;

    // 両プレイヤーをゲームに追加
    game.addPlayer(waitingPlayerId, waitingPlayerName);
    game.addPlayer(playerId, playerName);

    // プレイヤーマッピングを登録
    playerGameMap.set(waitingPlayerId, game.gameId);
    playerGameMap.set(playerId, game.gameId);

    return game;
  } else {
    // 待機中のプレイヤーがいない場合、待機リストに追加
    waitingPlayers.add(playerId);
    return null;
  }
}

/**
 * プレイヤーをゲームから削除し、関連データをクリーンアップ
 * @param {string} playerId - 削除するプレイヤーID
 */
function removePlayerFromGame(playerId) {
  const gameId = playerGameMap.get(playerId);

  if (gameId) {
    const game = gameEngine.getGame(gameId);
    if (game) {
      // ゲームからプレイヤーを削除
      game.removePlayer(playerId);

      // 相手プレイヤーに通知
      const remainingPlayer = game.players[0];
      if (remainingPlayer) {
        io.to(remainingPlayer.id).emit('playerDisconnected', {
          message: '相手プレイヤーが切断しました',
          disconnectedPlayerId: playerId
        });
      }

      // ゲームが空になった場合は削除
      if (game.players.length === 0) {
        gameEngine.removeGame(gameId);
      }
    }

    // プレイヤーのマッピングを削除
    playerGameMap.delete(playerId);
  }

  // 待機リストからも削除
  waitingPlayers.delete(playerId);
}

/**
 * 終了したゲームをクリーンアップ
 * @param {string} gameId - ゲームID
 */
function cleanupFinishedGame(gameId) {
  const game = gameEngine.getGame(gameId);
  if (game) {
    // プレイヤーマッピングをクリーンアップ
    game.players.forEach(player => {
      playerGameMap.delete(player.id);

      // プレイヤーをSocketルームから削除
      const playerSocket = io.sockets.sockets.get(player.id);
      if (playerSocket) {
        playerSocket.leave(gameId);
      }
    });

    // ゲームを削除
    gameEngine.removeGame(gameId);

    ErrorHandler.log('info', 'ゲームクリーンアップ完了', { gameId });
  }
}

/**
 * ゲーム終了処理
 * @param {Game} game - ゲーム
 * @param {Object} result - ゲーム終了結果
 */
function handleGameEnd(game, result) {
  if (result.result === 'draw') {
    const finalGameState = game.getGameState();
    io.to(game.gameId).emit('gameEnded', {
      result: 'draw',
      message: result.message,
      finalState: finalGameState
    });
    cleanupFinishedGame(game.gameId);
  } else if (result.result === 'tsumo') {
    const winner = game.getPlayer(result.winner);
    const finalGameState = game.getGameState();

    io.to(game.gameId).emit('gameEnded', {
      result: 'tsumo',
      winner: {
        id: winner.id,
        name: winner.name
      },
      winningTile: result.tile,
      message: result.message,
      finalState: finalGameState
    });
    cleanupFinishedGame(game.gameId);
  }
}

/**
 * ゲーム状態を全プレイヤーに同期
 * @param {Game} game - 同期するゲーム
 */
function syncGameState(game) {
  // 手牌数の整合性チェック
  game.players.forEach(player => {
    const handSize = player.getHandSize();
    if (handSize < 4 || handSize > 5) {
      ErrorHandler.log('error', '手牌数異常を検出', {
        gameId: game.gameId,
        playerId: player.id,
        handSize: handSize,
        expectedRange: '4-5枚'
      });
    }
  });

  game.players.forEach(player => {
    const gameStateForPlayer = game.getGameStateForPlayer(player.id);
    io.to(player.id).emit('gameStateUpdate', gameStateForPlayer);
  });

  // 手番開始時の自動牌引き処理（要件7.1）
  handleAutoDrawTile(game);

  // 手番タイマーを設定
  setTurnTimer(game);
}

/**
 * 手番開始時の自動牌引き処理
 * @param {Game} game - ゲーム
 */
function handleAutoDrawTile(game) {
  if (!game.isPlayable()) {
    return;
  }

  const currentPlayer = game.getCurrentPlayer();
  if (!currentPlayer) {
    return;
  }

  // 手牌が4枚の場合のみ自動牌引きの確認を送信
  if (currentPlayer.getHandSize() === 4) {
    // ロン待機状態をチェック
    if (currentPlayer.ronWaiting) {
      ErrorHandler.log('debug', '自動牌引きスキップ - ロン待機中', { 
        playerId: currentPlayer.id,
        gameId: game.gameId 
      });
      return; // ロン待機中は自動牌引きをスキップ
    }

    // クライアントに自動牌引きの確認を送信（ロン判定の時間を与える）
    ErrorHandler.log('debug', '自動牌引き確認をクライアントに送信', { 
      playerId: currentPlayer.id,
      gameId: game.gameId 
    });
    
    io.to(currentPlayer.id).emit('autoDrawRequest', {
      playerId: currentPlayer.id,
      gameId: game.gameId
    });
    return;
  }
}

/**
 * 手番タイマーを設定（要件6.2）
 * @param {Game} game - ゲーム
 */
function setTurnTimer(game) {
  if (!game.isPlayable()) {
    return;
  }

  const currentPlayer = game.getCurrentPlayer();
  if (!currentPlayer) {
    return;
  }

  // 既存のタイマーをクリア
  clearTurnTimer(currentPlayer.id);

  // 30秒のタイマーを設定
  const timerId = setTimeout(() => {
    handleTurnTimeout(game.gameId, currentPlayer.id);
  }, 30000);

  playerTimers.set(currentPlayer.id, timerId);

  // クライアントにタイマー開始を通知
  io.to(game.gameId).emit('turnTimerStarted', {
    playerId: currentPlayer.id,
    timeLimit: 30000 // 30秒
  });
}

/**
 * 手番タイマーをクリア
 * @param {string} playerId - プレイヤーID
 */
function clearTurnTimer(playerId) {
  const timerId = playerTimers.get(playerId);
  if (timerId) {
    clearTimeout(timerId);
    playerTimers.delete(playerId);
  }
}

/**
 * 手番タイムアウト処理
 * @param {string} gameId - ゲームID
 * @param {string} playerId - タイムアウトしたプレイヤーID
 */
function handleTurnTimeout(gameId, playerId) {
  const game = gameEngine.getGame(gameId);
  if (!game || !game.isPlayable()) {
    return;
  }

  const player = game.getPlayer(playerId);
  if (!player || !game.isPlayerTurn(playerId)) {
    return;
  }

  ErrorHandler.log('info', '手番タイムアウト', { gameId, playerId });

  try {
    // プレイヤーの手牌が5枚の場合、ランダムに捨て牌
    if (player.getHandSize() === 5) {
      const randomTile = player.hand[Math.floor(Math.random() * player.hand.length)];
      const result = gameEngine.discardTile(gameId, playerId, randomTile.id);

      if (result.success) {
        // タイムアウトによる自動捨て牌を通知
        io.to(gameId).emit('autoDiscardTimeout', {
          playerId: playerId,
          discardedTile: result.discardedTile,
          message: '制限時間により自動的に捨てました'
        });

        // ゲーム状態を同期
        syncGameState(game);

        // ロン判定の結果処理
        if (result.gameEnded && result.result === 'ron') {
          const winner = game.getPlayer(result.winner);
          const finalGameState = game.getGameState();

          io.to(gameId).emit('gameEnded', {
            result: 'ron',
            winner: {
              id: winner.id,
              name: winner.name
            },
            winningTile: result.discardedTile,
            message: result.message,
            finalState: finalGameState
          });

          cleanupFinishedGame(gameId);
        }
      }
    } else if (player.getHandSize() === 4) {
      // 手牌が4枚の場合、牌を引く
      const result = gameEngine.drawTile(gameId, playerId);

      if (result.success) {
        // タイムアウトによる自動ドローを通知
        io.to(gameId).emit('autoDrawTimeout', {
          playerId: playerId,
          message: '制限時間により自動的に牌を引きました'
        });

        // ゲーム状態を同期
        syncGameState(game);

        // ゲーム終了の処理
        if (result.gameEnded) {
          if (result.result === 'draw') {
            const finalGameState = game.getGameState();
            io.to(gameId).emit('gameEnded', {
              result: 'draw',
              message: result.message,
              finalState: finalGameState
            });
            cleanupFinishedGame(gameId);
          } else if (result.result === 'tsumo') {
            const winner = game.getPlayer(result.winner);
            const finalGameState = game.getGameState();

            io.to(gameId).emit('gameEnded', {
              result: 'tsumo',
              winner: {
                id: winner.id,
                name: winner.name
              },
              winningTile: result.tile,
              message: result.message,
              finalState: finalGameState
            });
            cleanupFinishedGame(gameId);
          }
        }
      }
    }
  } catch (error) {
    ErrorHandler.log('error', 'タイムアウト処理でエラー', {
      gameId,
      playerId,
      error: error.message
    });
  }
}

// Socket.io接続処理
io.on('connection', (socket) => {
  console.log('プレイヤーが接続しました:', socket.id);

  // プレイヤー参加処理
  ErrorHandler.wrapSocketHandler(socket, 'joinGame', async (data) => {
    const playerId = socket.id;

    // レート制限チェック
    if (!ErrorHandler.checkRateLimit(playerId, 'joinGame', 5)) {
      socket.emit('actionError', ErrorHandler.createErrorResponse(
        ERROR_TYPES.RATE_LIMIT_ERROR,
        '参加要求が頻繁すぎます。少し待ってから再試行してください'
      ));
      return;
    }

    // 入力検証
    const validation = ErrorHandler.validateInput(data || {}, VALIDATION_SCHEMAS.joinGame);
    if (!validation.isValid) {
      socket.emit('actionError', ErrorHandler.createValidationErrorResponse(validation.errors));
      return;
    }

    // 既にゲームに参加しているかチェック
    if (playerGameMap.has(playerId)) {
      socket.emit('actionError', ErrorHandler.createErrorResponse(
        ERROR_TYPES.DUPLICATE_ACTION,
        '既にゲームに参加しています'
      ));
      return;
    }

    const { playerName } = data || {};

    ErrorHandler.log('info', 'プレイヤーがゲーム参加を要求', {
      playerId,
      playerName: playerName || 'unnamed'
    });

    try {
      // タイムアウト付きでマッチング処理を実行
      await ErrorHandler.withTimeout(async () => {
        // マッチングを試行
        const game = tryMatchmaking(playerId, playerName || `プレイヤー${playerId.substr(0, 4)}`);

        if (game) {
          // マッチング成功 - ゲーム開始
          ErrorHandler.log('info', 'ゲームが開始されました', { gameId: game.gameId });

          // 両プレイヤーをSocketルームに参加
          game.players.forEach(player => {
            const playerSocket = io.sockets.sockets.get(player.id);
            if (playerSocket) {
              playerSocket.join(game.gameId);
            }
          });

          // ゲーム開始通知
          io.to(game.gameId).emit('gameStarted', {
            gameId: game.gameId,
            message: 'ゲームが開始されました！'
          });

          // ゲーム状態を同期
          syncGameState(game);
        } else {
          // 待機中
          socket.emit('waitingForPlayer', {
            message: '相手プレイヤーを待っています...'
          });
        }
      }, 10000); // 10秒タイムアウト

    } catch (error) {
      ErrorHandler.log('error', 'ゲーム参加処理でエラー', {
        playerId,
        error: error.message,
        stack: error.stack
      });

      if (error.message.includes('タイムアウト')) {
        socket.emit('actionError', ErrorHandler.createErrorResponse(
          ERROR_TYPES.TIMEOUT_ERROR,
          'ゲーム参加処理がタイムアウトしました'
        ));
      } else {
        socket.emit('actionError', ErrorHandler.createErrorResponse(
          ERROR_TYPES.CONNECTION_ERROR,
          'ゲーム参加に失敗しました'
        ));
      }
    }
  });

  // 手動牌引きは削除 - 自動牌引きのみ使用（要件7.1）

  // 牌を捨てる処理（要件2.2, 2.3）
  ErrorHandler.wrapSocketHandler(socket, 'discardTile', async (data) => {
    const playerId = socket.id;

    // レート制限チェック
    if (!ErrorHandler.checkRateLimit(playerId, 'discardTile', 30)) {
      socket.emit('actionError', ErrorHandler.createErrorResponse(
        ERROR_TYPES.RATE_LIMIT_ERROR,
        '牌を捨てる操作が頻繁すぎます'
      ));
      return;
    }

    // 入力検証
    const validation = ErrorHandler.validateInput(data || {}, VALIDATION_SCHEMAS.discardTile);
    if (!validation.isValid) {
      socket.emit('actionError', ErrorHandler.createValidationErrorResponse(validation.errors));
      return;
    }

    const { tileId } = data;

    // 基本検証
    const gameValidation = ErrorHandler.validateGameOperation(playerId, playerGameMap, gameEngine);
    if (!gameValidation.success) {
      socket.emit('actionError', gameValidation);
      return;
    }

    const { game, gameId } = gameValidation;

    ErrorHandler.log('info', '牌を捨てる処理', { playerId, gameId, tileId });

    try {
      // タイムアウト付きで牌を捨てる処理を実行
      const result = await ErrorHandler.withTimeout(async () => {
        return gameEngine.discardTile(gameId, playerId, tileId);
      }, 5000);

      if (result.success) {
        // タイマーをクリア
        clearTurnTimer(playerId);

        // ゲーム状態を同期
        syncGameState(game);

        // 捨て牌の通知
        io.to(gameId).emit('tileDiscarded', {
          playerId: playerId,
          discardedTile: result.discardedTile
        });

        // ロン判定の結果処理
        if (result.gameEnded && result.result === 'ron') {
          ErrorHandler.log('info', 'ロン上がり', { gameId, winner: result.winner });

          // 勝者情報を取得
          const winner = game.getPlayer(result.winner);
          const finalGameState = game.getGameState();

          io.to(gameId).emit('gameEnded', {
            result: 'ron',
            winner: {
              id: winner.id,
              name: winner.name
            },
            winningTile: result.discardedTile,
            message: result.message,
            finalState: finalGameState
          });

          // ゲームをクリーンアップ
          cleanupFinishedGame(gameId);
        }
      } else {
        ErrorHandler.log('warn', '牌を捨てる処理失敗', {
          playerId,
          gameId,
          tileId,
          error: result.error,
          gameState: game ? game.gameState : 'unknown'
        });
        socket.emit('actionError', ErrorHandler.createDetailedErrorResponse(
          ERROR_TYPES.INVALID_MOVE,
          result.error,
          { action: 'discardTile', tileId, gameId }
        ));
      }
    } catch (error) {
      ErrorHandler.log('error', '牌を捨てる処理でエラー', {
        playerId,
        gameId,
        tileId,
        error: error.message,
        stack: error.stack
      });

      if (error.message.includes('タイムアウト')) {
        socket.emit('actionError', ErrorHandler.createErrorResponse(
          ERROR_TYPES.TIMEOUT_ERROR,
          '牌を捨てる処理がタイムアウトしました'
        ));
      } else {
        socket.emit('actionError', ErrorHandler.createErrorResponse(
          ERROR_TYPES.CONNECTION_ERROR,
          '牌を捨てる処理でエラーが発生しました'
        ));
      }
    }
  });

  // リーチ宣言処理（要件3.1, 3.2）
  ErrorHandler.wrapSocketHandler(socket, 'declareRiichi', async (data) => {
    const playerId = socket.id;

    // レート制限チェック
    if (!ErrorHandler.checkRateLimit(playerId, 'declareRiichi', 10)) {
      socket.emit('actionError', ErrorHandler.createErrorResponse(
        ERROR_TYPES.RATE_LIMIT_ERROR,
        'リーチ宣言が頻繁すぎます'
      ));
      return;
    }

    // 基本検証
    const validation = ErrorHandler.validateGameOperation(playerId, playerGameMap, gameEngine);
    if (!validation.success) {
      socket.emit('actionError', validation);
      return;
    }

    const { game, gameId } = validation;

    ErrorHandler.log('info', 'リーチ宣言処理', { playerId, gameId });

    try {
      // タイムアウト付きでリーチ宣言処理を実行
      const result = await ErrorHandler.withTimeout(async () => {
        return gameEngine.declareRiichi(gameId, playerId);
      }, 5000);

      if (result.success) {
        // ゲーム状態を同期
        syncGameState(game);

        // リーチ宣言の通知
        io.to(gameId).emit('riichiDeclared', {
          playerId: playerId,
          waitingTiles: result.waitingTiles,
          message: result.message
        });

        ErrorHandler.log('info', 'リーチ宣言成功', {
          playerId,
          gameId,
          waitingTiles: result.waitingTiles
        });
      } else {
        ErrorHandler.log('warn', 'リーチ宣言失敗', {
          playerId,
          gameId,
          error: result.error,
          gameState: game ? game.gameState : 'unknown'
        });
        socket.emit('actionError', ErrorHandler.createDetailedErrorResponse(
          ERROR_TYPES.INVALID_MOVE,
          result.error,
          { action: 'declareRiichi', gameId }
        ));
      }
    } catch (error) {
      ErrorHandler.log('error', 'リーチ宣言処理でエラー', {
        playerId,
        gameId,
        error: error.message,
        stack: error.stack
      });

      if (error.message.includes('タイムアウト')) {
        socket.emit('actionError', ErrorHandler.createErrorResponse(
          ERROR_TYPES.TIMEOUT_ERROR,
          'リーチ宣言処理がタイムアウトしました'
        ));
      } else {
        socket.emit('actionError', ErrorHandler.createErrorResponse(
          ERROR_TYPES.CONNECTION_ERROR,
          'リーチ宣言処理でエラーが発生しました'
        ));
      }
    }
  });

  // リーチ宣言と牌の破棄を同時に処理（要件3.1, 3.2, 5.1対応）
  ErrorHandler.wrapSocketHandler(socket, 'declareRiichiAndDiscard', async (data) => {
    const playerId = socket.id;
    const { tileId, isReachTile } = data;

    // レート制限チェック
    if (!ErrorHandler.checkRateLimit(playerId, 'declareRiichiAndDiscard', 10)) {
      socket.emit('actionError', ErrorHandler.createErrorResponse(
        ERROR_TYPES.RATE_LIMIT_ERROR,
        'リーチ宣言が頻繁すぎます'
      ));
      return;
    }

    // 基本検証
    const validation = ErrorHandler.validateGameOperation(playerId, playerGameMap, gameEngine);
    if (!validation.success) {
      socket.emit('actionError', validation);
      return;
    }

    const { game, gameId } = validation;

    ErrorHandler.log('info', 'リーチ宣言と牌破棄処理', { playerId, gameId, tileId, isReachTile });

    try {
      // タイムアウト付きでリーチ宣言と牌破棄処理を実行
      const result = await ErrorHandler.withTimeout(async () => {
        // リーチ宣言と牌破棄を同時に処理（手番を移さない）
        return gameEngine.declareRiichiWithDiscard(gameId, playerId, tileId);
      }, 5000);

      if (result.success) {
        // ゲーム状態を同期
        syncGameState(game);

        // 牌破棄の通知
        io.to(gameId).emit('tileDiscarded', {
          playerId: playerId,
          discardedTile: result.discardedTile,
          isReachTile: true // リーチ牌であることを明示
        });

        // リーチ宣言の通知
        io.to(gameId).emit('riichiDeclared', {
          playerId: playerId,
          waitingTiles: result.waitingTiles,
          message: result.message,
          discardedTile: result.discardedTile
        });

        ErrorHandler.log('info', 'リーチ宣言と牌破棄成功', {
          playerId,
          gameId,
          discardedTile: result.discardedTile,
          waitingTiles: result.waitingTiles
        });
      } else {
        ErrorHandler.log('warn', 'リーチ宣言と牌破棄失敗', {
          playerId,
          gameId,
          error: result.error,
          gameState: game ? game.gameState : 'unknown'
        });
        socket.emit('actionError', ErrorHandler.createDetailedErrorResponse(
          ERROR_TYPES.INVALID_MOVE,
          result.error,
          { action: 'declareRiichiAndDiscard', gameId, tileId }
        ));
      }
    } catch (error) {
      ErrorHandler.log('error', 'リーチ宣言と牌破棄処理でエラー', {
        playerId,
        gameId,
        tileId,
        error: error.message,
        stack: error.stack
      });

      if (error.message.includes('タイムアウト')) {
        socket.emit('actionError', ErrorHandler.createErrorResponse(
          ERROR_TYPES.TIMEOUT_ERROR,
          'リーチ宣言処理がタイムアウトしました'
        ));
      } else {
        socket.emit('actionError', ErrorHandler.createErrorResponse(
          ERROR_TYPES.CONNECTION_ERROR,
          'リーチ宣言処理でエラーが発生しました'
        ));
      }
    }
  });

  // テンパイ状態確認
  ErrorHandler.wrapSocketHandler(socket, 'checkTenpai', (data) => {
    const playerId = socket.id;

    // 基本検証
    const validation = ErrorHandler.validateGameOperation(playerId, playerGameMap, gameEngine);
    if (!validation.success) {
      socket.emit('actionError', validation);
      return;
    }

    const { gameId } = validation;

    const result = gameEngine.checkPlayerTenpai(gameId, playerId);
    socket.emit('tenpaiStatus', result);
  });

  // ゲーム状態取得
  ErrorHandler.wrapSocketHandler(socket, 'getGameState', (data) => {
    const playerId = socket.id;

    // 基本検証
    const validation = ErrorHandler.validateGameOperation(playerId, playerGameMap, gameEngine);
    if (!validation.success) {
      socket.emit('actionError', validation);
      return;
    }

    const { gameId } = validation;

    const gameState = gameEngine.getGameState(gameId, playerId);
    if (gameState) {
      socket.emit('gameStateUpdate', gameState);
    } else {
      socket.emit('actionError', ErrorHandler.createErrorResponse(
        ERROR_TYPES.GAME_NOT_FOUND,
        'ゲーム状態を取得できませんでした'
      ));
    }
  });

  // 再接続処理
  ErrorHandler.wrapSocketHandler(socket, 'attemptReconnection', (data) => {
    const playerId = socket.id;
    const { gameId } = data || {};

    if (!gameId) {
      socket.emit('reconnectionFailed', {
        error: 'ゲームIDが指定されていません'
      });
      return;
    }

    const result = gameEngine.handlePlayerReconnection(gameId, playerId);

    if (result.success) {
      // プレイヤーマッピングを復元
      playerGameMap.set(playerId, gameId);

      // Socketルームに参加
      socket.join(gameId);

      // 再接続成功を通知
      socket.emit('reconnectionSuccess', {
        gameState: result.gameState,
        message: result.message
      });

      // 相手プレイヤーに再接続を通知
      socket.to(gameId).emit('playerReconnected', {
        playerId: playerId,
        message: 'プレイヤーが再接続しました'
      });

      ErrorHandler.log('info', 'プレイヤー再接続成功', { playerId, gameId });
    } else {
      socket.emit('reconnectionFailed', {
        error: result.error
      });

      ErrorHandler.log('warn', 'プレイヤー再接続失敗', { playerId, gameId, error: result.error });
    }
  });

  // 上がり宣言処理（要件4.1, 4.2）
  ErrorHandler.wrapSocketHandler(socket, 'declareWin', async (data) => {
    const playerId = socket.id;
    const { type } = data; // 'tsumo' または 'ron'

    // レート制限チェック
    if (!ErrorHandler.checkRateLimit(playerId, 'declareWin', 5)) {
      socket.emit('actionError', ErrorHandler.createErrorResponse(
        ERROR_TYPES.RATE_LIMIT_ERROR,
        '上がり宣言が頻繁すぎます'
      ));
      return;
    }

    // 基本検証
    const validation = ErrorHandler.validateGameOperation(playerId, playerGameMap, gameEngine);
    if (!validation.success) {
      socket.emit('actionError', validation);
      return;
    }

    const { game, gameId } = validation;

    ErrorHandler.log('info', '上がり宣言処理', { playerId, gameId, type });

    try {
      const player = game.getPlayer(playerId);
      if (!player) {
        socket.emit('actionError', ErrorHandler.createErrorResponse(
          ERROR_TYPES.PLAYER_NOT_FOUND,
          'プレイヤーが見つかりません'
        ));
        return;
      }

      // リーチしていない場合は上がれない（要件3.6）
      if (!player.isRiichi) {
        socket.emit('actionError', ErrorHandler.createErrorResponse(
          ERROR_TYPES.RIICHI_REQUIRED,
          'リーチしていないため上がることができません'
        ));
        return;
      }

      let winResult = null;

      if (type === 'tsumo') {
        // ツモ上がりの処理（要件4.1）
        const isPlayerTurn = game.isPlayerTurn(playerId);
        if (!isPlayerTurn) {
          socket.emit('actionError', ErrorHandler.createErrorResponse(
            ERROR_TYPES.NOT_PLAYER_TURN,
            'あなたの手番ではありません'
          ));
          return;
        }

        if (player.getHandSize() !== 5) {
          socket.emit('actionError', ErrorHandler.createErrorResponse(
            ERROR_TYPES.INVALID_MOVE,
            '手牌が5枚ではありません'
          ));
          return;
        }

        // 完成形判定
        const HandEvaluator = require('./src/models/HandEvaluator');
        if (!HandEvaluator.checkWinningHand(player.hand)) {
          socket.emit('actionError', ErrorHandler.createErrorResponse(
            ERROR_TYPES.INVALID_MOVE,
            '完成形ではありません'
          ));
          return;
        }

        // ツモ上がり成功
        game.endGame(playerId);
        winResult = {
          result: 'tsumo',
          winner: {
            id: player.id,
            name: player.name
          },
          winningTile: player.lastDrawnTile,
          winningHand: [...player.hand], // 上がり形の手牌を保存
          message: 'ツモ！'
        };

      } else if (type === 'ron') {
        // ロン上がりの処理（要件4.2）
        const isPlayerTurn = game.isPlayerTurn(playerId);
        if (isPlayerTurn) {
          socket.emit('actionError', ErrorHandler.createErrorResponse(
            ERROR_TYPES.INVALID_MOVE,
            '自分の手番中はロンできません'
          ));
          return;
        }

        if (player.getHandSize() !== 4) {
          socket.emit('actionError', ErrorHandler.createErrorResponse(
            ERROR_TYPES.INVALID_MOVE,
            '手牌が4枚ではありません'
          ));
          return;
        }

        // 相手の最後の捨て牌を取得
        const opponent = game.getOpponentPlayer(playerId);
        if (!opponent || opponent.discardedTiles.length === 0) {
          socket.emit('actionError', ErrorHandler.createErrorResponse(
            ERROR_TYPES.INVALID_MOVE,
            '相手の捨て牌がありません'
          ));
          return;
        }

        const lastDiscardedTile = opponent.discardedTiles[opponent.discardedTiles.length - 1];
        
        // 待ち牌判定
        const HandEvaluator = require('./src/models/HandEvaluator');
        const waitingTiles = HandEvaluator.checkTenpai(player.hand);
        
        // 捨て牌が待ち牌に含まれているかチェック
        const canRon = waitingTiles.some(waitingTileId => {
          const [suit, value] = waitingTileId.split('_');
          return lastDiscardedTile.suit === suit && 
                 lastDiscardedTile.value.toString() === value;
        });

        if (!canRon) {
          socket.emit('actionError', ErrorHandler.createErrorResponse(
            ERROR_TYPES.INVALID_MOVE,
            'その牌では上がれません'
          ));
          return;
        }

        // ロン上がり成功
        // ロンの場合は相手の捨て牌を手牌に加えて完成形にする
        const completeHand = [...player.hand, lastDiscardedTile];
        
        game.endGame(playerId);
        winResult = {
          result: 'ron',
          winner: {
            id: player.id,
            name: player.name
          },
          winningTile: lastDiscardedTile,
          winningHand: completeHand, // 上がり形の手牌を保存（ロン牌含む）
          message: 'ロン！'
        };

      } else {
        socket.emit('actionError', ErrorHandler.createErrorResponse(
          ERROR_TYPES.INVALID_MOVE,
          '無効な上がり宣言です'
        ));
        return;
      }

      // ゲーム終了通知
      if (winResult) {
        const finalGameState = game.getGameState();
        
        io.to(gameId).emit('gameEnded', {
          ...winResult,
          finalState: finalGameState
        });

        ErrorHandler.log('info', '上がり宣言成功', {
          playerId,
          gameId,
          type,
          winner: winResult.winner.id
        });

        // ゲームをクリーンアップ
        cleanupFinishedGame(gameId);
      }

    } catch (error) {
      ErrorHandler.log('error', '上がり宣言処理でエラー', {
        playerId,
        gameId,
        type,
        error: error.message,
        stack: error.stack
      });

      socket.emit('actionError', ErrorHandler.createErrorResponse(
        ERROR_TYPES.CONNECTION_ERROR,
        '上がり宣言処理でエラーが発生しました'
      ));
    }
  });

  // 新しいゲーム開始要求処理（要件6.4）
  ErrorHandler.wrapSocketHandler(socket, 'requestNewGame', async (data) => {
    const playerId = socket.id;

    // レート制限チェック
    if (!ErrorHandler.checkRateLimit(playerId, 'requestNewGame', 3)) {
      socket.emit('actionError', ErrorHandler.createErrorResponse(
        ERROR_TYPES.RATE_LIMIT_ERROR,
        '新しいゲーム要求が頻繁すぎます'
      ));
      return;
    }

    ErrorHandler.log('info', '新しいゲーム開始要求', { playerId });

    try {
      // 既存のゲームから削除
      removePlayerFromGame(playerId);

      // 新しいゲームに参加
      const playerName = data?.playerName || `プレイヤー${playerId.substr(0, 4)}`;
      const game = tryMatchmaking(playerId, playerName);

      if (game) {
        // マッチング成功 - ゲーム開始
        ErrorHandler.log('info', '新しいゲームが開始されました', { gameId: game.gameId });

        // 両プレイヤーをSocketルームに参加
        game.players.forEach(player => {
          const playerSocket = io.sockets.sockets.get(player.id);
          if (playerSocket) {
            playerSocket.join(game.gameId);
          }
        });

        // ゲーム開始通知
        io.to(game.gameId).emit('gameStarted', {
          gameId: game.gameId,
          message: '新しいゲームが開始されました！'
        });

        // ゲーム状態を同期
        syncGameState(game);
      } else {
        // 待機中
        socket.emit('waitingForPlayer', {
          message: '相手プレイヤーを待っています...'
        });
      }
    } catch (error) {
      ErrorHandler.log('error', '新しいゲーム開始処理でエラー', {
        playerId,
        error: error.message,
        stack: error.stack
      });

      socket.emit('actionError', ErrorHandler.createErrorResponse(
        ERROR_TYPES.CONNECTION_ERROR,
        '新しいゲームの開始に失敗しました'
      ));
    }
  });

  // ロン待機状態の管理
  ErrorHandler.wrapSocketHandler(socket, 'ronWaiting', async (data) => {
    const playerId = socket.id;
    const { gameId } = data;

    ErrorHandler.log('info', 'ロン待機状態開始', { playerId, gameId });

    try {
      const game = gameEngine.getGame(gameId);
      if (!game) {
        socket.emit('actionError', ErrorHandler.createErrorResponse(
          ERROR_TYPES.GAME_NOT_FOUND,
          'ゲームが見つかりません'
        ));
        return;
      }

      // プレイヤーがゲームに参加しているかチェック
      const player = game.getPlayer(playerId);
      if (!player) {
        socket.emit('actionError', ErrorHandler.createErrorResponse(
          ERROR_TYPES.PLAYER_NOT_FOUND,
          'プレイヤーが見つかりません'
        ));
        return;
      }

      // ロン待機状態を設定
      player.ronWaiting = true;
      player.ronWaitingStartTime = Date.now();

      ErrorHandler.log('debug', 'ロン待機状態設定完了', { 
        playerId, 
        gameId,
        isRiichi: player.isRiichi 
      });

      // 10秒後に自動的にロン待機をキャンセル
      setTimeout(() => {
        if (player.ronWaiting) {
          player.ronWaiting = false;
          player.ronWaitingStartTime = null;
          ErrorHandler.log('info', 'ロン待機状態タイムアウト', { playerId, gameId });
          
          // 0.5秒後に自動牌引きを実行
          setTimeout(() => {
            if (game && game.isPlayerTurn(playerId)) {
              const result = gameEngine.autoDrawTile(gameId, playerId);
              if (result.success) {
                syncGameState(game);
                socket.emit('autoTileDraw', {
                  playerId: playerId,
                  drawnTile: result.tile,
                  message: '自動的に牌を引きました'
                });
              }
            }
          }, 500);
        }
      }, 10000);

    } catch (error) {
      ErrorHandler.log('error', 'ロン待機処理でエラー', {
        playerId,
        gameId,
        error: error.message,
        stack: error.stack
      });

      socket.emit('actionError', ErrorHandler.createErrorResponse(
        ERROR_TYPES.CONNECTION_ERROR,
        'ロン待機処理でエラーが発生しました'
      ));
    }
  });

  // 自動牌引き要求の処理
  ErrorHandler.wrapSocketHandler(socket, 'requestAutoDraw', async (data) => {
    const playerId = socket.id;
    const { gameId } = data;

    ErrorHandler.log('info', '自動牌引き要求を受信', { playerId, gameId });

    try {
      const game = gameEngine.getGame(gameId);
      if (!game) {
        socket.emit('actionError', ErrorHandler.createErrorResponse(
          ERROR_TYPES.GAME_NOT_FOUND,
          'ゲームが見つかりません'
        ));
        return;
      }

      const player = game.getPlayer(playerId);
      if (!player) {
        socket.emit('actionError', ErrorHandler.createErrorResponse(
          ERROR_TYPES.PLAYER_NOT_FOUND,
          'プレイヤーが見つかりません'
        ));
        return;
      }

      // ロン待機中でないことを確認
      if (player.ronWaiting) {
        ErrorHandler.log('debug', '自動牌引き拒否 - ロン待機中', { playerId, gameId });
        return;
      }

      // 自動牌引きを実行
      const result = gameEngine.autoDrawTile(gameId, playerId);
      if (result.success) {
        syncGameState(game);
        socket.emit('autoTileDraw', {
          playerId: playerId,
          drawnTile: result.tile,
          message: '自動的に牌を引きました'
        });

        // ゲーム終了の処理
        if (result.gameEnded) {
          handleGameEnd(game, result);
        }
      }

    } catch (error) {
      ErrorHandler.log('error', '自動牌引き要求処理でエラー', {
        playerId,
        gameId,
        error: error.message,
        stack: error.stack
      });

      socket.emit('actionError', ErrorHandler.createErrorResponse(
        ERROR_TYPES.CONNECTION_ERROR,
        '自動牌引き要求処理でエラーが発生しました'
      ));
    }
  });

  // ロン待機状態のキャンセル
  ErrorHandler.wrapSocketHandler(socket, 'cancelRonWaiting', async (data) => {
    const playerId = socket.id;

    ErrorHandler.log('info', 'ロン待機状態キャンセル', { playerId });

    try {
      // プレイヤーが参加しているゲームを検索
      const gameId = playerGameMap.get(playerId);
      if (!gameId) {
        return; // ゲームに参加していない場合は何もしない
      }

      const game = gameEngine.getGame(gameId);
      if (!game) {
        return; // ゲームが存在しない場合は何もしない
      }

      const player = game.getPlayer(playerId);
      if (player) {
        player.ronWaiting = false;
        player.ronWaitingStartTime = null;
        ErrorHandler.log('debug', 'ロン待機状態キャンセル完了', { playerId, gameId });
        
        // 0.5秒後に自動牌引きを実行（手番の場合のみ）
        setTimeout(() => {
          if (game && game.isPlayerTurn(playerId)) {
            const result = gameEngine.autoDrawTile(gameId, playerId);
            if (result.success) {
              syncGameState(game);
              socket.emit('autoTileDraw', {
                playerId: playerId,
                drawnTile: result.tile,
                message: '自動的に牌を引きました'
              });
            }
          }
        }, 500);
      }

    } catch (error) {
      ErrorHandler.log('error', 'ロン待機キャンセル処理でエラー', {
        playerId,
        error: error.message,
        stack: error.stack
      });
    }
  });

  // プレイヤー切断処理
  socket.on('disconnect', () => {
    const playerId = socket.id;
    ErrorHandler.log('info', 'プレイヤーが切断しました', { playerId });

    try {
      // タイマーをクリア
      clearTurnTimer(playerId);

      // ゲームから削除
      removePlayerFromGame(playerId);
    } catch (error) {
      ErrorHandler.log('error', 'プレイヤー切断処理でエラー', { playerId, error: error.message });
    }
  });

  // ========== 判定API エンドポイント ==========
  
  // 自動引き判定API
  ErrorHandler.wrapSocketHandler(socket, 'queryAutoDraw', async (data) => {
    const result = await JudgmentErrorHandler.wrapJudgment(
      async () => {
        const { playerId, gameId } = data || {};
        
        // パラメータ検証
        JudgmentErrorHandler.validateJudgmentParams(data, ['playerId', 'gameId']);
        
        const game = gameEngine.getGame(gameId);
        if (!game) {
          throw new Error('ゲームが見つかりません');
        }
        
        // ゲーム状態の整合性チェック
        const integrity = StateValidator.validateGameStateIntegrity(game);
        if (!integrity.valid) {
          console.warn('ゲーム状態の整合性に問題があります:', integrity.issues);
        }
        
        return judgmentEngine.canAutoDraw(playerId, game);
      },
      'canAutoDraw',
      data?.playerId
    );
    
    socket.emit('autoDrawResult', {
      playerId: data?.playerId,
      queryId: data?.queryId,
      ...result
    });
  });

  // 自摸判定API
  ErrorHandler.wrapSocketHandler(socket, 'queryTsumo', async (data) => {
    const result = await JudgmentErrorHandler.wrapJudgment(
      async () => {
        const { playerId, gameId, drawnTile } = data || {};
        
        // パラメータ検証
        JudgmentErrorHandler.validateJudgmentParams(data, ['playerId', 'gameId', 'drawnTile']);
        
        const game = gameEngine.getGame(gameId);
        if (!game) {
          throw new Error('ゲームが見つかりません');
        }
        
        return judgmentEngine.checkTsumo(playerId, drawnTile, game);
      },
      'checkTsumo',
      data?.playerId
    );
    
    socket.emit('tsumoResult', {
      playerId: data?.playerId,
      queryId: data?.queryId,
      ...result
    });
  });

  // ロン判定API
  ErrorHandler.wrapSocketHandler(socket, 'queryRon', async (data) => {
    const result = await JudgmentErrorHandler.wrapJudgment(
      async () => {
        const { playerId, gameId, discardedTile } = data || {};
        
        // パラメータ検証
        JudgmentErrorHandler.validateJudgmentParams(data, ['playerId', 'gameId', 'discardedTile']);
        
        const game = gameEngine.getGame(gameId);
        if (!game) {
          throw new Error('ゲームが見つかりません');
        }
        
        return judgmentEngine.checkRon(playerId, discardedTile, game);
      },
      'checkRon',
      data?.playerId
    );
    
    socket.emit('ronResult', {
      playerId: data?.playerId,
      queryId: data?.queryId,
      ...result
    });
  });

  // リーチ判定API
  ErrorHandler.wrapSocketHandler(socket, 'queryRiichi', async (data) => {
    const result = await JudgmentErrorHandler.wrapJudgment(
      async () => {
        const { playerId, gameId, discardTile } = data || {};
        
        // パラメータ検証
        JudgmentErrorHandler.validateJudgmentParams(data, ['playerId', 'gameId', 'discardTile']);
        
        const game = gameEngine.getGame(gameId);
        if (!game) {
          throw new Error('ゲームが見つかりません');
        }
        
        return judgmentEngine.checkRiichi(playerId, discardTile, game);
      },
      'checkRiichi',
      data?.playerId
    );
    
    socket.emit('riichiResult', {
      playerId: data?.playerId,
      queryId: data?.queryId,
      ...result
    });
  });

  // 接続エラーハンドリング
  socket.on('error', (error) => {
    ErrorHandler.log('error', 'Socket接続エラー', {
      playerId: socket.id,
      error: error.message
    });
  });
});

// 定期的なクリーンアップ処理
const cleanupInterval = setInterval(() => {
  try {
    gameEngine.cleanupInactiveGames();
    ErrorHandler.log('info', '非アクティブゲームのクリーンアップ実行', {
      activeGames: gameEngine.getActiveGameCount()
    });
  } catch (error) {
    ErrorHandler.log('error', 'クリーンアップ処理でエラー', { error: error.message });
  }
}, 5 * 60 * 1000); // 5分ごと

// グローバルエラーハンドリング
process.on('uncaughtException', (error) => {
  ErrorHandler.log('error', 'キャッチされていない例外', {
    error: error.message,
    stack: error.stack,
    pid: process.pid
  });

  // 重大なエラーの場合はプロセスを終了
  console.error('重大なエラーが発生しました。プロセスを終了します。');
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  ErrorHandler.log('error', 'ハンドルされていないPromise拒否', {
    reason: reason?.toString() || 'unknown',
    promise: promise?.toString() || 'unknown',
    pid: process.pid
  });
});

// プロセス終了時のクリーンアップ
let isShuttingDown = false;

function gracefulShutdown(signal) {
  if (isShuttingDown) {
    console.log('既にシャットダウン処理中です...');
    return;
  }

  isShuttingDown = true;
  console.log(`${signal}を受信しました。サーバーを終了します...`);
  ErrorHandler.log('info', `${signal}を受信しました。サーバーを終了します。`);

  // クリーンアップ処理のintervalを停止
  clearInterval(cleanupInterval);

  // タイムアウトを設定（5秒後に強制終了）
  const forceExitTimeout = setTimeout(() => {
    console.error('強制終了します');
    process.exit(1);
  }, 5000);

  // サーバーを閉じる
  server.close((err) => {
    clearTimeout(forceExitTimeout);

    if (err) {
      console.error('サーバー終了時にエラーが発生しました:', err);
      ErrorHandler.log('error', 'サーバー終了時にエラー', { error: err.message });
      process.exit(1);
    } else {
      console.log('サーバーが正常に終了しました。');
      ErrorHandler.log('info', 'サーバーが正常に終了しました。');
      process.exit(0);
    }
  });

  // 新しい接続を拒否
  server.closeAllConnections?.();
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

server.listen(PORT, () => {
  ErrorHandler.log('info', 'サーバーが起動しました', { port: PORT });
  console.log(`サーバーがポート${PORT}で起動しました`);
  console.log(`http://localhost:${PORT} でアクセスできます`);
});

module.exports = { app, server, io };
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

// モデルクラスをインポート
const Game = require('./src/models/Game');
const Player = require('./src/models/Player');
const GameEngine = require('./src/models/GameEngine');
const { ErrorHandler, ERROR_TYPES } = require('./src/utils/ErrorHandler');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = process.env.PORT || 3000;

// ゲームエンジンのインスタンス
const gameEngine = new GameEngine();

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
 * ゲーム状態を全プレイヤーに同期
 * @param {Game} game - 同期するゲーム
 */
function syncGameState(game) {
  game.players.forEach(player => {
    const gameStateForPlayer = game.getGameStateForPlayer(player.id);
    io.to(player.id).emit('gameStateUpdate', gameStateForPlayer);
  });
  
  // 手番タイマーを設定
  setTurnTimer(game);
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

  // 牌を引く処理（要件2.1）
  ErrorHandler.wrapSocketHandler(socket, 'drawTile', async (data) => {
    const playerId = socket.id;

    // レート制限チェック
    if (!ErrorHandler.checkRateLimit(playerId, 'drawTile', 30)) {
      socket.emit('actionError', ErrorHandler.createErrorResponse(
        ERROR_TYPES.RATE_LIMIT_ERROR,
        '牌を引く操作が頻繁すぎます'
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

    ErrorHandler.log('info', '牌を引く処理', { playerId, gameId });

    try {
      // タイムアウト付きで牌を引く処理を実行
      const result = await ErrorHandler.withTimeout(async () => {
        return gameEngine.drawTile(gameId, playerId);
      }, 5000);

      if (result.success) {
        // タイマーをクリア
        clearTurnTimer(playerId);
        
        // ゲーム状態を同期
        syncGameState(game);

        // 特別な結果の処理
        if (result.gameEnded) {
          if (result.result === 'draw') {
            ErrorHandler.log('info', '流局', { gameId });
            
            // ゲーム終了処理
            const finalGameState = game.getGameState();
            io.to(gameId).emit('gameEnded', {
              result: 'draw',
              message: result.message,
              finalState: finalGameState
            });
            
            // ゲームをクリーンアップ
            cleanupFinishedGame(gameId);
          } else if (result.result === 'tsumo') {
            ErrorHandler.log('info', 'ツモ上がり', { gameId, winner: result.winner });
            
            // 勝者情報を取得
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
            
            // ゲームをクリーンアップ
            cleanupFinishedGame(gameId);
          }
        } else if (result.autoDiscarded) {
          // リーチ中の自動捨て牌
          io.to(gameId).emit('autoDiscard', {
            playerId: playerId,
            discardedTile: result.autoDiscarded,
            message: result.message
          });
        }
      } else {
        ErrorHandler.log('warn', '牌を引く処理失敗', { 
          playerId, 
          gameId,
          error: result.error,
          gameState: game ? game.gameState : 'unknown'
        });
        socket.emit('actionError', ErrorHandler.createDetailedErrorResponse(
          ERROR_TYPES.INVALID_MOVE,
          result.error,
          { action: 'drawTile', gameId }
        ));
      }
    } catch (error) {
      ErrorHandler.log('error', '牌を引く処理でエラー', { 
        playerId, 
        gameId,
        error: error.message,
        stack: error.stack 
      });
      
      if (error.message.includes('タイムアウト')) {
        socket.emit('actionError', ErrorHandler.createErrorResponse(
          ERROR_TYPES.TIMEOUT_ERROR,
          '牌を引く処理がタイムアウトしました'
        ));
      } else {
        socket.emit('actionError', ErrorHandler.createErrorResponse(
          ERROR_TYPES.CONNECTION_ERROR,
          '牌を引く処理でエラーが発生しました'
        ));
      }
    }
  });

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
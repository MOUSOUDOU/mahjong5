const Game = require('./Game');
const HandEvaluator = require('./HandEvaluator');
const { ErrorHandler, ERROR_TYPES } = require('../utils/ErrorHandler');

/**
 * ゲームエンジンクラス - ゲームのロジックとルールを管理
 */
class GameEngine {
  constructor() {
    this.games = new Map(); // ゲームIDをキーとするゲーム管理
  }

  /**
   * 新しいゲームを作成
   * @returns {Game} 作成されたゲーム
   */
  createGame() {
    const game = new Game();
    this.games.set(game.gameId, game);
    return game;
  }

  /**
   * ゲームを取得
   * @param {string} gameId - ゲームID
   * @returns {Game|null} ゲーム
   */
  getGame(gameId) {
    return this.games.get(gameId) || null;
  }

  /**
   * ゲームを削除
   * @param {string} gameId - ゲームID
   * @returns {boolean} 削除に成功したかどうか
   */
  removeGame(gameId) {
    return this.games.delete(gameId);
  }

  /**
   * プレイヤーが牌を引く処理
   * 要件2.1に対応：プレイヤーの手番時に山から1枚牌を引く
   * @param {string} gameId - ゲームID
   * @param {string} playerId - プレイヤーID
   * @returns {Object} 処理結果
   */
  drawTile(gameId, playerId) {
    try {
      // 入力検証
      if (!gameId || typeof gameId !== 'string') {
        ErrorHandler.log('warn', '無効なゲームID', { gameId, playerId });
        return { success: false, error: '無効なゲームIDです' };
      }

      if (!playerId || typeof playerId !== 'string') {
        ErrorHandler.log('warn', '無効なプレイヤーID', { gameId, playerId });
        return { success: false, error: '無効なプレイヤーIDです' };
      }

      const game = this.getGame(gameId);
      if (!game) {
        ErrorHandler.log('warn', 'ゲームが見つからない', { gameId, playerId });
        return { success: false, error: 'ゲームが見つかりません' };
      }

      if (!game.isPlayable()) {
        ErrorHandler.log('warn', 'ゲームがプレイ不可能', { 
          gameId, 
          playerId, 
          gameState: game.gameState 
        });
        return { success: false, error: 'ゲームがプレイ可能な状態ではありません' };
      }

      if (!game.isPlayerTurn(playerId)) {
        ErrorHandler.log('warn', 'プレイヤーの手番ではない', { 
          gameId, 
          playerId, 
          currentPlayer: game.getCurrentPlayerId() 
        });
        return { success: false, error: 'あなたの手番ではありません' };
      }

      const player = game.getPlayer(playerId);
      if (!player) {
        ErrorHandler.log('warn', 'プレイヤーが見つからない', { gameId, playerId });
        return { success: false, error: 'プレイヤーが見つかりません' };
      }

      if (player.isHandFull()) {
        ErrorHandler.log('warn', '手牌が満杯', { 
          gameId, 
          playerId, 
          handSize: player.getHandSize() 
        });
        return { success: false, error: '手牌が満杯です' };
      }

      if (game.isDeckEmpty()) {
        // 流局処理（要件6.1）
        ErrorHandler.log('info', '流局処理 - 山が空', { gameId });
        game.declareDraw();
        return { 
          success: true, 
          tile: null, 
          gameEnded: true, 
          result: 'draw',
          message: '山が空になりました。流局です。' 
        };
      }

      const drawnTile = game.deck.drawTile();
      if (!drawnTile) {
        ErrorHandler.log('error', '牌を引けない', { gameId, playerId });
        return { success: false, error: '牌を引けませんでした' };
      }

      player.addTileToHand(drawnTile);

      // リーチ状態の場合、自動的に引いた牌を捨てる（要件3.3）
      if (player.isRiichi) {
        ErrorHandler.log('info', 'リーチ中の自動捨て牌', { gameId, playerId, tileId: drawnTile.id });
        return this.autoDiscardForRiichi(game, player, drawnTile);
      }

      // ツモ上がりの判定（要件4.1）
      if (player.isRiichi && HandEvaluator.checkWinningHand(player.hand)) {
        ErrorHandler.log('info', 'ツモ上がり', { gameId, playerId });
        game.endGame(playerId);
        return {
          success: true,
          tile: drawnTile,
          gameEnded: true,
          result: 'tsumo',
          winner: playerId,
          message: 'ツモ！'
        };
      }

      ErrorHandler.log('debug', '牌を引く処理成功', { 
        gameId, 
        playerId, 
        tileId: drawnTile.id,
        handSize: player.getHandSize()
      });

      return {
        success: true,
        tile: drawnTile,
        gameEnded: false
      };

    } catch (error) {
      ErrorHandler.log('error', '牌を引く処理でエラー', { 
        gameId, 
        playerId, 
        error: error.message,
        stack: error.stack 
      });
      return { success: false, error: 'システムエラーが発生しました' };
    }
  }

  /**
   * リーチ状態での自動捨て牌処理
   * @param {Game} game - ゲーム
   * @param {Player} player - プレイヤー
   * @param {Tile} drawnTile - 引いた牌
   * @returns {Object} 処理結果
   */
  autoDiscardForRiichi(game, player, drawnTile) {
    // リーチ状態では引いた牌を自動的に捨てる
    const discardedTile = player.removeTileFromHand(drawnTile.id);
    if (discardedTile) {
      player.discardTile(discardedTile);
    }

    // 手番を次のプレイヤーに移す
    game.nextTurn();

    return {
      success: true,
      tile: drawnTile,
      autoDiscarded: discardedTile,
      gameEnded: false,
      message: 'リーチ中のため自動的に捨てました'
    };
  }

  /**
   * プレイヤーが牌を捨てる処理
   * 要件2.2, 2.3に対応：5枚から1枚を捨て、捨て牌として表示
   * @param {string} gameId - ゲームID
   * @param {string} playerId - プレイヤーID
   * @param {string} tileId - 捨てる牌のID
   * @returns {Object} 処理結果
   */
  discardTile(gameId, playerId, tileId) {
    try {
      // 入力検証
      if (!gameId || typeof gameId !== 'string') {
        ErrorHandler.log('warn', '無効なゲームID', { gameId, playerId, tileId });
        return { success: false, error: '無効なゲームIDです' };
      }

      if (!playerId || typeof playerId !== 'string') {
        ErrorHandler.log('warn', '無効なプレイヤーID', { gameId, playerId, tileId });
        return { success: false, error: '無効なプレイヤーIDです' };
      }

      if (!tileId || typeof tileId !== 'string') {
        ErrorHandler.log('warn', '無効な牌ID', { gameId, playerId, tileId });
        return { success: false, error: '無効な牌IDです' };
      }

      const game = this.getGame(gameId);
      if (!game) {
        ErrorHandler.log('warn', 'ゲームが見つからない', { gameId, playerId, tileId });
        return { success: false, error: 'ゲームが見つかりません' };
      }

      if (!game.isPlayable()) {
        ErrorHandler.log('warn', 'ゲームがプレイ不可能', { 
          gameId, 
          playerId, 
          tileId,
          gameState: game.gameState 
        });
        return { success: false, error: 'ゲームがプレイ可能な状態ではありません' };
      }

      if (!game.isPlayerTurn(playerId)) {
        ErrorHandler.log('warn', 'プレイヤーの手番ではない', { 
          gameId, 
          playerId, 
          tileId,
          currentPlayer: game.getCurrentPlayerId() 
        });
        return { success: false, error: 'あなたの手番ではありません' };
      }

      const player = game.getPlayer(playerId);
      if (!player) {
        ErrorHandler.log('warn', 'プレイヤーが見つからない', { gameId, playerId, tileId });
        return { success: false, error: 'プレイヤーが見つかりません' };
      }

      if (player.getHandSize() !== 5) {
        ErrorHandler.log('warn', '手牌が5枚ではない', { 
          gameId, 
          playerId, 
          tileId,
          handSize: player.getHandSize() 
        });
        return { success: false, error: '手牌が5枚ではありません' };
      }

      if (player.isRiichi) {
        ErrorHandler.log('warn', 'リーチ中の手動捨て牌試行', { gameId, playerId, tileId });
        return { success: false, error: 'リーチ中は牌を選んで捨てることはできません' };
      }

      if (!player.hasTileInHand(tileId)) {
        ErrorHandler.log('warn', '指定牌が手牌にない', { 
          gameId, 
          playerId, 
          tileId,
          hand: player.hand.map(t => t.id) 
        });
        return { success: false, error: '指定された牌が手牌にありません' };
      }

      const discardedTile = player.discardTileFromHand(tileId);
      if (!discardedTile) {
        ErrorHandler.log('error', '牌を捨てることができない', { gameId, playerId, tileId });
        return { success: false, error: '牌を捨てることができませんでした' };
      }

      // ロン判定（相手プレイヤーがリーチしている場合）
      const opponent = game.getOpponentPlayer(playerId);
      if (opponent && opponent.isRiichi) {
        const ronResult = this.checkRon(game, opponent, discardedTile);
        if (ronResult.canRon) {
          ErrorHandler.log('info', 'ロン上がり', { 
            gameId, 
            winner: opponent.id, 
            discardedBy: playerId,
            winningTile: discardedTile.id 
          });
          game.endGame(opponent.id);
          return {
            success: true,
            discardedTile: discardedTile,
            gameEnded: true,
            result: 'ron',
            winner: opponent.id,
            message: 'ロン！'
          };
        }
      }

      // 手番を次のプレイヤーに移す（要件2.4）
      game.nextTurn();

      ErrorHandler.log('debug', '牌を捨てる処理成功', { 
        gameId, 
        playerId, 
        tileId: discardedTile.id,
        handSize: player.getHandSize()
      });

      return {
        success: true,
        discardedTile: discardedTile,
        gameEnded: false
      };

    } catch (error) {
      ErrorHandler.log('error', '牌を捨てる処理でエラー', { 
        gameId, 
        playerId, 
        tileId,
        error: error.message,
        stack: error.stack 
      });
      return { success: false, error: 'システムエラーが発生しました' };
    }
  }

  /**
   * リーチ宣言処理
   * 要件3.1, 3.2に対応：テンパイ状態でのリーチ宣言とリーチ状態のマーク
   * @param {string} gameId - ゲームID
   * @param {string} playerId - プレイヤーID
   * @returns {Object} 処理結果
   */
  declareRiichi(gameId, playerId) {
    try {
      // 入力検証
      if (!gameId || typeof gameId !== 'string') {
        ErrorHandler.log('warn', '無効なゲームID', { gameId, playerId });
        return { success: false, error: '無効なゲームIDです' };
      }

      if (!playerId || typeof playerId !== 'string') {
        ErrorHandler.log('warn', '無効なプレイヤーID', { gameId, playerId });
        return { success: false, error: '無効なプレイヤーIDです' };
      }

      const game = this.getGame(gameId);
      if (!game) {
        ErrorHandler.log('warn', 'ゲームが見つからない', { gameId, playerId });
        return { success: false, error: 'ゲームが見つかりません' };
      }

      if (!game.isPlayable()) {
        ErrorHandler.log('warn', 'ゲームがプレイ不可能', { 
          gameId, 
          playerId, 
          gameState: game.gameState 
        });
        return { success: false, error: 'ゲームがプレイ可能な状態ではありません' };
      }

      if (!game.isPlayerTurn(playerId)) {
        ErrorHandler.log('warn', 'プレイヤーの手番ではない', { 
          gameId, 
          playerId, 
          currentPlayer: game.getCurrentPlayerId() 
        });
        return { success: false, error: 'あなたの手番ではありません' };
      }

      const player = game.getPlayer(playerId);
      if (!player) {
        ErrorHandler.log('warn', 'プレイヤーが見つからない', { gameId, playerId });
        return { success: false, error: 'プレイヤーが見つかりません' };
      }

      if (player.isRiichi) {
        ErrorHandler.log('warn', '既にリーチ宣言済み', { gameId, playerId });
        return { success: false, error: '既にリーチを宣言しています' };
      }

      if (player.getHandSize() !== 4) {
        ErrorHandler.log('warn', '手牌が4枚ではない', { 
          gameId, 
          playerId, 
          handSize: player.getHandSize() 
        });
        return { success: false, error: 'リーチは手牌が4枚の時のみ宣言できます' };
      }

      // テンパイ判定（要件3.1）
      const waitingTiles = HandEvaluator.checkTenpai(player.hand);
      if (waitingTiles.length === 0) {
        ErrorHandler.log('warn', 'テンパイしていない', { 
          gameId, 
          playerId,
          hand: player.hand.map(t => t.id) 
        });
        return { success: false, error: 'テンパイしていないためリーチできません' };
      }

      // リーチ宣言（要件3.2）
      player.declareRiichi();

      ErrorHandler.log('info', 'リーチ宣言成功', { 
        gameId, 
        playerId,
        waitingTiles: waitingTiles 
      });

      return {
        success: true,
        waitingTiles: waitingTiles,
        message: 'リーチ！'
      };

    } catch (error) {
      ErrorHandler.log('error', 'リーチ宣言処理でエラー', { 
        gameId, 
        playerId, 
        error: error.message,
        stack: error.stack 
      });
      return { success: false, error: 'システムエラーが発生しました' };
    }
  }

  /**
   * ロン判定
   * 要件4.2に対応：リーチ状態のプレイヤーの待ち牌を相手が捨てた時のロン判定
   * @param {Game} game - ゲーム
   * @param {Player} player - リーチしているプレイヤー
   * @param {Tile} discardedTile - 捨てられた牌
   * @returns {Object} ロン判定結果
   */
  checkRon(game, player, discardedTile) {
    if (!player.isRiichi) {
      return { canRon: false, reason: 'リーチしていません' };
    }

    // プレイヤーの待ち牌を取得
    const waitingTiles = HandEvaluator.checkTenpai(player.hand);
    
    // 捨てられた牌が待ち牌に含まれているかチェック
    if (waitingTiles.includes(discardedTile.id)) {
      return { canRon: true };
    }

    return { canRon: false, reason: '待ち牌ではありません' };
  }

  /**
   * プレイヤーのテンパイ状態を確認
   * @param {string} gameId - ゲームID
   * @param {string} playerId - プレイヤーID
   * @returns {Object} テンパイ情報
   */
  checkPlayerTenpai(gameId, playerId) {
    const game = this.getGame(gameId);
    if (!game) {
      return { isTenpai: false, error: 'ゲームが見つかりません' };
    }

    const player = game.getPlayer(playerId);
    if (!player) {
      return { isTenpai: false, error: 'プレイヤーが見つかりません' };
    }

    if (player.getHandSize() !== 4) {
      return { isTenpai: false, waitingTiles: [] };
    }

    const waitingTiles = HandEvaluator.checkTenpai(player.hand);
    const tenpaiDetails = HandEvaluator.getTenpaiDetails(player.hand);

    return {
      isTenpai: waitingTiles.length > 0,
      waitingTiles: waitingTiles,
      waitingTileDetails: tenpaiDetails
    };
  }

  /**
   * ゲームの状態を取得
   * @param {string} gameId - ゲームID
   * @param {string} playerId - プレイヤーID（省略可）
   * @returns {Object|null} ゲーム状態
   */
  getGameState(gameId, playerId = null) {
    const game = this.getGame(gameId);
    if (!game) {
      return null;
    }

    if (playerId) {
      return game.getGameStateForPlayer(playerId);
    } else {
      return game.getGameState();
    }
  }

  /**
   * 全てのアクティブなゲーム数を取得
   * @returns {number} アクティブなゲーム数
   */
  getActiveGameCount() {
    return this.games.size;
  }

  /**
   * 非アクティブなゲームを削除
   */
  cleanupInactiveGames() {
    const now = Date.now();
    for (const [gameId, game] of this.games) {
      if (game.isFinished() || game.players.length === 0) {
        this.games.delete(gameId);
      } else if (game.lastActivity && (now - game.lastActivity) > 10 * 60 * 1000) {
        // 10分間非アクティブなゲームを削除
        ErrorHandler.log('info', '非アクティブゲームを削除', { gameId });
        this.games.delete(gameId);
      }
    }
  }

  /**
   * プレイヤーの再接続処理
   * @param {string} gameId - ゲームID
   * @param {string} playerId - プレイヤーID
   * @returns {Object} 再接続結果
   */
  handlePlayerReconnection(gameId, playerId) {
    const game = this.getGame(gameId);
    if (!game) {
      return { success: false, error: 'ゲームが見つかりません' };
    }

    const player = game.getPlayer(playerId);
    if (!player) {
      return { success: false, error: 'プレイヤーが見つかりません' };
    }

    // ゲーム状態を更新
    game.updateLastActivity();

    ErrorHandler.log('info', 'プレイヤー再接続', { gameId, playerId });

    return {
      success: true,
      gameState: game.getGameStateForPlayer(playerId),
      message: 'ゲームに再接続しました'
    };
  }

  /**
   * ゲームの整合性チェック
   * @param {string} gameId - ゲームID
   * @returns {Object} チェック結果
   */
  validateGameIntegrity(gameId) {
    const game = this.getGame(gameId);
    if (!game) {
      return { valid: false, error: 'ゲームが見つかりません' };
    }

    const issues = [];

    // プレイヤー数チェック
    if (game.players.length !== 2 && game.gameState === 'playing') {
      issues.push('プレイヤー数が不正です');
    }

    // 手牌数チェック
    game.players.forEach(player => {
      const handSize = player.getHandSize();
      if (handSize < 4 || handSize > 5) {
        issues.push(`プレイヤー${player.id}の手牌数が不正です: ${handSize}`);
      }
    });

    // デッキ整合性チェック
    if (game.deck.getRemainingCount() < 0) {
      issues.push('デッキの牌数が負の値です');
    }

    return {
      valid: issues.length === 0,
      issues: issues
    };
  }
}

module.exports = GameEngine;
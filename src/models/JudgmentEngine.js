const HandEvaluator = require('./HandEvaluator');
const { ErrorHandler, ERROR_TYPES } = require('../utils/ErrorHandler');
const JudgmentErrorHandler = require('../utils/JudgmentErrorHandler');
const StateValidator = require('../utils/StateValidator');

/**
 * 判定エンジンクラス - サーバーサイドでの各種判定を統括管理
 * 要件1.2, 2.2, 3.2, 4.2に対応
 */
class JudgmentEngine {
  constructor() {
    // 判定履歴の保存（デバッグ用）
    this.judgmentHistory = [];
  }

  /**
   * 自動引き判定
   * 要件1.2: 最初の手番では自動引きを許可、直前の捨て牌がロン牌の場合はロン判定を優先
   * @param {string} playerId - プレイヤーID
   * @param {Game} gameState - ゲーム状態
   * @returns {Object} 判定結果
   */
  canAutoDraw(playerId, gameState) {
    try {
      // パラメータ検証
      JudgmentErrorHandler.validateJudgmentParams({ playerId, gameState }, ['playerId', 'gameState']);
      
      // ゲーム状態とプレイヤーの検証
      const { player } = JudgmentErrorHandler.validateGameState(gameState, playerId);
      
      // ゲームフローの検証
      StateValidator.validateGameFlow(gameState, playerId, 'queryAutoDraw');

      // 最初の手番かどうかを判定
      const isFirstTurn = gameState.isFirstTurn(playerId);
      
      if (isFirstTurn) {
        this._addJudgmentHistory('canAutoDraw', playerId, { allowed: true, reason: 'first_turn' });
        return { allowed: true, reason: 'first_turn' };
      }
      
      // 直前の相手の捨て牌がロン牌かどうかを判定
      const lastDiscardedTile = gameState.getLastDiscardedTile();
      if (lastDiscardedTile) {
        const ronResult = this.checkRon(playerId, lastDiscardedTile, gameState);
        
        if (ronResult.possible) {
          this._addJudgmentHistory('canAutoDraw', playerId, { 
            allowed: false, 
            reason: 'ron_available', 
            ronData: ronResult 
          });
          return { 
            allowed: false, 
            reason: 'ron_available', 
            ronData: ronResult 
          };
        }
      }
      
      // 通常の手番では自動引きを許可
      this._addJudgmentHistory('canAutoDraw', playerId, { allowed: true, reason: 'normal_turn' });
      return { allowed: true, reason: 'normal_turn' };
      
    } catch (error) {
      console.error('自動引き判定エラー:', error);
      return { 
        allowed: false, 
        error: error.message,
        reason: 'error'
      };
    }
  }

  /**
   * 自摸和了判定
   * 要件2.2: プレイヤーの手牌と引いた牌で和了可能かを判定
   * @param {string} playerId - プレイヤーID
   * @param {Object} drawnTile - 引いた牌
   * @param {Game} gameState - ゲーム状態
   * @returns {Object} 判定結果
   */
  checkTsumo(playerId, drawnTile, gameState) {
    try {
      // パラメータ検証
      JudgmentErrorHandler.validateJudgmentParams({ playerId, drawnTile, gameState }, ['playerId', 'drawnTile', 'gameState']);
      JudgmentErrorHandler.validateTileData(drawnTile);
      
      // ゲーム状態とプレイヤーの検証
      const { player } = JudgmentErrorHandler.validateGameState(gameState, playerId);
      
      // ゲームフローの検証
      StateValidator.validateGameFlow(gameState, playerId, 'queryTsumo');

      // 手牌と引いた牌を合わせて和了判定
      const hand = [...player.hand, drawnTile];
      const winResult = this.checkWinning(hand, player.isRiichi);
      
      this._addJudgmentHistory('checkTsumo', playerId, {
        possible: winResult.possible,
        winData: winResult.winData,
        drawnTile: drawnTile.id
      });
      
      return {
        possible: winResult.possible,
        winData: winResult.winData || null
      };
      
    } catch (error) {
      console.error('自摸判定エラー:', error);
      return { 
        possible: false, 
        error: error.message 
      };
    }
  }

  /**
   * ロン判定
   * 要件3.2: 問い合わせプレイヤーの手牌と捨て牌で和了可能かを判定
   * @param {string} playerId - プレイヤーID
   * @param {Object} discardedTile - 捨てられた牌
   * @param {Game} gameState - ゲーム状態
   * @returns {Object} 判定結果
   */
  checkRon(playerId, discardedTile, gameState) {
    try {
      // パラメータ検証
      JudgmentErrorHandler.validateJudgmentParams({ playerId, discardedTile, gameState }, ['playerId', 'discardedTile', 'gameState']);
      JudgmentErrorHandler.validateTileData(discardedTile);
      
      // ゲーム状態とプレイヤーの検証
      const { player } = JudgmentErrorHandler.validateGameState(gameState, playerId);
      
      // ゲームフローの検証
      StateValidator.validateGameFlow(gameState, playerId, 'queryRon');

      // 手牌と捨て牌を合わせて和了判定
      const hand = [...player.hand, discardedTile];
      const winResult = this.checkWinning(hand, player.isRiichi);
      
      this._addJudgmentHistory('checkRon', playerId, {
        possible: winResult.possible,
        winData: winResult.winData,
        discardedTile: discardedTile.id
      });
      
      return {
        possible: winResult.possible,
        winData: winResult.winData || null
      };
      
    } catch (error) {
      console.error('ロン判定エラー:', error);
      return { 
        possible: false, 
        error: error.message 
      };
    }
  }

  /**
   * リーチ宣言判定
   * 要件4.2: 選択した牌を捨てた場合の聴牌状態を判定
   * @param {string} playerId - プレイヤーID
   * @param {Object} discardTile - 捨てる予定の牌
   * @param {Game} gameState - ゲーム状態
   * @returns {Object} 判定結果
   */
  checkRiichi(playerId, discardTile, gameState) {
    try {
      // パラメータ検証
      JudgmentErrorHandler.validateJudgmentParams({ playerId, discardTile, gameState }, ['playerId', 'discardTile', 'gameState']);
      JudgmentErrorHandler.validateTileData(discardTile);
      
      // ゲーム状態とプレイヤーの検証
      const { player } = JudgmentErrorHandler.validateGameState(gameState, playerId);
      
      // ゲームフローの検証
      StateValidator.validateGameFlow(gameState, playerId, 'queryRiichi');

      // 指定した牌を捨てた後の手牌でテンパイ判定
      const handAfterDiscard = player.hand.filter(tile => tile.id !== discardTile.id);
      const waitingTiles = this.checkTenpai(handAfterDiscard);
      
      const isPossible = waitingTiles.length > 0;
      
      this._addJudgmentHistory('checkRiichi', playerId, {
        possible: isPossible,
        waitingTiles: waitingTiles,
        discardTile: discardTile.id
      });
      
      return {
        possible: isPossible,
        waitingTiles: isPossible ? waitingTiles : []
      };
      
    } catch (error) {
      console.error('リーチ判定エラー:', error);
      return { 
        possible: false, 
        error: error.message 
      };
    }
  }

  /**
   * 和了判定の共通ロジック
   * @param {Object[]} hand - 手牌（5枚）
   * @param {boolean} isRiichi - リーチ状態かどうか
   * @returns {Object} 和了判定結果
   */
  checkWinning(hand, isRiichi = false) {
    try {
      if (!hand || hand.length !== 5) {
        return { possible: false };
      }

      const isWinning = HandEvaluator.checkWinningHand(hand);
      
      if (!isWinning) {
        return { possible: false };
      }

      // 和了の場合、役と点数を計算（簡易版）
      const winData = this._calculateWinData(hand, isRiichi);
      
      return {
        possible: true,
        winData: winData
      };
      
    } catch (error) {
      console.error('和了判定エラー:', error);
      return { possible: false, error: error.message };
    }
  }

  /**
   * テンパイ判定の共通ロジック
   * @param {Object[]} hand - 手牌（4枚）
   * @returns {string[]} 待ち牌のIDの配列
   */
  checkTenpai(hand) {
    try {
      if (!hand || hand.length !== 4) {
        return [];
      }

      return HandEvaluator.checkTenpai(hand);
      
    } catch (error) {
      console.error('テンパイ判定エラー:', error);
      return [];
    }
  }

  /**
   * 和了データの計算（簡易版）
   * @param {Object[]} hand - 手牌
   * @param {boolean} isRiichi - リーチ状態かどうか
   * @returns {Object} 和了データ
   */
  _calculateWinData(hand, isRiichi) {
    // 簡易的な役と点数計算
    const yakuList = [];
    let han = 0;
    let fu = 30; // 基本符

    // リーチ
    if (isRiichi) {
      yakuList.push('リーチ');
      han += 1;
    }

    // 最低でも1翻は必要（仮の処理）
    if (han === 0) {
      yakuList.push('門前清自摸和');
      han = 1;
    }

    // 点数計算（簡易版）
    const basePoints = fu * Math.pow(2, han + 2);
    const points = Math.min(basePoints, 8000); // 満貫上限

    return {
      han: han,
      fu: fu,
      yakuList: yakuList,
      points: points
    };
  }

  /**
   * 判定履歴を追加
   * @param {string} type - 判定タイプ
   * @param {string} playerId - プレイヤーID
   * @param {Object} result - 判定結果
   */
  _addJudgmentHistory(type, playerId, result) {
    this.judgmentHistory.push({
      type: type,
      playerId: playerId,
      result: result,
      timestamp: Date.now()
    });

    // 履歴が長くなりすぎないよう制限
    if (this.judgmentHistory.length > 1000) {
      this.judgmentHistory = this.judgmentHistory.slice(-500);
    }
  }

  /**
   * 判定履歴を取得
   * @param {string} playerId - プレイヤーID（省略時は全履歴）
   * @returns {Object[]} 判定履歴
   */
  getJudgmentHistory(playerId = null) {
    if (playerId) {
      return this.judgmentHistory.filter(entry => entry.playerId === playerId);
    }
    return [...this.judgmentHistory];
  }

  /**
   * 判定履歴をクリア
   */
  clearJudgmentHistory() {
    this.judgmentHistory = [];
  }
}

module.exports = JudgmentEngine;
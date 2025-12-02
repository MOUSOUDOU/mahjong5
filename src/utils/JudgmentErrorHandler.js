/**
 * 判定エラーハンドラークラス - サーバーサイドの統一エラーハンドリング
 * 要件5.2, 5.5に対応
 */
class JudgmentErrorHandler {
  /**
   * 判定エラーを処理
   * @param {Error} error - エラーオブジェクト
   * @param {string} judgmentType - 判定タイプ
   * @param {string} playerId - プレイヤーID
   * @returns {Object} エラーレスポンス
   */
  static handleJudgmentError(error, judgmentType, playerId) {
    const errorResponse = {
      success: false,
      error: {
        type: error.name || 'JudgmentError',
        message: error.message,
        judgmentType,
        playerId,
        timestamp: Date.now()
      }
    };
    
    // ログ出力
    console.error(`判定エラー [${judgmentType}] プレイヤー: ${playerId}`, {
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
    
    return errorResponse;
  }

  /**
   * ゲーム状態とプレイヤーの検証
   * @param {Object} gameState - ゲーム状態
   * @param {string} playerId - プレイヤーID
   * @returns {Object} 検証結果
   */
  static validateGameState(gameState, playerId) {
    if (!gameState) {
      throw new Error('ゲーム状態が存在しません');
    }
    
    if (!gameState.getPlayer) {
      throw new Error('ゲーム状態にgetPlayerメソッドがありません');
    }
    
    const player = gameState.getPlayer(playerId);
    if (!player) {
      throw new Error(`プレイヤー ${playerId} が見つかりません`);
    }
    
    return { gameState, player };
  }

  /**
   * 判定パラメータの検証
   * @param {Object} params - パラメータ
   * @param {string[]} requiredFields - 必須フィールド
   * @returns {boolean} 検証結果
   */
  static validateJudgmentParams(params, requiredFields) {
    if (!params || typeof params !== 'object') {
      throw new Error('パラメータが不正です');
    }
    
    for (const field of requiredFields) {
      if (!(field in params) || params[field] === null || params[field] === undefined) {
        throw new Error(`必須パラメータ '${field}' が不足しています`);
      }
    }
    
    return true;
  }

  /**
   * 牌データの検証
   * @param {Object} tile - 牌データ
   * @returns {boolean} 検証結果
   */
  static validateTileData(tile) {
    if (!tile || typeof tile !== 'object') {
      throw new Error('牌データが不正です');
    }
    
    if (!tile.id || typeof tile.id !== 'string') {
      throw new Error('牌IDが不正です');
    }
    
    // 牌IDの形式チェック（簡易版）
    const validTilePattern = /^(bamboo_[1-9]|honor_(white|green|red))$/;
    if (!validTilePattern.test(tile.id)) {
      throw new Error(`無効な牌ID: ${tile.id}`);
    }
    
    return true;
  }

  /**
   * 判定結果の検証
   * @param {Object} result - 判定結果
   * @param {string} judgmentType - 判定タイプ
   * @returns {boolean} 検証結果
   */
  static validateJudgmentResult(result, judgmentType) {
    if (!result || typeof result !== 'object') {
      throw new Error('判定結果が不正です');
    }
    
    switch (judgmentType) {
      case 'canAutoDraw':
        if (typeof result.allowed !== 'boolean') {
          throw new Error('自動引き判定結果にallowedフィールドがありません');
        }
        if (!result.reason || typeof result.reason !== 'string') {
          throw new Error('自動引き判定結果にreasonフィールドがありません');
        }
        break;
        
      case 'checkTsumo':
      case 'checkRon':
        if (typeof result.possible !== 'boolean') {
          throw new Error('和了判定結果にpossibleフィールドがありません');
        }
        break;
        
      case 'checkRiichi':
        if (typeof result.possible !== 'boolean') {
          throw new Error('リーチ判定結果にpossibleフィールドがありません');
        }
        if (result.possible && !Array.isArray(result.waitingTiles)) {
          throw new Error('リーチ判定結果にwaitingTilesフィールドがありません');
        }
        break;
        
      default:
        console.warn(`未知の判定タイプ: ${judgmentType}`);
    }
    
    return true;
  }

  /**
   * エラー統計を記録
   * @param {string} judgmentType - 判定タイプ
   * @param {string} errorType - エラータイプ
   */
  static recordErrorStats(judgmentType, errorType) {
    if (!this.errorStats) {
      this.errorStats = {};
    }
    
    const key = `${judgmentType}_${errorType}`;
    this.errorStats[key] = (this.errorStats[key] || 0) + 1;
    
    // 統計をログ出力（100回ごと）
    const totalErrors = Object.values(this.errorStats).reduce((sum, count) => sum + count, 0);
    if (totalErrors % 100 === 0) {
      console.log('判定エラー統計:', this.errorStats);
    }
  }

  /**
   * エラー統計を取得
   * @returns {Object} エラー統計
   */
  static getErrorStats() {
    return { ...this.errorStats } || {};
  }

  /**
   * エラー統計をリセット
   */
  static resetErrorStats() {
    this.errorStats = {};
  }

  /**
   * 判定処理をラップしてエラーハンドリングを適用
   * @param {Function} judgmentFunction - 判定関数
   * @param {string} judgmentType - 判定タイプ
   * @param {string} playerId - プレイヤーID
   * @param {...any} args - 判定関数の引数
   * @returns {Object} 判定結果またはエラーレスポンス
   */
  static async wrapJudgment(judgmentFunction, judgmentType, playerId, ...args) {
    try {
      const result = await judgmentFunction(...args);
      
      // 結果の検証
      this.validateJudgmentResult(result, judgmentType);
      
      return {
        success: true,
        ...result
      };
      
    } catch (error) {
      // エラー統計を記録
      this.recordErrorStats(judgmentType, error.name || 'UnknownError');
      
      // エラーレスポンスを返す
      return this.handleJudgmentError(error, judgmentType, playerId);
    }
  }

  /**
   * 判定処理のパフォーマンスを測定
   * @param {Function} judgmentFunction - 判定関数
   * @param {string} judgmentType - 判定タイプ
   * @param {...any} args - 判定関数の引数
   * @returns {Object} 判定結果とパフォーマンス情報
   */
  static async measureJudgmentPerformance(judgmentFunction, judgmentType, ...args) {
    const startTime = Date.now();
    
    try {
      const result = await judgmentFunction(...args);
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      // パフォーマンスログ（遅い処理のみ）
      if (duration > 100) {
        console.warn(`判定処理が遅延: ${judgmentType} (${duration}ms)`);
      }
      
      return {
        ...result,
        performance: {
          duration,
          timestamp: startTime
        }
      };
      
    } catch (error) {
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      console.error(`判定処理でエラー: ${judgmentType} (${duration}ms)`, error);
      throw error;
    }
  }
}

module.exports = JudgmentErrorHandler;
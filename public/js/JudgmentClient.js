/**
 * 判定クライアントクラス - サーバーへの判定問い合わせを管理
 * 要件5.3, 5.4に対応
 */
class JudgmentClient {
  constructor(socketManager) {
    this.socketManager = socketManager;
    this.pendingQueries = new Map(); // 保留中の問い合わせ
    this.setupEventListeners();
  }

  /**
   * イベントリスナーを設定
   */
  setupEventListeners() {
    // 自動引き判定結果の受信
    this.socketManager.socket.on('autoDrawResult', (data) => {
      this._handleQueryResult('queryAutoDraw', data);
    });

    // 自摸判定結果の受信
    this.socketManager.socket.on('tsumoResult', (data) => {
      this._handleQueryResult('queryTsumo', data);
    });

    // ロン判定結果の受信
    this.socketManager.socket.on('ronResult', (data) => {
      this._handleQueryResult('queryRon', data);
    });

    // リーチ判定結果の受信
    this.socketManager.socket.on('riichiResult', (data) => {
      this._handleQueryResult('queryRiichi', data);
    });
  }

  /**
   * 自動引き問い合わせ
   * 要件1.1: プレイヤーの手番が開始される時にサーバーに自動引き可否を問い合わせる
   * @param {string} playerId - プレイヤーID
   * @param {string} gameId - ゲームID
   * @returns {Promise<Object>} 判定結果
   */
  async queryAutoDraw(playerId, gameId) {
    return this._makeQuery('queryAutoDraw', {
      playerId,
      gameId
    });
  }

  /**
   * 自摸判定問い合わせ
   * 要件2.1: プレイヤーが牌を引く時にサーバーに自摸和了判定を問い合わせる
   * @param {string} playerId - プレイヤーID
   * @param {string} gameId - ゲームID
   * @param {Object} drawnTile - 引いた牌
   * @returns {Promise<Object>} 判定結果
   */
  async queryTsumo(playerId, gameId, drawnTile) {
    return this._makeQuery('queryTsumo', {
      playerId,
      gameId,
      drawnTile
    });
  }

  /**
   * ロン判定問い合わせ
   * 要件3.1: 相手プレイヤーが牌を捨てる時にサーバーにロン判定を問い合わせる
   * @param {string} playerId - プレイヤーID
   * @param {string} gameId - ゲームID
   * @param {Object} discardedTile - 捨てられた牌
   * @returns {Promise<Object>} 判定結果
   */
  async queryRon(playerId, gameId, discardedTile) {
    return this._makeQuery('queryRon', {
      playerId,
      gameId,
      discardedTile
    });
  }

  /**
   * リーチ判定問い合わせ
   * 要件4.1: プレイヤーが捨て牌を選択する時にサーバーにリーチ宣言判定を問い合わせる
   * @param {string} playerId - プレイヤーID
   * @param {string} gameId - ゲームID
   * @param {Object} discardTile - 捨てる予定の牌
   * @returns {Promise<Object>} 判定結果
   */
  async queryRiichi(playerId, gameId, discardTile) {
    return this._makeQuery('queryRiichi', {
      playerId,
      gameId,
      discardTile
    });
  }

  /**
   * タイムアウト付きの問い合わせ
   * 要件5.4: サーバー応答が遅延する場合のタイムアウト処理
   * @param {Function} queryFunction - 問い合わせ関数
   * @param {number} timeoutMs - タイムアウト時間（ミリ秒）
   * @returns {Promise<Object>} 判定結果
   */
  async queryWithTimeout(queryFunction, timeoutMs = 5000) {
    return Promise.race([
      queryFunction(),
      new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error('判定問い合わせがタイムアウトしました'));
        }, timeoutMs);
      })
    ]);
  }

  /**
   * 安全な問い合わせ（エラーハンドリング付き）
   * @param {string} queryType - 問い合わせタイプ
   * @param {...any} args - 引数
   * @returns {Promise<Object>} 判定結果
   */
  async safeQuery(queryType, ...args) {
    try {
      return await this.queryWithTimeout(() => this[queryType](...args));
    } catch (error) {
      console.error(`判定問い合わせエラー [${queryType}]:`, error);
      
      // フォールバック処理
      return this.getFallbackResult(queryType, error);
    }
  }

  /**
   * フォールバック結果を取得
   * タイムアウトや通信エラー時のフォールバック処理
   * @param {string} queryType - 問い合わせタイプ
   * @param {Error} error - エラー
   * @returns {Object} フォールバック結果
   */
  getFallbackResult(queryType, error) {
    console.warn(`判定問い合わせ失敗、フォールバック処理を実行: ${queryType}`, error.message);
    
    // エラー統計を記録
    this._recordClientError(queryType, error);
    
    switch (queryType) {
      case 'queryAutoDraw':
        // 自動引きはデフォルトで許可（安全側に倒す）
        return { 
          allowed: true, 
          reason: 'fallback_timeout',
          success: false,
          error: error.message,
          fallback: true
        };
      case 'queryTsumo':
      case 'queryRon':
        // 和了判定はデフォルトで不可（誤判定を防ぐ）
        return { 
          possible: false, 
          reason: 'fallback_timeout',
          success: false,
          error: error.message,
          fallback: true
        };
      case 'queryRiichi':
        // リーチ判定はデフォルトで不可（誤判定を防ぐ）
        return { 
          possible: false, 
          waitingTiles: [],
          reason: 'fallback_timeout',
          success: false,
          error: error.message,
          fallback: true
        };
      default:
        return { 
          success: false, 
          error: error.message,
          fallback: true
        };
    }
  }

  /**
   * クライアントサイドエラーを記録
   * @param {string} queryType - 問い合わせタイプ
   * @param {Error} error - エラー
   */
  _recordClientError(queryType, error) {
    if (!this.errorStats) {
      this.errorStats = {};
    }
    
    const key = `${queryType}_${error.name || 'UnknownError'}`;
    this.errorStats[key] = (this.errorStats[key] || 0) + 1;
    
    // エラー統計をローカルストレージに保存（デバッグ用）
    try {
      localStorage.setItem('judgmentClientErrors', JSON.stringify(this.errorStats));
    } catch (e) {
      // ローカルストレージが使用できない場合は無視
    }
  }

  /**
   * エラー統計を取得
   * @returns {Object} エラー統計
   */
  getErrorStats() {
    return { ...this.errorStats } || {};
  }

  /**
   * 接続状態を検証
   * @returns {boolean} 接続状態
   */
  validateConnection() {
    if (!this.socketManager || !this.socketManager.socket) {
      console.error('SocketManagerまたはSocketが存在しません');
      return false;
    }
    
    if (!this.socketManager.socket.connected) {
      console.error('Socketが接続されていません');
      return false;
    }
    
    return true;
  }

  /**
   * 判定問い合わせの前処理
   * @param {string} queryType - 問い合わせタイプ
   * @param {Object} data - 送信データ
   * @returns {boolean} 前処理成功フラグ
   */
  _preProcessQuery(queryType, data) {
    // 接続状態の検証
    if (!this.validateConnection()) {
      throw new Error('サーバーとの接続が確立されていません');
    }
    
    // データの基本検証
    if (!data || typeof data !== 'object') {
      throw new Error('送信データが不正です');
    }
    
    if (!data.playerId || typeof data.playerId !== 'string') {
      throw new Error('プレイヤーIDが不正です');
    }
    
    if (!data.gameId || typeof data.gameId !== 'string') {
      throw new Error('ゲームIDが不正です');
    }
    
    // 問い合わせタイプ固有の検証
    switch (queryType) {
      case 'queryTsumo':
        if (!data.drawnTile || !data.drawnTile.id) {
          throw new Error('引いた牌のデータが不正です');
        }
        break;
        
      case 'queryRon':
        if (!data.discardedTile || !data.discardedTile.id) {
          throw new Error('捨てられた牌のデータが不正です');
        }
        break;
        
      case 'queryRiichi':
        if (!data.discardTile || !data.discardTile.id) {
          throw new Error('捨てる予定の牌のデータが不正です');
        }
        break;
    }
    
    return true;
  }

  /**
   * 問い合わせの共通処理
   * @param {string} eventName - イベント名
   * @param {Object} data - 送信データ
   * @returns {Promise<Object>} 判定結果
   */
  _makeQuery(eventName, data) {
    return new Promise((resolve, reject) => {
      try {
        // 前処理（検証）
        this._preProcessQuery(eventName, data);
        
        const queryId = this._generateQueryId();
        const timeoutId = setTimeout(() => {
          this.pendingQueries.delete(queryId);
          reject(new Error(`判定問い合わせがタイムアウトしました: ${eventName}`));
        }, 5000);

        // 問い合わせを保留リストに追加
        this.pendingQueries.set(queryId, {
          resolve,
          reject,
          timeoutId,
          eventName,
          data,
          timestamp: Date.now()
        });

        // データにクエリIDを追加
        const queryData = {
          ...data,
          queryId
        };

        // サーバーに送信
        const success = this.socketManager.safeEmit(eventName, queryData);
        if (!success) {
          // 送信失敗時のクリーンアップ
          clearTimeout(timeoutId);
          this.pendingQueries.delete(queryId);
          reject(new Error(`サーバーへの送信に失敗しました: ${eventName}`));
        }
        
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * 問い合わせ結果を処理
   * @param {string} queryType - 問い合わせタイプ
   * @param {Object} data - 受信データ
   */
  _handleQueryResult(queryType, data) {
    const queryId = data.queryId;
    
    if (!queryId) {
      // queryIdがない場合は、プレイヤーIDで判定
      const playerId = data.playerId;
      if (playerId) {
        // 該当するプレイヤーIDの最新の問い合わせを解決
        for (const [id, query] of this.pendingQueries.entries()) {
          if (query.data.playerId === playerId && query.eventName === queryType) {
            this._resolveQuery(id, data);
            break;
          }
        }
      }
      return;
    }

    this._resolveQuery(queryId, data);
  }

  /**
   * 問い合わせを解決
   * @param {string} queryId - クエリID
   * @param {Object} data - 結果データ
   */
  _resolveQuery(queryId, data) {
    const query = this.pendingQueries.get(queryId);
    if (!query) {
      return;
    }

    // タイムアウトをクリア
    clearTimeout(query.timeoutId);
    
    // 問い合わせを削除
    this.pendingQueries.delete(queryId);

    // 結果を返す
    if (data.success !== false) {
      query.resolve(data);
    } else {
      query.reject(new Error(data.error || '判定処理でエラーが発生しました'));
    }
  }

  /**
   * クエリIDを生成
   * @returns {string} ユニークなクエリID
   */
  _generateQueryId() {
    return `query_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 保留中の問い合わせをクリーンアップ
   * @param {number} maxAge - 最大保持時間（ミリ秒）
   */
  cleanupPendingQueries(maxAge = 30000) {
    const now = Date.now();
    const expiredQueries = [];

    for (const [queryId, query] of this.pendingQueries.entries()) {
      if (now - query.timestamp > maxAge) {
        expiredQueries.push(queryId);
      }
    }

    expiredQueries.forEach(queryId => {
      const query = this.pendingQueries.get(queryId);
      if (query) {
        clearTimeout(query.timeoutId);
        query.reject(new Error('問い合わせがタイムアウトしました（クリーンアップ）'));
        this.pendingQueries.delete(queryId);
      }
    });

    if (expiredQueries.length > 0) {
      console.log(`期限切れの問い合わせをクリーンアップしました: ${expiredQueries.length}件`);
    }
  }

  /**
   * 統計情報を取得
   * @returns {Object} 統計情報
   */
  getStats() {
    return {
      pendingQueries: this.pendingQueries.size,
      oldestQuery: this.pendingQueries.size > 0 ? 
        Math.min(...Array.from(this.pendingQueries.values()).map(q => q.timestamp)) : null
    };
  }

  /**
   * クリーンアップ処理
   */
  destroy() {
    // 全ての保留中の問い合わせをキャンセル
    for (const [queryId, query] of this.pendingQueries.entries()) {
      clearTimeout(query.timeoutId);
      query.reject(new Error('JudgmentClientが破棄されました'));
    }
    this.pendingQueries.clear();

    // イベントリスナーを削除
    if (this.socketManager && this.socketManager.socket) {
      this.socketManager.socket.off('autoDrawResult');
      this.socketManager.socket.off('tsumoResult');
      this.socketManager.socket.off('ronResult');
      this.socketManager.socket.off('riichiResult');
    }
  }
}

// モジュールとしてエクスポート（ブラウザ環境では無視される）
if (typeof module !== 'undefined' && module.exports) {
  module.exports = JudgmentClient;
}
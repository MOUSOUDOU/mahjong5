/**
 * エラーハンドリングユーティリティ
 * 要件6.3に対応：無効な操作の検証とエラーメッセージの日本語化
 */

/**
 * エラータイプの定義
 */
const ERROR_TYPES = {
  INVALID_MOVE: 'invalid_move',
  GAME_NOT_FOUND: 'game_not_found',
  PLAYER_NOT_FOUND: 'player_not_found',
  NOT_PLAYER_TURN: 'not_player_turn',
  INVALID_TILE: 'invalid_tile',
  RIICHI_REQUIRED: 'riichi_required',
  DECK_EMPTY: 'deck_empty',
  HAND_FULL: 'hand_full',
  INVALID_HAND_SIZE: 'invalid_hand_size',
  NOT_TENPAI: 'not_tenpai',
  ALREADY_RIICHI: 'already_riichi',
  GAME_NOT_PLAYABLE: 'game_not_playable',
  VALIDATION_ERROR: 'validation_error',
  CONNECTION_ERROR: 'connection_error',
  TIMEOUT_ERROR: 'timeout_error',
  RATE_LIMIT_ERROR: 'rate_limit_error',
  GAME_FULL: 'game_full',
  DUPLICATE_ACTION: 'duplicate_action',
  INVALID_GAME_STATE: 'invalid_game_state'
};

/**
 * 日本語エラーメッセージ
 */
const ERROR_MESSAGES = {
  [ERROR_TYPES.INVALID_MOVE]: '無効な操作です',
  [ERROR_TYPES.GAME_NOT_FOUND]: 'ゲームが見つかりません',
  [ERROR_TYPES.PLAYER_NOT_FOUND]: 'プレイヤーが見つかりません',
  [ERROR_TYPES.NOT_PLAYER_TURN]: 'あなたの手番ではありません',
  [ERROR_TYPES.INVALID_TILE]: '無効な牌です',
  [ERROR_TYPES.RIICHI_REQUIRED]: '上がるにはリーチが必要です',
  [ERROR_TYPES.DECK_EMPTY]: '山に牌がありません',
  [ERROR_TYPES.HAND_FULL]: '手牌が満杯です',
  [ERROR_TYPES.INVALID_HAND_SIZE]: '手牌の枚数が正しくありません',
  [ERROR_TYPES.NOT_TENPAI]: 'テンパイしていません',
  [ERROR_TYPES.ALREADY_RIICHI]: '既にリーチを宣言しています',
  [ERROR_TYPES.GAME_NOT_PLAYABLE]: 'ゲームがプレイ可能な状態ではありません',
  [ERROR_TYPES.VALIDATION_ERROR]: '入力データが正しくありません',
  [ERROR_TYPES.CONNECTION_ERROR]: '接続エラーが発生しました',
  [ERROR_TYPES.TIMEOUT_ERROR]: '操作がタイムアウトしました',
  [ERROR_TYPES.RATE_LIMIT_ERROR]: '操作が頻繁すぎます。少し待ってから再試行してください',
  [ERROR_TYPES.GAME_FULL]: 'ゲームが満員です',
  [ERROR_TYPES.DUPLICATE_ACTION]: '同じ操作が既に実行されています',
  [ERROR_TYPES.INVALID_GAME_STATE]: 'ゲームの状態が無効です'
};

/**
 * エラーハンドラークラス
 */
class ErrorHandler {
  /**
   * エラーレスポンスを生成
   * @param {string} errorType - エラータイプ
   * @param {string} customMessage - カスタムメッセージ（省略可）
   * @returns {Object} エラーレスポンス
   */
  static createErrorResponse(errorType, customMessage = null) {
    return {
      success: false,
      error: customMessage || ERROR_MESSAGES[errorType] || '不明なエラーが発生しました',
      errorType: errorType,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * 入力データの検証
   * @param {Object} data - 検証するデータ
   * @param {Object} schema - 検証スキーマ
   * @returns {Object} 検証結果
   */
  static validateInput(data, schema) {
    const errors = [];

    for (const [field, rules] of Object.entries(schema)) {
      const value = data[field];

      // 必須フィールドのチェック
      if (rules.required && (value === undefined || value === null || value === '')) {
        errors.push(`${field}は必須です`);
        continue;
      }

      // 値が存在しない場合はスキップ
      if (value === undefined || value === null) {
        continue;
      }

      // 型チェック
      if (rules.type && typeof value !== rules.type) {
        errors.push(`${field}は${rules.type}型である必要があります`);
        continue;
      }

      // 文字列長チェック
      if (rules.type === 'string') {
        if (rules.minLength && value.length < rules.minLength) {
          errors.push(`${field}は${rules.minLength}文字以上である必要があります`);
        }
        if (rules.maxLength && value.length > rules.maxLength) {
          errors.push(`${field}は${rules.maxLength}文字以下である必要があります`);
        }
      }

      // 数値範囲チェック
      if (rules.type === 'number') {
        if (rules.min !== undefined && value < rules.min) {
          errors.push(`${field}は${rules.min}以上である必要があります`);
        }
        if (rules.max !== undefined && value > rules.max) {
          errors.push(`${field}は${rules.max}以下である必要があります`);
        }
      }

      // カスタムバリデーション
      if (rules.validator && typeof rules.validator === 'function') {
        const customResult = rules.validator(value);
        if (customResult !== true) {
          errors.push(customResult || `${field}の値が無効です`);
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors: errors
    };
  }

  /**
   * Socket.ioエラーハンドリング
   * @param {Object} socket - Socket.ioソケット
   * @param {string} event - イベント名
   * @param {Function} handler - ハンドラー関数
   */
  static wrapSocketHandler(socket, event, handler) {
    socket.on(event, async (data) => {
      try {
        await handler(data);
      } catch (error) {
        console.error(`Socket event ${event} error:`, error);
        socket.emit('actionError', this.createErrorResponse(
          ERROR_TYPES.CONNECTION_ERROR,
          'サーバーエラーが発生しました'
        ));
      }
    });
  }

  /**
   * ゲーム操作の基本検証
   * @param {string} playerId - プレイヤーID
   * @param {Map} playerGameMap - プレイヤーゲームマップ
   * @param {GameEngine} gameEngine - ゲームエンジン
   * @returns {Object} 検証結果
   */
  static validateGameOperation(playerId, playerGameMap, gameEngine) {
    if (!playerId) {
      return this.createErrorResponse(ERROR_TYPES.PLAYER_NOT_FOUND, 'プレイヤーIDが無効です');
    }

    const gameId = playerGameMap.get(playerId);
    if (!gameId) {
      return this.createErrorResponse(ERROR_TYPES.GAME_NOT_FOUND, 'ゲームに参加していません');
    }

    const game = gameEngine.getGame(gameId);
    if (!game) {
      return this.createErrorResponse(ERROR_TYPES.GAME_NOT_FOUND, 'ゲームが見つかりません');
    }

    if (!game.isPlayable()) {
      return this.createErrorResponse(ERROR_TYPES.GAME_NOT_PLAYABLE);
    }

    const player = game.getPlayer(playerId);
    if (!player) {
      return this.createErrorResponse(ERROR_TYPES.PLAYER_NOT_FOUND);
    }

    return {
      success: true,
      game: game,
      player: player,
      gameId: gameId
    };
  }

  /**
   * レート制限チェック
   * @param {string} playerId - プレイヤーID
   * @param {string} action - アクション名
   * @param {number} limit - 制限回数（デフォルト: 10回/分）
   * @returns {boolean} 制限内かどうか
   */
  static checkRateLimit(playerId, action, limit = 10) {
    const key = `${playerId}_${action}`;
    const now = Date.now();
    const windowMs = 60 * 1000; // 1分

    if (!this.rateLimitMap) {
      this.rateLimitMap = new Map();
    }

    const playerActions = this.rateLimitMap.get(key) || [];
    
    // 1分以内のアクションのみを保持
    const recentActions = playerActions.filter(timestamp => now - timestamp < windowMs);
    
    if (recentActions.length >= limit) {
      return false;
    }

    // 新しいアクションを記録
    recentActions.push(now);
    this.rateLimitMap.set(key, recentActions);
    
    return true;
  }

  /**
   * 操作タイムアウトの設定
   * @param {Function} operation - 実行する操作
   * @param {number} timeoutMs - タイムアウト時間（ミリ秒）
   * @returns {Promise} 操作結果
   */
  static withTimeout(operation, timeoutMs = 30000) {
    return Promise.race([
      operation(),
      new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error('操作がタイムアウトしました'));
        }, timeoutMs);
      })
    ]);
  }

  /**
   * 詳細なエラー情報を含むレスポンスを生成
   * @param {string} errorType - エラータイプ
   * @param {string} customMessage - カスタムメッセージ
   * @param {Object} details - 詳細情報
   * @returns {Object} 詳細エラーレスポンス
   */
  static createDetailedErrorResponse(errorType, customMessage = null, details = {}) {
    return {
      success: false,
      error: customMessage || ERROR_MESSAGES[errorType] || '不明なエラーが発生しました',
      errorType: errorType,
      details: details,
      timestamp: new Date().toISOString(),
      errorCode: this.generateErrorCode(errorType)
    };
  }

  /**
   * エラーコードを生成
   * @param {string} errorType - エラータイプ
   * @returns {string} エラーコード
   */
  static generateErrorCode(errorType) {
    const timestamp = Date.now().toString(36);
    const typeCode = errorType.substring(0, 3).toUpperCase();
    return `${typeCode}-${timestamp}`;
  }

  /**
   * 複数の検証エラーをまとめる
   * @param {Array} validationErrors - 検証エラーの配列
   * @returns {Object} まとめられたエラーレスポンス
   */
  static createValidationErrorResponse(validationErrors) {
    return this.createDetailedErrorResponse(
      ERROR_TYPES.VALIDATION_ERROR,
      '入力データに問題があります',
      {
        validationErrors: validationErrors,
        fieldCount: validationErrors.length
      }
    );
  }

  /**
   * ログ出力
   * @param {string} level - ログレベル
   * @param {string} message - メッセージ
   * @param {Object} data - 追加データ
   */
  static log(level, message, data = {}) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      message,
      ...data
    };

    // 本番環境では詳細なログを制限
    const isProduction = process.env.NODE_ENV === 'production';
    
    switch (level) {
      case 'error':
        console.error(`[${timestamp}] ERROR: ${message}`, isProduction ? {} : data);
        // エラーログは別途保存することも可能
        this.saveErrorLog(logEntry);
        break;
      case 'warn':
        console.warn(`[${timestamp}] WARN: ${message}`, isProduction ? {} : data);
        break;
      case 'info':
        if (!isProduction) {
          console.log(`[${timestamp}] INFO: ${message}`, data);
        }
        break;
      case 'debug':
        if (!isProduction) {
          console.log(`[${timestamp}] DEBUG: ${message}`, data);
        }
        break;
      default:
        console.log(`[${timestamp}] ${level.toUpperCase()}: ${message}`, isProduction ? {} : data);
    }
  }

  /**
   * エラーログを保存（将来的にファイルやDBに保存可能）
   * @param {Object} logEntry - ログエントリ
   */
  static saveErrorLog(logEntry) {
    // 現在はメモリに保存（実装例）
    if (!this.errorLogs) {
      this.errorLogs = [];
    }
    
    this.errorLogs.push(logEntry);
    
    // 最大1000件まで保持
    if (this.errorLogs.length > 1000) {
      this.errorLogs.shift();
    }
  }

  /**
   * エラー統計を取得
   * @returns {Object} エラー統計
   */
  static getErrorStats() {
    if (!this.errorLogs) {
      return { totalErrors: 0, errorsByType: {} };
    }

    const errorsByType = {};
    this.errorLogs.forEach(log => {
      const errorType = log.errorType || 'unknown';
      errorsByType[errorType] = (errorsByType[errorType] || 0) + 1;
    });

    return {
      totalErrors: this.errorLogs.length,
      errorsByType: errorsByType,
      recentErrors: this.errorLogs.slice(-10) // 最新10件
    };
  }
}

module.exports = {
  ErrorHandler,
  ERROR_TYPES,
  ERROR_MESSAGES
};
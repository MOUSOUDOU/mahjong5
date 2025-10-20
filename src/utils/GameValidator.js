/**
 * ゲーム操作の検証ユーティリティ
 * 要件6.3に対応：無効な操作の検証
 */

const { ErrorHandler, ERROR_TYPES } = require('./ErrorHandler');

/**
 * ゲーム検証クラス
 */
class GameValidator {
  /**
   * 牌IDの形式を検証
   * @param {string} tileId - 牌ID
   * @returns {Object} 検証結果
   */
  static validateTileId(tileId) {
    if (!tileId || typeof tileId !== 'string') {
      return {
        isValid: false,
        error: '牌IDが指定されていません'
      };
    }

    const validPattern = /^(bamboo_[1-9]|honor_(white|green|red))$/;
    if (!validPattern.test(tileId)) {
      return {
        isValid: false,
        error: '無効な牌IDの形式です'
      };
    }

    return { isValid: true };
  }

  /**
   * プレイヤー名を検証
   * @param {string} playerName - プレイヤー名
   * @returns {Object} 検証結果
   */
  static validatePlayerName(playerName) {
    if (!playerName) {
      return { isValid: true }; // プレイヤー名は省略可能
    }

    if (typeof playerName !== 'string') {
      return {
        isValid: false,
        error: 'プレイヤー名は文字列である必要があります'
      };
    }

    if (playerName.trim().length === 0) {
      return {
        isValid: false,
        error: 'プレイヤー名は空白のみにはできません'
      };
    }

    if (playerName.length > 20) {
      return {
        isValid: false,
        error: 'プレイヤー名は20文字以下である必要があります'
      };
    }

    // 使用可能文字のチェック
    const validPattern = /^[a-zA-Z0-9あ-んア-ンー一-龯\s]+$/;
    if (!validPattern.test(playerName)) {
      return {
        isValid: false,
        error: 'プレイヤー名に使用できない文字が含まれています'
      };
    }

    return { isValid: true };
  }

  /**
   * ゲーム状態を検証
   * @param {Object} game - ゲームオブジェクト
   * @returns {Object} 検証結果
   */
  static validateGameState(game) {
    if (!game) {
      return {
        isValid: false,
        error: 'ゲームオブジェクトが存在しません'
      };
    }

    if (!game.gameId) {
      return {
        isValid: false,
        error: 'ゲームIDが設定されていません'
      };
    }

    if (!Array.isArray(game.players)) {
      return {
        isValid: false,
        error: 'プレイヤー配列が正しく設定されていません'
      };
    }

    if (game.players.length !== 2) {
      return {
        isValid: false,
        error: 'プレイヤー数が正しくありません（2人である必要があります）'
      };
    }

    if (!game.deck) {
      return {
        isValid: false,
        error: 'デッキが設定されていません'
      };
    }

    return { isValid: true };
  }

  /**
   * プレイヤーの手牌を検証
   * @param {Object} player - プレイヤーオブジェクト
   * @param {number} expectedSize - 期待される手牌サイズ
   * @returns {Object} 検証結果
   */
  static validatePlayerHand(player, expectedSize = null) {
    if (!player) {
      return {
        isValid: false,
        error: 'プレイヤーオブジェクトが存在しません'
      };
    }

    if (!Array.isArray(player.hand)) {
      return {
        isValid: false,
        error: '手牌が正しく設定されていません'
      };
    }

    if (expectedSize !== null && player.hand.length !== expectedSize) {
      return {
        isValid: false,
        error: `手牌が${expectedSize}枚ではありません（現在：${player.hand.length}枚）`
      };
    }

    // 手牌の各牌を検証
    for (let i = 0; i < player.hand.length; i++) {
      const tile = player.hand[i];
      if (!tile || !tile.id) {
        return {
          isValid: false,
          error: `手牌の${i + 1}番目の牌が無効です`
        };
      }

      const tileValidation = this.validateTileId(tile.id);
      if (!tileValidation.isValid) {
        return {
          isValid: false,
          error: `手牌の${i + 1}番目の牌: ${tileValidation.error}`
        };
      }
    }

    return { isValid: true };
  }

  /**
   * ゲーム操作の前提条件を検証
   * @param {Object} game - ゲームオブジェクト
   * @param {string} playerId - プレイヤーID
   * @param {string} action - アクション名
   * @returns {Object} 検証結果
   */
  static validateGameOperation(game, playerId, action) {
    // ゲーム状態の検証
    const gameValidation = this.validateGameState(game);
    if (!gameValidation.isValid) {
      return gameValidation;
    }

    // プレイヤーの存在確認
    const player = game.getPlayer(playerId);
    if (!player) {
      return {
        isValid: false,
        error: 'プレイヤーが見つかりません'
      };
    }

    // ゲームがプレイ可能かチェック
    if (!game.isPlayable()) {
      return {
        isValid: false,
        error: 'ゲームがプレイ可能な状態ではありません'
      };
    }

    // 手番チェック（一部のアクションを除く）
    const noTurnCheckActions = ['getGameState', 'checkTenpai'];
    if (!noTurnCheckActions.includes(action) && !game.isPlayerTurn(playerId)) {
      return {
        isValid: false,
        error: 'あなたの手番ではありません'
      };
    }

    return { isValid: true, player };
  }

  /**
   * リーチ宣言の条件を検証
   * @param {Object} player - プレイヤーオブジェクト
   * @param {Array} waitingTiles - 待ち牌配列
   * @returns {Object} 検証結果
   */
  static validateRiichiConditions(player, waitingTiles) {
    if (player.isRiichi) {
      return {
        isValid: false,
        error: '既にリーチを宣言しています'
      };
    }

    const handValidation = this.validatePlayerHand(player, 4);
    if (!handValidation.isValid) {
      return handValidation;
    }

    if (!Array.isArray(waitingTiles) || waitingTiles.length === 0) {
      return {
        isValid: false,
        error: 'テンパイしていないためリーチできません'
      };
    }

    return { isValid: true };
  }

  /**
   * 牌を捨てる操作の条件を検証
   * @param {Object} player - プレイヤーオブジェクト
   * @param {string} tileId - 捨てる牌のID
   * @returns {Object} 検証結果
   */
  static validateDiscardConditions(player, tileId) {
    if (player.isRiichi) {
      return {
        isValid: false,
        error: 'リーチ中は牌を選んで捨てることはできません'
      };
    }

    const handValidation = this.validatePlayerHand(player, 5);
    if (!handValidation.isValid) {
      return handValidation;
    }

    const tileValidation = this.validateTileId(tileId);
    if (!tileValidation.isValid) {
      return tileValidation;
    }

    if (!player.hasTileInHand(tileId)) {
      return {
        isValid: false,
        error: '指定された牌が手牌にありません'
      };
    }

    return { isValid: true };
  }

  /**
   * 牌を引く操作の条件を検証
   * @param {Object} player - プレイヤーオブジェクト
   * @param {Object} game - ゲームオブジェクト
   * @returns {Object} 検証結果
   */
  static validateDrawConditions(player, game) {
    if (player.isHandFull()) {
      return {
        isValid: false,
        error: '手牌が満杯です'
      };
    }

    if (game.isDeckEmpty()) {
      return {
        isValid: false,
        error: '山に牌がありません',
        shouldDraw: true // 流局処理が必要
      };
    }

    return { isValid: true };
  }

  /**
   * 複数の検証エラーをまとめる
   * @param {Array} validations - 検証結果の配列
   * @returns {Object} まとめられた検証結果
   */
  static combineValidations(validations) {
    const errors = [];
    
    for (const validation of validations) {
      if (!validation.isValid) {
        errors.push(validation.error);
      }
    }

    return {
      isValid: errors.length === 0,
      errors: errors
    };
  }

  /**
   * 検証エラーをログに記録
   * @param {string} action - アクション名
   * @param {Object} validation - 検証結果
   * @param {Object} context - コンテキスト情報
   */
  static logValidationError(action, validation, context = {}) {
    if (!validation.isValid) {
      ErrorHandler.log('warn', `検証エラー: ${action}`, {
        error: validation.error,
        errors: validation.errors,
        ...context
      });
    }
  }
}

module.exports = GameValidator;
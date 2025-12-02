/**
 * 状態検証クラス - ゲーム状態の整合性チェック
 * 要件5.2, 5.5に対応
 */
class StateValidator {
  /**
   * プレイヤーの手牌を検証
   * @param {Object} player - プレイヤーオブジェクト
   * @returns {boolean} 検証結果
   */
  static validatePlayerHand(player) {
    if (!player) {
      throw new Error('プレイヤーオブジェクトが存在しません');
    }
    
    if (!Array.isArray(player.hand)) {
      throw new Error('プレイヤーの手牌が配列ではありません');
    }
    
    if (player.hand.length < 1 || player.hand.length > 14) {
      throw new Error(`不正な手牌数: ${player.hand.length}枚`);
    }
    
    // 各牌の検証
    for (let i = 0; i < player.hand.length; i++) {
      const tile = player.hand[i];
      if (!tile || !tile.id) {
        throw new Error(`手牌の${i + 1}番目の牌が不正です`);
      }
    }
    
    return true;
  }

  /**
   * ゲームフローを検証
   * @param {Object} gameState - ゲーム状態
   * @param {string} playerId - プレイヤーID
   * @param {string} action - アクション
   * @returns {boolean} 検証結果
   */
  static validateGameFlow(gameState, playerId, action) {
    if (!gameState) {
      throw new Error('ゲーム状態が存在しません');
    }
    
    const player = gameState.getPlayer(playerId);
    if (!player) {
      throw new Error(`プレイヤー ${playerId} が見つかりません`);
    }
    
    // ゲーム状態チェック
    if (gameState.gameState !== 'playing') {
      throw new Error(`ゲームが進行中ではありません: ${gameState.gameState}`);
    }
    
    // 手番チェック（ロン判定以外）
    if (action !== 'queryRon' && !gameState.isPlayerTurn(playerId)) {
      throw new Error('手番外の操作です');
    }
    
    // リーチ状態チェック
    if (player.isRiichi && action === 'queryRiichi') {
      throw new Error('既にリーチ宣言済みです');
    }
    
    // アクション固有の検証
    switch (action) {
      case 'queryAutoDraw':
        if (player.hand.length !== 4) {
          throw new Error(`自動引き時の手牌数が不正: ${player.hand.length}枚`);
        }
        break;
        
      case 'queryTsumo':
        if (player.hand.length !== 5) {
          throw new Error(`自摸判定時の手牌数が不正: ${player.hand.length}枚`);
        }
        break;
        
      case 'queryRon':
        if (player.hand.length !== 4) {
          throw new Error(`ロン判定時の手牌数が不正: ${player.hand.length}枚`);
        }
        if (!player.isRiichi) {
          throw new Error('リーチしていないプレイヤーはロンできません');
        }
        break;
        
      case 'queryRiichi':
        if (player.hand.length !== 5) {
          throw new Error(`リーチ判定時の手牌数が不正: ${player.hand.length}枚`);
        }
        if (player.isRiichi) {
          throw new Error('既にリーチ宣言済みです');
        }
        break;
    }
    
    return true;
  }

  /**
   * 牌操作を検証
   * @param {Object} player - プレイヤー
   * @param {Object} tile - 牌
   * @param {string} operation - 操作（'discard', 'draw'）
   * @returns {boolean} 検証結果
   */
  static validateTileOperation(player, tile, operation) {
    if (!player) {
      throw new Error('プレイヤーオブジェクトが存在しません');
    }
    
    if (!tile || !tile.id) {
      throw new Error('牌データが不正です');
    }
    
    switch (operation) {
      case 'discard':
        if (!Array.isArray(player.hand)) {
          throw new Error('プレイヤーの手牌が配列ではありません');
        }
        
        const hasTile = player.hand.some(t => t.id === tile.id);
        if (!hasTile) {
          throw new Error('手牌にない牌を捨てようとしています');
        }
        
        if (player.hand.length < 5) {
          throw new Error('手牌が5枚未満で牌を捨てようとしています');
        }
        break;
        
      case 'draw':
        if (!Array.isArray(player.hand)) {
          throw new Error('プレイヤーの手牌が配列ではありません');
        }
        
        if (player.hand.length >= 14) {
          throw new Error('手牌が満杯で牌を引けません');
        }
        
        if (player.hand.length !== 4) {
          throw new Error('手牌が4枚でない状態で牌を引こうとしています');
        }
        break;
        
      default:
        throw new Error(`未知の牌操作: ${operation}`);
    }
    
    return true;
  }

  /**
   * ゲーム状態の整合性を包括的にチェック
   * @param {Object} gameState - ゲーム状態
   * @returns {Object} 検証結果
   */
  static validateGameStateIntegrity(gameState) {
    const issues = [];
    const warnings = [];
    
    try {
      // 基本的なゲーム状態チェック
      if (!gameState) {
        issues.push('ゲーム状態が存在しません');
        return { valid: false, issues, warnings };
      }
      
      if (!gameState.players || !Array.isArray(gameState.players)) {
        issues.push('プレイヤー配列が存在しません');
        return { valid: false, issues, warnings };
      }
      
      if (gameState.players.length !== 2) {
        issues.push(`プレイヤー数が不正: ${gameState.players.length}人`);
      }
      
      // 各プレイヤーの検証
      for (let i = 0; i < gameState.players.length; i++) {
        const player = gameState.players[i];
        
        try {
          this.validatePlayerHand(player);
        } catch (error) {
          issues.push(`プレイヤー${i + 1}の手牌エラー: ${error.message}`);
        }
        
        // 手牌数の警告
        if (player.hand && (player.hand.length < 4 || player.hand.length > 5)) {
          warnings.push(`プレイヤー${i + 1}の手牌数が異常: ${player.hand.length}枚`);
        }
        
        // リーチ状態の整合性チェック
        if (player.isRiichi && player.hand && player.hand.length === 5) {
          warnings.push(`プレイヤー${i + 1}がリーチ中なのに手牌が5枚です`);
        }
      }
      
      // 手番の整合性チェック
      if (typeof gameState.currentPlayerIndex !== 'number' || 
          gameState.currentPlayerIndex < 0 || 
          gameState.currentPlayerIndex >= gameState.players.length) {
        issues.push(`現在の手番インデックスが不正: ${gameState.currentPlayerIndex}`);
      }
      
      // 山牌の整合性チェック
      if (gameState.deck && gameState.deck.tiles) {
        const remainingTiles = gameState.deck.tiles.length;
        if (remainingTiles < 0) {
          issues.push(`山牌の残り枚数が負の値: ${remainingTiles}`);
        }
        
        if (remainingTiles > 100) {
          warnings.push(`山牌の残り枚数が多すぎます: ${remainingTiles}枚`);
        }
      }
      
      // 捨て牌の整合性チェック
      for (let i = 0; i < gameState.players.length; i++) {
        const player = gameState.players[i];
        if (player.discardedTiles && player.discardedTiles.length > 20) {
          warnings.push(`プレイヤー${i + 1}の捨て牌が多すぎます: ${player.discardedTiles.length}枚`);
        }
      }
      
    } catch (error) {
      issues.push(`検証処理でエラー: ${error.message}`);
    }
    
    return {
      valid: issues.length === 0,
      issues,
      warnings,
      timestamp: Date.now()
    };
  }

  /**
   * 判定履歴の整合性をチェック
   * @param {Object[]} judgmentHistory - 判定履歴
   * @returns {Object} 検証結果
   */
  static validateJudgmentHistory(judgmentHistory) {
    const issues = [];
    const warnings = [];
    
    if (!Array.isArray(judgmentHistory)) {
      issues.push('判定履歴が配列ではありません');
      return { valid: false, issues, warnings };
    }
    
    for (let i = 0; i < judgmentHistory.length; i++) {
      const entry = judgmentHistory[i];
      
      if (!entry.type || typeof entry.type !== 'string') {
        issues.push(`履歴${i + 1}: 判定タイプが不正です`);
      }
      
      if (!entry.playerId || typeof entry.playerId !== 'string') {
        issues.push(`履歴${i + 1}: プレイヤーIDが不正です`);
      }
      
      if (!entry.timestamp || typeof entry.timestamp !== 'number') {
        issues.push(`履歴${i + 1}: タイムスタンプが不正です`);
      }
      
      if (!entry.result || typeof entry.result !== 'object') {
        issues.push(`履歴${i + 1}: 判定結果が不正です`);
      }
      
      // タイムスタンプの順序チェック
      if (i > 0 && entry.timestamp < judgmentHistory[i - 1].timestamp) {
        warnings.push(`履歴${i + 1}: タイムスタンプの順序が不正です`);
      }
    }
    
    // 履歴サイズの警告
    if (judgmentHistory.length > 1000) {
      warnings.push(`判定履歴が大きすぎます: ${judgmentHistory.length}件`);
    }
    
    return {
      valid: issues.length === 0,
      issues,
      warnings,
      entryCount: judgmentHistory.length,
      timestamp: Date.now()
    };
  }

  /**
   * 保留中の判定の整合性をチェック
   * @param {Map} pendingJudgments - 保留中の判定
   * @param {number} maxAge - 最大保持時間（ミリ秒）
   * @returns {Object} 検証結果
   */
  static validatePendingJudgments(pendingJudgments, maxAge = 30000) {
    const issues = [];
    const warnings = [];
    const expiredEntries = [];
    
    if (!(pendingJudgments instanceof Map)) {
      issues.push('保留中の判定がMapオブジェクトではありません');
      return { valid: false, issues, warnings };
    }
    
    const now = Date.now();
    
    for (const [key, judgment] of pendingJudgments.entries()) {
      if (!judgment.playerId || typeof judgment.playerId !== 'string') {
        issues.push(`保留判定 ${key}: プレイヤーIDが不正です`);
      }
      
      if (!judgment.type || typeof judgment.type !== 'string') {
        issues.push(`保留判定 ${key}: 判定タイプが不正です`);
      }
      
      if (!judgment.timestamp || typeof judgment.timestamp !== 'number') {
        issues.push(`保留判定 ${key}: タイムスタンプが不正です`);
      } else {
        const age = now - judgment.timestamp;
        if (age > maxAge) {
          expiredEntries.push(key);
          warnings.push(`保留判定 ${key}: 期限切れです (${Math.round(age / 1000)}秒経過)`);
        }
      }
    }
    
    // サイズの警告
    if (pendingJudgments.size > 100) {
      warnings.push(`保留中の判定が多すぎます: ${pendingJudgments.size}件`);
    }
    
    return {
      valid: issues.length === 0,
      issues,
      warnings,
      expiredEntries,
      pendingCount: pendingJudgments.size,
      timestamp: Date.now()
    };
  }
}

module.exports = StateValidator;
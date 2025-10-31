/**
 * GameStateManager.js
 * ゲーム状態の管理と更新を行うモジュール
 */

class GameStateManager {
    constructor() {
        this.currentGameState = null;
        this.previousGameState = null;
        this.playerId = null;
        this.stateChangeCallbacks = new Map();
    }

    /**
     * ゲーム状態を更新
     * @param {Object} gameState - 新しいゲーム状態
     */
    updateGameState(gameState) {
        console.log('ゲーム状態更新:', gameState);

        // 前回の状態を保存
        this.previousGameState = this.currentGameState ? { ...this.currentGameState } : null;
        this.currentGameState = gameState;

        // プレイヤーIDを設定（初回のみ）
        if (!this.playerId && gameState.players && gameState.players.length > 0) {
            // Socket IDと一致するプレイヤーを探す
            if (window.socketManager && window.socketManager.getSocket()) {
                const socketId = window.socketManager.getSocket().id;
                const matchingPlayer = gameState.players.find(p => p.id === socketId);
                if (matchingPlayer) {
                    this.playerId = socketId;
                    console.log('プレイヤーID設定:', this.playerId);
                }
            }
        }

        // 状態変更コールバックを実行
        this.executeStateChangeCallbacks('gameStateUpdate', gameState);

        // 手番変更の検出
        if (this.previousGameState && 
            this.previousGameState.currentPlayerIndex !== gameState.currentPlayerIndex) {
            this.executeStateChangeCallbacks('turnChanged', {
                previousPlayer: this.previousGameState.currentPlayerIndex,
                currentPlayer: gameState.currentPlayerIndex,
                isMyTurn: this.isMyTurn()
            });
        }

        return gameState;
    }

    /**
     * 現在のプレイヤー情報を取得
     * @returns {Object|null} プレイヤー情報
     */
    getCurrentPlayer() {
        if (!this.currentGameState || !this.playerId) {
            return null;
        }

        return this.currentGameState.players.find(p => p.id === this.playerId);
    }

    /**
     * 相手プレイヤー情報を取得
     * @returns {Object|null} 相手プレイヤー情報
     */
    getOpponent() {
        if (!this.currentGameState || !this.playerId) {
            return null;
        }

        return this.currentGameState.players.find(p => p.id !== this.playerId);
    }

    /**
     * 自分の手番かチェック
     * @returns {boolean} 自分の手番かどうか
     */
    isMyTurn() {
        if (!this.currentGameState || !this.playerId) {
            return false;
        }

        const currentPlayer = this.getCurrentPlayer();
        if (!currentPlayer) {
            return false;
        }

        const currentPlayerIndex = this.currentGameState.players.indexOf(currentPlayer);
        return this.currentGameState.currentPlayerIndex === currentPlayerIndex;
    }

    /**
     * プレイヤーの手牌を取得
     * @returns {Array} プレイヤーの手牌
     */
    getPlayerHand() {
        if (!this.currentGameState) {
            return [];
        }

        return this.currentGameState.playerHandTiles || [];
    }

    /**
     * 相手の手牌サイズを取得
     * @returns {number} 相手の手牌サイズ
     */
    getOpponentHandSize() {
        const opponent = this.getOpponent();
        return opponent ? opponent.handSize : 0;
    }

    /**
     * 現在のゲーム状態を取得
     * @returns {Object|null} 現在のゲーム状態
     */
    getCurrentGameState() {
        return this.currentGameState;
    }

    /**
     * 前回のゲーム状態を取得
     * @returns {Object|null} 前回のゲーム状態
     */
    getPreviousGameState() {
        return this.previousGameState;
    }

    /**
     * プレイヤーIDを設定
     * @param {string} id - プレイヤーID
     */
    setPlayerId(id) {
        this.playerId = id;
        console.log('プレイヤーID設定:', id);
        
        // プレイヤーID変更コールバックを実行
        this.executeStateChangeCallbacks('playerIdChanged', id);
    }

    /**
     * プレイヤーIDを取得
     * @returns {string|null} プレイヤーID
     */
    getPlayerId() {
        return this.playerId;
    }

    /**
     * 引いた牌を検出
     * @returns {Object|null} 引いた牌
     */
    getDrawnTile() {
        if (!this.previousGameState || !this.currentGameState) {
            return null;
        }

        const previousHand = this.previousGameState.playerHandTiles || [];
        const currentHand = this.currentGameState.playerHandTiles || [];

        // 手牌が1枚増えた場合
        if (currentHand.length === previousHand.length + 1 && currentHand.length === 5) {
            // 新しく追加された牌を引いた牌として特定
            const previousTileIds = new Set(previousHand.map(t => t.id));
            const drawnTile = currentHand.find(tile => !previousTileIds.has(tile.id));
            
            if (drawnTile) {
                console.log('引いた牌を検出:', drawnTile);
                return drawnTile;
            }
        }

        // 引いた牌が検出できない場合でも、5枚の時は最後の牌を引いた牌として扱う
        if (currentHand.length === 5 && this.isMyTurn()) {
            const lastTile = currentHand[currentHand.length - 1];
            console.log('5枚時の引いた牌として扱う:', lastTile);
            return lastTile;
        }

        return null;
    }

    /**
     * ゲーム情報を取得
     * @returns {Object} ゲーム情報
     */
    getGameInfo() {
        if (!this.currentGameState) {
            return {
                remainingTiles: 0,
                currentPlayerIndex: -1,
                gameId: null
            };
        }

        return {
            remainingTiles: this.currentGameState.remainingTiles || 0,
            currentPlayerIndex: this.currentGameState.currentPlayerIndex || 0,
            gameId: this.currentGameState.gameId || null
        };
    }

    /**
     * プレイヤーのリーチ状態を取得
     * @returns {boolean} リーチ状態
     */
    isPlayerRiichi() {
        const player = this.getCurrentPlayer();
        return player ? player.isRiichi : false;
    }

    /**
     * 相手のリーチ状態を取得
     * @returns {boolean} 相手のリーチ状態
     */
    isOpponentRiichi() {
        const opponent = this.getOpponent();
        return opponent ? opponent.isRiichi : false;
    }

    /**
     * 状態変更コールバックを登録
     * @param {string} eventName - イベント名
     * @param {Function} callback - コールバック関数
     */
    onStateChange(eventName, callback) {
        if (!this.stateChangeCallbacks.has(eventName)) {
            this.stateChangeCallbacks.set(eventName, []);
        }
        this.stateChangeCallbacks.get(eventName).push(callback);
    }

    /**
     * 状態変更コールバックを削除
     * @param {string} eventName - イベント名
     * @param {Function} callback - 削除するコールバック関数
     */
    offStateChange(eventName, callback) {
        if (this.stateChangeCallbacks.has(eventName)) {
            const callbacks = this.stateChangeCallbacks.get(eventName);
            const index = callbacks.indexOf(callback);
            if (index > -1) {
                callbacks.splice(index, 1);
            }
        }
    }

    /**
     * 状態変更コールバックを実行
     * @param {string} eventName - イベント名
     * @param {*} data - イベントデータ
     */
    executeStateChangeCallbacks(eventName, data) {
        if (this.stateChangeCallbacks.has(eventName)) {
            const callbacks = this.stateChangeCallbacks.get(eventName);
            callbacks.forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    console.error(`状態変更コールバック実行エラー (${eventName}):`, error);
                }
            });
        }
    }

    /**
     * ゲーム状態をリセット
     */
    resetGameState() {
        this.previousGameState = this.currentGameState;
        this.currentGameState = null;
        
        // リセットコールバックを実行
        this.executeStateChangeCallbacks('gameStateReset', null);
        
        console.log('ゲーム状態をリセットしました');
    }

    /**
     * ローカルストレージからゲーム情報を取得
     * @returns {string|null} 保存されたゲームID
     */
    getSavedGameId() {
        return localStorage.getItem('currentGameId');
    }

    /**
     * ローカルストレージにゲーム情報を保存
     * @param {string} gameId - ゲームID
     */
    saveGameId(gameId) {
        if (gameId) {
            localStorage.setItem('currentGameId', gameId);
            console.log('ゲームID保存:', gameId);
        }
    }

    /**
     * ローカルストレージからゲーム情報を削除
     */
    clearSavedGameId() {
        localStorage.removeItem('currentGameId');
        console.log('保存されたゲームIDを削除しました');
    }

    /**
     * デバッグ用：現在の状態を出力
     */
    debugCurrentState() {
        console.log('=== GameStateManager デバッグ情報 ===');
        console.log('プレイヤーID:', this.playerId);
        console.log('現在のゲーム状態:', this.currentGameState);
        console.log('現在のプレイヤー:', this.getCurrentPlayer());
        console.log('相手プレイヤー:', this.getOpponent());
        console.log('自分の手番:', this.isMyTurn());
        console.log('プレイヤー手牌:', this.getPlayerHand());
        console.log('引いた牌:', this.getDrawnTile());
        console.log('=====================================');
    }
}

// グローバルインスタンスを作成（後方互換性のため）
if (typeof window.gameStateManager === 'undefined') {
    window.gameStateManager = new GameStateManager();
}

// 既存の変数名での後方互換性を提供
window.currentGameState = null;
window.playerId = null;

// 状態更新時にグローバル変数も更新
window.gameStateManager.onStateChange('gameStateUpdate', (gameState) => {
    window.currentGameState = gameState;
});

window.gameStateManager.onStateChange('playerIdChanged', (id) => {
    window.playerId = id;
});

// モジュールとしてエクスポート
if (typeof module !== 'undefined' && module.exports) {
    module.exports = GameStateManager;
}

// ES6モジュールとしてもエクスポート
if (typeof window !== 'undefined') {
    window.GameStateManager = GameStateManager;
}
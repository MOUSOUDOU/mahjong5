/**
 * SocketManager.js
 * Socket.io接続とサーバー通信を管理するモジュール
 */

class SocketManager {
    constructor() {
        this.socket = null;
        this.isConnected = false;
        this.errorHandler = null;
        this.eventCallbacks = new Map();
        this.reconnectionAttempts = 0;
        this.maxReconnectionAttempts = 5;
        this.reconnectionInterval = null;
    }

    /**
     * Socket.io接続を初期化
     * @param {ErrorHandler} errorHandler - エラーハンドラーインスタンス
     */
    initialize(errorHandler) {
        this.errorHandler = errorHandler;
        
        // Socket.ioクライアントが利用可能かチェック
        if (typeof io === 'undefined') {
            this.errorHandler.showError('Socket.ioライブラリが読み込まれていません');
            return false;
        }

        try {
            this.socket = io();
            this.setupEventListeners();
            return true;
        } catch (error) {
            this.errorHandler.handleConnectionError(error, 'Socket.io初期化');
            return false;
        }
    }

    /**
     * Socket.ioイベントリスナーを設定
     */
    setupEventListeners() {
        if (!this.socket) return;

        // 接続イベント
        this.socket.on('connect', () => {
            console.log('サーバーに接続しました');
            this.isConnected = true;
            this.reconnectionAttempts = 0;
            this.updateConnectionStatus(true);

            // 接続時にゲーム参加をリクエスト
            this.safeEmit('joinGame');

            // 接続成功コールバックを実行
            this.executeCallbacks('connect');
        });

        // 切断イベント
        this.socket.on('disconnect', () => {
            console.log('サーバーから切断されました');
            this.isConnected = false;
            this.updateConnectionStatus(false);
            
            // 切断コールバックを実行
            this.executeCallbacks('disconnect');
        });

        // 接続エラーイベント
        this.socket.on('connect_error', (error) => {
            console.error('接続エラー:', error);
            this.errorHandler.showError('サーバーに接続できません。しばらく待ってから再試行してください。');
            
            // 接続エラーコールバックを実行
            this.executeCallbacks('connect_error', error);
        });

        // ゲーム関連イベント
        this.setupGameEventListeners();

        // エラーハンドリングイベント
        this.setupErrorEventListeners();

        // 再接続関連イベント
        this.setupReconnectionEventListeners();
    }

    /**
     * ゲーム関連のイベントリスナーを設定
     */
    setupGameEventListeners() {
        const gameEvents = [
            'gameStateUpdate',
            'playerJoined',
            'playerLeft',
            'waitingForPlayers',
            'autoTileDraw',
            'tileDiscarded',
            'riichiDeclared',
            'gameWon',
            'gameStarted',
            'gameEnded',
            'playerDisconnected',
            'turnTimerStarted',
            'autoDiscardTimeout',
            'autoDrawTimeout'
        ];

        gameEvents.forEach(eventName => {
            this.socket.on(eventName, (data) => {
                console.log(`${eventName}:`, data);
                this.executeCallbacks(eventName, data);
            });
        });
    }

    /**
     * エラーハンドリング関連のイベントリスナーを設定
     */
    setupErrorEventListeners() {
        this.socket.on('error', (error) => {
            console.error('ゲームエラー:', error);
            const message = this.errorHandler.getErrorMessage(error.type, error.message);
            this.errorHandler.showError(message);
            
            this.executeCallbacks('error', error);
        });

        this.socket.on('gameError', (error) => {
            console.error('ゲームエラー:', error);
            const message = this.errorHandler.getErrorMessage(error.type, error.message);
            this.errorHandler.showError(message);
            
            this.executeCallbacks('gameError', error);
        });
    }

    /**
     * 再接続関連のイベントリスナーを設定
     */
    setupReconnectionEventListeners() {
        this.socket.on('reconnectionSuccess', (data) => {
            console.log('再接続成功:', data);
            this.errorHandler.showMessage(data.message, 3000);
            this.executeCallbacks('reconnectionSuccess', data);
        });

        this.socket.on('reconnectionFailed', (data) => {
            console.log('再接続失敗:', data);
            this.errorHandler.showError('再接続に失敗しました: ' + data.error);
            this.executeCallbacks('reconnectionFailed', data);
        });

        this.socket.on('playerReconnected', (data) => {
            console.log('プレイヤーが再接続:', data);
            this.errorHandler.showMessage(data.message, 3000);
            this.executeCallbacks('playerReconnected', data);
        });
    }

    /**
     * 安全なSocket.io送信機能
     * @param {string} event - イベント名
     * @param {Object} data - 送信データ
     * @returns {boolean} 送信成功かどうか
     */
    safeEmit(event, data = {}) {
        if (!this.isConnected || !this.socket) {
            this.errorHandler.showError('サーバーに接続されていません');
            return false;
        }

        try {
            this.socket.emit(event, data);
            console.log(`送信: ${event}`, data);
            return true;
        } catch (error) {
            console.error('送信エラー:', error);
            this.errorHandler.handleConnectionError(error, '送信');
            return false;
        }
    }

    /**
     * イベントコールバックを登録
     * @param {string} eventName - イベント名
     * @param {Function} callback - コールバック関数
     */
    on(eventName, callback) {
        if (!this.eventCallbacks.has(eventName)) {
            this.eventCallbacks.set(eventName, []);
        }
        this.eventCallbacks.get(eventName).push(callback);
    }

    /**
     * イベントコールバックを削除
     * @param {string} eventName - イベント名
     * @param {Function} callback - 削除するコールバック関数
     */
    off(eventName, callback) {
        if (this.eventCallbacks.has(eventName)) {
            const callbacks = this.eventCallbacks.get(eventName);
            const index = callbacks.indexOf(callback);
            if (index > -1) {
                callbacks.splice(index, 1);
            }
        }
    }

    /**
     * 登録されたコールバックを実行
     * @param {string} eventName - イベント名
     * @param {*} data - イベントデータ
     */
    executeCallbacks(eventName, data) {
        if (this.eventCallbacks.has(eventName)) {
            const callbacks = this.eventCallbacks.get(eventName);
            callbacks.forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    console.error(`コールバック実行エラー (${eventName}):`, error);
                }
            });
        }
    }

    /**
     * 再接続を試行
     * @param {string} gameId - ゲームID（オプション）
     */
    attemptReconnection(gameId = null) {
        if (this.isConnected) {
            return; // 既に接続済み
        }

        if (this.reconnectionAttempts >= this.maxReconnectionAttempts) {
            this.errorHandler.showError('再接続の試行回数が上限に達しました');
            return;
        }

        console.log(`再接続を試行中... (${this.reconnectionAttempts + 1}/${this.maxReconnectionAttempts})`);
        this.reconnectionAttempts++;

        try {
            if (this.socket) {
                this.socket.connect();

                // 接続後に再接続を試行
                this.socket.once('connect', () => {
                    if (gameId) {
                        this.safeEmit('attemptReconnection', { gameId });
                    }
                });
            } else {
                // Socketが存在しない場合は新しく作成
                this.initialize(this.errorHandler);
            }
        } catch (error) {
            this.errorHandler.handleConnectionError(error, '再接続');
        }
    }

    /**
     * 定期的な再接続チェックを開始
     */
    startReconnectionCheck() {
        if (this.reconnectionInterval) {
            return; // 既に開始済み
        }

        this.reconnectionInterval = setInterval(() => {
            if (!this.isConnected) {
                this.attemptReconnection();
            }
        }, 5000);
    }

    /**
     * 定期的な再接続チェックを停止
     */
    stopReconnectionCheck() {
        if (this.reconnectionInterval) {
            clearInterval(this.reconnectionInterval);
            this.reconnectionInterval = null;
        }
    }

    /**
     * 接続状態を更新
     * @param {boolean} connected - 接続状態
     */
    updateConnectionStatus(connected) {
        const header = document.querySelector('header h1');
        
        if (!header) {
            console.warn('ヘッダー要素が見つかりません');
            return;
        }

        if (connected) {
            header.style.color = '#ffd700';
            header.textContent = '５枚麻雀';
        } else {
            header.style.color = '#ff4444';
            header.textContent = '５枚麻雀 (接続中...)';
        }

        // 接続状態変更コールバックを実行
        this.executeCallbacks('connectionStatusChanged', connected);
    }

    /**
     * Socket.io接続を切断
     */
    disconnect() {
        this.stopReconnectionCheck();
        
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
        }
        
        this.isConnected = false;
        this.reconnectionAttempts = 0;
    }

    /**
     * 接続状態を取得
     * @returns {boolean} 接続状態
     */
    getConnectionStatus() {
        return this.isConnected;
    }

    /**
     * Socket.ioインスタンスを取得（後方互換性のため）
     * @returns {Socket} Socket.ioインスタンス
     */
    getSocket() {
        return this.socket;
    }
}

// グローバルインスタンスを作成（後方互換性のため）
if (typeof window.socketManager === 'undefined') {
    window.socketManager = new SocketManager();
}

// 既存の変数名での後方互換性を提供
window.socket = null; // 初期化後に設定される
window.isConnected = false;
window.safeEmit = (event, data) => window.socketManager.safeEmit(event, data);
window.attemptReconnection = (gameId) => window.socketManager.attemptReconnection(gameId);
window.updateConnectionStatus = (connected) => window.socketManager.updateConnectionStatus(connected);

// モジュールとしてエクスポート
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SocketManager;
}

// ES6モジュールとしてもエクスポート
if (typeof window !== 'undefined') {
    window.SocketManager = SocketManager;
}
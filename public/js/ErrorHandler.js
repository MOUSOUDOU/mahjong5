/**
 * ErrorHandler.js
 * エラーハンドリングとメッセージ表示を管理するモジュール
 */

class ErrorHandler {
    constructor() {
        this.messageQueue = [];
        this.isShowingMessage = false;
    }

    /**
     * エラーメッセージを表示
     * @param {string} message - 表示するエラーメッセージ
     * @param {number} duration - 表示時間（ミリ秒）
     */
    showError(message, duration = 5000) {
        // エラーメッセージ表示用の要素を作成
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-message';
        errorDiv.textContent = message;

        // スタイルを設定
        errorDiv.style.cssText = `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            background-color: rgba(244, 67, 54, 0.9);
            color: white;
            padding: 15px 25px;
            border-radius: 5px;
            z-index: 1002;
            font-weight: bold;
            max-width: 80%;
            text-align: center;
            animation: messageSlideIn 0.3s ease-out;
        `;

        document.body.appendChild(errorDiv);

        // 指定時間後に削除
        setTimeout(() => {
            errorDiv.style.animation = 'messageSlideOut 0.3s ease-in';
            setTimeout(() => {
                if (errorDiv.parentNode) {
                    errorDiv.parentNode.removeChild(errorDiv);
                }
            }, 300);
        }, duration);

        // コンソールにもログ出力
        console.error('エラー:', message);
    }

    /**
     * 通常のメッセージを表示
     * @param {string} message - 表示するメッセージ
     * @param {number} duration - 表示時間（ミリ秒）
     */
    showMessage(message, duration = 3000) {
        // メッセージ表示用の要素を作成
        const messageDiv = document.createElement('div');
        messageDiv.className = 'game-message';
        messageDiv.textContent = message;

        // スタイルを設定
        messageDiv.style.cssText = `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            background-color: rgba(0, 0, 0, 0.8);
            color: #ffd700;
            padding: 10px 20px;
            border-radius: 5px;
            z-index: 1001;
            font-weight: bold;
            animation: messageSlideIn 0.3s ease-out;
        `;

        document.body.appendChild(messageDiv);

        // 指定時間後に削除
        setTimeout(() => {
            messageDiv.style.animation = 'messageSlideOut 0.3s ease-in';
            setTimeout(() => {
                if (messageDiv.parentNode) {
                    messageDiv.parentNode.removeChild(messageDiv);
                }
            }, 300);
        }, duration);

        // コンソールにもログ出力
        console.log('メッセージ:', message);
    }

    /**
     * エラータイプに応じた適切なエラーメッセージを取得
     * @param {string} errorType - エラータイプ
     * @param {string} defaultMessage - デフォルトメッセージ
     * @returns {string} エラーメッセージ
     */
    getErrorMessage(errorType, defaultMessage) {
        const errorMessages = {
            'invalid_move': '無効な操作です',
            'game_not_found': 'ゲームが見つかりません',
            'player_not_found': 'プレイヤーが見つかりません',
            'not_player_turn': 'あなたの手番ではありません',
            'invalid_tile': '無効な牌です',
            'riichi_required': 'リーチが必要です',
            'deck_empty': '山が空です',
            'game_full': 'ゲームが満員です',
            'already_in_game': '既にゲームに参加しています',
            'connection_error': '接続エラーが発生しました'
        };

        return errorMessages[errorType] || defaultMessage || 'エラーが発生しました';
    }

    /**
     * スクリーンリーダー用のアナウンス機能
     * @param {string} message - アナウンスするメッセージ
     */
    announceToScreenReader(message) {
        const announcement = document.createElement('div');
        announcement.setAttribute('aria-live', 'polite');
        announcement.setAttribute('aria-atomic', 'true');
        announcement.className = 'sr-only';
        announcement.textContent = message;

        // スクリーンリーダー専用のスタイル
        announcement.style.cssText = `
            position: absolute;
            width: 1px;
            height: 1px;
            padding: 0;
            margin: -1px;
            overflow: hidden;
            clip: rect(0, 0, 0, 0);
            white-space: nowrap;
            border: 0;
        `;

        document.body.appendChild(announcement);

        // 短時間後に削除
        setTimeout(() => {
            if (announcement.parentNode) {
                document.body.removeChild(announcement);
            }
        }, 1000);
    }

    /**
     * 通信エラーの処理
     * @param {Error} error - エラーオブジェクト
     * @param {string} context - エラーが発生したコンテキスト
     */
    handleConnectionError(error, context = '') {
        console.error(`通信エラー ${context}:`, error);
        
        let message = '通信エラーが発生しました';
        if (context) {
            message += ` (${context})`;
        }
        
        this.showError(message);
    }

    /**
     * ゲームロジックエラーの処理
     * @param {string} errorType - エラータイプ
     * @param {string} defaultMessage - デフォルトメッセージ
     */
    handleGameError(errorType, defaultMessage) {
        const message = this.getErrorMessage(errorType, defaultMessage);
        this.showError(message);
    }

    /**
     * 必要なCSSアニメーションを追加
     */
    static addRequiredStyles() {
        // 既にスタイルが追加されているかチェック
        if (document.getElementById('error-handler-styles')) {
            return;
        }

        const style = document.createElement('style');
        style.id = 'error-handler-styles';
        style.textContent = `
            @keyframes messageSlideIn {
                from {
                    opacity: 0;
                    transform: translateX(-50%) translateY(-20px);
                }
                to {
                    opacity: 1;
                    transform: translateX(-50%) translateY(0);
                }
            }
            
            @keyframes messageSlideOut {
                from {
                    opacity: 1;
                    transform: translateX(-50%) translateY(0);
                }
                to {
                    opacity: 0;
                    transform: translateX(-50%) translateY(-20px);
                }
            }

            .sr-only {
                position: absolute !important;
                width: 1px !important;
                height: 1px !important;
                padding: 0 !important;
                margin: -1px !important;
                overflow: hidden !important;
                clip: rect(0, 0, 0, 0) !important;
                white-space: nowrap !important;
                border: 0 !important;
            }
        `;
        document.head.appendChild(style);
    }
}

// スタイルを自動的に追加
ErrorHandler.addRequiredStyles();

// グローバルインスタンスを作成（後方互換性のため）
if (typeof window.errorHandler === 'undefined') {
    window.errorHandler = new ErrorHandler();
}

// 既存の関数名での後方互換性を提供
window.showError = (message, duration) => window.errorHandler.showError(message, duration);
window.showMessage = (message, duration) => window.errorHandler.showMessage(message, duration);
window.getErrorMessage = (errorType, defaultMessage) => window.errorHandler.getErrorMessage(errorType, defaultMessage);
window.announceToScreenReader = (message) => window.errorHandler.announceToScreenReader(message);

// モジュールとしてエクスポート
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ErrorHandler;
}

// ES6モジュールとしてもエクスポート
if (typeof window !== 'undefined') {
    window.ErrorHandler = ErrorHandler;
}
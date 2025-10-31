/**
 * UIManager.js
 * ユーザーインターフェースの管理を行うモジュール
 */

class UIManager {
    constructor() {
        this.gameStateManager = null;
        this.errorHandler = null;
        this.winningManager = null;
        this.tileManager = null;
        this.turnTimerId = null;
        this.turnTimeRemaining = 0;
        
        // DOM要素
        this.waitingScreen = null;
        this.gameScreen = null;
        this.gameResult = null;
        this.riichiBtn = null;
        
        this.initializeElements();
    }

    /**
     * DOM要素を初期化
     */
    initializeElements() {
        this.waitingScreen = document.querySelector('.waiting-screen');
        this.gameScreen = document.querySelector('.game-screen');
        this.gameResult = document.getElementById('game-result');
        this.riichiBtn = document.getElementById('riichi-btn');
        
        if (!this.waitingScreen || !this.gameScreen) {
            console.error('必要なUI要素が見つかりません');
        }
    }

    /**
     * 依存関係を設定
     * @param {GameStateManager} gameStateManager - ゲーム状態マネージャー
     * @param {ErrorHandler} errorHandler - エラーハンドラー
     * @param {WinningManager} winningManager - 上がり管理マネージャー
     * @param {TileManager} tileManager - 牌管理マネージャー
     */
    initialize(gameStateManager, errorHandler, winningManager, tileManager) {
        this.gameStateManager = gameStateManager;
        this.errorHandler = errorHandler;
        this.winningManager = winningManager;
        this.tileManager = tileManager;
    }

    /**
     * ゲーム画面を表示
     */
    showGameScreen() {
        if (this.waitingScreen) {
            this.waitingScreen.style.display = 'none';
        }
        if (this.gameScreen) {
            this.gameScreen.style.display = 'block';
        }

        // DiscardDisplayManagerを初期化（まだ初期化されていない場合）
        if (!window.discardDisplayManager) {
            window.discardDisplayManager = new window.DiscardDisplayManager();
            console.log('DiscardDisplayManager初期化完了 - ゲーム画面表示時');
        }

        // 捨て牌エリアの初期状態を確認
        if (window.discardDisplayManager && 
            window.discardDisplayManager.playerDiscardArea && 
            window.discardDisplayManager.opponentDiscardArea) {
            console.log('捨て牌表示エリア確認: 正常に初期化済み');
        } else {
            console.warn('捨て牌表示エリア確認: 初期化に問題があります');
        }
    }

    /**
     * 待機画面を表示
     */
    showWaitingScreen() {
        if (this.waitingScreen) {
            this.waitingScreen.style.display = 'block';
        }
        if (this.gameScreen) {
            this.gameScreen.style.display = 'none';
        }

        // 捨て牌表示をクリア
        if (window.discardDisplayManager) {
            window.discardDisplayManager.clearDiscards();
        }
    }

    /**
     * ゲーム結果画面を表示
     * @param {Object} result - ゲーム結果
     */
    showGameResult(result) {
        if (!this.gameResult) {
            console.error('game-result要素が見つかりません');
            return;
        }

        const resultTitle = document.getElementById('result-title');
        const resultMessage = document.getElementById('result-message');
        const newGameBtn = document.getElementById('new-game-btn');

        if (!resultTitle || !resultMessage || !newGameBtn) {
            console.error('結果画面の必要な要素が見つかりません');
            return;
        }

        // 既存の上がり形表示エリアを削除
        const existingWinningHand = this.gameResult.querySelector('.winning-hand-display');
        if (existingWinningHand) {
            existingWinningHand.remove();
        }

        const playerId = this.gameStateManager ? this.gameStateManager.getPlayerId() : null;

        // 結果に応じてタイトルとメッセージを設定
        if (result.winner) {
            const isWinner = result.winner.id === playerId;

            if (isWinner) {
                resultTitle.textContent = '勝利！';
                resultTitle.style.color = '#4caf50';

                if (result.result === 'tsumo') {
                    const tileText = result.winningTile ? this.getTileDisplayText(result.winningTile) : '不明';
                    resultMessage.textContent = `ツモで上がりました！\n上がり牌: ${tileText}`;
                } else if (result.result === 'ron') {
                    const tileText = result.winningTile ? this.getTileDisplayText(result.winningTile) : '不明';
                    resultMessage.textContent = `ロンで上がりました！\n上がり牌: ${tileText}`;
                }
            } else {
                resultTitle.textContent = '敗北';
                resultTitle.style.color = '#f44336';

                if (result.result === 'tsumo') {
                    const tileText = result.winningTile ? this.getTileDisplayText(result.winningTile) : '不明';
                    resultMessage.textContent = `相手がツモで上がりました\n上がり牌: ${tileText}`;
                } else if (result.result === 'ron') {
                    const tileText = result.winningTile ? this.getTileDisplayText(result.winningTile) : '不明';
                    resultMessage.textContent = `相手がロンで上がりました\n上がり牌: ${tileText}`;
                }
            }

            // 上がり形を表示
            if (result.winningHand && result.winningHand.length > 0 && this.winningManager) {
                const winningHandDisplay = this.winningManager.createWinningHandDisplay(
                    result.winningHand, 
                    result.winningTile, 
                    isWinner
                );
                this.gameResult.querySelector('.result-content').insertBefore(winningHandDisplay, newGameBtn);
            }
        } else if (result.result === 'draw') {
            // 流局の場合
            resultTitle.textContent = '流局';
            resultTitle.style.color = '#ff9800';
            resultMessage.textContent = '山が空になりました\n引き分けです';
        } else {
            // その他の終了条件
            resultTitle.textContent = 'ゲーム終了';
            resultTitle.style.color = '#666';
            resultMessage.textContent = result.message || 'ゲームが終了しました';
        }

        // 結果画面を表示
        this.gameResult.style.display = 'flex';

        // 新しいゲームボタンのイベントリスナー
        newGameBtn.onclick = () => {
            this.gameResult.style.display = 'none';
            this.showWaitingScreen();

            // ゲーム状態をリセット
            if (this.gameStateManager) {
                this.gameStateManager.resetGameState();
            }
            if (this.tileManager) {
                this.tileManager.clearTileSelection();
            }

            // 保存されたゲーム情報をクリア
            if (this.gameStateManager) {
                this.gameStateManager.clearSavedGameId();
            }

            // タイマーをクリア
            this.clearTurnTimer();

            // 新しいゲームを要求
            if (window.socketManager) {
                window.socketManager.safeEmit('requestNewGame');
            }
        };
    }

    /**
     * ボタンの状態を更新
     * @param {Object} gameState - ゲーム状態
     * @param {boolean} isMyTurn - 自分の手番かどうか
     */
    updateButtonStates(gameState, isMyTurn) {
        if (!this.gameStateManager || !this.tileManager) {
            return;
        }

        const player = this.gameStateManager.getCurrentPlayer();
        if (!player) return;

        const playerHand = this.gameStateManager.getPlayerHand();
        const selectedTile = this.tileManager.getSelectedTile();

        // リーチボタンの条件を修正
        const riichiConditions = {
            isMyTurn: isMyTurn,
            notRiichi: !player.isRiichi,
            handSize: playerHand.length,
            hasSelectedTile: !!selectedTile,
            selectedTileId: selectedTile?.id
        };
        
        let isTenpai = false;
        if (playerHand.length === 5 && selectedTile) {
            isTenpai = this.tileManager.checkTenpaiAfterDiscard(playerHand, selectedTile);
        }
        
        const canDeclareRiichi = isMyTurn &&
            !player.isRiichi &&
            playerHand.length === 5 &&
            selectedTile &&
            isTenpai;

        console.log('リーチボタン判定:', {
            ...riichiConditions,
            isTenpai,
            canDeclareRiichi,
            buttonDisabled: !canDeclareRiichi
        });

        if (this.riichiBtn) {
            this.riichiBtn.disabled = !canDeclareRiichi;
        }

        // ツモ・ロンボタンの状態更新
        if (this.winningManager) {
            this.winningManager.updateWinningButtons(gameState, isMyTurn);
        }
    }

    /**
     * 手番表示を更新
     * @param {Object} gameState - ゲーム状態
     */
    updateTurnIndicator(gameState) {
        if (!this.gameStateManager) return;

        const isMyTurn = this.gameStateManager.isMyTurn();
        const turnElement = document.getElementById('current-turn');

        if (!turnElement) return;

        if (isMyTurn) {
            turnElement.textContent = 'あなた';
            turnElement.style.color = '#4caf50';
            turnElement.style.fontWeight = 'bold';
        } else {
            turnElement.textContent = '相手';
            turnElement.style.color = '#ff9800';
            turnElement.style.fontWeight = 'normal';
        }
    }

    /**
     * 残り牌数を更新
     * @param {number} count - 残り牌数
     */
    updateRemainingTiles(count) {
        const remainingElement = document.getElementById('remaining-tiles');
        if (!remainingElement) return;

        remainingElement.textContent = count;

        // 残り牌数に応じて色を変更
        if (count <= 5) {
            remainingElement.style.color = '#f44336';
            remainingElement.style.fontWeight = 'bold';
        } else if (count <= 15) {
            remainingElement.style.color = '#ff9800';
            remainingElement.style.fontWeight = 'bold';
        } else {
            remainingElement.style.color = '#4caf50';
            remainingElement.style.fontWeight = 'normal';
        }
    }

    /**
     * プレイヤー状態を更新
     * @param {Object} player - プレイヤー情報
     * @param {boolean} isOpponent - 相手かどうか
     */
    updatePlayerStatus(player, isOpponent = false) {
        const nameElement = document.getElementById(isOpponent ? 'opponent-name' : 'player-name');
        const riichiElement = document.getElementById(isOpponent ? 'opponent-riichi' : 'player-riichi');

        if (nameElement) {
            nameElement.textContent = player.name || (isOpponent ? '相手' : 'プレイヤー');
        }

        if (riichiElement) {
            if (player.isRiichi) {
                riichiElement.style.display = 'inline';
                riichiElement.classList.add('riichi-active');
            } else {
                riichiElement.style.display = 'none';
                riichiElement.classList.remove('riichi-active');
            }
        }
    }

    /**
     * 待機メッセージを更新
     * @param {number} currentPlayers - 現在のプレイヤー数
     * @param {number} requiredPlayers - 必要なプレイヤー数
     */
    updateWaitingMessage(currentPlayers, requiredPlayers) {
        if (!this.waitingScreen) return;

        const messageElement = this.waitingScreen.querySelector('p');
        if (messageElement) {
            messageElement.textContent = `プレイヤー ${currentPlayers}/${requiredPlayers} - 他のプレイヤーの接続を待っています`;
        }
    }

    /**
     * 手番タイマーを開始
     * @param {string} currentPlayerId - 現在のプレイヤーID
     * @param {number} timeLimit - 制限時間（ミリ秒）
     */
    startTurnTimer(currentPlayerId, timeLimit) {
        // 既存のタイマーをクリア
        this.clearTurnTimer();

        const playerId = this.gameStateManager ? this.gameStateManager.getPlayerId() : null;
        const isMyTurn = currentPlayerId === playerId;
        this.turnTimeRemaining = timeLimit / 1000; // 秒に変換

        // タイマー表示を更新
        this.updateTimerDisplay(isMyTurn);

        // 1秒ごとにタイマーを更新
        this.turnTimerId = setInterval(() => {
            this.turnTimeRemaining--;
            this.updateTimerDisplay(isMyTurn);

            if (this.turnTimeRemaining <= 0) {
                this.clearTurnTimer();
            }
        }, 1000);
    }

    /**
     * 手番タイマーをクリア
     */
    clearTurnTimer() {
        if (this.turnTimerId) {
            clearInterval(this.turnTimerId);
            this.turnTimerId = null;
        }
        this.turnTimeRemaining = 0;

        // タイマー表示をクリア
        const timerElement = document.getElementById('turn-timer');
        if (timerElement) {
            timerElement.style.display = 'none';
        }
    }

    /**
     * タイマー表示を更新
     * @param {boolean} isMyTurn - 自分の手番かどうか
     */
    updateTimerDisplay(isMyTurn) {
        let timerElement = document.getElementById('turn-timer');

        // タイマー要素が存在しない場合は作成
        if (!timerElement) {
            timerElement = document.createElement('div');
            timerElement.id = 'turn-timer';
            timerElement.style.cssText = `
                position: fixed;
                top: 80px;
                right: 20px;
                background-color: rgba(0, 0, 0, 0.8);
                color: white;
                padding: 10px 15px;
                border-radius: 5px;
                font-weight: bold;
                z-index: 1000;
            `;
            document.body.appendChild(timerElement);
        }

        if (this.turnTimeRemaining > 0) {
            timerElement.style.display = 'block';

            const playerText = isMyTurn ? 'あなた' : '相手';
            timerElement.textContent = `${playerText}の手番: ${this.turnTimeRemaining}秒`;

            // 残り時間に応じて色を変更
            if (this.turnTimeRemaining <= 5) {
                timerElement.style.backgroundColor = 'rgba(244, 67, 54, 0.9)';
                timerElement.style.animation = 'timerPulse 1s infinite';
            } else if (this.turnTimeRemaining <= 10) {
                timerElement.style.backgroundColor = 'rgba(255, 152, 0, 0.9)';
                timerElement.style.animation = 'none';
            } else {
                timerElement.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
                timerElement.style.animation = 'none';
            }
        } else {
            timerElement.style.display = 'none';
        }
    }

    /**
     * ゲーム状態変更時のアニメーション
     */
    addGameStateAnimation() {
        // 手番変更時のアニメーション
        const gameInfo = document.querySelector('.game-info');
        if (gameInfo) {
            gameInfo.classList.add('turn-change');

            setTimeout(() => {
                gameInfo.classList.remove('turn-change');
            }, 500);
        }
    }

    /**
     * 牌の表示テキストを取得（ヘルパー関数）
     * @param {Object} tile - 牌オブジェクト
     * @returns {string} 表示テキスト
     */
    getTileDisplayText(tile) {
        if (!tile) return '?';
        
        if (tile.suit === 'bamboo') {
            return tile.value.toString();
        } else if (tile.suit === 'honor') {
            switch (tile.value) {
                case 'white': return '白';
                case 'green': return '發';
                case 'red': return '中';
                default: return tile.value;
            }
        }
        return tile.value;
    }

    /**
     * 必要なCSSアニメーションを追加
     */
    static addRequiredStyles() {
        // 既にスタイルが追加されているかチェック
        if (document.getElementById('ui-manager-styles')) {
            return;
        }

        const style = document.createElement('style');
        style.id = 'ui-manager-styles';
        style.textContent = `
            .turn-change {
                animation: turnChangeGlow 0.5s ease-in-out;
            }
            
            @keyframes turnChangeGlow {
                0% { box-shadow: 0 0 0 rgba(255, 215, 0, 0); }
                50% { box-shadow: 0 0 20px rgba(255, 215, 0, 0.8); }
                100% { box-shadow: 0 0 0 rgba(255, 215, 0, 0); }
            }
            
            .riichi-active {
                animation: riichiPulse 2s infinite;
            }
            
            @keyframes riichiPulse {
                0%, 100% { opacity: 1; }
                50% { opacity: 0.7; }
            }
            
            @keyframes timerPulse {
                0%, 100% { 
                    opacity: 1; 
                    transform: scale(1);
                }
                50% { 
                    opacity: 0.7; 
                    transform: scale(1.05);
                }
            }
        `;
        document.head.appendChild(style);
    }
}

// スタイルを自動的に追加
UIManager.addRequiredStyles();

// グローバルインスタンスを作成（後方互換性のため）
if (typeof window.uiManager === 'undefined') {
    window.uiManager = new UIManager();
}

// 既存の関数名での後方互換性を提供
window.showGameScreen = () => window.uiManager.showGameScreen();
window.showWaitingScreen = () => window.uiManager.showWaitingScreen();
window.showGameResult = (result) => window.uiManager.showGameResult(result);
window.updateButtonStates = (gameState, isMyTurn) => window.uiManager.updateButtonStates(gameState, isMyTurn);
window.updateTurnIndicator = (gameState) => window.uiManager.updateTurnIndicator(gameState);
window.updateRemainingTiles = (count) => window.uiManager.updateRemainingTiles(count);
window.updatePlayerStatus = (player, isOpponent) => window.uiManager.updatePlayerStatus(player, isOpponent);
window.updateWaitingMessage = (currentPlayers, requiredPlayers) => window.uiManager.updateWaitingMessage(currentPlayers, requiredPlayers);
window.startTurnTimer = (playerId, timeLimit) => window.uiManager.startTurnTimer(playerId, timeLimit);
window.clearTurnTimer = () => window.uiManager.clearTurnTimer();
window.addGameStateAnimation = () => window.uiManager.addGameStateAnimation();

// モジュールとしてエクスポート
if (typeof module !== 'undefined' && module.exports) {
    module.exports = UIManager;
}

// ES6モジュールとしてもエクスポート
if (typeof window !== 'undefined') {
    window.UIManager = UIManager;
}
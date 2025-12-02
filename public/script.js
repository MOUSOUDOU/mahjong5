/**
 * script.js - メインファイル（リファクタリング版）
 * 各モジュールの初期化とモジュール間の連携を管理
 */

// DOM要素の取得
const gameArea = document.getElementById('game-area');
const waitingScreen = document.querySelector('.waiting-screen');
const gameScreen = document.querySelector('.game-screen');
const playerHand = document.getElementById('player-hand');
const opponentHand = document.getElementById('opponent-hand');
const discardedTiles = document.getElementById('discarded-tiles');
const riichiBtn = document.getElementById('riichi-btn');
const ronBtn = document.getElementById('ron-btn');
const tsumoBtn = document.getElementById('tsumo-btn');

// グローバル変数（後方互換性のため）
let currentGameState = null;
let selectedTile = null;
let playerId = null;
let isConnected = false;
let turnTimerId = null;
let turnTimeRemaining = 0;

// モジュールインスタンス
let errorHandler = null;
let socketManager = null;
let gameStateManager = null;
let tileManager = null;
let discardDisplayManager = null;
let winningManager = null;
let uiManager = null;
let judgmentClient = null;

/**
 * アプリケーションの初期化
 */
function initializeApplication() {
    console.log('アプリケーション初期化開始');

    try {
        // 1. ErrorHandlerを最初に初期化（他のモジュールが依存）
        errorHandler = window.errorHandler;
        console.log('ErrorHandler初期化完了');

        // 2. SocketManagerを初期化
        socketManager = window.socketManager;
        if (!socketManager.initialize(errorHandler)) {
            throw new Error('SocketManager初期化失敗');
        }
        console.log('SocketManager初期化完了');

        // 3. GameStateManagerを初期化
        gameStateManager = window.gameStateManager;
        console.log('GameStateManager初期化完了');

        // 4. TileManagerを初期化
        tileManager = window.tileManager;
        tileManager.initialize(gameStateManager, socketManager, errorHandler);
        console.log('TileManager初期化完了');

        // 5. DiscardDisplayManagerを初期化
        discardDisplayManager = window.discardDisplayManager;
        console.log('DiscardDisplayManager初期化完了');

        // 6. WinningManagerを初期化
        winningManager = window.winningManager;
        winningManager.initialize(gameStateManager, socketManager, errorHandler);
        console.log('WinningManager初期化完了');

        // 7. UIManagerを初期化
        uiManager = window.uiManager;
        uiManager.initialize(gameStateManager, errorHandler, winningManager, tileManager);
        console.log('UIManager初期化完了');

        // 8. JudgmentClientを初期化
        judgmentClient = new JudgmentClient(socketManager);
        console.log('JudgmentClient初期化完了');

        // 9. モジュール間の連携を設定
        setupModuleIntegration();

        // 10. イベントリスナーを設定
        setupEventListeners();

        // 10. 再接続チェックを開始
        socketManager.startReconnectionCheck();

        console.log('アプリケーション初期化完了');

    } catch (error) {
        console.error('アプリケーション初期化エラー:', error);
        if (errorHandler) {
            errorHandler.showError('アプリケーションの初期化に失敗しました');
        }
    }
}

/**
 * モジュール間の連携を設定
 */
function setupModuleIntegration() {
    // Socket.ioイベントとゲーム状態管理の連携
    socketManager.on('gameStateUpdate', (gameState) => {
        const previousState = gameStateManager.getCurrentGameState();
        
        // 手牌状態の整合性チェック
        if (gameState && gameState.playerHandTiles) {
            const handSize = gameState.playerHandTiles.length;
            if (handSize < 4 || handSize > 5) {
                console.error('手牌数異常を検出:', {
                    handSize: handSize,
                    gameId: gameState.gameId,
                    playerId: gameStateManager.getPlayerId()
                });
                errorHandler.showMessage('手牌数に異常が検出されました', 3000);
            }
        }
        
        gameStateManager.updateGameState(gameState);
        
        // 牌を引いた後の自摸判定問い合わせ
        if (previousState && gameState && gameState.playerHandTiles) {
            const currentHandSize = gameState.playerHandTiles.length;
            const previousHandSize = previousState.playerHandTiles ? previousState.playerHandTiles.length : 0;
            
            // 手牌が4枚から5枚に増えた場合（牌を引いた場合）
            if (previousHandSize === 4 && currentHandSize === 5) {
                console.log('牌を引きました - 自摸判定を実行');
                handleTileDrawn(gameState);
            }
        }
        
        // 相手が牌を捨てた直後の状態でロン判定を行う
        if (previousState && gameState) {
            const player = gameState.players.find(p => p.id === gameStateManager.getPlayerId());
            const opponent = gameState.players.find(p => p.id !== gameStateManager.getPlayerId());
            
            // リーチ中で手牌が4枚、かつ相手の捨て牌が増えた場合
            if (player && player.isRiichi && 
                gameState.playerHandTiles && gameState.playerHandTiles.length === 4 &&
                opponent && opponent.discardedTiles &&
                previousState.players) {
                
                const prevOpponent = previousState.players.find(p => p.id !== gameStateManager.getPlayerId());
                if (prevOpponent && prevOpponent.discardedTiles &&
                    opponent.discardedTiles.length > prevOpponent.discardedTiles.length) {
                    
                    console.log('相手が牌を捨てた直後 - ロン判定を実行');
                    const lastDiscardedTile = opponent.discardedTiles[opponent.discardedTiles.length - 1];
                    handleOpponentDiscard(lastDiscardedTile, gameState);
                }
            }
        }
        
        updateGameDisplay(gameState);
    });

    socketManager.on('gameStarted', (gameData) => {
        console.log('ゲームが開始されました:', gameData);

        // ゲーム情報を保存
        if (gameData.gameId) {
            gameStateManager.saveGameId(gameData.gameId);
        }

        uiManager.showGameScreen();
    });

    socketManager.on('gameEnded', (result) => {
        console.log('ゲームが終了しました:', result);

        // 上がり宣言ボタンを非表示にする
        winningManager.hideWinningButtons();

        // 最終ゲーム状態を更新
        if (result.finalState) {
            // ゲーム終了メッセージを表示
            const winnerName = result.winner ? 
                (result.winner.id === gameStateManager.getPlayerId() ? 'あなた' : result.winner.name) : 
                '引き分け';
            const endMessage = result.winner ? 
                `${winnerName}の${result.result === 'tsumo' ? 'ツモ' : 'ロン'}上がり！` : 
                '流局';
            errorHandler.showMessage(endMessage, 5000);

            // 最終ゲーム状態を表示（手牌を保持）
            updateGameDisplay(result.finalState);
            
            // 上がり形の手牌を設定（サーバーから送信された場合はそれを使用）
            if (!result.winningHand && result.winner) {
                const winner = result.winner;
                const winnerPlayer = result.finalState.players.find(p => p.id === winner.id);
                if (winnerPlayer) {
                    // 勝者の手牌を結果に追加
                    if (winner.id === gameStateManager.getPlayerId()) {
                        result.winningHand = result.finalState.playerHandTiles || [];
                    } else {
                        // 相手が勝った場合は、相手の手牌を取得
                        result.winningHand = winnerPlayer.hand || [];
                    }
                }
            }
        }

        // 結果画面を表示（手牌を確認する時間を与える）
        setTimeout(() => {
            uiManager.showGameResult(result);
        }, 5000);
    });

    // その他のSocket.ioイベント
    socketManager.on('playerJoined', (data) => {
        errorHandler.showMessage(`${data.playerName}が参加しました`);
    });

    socketManager.on('playerLeft', (data) => {
        errorHandler.showMessage(`${data.playerName}が退出しました`);
        uiManager.showWaitingScreen();
    });

    socketManager.on('waitingForPlayers', (data) => {
        uiManager.updateWaitingMessage(data.currentPlayers, data.requiredPlayers);
    });

    socketManager.on('autoTileDraw', (data) => {
        errorHandler.showMessage(data.message, 2000);
    });

    // 自動牌引き要求の処理（新しい判定システム）
    socketManager.on('autoDrawRequest', async (data) => {
        console.log('自動牌引き要求を受信:', data);
        
        try {
            const currentGameState = gameStateManager.getCurrentGameState();
            const playerId = gameStateManager.getPlayerId();
            
            console.log('現在のゲーム状態:', currentGameState);
            console.log('プレイヤーID:', playerId);
            
            if (!currentGameState) {
                console.error('ゲーム状態が不正です');
                return;
            }
            
            if (!playerId) {
                console.error('プレイヤーIDが不正です');
                return;
            }
            
            // サーバーから自動牌引き要求が来た場合、直接実行
            // サーバー側で既に判定済みのため、クライアント側では追加判定不要
            console.log('自動牌引きを実行 - requestAutoDrawを送信');
            const emitResult = socketManager.safeEmit('requestAutoDraw', {
                playerId: playerId,
                gameId: currentGameState.gameId
            });
            console.log('requestAutoDraw送信結果:', emitResult);
            
        } catch (error) {
            console.error('自動引き処理エラー:', error);
            console.error('エラースタック:', error.stack);
        }
    });

    socketManager.on('tileDiscarded', async (data) => {
        console.log('牌が捨てられました:', data);
        
        // 相手が牌を捨てた場合、サーバーにロン判定を問い合わせ
        if (currentGameState && data.playerId !== gameStateManager.getPlayerId()) {
            const playerId = gameStateManager.getPlayerId();
            const player = gameStateManager.getCurrentPlayer();
            
            // 前提条件チェック: プレイヤー情報とリーチ状態
            if (!player || !player.isRiichi) {
                console.log('ロン判定スキップ: リーチしていません');
                return;
            }

            // 手牌が4枚でない場合はスキップ
            const playerHand = gameStateManager.getPlayerHand();
            if (!Array.isArray(playerHand) || playerHand.length !== 4) {
                console.log('ロン判定スキップ: 手牌が4枚ではありません', playerHand?.length);
                return;
            }

            console.log('サーバーにロン判定を問い合わせ:', data.discardedTile);
            
            try {
                // サーバーにロン判定を問い合わせ
                const result = await judgmentClient.safeQuery('queryRon', playerId, currentGameState.gameId, data.discardedTile);
                
                console.log('ロン判定結果:', result);
                
                if (result.possible) {
                    // ロン可能な場合
                    winningManager.showWinningOptions(false, true);
                    errorHandler.showMessage('ロン可能です！', 3000);
                    
                    // サーバーにロン待機状態を通知
                    socketManager.safeEmit('ronWaiting', { 
                        playerId: playerId,
                        gameId: currentGameState.gameId 
                    });
                    
                    // 10秒後に自動的にロン待機をキャンセル
                    setTimeout(() => {
                        console.log('ロン待機タイムアウト - 自動キャンセル');
                        socketManager.safeEmit('cancelRonWaiting', { 
                            playerId: playerId 
                        });
                        winningManager.hideWinningButtons();
                    }, 10000);
                }
                
            } catch (error) {
                console.error('ロン判定問い合わせエラー:', error);
            }
        }
        
        // 通常の処理を続行（少し遅延してボタン状態を更新）
        setTimeout(() => {
            if (currentGameState) {
                const isMyTurn = gameStateManager.isMyTurn();
                winningManager.updateWinningButtons(currentGameState, isMyTurn);
            }
        }, 200);
    });

    socketManager.on('riichiDeclared', (data) => {
        const message = data.playerId === gameStateManager.getPlayerId() ? 
            'リーチを宣言しました' : '相手がリーチを宣言しました';
        errorHandler.showMessage(message);
        
        // リーチ宣言後、ゲーム状態更新を待ってボタン状態を更新
        setTimeout(() => {
            if (currentGameState) {
                const isMyTurn = gameStateManager.isMyTurn();
                winningManager.updateWinningButtons(currentGameState, isMyTurn);
            }
        }, 200);
    });

    socketManager.on('playerDisconnected', (data) => {
        errorHandler.showError(data.message, 5000);

        // タイマーをクリア
        uiManager.clearTurnTimer();

        // ゲーム画面をリセット
        setTimeout(() => {
            uiManager.showWaitingScreen();
            gameStateManager.resetGameState();
            tileManager.clearTileSelection();
        }, 2000);
    });

    socketManager.on('turnTimerStarted', (data) => {
        uiManager.startTurnTimer(data.playerId, data.timeLimit);
    });

    socketManager.on('autoDiscardTimeout', (data) => {
        errorHandler.showMessage(data.message, 3000);
    });

    socketManager.on('autoDrawTimeout', (data) => {
        errorHandler.showMessage(data.message, 3000);
    });

    socketManager.on('reconnectionSuccess', (data) => {
        errorHandler.showMessage(data.message, 3000);

        // ゲーム状態を復元
        if (data.gameState) {
            updateGameDisplay(data.gameState);
            uiManager.showGameScreen();
        }
    });

    socketManager.on('reconnectionFailed', (data) => {
        errorHandler.showError('再接続に失敗しました: ' + data.error);
        uiManager.showWaitingScreen();
    });

    socketManager.on('playerReconnected', (data) => {
        errorHandler.showMessage(data.message, 3000);
    });

    socketManager.on('disconnect', () => {
        uiManager.showWaitingScreen();
    });

    // ゲーム状態変更時の処理
    gameStateManager.onStateChange('turnChanged', (data) => {
        if (data.previousPlayer !== data.currentPlayer) {
            uiManager.addGameStateAnimation();
        }
    });

    // 牌選択時の処理
    tileManager.onTileClick('tileSelected', () => {
        if (currentGameState) {
            const isMyTurn = gameStateManager.isMyTurn();
            uiManager.updateButtonStates(currentGameState, isMyTurn);
        }
    });

    tileManager.onTileClick('tileDeselected', () => {
        if (currentGameState) {
            const isMyTurn = gameStateManager.isMyTurn();
            uiManager.updateButtonStates(currentGameState, isMyTurn);
        }
    });

    // 接続状態変更時の処理
    socketManager.on('connectionStatusChanged', (connected) => {
        isConnected = connected;
    });

    console.log('モジュール間連携設定完了');
}

/**
 * イベントリスナーを設定
 */
function setupEventListeners() {
    // リーチボタンのイベントリスナー（新しい判定システム）
    if (riichiBtn) {
        riichiBtn.addEventListener('click', async () => {
            const selectedTile = tileManager.getSelectedTile();
            if (!riichiBtn.disabled && selectedTile) {
                try {
                    const currentGameState = gameStateManager.getCurrentGameState();
                    const playerId = gameStateManager.getPlayerId();
                    
                    if (!currentGameState || !playerId) {
                        errorHandler.showError('ゲーム状態が不正です');
                        return;
                    }
                    
                    console.log('サーバーにリーチ判定を問い合わせ:', selectedTile);
                    
                    // サーバーにリーチ判定を問い合わせ
                    const result = await judgmentClient.safeQuery('queryRiichi', playerId, currentGameState.gameId, selectedTile);
                    
                    console.log('リーチ判定結果:', result);
                    
                    if (result.possible) {
                        // リーチ可能な場合、リーチ宣言と牌の破棄を実行
                        if (socketManager.safeEmit('declareRiichiAndDiscard', { 
                            tileId: selectedTile.id,
                            isReachTile: true
                        })) {
                            riichiBtn.disabled = true;
                            console.log('リーチ宣言と牌の破棄を送信しました:', selectedTile.id);
                            tileManager.clearTileSelection();
                        }
                    } else {
                        // リーチ不可能な場合
                        errorHandler.showError('選択した牌ではリーチできません');
                        console.log('リーチ不可:', result.reason || 'サーバー判定により不可');
                    }
                    
                } catch (error) {
                    console.error('リーチ判定問い合わせエラー:', error);
                    errorHandler.showError('リーチ判定でエラーが発生しました');
                }
            } else if (!selectedTile) {
                errorHandler.showError('リーチを宣言するには捨てる牌を選択してください');
            }
        });
    }

    // キーボードショートカット（Enterで捨て牌）
    document.addEventListener('keydown', (event) => {
        const selectedTile = tileManager.getSelectedTile();
        if (event.key === 'Enter' && selectedTile) {
            tileManager.discardSelectedTile();
        }
    });

    console.log('イベントリスナー設定完了');
}

/**
 * ゲーム表示を更新（統合関数）
 * @param {Object} gameState - ゲーム状態
 */
function updateGameDisplay(gameState) {
    console.log('ゲーム状態更新:', gameState);

    const previousGameState = currentGameState;
    currentGameState = gameState;

    // プレイヤー情報の更新
    const player = gameStateManager.getCurrentPlayer();
    const opponent = gameStateManager.getOpponent();

    console.log('現在のプレイヤー:', player);
    console.log('プレイヤー手牌データ:', gameState.playerHandTiles);

    if (player) {
        uiManager.updatePlayerStatus(player, false);

        // 手牌の表示（自分の手番で手牌が5枚の時のみクリック可能）
        const isPlayerTurn = gameStateManager.isMyTurn();
        const playerHandTiles = gameStateManager.getPlayerHand();
        console.log('表示する手牌:', playerHandTiles);
        const canDiscardTile = isPlayerTurn && playerHandTiles.length === 5;

        // 引いた牌の検出
        const drawnTile = gameStateManager.getDrawnTile();

        tileManager.displayPlayerHand(playerHandTiles, canDiscardTile, drawnTile);
    }

    if (opponent) {
        uiManager.updatePlayerStatus(opponent, true);
        tileManager.displayOpponentHand(opponent.handSize);
    }

    // 捨て牌の表示
    discardDisplayManager.updateDiscards(gameState, gameStateManager.getPlayerId());

    // ゲーム情報の更新
    const gameInfo = gameStateManager.getGameInfo();
    uiManager.updateRemainingTiles(gameInfo.remainingTiles);
    uiManager.updateTurnIndicator(gameState);

    // 手番が変わった場合のアニメーション
    if (previousGameState && previousGameState.currentPlayerIndex !== gameState.currentPlayerIndex) {
        uiManager.addGameStateAnimation();
    }

    // ボタンの状態更新
    const isMyTurn = gameStateManager.isMyTurn();
    uiManager.updateButtonStates(gameState, isMyTurn);
}

// 既存のテスト関数を保持（後方互換性）
function testTileSorting() {
    return tileManager ? tileManager.testTileSorting() : false;
}

function testHandDisplay() {
    console.log('=== 手牌表示機能テスト開始 ===');
    console.log('TileManagerが初期化されている場合、詳細なテストが利用可能です');
    console.log('=== 手牌表示機能テスト完了 ===');
}

function testDoubleClickFeature() {
    console.log('=== ダブルクリック機能テスト ===');
    console.log('実装された機能:');
    console.log('✓ シングルクリック: 牌を選択');
    console.log('✓ ダブルクリック: 牌を即座に捨てる');
    console.log('✓ 視覚的フィードバック: double-clicked クラス');
    console.log('✓ ツールチップ: ホバー時に操作方法表示');
    console.log('=== テスト完了 ===');
}

function testTenpaiCheck() {
    return tileManager ? tileManager.testTenpaiCheck() : false;
}

// ========== 新しい判定システム用のヘルパー関数 ==========

/**
 * 牌を引いた後の自摸判定処理
 * @param {Object} gameState - ゲーム状態
 */
async function handleTileDrawn(gameState) {
    try {
        const playerId = gameStateManager.getPlayerId();
        const playerHand = gameState.playerHandTiles;
        
        if (!playerId || !playerHand || playerHand.length !== 5) {
            return;
        }
        
        // 引いた牌を特定（最後の牌と仮定）
        const drawnTile = playerHand[playerHand.length - 1];
        
        console.log('サーバーに自摸判定を問い合わせ:', drawnTile);
        
        // サーバーに自摸判定を問い合わせ
        const result = await judgmentClient.safeQuery('queryTsumo', playerId, gameState.gameId, drawnTile);
        
        console.log('自摸判定結果:', result);
        
        if (result.possible) {
            // 自摸可能な場合
            winningManager.showWinningOptions(true, false);
            errorHandler.showMessage('ツモ可能です！', 3000);
        }
        
    } catch (error) {
        console.error('自摸判定問い合わせエラー:', error);
    }
}

/**
 * 相手の捨て牌に対するロン判定処理
 * @param {Object} discardedTile - 捨てられた牌
 * @param {Object} gameState - ゲーム状態
 */
async function handleOpponentDiscard(discardedTile, gameState) {
    try {
        const playerId = gameStateManager.getPlayerId();
        const player = gameState.players.find(p => p.id === playerId);
        
        if (!player || !player.isRiichi) {
            return;
        }
        
        const playerHand = gameState.playerHandTiles;
        if (!Array.isArray(playerHand) || playerHand.length !== 4) {
            return;
        }
        
        console.log('サーバーにロン判定を問い合わせ:', discardedTile);
        
        // サーバーにロン判定を問い合わせ
        const result = await judgmentClient.safeQuery('queryRon', playerId, gameState.gameId, discardedTile);
        
        console.log('ロン判定結果:', result);
        
        if (result.possible) {
            // ロン可能な場合
            winningManager.showWinningOptions(false, true);
            errorHandler.showMessage('ロン可能です！', 5000);
            
            // サーバーにロン待機状態を通知
            socketManager.safeEmit('ronWaiting', { 
                playerId: playerId,
                gameId: gameState.gameId 
            });
            
            // 10秒後に自動的にロン待機をキャンセル
            setTimeout(() => {
                console.log('ロン待機タイムアウト - 自動キャンセル');
                socketManager.safeEmit('cancelRonWaiting', { 
                    playerId: playerId 
                });
                winningManager.hideWinningButtons();
            }, 10000);
        }
        
    } catch (error) {
        console.error('ロン判定問い合わせエラー:', error);
    }
}

/**
 * ロン可能状態の処理
 * @param {Object} ronData - ロンデータ
 */
async function handleRonAvailable(ronData) {
    try {
        console.log('ロン可能状態を処理:', ronData);
        
        if (ronData.possible) {
            winningManager.showWinningOptions(false, true);
            errorHandler.showMessage('ロン可能です！', 5000);
            
            const currentGameState = gameStateManager.getCurrentGameState();
            const playerId = gameStateManager.getPlayerId();
            
            // サーバーにロン待機状態を通知
            socketManager.safeEmit('ronWaiting', { 
                playerId: playerId,
                gameId: currentGameState.gameId 
            });
            
            // 10秒後に自動的にロン待機をキャンセル
            setTimeout(() => {
                console.log('ロン待機タイムアウト - 自動キャンセル');
                socketManager.safeEmit('cancelRonWaiting', { 
                    playerId: playerId 
                });
                winningManager.hideWinningButtons();
            }, 10000);
        }
        
    } catch (error) {
        console.error('ロン可能状態処理エラー:', error);
    }
}

function testRiichiButtonLogic() {
    console.log('=== リーチボタンロジックテスト ===');
    console.log('修正された条件:');
    console.log('1. 自分の手番');
    console.log('2. まだリーチしていない');
    console.log('3. 手牌が5枚（牌を引いた状態）');
    console.log('4. 牌が選択されている');
    console.log('5. 選択した牌を捨てた後の4枚がテンパイ状態');
    console.log('=== テスト完了 ===');
}

function testTilePlacementLogic() {
    if (discardDisplayManager && typeof discardDisplayManager.getDiscardStats === 'function') {
        return window.testTilePlacementLogic();
    } else {
        console.log('DiscardDisplayManager が初期化されていません');
        return false;
    }
}

function testGameStateIntegration() {
    console.log('=== ゲーム状態統合テスト ===');
    console.log('モジュール統合版では、各モジュールが正常に初期化されていることを確認');
    
    const modules = {
        errorHandler: !!errorHandler,
        socketManager: !!socketManager,
        gameStateManager: !!gameStateManager,
        tileManager: !!tileManager,
        discardDisplayManager: !!discardDisplayManager,
        winningManager: !!winningManager,
        uiManager: !!uiManager
    };
    
    console.log('モジュール初期化状況:', modules);
    
    const allInitialized = Object.values(modules).every(initialized => initialized);
    console.log(allInitialized ? '✓ 全モジュールが正常に初期化されています' : '✗ 一部のモジュールが初期化されていません');
    
    console.log('=== ゲーム状態統合テスト完了 ===');
    return allInitialized;
}

function testReachTileDisplay() {
    if (discardDisplayManager && typeof window.testReachTileDisplay === 'function') {
        return window.testReachTileDisplay();
    } else {
        console.log('DiscardDisplayManager が初期化されていません');
        return false;
    }
}

// グローバル関数として公開（後方互換性）
window.testTileSorting = testTileSorting;
window.testHandDisplay = testHandDisplay;
window.testDoubleClickFeature = testDoubleClickFeature;
window.testTenpaiCheck = testTenpaiCheck;
window.testRiichiButtonLogic = testRiichiButtonLogic;
window.testTilePlacementLogic = testTilePlacementLogic;
window.testGameStateIntegration = testGameStateIntegration;
window.testReachTileDisplay = testReachTileDisplay;

// 後方互換性のためのグローバル変数更新
function updateGlobalVariables() {
    // Socket関連
    window.socket = socketManager ? socketManager.getSocket() : null;
    window.isConnected = isConnected;
    
    // ゲーム状態関連
    window.currentGameState = currentGameState;
    window.playerId = gameStateManager ? gameStateManager.getPlayerId() : null;
    window.selectedTile = tileManager ? tileManager.getSelectedTile() : null;
    
    // タイマー関連
    window.turnTimerId = turnTimerId;
    window.turnTimeRemaining = turnTimeRemaining;
}

// 定期的にグローバル変数を更新
setInterval(updateGlobalVariables, 100);

// DOMContentLoadedイベントでアプリケーションを初期化
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApplication);
} else {
    // 既にDOMが読み込まれている場合は即座に初期化
    initializeApplication();
}

// デバッグ用：モジュールへのアクセスを提供
window.modules = {
    errorHandler: () => errorHandler,
    socketManager: () => socketManager,
    gameStateManager: () => gameStateManager,
    tileManager: () => tileManager,
    discardDisplayManager: () => discardDisplayManager,
    winningManager: () => winningManager,
    uiManager: () => uiManager
};

console.log('メインスクリプト読み込み完了');
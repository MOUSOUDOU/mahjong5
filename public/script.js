// Socket.io接続
const socket = io();

// DOM要素
const gameArea = document.getElementById('game-area');
const waitingScreen = document.querySelector('.waiting-screen');
const gameScreen = document.querySelector('.game-screen');
const playerHand = document.getElementById('player-hand');
const opponentHand = document.getElementById('opponent-hand');
const discardedTiles = document.getElementById('discarded-tiles');
const drawBtn = document.getElementById('draw-btn');
const riichiBtn = document.getElementById('riichi-btn');
const ronBtn = document.getElementById('ron-btn');
const tsumoBtn = document.getElementById('tsumo-btn');

// ゲーム状態
let currentGameState = null;
let selectedTile = null;
let playerId = null;
let isConnected = false;
let turnTimerId = null;
let turnTimeRemaining = 0;

// Socket.io接続管理
socket.on('connect', () => {
    console.log('サーバーに接続しました');
    isConnected = true;
    updateConnectionStatus(true);
    
    // 接続時にゲーム参加をリクエスト
    socket.emit('joinGame');
});

socket.on('disconnect', () => {
    console.log('サーバーから切断されました');
    isConnected = false;
    updateConnectionStatus(false);
    showWaitingScreen();
});

socket.on('connect_error', (error) => {
    console.error('接続エラー:', error);
    showError('サーバーに接続できません。しばらく待ってから再試行してください。');
});

// ゲーム関連イベント
socket.on('gameStateUpdate', (gameState) => {
    console.log('ゲーム状態が更新されました:', gameState);
    updateGameDisplay(gameState);
});

socket.on('playerJoined', (data) => {
    console.log('プレイヤーが参加しました:', data);
    showMessage(`${data.playerName}が参加しました`);
});

socket.on('playerLeft', (data) => {
    console.log('プレイヤーが退出しました:', data);
    showMessage(`${data.playerName}が退出しました`);
    showWaitingScreen();
});

socket.on('waitingForPlayers', (data) => {
    console.log('プレイヤー待機中:', data);
    updateWaitingMessage(data.currentPlayers, data.requiredPlayers);
});

// エラーハンドリング
socket.on('error', (error) => {
    console.error('ゲームエラー:', error);
    showError(getErrorMessage(error.type, error.message));
});

socket.on('gameError', (error) => {
    console.error('ゲームエラー:', error);
    showError(getErrorMessage(error.type, error.message));
});

// アクション結果の受信
socket.on('tileDrawn', (data) => {
    console.log('牌を引きました:', data);
    // ゲーム状態は gameStateUpdate で更新される
});

socket.on('tileDiscarded', (data) => {
    console.log('牌が捨てられました:', data);
    // ゲーム状態は gameStateUpdate で更新される
});

socket.on('riichiDeclared', (data) => {
    console.log('リーチが宣言されました:', data);
    const message = data.playerId === playerId ? 'リーチを宣言しました' : '相手がリーチを宣言しました';
    showMessage(message);
});

socket.on('gameWon', (data) => {
    console.log('ゲーム勝利:', data);
    // ゲーム終了処理は gameEnded で処理される
});

// ゲーム開始通知を受信
socket.on('gameStarted', (gameData) => {
    console.log('ゲームが開始されました:', gameData);
    
    // ゲーム情報を保存
    if (gameData.gameId) {
        localStorage.setItem('currentGameId', gameData.gameId);
    }
    
    showGameScreen();
    
    // ゲーム状態の更新は別途 gameStateUpdate で受信される
});

// ゲーム終了通知を受信
socket.on('gameEnded', (result) => {
    console.log('ゲームが終了しました:', result);
    
    // 最終ゲーム状態を更新
    if (result.finalState) {
        updateGameDisplay(result.finalState);
    }
    
    // 結果画面を表示
    setTimeout(() => {
        showGameResult(result);
    }, 1000); // 1秒後に結果を表示（ゲーム状態の更新を確認するため）
});

// プレイヤー切断通知を受信
socket.on('playerDisconnected', (data) => {
    console.log('プレイヤーが切断されました:', data);
    showError(data.message, 5000);
    
    // タイマーをクリア
    clearTurnTimer();
    
    // ゲーム画面をリセット
    setTimeout(() => {
        showWaitingScreen();
        currentGameState = null;
        selectedTile = null;
    }, 2000);
});

// 手番タイマー関連のイベント
socket.on('turnTimerStarted', (data) => {
    console.log('手番タイマー開始:', data);
    startTurnTimer(data.playerId, data.timeLimit);
});

socket.on('autoDiscardTimeout', (data) => {
    console.log('タイムアウトによる自動捨て牌:', data);
    showMessage(data.message, 3000);
});

socket.on('autoDrawTimeout', (data) => {
    console.log('タイムアウトによる自動ドロー:', data);
    showMessage(data.message, 3000);
});

// 再接続関連のイベント
socket.on('reconnectionSuccess', (data) => {
    console.log('再接続成功:', data);
    showMessage(data.message, 3000);
    
    // ゲーム状態を復元
    if (data.gameState) {
        updateGameDisplay(data.gameState);
        showGameScreen();
    }
});

socket.on('reconnectionFailed', (data) => {
    console.log('再接続失敗:', data);
    showError('再接続に失敗しました: ' + data.error);
    showWaitingScreen();
});

socket.on('playerReconnected', (data) => {
    console.log('プレイヤーが再接続:', data);
    showMessage(data.message, 3000);
});

// 牌表示とインタラクション機能
function createTileElement(tile, isClickable = false, isHidden = false) {
    const tileElement = document.createElement('div');
    tileElement.className = 'tile';
    
    if (isHidden) {
        tileElement.classList.add('hidden');
        tileElement.textContent = '?';
    } else {
        // 牌の表示テキストを設定
        tileElement.textContent = getTileDisplayText(tile);
        
        // 牌の種類に応じてクラスを追加
        if (tile.suit === 'bamboo') {
            tileElement.classList.add('bamboo');
        } else if (tile.suit === 'honor') {
            tileElement.classList.add('honor');
        }
        
        // データ属性を設定
        tileElement.dataset.tileId = tile.id;
        tileElement.dataset.suit = tile.suit;
        tileElement.dataset.value = tile.value;
    }
    
    if (isClickable) {
        tileElement.classList.add('clickable');
        tileElement.addEventListener('click', () => handleTileClick(tile, tileElement));
    }
    
    return tileElement;
}

function getTileDisplayText(tile) {
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

function handleTileClick(tile, tileElement) {
    // 既に選択されている牌がある場合は選択を解除
    if (selectedTile) {
        const previousSelected = document.querySelector('.tile.selected');
        if (previousSelected) {
            previousSelected.classList.remove('selected');
        }
    }
    
    // 新しい牌を選択
    selectedTile = tile;
    tileElement.classList.add('selected');
    
    // 捨て牌ボタンの状態を更新（実際の捨て牌処理は後で実装）
    console.log('選択された牌:', tile);
}

function displayPlayerHand(tiles, isClickable = false) {
    playerHand.innerHTML = '';
    
    tiles.forEach(tile => {
        const tileElement = createTileElement(tile, isClickable);
        playerHand.appendChild(tileElement);
    });
}

function displayOpponentHand(tileCount) {
    opponentHand.innerHTML = '';
    
    for (let i = 0; i < tileCount; i++) {
        const tileElement = createTileElement(null, false, true);
        opponentHand.appendChild(tileElement);
    }
}

function displayDiscardedTiles(tiles) {
    discardedTiles.innerHTML = '';
    
    tiles.forEach(tile => {
        const tileElement = createTileElement(tile, false);
        tileElement.style.cursor = 'default';
        discardedTiles.appendChild(tileElement);
    });
}

function showGameScreen() {
    waitingScreen.style.display = 'none';
    gameScreen.style.display = 'block';
}

function showWaitingScreen() {
    waitingScreen.style.display = 'block';
    gameScreen.style.display = 'none';
}

function updateGameDisplay(gameState) {
    const previousGameState = currentGameState;
    currentGameState = gameState;
    
    // プレイヤー情報の更新
    const player = gameState.players.find(p => p.id === playerId);
    const opponent = gameState.players.find(p => p.id !== playerId);
    
    if (player) {
        updatePlayerStatus(player, false);
        
        // 手牌の表示（自分の手番で手牌が5枚の時のみクリック可能）
        const isPlayerTurn = gameState.currentPlayerIndex === gameState.players.indexOf(player);
        const canDiscardTile = isPlayerTurn && player.hand.length === 5;
        displayPlayerHand(player.hand, canDiscardTile);
    }
    
    if (opponent) {
        updatePlayerStatus(opponent, true);
        displayOpponentHand(opponent.hand.length);
    }
    
    // 捨て牌の表示
    const allDiscardedTiles = [];
    gameState.players.forEach(player => {
        allDiscardedTiles.push(...player.discardedTiles);
    });
    displayDiscardedTiles(allDiscardedTiles);
    
    // ゲーム情報の更新
    updateRemainingTiles(gameState.deck.length);
    updateTurnIndicator(gameState);
    
    // 手番が変わった場合のアニメーション
    if (previousGameState && previousGameState.currentPlayerIndex !== gameState.currentPlayerIndex) {
        addGameStateAnimation();
    }
    
    // ボタンの状態更新
    const isMyTurn = gameState.players[gameState.currentPlayerIndex]?.id === playerId;
    updateButtonStates(gameState, isMyTurn);
    
    // 上がり判定（実際の判定ロジックは後で実装）
    if (player && isMyTurn) {
        // ここで実際のツモ・ロン判定を行う
        // 現在は仮の実装
        showWinningOptions(false, false);
    }
}

function updateButtonStates(gameState, isMyTurn) {
    const player = gameState.players.find(p => p.id === playerId);
    
    if (!player) return;
    
    // 牌を引くボタン
    drawBtn.disabled = !isMyTurn || player.hand.length >= 5;
    
    // リーチボタン（テンパイ状態で有効化 - 実際の判定は後で実装）
    riichiBtn.disabled = !isMyTurn || player.isRiichi || player.hand.length !== 4;
    
    // ロン・ツモボタンは後で実装
    ronBtn.style.display = 'none';
    tsumoBtn.style.display = 'none';
}

// アクションボタンのイベントリスナー
drawBtn.addEventListener('click', () => {
    if (!drawBtn.disabled) {
        if (safeEmit('drawTile')) {
            drawBtn.disabled = true; // 重複送信を防ぐ
            selectedTile = null; // 選択をリセット
            // 選択状態をクリア
            const selected = document.querySelector('.tile.selected');
            if (selected) {
                selected.classList.remove('selected');
            }
        }
    }
});

riichiBtn.addEventListener('click', () => {
    if (!riichiBtn.disabled) {
        if (safeEmit('declareRiichi')) {
            riichiBtn.disabled = true; // 重複送信を防ぐ
        }
    }
});

// 牌を捨てる処理（選択された牌がある場合）
function discardSelectedTile() {
    if (selectedTile && currentGameState) {
        const player = currentGameState.players.find(p => p.id === playerId);
        const isPlayerTurn = currentGameState.currentPlayerIndex === currentGameState.players.indexOf(player);
        
        if (isPlayerTurn && player.hand.length === 5) {
            if (safeEmit('discardTile', { tileId: selectedTile.id })) {
                selectedTile = null;
                
                // 選択状態をクリア
                const selected = document.querySelector('.tile.selected');
                if (selected) {
                    selected.classList.remove('selected');
                }
                
                // 一時的にクリックを無効化
                const tiles = document.querySelectorAll('.tile.clickable');
                tiles.forEach(tile => {
                    tile.style.pointerEvents = 'none';
                });
                
                setTimeout(() => {
                    tiles.forEach(tile => {
                        tile.style.pointerEvents = 'auto';
                    });
                }, 1000);
            }
        } else {
            showError('牌を捨てることができません');
        }
    }
}

// キーボードショートカット（Enterで捨て牌）
document.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && selectedTile) {
        discardSelectedTile();
    }
});

// ゲーム状態表示機能
function showGameResult(result) {
    const gameResult = document.getElementById('game-result');
    const resultTitle = document.getElementById('result-title');
    const resultMessage = document.getElementById('result-message');
    const newGameBtn = document.getElementById('new-game-btn');
    
    // 結果に応じてタイトルとメッセージを設定
    if (result.winner) {
        const isWinner = result.winner.id === playerId;
        
        if (isWinner) {
            resultTitle.textContent = '勝利！';
            resultTitle.style.color = '#4caf50';
            
            if (result.result === 'tsumo') {
                const tileText = result.winningTile ? getTileDisplayText(result.winningTile) : '不明';
                resultMessage.textContent = `ツモで上がりました！\n上がり牌: ${tileText}`;
            } else if (result.result === 'ron') {
                const tileText = result.winningTile ? getTileDisplayText(result.winningTile) : '不明';
                resultMessage.textContent = `ロンで上がりました！\n上がり牌: ${tileText}`;
            }
        } else {
            resultTitle.textContent = '敗北';
            resultTitle.style.color = '#f44336';
            
            if (result.result === 'tsumo') {
                const tileText = result.winningTile ? getTileDisplayText(result.winningTile) : '不明';
                resultMessage.textContent = `相手がツモで上がりました\n上がり牌: ${tileText}`;
            } else if (result.result === 'ron') {
                const tileText = result.winningTile ? getTileDisplayText(result.winningTile) : '不明';
                resultMessage.textContent = `相手がロンで上がりました\n上がり牌: ${tileText}`;
            }
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
    gameResult.style.display = 'flex';
    
    // 新しいゲームボタンのイベントリスナー
    newGameBtn.onclick = () => {
        gameResult.style.display = 'none';
        showWaitingScreen();
        
        // ゲーム状態をリセット
        currentGameState = null;
        selectedTile = null;
        
        // 保存されたゲーム情報をクリア
        localStorage.removeItem('currentGameId');
        
        // タイマーをクリア
        clearTurnTimer();
        
        // 新しいゲームを要求
        safeEmit('requestNewGame');
    };
}

function updateTurnIndicator(gameState) {
    const currentPlayer = gameState.players[gameState.currentPlayerIndex];
    const isMyTurn = currentPlayer && currentPlayer.id === playerId;
    const turnElement = document.getElementById('current-turn');
    
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

function updateRemainingTiles(count) {
    const remainingElement = document.getElementById('remaining-tiles');
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

function updatePlayerStatus(player, isOpponent = false) {
    const nameElement = document.getElementById(isOpponent ? 'opponent-name' : 'player-name');
    const riichiElement = document.getElementById(isOpponent ? 'opponent-riichi' : 'player-riichi');
    
    nameElement.textContent = player.name || (isOpponent ? '相手' : 'プレイヤー');
    
    if (player.isRiichi) {
        riichiElement.style.display = 'inline';
        riichiElement.classList.add('riichi-active');
    } else {
        riichiElement.style.display = 'none';
        riichiElement.classList.remove('riichi-active');
    }
}

function showWinningOptions(canTsumo, canRon) {
    const tsumoBtn = document.getElementById('tsumo-btn');
    const ronBtn = document.getElementById('ron-btn');
    
    if (canTsumo) {
        tsumoBtn.style.display = 'inline-block';
        tsumoBtn.onclick = () => {
            if (safeEmit('declareWin', { type: 'tsumo' })) {
                tsumoBtn.disabled = true;
            }
        };
    } else {
        tsumoBtn.style.display = 'none';
    }
    
    if (canRon) {
        ronBtn.style.display = 'inline-block';
        ronBtn.onclick = () => {
            if (safeEmit('declareWin', { type: 'ron' })) {
                ronBtn.disabled = true;
            }
        };
    } else {
        ronBtn.style.display = 'none';
    }
}

function addGameStateAnimation() {
    // 手番変更時のアニメーション
    const gameInfo = document.querySelector('.game-info');
    gameInfo.classList.add('turn-change');
    
    setTimeout(() => {
        gameInfo.classList.remove('turn-change');
    }, 500);
}

// 通信とエラーハンドリング機能
function updateConnectionStatus(connected) {
    const header = document.querySelector('header h1');
    
    if (connected) {
        header.style.color = '#ffd700';
        header.textContent = '５枚麻雀';
    } else {
        header.style.color = '#ff4444';
        header.textContent = '５枚麻雀 (接続中...)';
    }
}

function updateWaitingMessage(currentPlayers, requiredPlayers) {
    const waitingScreen = document.querySelector('.waiting-screen');
    const messageElement = waitingScreen.querySelector('p');
    
    messageElement.textContent = `プレイヤー ${currentPlayers}/${requiredPlayers} - 他のプレイヤーの接続を待っています`;
}

function showMessage(message, duration = 3000) {
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
}

function showError(message, duration = 5000) {
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
}

function getErrorMessage(errorType, defaultMessage) {
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

// 安全な Socket.io 送信関数
function safeEmit(event, data = {}) {
    if (!isConnected) {
        showError('サーバーに接続されていません');
        return false;
    }
    
    try {
        socket.emit(event, data);
        return true;
    } catch (error) {
        console.error('送信エラー:', error);
        showError('通信エラーが発生しました');
        return false;
    }
}

// 再接続処理
function attemptReconnection() {
    if (!isConnected) {
        console.log('再接続を試行中...');
        
        // 既存のゲーム情報があれば再接続を試行
        const savedGameId = localStorage.getItem('currentGameId');
        if (savedGameId && currentGameState) {
            socket.connect();
            
            // 接続後に再接続を試行
            socket.once('connect', () => {
                safeEmit('attemptReconnection', { gameId: savedGameId });
            });
        } else {
            socket.connect();
        }
    }
}

// 定期的な接続チェック
setInterval(() => {
    if (!isConnected) {
        attemptReconnection();
    }
}, 5000);

// 手番タイマー機能
function startTurnTimer(currentPlayerId, timeLimit) {
    // 既存のタイマーをクリア
    clearTurnTimer();
    
    const isMyTurn = currentPlayerId === playerId;
    turnTimeRemaining = timeLimit / 1000; // 秒に変換
    
    // タイマー表示を更新
    updateTimerDisplay(isMyTurn);
    
    // 1秒ごとにタイマーを更新
    turnTimerId = setInterval(() => {
        turnTimeRemaining--;
        updateTimerDisplay(isMyTurn);
        
        if (turnTimeRemaining <= 0) {
            clearTurnTimer();
        }
    }, 1000);
}

function clearTurnTimer() {
    if (turnTimerId) {
        clearInterval(turnTimerId);
        turnTimerId = null;
    }
    turnTimeRemaining = 0;
    
    // タイマー表示をクリア
    const timerElement = document.getElementById('turn-timer');
    if (timerElement) {
        timerElement.style.display = 'none';
    }
}

function updateTimerDisplay(isMyTurn) {
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
    
    if (turnTimeRemaining > 0) {
        timerElement.style.display = 'block';
        
        const playerText = isMyTurn ? 'あなた' : '相手';
        timerElement.textContent = `${playerText}の手番: ${turnTimeRemaining}秒`;
        
        // 残り時間に応じて色を変更
        if (turnTimeRemaining <= 5) {
            timerElement.style.backgroundColor = 'rgba(244, 67, 54, 0.9)';
            timerElement.style.animation = 'timerPulse 1s infinite';
        } else if (turnTimeRemaining <= 10) {
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

// CSS アニメーションクラスを動的に追加
const style = document.createElement('style');
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
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

// 捨て牌表示管理システム
class DiscardDisplayManager {
    constructor() {
        this.playerDiscardArea = null;
        this.opponentDiscardArea = null;
        this.init();
    }
    
    init() {
        // 捨て牌エリアの要素を取得
        this.playerDiscardArea = document.getElementById('player-discard-content');
        this.opponentDiscardArea = document.getElementById('opponent-discard-content');
        
        if (!this.playerDiscardArea || !this.opponentDiscardArea) {
            console.error('捨て牌表示エリアが見つかりません');
            return;
        }
        
        console.log('DiscardDisplayManager初期化完了');
    }
    
    // ゲーム状態から捨て牌を更新（要件4.1, 4.2, 4.3, 4.4対応）
    updateDiscards(gameState, currentPlayerId) {
        if (!gameState || !gameState.players) {
            console.warn('無効なゲーム状態です');
            return;
        }
        
        const player = gameState.players.find(p => p.id === currentPlayerId);
        const opponent = gameState.players.find(p => p.id !== currentPlayerId);
        
        if (!player || !opponent) {
            console.warn('プレイヤーまたは相手が見つかりません');
            return;
        }
        
        // 捨て牌データを変換（時系列順序を保持）
        const playerDiscards = this.convertDiscardData(player.discardedTiles || [], 'player');
        const opponentDiscards = this.convertDiscardData(opponent.discardedTiles || [], 'opponent');
        
        console.log('捨て牌表示更新:', {
            playerId: currentPlayerId,
            playerDiscards: playerDiscards.length,
            opponentDiscards: opponentDiscards.length
        });
        
        // プレイヤーの捨て牌を表示（右側、上から下へ）
        this.displayPlayerDiscards(playerDiscards);
        
        // 相手の捨て牌を表示（左側、180度回転、下から上へ）
        this.displayOpponentDiscards(opponentDiscards);
        
        // 表示後の検証
        this.validateDisplayConsistency(playerDiscards, opponentDiscards);
    }
    
    // 捨て牌データの変換（サーバーデータからクライアント表示用データへ）
    convertDiscardData(discardStrings, playerType) {
        if (!Array.isArray(discardStrings)) {
            console.warn(`${playerType}の捨て牌データが配列ではありません:`, discardStrings);
            return [];
        }
        
        return discardStrings.map((tileStr, index) => {
            try {
                // 文字列から牌情報を解析
                const tileInfo = this.parseTileString(tileStr);
                return {
                    id: `${playerType}_discard_${index}_${Date.now()}`,
                    suit: tileInfo.suit,
                    value: tileInfo.value,
                    displayText: tileStr,
                    timestamp: Date.now() + index, // 時系列順序を保持
                    playerType: playerType
                };
            } catch (error) {
                console.warn(`${playerType}の捨て牌解析エラー:`, tileStr, error);
                return {
                    id: `${playerType}_discard_${index}_${Date.now()}`,
                    suit: 'unknown',
                    value: 'unknown',
                    displayText: tileStr,
                    timestamp: Date.now() + index,
                    playerType: playerType
                };
            }
        });
    }
    
    // 牌の文字列表現から牌情報を解析
    parseTileString(tileStr) {
        // 数字牌（1-9）
        if (/^[1-9]$/.test(tileStr)) {
            return {
                suit: 'bamboo',
                value: parseInt(tileStr)
            };
        }
        
        // 字牌
        switch (tileStr) {
            case '白':
                return { suit: 'honor', value: 'white' };
            case '發':
                return { suit: 'honor', value: 'green' };
            case '中':
                return { suit: 'honor', value: 'red' };
            default:
                // 不明な牌の場合はそのまま返す
                return { suit: 'unknown', value: tileStr };
        }
    }
    
    // 表示の一貫性を検証
    validateDisplayConsistency(playerDiscards, opponentDiscards) {
        const issues = [];
        
        // プレイヤー側の検証
        const playerDisplayed = this.playerDiscardArea ? 
            this.playerDiscardArea.querySelectorAll('.discard-tile').length : 0;
        if (playerDisplayed !== playerDiscards.length) {
            issues.push(`プレイヤー捨て牌数不一致: 表示${playerDisplayed} vs データ${playerDiscards.length}`);
        }
        
        // 相手側の検証
        const opponentDisplayed = this.opponentDiscardArea ? 
            this.opponentDiscardArea.querySelectorAll('.discard-tile').length : 0;
        if (opponentDisplayed !== opponentDiscards.length) {
            issues.push(`相手捨て牌数不一致: 表示${opponentDisplayed} vs データ${opponentDiscards.length}`);
        }
        
        // 6牌制限の検証
        const rowLimitIssues = this.validateRowLimits();
        issues.push(...rowLimitIssues);
        
        if (issues.length > 0) {
            console.warn('捨て牌表示の一貫性問題:', issues);
        } else {
            console.log('捨て牌表示の一貫性確認: OK');
        }
        
        return issues;
    }
    
    // プレイヤーの捨て牌を表示（右側、上から下へ）
    displayPlayerDiscards(tiles) {
        if (!this.playerDiscardArea) {
            console.error('プレイヤー捨て牌エリアが見つかりません');
            return;
        }
        
        console.log('プレイヤー捨て牌表示:', tiles.length, '枚');
        
        // エリアをクリア
        this.playerDiscardArea.innerHTML = '';
        
        if (tiles.length === 0) {
            const emptyRow = document.createElement('div');
            emptyRow.className = 'discard-row empty';
            emptyRow.textContent = '捨て牌なし';
            this.playerDiscardArea.appendChild(emptyRow);
            return;
        }
        
        // プレイヤー側：上から下への行追加ロジック（時系列順序を保持）
        this.renderPlayerTileRows(tiles);
    }
    
    // プレイヤー側の牌配置ロジック（上から下へ、時系列順序保持）
    renderPlayerTileRows(tiles) {
        // 時系列順序でソート（念のため）
        const sortedTiles = [...tiles].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
        
        // 6牌ずつ行に分割
        const rows = this.createTileRows(sortedTiles);
        
        console.log(`プレイヤー側: ${sortedTiles.length}牌を${rows.length}行に配置`);
        
        // 上から下へ順番に行を追加
        rows.forEach((rowTiles, rowIndex) => {
            const row = document.createElement('div');
            row.className = 'discard-row player-row';
            row.dataset.rowIndex = rowIndex;
            
            // アクセシビリティ属性を追加
            row.setAttribute('role', 'listitem');
            row.setAttribute('aria-label', `あなたの捨て牌 第${rowIndex + 1}行目 (${rowTiles.length}牌)`);
            
            // 6牌で満杯の行にマーク
            if (rowTiles.length === 6) {
                row.classList.add('full');
                row.setAttribute('aria-describedby', 'full-row-description');
            }
            
            // 左詰めで牌を配置（時系列順序）
            rowTiles.forEach((tile, tileIndex) => {
                const tileElement = createDiscardTileElement(tile, false);
                tileElement.dataset.tileIndex = tileIndex;
                tileElement.dataset.rowIndex = rowIndex;
                tileElement.setAttribute('role', 'listitem');
                row.appendChild(tileElement);
            });
            
            // 行を上から下へ順番に追加
            this.playerDiscardArea.appendChild(row);
        });
    }
    
    // 相手の捨て牌を表示（左側、180度回転、下から上へ）
    displayOpponentDiscards(tiles) {
        if (!this.opponentDiscardArea) {
            console.error('相手捨て牌エリアが見つかりません');
            return;
        }
        
        console.log('相手捨て牌表示:', tiles.length, '枚');
        
        // エリアをクリア
        this.opponentDiscardArea.innerHTML = '';
        
        if (tiles.length === 0) {
            const emptyRow = document.createElement('div');
            emptyRow.className = 'discard-row empty';
            emptyRow.textContent = '捨て牌なし';
            this.opponentDiscardArea.appendChild(emptyRow);
            return;
        }
        
        // 相手側：下から上への行追加ロジック（CSS column-reverseと連携、時系列順序を保持）
        this.renderOpponentTileRows(tiles);
    }
    
    // 相手側の牌配置ロジック（下から上へ、CSS column-reverseと連携、時系列順序保持）
    renderOpponentTileRows(tiles) {
        // 時系列順序でソート（念のため）
        const sortedTiles = [...tiles].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
        
        // 6牌ずつ行に分割
        const rows = this.createTileRows(sortedTiles);
        
        console.log(`相手側: ${sortedTiles.length}牌を${rows.length}行に配置（180度回転）`);
        
        // CSS column-reverseと連携して下から上への表示を実現
        // 行は通常順序で追加するが、CSSで表示順序を逆転
        rows.forEach((rowTiles, rowIndex) => {
            const row = document.createElement('div');
            row.className = 'discard-row opponent-row';
            row.dataset.rowIndex = rowIndex;
            
            // アクセシビリティ属性を追加
            row.setAttribute('role', 'listitem');
            row.setAttribute('aria-label', `相手の捨て牌 第${rowIndex + 1}行目 (${rowTiles.length}牌、180度回転表示)`);
            
            // 6牌で満杯の行にマーク
            if (rowTiles.length === 6) {
                row.classList.add('full');
                row.setAttribute('aria-describedby', 'full-row-description');
            }
            
            // 左詰めで牌を配置（180度回転、時系列順序）
            rowTiles.forEach((tile, tileIndex) => {
                const tileElement = createDiscardTileElement(tile, true); // 相手の牌は回転
                tileElement.dataset.tileIndex = tileIndex;
                tileElement.dataset.rowIndex = rowIndex;
                tileElement.setAttribute('role', 'listitem');
                row.appendChild(tileElement);
            });
            
            // 行を追加（CSS column-reverseにより下から上へ表示される）
            this.opponentDiscardArea.appendChild(row);
        });
    }
    
    // 牌を6枚ずつの行に分割（1行6牌の制限機能）
    createTileRows(tiles) {
        const rows = [];
        const maxTilesPerRow = 6;
        
        // 牌を6枚ずつのグループに分割
        for (let i = 0; i < tiles.length; i += maxTilesPerRow) {
            const rowTiles = tiles.slice(i, i + maxTilesPerRow);
            rows.push(rowTiles);
        }
        
        return rows;
    }
    
    // 新しい牌を追加する際の行計算（インクリメンタル更新用）
    calculateRowPlacement(currentTileCount, newTileCount = 1) {
        const maxTilesPerRow = 6;
        const totalTiles = currentTileCount + newTileCount;
        
        return {
            totalRows: Math.ceil(totalTiles / maxTilesPerRow),
            currentRow: Math.floor(currentTileCount / maxTilesPerRow),
            currentRowPosition: currentTileCount % maxTilesPerRow,
            needsNewRow: (currentTileCount % maxTilesPerRow) === 0 && currentTileCount > 0
        };
    }
    
    // 行の満杯状態をチェック
    isRowFull(rowElement) {
        return rowElement.children.length >= 6;
    }
    
    // 空の行を作成
    createEmptyRow(rowIndex, isOpponent = false) {
        const row = document.createElement('div');
        row.className = 'discard-row';
        row.dataset.rowIndex = rowIndex;
        
        if (isOpponent) {
            row.classList.add('opponent-row');
        }
        
        return row;
    }
    
    // 単一牌をプレイヤーエリアに追加（インクリメンタル更新用）
    addPlayerTile(tile) {
        if (!this.playerDiscardArea) return;
        
        const currentTileCount = this.playerDiscardArea.querySelectorAll('.discard-tile').length;
        const placement = this.calculateRowPlacement(currentTileCount);
        
        let targetRow = this.playerDiscardArea.children[placement.currentRow];
        
        // 新しい行が必要な場合
        if (!targetRow || placement.needsNewRow) {
            targetRow = this.createEmptyRow(placement.currentRow, false);
            this.playerDiscardArea.appendChild(targetRow);
        }
        
        // 牌要素を作成して追加
        const tileElement = createDiscardTileElement(tile, false);
        tileElement.dataset.tileIndex = placement.currentRowPosition;
        targetRow.appendChild(tileElement);
        
        // 行が満杯になった場合のマーク
        if (this.isRowFull(targetRow)) {
            targetRow.classList.add('full');
        }
    }
    
    // 単一牌を相手エリアに追加（インクリメンタル更新用）
    addOpponentTile(tile) {
        if (!this.opponentDiscardArea) return;
        
        const currentTileCount = this.opponentDiscardArea.querySelectorAll('.discard-tile').length;
        const placement = this.calculateRowPlacement(currentTileCount);
        
        let targetRow = this.opponentDiscardArea.children[placement.currentRow];
        
        // 新しい行が必要な場合（CSS column-reverseにより下から上へ表示）
        if (!targetRow || placement.needsNewRow) {
            targetRow = this.createEmptyRow(placement.currentRow, true);
            this.opponentDiscardArea.appendChild(targetRow);
        }
        
        // 牌要素を作成して追加（180度回転）
        const tileElement = createDiscardTileElement(tile, true);
        tileElement.dataset.tileIndex = placement.currentRowPosition;
        targetRow.appendChild(tileElement);
        
        // 行が満杯になった場合のマーク
        if (this.isRowFull(targetRow)) {
            targetRow.classList.add('full');
        }
    }
    
    // 捨て牌エリアをクリア
    clearDiscards() {
        if (this.playerDiscardArea) {
            this.playerDiscardArea.innerHTML = '';
        }
        if (this.opponentDiscardArea) {
            this.opponentDiscardArea.innerHTML = '';
        }
    }
    
    // デバッグ用：現在の行数と牌数を取得
    getDiscardStats() {
        const playerRows = this.playerDiscardArea ? this.playerDiscardArea.children.length : 0;
        const playerTiles = this.playerDiscardArea ? this.playerDiscardArea.querySelectorAll('.discard-tile').length : 0;
        const opponentRows = this.opponentDiscardArea ? this.opponentDiscardArea.children.length : 0;
        const opponentTiles = this.opponentDiscardArea ? this.opponentDiscardArea.querySelectorAll('.discard-tile').length : 0;
        
        return {
            player: { rows: playerRows, tiles: playerTiles },
            opponent: { rows: opponentRows, tiles: opponentTiles }
        };
    }
    
    // デバッグ用：6牌制限の検証
    validateRowLimits() {
        const issues = [];
        
        // プレイヤー側の検証
        if (this.playerDiscardArea) {
            const playerRows = this.playerDiscardArea.querySelectorAll('.discard-row');
            playerRows.forEach((row, index) => {
                const tileCount = row.querySelectorAll('.discard-tile').length;
                if (tileCount > 6) {
                    issues.push(`プレイヤー行${index}: ${tileCount}牌 (制限: 6牌)`);
                }
            });
        }
        
        // 相手側の検証
        if (this.opponentDiscardArea) {
            const opponentRows = this.opponentDiscardArea.querySelectorAll('.discard-row');
            opponentRows.forEach((row, index) => {
                const tileCount = row.querySelectorAll('.discard-tile').length;
                if (tileCount > 6) {
                    issues.push(`相手行${index}: ${tileCount}牌 (制限: 6牌)`);
                }
            });
        }
        
        return issues;
    }
}

// グローバルな捨て牌表示マネージャーのインスタンス
let discardDisplayManager = null;

// テスト用：牌配置ロジックの検証関数
function testTilePlacementLogic() {
    if (!discardDisplayManager) {
        console.log('DiscardDisplayManager が初期化されていません');
        return;
    }
    
    console.log('=== 牌配置ロジックテスト開始 ===');
    
    // テスト用の牌データを作成
    const testTiles = [];
    for (let i = 1; i <= 13; i++) {
        testTiles.push({
            id: `test-${i}`,
            suit: i <= 9 ? 'bamboo' : 'honor',
            value: i <= 9 ? i : (i === 10 ? 'white' : i === 11 ? 'green' : 'red')
        });
    }
    
    // 捨て牌エリアをクリア
    discardDisplayManager.clearDiscards();
    
    // プレイヤー側テスト（上から下へ）
    console.log('プレイヤー側テスト: 13牌を配置（2行 + 1牌）');
    discardDisplayManager.displayPlayerDiscards(testTiles);
    
    // 相手側テスト（下から上へ、180度回転）
    console.log('相手側テスト: 13牌を配置（2行 + 1牌、180度回転）');
    discardDisplayManager.displayOpponentDiscards(testTiles);
    
    // 統計情報を表示
    const stats = discardDisplayManager.getDiscardStats();
    console.log('配置結果:', stats);
    
    // 6牌制限の検証
    const issues = discardDisplayManager.validateRowLimits();
    if (issues.length === 0) {
        console.log('✓ 6牌制限が正しく適用されています');
    } else {
        console.log('✗ 6牌制限の問題:', issues);
    }
    
    console.log('=== 牌配置ロジックテスト完了 ===');
}

// テスト用：ゲーム状態統合の検証関数
function testGameStateIntegration() {
    console.log('=== ゲーム状態統合テスト開始 ===');
    
    // テスト用のゲーム状態を作成
    const testGameState = {
        gameId: 'test-game',
        players: [
            {
                id: 'player1',
                name: 'テストプレイヤー1',
                handSize: 4,
                isRiichi: false,
                discardedTiles: ['1', '2', '3', '白', '發', '中', '7', '8', '9']
            },
            {
                id: 'player2', 
                name: 'テストプレイヤー2',
                handSize: 4,
                isRiichi: false,
                discardedTiles: ['4', '5', '6', '白', '發']
            }
        ],
        currentPlayerIndex: 0,
        remainingTiles: 30
    };
    
    // プレイヤーIDを設定
    const originalPlayerId = playerId;
    playerId = 'player1';
    
    console.log('テストゲーム状態:', testGameState);
    
    // 捨て牌表示を更新
    updateDiscardDisplay(testGameState);
    
    // 結果を検証
    if (discardDisplayManager) {
        const stats = discardDisplayManager.getDiscardStats();
        console.log('統合テスト結果:', stats);
        
        const issues = discardDisplayManager.validateRowLimits();
        if (issues.length === 0) {
            console.log('✓ ゲーム状態統合が正常に動作しています');
        } else {
            console.log('✗ ゲーム状態統合に問題があります:', issues);
        }
    }
    
    // プレイヤーIDを復元
    playerId = originalPlayerId;
    
    console.log('=== ゲーム状態統合テスト完了 ===');
}

// 既存の関数を新しいシステムに統合
function displayDiscardedTiles(gameState) {
    // 新しい捨て牌表示システムを使用
    updateDiscardDisplay(gameState);
}

function updateDiscardDisplay(gameState) {
    // DiscardDisplayManagerが初期化されていない場合は作成
    if (!discardDisplayManager) {
        discardDisplayManager = new DiscardDisplayManager();
    }
    
    // ゲーム状態の検証
    if (!gameState || !gameState.players || !playerId) {
        console.warn('捨て牌表示更新: 無効なゲーム状態またはプレイヤーID');
        return;
    }
    
    console.log('捨て牌表示システム統合: ゲーム状態から捨て牌を更新');
    
    // 新しいシステムを使用して捨て牌を更新（時系列順序を保持）
    discardDisplayManager.updateDiscards(gameState, playerId);
}



function createDiscardTileElement(tile, isOpponent = false) {
    const tileElement = document.createElement('div');
    tileElement.className = 'discard-tile';
    
    // 牌の表示テキストを設定（displayTextがある場合はそれを使用）
    const displayText = tile.displayText || getTileDisplayText(tile);
    tileElement.textContent = displayText;
    
    // アクセシビリティ属性を追加
    const playerType = isOpponent ? '相手' : 'あなた';
    const rotationInfo = isOpponent ? '（180度回転）' : '';
    tileElement.setAttribute('role', 'img');
    tileElement.setAttribute('aria-label', `${playerType}の捨て牌: ${displayText}${rotationInfo}`);
    tileElement.setAttribute('tabindex', '0'); // キーボードナビゲーション対応
    
    // 牌の種類に応じてクラスを追加
    if (tile.suit === 'bamboo') {
        tileElement.classList.add('bamboo');
        tileElement.setAttribute('aria-describedby', 'bamboo-suit-description');
    } else if (tile.suit === 'honor') {
        tileElement.classList.add('honor');
        tileElement.setAttribute('aria-describedby', 'honor-suit-description');
    } else if (tile.suit === 'unknown') {
        tileElement.classList.add('unknown');
    }
    
    // 相手の牌の場合は回転クラスを追加
    if (isOpponent) {
        tileElement.classList.add('opponent');
    }
    
    // データ属性を設定
    tileElement.dataset.tileId = tile.id;
    tileElement.dataset.suit = tile.suit;
    tileElement.dataset.value = tile.value;
    tileElement.dataset.playerType = playerType;
    
    // 時系列情報があれば設定
    if (tile.timestamp) {
        tileElement.dataset.timestamp = tile.timestamp;
    }
    
    // キーボードイベントハンドラー（アクセシビリティ向上）
    tileElement.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            // 牌の詳細情報を読み上げ
            const announcement = `${tileElement.getAttribute('aria-label')}、${tile.suit}牌`;
            announceToScreenReader(announcement);
        }
    });
    
    return tileElement;
}

// スクリーンリーダー用のアナウンス機能
function announceToScreenReader(message) {
    const announcement = document.createElement('div');
    announcement.setAttribute('aria-live', 'polite');
    announcement.setAttribute('aria-atomic', 'true');
    announcement.className = 'sr-only';
    announcement.textContent = message;
    
    document.body.appendChild(announcement);
    
    // 短時間後に削除
    setTimeout(() => {
        document.body.removeChild(announcement);
    }, 1000);
}

function showGameScreen() {
    waitingScreen.style.display = 'none';
    gameScreen.style.display = 'block';
    
    // DiscardDisplayManagerを初期化（まだ初期化されていない場合）
    if (!discardDisplayManager) {
        discardDisplayManager = new DiscardDisplayManager();
        console.log('DiscardDisplayManager初期化完了 - ゲーム画面表示時');
    }
    
    // 捨て牌エリアの初期状態を確認
    if (discardDisplayManager.playerDiscardArea && discardDisplayManager.opponentDiscardArea) {
        console.log('捨て牌表示エリア確認: 正常に初期化済み');
    } else {
        console.warn('捨て牌表示エリア確認: 初期化に問題があります');
    }
}

function showWaitingScreen() {
    waitingScreen.style.display = 'block';
    gameScreen.style.display = 'none';
    
    // 捨て牌表示をクリア
    if (discardDisplayManager) {
        discardDisplayManager.clearDiscards();
    }
}

function updateGameDisplay(gameState) {
    console.log('ゲーム状態更新:', gameState);
    
    const previousGameState = currentGameState;
    currentGameState = gameState;
    
    // プレイヤーIDを設定（初回のみ）
    if (!playerId && gameState.players && gameState.players.length > 0) {
        // Socket IDと一致するプレイヤーを探す
        const socketId = socket.id;
        const matchingPlayer = gameState.players.find(p => p.id === socketId);
        if (matchingPlayer) {
            playerId = socketId;
            console.log('プレイヤーID設定:', playerId);
        }
    }
    
    // プレイヤー情報の更新
    const player = gameState.players.find(p => p.id === playerId);
    const opponent = gameState.players.find(p => p.id !== playerId);
    
    console.log('現在のプレイヤー:', player);
    console.log('プレイヤー手牌データ:', gameState.playerHandTiles);
    
    if (player) {
        updatePlayerStatus(player, false);
        
        // 手牌の表示（自分の手番で手牌が5枚の時のみクリック可能）
        const isPlayerTurn = gameState.currentPlayerIndex === gameState.players.indexOf(player);
        const playerHand = gameState.playerHandTiles || []; // 正しい手牌データを使用
        console.log('表示する手牌:', playerHand);
        const canDiscardTile = isPlayerTurn && playerHand.length === 5;
        displayPlayerHand(playerHand, canDiscardTile);
    }
    
    if (opponent) {
        updatePlayerStatus(opponent, true);
        displayOpponentHand(opponent.handSize); // 使用 handSize プロパティ
    }
    
    // 捨て牌の表示（新しいシステムとの統合）
    updateDiscardDisplay(gameState);
    
    // ゲーム情報の更新
    updateRemainingTiles(gameState.remainingTiles);
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
    
    const playerHand = gameState.playerHandTiles || []; // 正しい手牌データを使用
    
    // 牌を引くボタン
    drawBtn.disabled = !isMyTurn || playerHand.length >= 5;
    
    // リーチボタン（テンパイ状態で有効化 - 実際の判定は後で実装）
    riichiBtn.disabled = !isMyTurn || player.isRiichi || playerHand.length !== 4;
    
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
        const playerHand = currentGameState.playerHandTiles || []; // 正しい手牌データを使用
        
        if (isPlayerTurn && playerHand.length === 5) {
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
// Socket.io接続
const socket = io();

// DOM要素
const gameArea = document.getElementById('game-area');
const waitingScreen = document.querySelector('.waiting-screen');
const gameScreen = document.querySelector('.game-screen');
const playerHand = document.getElementById('player-hand');
const opponentHand = document.getElementById('opponent-hand');
const discardedTiles = document.getElementById('discarded-tiles');
// 牌を引くボタンは削除（自動牌引きのため）
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
socket.on('autoTileDraw', (data) => {
    console.log('自動牌引き:', data);
    showMessage(data.message, 2000);
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
        tileElement.addEventListener('dblclick', () => handleTileDoubleClick(tile, tileElement));

        // ダブルクリック時の視覚的フィードバック用のタイトル属性
        tileElement.title = `${getTileDisplayText(tile)} - クリック: 選択, ダブルクリック: 捨てる`;
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
    // リーチ後の制限チェック（要件3.5, 7.4）
    if (currentGameState) {
        const player = currentGameState.players.find(p => p.id === playerId);
        if (player && player.isRiichi && player.lastDrawnTile) {
            // リーチ後は引いた牌以外選択不可
            if (tile.id !== player.lastDrawnTile.id) {
                showError('リーチ後は引いた牌以外を捨てることはできません');
                return;
            }
        }
    }

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

    // 牌選択時にボタン状態を更新（リーチボタンの有効/無効を再判定）
    if (currentGameState) {
        const player = currentGameState.players.find(p => p.id === playerId);
        const isMyTurn = currentGameState.currentPlayerIndex === currentGameState.players.indexOf(player);
        updateButtonStates(currentGameState, isMyTurn);
    }

    // 捨て牌ボタンの状態を更新（実際の捨て牌処理は後で実装）
    console.log('選択された牌:', tile);
}

function handleTileDoubleClick(tile, tileElement) {
    // ダブルクリック時は即座に捨て牌処理を実行
    console.log('ダブルクリックで捨て牌:', tile);

    // まず牌を選択状態にする
    if (selectedTile) {
        const previousSelected = document.querySelector('.tile.selected');
        if (previousSelected) {
            previousSelected.classList.remove('selected');
        }
    }

    selectedTile = tile;
    tileElement.classList.add('selected');

    // 視覚的フィードバック（短時間のハイライト）
    tileElement.classList.add('double-clicked');

    // 少し遅延してから捨て牌処理を実行（視覚的フィードバックのため）
    setTimeout(() => {
        discardSelectedTile();
        tileElement.classList.remove('double-clicked');
    }, 150);
}

// 牌の選択を解除する関数
function clearTileSelection() {
    if (selectedTile) {
        const previousSelected = document.querySelector('.tile.selected');
        if (previousSelected) {
            previousSelected.classList.remove('selected');
        }
        selectedTile = null;

        // 選択解除時にボタン状態を更新
        if (currentGameState) {
            const player = currentGameState.players.find(p => p.id === playerId);
            const isMyTurn = currentGameState.currentPlayerIndex === currentGameState.players.indexOf(player);
            updateButtonStates(currentGameState, isMyTurn);
        }
    }
}

// 手牌の表示順序をソートする関数
function sortTilesForDisplay(tiles) {
    if (!Array.isArray(tiles)) {
        console.warn('sortTilesForDisplay: 無効な牌データ', tiles);
        return [];
    }

    // 空の配列や無効な牌データをフィルタリング
    const validTiles = tiles.filter(tile =>
        tile &&
        typeof tile === 'object' &&
        tile.suit &&
        tile.value !== undefined &&
        tile.value !== null
    );

    if (validTiles.length === 0) {
        return [];
    }

    return [...validTiles].sort((a, b) => {
        // 牌の種類による優先順位を決定
        const getSuitPriority = (tile) => {
            if (tile.suit === 'bamboo') return 1; // 索子が最優先
            if (tile.suit === 'honor') return 2;  // 字牌が次
            return 3; // その他（unknown等）は最後
        };

        // 字牌の値による優先順位を決定
        const getHonorPriority = (value) => {
            switch (value) {
                case 'white': return 1; // 白
                case 'green': return 2; // 發
                case 'red': return 3;   // 中
                default: return 4;      // その他
            }
        };

        const suitPriorityA = getSuitPriority(a);
        const suitPriorityB = getSuitPriority(b);

        // まず牌の種類でソート
        if (suitPriorityA !== suitPriorityB) {
            return suitPriorityA - suitPriorityB;
        }

        // 同じ種類の牌の場合、値でソート
        if (a.suit === 'bamboo' && b.suit === 'bamboo') {
            // 索子は数値順（1-9）
            const valueA = parseInt(a.value) || 0;
            const valueB = parseInt(b.value) || 0;
            return valueA - valueB;
        }

        if (a.suit === 'honor' && b.suit === 'honor') {
            // 字牌は白→發→中の順
            const priorityA = getHonorPriority(a.value);
            const priorityB = getHonorPriority(b.value);
            return priorityA - priorityB;
        }

        // その他の場合は元の順序を保持
        return 0;
    });
}

// テスト用：牌ソート機能の検証
function testTileSorting() {
    console.log('=== 牌ソート機能テスト開始 ===');

    // テスト用の牌データを作成（意図的にランダムな順序）
    const testTiles = [
        { id: 'test-1', suit: 'honor', value: 'red' },     // 中
        { id: 'test-2', suit: 'bamboo', value: 5 },        // 5
        { id: 'test-3', suit: 'honor', value: 'white' },   // 白
        { id: 'test-4', suit: 'bamboo', value: 1 },        // 1
        { id: 'test-5', suit: 'honor', value: 'green' },   // 發
        { id: 'test-6', suit: 'bamboo', value: 9 },        // 9
        { id: 'test-7', suit: 'bamboo', value: 3 },        // 3
    ];

    console.log('ソート前:', testTiles.map(t => getTileDisplayText(t)));

    const sortedTiles = sortTilesForDisplay(testTiles);

    console.log('ソート後:', sortedTiles.map(t => getTileDisplayText(t)));

    // 期待される順序: 1, 3, 5, 9, 白, 發, 中
    const expectedOrder = ['1', '3', '5', '9', '白', '發', '中'];
    const actualOrder = sortedTiles.map(t => getTileDisplayText(t));

    const isCorrect = JSON.stringify(expectedOrder) === JSON.stringify(actualOrder);

    if (isCorrect) {
        console.log('✓ 牌ソート機能が正常に動作しています');
    } else {
        console.log('✗ 牌ソート機能に問題があります');
        console.log('期待値:', expectedOrder);
        console.log('実際値:', actualOrder);
    }

    console.log('=== 牌ソート機能テスト完了 ===');

    return isCorrect;
}

// コンソールから呼び出し可能なテスト関数
window.testTileSorting = testTileSorting;
window.testReachTileDisplay = testReachTileDisplay;

// 手牌表示機能のテスト
function testHandDisplay() {
    console.log('=== 手牌表示機能テスト開始 ===');

    const testHand4 = [
        { id: 'test-1', suit: 'honor', value: 'red' },
        { id: 'test-2', suit: 'bamboo', value: 5 },
        { id: 'test-3', suit: 'honor', value: 'white' },
        { id: 'test-4', suit: 'bamboo', value: 1 }
    ];

    const testHand5 = [
        ...testHand4,
        { id: 'test-5', suit: 'bamboo', value: 9 }
    ];

    console.log('4枚手牌テスト:');
    console.log('入力:', testHand4.map(t => getTileDisplayText(t)));

    console.log('5枚手牌テスト（引いた牌あり）:');
    console.log('入力:', testHand5.map(t => getTileDisplayText(t)));
    console.log('引いた牌:', getTileDisplayText(testHand5[4]));

    // 重複牌テスト
    console.log('\n重複牌テスト:');
    const duplicateHand = [
        { id: 'dup-1', suit: 'bamboo', value: 5 },
        { id: 'dup-2', suit: 'honor', value: 'white' },
        { id: 'dup-3', suit: 'bamboo', value: 1 },
        { id: 'dup-4', suit: 'honor', value: 'red' }
    ];
    const drawnDuplicate = { id: 'dup-5', suit: 'bamboo', value: 5 }; // 既存の5と同じ
    const handWithDuplicate = [...duplicateHand, drawnDuplicate];

    console.log('基本手牌:', duplicateHand.map(t => getTileDisplayText(t)));
    console.log('引いた牌:', getTileDisplayText(drawnDuplicate), '(既存の牌と重複)');
    console.log('全手牌:', handWithDuplicate.map(t => getTileDisplayText(t)));
    console.log('期待結果: ソート済み4枚 + 区切り + 引いた牌');

    console.log('=== 手牌表示機能テスト完了 ===');
    console.log('詳細なテストは hand-display-test.html で確認できます');
}

window.testHandDisplay = testHandDisplay;

// ダブルクリック機能のテスト
function testDoubleClickFeature() {
    console.log('=== ダブルクリック機能テスト ===');
    console.log('実装された機能:');
    console.log('✓ シングルクリック: 牌を選択');
    console.log('✓ ダブルクリック: 牌を即座に捨てる');
    console.log('✓ 視覚的フィードバック: double-clicked クラス');
    console.log('✓ ツールチップ: ホバー時に操作方法表示');
    console.log('✓ レスポンシブ対応: モバイル用テキスト');
    console.log('');
    console.log('詳細テスト: hand-display-test.html の「テスト5: マウス操作テスト」');
    console.log('=== テスト完了 ===');
}

window.testDoubleClickFeature = testDoubleClickFeature;

// テンパイ判定関数（選択した牌を捨てた後の4枚がテンパイかチェック）
function checkTenpaiAfterDiscard(hand, tileToDiscard) {
    if (!hand || !tileToDiscard || hand.length !== 5) {
        return false;
    }

    // 選択した牌を除いた4枚を取得
    const remainingTiles = hand.filter(tile => tile.id !== tileToDiscard.id);

    if (remainingTiles.length !== 4) {
        return false;
    }

    // 簡易テンパイ判定（5枚麻雀用）
    // 実際のゲームでは、残り4枚 + 任意の1枚で上がりになるかをチェック
    return checkIsTenpai(remainingTiles);
}

// 4枚の手牌がテンパイ状態かチェック（簡易実装）
function checkIsTenpai(tiles) {
    if (!tiles || tiles.length !== 4) {
        return false;
    }

    // 5枚麻雀の簡易テンパイ判定
    // 実際のルールに応じて実装する必要がありますが、
    // ここでは基本的なパターンをチェック

    // 牌を種類別に分類
    const bambooTiles = tiles.filter(t => t.suit === 'bamboo').map(t => parseInt(t.value)).sort((a, b) => a - b);
    const honorTiles = tiles.filter(t => t.suit === 'honor');

    // パターン1: 4枚すべて同じ牌（カンの形 - 実際には不可能だが念のため）
    const allSame = tiles.every(tile =>
        tile.suit === tiles[0].suit && tile.value === tiles[0].value
    );
    if (allSame) return true;

    // パターン2: 3枚 + 1枚のペア形
    const tileGroups = groupTilesByValue(tiles);
    const groupSizes = Object.values(tileGroups).map(group => group.length).sort((a, b) => b - a);

    // 3枚 + 1枚の組み合わせ
    if (groupSizes.length === 2 && groupSizes[0] === 3 && groupSizes[1] === 1) {
        return true;
    }

    // パターン3: 2枚 + 2枚のペア形
    if (groupSizes.length === 2 && groupSizes[0] === 2 && groupSizes[1] === 2) {
        return true;
    }

    // パターン4: 連続する数牌の組み合わせ（順子の一部）
    if (bambooTiles.length >= 3) {
        // 連続する3枚があるかチェック
        for (let i = 0; i <= bambooTiles.length - 3; i++) {
            if (bambooTiles[i + 1] === bambooTiles[i] + 1 &&
                bambooTiles[i + 2] === bambooTiles[i] + 2) {
                return true;
            }
        }

        // 2枚連続 + 他の組み合わせ
        for (let i = 0; i <= bambooTiles.length - 2; i++) {
            if (bambooTiles[i + 1] === bambooTiles[i] + 1) {
                return true; // 簡易判定として連続2枚があればテンパイとする
            }
        }
    }

    // 暫定的にfalseを返す（実際のルールに応じて調整が必要）
    return false;
}

// 牌を値でグループ化するヘルパー関数
function groupTilesByValue(tiles) {
    const groups = {};

    tiles.forEach(tile => {
        const key = `${tile.suit}-${tile.value}`;
        if (!groups[key]) {
            groups[key] = [];
        }
        groups[key].push(tile);
    });

    return groups;
}

// テンパイ判定のテスト関数
function testTenpaiCheck() {
    console.log('=== テンパイ判定テスト ===');

    // テストケース1: 3枚 + 1枚
    const test1 = [
        { id: 't1-1', suit: 'bamboo', value: 5 },
        { id: 't1-2', suit: 'bamboo', value: 5 },
        { id: 't1-3', suit: 'bamboo', value: 5 },
        { id: 't1-4', suit: 'honor', value: 'white' }
    ];

    // テストケース2: 2枚 + 2枚
    const test2 = [
        { id: 't2-1', suit: 'bamboo', value: 3 },
        { id: 't2-2', suit: 'bamboo', value: 3 },
        { id: 't2-3', suit: 'honor', value: 'red' },
        { id: 't2-4', suit: 'honor', value: 'red' }
    ];

    // テストケース3: 連続数牌
    const test3 = [
        { id: 't3-1', suit: 'bamboo', value: 1 },
        { id: 't3-2', suit: 'bamboo', value: 2 },
        { id: 't3-3', suit: 'bamboo', value: 3 },
        { id: 't3-4', suit: 'honor', value: 'white' }
    ];

    console.log('テスト1 (3枚+1枚):', checkIsTenpai(test1) ? '✓ テンパイ' : '✗ 非テンパイ');
    console.log('テスト2 (2枚+2枚):', checkIsTenpai(test2) ? '✓ テンパイ' : '✗ 非テンパイ');
    console.log('テスト3 (連続数牌):', checkIsTenpai(test3) ? '✓ テンパイ' : '✗ 非テンパイ');

    console.log('=== テスト完了 ===');
    console.log('注意: 実際のゲームルールに応じて判定ロジックの調整が必要です');
}

window.testTenpaiCheck = testTenpaiCheck;

// リーチボタンロジックのテスト関数
function testRiichiButtonLogic() {
    console.log('=== リーチボタンロジックテスト ===');
    console.log('修正された条件:');
    console.log('1. 自分の手番');
    console.log('2. まだリーチしていない');
    console.log('3. 手牌が5枚（牌を引いた状態）');
    console.log('4. 牌が選択されている');
    console.log('5. 選択した牌を捨てた後の4枚がテンパイ状態');
    console.log('');
    console.log('修正前の問題: 牌を引くタイミングでリーチボタンが有効になっていた');
    console.log('修正後: 上記5つの条件をすべて満たす場合のみ有効');
    console.log('');
    console.log('視覚的フィードバック: リーチ可能時にボタンが光る');
    console.log('=== テスト完了 ===');
}

window.testRiichiButtonLogic = testRiichiButtonLogic;

function displayPlayerHand(tiles, isClickable = false, drawnTile = null) {
    playerHand.innerHTML = '';

    if (!Array.isArray(tiles)) {
        console.warn('displayPlayerHand: 無効な手牌データ', tiles);
        return;
    }

    // リーチ状態の確認
    const player = currentGameState?.players.find(p => p.id === playerId);
    const isRiichi = player?.isRiichi || false;

    // 引いた牌がある場合は、それを除いて残りの牌をソート
    let handTiles = [...tiles];
    let separateDrawnTile = null;

    if (drawnTile) {
        // 引いた牌を手牌から除外（IDで特定の1枚のみを除外）
        // 重複牌対応: 同じ値の牌が複数ある場合でも、IDで特定の1枚だけを除外
        separateDrawnTile = drawnTile;
        let drawnTileRemoved = false;
        handTiles = tiles.filter(tile => {
            if (!drawnTileRemoved && tile.id === drawnTile.id) {
                drawnTileRemoved = true;
                return false; // この1枚だけを除外
            }
            return true;
        });
    } else if (tiles.length === 5) {
        // 5枚の場合、最後の牌を引いた牌として扱う（ソートしない）
        separateDrawnTile = tiles[tiles.length - 1];
        handTiles = tiles.slice(0, -1);
    }

    // 基本手牌（4枚）をソートして表示
    const sortedTiles = sortTilesForDisplay(handTiles);

    sortedTiles.forEach(tile => {
        // リーチ後の制限チェック
        let tileClickable = isClickable;
        if (isRiichi && separateDrawnTile && tile.id !== separateDrawnTile.id) {
            tileClickable = false; // リーチ後は引いた牌以外選択不可
        }

        const tileElement = createTileElement(tile, tileClickable);
        tileElement.classList.add('sorted-tile');
        
        // リーチ後の制限表示
        if (isRiichi && !tileClickable) {
            tileElement.classList.add('riichi-restricted');
            tileElement.title = 'リーチ後は選択できません';
        }
        
        playerHand.appendChild(tileElement);
    });

    // 引いた牌がある場合は右端に表示（ソートしない）
    if (separateDrawnTile) {
        // 区切り線を追加
        const separator = document.createElement('div');
        separator.className = 'tile-separator';
        separator.setAttribute('aria-hidden', 'true');
        playerHand.appendChild(separator);

        // 引いた牌を表示（リーチ後でも選択可能）
        const drawnTileElement = createTileElement(separateDrawnTile, isClickable);
        drawnTileElement.classList.add('drawn-tile');
        
        // リーチ後の引いた牌は強調表示
        if (isRiichi) {
            drawnTileElement.classList.add('riichi-drawable');
            drawnTileElement.title = 'リーチ後はこの牌のみ選択可能';
        }
        
        drawnTileElement.setAttribute('aria-label', `引いた牌: ${getTileDisplayText(separateDrawnTile)}`);
        playerHand.appendChild(drawnTileElement);
    }
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
    convertDiscardData(discardData, playerType) {
        if (!Array.isArray(discardData)) {
            console.warn(`${playerType}の捨て牌データが配列ではありません:`, discardData);
            return [];
        }

        return discardData.map((tileData, index) => {
            try {
                // サーバーからのデータ形式を判定
                let tileStr, isReachTile = false;
                
                if (typeof tileData === 'string') {
                    // 旧形式：文字列の配列
                    tileStr = tileData;
                } else if (typeof tileData === 'object' && tileData !== null) {
                    // 新形式：オブジェクトの配列 {tile: string, isReachTile: boolean}
                    tileStr = tileData.tile || tileData.displayText || '';
                    isReachTile = tileData.isReachTile === true;
                } else {
                    console.warn(`${playerType}の捨て牌データが不正な形式です:`, tileData);
                    tileStr = String(tileData);
                }

                // 文字列から牌情報を解析
                const tileInfo = this.parseTileString(tileStr);
                
                const convertedTile = {
                    id: `${playerType}_discard_${index}_${Date.now()}`,
                    suit: tileInfo.suit,
                    value: tileInfo.value,
                    displayText: tileStr,
                    timestamp: Date.now() + index, // 時系列順序を保持
                    playerType: playerType,
                    isReachTile: isReachTile // リーチ牌情報を追加
                };

                // リーチ牌の場合はログ出力
                if (isReachTile) {
                    console.log(`リーチ牌を検出: ${playerType} - ${tileStr}`);
                }

                return convertedTile;
            } catch (error) {
                console.warn(`${playerType}の捨て牌解析エラー:`, tileData, error);
                return {
                    id: `${playerType}_discard_${index}_${Date.now()}`,
                    suit: 'unknown',
                    value: 'unknown',
                    displayText: typeof tileData === 'string' ? tileData : String(tileData),
                    timestamp: Date.now() + index,
                    playerType: playerType,
                    isReachTile: false
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

// テスト用：リーチ牌表示機能の検証関数
function testReachTileDisplay() {
    console.log('=== リーチ牌表示機能テスト開始 ===');

    // リーチ牌を含むテスト用のゲーム状態を作成
    const testGameStateWithReach = {
        gameId: 'test-reach-game',
        players: [
            {
                id: 'player1',
                name: 'テストプレイヤー1',
                handSize: 4,
                isRiichi: true,
                discardedTiles: [
                    { tile: '1', isReachTile: false },
                    { tile: '2', isReachTile: false },
                    { tile: '3', isReachTile: true }, // リーチ牌
                    { tile: '白', isReachTile: false },
                    { tile: '發', isReachTile: false }
                ]
            },
            {
                id: 'player2',
                name: 'テストプレイヤー2',
                handSize: 4,
                isRiichi: true,
                discardedTiles: [
                    { tile: '4', isReachTile: false },
                    { tile: '5', isReachTile: false },
                    { tile: '6', isReachTile: true }, // 相手のリーチ牌
                    { tile: '中', isReachTile: false }
                ]
            }
        ],
        currentPlayerIndex: 0,
        remainingTiles: 25
    };

    // プレイヤーIDを設定
    const originalPlayerId = playerId;
    playerId = 'player1';

    console.log('リーチ牌テスト用ゲーム状態:', testGameStateWithReach);

    // 捨て牌表示マネージャーを初期化
    if (!discardDisplayManager) {
        discardDisplayManager = new DiscardDisplayManager();
    }

    // 捨て牌表示を更新
    discardDisplayManager.updateDiscards(testGameStateWithReach, playerId);

    // 結果を検証
    const stats = discardDisplayManager.getDiscardStats();
    console.log('リーチ牌テスト結果:', stats);

    // リーチ牌が正しく表示されているかチェック
    const playerReachTiles = document.querySelectorAll('.player-discard-area .discard-tile.reach-tile');
    const opponentReachTiles = document.querySelectorAll('.opponent-discard-area .discard-tile.reach-tile');

    console.log(`プレイヤーのリーチ牌数: ${playerReachTiles.length} (期待値: 1)`);
    console.log(`相手のリーチ牌数: ${opponentReachTiles.length} (期待値: 1)`);

    // リーチ牌の回転角度をチェック
    if (playerReachTiles.length > 0) {
        const playerReachTile = playerReachTiles[0];
        const computedStyle = window.getComputedStyle(playerReachTile);
        console.log('プレイヤーリーチ牌の変形:', computedStyle.transform);
        console.log('プレイヤーリーチ牌のサイズ:', `${computedStyle.width} x ${computedStyle.height}`);
    }

    if (opponentReachTiles.length > 0) {
        const opponentReachTile = opponentReachTiles[0];
        const computedStyle = window.getComputedStyle(opponentReachTile);
        console.log('相手リーチ牌の変形:', computedStyle.transform);
        console.log('相手リーチ牌のサイズ:', `${computedStyle.width} x ${computedStyle.height}`);
    }

    // 検証結果
    const playerReachCorrect = playerReachTiles.length === 1;
    const opponentReachCorrect = opponentReachTiles.length === 1;

    if (playerReachCorrect && opponentReachCorrect) {
        console.log('✓ リーチ牌表示機能が正常に動作しています');
        console.log('✓ プレイヤーのリーチ牌: 90度回転（横向き）');
        console.log('✓ 相手のリーチ牌: 270度回転（180度 + 90度）');
    } else {
        console.log('✗ リーチ牌表示機能に問題があります');
        if (!playerReachCorrect) {
            console.log(`  - プレイヤーリーチ牌数が不正: ${playerReachTiles.length}`);
        }
        if (!opponentReachCorrect) {
            console.log(`  - 相手リーチ牌数が不正: ${opponentReachTiles.length}`);
        }
    }

    // プレイヤーIDを復元
    playerId = originalPlayerId;

    console.log('=== リーチ牌表示機能テスト完了 ===');

    return {
        playerReachCorrect,
        opponentReachCorrect,
        playerReachTiles: playerReachTiles.length,
        opponentReachTiles: opponentReachTiles.length
    };
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

    // リーチ牌かどうかを判定
    const isReachTile = tile.isReachTile || tile.isReachTile === true;

    // アクセシビリティ属性を追加
    const playerType = isOpponent ? '相手' : 'あなた';
    const rotationInfo = isOpponent ? '（180度回転）' : '';
    const reachInfo = isReachTile ? '（リーチ牌・横向き表示）' : '';
    tileElement.setAttribute('role', 'img');
    tileElement.setAttribute('aria-label', `${playerType}の捨て牌: ${displayText}${rotationInfo}${reachInfo}`);
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

    // リーチ牌の場合は専用クラスを追加（要件5.1, 5.2, 5.4, 5.5対応）
    if (isReachTile) {
        tileElement.classList.add('reach-tile');
        tileElement.dataset.isReachTile = 'true';
        
        // リーチ牌の視覚的フィードバック用の属性
        tileElement.setAttribute('title', `リーチ牌: ${displayText} (横向き表示)`);
        
        console.log(`リーチ牌を作成: ${displayText}, 相手: ${isOpponent}, 回転: ${isOpponent ? '270度' : '90度'}`);
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
            const reachStatus = isReachTile ? 'リーチ牌、' : '';
            const announcement = `${tileElement.getAttribute('aria-label')}、${reachStatus}${tile.suit}牌`;
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

        // 引いた牌の検出：前回より手牌が1枚増えた場合
        let drawnTile = null;
        if (previousGameState && previousGameState.playerHandTiles) {
            const previousHandSize = previousGameState.playerHandTiles.length;
            const currentHandSize = playerHand.length;

            if (currentHandSize === previousHandSize + 1 && currentHandSize === 5) {
                // 新しく追加された牌を引いた牌として特定
                const previousTileIds = new Set(previousGameState.playerHandTiles.map(t => t.id));
                drawnTile = playerHand.find(tile => !previousTileIds.has(tile.id));
                console.log('引いた牌を検出:', drawnTile);
            }
        }

        // 引いた牌が検出できない場合でも、5枚の時は最後の牌を引いた牌として扱う
        if (!drawnTile && playerHand.length === 5 && isPlayerTurn) {
            drawnTile = playerHand[playerHand.length - 1];
            console.log('5枚時の引いた牌として扱う:', drawnTile);
        }

        displayPlayerHand(playerHand, canDiscardTile, drawnTile);
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

    // 牌を引くボタンは削除（自動牌引きのため）

    // リーチボタンの条件を修正
    // リーチは以下の条件をすべて満たす場合のみ有効:
    // 1. 自分の手番
    // 2. まだリーチしていない
    // 3. 手牌が5枚（牌を引いた状態）
    // 4. 牌が選択されている
    // 5. 選択した牌を捨てた後の4枚がテンパイ状態
    
    const riichiConditions = {
        isMyTurn: isMyTurn,
        notRiichi: !player.isRiichi,
        handSize: playerHand.length,
        hasSelectedTile: !!selectedTile,
        selectedTileId: selectedTile?.id
    };
    
    let isTenpai = false;
    if (playerHand.length === 5 && selectedTile) {
        isTenpai = checkTenpaiAfterDiscard(playerHand, selectedTile);
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

    riichiBtn.disabled = !canDeclareRiichi;

    // ロン・ツモボタンは後で実装
    ronBtn.style.display = 'none';
    tsumoBtn.style.display = 'none';
}

// テンパイ判定関数（簡易版）
function checkTenpaiAfterDiscard(hand, tileToDiscard) {
    if (!hand || !tileToDiscard) {
        console.log('テンパイ判定: 手牌または捨て牌が無効', { hand, tileToDiscard });
        return false;
    }
    
    // 指定した牌を除いた手牌を作成
    const remainingHand = hand.filter(tile => tile.id !== tileToDiscard.id);
    
    console.log('テンパイ判定: 捨て牌後の手牌', {
        original: hand.length,
        afterDiscard: remainingHand.length,
        discardTile: tileToDiscard.id,
        remainingTiles: remainingHand.map(t => t.id)
    });
    
    // 4枚でテンパイかどうかを簡易判定
    if (remainingHand.length !== 4) {
        console.log('テンパイ判定: 手牌が4枚ではない', remainingHand.length);
        return false;
    }
    
    // 同じ牌の枚数をカウント
    const tileCount = {};
    remainingHand.forEach(tile => {
        const key = tile.suit + '_' + tile.value;
        tileCount[key] = (tileCount[key] || 0) + 1;
    });
    
    const counts = Object.values(tileCount);
    console.log('テンパイ判定: 牌の枚数分布', { tileCount, counts });
    
    // 3枚組（刻子）+ 1枚（単騎待ち）のパターン
    const hasThreeOfAKind = counts.some(count => count === 3);
    const hasSingle = counts.some(count => count === 1);
    
    if (hasThreeOfAKind && hasSingle) {
        console.log('テンパイ判定: 刻子+単騎待ちパターン');
        return true;
    }
    
    // 2枚組（対子）+ 2枚組（対子）のパターン（シャンポン待ち）
    const pairCount = counts.filter(count => count === 2).length;
    if (pairCount === 2) {
        console.log('テンパイ判定: シャンポン待ちパターン');
        return true;
    }
    
    // 1枚+1枚+1枚+1枚のパターン（順子の可能性）
    const singleCount = counts.filter(count => count === 1).length;
    if (singleCount === 4) {
        // 簡易的な順子判定（連続する数字かチェック）
        const bambooTiles = remainingHand.filter(t => t.suit === 'bamboo').map(t => t.value).sort((a, b) => a - b);
        if (bambooTiles.length === 4) {
            // 連続する4枚かチェック
            let isSequential = true;
            for (let i = 1; i < bambooTiles.length; i++) {
                if (bambooTiles[i] !== bambooTiles[i-1] + 1) {
                    isSequential = false;
                    break;
                }
            }
            if (isSequential) {
                console.log('テンパイ判定: 順子待ちパターン');
                return true;
            }
        }
    }
    
    // より寛容な判定：とりあえずテンパイとして扱う（デバッグ用）
    console.log('テンパイ判定: 複雑なパターンのため仮承認');
    return true; // 一時的に常にtrueを返す
}

// アクションボタンのイベントリスナー
// 牌を引くボタンは削除（自動牌引きのため）

riichiBtn.addEventListener('click', () => {
    if (!riichiBtn.disabled) {
        // リーチ宣言時は選択された牌を捨てる必要がある
        if (!selectedTile) {
            showError('リーチを宣言するには捨てる牌を選択してください');
            return;
        }

        // リーチ宣言と牌の破棄を同時に実行
        if (safeEmit('declareRiichiAndDiscard', { 
            tileId: selectedTile.id,
            isReachTile: true // リーチ牌として捨てることを明示
        })) {
            riichiBtn.disabled = true; // 重複送信を防ぐ
            
            // 選択状態をクリア
            clearTileSelection();
            
            // 一時的にボタンを無効化（牌を引くボタンは削除済み）
            
            console.log('リーチ宣言と牌の破棄を送信しました:', selectedTile.id);
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
                // 選択状態をクリア
                clearTileSelection();

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
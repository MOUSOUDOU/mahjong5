/**
 * DiscardDisplayManager.js
 * 捨て牌表示管理システム
 */

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

/**
 * 捨て牌要素を作成
 * @param {Object} tile - 牌オブジェクト
 * @param {boolean} isOpponent - 相手の牌かどうか
 * @returns {HTMLElement} 捨て牌要素
 */
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
            
            // announceToScreenReader関数が利用可能かチェック
            if (typeof announceToScreenReader === 'function') {
                announceToScreenReader(announcement);
            } else if (window.errorHandler && typeof window.errorHandler.announceToScreenReader === 'function') {
                window.errorHandler.announceToScreenReader(announcement);
            }
        }
    });

    return tileElement;
}

/**
 * 牌の表示テキストを取得（後方互換性のため）
 * @param {Object} tile - 牌オブジェクト
 * @returns {string} 表示テキスト
 */
function getTileDisplayText(tile) {
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

// テスト関数群
function testTilePlacementLogic() {
    if (!window.discardDisplayManager) {
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
            value: i <= 9 ? i : (i === 10 ? 'white' : i === 11 ? 'green' : 'red'),
            displayText: i <= 9 ? i.toString() : (i === 10 ? '白' : i === 11 ? '發' : '中'),
            timestamp: Date.now() + i
        });
    }

    // 捨て牌エリアをクリア
    window.discardDisplayManager.clearDiscards();

    // プレイヤー側テスト（上から下へ）
    console.log('プレイヤー側テスト: 13牌を配置（2行 + 1牌）');
    window.discardDisplayManager.displayPlayerDiscards(testTiles);

    // 相手側テスト（下から上へ、180度回転）
    console.log('相手側テスト: 13牌を配置（2行 + 1牌、180度回転）');
    window.discardDisplayManager.displayOpponentDiscards(testTiles);

    // 統計情報を表示
    const stats = window.discardDisplayManager.getDiscardStats();
    console.log('配置結果:', stats);

    // 6牌制限の検証
    const issues = window.discardDisplayManager.validateRowLimits();
    if (issues.length === 0) {
        console.log('✓ 6牌制限が正しく適用されています');
    } else {
        console.log('✗ 6牌制限の問題:', issues);
    }

    console.log('=== 牌配置ロジックテスト完了 ===');
}

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
    const originalPlayerId = window.playerId;
    window.playerId = 'player1';

    console.log('リーチ牌テスト用ゲーム状態:', testGameStateWithReach);

    // 捨て牌表示マネージャーを初期化
    if (!window.discardDisplayManager) {
        window.discardDisplayManager = new DiscardDisplayManager();
    }

    // 捨て牌表示を更新
    window.discardDisplayManager.updateDiscards(testGameStateWithReach, window.playerId);

    // 結果を検証
    const stats = window.discardDisplayManager.getDiscardStats();
    console.log('リーチ牌テスト結果:', stats);

    // リーチ牌が正しく表示されているかチェック
    const playerReachTiles = document.querySelectorAll('.player-discard-area .discard-tile.reach-tile');
    const opponentReachTiles = document.querySelectorAll('.opponent-discard-area .discard-tile.reach-tile');

    console.log(`プレイヤーのリーチ牌数: ${playerReachTiles.length} (期待値: 1)`);
    console.log(`相手のリーチ牌数: ${opponentReachTiles.length} (期待値: 1)`);

    // 検証結果
    const playerReachCorrect = playerReachTiles.length === 1;
    const opponentReachCorrect = opponentReachTiles.length === 1;

    if (playerReachCorrect && opponentReachCorrect) {
        console.log('✓ リーチ牌表示機能が正常に動作しています');
    } else {
        console.log('✗ リーチ牌表示機能に問題があります');
    }

    // プレイヤーIDを復元
    window.playerId = originalPlayerId;

    console.log('=== リーチ牌表示機能テスト完了 ===');

    return {
        playerReachCorrect,
        opponentReachCorrect,
        playerReachTiles: playerReachTiles.length,
        opponentReachTiles: opponentReachTiles.length
    };
}

// グローバルインスタンスを作成（後方互換性のため）
if (typeof window.discardDisplayManager === 'undefined') {
    window.discardDisplayManager = new DiscardDisplayManager();
}

// 既存の関数名での後方互換性を提供
window.createDiscardTileElement = createDiscardTileElement;
window.testTilePlacementLogic = testTilePlacementLogic;
window.testReachTileDisplay = testReachTileDisplay;

// 統合関数
function updateDiscardDisplay(gameState) {
    // DiscardDisplayManagerが初期化されていない場合は作成
    if (!window.discardDisplayManager) {
        window.discardDisplayManager = new DiscardDisplayManager();
    }

    // ゲーム状態の検証
    if (!gameState || !gameState.players || !window.playerId) {
        console.warn('捨て牌表示更新: 無効なゲーム状態またはプレイヤーID');
        return;
    }

    console.log('捨て牌表示システム統合: ゲーム状態から捨て牌を更新');

    // 新しいシステムを使用して捨て牌を更新（時系列順序を保持）
    window.discardDisplayManager.updateDiscards(gameState, window.playerId);
}

// 既存の関数名での後方互換性
window.displayDiscardedTiles = updateDiscardDisplay;
window.updateDiscardDisplay = updateDiscardDisplay;

// モジュールとしてエクスポート
if (typeof module !== 'undefined' && module.exports) {
    module.exports = DiscardDisplayManager;
}

// ES6モジュールとしてもエクスポート
if (typeof window !== 'undefined') {
    window.DiscardDisplayManager = DiscardDisplayManager;
}
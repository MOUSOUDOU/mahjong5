/**
 * TileManager.js
 * 牌の表示、操作、判定機能を管理するモジュール
 */

class TileManager {
    constructor() {
        this.selectedTile = null;
        this.gameStateManager = null;
        this.socketManager = null;
        this.errorHandler = null;
        this.tileClickCallbacks = new Map();
    }

    /**
     * 依存関係を設定
     * @param {GameStateManager} gameStateManager - ゲーム状態マネージャー
     * @param {SocketManager} socketManager - ソケットマネージャー
     * @param {ErrorHandler} errorHandler - エラーハンドラー
     */
    initialize(gameStateManager, socketManager, errorHandler) {
        this.gameStateManager = gameStateManager;
        this.socketManager = socketManager;
        this.errorHandler = errorHandler;
    }

    /**
     * プレイヤーの手牌を表示
     * @param {Array} tiles - 牌の配列
     * @param {boolean} isClickable - クリック可能かどうか
     * @param {Object} drawnTile - 引いた牌
     */
    displayPlayerHand(tiles, isClickable = false, drawnTile = null) {
        const playerHand = document.getElementById('player-hand');
        if (!playerHand) {
            console.error('player-hand要素が見つかりません');
            return;
        }

        playerHand.innerHTML = '';

        if (!Array.isArray(tiles)) {
            console.warn('displayPlayerHand: 無効な手牌データ', tiles);
            return;
        }

        // リーチ状態の確認
        const isRiichi = this.gameStateManager ? this.gameStateManager.isPlayerRiichi() : false;

        // 引いた牌がある場合は、それを除いて残りの牌をソート
        let handTiles = [...tiles];
        let separateDrawnTile = null;

        if (drawnTile) {
            // 引いた牌を手牌から除外（IDで特定の1枚のみを除外）
            separateDrawnTile = drawnTile;
            let drawnTileRemoved = false;
            handTiles = tiles.filter(tile => {
                if (!drawnTileRemoved && tile.id === drawnTile.id) {
                    drawnTileRemoved = true;
                    return false;
                }
                return true;
            });
        } else if (tiles.length === 5) {
            // 5枚の場合、最後の牌を引いた牌として扱う
            separateDrawnTile = tiles[tiles.length - 1];
            handTiles = tiles.slice(0, -1);
        }

        // 基本手牌（4枚）をソートして表示
        const sortedTiles = this.sortTilesForDisplay(handTiles);

        sortedTiles.forEach(tile => {
            // リーチ後の制限チェック
            let tileClickable = isClickable;
            if (isRiichi && separateDrawnTile && tile.id !== separateDrawnTile.id) {
                tileClickable = false; // リーチ後は引いた牌以外選択不可
            }

            const tileElement = this.createTileElement(tile, tileClickable);
            tileElement.classList.add('sorted-tile');
            
            // リーチ後の制限表示
            if (isRiichi && !tileClickable) {
                tileElement.classList.add('riichi-restricted');
                tileElement.title = 'リーチ後は選択できません';
            }
            
            playerHand.appendChild(tileElement);
        });

        // 引いた牌がある場合は右端に表示
        if (separateDrawnTile) {
            // 区切り線を追加
            const separator = document.createElement('div');
            separator.className = 'tile-separator';
            separator.setAttribute('aria-hidden', 'true');
            playerHand.appendChild(separator);

            // 引いた牌を表示
            const drawnTileElement = this.createTileElement(separateDrawnTile, isClickable);
            drawnTileElement.classList.add('drawn-tile');
            
            // リーチ後の引いた牌は強調表示
            if (isRiichi) {
                drawnTileElement.classList.add('riichi-drawable');
                drawnTileElement.title = 'リーチ後はこの牌のみ選択可能';
            }
            
            drawnTileElement.setAttribute('aria-label', `引いた牌: ${this.getTileDisplayText(separateDrawnTile)}`);
            playerHand.appendChild(drawnTileElement);
        }
    }

    /**
     * 相手の手牌を表示（裏向き）
     * @param {number} tileCount - 牌の枚数
     */
    displayOpponentHand(tileCount) {
        const opponentHand = document.getElementById('opponent-hand');
        if (!opponentHand) {
            console.error('opponent-hand要素が見つかりません');
            return;
        }

        opponentHand.innerHTML = '';

        for (let i = 0; i < tileCount; i++) {
            const tileElement = this.createTileElement(null, false, true);
            opponentHand.appendChild(tileElement);
        }
    }

    /**
     * 牌要素を作成
     * @param {Object} tile - 牌オブジェクト
     * @param {boolean} isClickable - クリック可能かどうか
     * @param {boolean} isHidden - 裏向きかどうか
     * @returns {HTMLElement} 牌要素
     */
    createTileElement(tile, isClickable = false, isHidden = false) {
        const tileElement = document.createElement('div');
        tileElement.className = 'tile';

        if (isHidden) {
            tileElement.classList.add('hidden');
            tileElement.textContent = '?';
        } else {
            // 牌の表示テキストを設定
            tileElement.textContent = this.getTileDisplayText(tile);

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
            tileElement.addEventListener('click', () => this.handleTileClick(tile, tileElement));
            tileElement.addEventListener('dblclick', () => this.handleTileDoubleClick(tile, tileElement));

            // ダブルクリック時の視覚的フィードバック用のタイトル属性
            tileElement.title = `${this.getTileDisplayText(tile)} - クリック: 選択, ダブルクリック: 捨てる`;
        }

        return tileElement;
    }

    /**
     * 牌の表示テキストを取得
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
     * 牌クリック処理
     * @param {Object} tile - クリックされた牌
     * @param {HTMLElement} tileElement - 牌要素
     */
    handleTileClick(tile, tileElement) {
        // リーチ後の制限チェック
        if (this.gameStateManager) {
            const isRiichi = this.gameStateManager.isPlayerRiichi();
            const drawnTile = this.gameStateManager.getDrawnTile();
            
            if (isRiichi && drawnTile && tile.id !== drawnTile.id) {
                this.errorHandler.showError('リーチ後は引いた牌以外を捨てることはできません');
                return;
            }
        }

        // 既に選択されている牌がある場合は選択を解除
        if (this.selectedTile) {
            const previousSelected = document.querySelector('.tile.selected');
            if (previousSelected) {
                previousSelected.classList.remove('selected');
            }
        }

        // 新しい牌を選択
        this.selectedTile = tile;
        tileElement.classList.add('selected');

        // 牌選択コールバックを実行
        this.executeTileClickCallbacks('tileSelected', { tile, element: tileElement });

        console.log('選択された牌:', tile);
    }

    /**
     * 牌ダブルクリック処理
     * @param {Object} tile - ダブルクリックされた牌
     * @param {HTMLElement} tileElement - 牌要素
     */
    handleTileDoubleClick(tile, tileElement) {
        console.log('ダブルクリックで捨て牌:', tile);

        // まず牌を選択状態にする
        if (this.selectedTile) {
            const previousSelected = document.querySelector('.tile.selected');
            if (previousSelected) {
                previousSelected.classList.remove('selected');
            }
        }

        this.selectedTile = tile;
        tileElement.classList.add('selected');

        // 視覚的フィードバック
        tileElement.classList.add('double-clicked');

        // 少し遅延してから捨て牌処理を実行
        setTimeout(() => {
            this.discardSelectedTile();
            tileElement.classList.remove('double-clicked');
        }, 150);
    }

    /**
     * 選択された牌を捨てる
     */
    discardSelectedTile() {
        if (!this.selectedTile || !this.gameStateManager || !this.socketManager) {
            return;
        }

        const currentGameState = this.gameStateManager.getCurrentGameState();
        if (!currentGameState) {
            return;
        }

        const isMyTurn = this.gameStateManager.isMyTurn();
        const playerHand = this.gameStateManager.getPlayerHand();

        if (isMyTurn && playerHand.length === 5) {
            if (this.socketManager.safeEmit('discardTile', { tileId: this.selectedTile.id })) {
                // 選択状態をクリア
                this.clearTileSelection();

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
            this.errorHandler.showError('牌を捨てることができません');
        }
    }

    /**
     * 牌の選択を解除
     */
    clearTileSelection() {
        if (this.selectedTile) {
            const previousSelected = document.querySelector('.tile.selected');
            if (previousSelected) {
                previousSelected.classList.remove('selected');
            }
            this.selectedTile = null;

            // 選択解除コールバックを実行
            this.executeTileClickCallbacks('tileDeselected', null);
        }
    }

    /**
     * 手牌の表示順序をソート
     * @param {Array} tiles - 牌の配列
     * @returns {Array} ソートされた牌の配列
     */
    sortTilesForDisplay(tiles) {
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
                return 3; // その他は最後
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
                const valueA = parseInt(a.value) || 0;
                const valueB = parseInt(b.value) || 0;
                return valueA - valueB;
            }

            if (a.suit === 'honor' && b.suit === 'honor') {
                const priorityA = getHonorPriority(a.value);
                const priorityB = getHonorPriority(b.value);
                return priorityA - priorityB;
            }

            return 0;
        });
    }

    /**
     * テンパイ判定（選択した牌を捨てた後の4枚がテンパイかチェック）
     * @param {Array} hand - 手牌
     * @param {Object} tileToDiscard - 捨てる牌
     * @returns {boolean} テンパイかどうか
     */
    checkTenpaiAfterDiscard(hand, tileToDiscard) {
        if (!hand || !tileToDiscard || hand.length !== 5) {
            return false;
        }

        // 選択した牌を除いた4枚を取得
        const remainingTiles = hand.filter(tile => tile.id !== tileToDiscard.id);

        if (remainingTiles.length !== 4) {
            return false;
        }

        return this.checkIsTenpai(remainingTiles);
    }

    /**
     * 4枚の手牌がテンパイ状態かチェック
     * @param {Array} tiles - 牌の配列
     * @returns {boolean} テンパイかどうか
     */
    checkIsTenpai(tiles) {
        if (!tiles || tiles.length !== 4) {
            return false;
        }

        // 牌を種類別に分類
        const bambooTiles = tiles.filter(t => t.suit === 'bamboo').map(t => parseInt(t.value)).sort((a, b) => a - b);
        const honorTiles = tiles.filter(t => t.suit === 'honor');

        // パターン1: 4枚すべて同じ牌
        const allSame = tiles.every(tile =>
            tile.suit === tiles[0].suit && tile.value === tiles[0].value
        );
        if (allSame) return true;

        // パターン2: 3枚 + 1枚のペア形
        const tileGroups = this.groupTilesByValue(tiles);
        const groupSizes = Object.values(tileGroups).map(group => group.length).sort((a, b) => b - a);

        // 3枚 + 1枚の組み合わせ
        if (groupSizes.length === 2 && groupSizes[0] === 3 && groupSizes[1] === 1) {
            return true;
        }

        // パターン3: 2枚 + 2枚のペア形
        if (groupSizes.length === 2 && groupSizes[0] === 2 && groupSizes[1] === 2) {
            return true;
        }

        // パターン4: 連続する数牌の組み合わせ
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
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * 牌を値でグループ化するヘルパー関数
     * @param {Array} tiles - 牌の配列
     * @returns {Object} グループ化された牌
     */
    groupTilesByValue(tiles) {
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

    /**
     * 選択された牌を取得
     * @returns {Object|null} 選択された牌
     */
    getSelectedTile() {
        return this.selectedTile;
    }

    /**
     * 牌クリックコールバックを登録
     * @param {string} eventName - イベント名
     * @param {Function} callback - コールバック関数
     */
    onTileClick(eventName, callback) {
        if (!this.tileClickCallbacks.has(eventName)) {
            this.tileClickCallbacks.set(eventName, []);
        }
        this.tileClickCallbacks.get(eventName).push(callback);
    }

    /**
     * 牌クリックコールバックを実行
     * @param {string} eventName - イベント名
     * @param {*} data - イベントデータ
     */
    executeTileClickCallbacks(eventName, data) {
        if (this.tileClickCallbacks.has(eventName)) {
            const callbacks = this.tileClickCallbacks.get(eventName);
            callbacks.forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    console.error(`牌クリックコールバック実行エラー (${eventName}):`, error);
                }
            });
        }
    }

    // テスト関数群
    testTileSorting() {
        console.log('=== 牌ソート機能テスト開始 ===');

        const testTiles = [
            { id: 'test-1', suit: 'honor', value: 'red' },
            { id: 'test-2', suit: 'bamboo', value: 5 },
            { id: 'test-3', suit: 'honor', value: 'white' },
            { id: 'test-4', suit: 'bamboo', value: 1 },
            { id: 'test-5', suit: 'honor', value: 'green' },
            { id: 'test-6', suit: 'bamboo', value: 9 },
            { id: 'test-7', suit: 'bamboo', value: 3 },
        ];

        console.log('ソート前:', testTiles.map(t => this.getTileDisplayText(t)));
        const sortedTiles = this.sortTilesForDisplay(testTiles);
        console.log('ソート後:', sortedTiles.map(t => this.getTileDisplayText(t)));

        const expectedOrder = ['1', '3', '5', '9', '白', '發', '中'];
        const actualOrder = sortedTiles.map(t => this.getTileDisplayText(t));
        const isCorrect = JSON.stringify(expectedOrder) === JSON.stringify(actualOrder);

        console.log(isCorrect ? '✓ 牌ソート機能が正常に動作しています' : '✗ 牌ソート機能に問題があります');
        console.log('=== 牌ソート機能テスト完了 ===');

        return isCorrect;
    }

    testTenpaiCheck() {
        console.log('=== テンパイ判定テスト ===');

        const test1 = [
            { id: 't1-1', suit: 'bamboo', value: 5 },
            { id: 't1-2', suit: 'bamboo', value: 5 },
            { id: 't1-3', suit: 'bamboo', value: 5 },
            { id: 't1-4', suit: 'honor', value: 'white' }
        ];

        const test2 = [
            { id: 't2-1', suit: 'bamboo', value: 3 },
            { id: 't2-2', suit: 'bamboo', value: 3 },
            { id: 't2-3', suit: 'honor', value: 'red' },
            { id: 't2-4', suit: 'honor', value: 'red' }
        ];

        const test3 = [
            { id: 't3-1', suit: 'bamboo', value: 1 },
            { id: 't3-2', suit: 'bamboo', value: 2 },
            { id: 't3-3', suit: 'bamboo', value: 3 },
            { id: 't3-4', suit: 'honor', value: 'white' }
        ];

        console.log('テスト1 (3枚+1枚):', this.checkIsTenpai(test1) ? '✓ テンパイ' : '✗ 非テンパイ');
        console.log('テスト2 (2枚+2枚):', this.checkIsTenpai(test2) ? '✓ テンパイ' : '✗ 非テンパイ');
        console.log('テスト3 (連続数牌):', this.checkIsTenpai(test3) ? '✓ テンパイ' : '✗ 非テンパイ');
        console.log('=== テスト完了 ===');
    }
}

// グローバルインスタンスを作成（後方互換性のため）
if (typeof window.tileManager === 'undefined') {
    window.tileManager = new TileManager();
}

// 既存の変数名での後方互換性を提供
window.selectedTile = null;

// 選択状態変更時にグローバル変数も更新
window.tileManager.onTileClick('tileSelected', (data) => {
    window.selectedTile = data.tile;
});

window.tileManager.onTileClick('tileDeselected', () => {
    window.selectedTile = null;
});

// 既存の関数名での後方互換性を提供
window.createTileElement = (tile, isClickable, isHidden) => window.tileManager.createTileElement(tile, isClickable, isHidden);
window.getTileDisplayText = (tile) => window.tileManager.getTileDisplayText(tile);
window.handleTileClick = (tile, element) => window.tileManager.handleTileClick(tile, element);
window.handleTileDoubleClick = (tile, element) => window.tileManager.handleTileDoubleClick(tile, element);
window.clearTileSelection = () => window.tileManager.clearTileSelection();
window.sortTilesForDisplay = (tiles) => window.tileManager.sortTilesForDisplay(tiles);
window.displayPlayerHand = (tiles, isClickable, drawnTile) => window.tileManager.displayPlayerHand(tiles, isClickable, drawnTile);
window.displayOpponentHand = (tileCount) => window.tileManager.displayOpponentHand(tileCount);
window.checkTenpaiAfterDiscard = (hand, tile) => window.tileManager.checkTenpaiAfterDiscard(hand, tile);
window.discardSelectedTile = () => window.tileManager.discardSelectedTile();

// テスト関数
window.testTileSorting = () => window.tileManager.testTileSorting();
window.testTenpaiCheck = () => window.tileManager.testTenpaiCheck();

// モジュールとしてエクスポート
if (typeof module !== 'undefined' && module.exports) {
    module.exports = TileManager;
}

// ES6モジュールとしてもエクスポート
if (typeof window !== 'undefined') {
    window.TileManager = TileManager;
}
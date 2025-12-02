/**
 * WinningManager.js
 * 上がり判定と上がり宣言の管理を行うモジュール
 */

class WinningManager {
    constructor() {
        this.gameStateManager = null;
        this.socketManager = null;
        this.errorHandler = null;
        this.tsumoBtn = null;
        this.ronBtn = null;
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

        // ボタン要素を取得
        this.tsumoBtn = document.getElementById('tsumo-btn');
        this.ronBtn = document.getElementById('ron-btn');

        if (!this.tsumoBtn || !this.ronBtn) {
            console.error('上がり宣言ボタンが見つかりません');
        }
    }

    /**
     * 上がり宣言ボタンの状態を更新
     * @param {Object} gameState - ゲーム状態
     * @param {boolean} isMyTurn - 自分の手番かどうか
     */
    updateWinningButtons(gameState, isMyTurn) {
        if (!this.gameStateManager) {
            this.hideWinningButtons();
            return;
        }

        if (!gameState) {
            console.log('上がり判定: ゲーム状態がありません');
            this.hideWinningButtons();
            return;
        }

        const player = this.gameStateManager.getCurrentPlayer();
        const playerHand = this.gameStateManager.getPlayerHand();
        
        if (!player) {
            this.hideWinningButtons();
            return;
        }

        if (!Array.isArray(playerHand)) {
            console.log('上がり判定: 手牌データが配列ではありません', typeof playerHand);
            this.hideWinningButtons();
            return;
        }

        // ツモ判定（要件4.1）
        const canTsumo = this.checkCanTsumo(player, playerHand, isMyTurn);
        
        // ロン判定（要件4.2）
        const canRon = this.checkCanRon(player, gameState, isMyTurn);
        
        console.log('上がり判定:', {
            playerId: player.id,
            isMyTurn,
            isRiichi: player.isRiichi,
            handSize: playerHand.length,
            canTsumo,
            canRon
        });

        this.showWinningOptions(canTsumo, canRon);
    }

    /**
     * ツモ上がりが可能かチェック
     * @param {Object} player - プレイヤー情報
     * @param {Array} playerHand - プレイヤーの手牌
     * @param {boolean} isMyTurn - 自分の手番かどうか
     * @returns {boolean} ツモ可能かどうか
     */
    checkCanTsumo(player, playerHand, isMyTurn) {
        // 条件チェック
        if (!isMyTurn || !player.isRiichi || playerHand.length !== 5) {
            return false;
        }

        // 5枚の手牌が完成形かチェック
        return this.checkWinningHand(playerHand);
    }

    /**
     * ロン上がりが可能かチェック
     * @param {Object} player - プレイヤー情報
     * @param {Object} gameState - ゲーム状態
     * @param {boolean} isMyTurn - 自分の手番かどうか
     * @returns {boolean} ロン可能かどうか
     */
    checkCanRon(player, gameState, isMyTurn) {
        // 入力検証
        if (!player) {
            console.log('ロン判定: プレイヤー情報がありません');
            return false;
        }

        if (!gameState) {
            console.log('ロン判定: ゲーム状態がありません');
            return false;
        }

        // リーチしていない場合はロンできない
        if (!player.isRiichi) {
            console.log('ロン判定: リーチしていません');
            return false;
        }

        // 手牌が4枚でない場合はロンできない（相手が牌を捨てた直後の状態）
        const playerHand = gameState.playerHandTiles || [];
        if (!Array.isArray(playerHand)) {
            console.log('ロン判定: 手牌データが配列ではありません', typeof playerHand);
            return false;
        }

        if (playerHand.length !== 4) {
            console.log('ロン判定: 手牌が4枚ではありません', playerHand.length);
            return false;
        }

        // 最後に捨てられた牌を取得（直接指定されている場合はそれを使用）
        let lastDiscardedTile = gameState.lastDiscardedTile;
        
        if (!lastDiscardedTile) {
            // 相手が最後に捨てた牌を取得
            const opponent = gameState.players.find(p => p.id !== this.gameStateManager.getPlayerId());
            if (!opponent || !opponent.discardedTiles || opponent.discardedTiles.length === 0) {
                console.log('ロン判定: 相手の捨て牌がありません');
                return false;
            }
            lastDiscardedTile = opponent.discardedTiles[opponent.discardedTiles.length - 1];
        }
        
        // 待ち牌を計算
        const waitingTiles = this.checkTenpai(playerHand);
        
        // 最後に捨てられた牌の詳細ログ
        let lastDiscardedTileText = 'undefined';
        if (lastDiscardedTile) {
            if (typeof lastDiscardedTile === 'string') {
                lastDiscardedTileText = lastDiscardedTile;
            } else if (typeof lastDiscardedTile === 'object') {
                if (lastDiscardedTile.tile) {
                    lastDiscardedTileText = lastDiscardedTile.tile;
                } else {
                    lastDiscardedTileText = this.getTileDisplayText(lastDiscardedTile);
                }
            }
        }

        console.log('ロン判定詳細:', {
            isMyTurn,
            isRiichi: player.isRiichi,
            handSize: playerHand.length,
            playerHand: playerHand.map(t => this.getTileDisplayText(t)),
            lastDiscardedTile: lastDiscardedTileText,
            lastDiscardedTileRaw: lastDiscardedTile,
            waitingTiles: waitingTiles.map(t => this.getTileDisplayText(t))
        });
        
        // 最後に捨てられた牌が待ち牌に含まれているかチェック
        const canRon = waitingTiles.some(waitingTile => {
            return this.isSameTile(waitingTile, lastDiscardedTile);
        });
        
        console.log('ロン判定結果:', canRon);
        return canRon;
    }

    /**
     * 5枚の手牌が完成形かチェック
     * @param {Array} tiles - 牌の配列
     * @returns {boolean} 完成形かどうか
     */
    checkWinningHand(tiles) {
        if (!tiles || tiles.length !== 5) {
            return false;
        }

        // 牌の種類と枚数を集計
        const tileCount = {};
        tiles.forEach(tile => {
            const key = `${tile.suit}_${tile.value}`;
            tileCount[key] = (tileCount[key] || 0) + 1;
        });

        const counts = Object.values(tileCount).sort((a, b) => b - a);
        
        // パターン1: 3枚 + 2枚（刻子 + 対子）
        if (counts.length === 2 && counts[0] === 3 && counts[1] === 2) {
            console.log('完成形判定: 刻子+対子パターン');
            return true;
        }

        // パターン2: 順子 + 対子（より複雑な判定が必要）
        if (counts.length >= 3) {
            // 簡易的な順子判定
            const bambooTiles = tiles.filter(t => t.suit === 'bamboo').map(t => t.value).sort((a, b) => a - b);
            if (bambooTiles.length >= 3) {
                // 連続する3枚があるかチェック
                for (let i = 0; i <= bambooTiles.length - 3; i++) {
                    if (bambooTiles[i + 1] === bambooTiles[i] + 1 && 
                        bambooTiles[i + 2] === bambooTiles[i] + 2) {
                        
                        // 残りの牌が対子かチェック
                        const sequenceTiles = [bambooTiles[i], bambooTiles[i + 1], bambooTiles[i + 2]];
                        const remainingTiles = tiles.filter(tile => {
                            if (tile.suit !== 'bamboo') return true;
                            const index = sequenceTiles.indexOf(tile.value);
                            if (index !== -1) {
                                sequenceTiles.splice(index, 1);
                                return false;
                            }
                            return true;
                        });
                        
                        if (remainingTiles.length === 2 && 
                            remainingTiles[0].suit === remainingTiles[1].suit &&
                            remainingTiles[0].value === remainingTiles[1].value) {
                            console.log('完成形判定: 順子+対子パターン');
                            return true;
                        }
                    }
                }
            }
        }

        return false;
    }

    /**
     * 4枚の手牌のテンパイ判定
     * @param {Array} tiles - 牌の配列
     * @returns {Array} 待ち牌の配列
     */
    checkTenpai(tiles) {
        if (!tiles || tiles.length !== 4) {
            return [];
        }

        const waitingTiles = [];
        
        // 全ての可能な牌を試して完成形になるかチェック
        const possibleTiles = this.getAllPossibleTiles();
        
        for (const testTile of possibleTiles) {
            const testHand = [...tiles, testTile];
            if (this.checkWinningHand(testHand)) {
                waitingTiles.push(testTile);
            }
        }
        
        return waitingTiles;
    }

    /**
     * 全ての可能な牌を生成
     * @returns {Array} 可能な牌の配列
     */
    getAllPossibleTiles() {
        const tiles = [];
        
        // 索子1-9
        for (let value = 1; value <= 9; value++) {
            tiles.push({ suit: 'bamboo', value: value });
        }
        
        // 字牌
        const honorValues = ['white', 'green', 'red'];
        for (const value of honorValues) {
            tiles.push({ suit: 'honor', value: value });
        }
        
        return tiles;
    }

    /**
     * 2つの牌が同じかチェック
     * @param {Object} tile1 - 牌1
     * @param {Object|string} tile2 - 牌2
     * @returns {boolean} 同じ牌かどうか
     */
    isSameTile(tile1, tile2) {
        let result;
        
        if (typeof tile2 === 'string') {
            // 文字列形式の場合は表示テキストで比較
            const tile1Text = this.getTileDisplayText(tile1);
            
            // 牌の表記を正規化（"8索" -> "8", "白" -> "白" など）
            let tile2Normalized = this.normalizeTileText(tile2);
            
            result = tile1Text === tile2Normalized;
            console.log('牌比較（文字列）:', { tile1Text, tile2, tile2Normalized, result });
        } else if (typeof tile2 === 'object' && tile2 !== null) {
            // オブジェクト形式の場合
            if (tile2.tile) {
                // {tile: "發", isReachTile: true} 形式の場合
                const tile1Text = this.getTileDisplayText(tile1);
                
                // 牌の表記を正規化
                let tile2Normalized = this.normalizeTileText(tile2.tile);
                
                result = tile1Text === tile2Normalized;
                console.log('牌比較（オブジェクト.tile）:', { tile1Text, tile2: tile2.tile, tile2Normalized, result });
            } else {
                // 通常のタイルオブジェクト形式
                result = tile1.suit === tile2.suit && tile1.value === tile2.value;
                console.log('牌比較（オブジェクト）:', { 
                    tile1: { suit: tile1.suit, value: tile1.value }, 
                    tile2: { suit: tile2.suit, value: tile2.value }, 
                    result 
                });
            }
        } else {
            result = false;
            console.log('牌比較（不明な形式）:', { tile1, tile2, result });
        }
        
        return result;
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
     * 牌のテキスト表記を正規化
     * @param {string} tileText - 牌のテキスト表記
     * @returns {string} 正規化されたテキスト
     */
    normalizeTileText(tileText) {
        if (!tileText || typeof tileText !== 'string') {
            return tileText;
        }

        // "8索" -> "8" のような変換
        if (tileText.endsWith('索')) {
            return tileText.replace('索', '');
        }
        
        // "8筒" -> "8" のような変換（筒子の場合）
        if (tileText.endsWith('筒')) {
            return tileText.replace('筒', '');
        }
        
        // "8万" -> "8" のような変換（万子の場合）
        if (tileText.endsWith('万')) {
            return tileText.replace('万', '');
        }

        // 字牌はそのまま返す
        return tileText;
    }

    /**
     * 上がり宣言ボタンを表示/非表示
     * @param {boolean} canTsumo - ツモ可能かどうか
     * @param {boolean} canRon - ロン可能かどうか
     */
    showWinningOptions(canTsumo, canRon) {
        if (!this.tsumoBtn || !this.ronBtn) {
            console.error('上がり宣言ボタンが見つかりません');
            return;
        }

        if (canTsumo) {
            this.tsumoBtn.style.display = 'inline-block';
            this.tsumoBtn.disabled = false;
            this.tsumoBtn.onclick = () => {
                if (this.socketManager.safeEmit('declareWin', { type: 'tsumo' })) {
                    this.tsumoBtn.disabled = true;
                    // 上がり宣言後は手牌を固定表示
                    const playerHand = this.gameStateManager.getPlayerHand();
                    if (playerHand.length > 0 && window.tileManager) {
                        window.tileManager.displayPlayerHand(playerHand, false); // クリック不可にして固定表示
                    }
                    this.errorHandler.showMessage('ツモ宣言しました！', 3000);
                    console.log('ツモ宣言を送信しました');
                }
            };
        } else {
            this.tsumoBtn.style.display = 'none';
        }

        if (canRon) {
            this.ronBtn.style.display = 'inline-block';
            this.ronBtn.disabled = false;
            this.ronBtn.onclick = () => {
                // ロン待機状態をキャンセル
                this.socketManager.safeEmit('cancelRonWaiting', { 
                    playerId: this.gameStateManager.getPlayerId() 
                });
                
                if (this.socketManager.safeEmit('declareWin', { type: 'ron' })) {
                    this.ronBtn.disabled = true;
                    // 上がり宣言後は手牌を固定表示
                    const playerHand = this.gameStateManager.getPlayerHand();
                    if (playerHand.length > 0 && window.tileManager) {
                        window.tileManager.displayPlayerHand(playerHand, false); // クリック不可にして固定表示
                    }
                    this.errorHandler.showMessage('ロン宣言しました！', 3000);
                    console.log('ロン宣言を送信しました');
                }
            };
        } else {
            this.ronBtn.style.display = 'none';
        }
    }

    /**
     * 上がり宣言ボタンを非表示
     */
    hideWinningButtons() {
        // ロン待機状態をキャンセル
        if (this.socketManager && this.gameStateManager) {
            this.socketManager.safeEmit('cancelRonWaiting', { 
                playerId: this.gameStateManager.getPlayerId() 
            });
        }
        
        if (this.tsumoBtn) {
            this.tsumoBtn.style.display = 'none';
        }
        if (this.ronBtn) {
            this.ronBtn.style.display = 'none';
        }
    }

    /**
     * 上がり形のタイプを分析
     * @param {Array} tiles - 牌の配列
     * @returns {string} 上がり形のタイプ
     */
    analyzeWinningHandType(tiles) {
        if (!tiles || tiles.length !== 5) {
            return '不明';
        }

        // 牌の種類と枚数を集計
        const tileCount = {};
        tiles.forEach(tile => {
            const key = `${tile.suit}_${tile.value}`;
            tileCount[key] = (tileCount[key] || 0) + 1;
        });

        const counts = Object.values(tileCount).sort((a, b) => b - a);
        
        // 3枚 + 2枚（刻子 + 対子）
        if (counts.length === 2 && counts[0] === 3 && counts[1] === 2) {
            return '刻子 + 対子';
        }

        // 順子 + 対子の可能性をチェック
        const bambooTiles = tiles.filter(t => t.suit === 'bamboo').map(t => t.value).sort((a, b) => a - b);
        if (bambooTiles.length >= 3) {
            // 連続する3枚があるかチェック
            for (let i = 0; i <= bambooTiles.length - 3; i++) {
                if (bambooTiles[i + 1] === bambooTiles[i] + 1 && 
                    bambooTiles[i + 2] === bambooTiles[i] + 2) {
                    return '順子 + 対子';
                }
            }
        }

        return '特殊形';
    }

    /**
     * 結果画面用の牌要素を作成
     * @param {Object} tile - 牌オブジェクト
     * @param {Object} winningTile - 上がり牌
     * @returns {HTMLElement} 牌要素
     */
    createResultTileElement(tile, winningTile) {
        const tileElement = document.createElement('div');
        tileElement.className = 'result-tile';
        
        // 上がり牌かどうかを判定
        const isWinningTile = winningTile && 
            tile.suit === winningTile.suit && 
            tile.value === winningTile.value;
        
        tileElement.style.cssText = `
            width: 30px;
            height: 42px;
            background-color: ${isWinningTile ? '#ffd700' : '#f5f5f5'};
            border: 2px solid ${isWinningTile ? '#ff6b35' : '#333'};
            border-radius: 4px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: bold;
            font-size: 14px;
            color: #333;
            position: relative;
            ${isWinningTile ? 'box-shadow: 0 0 10px rgba(255, 107, 53, 0.5);' : ''}
        `;

        tileElement.textContent = this.getTileDisplayText(tile);

        // 上がり牌にマークを追加
        if (isWinningTile) {
            const mark = document.createElement('div');
            mark.style.cssText = `
                position: absolute;
                top: -8px;
                right: -8px;
                width: 16px;
                height: 16px;
                background-color: #ff6b35;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 10px;
                color: white;
                font-weight: bold;
            `;
            mark.textContent = '★';
            tileElement.appendChild(mark);
        }

        return tileElement;
    }

    /**
     * 上がり形表示エリアを作成
     * @param {Array} winningHand - 上がり形の手牌
     * @param {Object} winningTile - 上がり牌
     * @param {boolean} isWinner - 勝者かどうか
     * @returns {HTMLElement} 上がり形表示エリア
     */
    createWinningHandDisplay(winningHand, winningTile, isWinner) {
        const container = document.createElement('div');
        container.className = 'winning-hand-display';
        container.style.cssText = `
            margin: 20px 0;
            padding: 15px;
            background-color: rgba(255, 255, 255, 0.1);
            border-radius: 8px;
            border: 2px solid ${isWinner ? '#4caf50' : '#f44336'};
        `;

        // タイトル
        const title = document.createElement('h3');
        title.textContent = isWinner ? 'あなたの上がり形' : '相手の上がり形';
        title.style.cssText = `
            margin: 0 0 10px 0;
            color: ${isWinner ? '#4caf50' : '#f44336'};
            font-size: 16px;
            text-align: center;
        `;
        container.appendChild(title);

        // 手牌表示エリア
        const handArea = document.createElement('div');
        handArea.className = 'winning-hand-tiles';
        handArea.style.cssText = `
            display: flex;
            justify-content: center;
            align-items: center;
            gap: 5px;
            flex-wrap: wrap;
            margin-bottom: 10px;
        `;

        // 手牌をソートして表示
        const sortedHand = this.sortTilesForDisplay(winningHand);
        sortedHand.forEach((tile, index) => {
            const tileElement = this.createResultTileElement(tile, winningTile);
            handArea.appendChild(tileElement);
        });

        container.appendChild(handArea);

        // 完成形の説明
        const explanation = document.createElement('div');
        explanation.style.cssText = `
            text-align: center;
            font-size: 14px;
            color: #ccc;
            margin-top: 10px;
        `;
        
        const handType = this.analyzeWinningHandType(sortedHand);
        explanation.textContent = `完成形: ${handType}`;
        container.appendChild(explanation);

        return container;
    }

    /**
     * 手牌をソート（TileManagerから借用）
     * @param {Array} tiles - 牌の配列
     * @returns {Array} ソートされた牌の配列
     */
    sortTilesForDisplay(tiles) {
        if (!Array.isArray(tiles)) {
            return [];
        }

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
            const getSuitPriority = (tile) => {
                if (tile.suit === 'bamboo') return 1;
                if (tile.suit === 'honor') return 2;
                return 3;
            };

            const getHonorPriority = (value) => {
                switch (value) {
                    case 'white': return 1;
                    case 'green': return 2;
                    case 'red': return 3;
                    default: return 4;
                }
            };

            const suitPriorityA = getSuitPriority(a);
            const suitPriorityB = getSuitPriority(b);

            if (suitPriorityA !== suitPriorityB) {
                return suitPriorityA - suitPriorityB;
            }

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
}

// グローバルインスタンスを作成（後方互換性のため）
if (typeof window.winningManager === 'undefined') {
    window.winningManager = new WinningManager();
}

// 既存の関数名での後方互換性を提供
window.updateWinningButtons = (gameState, isMyTurn) => window.winningManager.updateWinningButtons(gameState, isMyTurn);
window.checkCanTsumo = (player, hand, isMyTurn) => window.winningManager.checkCanTsumo(player, hand, isMyTurn);
window.checkCanRon = (player, gameState, isMyTurn) => window.winningManager.checkCanRon(player, gameState, isMyTurn);
window.checkWinningHand = (tiles) => window.winningManager.checkWinningHand(tiles);
window.checkTenpai = (tiles) => window.winningManager.checkTenpai(tiles);
window.getAllPossibleTiles = () => window.winningManager.getAllPossibleTiles();
window.isSameTile = (tile1, tile2) => window.winningManager.isSameTile(tile1, tile2);
window.showWinningOptions = (canTsumo, canRon) => window.winningManager.showWinningOptions(canTsumo, canRon);
window.hideWinningButtons = () => window.winningManager.hideWinningButtons();
window.analyzeWinningHandType = (tiles) => window.winningManager.analyzeWinningHandType(tiles);
window.createWinningHandDisplay = (winningHand, winningTile, isWinner) => window.winningManager.createWinningHandDisplay(winningHand, winningTile, isWinner);
window.createResultTileElement = (tile, winningTile) => window.winningManager.createResultTileElement(tile, winningTile);

// モジュールとしてエクスポート
if (typeof module !== 'undefined' && module.exports) {
    module.exports = WinningManager;
}

// ES6モジュールとしてもエクスポート
if (typeof window !== 'undefined') {
    window.WinningManager = WinningManager;
}
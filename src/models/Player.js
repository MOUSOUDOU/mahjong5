/**
 * プレイヤークラス - ゲームのプレイヤーを表現
 */
class Player {
  /**
   * @param {string} id - プレイヤーID
   * @param {string} name - プレイヤー名
   */
  constructor(id, name) {
    this.id = id;
    this.name = name;
    this.hand = [];           // 手牌（最大5枚）
    this.isRiichi = false;    // リーチ状態
    this.reachTileIndex = -1; // リーチ牌のインデックス（-1は未設定）
    this.discardedTiles = []; // 捨て牌
  }

  /**
   * 手牌に牌を追加
   * @param {Tile} tile - 追加する牌
   * @returns {boolean} 追加に成功したかどうか
   */
  addTileToHand(tile) {
    if (this.hand.length < 5) {
      this.hand.push(tile);
      return true;
    }
    return false;
  }

  /**
   * 手牌から牌を削除
   * @param {string} tileId - 削除する牌のID
   * @returns {Tile|null} 削除された牌
   */
  removeTileFromHand(tileId) {
    const index = this.hand.findIndex(tile => tile.id === tileId);
    if (index !== -1) {
      return this.hand.splice(index, 1)[0];
    }
    return null;
  }

  /**
   * インデックスで手牌から牌を削除
   * @param {number} index - 削除する牌のインデックス
   * @returns {Tile|null} 削除された牌
   */
  removeTileFromHandByIndex(index) {
    if (index >= 0 && index < this.hand.length) {
      return this.hand.splice(index, 1)[0];
    }
    return null;
  }

  /**
   * 牌を捨てる
   * @param {Tile} tile - 捨てる牌
   * @param {boolean} isReachTile - リーチ牌かどうか（デフォルト: false）
   */
  discardTile(tile, isReachTile = false) {
    this.discardedTiles.push(tile);
    if (isReachTile) {
      this.reachTileIndex = this.discardedTiles.length - 1;
    }
  }

  /**
   * 手牌から牌を捨てる（削除と捨て牌への追加を同時実行）
   * @param {string} tileId - 捨てる牌のID
   * @param {boolean} isReachTile - リーチ牌かどうか（デフォルト: false）
   * @returns {Tile|null} 捨てられた牌
   */
  discardTileFromHand(tileId, isReachTile = false) {
    const tile = this.removeTileFromHand(tileId);
    if (tile) {
      this.discardTile(tile, isReachTile);
    }
    return tile;
  }

  /**
   * インデックスで手牌から牌を捨てる
   * @param {number} index - 捨てる牌のインデックス
   * @param {boolean} isReachTile - リーチ牌かどうか（デフォルト: false）
   * @returns {Tile|null} 捨てられた牌
   */
  discardTileFromHandByIndex(index, isReachTile = false) {
    const tile = this.removeTileFromHandByIndex(index);
    if (tile) {
      this.discardTile(tile, isReachTile);
    }
    return tile;
  }

  /**
   * リーチを宣言
   */
  declareRiichi() {
    this.isRiichi = true;
  }

  /**
   * リーチを宣言（リーチ牌追跡用）
   * 次に捨てる牌がリーチ牌としてマークされる
   */
  declareReach() {
    this.isRiichi = true;
  }

  /**
   * 手牌の数を取得
   * @returns {number} 手牌の数
   */
  getHandSize() {
    return this.hand.length;
  }

  /**
   * 手牌を表示用の文字列配列で取得
   * @returns {string[]} 手牌の表示用文字列配列
   */
  getHandDisplay() {
    return this.hand.map(tile => tile.toString());
  }

  /**
   * 捨て牌を表示用の文字列配列で取得
   * @returns {string[]} 捨て牌の表示用文字列配列
   */
  getDiscardedTilesDisplay() {
    return this.discardedTiles.map((tile, index) => ({
      tile: tile.toString(),
      isReachTile: index === this.reachTileIndex
    }));
  }

  /**
   * 手牌が満杯かどうかを判定
   * @returns {boolean} 手牌が5枚かどうか
   */
  isHandFull() {
    return this.hand.length >= 5;
  }

  /**
   * 特定の牌が手牌にあるかどうかを判定
   * @param {string} tileId - 検索する牌のID
   * @returns {boolean} 牌が手牌にあるかどうか
   */
  hasTileInHand(tileId) {
    return this.hand.some(tile => tile.id === tileId);
  }

  /**
   * プレイヤーの状態をリセット
   */
  reset() {
    this.hand = [];
    this.isRiichi = false;
    this.reachTileIndex = -1;
    this.discardedTiles = [];
  }
}

module.exports = Player;
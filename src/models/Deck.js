const Tile = require('./Tile');

/**
 * 牌デッキクラス - 麻雀の山牌を管理
 */
class Deck {
  constructor() {
    this.tiles = [];
    this.initialize();
  }

  /**
   * デッキを初期化（索子1-9各4枚、白發中各4枚、計48枚）
   */
  initialize() {
    this.tiles = [];
    
    // 索子1-9を各4枚ずつ追加
    for (let value = 1; value <= 9; value++) {
      for (let count = 0; count < 4; count++) {
        this.tiles.push(new Tile('bamboo', value));
      }
    }
    
    // 字牌（白發中）を各4枚ずつ追加
    const honorTiles = ['white', 'green', 'red'];
    for (const value of honorTiles) {
      for (let count = 0; count < 4; count++) {
        this.tiles.push(new Tile('honor', value));
      }
    }
    
    // デッキをシャッフル
    this.shuffle();
  }

  /**
   * デッキをシャッフル（Fisher-Yates アルゴリズム）
   */
  shuffle() {
    for (let i = this.tiles.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.tiles[i], this.tiles[j]] = [this.tiles[j], this.tiles[i]];
    }
  }

  /**
   * 山から1枚牌を引く
   * @returns {Tile|null} 引いた牌、山が空の場合はnull
   */
  drawTile() {
    return this.tiles.pop() || null;
  }

  /**
   * 残り牌数を取得
   * @returns {number} 残り牌数
   */
  getRemainingCount() {
    return this.tiles.length;
  }

  /**
   * 山が空かどうかを判定
   * @returns {boolean} 山が空かどうか
   */
  isEmpty() {
    return this.tiles.length === 0;
  }

  /**
   * デッキの状態をリセット
   */
  reset() {
    this.initialize();
  }
}

module.exports = Deck;
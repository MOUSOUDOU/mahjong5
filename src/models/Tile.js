/**
 * 牌クラス - 麻雀の牌を表現
 */
class Tile {
  /**
   * @param {string} suit - 牌の種類 ('bamboo' | 'honor')
   * @param {string|number} value - 牌の値 (1-9 for bamboo, 'white'|'green'|'red' for honor)
   */
  constructor(suit, value) {
    this.suit = suit;
    this.value = value;
    this.id = `${suit}_${value}`;
  }

  /**
   * 牌の表示用文字列を取得
   * @returns {string} 表示用文字列
   */
  toString() {
    if (this.suit === 'bamboo') {
      return `${this.value}索`;
    } else if (this.suit === 'honor') {
      const honorMap = {
        'white': '白',
        'green': '發',
        'red': '中'
      };
      return honorMap[this.value] || this.value;
    }
    return this.id;
  }

  /**
   * 牌が同じかどうかを判定
   * @param {Tile} other - 比較対象の牌
   * @returns {boolean} 同じ牌かどうか
   */
  equals(other) {
    return this.suit === other.suit && this.value === other.value;
  }
}

module.exports = Tile;
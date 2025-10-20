/**
 * 手牌評価クラス - 完成形判定とテンパイ判定を行う
 */
class HandEvaluator {
  /**
   * 5枚の手牌が完成形かどうかを判定
   * 要件4.1, 4.2に対応：順子+対子または刻子+対子のパターンを判定
   * @param {Tile[]} tiles - 判定する牌の配列（5枚）
   * @returns {boolean} 完成形かどうか
   */
  static checkWinningHand(tiles) {
    if (!tiles || tiles.length !== 5) {
      return false;
    }

    // 牌をソートして判定しやすくする
    const sortedTiles = this.sortTiles([...tiles]);
    
    // パターン1: 順子(3枚) + 対子(2枚)
    if (this.checkSequenceAndPair(sortedTiles)) {
      return true;
    }
    
    // パターン2: 刻子(3枚) + 対子(2枚)
    if (this.checkTripletAndPair(sortedTiles)) {
      return true;
    }
    
    return false;
  }

  /**
   * 4枚の手牌がテンパイ（聴牌）状態かどうかを判定し、待ち牌を返す
   * @param {Tile[]} tiles - 判定する牌の配列（4枚）
   * @returns {string[]} 待ち牌のIDの配列
   */
  static checkTenpai(tiles) {
    if (!tiles || tiles.length !== 4) {
      return [];
    }

    const waitingTiles = [];
    
    // 全ての可能な牌を試して、完成形になるかチェック
    const allPossibleTiles = this.getAllPossibleTiles();
    
    for (const testTile of allPossibleTiles) {
      const testHand = [...tiles, testTile];
      if (this.checkWinningHand(testHand)) {
        // 重複を避けるため、IDで管理
        if (!waitingTiles.includes(testTile.id)) {
          waitingTiles.push(testTile.id);
        }
      }
    }
    
    return waitingTiles;
  }

  /**
   * 順子+対子のパターンをチェック
   * @param {Tile[]} sortedTiles - ソート済みの牌配列
   * @returns {boolean} 順子+対子パターンかどうか
   */
  static checkSequenceAndPair(sortedTiles) {
    // 5枚から3枚の順子を見つけて、残り2枚が対子かチェック
    for (let i = 0; i <= 2; i++) {
      for (let j = i + 1; j <= 3; j++) {
        for (let k = j + 1; k <= 4; k++) {
          const tile1 = sortedTiles[i];
          const tile2 = sortedTiles[j];
          const tile3 = sortedTiles[k];
          
          if (this.isSequence([tile1, tile2, tile3])) {
            // 残りの2枚を取得
            const remaining = sortedTiles.filter((_, index) => index !== i && index !== j && index !== k);
            if (remaining.length === 2 && this.isPair(remaining)) {
              return true;
            }
          }
        }
      }
    }
    return false;
  }

  /**
   * 刻子+対子のパターンをチェック
   * @param {Tile[]} sortedTiles - ソート済みの牌配列
   * @returns {boolean} 刻子+対子パターンかどうか
   */
  static checkTripletAndPair(sortedTiles) {
    // 5枚から3枚の刻子を見つけて、残り2枚が対子かチェック
    for (let i = 0; i <= 2; i++) {
      for (let j = i + 1; j <= 3; j++) {
        for (let k = j + 1; k <= 4; k++) {
          const tile1 = sortedTiles[i];
          const tile2 = sortedTiles[j];
          const tile3 = sortedTiles[k];
          
          if (this.isTriplet([tile1, tile2, tile3])) {
            // 残りの2枚を取得
            const remaining = sortedTiles.filter((_, index) => index !== i && index !== j && index !== k);
            if (remaining.length === 2 && this.isPair(remaining)) {
              return true;
            }
          }
        }
      }
    }
    return false;
  }

  /**
   * 3枚の牌が順子（連続する数字）かどうかを判定
   * @param {Tile[]} tiles - 3枚の牌
   * @returns {boolean} 順子かどうか
   */
  static isSequence(tiles) {
    if (tiles.length !== 3) return false;
    
    // 字牌は順子を作れない
    if (tiles.some(tile => tile.suit === 'honor')) {
      return false;
    }
    
    // 全て索子で、連続する数字かチェック
    const values = tiles.map(tile => tile.value).sort((a, b) => a - b);
    return values[1] === values[0] + 1 && values[2] === values[1] + 1;
  }

  /**
   * 3枚の牌が刻子（同じ牌）かどうかを判定
   * @param {Tile[]} tiles - 3枚の牌
   * @returns {boolean} 刻子かどうか
   */
  static isTriplet(tiles) {
    if (tiles.length !== 3) return false;
    
    return tiles[0].suit === tiles[1].suit && 
           tiles[1].suit === tiles[2].suit &&
           tiles[0].value === tiles[1].value && 
           tiles[1].value === tiles[2].value;
  }

  /**
   * 2枚の牌が対子（同じ牌）かどうかを判定
   * @param {Tile[]} tiles - 2枚の牌
   * @returns {boolean} 対子かどうか
   */
  static isPair(tiles) {
    if (tiles.length !== 2) return false;
    
    return tiles[0].suit === tiles[1].suit && tiles[0].value === tiles[1].value;
  }

  /**
   * 牌をソート（種類と値でソート）
   * @param {Tile[]} tiles - ソートする牌の配列
   * @returns {Tile[]} ソート済みの牌配列
   */
  static sortTiles(tiles) {
    return tiles.sort((a, b) => {
      // まず種類でソート
      if (a.suit !== b.suit) {
        return a.suit === 'bamboo' ? -1 : 1;
      }
      // 同じ種類なら値でソート
      if (a.suit === 'bamboo') {
        return a.value - b.value;
      } else {
        // 字牌の順序: white < green < red
        const honorOrder = { 'white': 0, 'green': 1, 'red': 2 };
        return honorOrder[a.value] - honorOrder[b.value];
      }
    });
  }

  /**
   * 全ての可能な牌を生成（テンパイ判定用）
   * @returns {Tile[]} 全ての可能な牌の配列
   */
  static getAllPossibleTiles() {
    const Tile = require('./Tile');
    const tiles = [];
    
    // 索子1-9
    for (let value = 1; value <= 9; value++) {
      tiles.push(new Tile('bamboo', value));
    }
    
    // 字牌（白發中）
    const honorValues = ['white', 'green', 'red'];
    for (const value of honorValues) {
      tiles.push(new Tile('honor', value));
    }
    
    return tiles;
  }

  /**
   * 手牌の待ち牌を詳細情報付きで取得
   * @param {Tile[]} tiles - 判定する牌の配列（4枚）
   * @returns {Object[]} 待ち牌の詳細情報配列
   */
  static getTenpaiDetails(tiles) {
    const waitingTileIds = this.checkTenpai(tiles);
    const Tile = require('./Tile');
    
    return waitingTileIds.map(tileId => {
      const [suit, value] = tileId.split('_');
      const tile = new Tile(suit, isNaN(value) ? value : parseInt(value));
      return {
        id: tileId,
        display: tile.toString(),
        suit: suit,
        value: tile.value
      };
    });
  }
}

module.exports = HandEvaluator;
# 設計書

## 概要

この設計書は、麻雀ゲームインターフェースの捨て牌表示機能の詳細な実装設計を定義します。既存の5枚麻雀ゲームシステムに統合され、プレイヤーと相手の捨て牌を中央エリアに分離して表示する機能を提供します。

## アーキテクチャ

### システム構成

```
┌─────────────────────────────────────────────────────────┐
│                   ゲーム画面                              │
├─────────────────────────────────────────────────────────┤
│  相手プレイヤーエリア                                      │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌─────────────────┐  ┌─────────────────┐              │
│  │   相手捨て牌     │  │  プレイヤー捨て牌 │              │
│  │   (左側)        │  │    (右側)       │              │
│  │  ・180度回転     │  │  ・通常表示      │              │
│  │  ・下から上へ    │  │  ・上から下へ    │              │
│  │  ・1行6牌       │  │  ・1行6牌       │              │
│  └─────────────────┘  └─────────────────┘              │
│                                                         │
├─────────────────────────────────────────────────────────┤
│  プレイヤーエリア                                          │
└─────────────────────────────────────────────────────────┘
```

### データフロー

1. **捨て牌イベント発生** → サーバー側でPlayer.discardedTilesに追加
2. **ゲーム状態更新** → クライアントに送信
3. **UI更新** → 捨て牌表示システムが描画を更新

## コンポーネントと インターフェース

### 1. サーバー側コンポーネント

#### Player.js (既存の拡張)
既存のPlayer.jsは既に捨て牌機能を持っているため、追加の変更は不要です。

```javascript
// 既存機能（変更不要）
class Player {
  constructor(id, name) {
    this.discardedTiles = []; // 既に存在
  }
  
  discardTile(tile) {
    this.discardedTiles.push(tile);
  }
  
  getDiscardedTilesDisplay() {
    return this.discardedTiles.map(tile => tile.toString());
  }
}
```

#### Game.js (既存の拡張)
既存のGame.jsも捨て牌情報をゲーム状態に含めているため、追加の変更は不要です。

```javascript
// 既存機能（変更不要）
getGameState() {
  return {
    players: this.players.map(player => ({
      id: player.id,
      name: player.name,
      discardedTiles: player.getDiscardedTilesDisplay()
    }))
  };
}
```

### 2. クライアント側コンポーネント

#### DiscardDisplayManager (新規作成)
捨て牌表示の管理を担当するクラス

```javascript
class DiscardDisplayManager {
  constructor(containerElement) {
    this.container = containerElement;
    this.playerDiscardArea = null;
    this.opponentDiscardArea = null;
    this.init();
  }
  
  init() {
    // 左右のエリアを作成
    this.createDiscardAreas();
  }
  
  updateDiscards(gameState, currentPlayerId) {
    // プレイヤーと相手の捨て牌を更新
  }
  
  createDiscardAreas() {
    // 左側（相手）と右側（プレイヤー）のエリアを作成
  }
}
```

#### DiscardArea (新規作成)
個別の捨て牌エリア（プレイヤー用/相手用）を管理するクラス

```javascript
class DiscardArea {
  constructor(isOpponent = false) {
    this.isOpponent = isOpponent;
    this.tiles = [];
    this.rows = [];
    this.maxTilesPerRow = 6;
  }
  
  addTile(tile) {
    // 牌を追加し、レイアウトを更新
  }
  
  render() {
    // DOM要素を生成/更新
  }
}
```

### 3. CSS スタイルコンポーネント

#### 新しいCSSクラス
```css
.discard-display-container {
  display: flex;
  justify-content: space-between;
  gap: 20px;
  padding: 20px;
}

.opponent-discard-area {
  flex: 1;
  display: flex;
  flex-direction: column-reverse; /* 下から上へ */
}

.player-discard-area {
  flex: 1;
  display: flex;
  flex-direction: column; /* 上から下へ */
}

.discard-row {
  display: flex;
  gap: 4px;
  margin-bottom: 4px;
  justify-content: flex-start; /* 左詰め */
}

.discard-tile {
  width: 35px;
  height: 50px;
  border: 1px solid #ccc;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.8rem;
  background: #f9f9f9;
}

.discard-tile.opponent {
  transform: rotate(180deg); /* 180度回転 */
}
```

## データモデル

### DiscardTileData
```javascript
{
  id: string,        // 牌ID
  suit: string,      // 牌の種類 ('bamboo', 'honor')
  value: string|number, // 牌の値
  playerId: string,  // 捨てたプレイヤーのID
  timestamp: number  // 捨てた時刻
}
```

### DiscardDisplayState
```javascript
{
  playerDiscards: DiscardTileData[], // プレイヤーの捨て牌
  opponentDiscards: DiscardTileData[], // 相手の捨て牌
  currentPlayerId: string // 現在のプレイヤーID
}
```

## エラーハンドリング

### 1. データ不整合エラー
- **問題**: ゲーム状態の捨て牌データが不正
- **対処**: デフォルト値で表示し、コンソールに警告出力

### 2. DOM操作エラー
- **問題**: 捨て牌エリアの要素が見つからない
- **対処**: 要素の存在確認後に操作実行

### 3. レンダリングエラー
- **問題**: 大量の捨て牌による性能問題
- **対処**: 仮想スクロールまたは表示制限の実装

## テスト戦略

### 1. 単体テスト
- DiscardDisplayManagerクラスの各メソッド
- DiscardAreaクラスの牌追加・レンダリング機能
- CSS変換（180度回転）の正確性

### 2. 統合テスト
- ゲーム状態更新時の捨て牌表示同期
- プレイヤー/相手の捨て牌の正しい分離表示
- レスポンシブデザインでの表示確認

### 3. ユーザビリティテスト
- 6牌/行の制限が正しく機能するか
- 相手の牌が180度回転して表示されるか
- 時系列順序が保持されるか

## パフォーマンス考慮事項

### 1. DOM操作の最適化
- 牌追加時は差分更新のみ実行
- 大量の牌がある場合は仮想化を検討

### 2. メモリ使用量
- 古い捨て牌データの適切なクリーンアップ
- 不要なDOM要素の削除

### 3. レンダリング性能
- CSS transformを使用した効率的な回転表示
- レイアウト再計算の最小化

## セキュリティ考慮事項

### 1. データ検証
- サーバーから受信した捨て牌データの妥当性確認
- XSS攻撃を防ぐためのデータサニタイズ

### 2. 情報漏洩防止
- 相手の手牌情報が捨て牌表示に混入しないよう確認
- プレイヤーIDの適切な管理

## 実装フェーズ

### フェーズ1: 基本構造
1. HTML構造の更新
2. 基本CSSスタイルの追加
3. DiscardDisplayManagerクラスの作成

### フェーズ2: 機能実装
1. DiscardAreaクラスの実装
2. ゲーム状態との統合
3. 牌の追加・表示機能

### フェーズ3: 視覚的改善
1. 180度回転の実装
2. レイアウト調整（6牌/行制限）
3. レスポンシブデザイン対応

### フェーズ4: 最適化
1. パフォーマンス改善
2. エラーハンドリング強化
3. テスト実装
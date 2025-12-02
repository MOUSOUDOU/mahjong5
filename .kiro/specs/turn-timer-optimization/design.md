# 設計書 - 手番タイマー最適化

## 概要

現在の実装では、`startNextTurn`関数内で常に`setTurnTimer`が呼ばれているため、プレイヤーの手番が開始されるたびにタイマーが起動しています。この設計では、タイマーの起動条件を最適化し、ロン待機状態など、プレイヤーの操作が必要な場合のみタイマーを起動するように変更します。

## アーキテクチャ

### 現在の問題点

1. **無条件のタイマー起動**: `startNextTurn` → `setTurnTimer` が常に実行される
2. **自動牌引きとの競合**: 自動牌引きが実行される場合でもタイマーが起動する
3. **不要なUI表示**: プレイヤーの操作が不要な場合でもタイマーが表示される

### 改善後のフロー

```
手番開始
  ↓
自動牌引き判定
  ↓
├─ 自動牌引き可能 → 牌を引く → タイマー起動なし → 次の処理へ
└─ 自動牌引き不可 → ロン待機状態判定
                      ↓
                      ├─ ロン待機中 → タイマー起動 → プレイヤー操作待ち
                      └─ 通常状態 → タイマー起動なし → 次の処理へ
```

## コンポーネントと インターフェース

### 1. サーバー側の変更

#### 1.1 `server.js` - `setTurnTimer`関数の条件付き実行

**変更前:**
```javascript
function startNextTurn(game) {
  // ... ゲーム状態更新 ...
  handleAutoDrawTile(game);
  setTurnTimer(game); // 常に実行
}
```

**変更後:**
```javascript
function startNextTurn(game, options = {}) {
  // ... ゲーム状態更新 ...
  
  const autoDrawResult = handleAutoDrawTile(game);
  
  // タイマーが必要な場合のみ起動
  if (shouldStartTurnTimer(game, autoDrawResult)) {
    setTurnTimer(game);
  }
}
```

#### 1.2 新規関数: `shouldStartTurnTimer`

タイマー起動の必要性を判定する関数を追加します。

```javascript
/**
 * 手番タイマーを起動すべきかを判定
 * @param {Game} game - ゲーム
 * @param {Object} autoDrawResult - 自動牌引きの結果
 * @returns {boolean} タイマーを起動すべきか
 */
function shouldStartTurnTimer(game, autoDrawResult) {
  const currentPlayer = game.getCurrentPlayer();
  if (!currentPlayer) {
    return false;
  }
  
  // 自動牌引きが実行された場合はタイマー不要
  if (autoDrawResult && autoDrawResult.executed) {
    return false;
  }
  
  // ロン待機状態の場合はタイマー必要
  if (currentPlayer.isWaitingForRon) {
    return true;
  }
  
  // その他の場合はタイマー不要
  return false;
}
```

#### 1.3 `handleAutoDrawTile`関数の戻り値追加

自動牌引きが実行されたかどうかを返すように変更します。

```javascript
function handleAutoDrawTile(game) {
  // ... 既存の処理 ...
  
  return {
    executed: true/false,
    reason: '実行理由または拒否理由'
  };
}
```

### 2. ゲームモデルの拡張

#### 2.1 `Player.js` - ロン待機状態の管理

プレイヤークラスにロン待機状態を管理するプロパティとメソッドを追加します。

```javascript
class Player {
  constructor(id, name) {
    // ... 既存のプロパティ ...
    this.isWaitingForRon = false; // ロン待機状態
    this.ronWaitingTimeout = null; // ロン待機タイムアウトID
  }
  
  /**
   * ロン待機状態を設定
   */
  setRonWaiting() {
    this.isWaitingForRon = true;
  }
  
  /**
   * ロン待機状態を解除
   */
  clearRonWaiting() {
    this.isWaitingForRon = false;
    if (this.ronWaitingTimeout) {
      clearTimeout(this.ronWaitingTimeout);
      this.ronWaitingTimeout = null;
    }
  }
  
  /**
   * ロン待機状態かどうかを取得
   */
  isInRonWaitingState() {
    return this.isWaitingForRon;
  }
}
```

### 3. ロン判定処理の統合

#### 3.1 `server.js` - ロン判定結果の処理

ロン判定が可能な場合、プレイヤーをロン待機状態に設定します。

```javascript
socket.on('queryRon', async (data) => {
  // ... ロン判定処理 ...
  
  if (result.possible) {
    // ロン待機状態を設定
    player.setRonWaiting();
    
    // 10秒後に自動的に解除
    player.ronWaitingTimeout = setTimeout(() => {
      player.clearRonWaiting();
    }, 10000);
  }
  
  // ... 結果を返す ...
});
```

#### 3.2 ロン宣言時の状態クリア

```javascript
socket.on('declareRon', (data) => {
  // ... ロン処理 ...
  
  // ロン待機状態を解除
  player.clearRonWaiting();
  
  // ... ゲーム終了処理 ...
});
```

#### 3.3 ロン待機キャンセル時の処理

```javascript
socket.on('cancelRonWaiting', (data) => {
  const player = game.getPlayer(data.playerId);
  if (player) {
    player.clearRonWaiting();
  }
});
```

## データモデル

### Player拡張

```javascript
{
  id: string,
  name: string,
  hand: Tile[],
  discardedTiles: Tile[],
  isRiichi: boolean,
  isWaitingForRon: boolean,      // 新規追加
  ronWaitingTimeout: number|null  // 新規追加
}
```

### AutoDrawResult

```javascript
{
  executed: boolean,  // 自動牌引きが実行されたか
  reason: string      // 実行理由または拒否理由
}
```

## エラーハンドリング

### 1. タイマー起動判定のエラー

- **エラー**: ゲーム状態が不正な場合
- **対処**: タイマーを起動せず、エラーログを記録

### 2. ロン待機状態の不整合

- **エラー**: プレイヤーがロン待機状態だが、ゲーム状態が不正
- **対処**: ロン待機状態を強制的にクリアし、通常の手番処理を継続

### 3. タイムアウトの競合

- **エラー**: 複数のタイムアウトが同時に設定される
- **対処**: 既存のタイムアウトをクリアしてから新しいタイムアウトを設定

## テスト戦略

### 1. ユニットテスト

#### 1.1 `shouldStartTurnTimer`関数のテスト

- 自動牌引きが実行された場合、falseを返すことを確認
- ロン待機状態の場合、trueを返すことを確認
- 通常状態の場合、falseを返すことを確認

#### 1.2 `Player`クラスのロン待機状態管理テスト

- `setRonWaiting`でロン待機状態が設定されることを確認
- `clearRonWaiting`でロン待機状態が解除されることを確認
- タイムアウトが正しく管理されることを確認

### 2. 統合テスト

#### 2.1 手番開始時のタイマー制御

- 自動牌引きが実行される場合、タイマーが起動しないことを確認
- ロン待機状態の場合、タイマーが起動することを確認
- 通常の手番の場合、タイマーが起動しないことを確認

#### 2.2 ロン判定とタイマーの連携

- ロン可能な場合、ロン待機状態が設定されることを確認
- ロン待機状態でタイマーが起動することを確認
- ロン宣言後、ロン待機状態がクリアされることを確認

### 3. エンドツーエンドテスト

#### 3.1 通常の手番フロー

1. プレイヤーAの手番開始
2. 自動牌引きが実行される
3. タイマーが起動しないことを確認
4. プレイヤーAが牌を捨てる
5. プレイヤーBの手番に移る

#### 3.2 ロン待機フロー

1. プレイヤーAがリーチ宣言
2. プレイヤーBが牌を捨てる
3. プレイヤーAにロン判定が実行される
4. ロン可能な場合、ロン待機状態が設定される
5. タイマーが起動することを確認
6. プレイヤーAがロンを宣言またはタイムアウト
7. ロン待機状態がクリアされる

## 実装の優先順位

1. **高**: `Player`クラスへのロン待機状態管理機能の追加
2. **高**: `shouldStartTurnTimer`関数の実装
3. **高**: `startNextTurn`関数の条件付きタイマー起動への変更
4. **中**: `handleAutoDrawTile`関数の戻り値追加
5. **中**: ロン判定処理でのロン待機状態設定
6. **低**: エラーハンドリングの強化
7. **低**: テストコードの追加

## パフォーマンスへの影響

- **タイマー起動回数の削減**: 不要なタイマーが起動しなくなるため、システムリソースの使用が削減されます
- **UI更新の削減**: タイマー表示の更新が減るため、クライアント側のパフォーマンスが向上します
- **ネットワークトラフィックの削減**: 不要なタイマーイベントの送信が減ります

## セキュリティ考慮事項

- ロン待機状態の不正な操作を防ぐため、サーバー側で状態を厳密に管理します
- タイムアウトの設定と解除を適切に行い、メモリリークを防ぎます

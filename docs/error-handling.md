# エラーハンドリングシステム

## 概要

このドキュメントは、５枚麻雀ゲームのエラーハンドリングシステムについて説明します。要件6.3に対応し、無効な操作の検証、エラーメッセージの日本語化、適切なエラーレスポンスを提供します。

## 主要コンポーネント

### 1. ErrorHandler クラス (`src/utils/ErrorHandler.js`)

#### 機能
- エラーレスポンスの生成
- 入力データの検証
- レート制限の管理
- ログ出力
- エラー統計の収集

#### 主要メソッド
- `createErrorResponse(errorType, customMessage)` - 基本エラーレスポンス生成
- `createDetailedErrorResponse(errorType, customMessage, details)` - 詳細エラーレスポンス生成
- `validateInput(data, schema)` - 入力データ検証
- `checkRateLimit(playerId, action, limit)` - レート制限チェック
- `log(level, message, data)` - ログ出力

### 2. GameValidator クラス (`src/utils/GameValidator.js`)

#### 機能
- ゲーム操作の検証
- 牌IDの形式チェック
- プレイヤー名の検証
- ゲーム状態の検証

#### 主要メソッド
- `validateTileId(tileId)` - 牌ID検証
- `validatePlayerName(playerName)` - プレイヤー名検証
- `validateGameOperation(game, playerId, action)` - ゲーム操作検証
- `validateRiichiConditions(player, waitingTiles)` - リーチ条件検証

## エラータイプ

### 基本エラータイプ
- `INVALID_MOVE` - 無効な操作
- `GAME_NOT_FOUND` - ゲームが見つからない
- `PLAYER_NOT_FOUND` - プレイヤーが見つからない
- `NOT_PLAYER_TURN` - プレイヤーの手番ではない
- `INVALID_TILE` - 無効な牌
- `RIICHI_REQUIRED` - リーチが必要
- `DECK_EMPTY` - 山に牌がない

### 拡張エラータイプ
- `VALIDATION_ERROR` - 入力検証エラー
- `CONNECTION_ERROR` - 接続エラー
- `TIMEOUT_ERROR` - タイムアウトエラー
- `RATE_LIMIT_ERROR` - レート制限エラー
- `DUPLICATE_ACTION` - 重複アクション

## 日本語エラーメッセージ

全てのエラーメッセージは日本語で提供され、ユーザーにとって理解しやすい内容になっています。

例：
- "あなたの手番ではありません"
- "手牌が満杯です"
- "テンパイしていないためリーチできません"

## レート制限

各プレイヤーのアクションに対してレート制限を設けています：
- `joinGame`: 5回/分
- `drawTile`: 30回/分
- `discardTile`: 30回/分
- `declareRiichi`: 10回/分

## ログシステム

### ログレベル
- `error` - エラー情報
- `warn` - 警告情報
- `info` - 一般情報
- `debug` - デバッグ情報

### ログ出力
本番環境では詳細なログ情報を制限し、セキュリティを確保しています。

## エラー統計

システムは以下の統計情報を収集します：
- 総エラー数
- エラータイプ別の発生回数
- 最新のエラー履歴（最大10件）

## API エンドポイント

### エラー統計取得
```
GET /api/error-stats
```
開発・デバッグ用のエラー統計情報を取得します。

### ヘルスチェック
```
GET /api/health
```
サーバーの健康状態とシステム情報を取得します。

## 使用例

### 基本的なエラーハンドリング
```javascript
const result = gameEngine.drawTile(gameId, playerId);
if (!result.success) {
  socket.emit('actionError', ErrorHandler.createErrorResponse(
    ERROR_TYPES.INVALID_MOVE,
    result.error
  ));
}
```

### 入力検証
```javascript
const validation = ErrorHandler.validateInput(data, schema);
if (!validation.isValid) {
  socket.emit('actionError', ErrorHandler.createValidationErrorResponse(validation.errors));
}
```

### レート制限チェック
```javascript
if (!ErrorHandler.checkRateLimit(playerId, 'drawTile', 30)) {
  socket.emit('actionError', ErrorHandler.createErrorResponse(
    ERROR_TYPES.RATE_LIMIT_ERROR,
    '操作が頻繁すぎます'
  ));
}
```

## セキュリティ考慮事項

1. **入力検証**: 全ての入力データを検証
2. **レート制限**: 過度なリクエストを防止
3. **ログ制限**: 本番環境での情報漏洩を防止
4. **エラー情報**: 攻撃者に有用な情報を提供しない

## 今後の拡張

- ファイルベースのログ保存
- データベースへのエラー統計保存
- より詳細なセキュリティ監視
- 自動アラート機能
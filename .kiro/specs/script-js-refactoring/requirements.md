# 要件書

## はじめに

現在の`public/script.js`ファイルは約3000行の大きなファイルで、Socket.io通信、ゲーム状態管理、UI表示、牌の操作など複数の責任を持っています。保守性とコードの可読性を向上させるため、機能別にファイルを分割します。

## 用語集

- **Socket.io**: リアルタイム通信ライブラリ
- **GameStateManager**: ゲーム状態を管理するクラス
- **TileManager**: 牌の表示と操作を管理するクラス
- **DiscardDisplayManager**: 捨て牌表示を管理するクラス
- **UIManager**: ユーザーインターフェースを管理するクラス
- **ErrorHandler**: エラー処理を管理するクラス

## 要件

### 要件1

**ユーザーストーリー:** 開発者として、Socket.io通信機能を独立したモジュールに分離したい。これにより通信ロジックの保守が容易になる。

#### 受入基準

1. WHEN Socket.io接続が必要な時、THE SocketManager SHALL 接続管理機能を提供する
2. WHEN サーバーとの通信が必要な時、THE SocketManager SHALL イベント送受信機能を提供する
3. WHEN 接続エラーが発生した時、THE SocketManager SHALL エラーハンドリング機能を提供する
4. WHEN 再接続が必要な時、THE SocketManager SHALL 自動再接続機能を提供する

### 要件2

**ユーザーストーリー:** 開発者として、ゲーム状態管理機能を独立したモジュールに分離したい。これによりゲームロジックの保守が容易になる。

#### 受入基準

1. WHEN ゲーム状態が更新される時、THE GameStateManager SHALL 状態の更新と保存を行う
2. WHEN プレイヤー情報が必要な時、THE GameStateManager SHALL プレイヤー情報の取得機能を提供する
3. WHEN 手番情報が必要な時、THE GameStateManager SHALL 現在の手番情報を提供する
4. WHEN ゲーム終了時、THE GameStateManager SHALL 結果情報の管理機能を提供する

### 要件3

**ユーザーストーリー:** 開発者として、牌の表示と操作機能を独立したモジュールに分離したい。これにより牌関連の機能の保守が容易になる。

#### 受入基準

1. WHEN 手牌を表示する時、THE TileManager SHALL 牌のソートと表示機能を提供する
2. WHEN 牌がクリックされた時、THE TileManager SHALL 牌の選択機能を提供する
3. WHEN 牌をダブルクリックした時、THE TileManager SHALL 即座の捨て牌機能を提供する
4. WHEN リーチ状態の時、THE TileManager SHALL 牌選択の制限機能を提供する
5. WHEN テンパイ判定が必要な時、THE TileManager SHALL テンパイ判定機能を提供する

### 要件4

**ユーザーストーリー:** 開発者として、捨て牌表示機能を独立したモジュールに分離したい。これにより捨て牌表示の保守が容易になる。

#### 受入基準

1. WHEN 捨て牌を表示する時、THE DiscardDisplayManager SHALL 時系列順序での表示機能を提供する
2. WHEN リーチ牌を表示する時、THE DiscardDisplayManager SHALL 横向き表示機能を提供する
3. WHEN 6牌制限に達した時、THE DiscardDisplayManager SHALL 新しい行への配置機能を提供する
4. WHEN 相手の捨て牌を表示する時、THE DiscardDisplayManager SHALL 180度回転表示機能を提供する

### 要件5

**ユーザーストーリー:** 開発者として、UI管理機能を独立したモジュールに分離したい。これによりユーザーインターフェースの保守が容易になる。

#### 受入基準

1. WHEN 画面遷移が必要な時、THE UIManager SHALL 画面表示の切り替え機能を提供する
2. WHEN ボタン状態を更新する時、THE UIManager SHALL ボタンの有効/無効制御機能を提供する
3. WHEN メッセージを表示する時、THE UIManager SHALL メッセージ表示機能を提供する
4. WHEN タイマーを表示する時、THE UIManager SHALL タイマー表示機能を提供する

### 要件6

**ユーザーストーリー:** 開発者として、上がり判定機能を独立したモジュールに分離したい。これにより上がり判定ロジックの保守が容易になる。

#### 受入基準

1. WHEN ツモ判定が必要な時、THE WinningManager SHALL ツモ可能性の判定機能を提供する
2. WHEN ロン判定が必要な時、THE WinningManager SHALL ロン可能性の判定機能を提供する
3. WHEN 完成形判定が必要な時、THE WinningManager SHALL 手牌完成形の判定機能を提供する
4. WHEN 上がり宣言時、THE WinningManager SHALL 上がり宣言の処理機能を提供する

### 要件7

**ユーザーストーリー:** 開発者として、エラーハンドリング機能を独立したモジュールに分離したい。これによりエラー処理の保守が容易になる。

#### 受入基準

1. WHEN エラーが発生した時、THE ErrorHandler SHALL エラーメッセージの表示機能を提供する
2. WHEN エラータイプが判明している時、THE ErrorHandler SHALL 適切なエラーメッセージの選択機能を提供する
3. WHEN 通信エラーが発生した時、THE ErrorHandler SHALL 通信エラーの処理機能を提供する
4. WHEN スクリーンリーダー対応が必要な時、THE ErrorHandler SHALL アクセシビリティ対応機能を提供する

### 要件8

**ユーザーストーリー:** 開発者として、メインスクリプトファイルを簡潔に保ちたい。これにより全体の構造が理解しやすくなる。

#### 受入基準

1. WHEN アプリケーションが初期化される時、THE MainScript SHALL 各モジュールの初期化機能を提供する
2. WHEN モジュール間の連携が必要な時、THE MainScript SHALL モジュール間の調整機能を提供する
3. WHEN グローバル変数が必要な時、THE MainScript SHALL 最小限のグローバル変数管理機能を提供する
4. WHEN 既存の機能を維持する時、THE MainScript SHALL 後方互換性の保証機能を提供する
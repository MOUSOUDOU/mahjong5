# 要件定義書

## はじめに

麻雀ゲームにおけるサーバー集中判定システムの実装に関する要件を定義します。リーチ判定、ツモ判定、ロン判定、自動引き判定をすべてサーバーサイドで行い、クライアントはサーバーに問い合わせを行って許可を得る仕組みに変更します。

## 用語集

- **Server**: 麻雀ゲームサーバー
- **Client**: ゲームクライアント
- **Player**: ゲームプレイヤー
- **Judgment_Server**: サーバーサイドの判定システム
- **Auto_Draw_Query**: 自動引き可否問い合わせ
- **Tsumo_Query**: 自摸和了判定問い合わせ
- **Ron_Query**: ロン判定問い合わせ
- **Riichi_Query**: リーチ宣言判定問い合わせ
- **Turn_State**: プレイヤーの手番状態
- **First_Turn**: ゲーム開始後の最初の手番

## 要件

### 要件1

**ユーザーストーリー:** プレイヤーとして、自分の手番時にサーバーから自動引き許可を得たい。そうすることで、適切なタイミングで牌を引くことができる。

#### 受入基準

1. WHEN プレイヤーの手番が開始される, THE Client SHALL サーバーに自動引き可否を問い合わせる
2. WHERE 最初の手番である, THE Judgment_Server SHALL 自動引きを許可する
3. IF 直前の相手の捨て牌がロン牌である, THEN THE Judgment_Server SHALL ロン判定を優先し自動引きを保留する
4. WHEN ロン判定が完了または時間切れになる, THE Judgment_Server SHALL 自動引きを許可する
5. THE Judgment_Server SHALL 自動引き許可の応答をクライアントに送信する

### 要件2

**ユーザーストーリー:** プレイヤーとして、牌を引いた時にサーバーから自摸和了判定を受けたい。そうすることで、正確な和了判定ができる。

#### 受入基準

1. WHEN プレイヤーが牌を引く, THE Client SHALL サーバーに自摸和了判定を問い合わせる
2. THE Judgment_Server SHALL プレイヤーの手牌と引いた牌で和了可能かを判定する
3. IF 和了可能である, THEN THE Judgment_Server SHALL 自摸和了を許可する
4. IF 和了不可能である, THEN THE Judgment_Server SHALL 自摸和了を拒否する
5. THE Judgment_Server SHALL 判定結果をクライアントに送信する

### 要件3

**ユーザーストーリー:** プレイヤーとして、相手の捨て牌に対してサーバーからロン判定を受けたい。そうすることで、公正なロン判定ができる。

#### 受入基準

1. WHEN 相手プレイヤーが牌を捨てる, THE Client SHALL サーバーにロン判定を問い合わせる
2. THE Judgment_Server SHALL 問い合わせプレイヤーの手牌と捨て牌で和了可能かを判定する
3. IF 和了可能である, THEN THE Judgment_Server SHALL ロンを許可する
4. IF 和了不可能である, THEN THE Judgment_Server SHALL ロンを拒否する
5. WHERE ロンが許可される, THE Judgment_Server SHALL 他プレイヤーの自動引きを停止する

### 要件4

**ユーザーストーリー:** プレイヤーとして、捨て牌選択時にサーバーからリーチ宣言判定を受けたい。そうすることで、正確なリーチ判定ができる。

#### 受入基準

1. WHEN プレイヤーが捨て牌を選択する, THE Client SHALL サーバーにリーチ宣言判定を問い合わせる
2. THE Judgment_Server SHALL 選択した牌を捨てた場合の聴牌状態を判定する
3. IF 聴牌状態になる, THEN THE Judgment_Server SHALL リーチ宣言を許可する
4. IF 聴牌状態にならない, THEN THE Judgment_Server SHALL リーチ宣言を拒否する
5. WHERE リーチが許可される, THE Judgment_Server SHALL プレイヤーのリーチ状態を更新する

### 要件5

**ユーザーストーリー:** プレイヤーとして、サーバーサイドでの判定結果を適切に受信したい。そうすることで、ゲーム進行を正確に把握できる。

#### 受入基準

1. THE Judgment_Server SHALL すべての判定結果を統一フォーマットで応答する
2. WHEN 判定処理でエラーが発生する, THE Judgment_Server SHALL エラー情報を含む応答を送信する
3. THE Client SHALL サーバーからの判定結果に基づいてUI状態を更新する
4. IF サーバー応答が遅延する, THEN THE Client SHALL タイムアウト処理を実行する
5. THE Judgment_Server SHALL 判定履歴をログとして記録する
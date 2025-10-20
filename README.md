## リンク

**YOUTUBE**  
https://www.youtube.com/@mousoudou

**YOUTUBE 再生リスト ５枚麻雀ゲームを作ろう**  
https://www.youtube.com/playlist?list=PLWFAmRjzasxUhimkKBzjL-W6Z07hq9tNS

**X(twitter)**  
twitter.com/MOUSOUDOU_com

**HOMEPAGE**  
mousoudou.com

# ５枚麻雀ゲーム

２人用の簡易５枚麻雀ゲームです。通常の麻雀を大幅に簡略化し、手牌４枚から１枚引いて１枚捨て、５枚で完成形を目指すゲームです。

## 特徴

- 手牌は最大5枚
- 使用牌: 索子1-9（各4枚）+ 白發中（各4枚）= 計48枚
- 役はリーチのみ
- 鳴きやドラなし
- 1局勝負で点数計算なし

## 技術スタック

- **バックエンド**: Node.js + Express + Socket.io
- **フロントエンド**: HTML5 + CSS3 + JavaScript (Vanilla)

## プロジェクト構造

```
├── server.js              # メインサーバーファイル
├── package.json           # プロジェクト設定
├── README.md             # このファイル
├── src/
│   └── models/           # データモデル
│       ├── Tile.js       # 牌クラス
│       ├── Player.js     # プレイヤークラス
│       └── Game.js       # ゲームクラス
└── public/               # 静的ファイル
    ├── index.html        # メインHTML
    ├── styles.css        # スタイルシート
    └── script.js         # クライアントサイドJS
```

## セットアップ

1. 依存関係のインストール:
```bash
npm install
```

2. サーバーの起動:
```bash
npm start
```

3. ブラウザで `http://localhost:3000` にアクセス

## ゲームルール

### 基本的な流れ
1. 各プレイヤーに4枚ずつ牌を配る
2. 順番に山から1枚引いて1枚捨てる
3. テンパイ状態でリーチを宣言
4. 完成形で上がり（ツモまたはロン）

### 完成形
- **順子+対子**: 連続する3枚 + 同じ牌2枚 (例: 123 + 44)
- **刻子+対子**: 同じ牌3枚 + 同じ牌2枚 (例: 111 + 22)

### 上がり条件
- リーチを宣言していること
- 有効な完成形であること
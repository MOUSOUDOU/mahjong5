const Player = require('./Player');
const Deck = require('./Deck');

/**
 * ゲームクラス - 5枚麻雀ゲームの状態とロジックを管理
 */
class Game {
  constructor() {
    this.players = [];              // プレイヤー配列（最大2人）
    this.deck = new Deck();         // 山牌
    this.currentPlayerIndex = 0;    // 現在の手番プレイヤーのインデックス
    this.gameState = 'waiting';     // ゲーム状態: 'waiting'|'playing'|'finished'
    this.winner = null;             // 勝者
    this.gameId = this.generateGameId();
    this.lastActivity = Date.now(); // 最後のアクティビティ時刻
    this.createdAt = Date.now();    // ゲーム作成時刻
  }

  /**
   * ゲームIDを生成
   * @returns {string} ランダムなゲームID
   */
  generateGameId() {
    return Math.random().toString(36).substr(2, 9);
  }

  /**
   * プレイヤーをゲームに追加
   * @param {string} playerId - プレイヤーID
   * @param {string} playerName - プレイヤー名
   * @returns {boolean} 追加に成功したかどうか
   */
  addPlayer(playerId, playerName) {
    if (this.players.length >= 2) {
      return false; // 既に2人のプレイヤーがいる
    }
    
    // 既に同じIDのプレイヤーがいないかチェック
    if (this.players.some(player => player.id === playerId)) {
      return false;
    }

    const player = new Player(playerId, playerName);
    this.players.push(player);
    
    // 2人揃ったらゲームを開始
    if (this.players.length === 2) {
      this.startGame();
    }
    
    return true;
  }

  /**
   * プレイヤーをゲームから削除
   * @param {string} playerId - 削除するプレイヤーID
   * @returns {boolean} 削除に成功したかどうか
   */
  removePlayer(playerId) {
    const index = this.players.findIndex(player => player.id === playerId);
    if (index !== -1) {
      this.players.splice(index, 1);
      
      // プレイヤーが削除されたらゲームを待機状態に戻す
      if (this.gameState === 'playing') {
        this.gameState = 'waiting';
      }
      
      return true;
    }
    return false;
  }

  /**
   * ゲームを開始
   * 要件1.1, 1.3に対応：各プレイヤーに4枚配り、ランダムに先手を決定
   */
  startGame() {
    console.log('ゲーム開始処理開始 - ゲームID:', this.gameId);
    
    if (this.players.length !== 2) {
      throw new Error('ゲームを開始するには2人のプレイヤーが必要です');
    }

    console.log('プレイヤー数確認OK:', this.players.length);

    // プレイヤーの状態をリセット
    this.players.forEach(player => player.reset());
    console.log('プレイヤー状態リセット完了');
    
    // デッキをリセット
    this.deck.reset();
    console.log('デッキリセット完了 - 牌数:', this.deck.getRemainingCount());
    
    // 各プレイヤーに4枚ずつ配る（要件1.1）
    this.dealInitialTiles();
    
    // ランダムに先手プレイヤーを決定（要件1.3）
    this.currentPlayerIndex = Math.floor(Math.random() * 2);
    console.log('先手プレイヤー決定:', this.currentPlayerIndex);
    
    // ゲーム状態を「プレイ中」に変更
    this.gameState = 'playing';
    this.winner = null;
    
    console.log('ゲーム開始処理完了');
  }

  /**
   * 初期牌配り - 各プレイヤーに4枚ずつ配る
   */
  dealInitialTiles() {
    console.log('初期牌配り開始 - プレイヤー数:', this.players.length);
    console.log('デッキの牌数:', this.deck.getRemainingCount());
    
    for (let i = 0; i < 4; i++) {
      for (const player of this.players) {
        const tile = this.deck.drawTile();
        if (tile) {
          player.addTileToHand(tile);
          console.log(`プレイヤー ${player.id} に牌 ${tile.id} を配布 (${i+1}枚目)`);
        } else {
          console.error('牌を引けませんでした - デッキが空です');
        }
      }
    }
    
    // 配布後の手牌数を確認
    this.players.forEach(player => {
      console.log(`プレイヤー ${player.id} の手牌数: ${player.getHandSize()}`);
      console.log(`プレイヤー ${player.id} の手牌: ${player.hand.map(t => t.id).join(', ')}`);
    });
  }

  /**
   * 現在の手番プレイヤーを取得
   * @returns {Player|null} 現在の手番プレイヤー
   */
  getCurrentPlayer() {
    if (this.gameState !== 'playing' || this.currentPlayerIndex < 0 || this.currentPlayerIndex >= this.players.length) {
      return null;
    }
    return this.players[this.currentPlayerIndex];
  }

  /**
   * 相手プレイヤーを取得
   * @param {string} playerId - 基準となるプレイヤーID
   * @returns {Player|null} 相手プレイヤー
   */
  getOpponentPlayer(playerId) {
    return this.players.find(player => player.id !== playerId) || null;
  }

  /**
   * プレイヤーIDでプレイヤーを取得
   * @param {string} playerId - プレイヤーID
   * @returns {Player|null} プレイヤー
   */
  getPlayer(playerId) {
    return this.players.find(player => player.id === playerId) || null;
  }

  /**
   * プレイヤーIDでプレイヤーを取得（エイリアス）
   * @param {string} playerId - プレイヤーID
   * @returns {Player|null} プレイヤー
   */
  getPlayerById(playerId) {
    return this.getPlayer(playerId);
  }

  /**
   * 手番を次のプレイヤーに移す
   * 要件2.4に対応：手番を相手プレイヤーに移す
   */
  nextTurn() {
    if (this.gameState === 'playing') {
      this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
      this.updateLastActivity();
    }
  }

  /**
   * 指定されたプレイヤーが現在の手番かどうかを判定
   * @param {string} playerId - プレイヤーID
   * @returns {boolean} 現在の手番かどうか
   */
  isPlayerTurn(playerId) {
    const currentPlayer = this.getCurrentPlayer();
    return currentPlayer && currentPlayer.id === playerId;
  }

  /**
   * ゲームを終了
   * @param {string} winnerId - 勝者のプレイヤーID
   */
  endGame(winnerId = null) {
    this.gameState = 'finished';
    if (winnerId) {
      this.winner = this.getPlayer(winnerId);
    }
  }

  /**
   * 流局処理 - 山が空になった場合
   */
  declareDraw() {
    this.gameState = 'finished';
    this.winner = null; // 引き分け
  }

  /**
   * ゲームの状態情報を取得
   * @returns {Object} ゲーム状態情報
   */
  getGameState() {
    return {
      gameId: this.gameId,
      state: this.gameState,
      players: this.players.map(player => ({
        id: player.id,
        name: player.name,
        handSize: player.getHandSize(),
        isRiichi: player.isRiichi,
        discardedTiles: player.getDiscardedTilesDisplay() // リーチ牌情報を含む
      })),
      currentPlayerIndex: this.currentPlayerIndex,
      currentPlayerId: this.getCurrentPlayer()?.id || null,
      remainingTiles: this.deck.getRemainingCount(),
      winner: this.winner ? {
        id: this.winner.id,
        name: this.winner.name
      } : null
    };
  }

  /**
   * 特定プレイヤー向けのゲーム状態を取得（手牌情報を含む）
   * @param {string} playerId - プレイヤーID
   * @returns {Object} プレイヤー向けゲーム状態情報
   */
  getGameStateForPlayer(playerId) {
    const gameState = this.getGameState();
    const player = this.getPlayer(playerId);
    
    if (player) {
      gameState.playerHand = player.getHandDisplay();
      gameState.playerHandTiles = player.hand; // 実際のTileオブジェクト
    }
    
    return gameState;
  }

  /**
   * ゲームがプレイ可能な状態かどうかを判定
   * @returns {boolean} プレイ可能かどうか
   */
  isPlayable() {
    return this.gameState === 'playing' && this.players.length === 2;
  }

  /**
   * ゲームが終了しているかどうかを判定
   * @returns {boolean} 終了しているかどうか
   */
  isFinished() {
    return this.gameState === 'finished';
  }

  /**
   * 山が空かどうかを判定
   * @returns {boolean} 山が空かどうか
   */
  isDeckEmpty() {
    return this.deck.isEmpty();
  }

  /**
   * リーチ宣言を処理
   * @param {string} playerId - リーチを宣言するプレイヤーID
   * @returns {boolean} リーチ宣言が成功したかどうか
   */
  handleReachDeclaration(playerId) {
    const player = this.getPlayer(playerId);
    
    // プレイヤーが存在し、ゲームがプレイ中で、そのプレイヤーの手番であることを確認
    if (!player || this.gameState !== 'playing' || !this.isPlayerTurn(playerId)) {
      return false;
    }
    
    // 既にリーチしている場合は宣言できない
    if (player.isRiichi) {
      return false;
    }
    
    // リーチを宣言
    player.declareReach();
    this.updateLastActivity();
    
    return true;
  }

  /**
   * 最後のアクティビティ時刻を更新
   */
  updateLastActivity() {
    this.lastActivity = Date.now();
  }

  /**
   * ゲームの経過時間を取得（分）
   * @returns {number} 経過時間（分）
   */
  getElapsedMinutes() {
    return Math.floor((Date.now() - this.createdAt) / (1000 * 60));
  }
}

module.exports = Game;
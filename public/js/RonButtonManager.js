/**
 * ロンボタン管理クラス - クライアント側のロンボタン表示制御を管理
 */
class RonButtonManager {
  constructor() {
    this.ronBtn = document.getElementById('ron-btn');
    this.tsumoBtn = document.getElementById('tsumo-btn');
    this.currentRonData = null;
    this.ronTimeoutId = null;
    this.isRonAvailable = false;
  }

  /**
   * ロンボタンを表示
   * @param {Object} ronData - ロン可能データ
   */
  showRonButton(ronData) {
    try {
      console.log('ロンボタン表示開始:', ronData);

      this.currentRonData = ronData;
      this.isRonAvailable = true;

      if (!this.ronBtn) {
        console.error('ronBtn要素が見つかりません');
        return false;
      }

      // ロンボタンを強制表示
      this.ronBtn.style.display = 'inline-block';
      this.ronBtn.disabled = false;
      this.ronBtn.style.visibility = 'visible';
      this.ronBtn.style.opacity = '1';
      this.ronBtn.classList.add('ron-available');

      // ツモボタンは非表示
      if (this.tsumoBtn) {
        this.tsumoBtn.style.display = 'none';
      }

      // クリックイベントを設定
      this.setupRonButtonClick();

      // タイムアウトタイマーを設定
      if (ronData.timeout) {
        this.setRonTimeout(ronData.timeout);
      }

      // ユーザー通知
      this.showRonNotification(ronData.message || 'ロン可能です！');

      console.log('ロンボタン表示完了:', {
        display: this.ronBtn.style.display,
        disabled: this.ronBtn.disabled,
        visibility: this.ronBtn.style.visibility,
        opacity: this.ronBtn.style.opacity
      });

      return true;

    } catch (error) {
      console.error('ロンボタン表示でエラー:', error);
      return false;
    }
  }

  /**
   * ロンボタンを非表示
   * @param {string} reason - 非表示にする理由
   */
  hideRonButton(reason = '通常') {
    try {
      console.log('ロンボタン非表示:', reason);

      this.isRonAvailable = false;
      this.currentRonData = null;

      if (this.ronBtn) {
        this.ronBtn.style.display = 'none';
        this.ronBtn.disabled = true;
        this.ronBtn.classList.remove('ron-available');
        this.ronBtn.onclick = null;
      }

      // タイムアウトタイマーをクリア
      this.clearRonTimeout();

      return true;

    } catch (error) {
      console.error('ロンボタン非表示でエラー:', error);
      return false;
    }
  }

  /**
   * ロンボタンのクリックイベントを設定
   */
  setupRonButtonClick() {
    if (!this.ronBtn || !this.currentRonData) {
      return;
    }

    this.ronBtn.onclick = () => {
      try {
        console.log('ロンボタンがクリックされました');

        if (!this.isRonAvailable || !this.currentRonData) {
          console.warn('ロン不可状態でクリックされました');
          return;
        }

        // ロン宣言データを準備
        const ronDeclaration = {
          type: 'ron',
          lastDiscardedTile: this.currentRonData.lastDiscardedTile,
          waitingTiles: this.currentRonData.waitingTiles
        };

        console.log('ロン宣言データ:', ronDeclaration);

        // サーバーにロン宣言を送信
        if (this.safeEmit('declareWin', ronDeclaration)) {
          // ボタンを無効化
          this.ronBtn.disabled = true;
          this.ronBtn.classList.add('declaring');

          // 他のボタンも非表示
          this.hideAllWinningButtons();

          // ユーザー通知
          this.showMessage('ロン宣言しました！', 3000);

          console.log('ロン宣言を送信しました');
        } else {
          console.error('ロン宣言の送信に失敗しました');
          this.showError('ロン宣言の送信に失敗しました');
        }

      } catch (error) {
        console.error('ロンボタンクリック処理でエラー:', error);
        this.showError('ロン宣言処理でエラーが発生しました');
      }
    };
  }

  /**
   * タイムアウトタイマーを設定
   * @param {number} timeout - タイムアウト時間（ミリ秒）
   */
  setRonTimeout(timeout) {
    // 既存のタイマーをクリア
    this.clearRonTimeout();

    console.log('ロン判定タイムアウトタイマー設定:', timeout + 'ms');

    this.ronTimeoutId = setTimeout(() => {
      this.handleRonTimeout();
    }, timeout);

    // カウントダウン表示を開始
    this.startCountdown(timeout);
  }

  /**
   * タイムアウトタイマーをクリア
   */
  clearRonTimeout() {
    if (this.ronTimeoutId) {
      clearTimeout(this.ronTimeoutId);
      this.ronTimeoutId = null;
    }

    // カウントダウン表示を停止
    this.stopCountdown();
  }

  /**
   * ロン判定タイムアウト処理
   */
  handleRonTimeout() {
    try {
      console.log('ロン判定タイムアウト');

      // ロンボタンを非表示
      this.hideRonButton('タイムアウト');

      // ユーザー通知
      this.showMessage('ロン判定がタイムアウトしました', 3000);

    } catch (error) {
      console.error('ロン判定タイムアウト処理でエラー:', error);
    }
  }

  /**
   * カウントダウン表示を開始
   * @param {number} totalTime - 総時間（ミリ秒）
   */
  startCountdown(totalTime) {
    const startTime = Date.now();
    
    const updateCountdown = () => {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, totalTime - elapsed);
      const seconds = Math.ceil(remaining / 1000);

      // ロンボタンにカウントダウンを表示
      if (this.ronBtn && this.isRonAvailable) {
        const originalText = 'ロン';
        this.ronBtn.textContent = `${originalText} (${seconds}s)`;

        // 残り時間に応じてスタイルを変更
        if (seconds <= 5) {
          this.ronBtn.classList.add('urgent');
        } else if (seconds <= 10) {
          this.ronBtn.classList.add('warning');
        }
      }

      if (remaining > 0 && this.isRonAvailable) {
        this.countdownIntervalId = setTimeout(updateCountdown, 100);
      }
    };

    updateCountdown();
  }

  /**
   * カウントダウン表示を停止
   */
  stopCountdown() {
    if (this.countdownIntervalId) {
      clearTimeout(this.countdownIntervalId);
      this.countdownIntervalId = null;
    }

    // ボタンテキストを元に戻す
    if (this.ronBtn) {
      this.ronBtn.textContent = 'ロン';
      this.ronBtn.classList.remove('urgent', 'warning');
    }
  }

  /**
   * 全ての上がり宣言ボタンを非表示
   */
  hideAllWinningButtons() {
    if (this.ronBtn) {
      this.ronBtn.style.display = 'none';
    }
    if (this.tsumoBtn) {
      this.tsumoBtn.style.display = 'none';
    }
  }

  /**
   * ロン可能状態かチェック
   * @returns {boolean} ロン可能かどうか
   */
  isRonButtonAvailable() {
    return this.isRonAvailable && this.currentRonData !== null;
  }

  /**
   * 現在のロンデータを取得
   * @returns {Object|null} 現在のロンデータ
   */
  getCurrentRonData() {
    return this.currentRonData;
  }

  /**
   * ロン通知を表示
   * @param {string} message - 通知メッセージ
   */
  showRonNotification(message) {
    // 既存のshowMessage関数を使用
    if (typeof showMessage === 'function') {
      showMessage(message, 5000);
    } else {
      console.log('ロン通知:', message);
    }
  }

  /**
   * メッセージを表示
   * @param {string} message - メッセージ
   * @param {number} duration - 表示時間
   */
  showMessage(message, duration = 3000) {
    if (typeof showMessage === 'function') {
      showMessage(message, duration);
    } else {
      console.log('メッセージ:', message);
    }
  }

  /**
   * エラーメッセージを表示
   * @param {string} message - エラーメッセージ
   */
  showError(message) {
    if (typeof showError === 'function') {
      showError(message);
    } else {
      console.error('エラー:', message);
    }
  }

  /**
   * 安全なSocket.io送信
   * @param {string} event - イベント名
   * @param {Object} data - 送信データ
   * @returns {boolean} 送信成功かどうか
   */
  safeEmit(event, data) {
    if (typeof safeEmit === 'function') {
      return safeEmit(event, data);
    } else if (typeof socket !== 'undefined' && socket.emit) {
      try {
        socket.emit(event, data);
        return true;
      } catch (error) {
        console.error('Socket.io送信エラー:', error);
        return false;
      }
    } else {
      console.error('Socket.io接続が利用できません');
      return false;
    }
  }

  /**
   * デバッグ情報を取得
   * @returns {Object} デバッグ情報
   */
  getDebugInfo() {
    return {
      isRonAvailable: this.isRonAvailable,
      hasCurrentRonData: !!this.currentRonData,
      hasRonTimeoutId: !!this.ronTimeoutId,
      ronBtnExists: !!this.ronBtn,
      ronBtnDisplay: this.ronBtn ? this.ronBtn.style.display : 'N/A',
      ronBtnDisabled: this.ronBtn ? this.ronBtn.disabled : 'N/A'
    };
  }
}

// グローバルインスタンスを作成
let ronButtonManager = null;

// DOM読み込み完了後に初期化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    ronButtonManager = new RonButtonManager();
  });
} else {
  ronButtonManager = new RonButtonManager();
}

// グローバルアクセス用
window.RonButtonManager = RonButtonManager;
window.ronButtonManager = ronButtonManager;
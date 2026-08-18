/* ==========================================================
   storage.js — 保存層
   実行環境によって保存先を切り替える。
     ・通常のブラウザ / GitHub Pages → localStorage
     ・Claude の Artifact 内           → window.storage
   どちらでも使えない場合はメモリ上だけに保持する（再読込で消える）。
   ========================================================== */
(function (global) {
  'use strict';

  var KEY = 'shukatsu-tracker:v1';
  var memory = null;

  function hasClaudeStorage() {
    return !!(global.storage && typeof global.storage.get === 'function');
  }

  function hasLocalStorage() {
    try {
      var probe = '__probe__';
      global.localStorage.setItem(probe, '1');
      global.localStorage.removeItem(probe);
      return true;
    } catch (err) {
      return false; // プライベートモードなどで拒否される場合がある
    }
  }

  var mode = hasClaudeStorage() ? 'claude' : (hasLocalStorage() ? 'local' : 'memory');

  var LABEL = {
    claude: 'この会話の保存領域に記録しています',
    local: 'この端末のブラウザに保存しています',
    memory: '保存できない設定です。書き出したテキストを控えてください'
  };

  async function read() {
    try {
      if (mode === 'claude') {
        var res = await global.storage.get(KEY);
        return res && res.value ? JSON.parse(res.value) : null;
      }
      if (mode === 'local') {
        var raw = global.localStorage.getItem(KEY);
        return raw ? JSON.parse(raw) : null;
      }
      return memory;
    } catch (err) {
      // キーが無い初回はここに来る。空として扱う。
      return null;
    }
  }

  async function write(data) {
    var text = JSON.stringify(data);
    if (mode === 'claude') {
      await global.storage.set(KEY, text);
      return;
    }
    if (mode === 'local') {
      global.localStorage.setItem(KEY, text);
      return;
    }
    memory = data;
  }

  global.App = global.App || {};
  global.App.store = { read: read, write: write, mode: mode, label: LABEL[mode], KEY: KEY };
})(window);

/* ==========================================================
   sync.js — GitHub のプライベートリポジトリと同期する
   ----------------------------------------------------------
   仕組み：
     データを JSON 1ファイルとしてリポジトリに置き、
     GitHub の Contents API で読み書きするだけ。
     サーバーを自前で用意しなくても、端末間で同じデータを見られる。

   設定（リポジトリ名・トークン）は端末ごとに localStorage へ保存する。
   リポジトリのコードには含まれないので、公開しても漏れない。
   ========================================================== */
(function (global) {
  'use strict';

  var App = global.App = global.App || {};
  var M = App.model;

  var CONFIG_KEY = 'shukatsu-sync:v1';
  var API = 'https://api.github.com';

  var config = { owner: '', repo: '', path: 'data.json', branch: 'main', token: '' };
  var fileSha = null;      // 更新に必要なファイルの版番号
  var busy = false;
  var listeners = [];
  var status = { state: 'off', message: '同期は未設定です' };

  /* ---------- 設定の保存と読み込み ---------- */
  function loadConfig() {
    try {
      var raw = global.localStorage.getItem(CONFIG_KEY);
      if (raw) {
        var saved = JSON.parse(raw);
        Object.keys(config).forEach(function (k) {
          if (typeof saved[k] === 'string') config[k] = saved[k];
        });
      }
    } catch (err) { /* 使えない環境では未設定のまま */ }
    setStatus(isOn() ? 'idle' : 'off', isOn() ? '未同期' : '同期は未設定です');
    return config;
  }

  function saveConfig(next) {
    Object.keys(config).forEach(function (k) {
      if (typeof next[k] === 'string') config[k] = next[k].trim();
    });
    if (!config.path) config.path = 'data.json';
    if (!config.branch) config.branch = 'main';
    try { global.localStorage.setItem(CONFIG_KEY, JSON.stringify(config)); } catch (err) { /* noop */ }
    fileSha = null;
  }

  function clearConfig() {
    config = { owner: '', repo: '', path: 'data.json', branch: 'main', token: '' };
    try { global.localStorage.removeItem(CONFIG_KEY); } catch (err) { /* noop */ }
    fileSha = null;
    setStatus('off', '同期は未設定です');
  }

  function getConfig() { return Object.assign({}, config); }
  function isOn() { return !!(config.owner && config.repo && config.token); }

  /* ---------- 状態通知 ---------- */
  function onChange(fn) { listeners.push(fn); }
  function setStatus(state, message) {
    status = { state: state, message: message };
    listeners.forEach(function (fn) { fn(status); });
  }
  function getStatus() { return status; }

  /* ---------- 日本語のUTF-8を含む Base64 変換 ---------- */
  function encodeBase64(text) {
    var bytes = new TextEncoder().encode(text);
    var binary = '';
    var CHUNK = 0x8000;
    for (var i = 0; i < bytes.length; i += CHUNK) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
    }
    return btoa(binary);
  }
  function decodeBase64(b64) {
    var binary = atob(String(b64).replace(/\s/g, ''));
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  /* ---------- API 呼び出し ---------- */
  function contentsUrl() {
    return API + '/repos/' + encodeURIComponent(config.owner) + '/' +
      encodeURIComponent(config.repo) + '/contents/' +
      config.path.split('/').map(encodeURIComponent).join('/');
  }

  function headers() {
    return {
      'Authorization': 'Bearer ' + config.token,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    };
  }

  function describeError(res) {
    if (res.status === 401) return 'トークンが無効か期限切れです';
    if (res.status === 403) return '権限が足りないか、アクセス制限中です';
    if (res.status === 404) return 'リポジトリ名かブランチ名を確認してください（権限不足でもこの表示になります）';
    if (res.status === 409 || res.status === 422) return '他の端末の更新と重なりました';
    return '通信に失敗しました（' + res.status + '）';
  }

  /** リポジトリからデータを読む。ファイルが無ければ null を返す。 */
  async function pull() {
    var url = contentsUrl() + '?ref=' + encodeURIComponent(config.branch) + '&t=' + Date.now();
    var res = await fetch(url, { headers: headers(), cache: 'no-store' });
    if (res.status === 404) { fileSha = null; return null; }
    if (!res.ok) throw new Error(describeError(res));
    var json = await res.json();
    fileSha = json.sha;
    try {
      return JSON.parse(decodeBase64(json.content));
    } catch (err) {
      throw new Error('保存されているファイルを読めませんでした');
    }
  }

  /** リポジトリへ書き込む。 */
  async function push(data) {
    var body = {
      message: '選考データを更新 ' + new Date().toLocaleString('ja-JP'),
      content: encodeBase64(JSON.stringify(data, null, 2)),
      branch: config.branch
    };
    if (fileSha) body.sha = fileSha;

    var res = await fetch(contentsUrl(), {
      method: 'PUT', headers: headers(), body: JSON.stringify(body)
    });
    if (res.status === 409 || res.status === 422) { var e = new Error('conflict'); e.conflict = true; throw e; }
    if (!res.ok) throw new Error(describeError(res));
    var json = await res.json();
    fileSha = json.content && json.content.sha;
  }

  /* ---------- 同期本体 ----------
     読み込み → マージ → 保存 → 書き戻し、の順で行う。
     衝突したら、もう一度読み直してマージし直す。 */
  async function syncNow(options) {
    options = options || {};
    if (!isOn()) { setStatus('off', '同期は未設定です'); return false; }
    if (busy) return false;
    busy = true;
    setStatus('busy', '同期中…');

    try {
      var before = M.fingerprint(M.state);
      var remote = await pull();
      if (remote) M.mergeInto(M.state, remote);

      var after = M.fingerprint(M.state);
      if (after !== before) {
        await App.store.write(M.state);
        App.view.render();
      }

      var remoteFingerprint = remote ? M.fingerprint(remote) : null;
      if (options.push !== false && remoteFingerprint !== after) {
        try {
          await push(M.state);
        } catch (err) {
          if (!err.conflict) throw err;
          var again = await pull();          // 誰かが先に書いていたら取り込み直す
          if (again) M.mergeInto(M.state, again);
          await App.store.write(M.state);
          App.view.render();
          await push(M.state);
        }
      }

      setStatus('ok', '同期しました ' + new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }));
      return true;
    } catch (err) {
      setStatus('error', err.message || '同期に失敗しました');
      return false;
    } finally {
      busy = false;
    }
  }

  /** 設定画面の「接続を確認」用。書き込みはしない。 */
  async function testConnection(candidate) {
    var backup = getConfig();
    saveConfig(candidate);
    try {
      var remote = await pull();
      return { ok: true, exists: !!remote, count: remote && remote.entries ? remote.entries.length : 0 };
    } catch (err) {
      saveConfig(backup);
      return { ok: false, message: err.message };
    }
  }

  /* ---------- 編集のたびに少し待ってから送る ---------- */
  var timer = null;
  function scheduleSync(delay) {
    if (!isOn()) return;
    clearTimeout(timer);
    timer = setTimeout(function () { syncNow(); }, delay || 1500);
  }

  App.sync = {
    loadConfig: loadConfig,
    saveConfig: saveConfig,
    clearConfig: clearConfig,
    getConfig: getConfig,
    isOn: isOn,
    onChange: onChange,
    getStatus: getStatus,
    syncNow: syncNow,
    scheduleSync: scheduleSync,
    testConnection: testConnection
  };
})(window);

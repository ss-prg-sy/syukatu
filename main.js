/* ==========================================================
   main.js — イベント登録と初期化
   ========================================================== */
(function (global) {
  'use strict';

  var App = global.App;
  var M = App.model;
  var $ = M.$;

  /* ---------- 保存（連打対策に少しまとめる） ---------- */
  var saveTimer = null;
  function persist() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      App.store.write(M.state).catch(function () {
        App.view.toast('この端末に保存できませんでした');
      });
    }, 250);
  }

  /** 保存 → 再描画 → 少し待ってリポジトリへ送る */
  function saveAndRender() {
    persist();
    App.view.render();
    App.sync.scheduleSync();
  }

  /* ---------- 同期の状態表示 ---------- */
  var STATUS_TEXT = { off: '同期オフ', idle: '未同期', busy: '同期中…', ok: '同期済み', error: '同期エラー' };
  App.sync.onChange(function (status) {
    var chip = $('#syncStatus');
    if (!chip) return;
    chip.className = 'sync-chip ' + status.state;
    chip.textContent = STATUS_TEXT[status.state] || '';
    chip.title = status.message || '';
    var note = $('#storageNote');
    if (note) note.textContent = status.message || App.store.label;
  });

  /* ---------- クリック（イベント委譲） ---------- */
  document.addEventListener('click', function (ev) {
    var t = ev.target.closest('button');
    if (!t) return;

    // モーダルが開いていれば、まずそちらに処理を渡す
    if (App.editor.isOpen() && App.editor.handleClick(t, saveAndRender)) return;
    if (t.dataset.close) { App.editor.closeSheet(); return; }

    if (t.id === 'addWide' || t.id === 'addFab' || t.dataset.new) {
      App.editor.openEdit(M.blankEntry());
      return;
    }
    if (t.dataset.addCompany !== undefined) {
      App.editor.openEdit(M.blankEntry(t.dataset.addCompany));
      return;
    }
    if (t.id === 'btnSample') {
      M.state.entries = M.sampleEntries();
      saveAndRender();
      App.view.toast('サンプルを入れました。編集も削除も自由にどうぞ');
      return;
    }
    if (t.id === 'btnBackup') { App.editor.openBackup(saveAndRender); return; }
    if (t.id === 'btnSyncSettings') { App.editor.openSync(saveAndRender); return; }
    if (t.id === 'syncStatus') {
      if (App.sync.isOn()) App.sync.syncNow();
      else App.editor.openSync(saveAndRender);
      return;
    }

    // 編集を開く
    if (t.dataset.edit) {
      var target = M.state.entries.find(function (x) { return x.id === t.dataset.edit; });
      if (target) App.editor.openEdit(target);
      return;
    }
  });

  /* ---------- 一覧の状況セレクト（モーダルを開かずに変更） ---------- */
  document.addEventListener('change', function (ev) {
    var sel = ev.target.closest('select[data-status]');
    if (!sel) return;
    var e = M.state.entries.find(function (x) { return x.id === sel.dataset.status; });
    if (!e) return;
    e.result = sel.value;
    M.touch(e);
    saveAndRender();
    App.view.toast(e.company + '：' + M.resultLabel(e));
  });

  /* ---------- 種別ラジオの切り替え ---------- */
  document.addEventListener('change', function (ev) {
    if (ev.target.name === 'segment') App.editor.handleSegmentChange();
  });

  /* ---------- モーダルを閉じる操作 ---------- */
  $('#scrim').addEventListener('click', function (ev) {
    if (ev.target.id === 'scrim') App.editor.closeSheet();
  });
  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape') App.editor.closeSheet();
  });

  /* ---------- 検索と絞り込み ---------- */
  $('#q').addEventListener('input', function (ev) {
    M.ui.q = ev.target.value;
    App.view.render();
  });

  [['segKind', 'kind'], ['segState', 'life']].forEach(function (pair) {
    var bar = $('#' + pair[0]);
    bar.addEventListener('click', function (ev) {
      var btn = ev.target.closest('button');
      if (!btn) return;
      Array.prototype.forEach.call(bar.children, function (child) {
        child.setAttribute('aria-pressed', String(child === btn));
      });
      M.ui[pair[1]] = btn.dataset.v;
      App.view.render();
    });
  });

  /* ---------- 画面に戻ってきたら取り込み直す ---------- */
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) App.sync.scheduleSync(400);
  });
  global.addEventListener('online', function () { App.sync.scheduleSync(400); });

  /* ---------- 起動 ---------- */
  (async function init() {
    var saved = await App.store.read();
    if (saved && Array.isArray(saved.entries)) {
      M.state.entries = saved.entries.map(M.normalize);  // 旧形式のステップ等を落とす
      M.state.deleted = saved.deleted || {};
    }
    $('#storageNote').textContent = App.store.label;
    if (App.store.mode === 'memory') $('#storageAlert').hidden = false;
    App.view.render();          // まず手元のデータで描く（待たせない）

    App.sync.loadConfig();
    if (App.sync.isOn()) App.sync.syncNow();
  })();
})(window);

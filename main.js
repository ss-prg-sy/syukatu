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

    // 企業カードの開閉
    if (t.dataset.company !== undefined) {
      var name = t.dataset.company;
      M.ui.closed[name] = !M.ui.closed[name];
      t.closest('.co').classList.toggle('open');
      t.setAttribute('aria-expanded', String(!M.ui.closed[name]));
      return;
    }

    // 編集を開く
    if (t.dataset.edit) {
      var target = M.state.entries.find(function (x) { return x.id === t.dataset.edit; });
      if (target) App.editor.openEdit(target);
      return;
    }

    // 1つ先へ進む
    if (t.dataset.advance) {
      var e = M.state.entries.find(function (x) { return x.id === t.dataset.advance; });
      if (e && e.cur < e.steps.length - 1) {
        e.cur += 1;
        e.history.push({ d: M.todayISO(), t: e.steps[e.cur] + ' に進んだ' });
        M.syncResultToStep(e);
        M.touch(e);
        saveAndRender();
        App.view.toast(e.company + '：' + e.steps[e.cur]);
      }
      return;
    }

    // 路線図の駅を直接押して現在地を変える
    if (t.dataset.jump) {
      var parts = t.dataset.jump.split(':');
      var entry = M.state.entries.find(function (x) { return x.id === parts[0]; });
      if (entry) {
        entry.cur = parseInt(parts[1], 10);
        entry.history.push({ d: M.todayISO(), t: entry.steps[entry.cur] + ' に変更' });
        M.syncResultToStep(entry);
        M.touch(entry);
        saveAndRender();
      }
      return;
    }
  });

  /* ---------- 種別ラジオの切り替え ---------- */
  document.addEventListener('change', function (ev) {
    if (ev.target.name === 'segment') App.editor.handleSegmentChange();
    else if (ev.target.name === 'result') App.editor.handleResultChange();
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
      M.state.entries = saved.entries;
      M.state.deleted = saved.deleted || {};
    }
    $('#storageNote').textContent = App.store.label;
    App.view.render();          // まず手元のデータで描く（待たせない）

    App.sync.loadConfig();
    if (App.sync.isOn()) App.sync.syncNow();
  })();
})(window);

/* ==========================================================
   editor.js — 追加・編集モーダル / バックアップ画面
   ========================================================== */
(function (global) {
  'use strict';

  var App = global.App = global.App || {};
  var M = App.model;
  var $ = M.$, esc = M.esc;

  var draft = null;      // 編集中のコピー
  var isNew = false;

  function isOpen() { return draft !== null; }

  function openSheet() {
    $('#scrim').classList.add('on');
    document.body.style.overflow = 'hidden';
  }

  function closeSheet() {
    $('#scrim').classList.remove('on');
    document.body.style.overflow = '';
    draft = null;
  }

  function openEdit(entry) {
    draft = JSON.parse(JSON.stringify(entry));
    isNew = !M.state.entries.some(function (x) { return x.id === entry.id; });
    paintSheet();
    openSheet();
    var co = $('#f-company');
    if (isNew && co && !co.value) co.focus();
  }

  /* ---------- フォーム描画 ----------
     入力するのは「企業名・区分・状況」の3つだけ。
     締切とメモは、必要な人だけが開けばよい。 */
  function paintSheet() {
    var d = draft;
    var names = [];
    M.state.entries.forEach(function (e) {
      if (names.indexOf(e.company) < 0) names.push(e.company);
    });

    $('#sheet').innerHTML =
      '<div class="sheet-head">' +
        '<h2>' + (isNew ? '追加' : '編集') + '</h2>' +
        '<button type="button" class="btn subtle sm" data-close="1">閉じる</button>' +
      '</div>' +
      '<div class="sheet-body">' +

        '<div class="field"><label for="f-company">企業名</label>' +
          '<input id="f-company" type="text" list="company-list" value="' + esc(d.company) + '" placeholder="例）〇〇商事">' +
          '<datalist id="company-list">' +
            names.map(function (n) { return '<option value="' + esc(n) + '">'; }).join('') +
          '</datalist></div>' +

        '<div class="field"><label>区分</label><div class="radios">' +
          M.SEGMENTS.map(function (seg) {
            return '<label><input type="radio" name="segment" value="' + seg.value + '"' +
              (M.segmentOf(d) === seg.value ? ' checked' : '') + '>' + seg.label + '</label>';
          }).join('') + '</div></div>' +

        '<div class="field"><label>いまの状況</label><div class="radios">' +
          M.RESULTS[d.kind].map(function (r) {
            return '<label><input type="radio" name="result" value="' + r + '"' +
              (d.result === r ? ' checked' : '') + '>' + (M.RESULT_LABEL[d.kind][r] || r) + '</label>';
          }).join('') + '</div></div>' +

        '<div class="field"><label for="f-memo">メモ（任意）</label>' +
          '<textarea id="f-memo" placeholder="自由に。選考の感触、面接の日程、聞かれたこと など">' + esc(d.memo) + '</textarea></div>' +

      '</div>' +
      '<div class="sheet-foot">' +
        (isNew ? '' : '<button type="button" class="btn danger sm" data-delete="1">削除</button>') +
        '<button type="button" class="btn" data-save="1">保存する</button>' +
      '</div>';
  }

  /** 画面の入力値を draft に取り込む */
  function collect() {
    if (!draft) return;
    var d = draft, sheet = $('#sheet');
    var picked = function (name) { return sheet.querySelector('input[name=' + name + ']:checked'); };

    if ($('#f-company')) d.company = $('#f-company').value.trim();

    var seg = picked('segment');
    if (seg) {
      var parts = seg.value.split(':');
      d.kind = parts[0];
      if (d.kind === 'intern') d.season = parts[1] || 'その他';
    }
    var r = picked('result'); if (r) d.result = r.value;
    if ($('#f-memo')) d.memo = $('#f-memo').value;
  }

  /** 区分を変えたとき、その種別に無い状況が選ばれていたら戻す */
  function handleSegmentChange() {
    if (!draft) return;
    collect();
    if (M.RESULTS[draft.kind].indexOf(draft.result) < 0) draft.result = '進行中';
    paintSheet();
  }

  /* ---------- 保存 ---------- */
  function commit(onSaved) {
    collect();
    if (!draft.company) {
      App.view.toast('企業名を入力してください');
      $('#f-company').focus();
      return;
    }
    var next = JSON.parse(JSON.stringify(draft));
    next.updated = M.nowISO();   // 端末間マージで新旧を判定するために必要
    var i = M.state.entries.findIndex(function (x) { return x.id === next.id; });

    if (i < 0) {
      M.state.entries.push(next);
    } else {
      M.state.entries[i] = next;
    }
    closeSheet();
    onSaved();
    App.view.toast('保存しました');
  }

  function remove(onSaved) {
    if (!confirm('このエントリーを削除します。よろしいですか？')) return;
    M.markDeleted(draft.id);   // 削除記録を残さないと、別端末から復活してしまう
    closeSheet();
    onSaved();
    App.view.toast('削除しました');
  }

  /* ---------- モーダル内のクリック処理 ---------- */
  function handleClick(target, onSaved) {
    if (target.dataset.close) { closeSheet(); return true; }
    if (target.dataset.save) { commit(onSaved); return true; }
    if (target.dataset.delete) { remove(onSaved); return true; }
    return false;
  }

  /* ---------- バックアップ画面 ---------- */
  function openBackup(onLoaded) {
    draft = null;
    $('#sheet').innerHTML =
      '<div class="sheet-head"><h2>データの書き出し / 読み込み</h2>' +
        '<button type="button" class="btn subtle sm" data-close="1">閉じる</button></div>' +
      '<div class="sheet-body"><div class="field">' +
        '<label>このテキストを控えておくと、いつでも復元できます</label>' +
        '<textarea id="backup-area" class="backup-area">' + esc(JSON.stringify(M.state)) + '</textarea>' +
        '<div class="hint">別の内容を貼り付けて「読み込む」を押すと、今のデータは上書きされます。</div>' +
      '</div></div>' +
      '<div class="sheet-foot">' +
        '<button type="button" class="btn ghost" id="backup-copy">コピーする</button>' +
        '<button type="button" class="btn" id="backup-load">読み込む</button>' +
      '</div>';
    openSheet();

    $('#backup-copy').onclick = function () {
      var ta = $('#backup-area');
      ta.select();
      if (navigator.clipboard) {
        navigator.clipboard.writeText(ta.value)
          .then(function () { App.view.toast('コピーしました'); })
          .catch(function () { App.view.toast('全選択しました。手動でコピーしてください'); });
      } else {
        App.view.toast('全選択しました。手動でコピーしてください');
      }
    };
    $('#backup-load').onclick = function () {
      try {
        var data = JSON.parse($('#backup-area').value);
        if (!data || !Array.isArray(data.entries)) throw new Error('format');
        M.state.entries = data.entries;
        closeSheet();
        onLoaded();
        App.view.toast('読み込みました');
      } catch (err) {
        App.view.toast('形式が違うようです。書き出したテキストをそのまま貼り付けてください');
      }
    };
  }

  /* ---------- 同期設定画面 ---------- */
  function openSync(onSynced) {
    draft = null;
    var c = App.sync.getConfig();
    var on = App.sync.isOn();

    $('#sheet').innerHTML =
      '<div class="sheet-head"><h2>端末間の同期</h2>' +
        '<button type="button" class="btn subtle sm" data-close="1">閉じる</button></div>' +
      '<div class="sheet-body">' +
        '<p class="hint" style="margin-top:0">GitHub のプライベートリポジトリにデータを1ファイルとして置き、' +
        'PCとスマホで同じ内容を読み書きします。設定はこの端末の中だけに保存され、リポジトリには入りません。</p>' +

        '<div class="grid2">' +
          '<div class="field"><label for="s-owner">GitHub ユーザー名</label>' +
            '<input id="s-owner" type="text" value="' + esc(c.owner) + '" placeholder="例）taro-yamada"></div>' +
          '<div class="field"><label for="s-repo">データ用リポジトリ名</label>' +
            '<input id="s-repo" type="text" value="' + esc(c.repo) + '" placeholder="例）shukatsu-data"></div>' +
        '</div>' +

        '<div class="grid2">' +
          '<div class="field"><label for="s-path">ファイル名</label>' +
            '<input id="s-path" type="text" value="' + esc(c.path) + '" placeholder="data.json"></div>' +
          '<div class="field"><label for="s-branch">ブランチ</label>' +
            '<input id="s-branch" type="text" value="' + esc(c.branch) + '" placeholder="main"></div>' +
        '</div>' +

        '<div class="field"><label for="s-token">アクセストークン</label>' +
          '<input id="s-token" type="password" value="' + esc(c.token) + '" placeholder="github_pat_..." autocomplete="off">' +
          '<div class="hint">Fine-grained token を、上のリポジトリ1つだけ・Contents を Read and write に設定して発行してください。' +
          '手順は README に書いてあります。</div></div>' +

        '<p class="hint" id="s-result"></p>' +
      '</div>' +
      '<div class="sheet-foot">' +
        (on ? '<button type="button" class="btn danger sm" id="sync-clear">解除</button>' : '') +
        '<button type="button" class="btn" id="sync-save">接続して同期する</button>' +
      '</div>';
    openSheet();

    var say = function (text) { $('#s-result').textContent = text; };

    $('#sync-save').onclick = async function () {
      var candidate = {
        owner: $('#s-owner').value, repo: $('#s-repo').value,
        path: $('#s-path').value, branch: $('#s-branch').value, token: $('#s-token').value
      };
      if (!candidate.owner.trim() || !candidate.repo.trim() || !candidate.token.trim()) {
        say('ユーザー名・リポジトリ名・トークンを入力してください');
        return;
      }
      say('接続を確認しています…');
      var result = await App.sync.testConnection(candidate);
      if (!result.ok) { say('つながりませんでした：' + result.message); return; }
      say(result.exists
        ? '接続できました。保存済みの ' + result.count + ' 件を取り込みます…'
        : '接続できました。まだファイルが無いので、この端末のデータで作成します…');
      await App.sync.syncNow();
      onSynced();
      closeSheet();
      App.view.toast('同期を開始しました');
    };

    if (on) {
      $('#sync-clear').onclick = function () {
        if (!confirm('この端末の同期設定を消します。リポジトリ側のデータは残ります。よろしいですか？')) return;
        App.sync.clearConfig();
        closeSheet();
        App.view.toast('同期を解除しました');
      };
    }
  }

  App.editor = {
    openEdit: openEdit,
    openBackup: openBackup,
    openSync: openSync,
    closeSheet: closeSheet,
    isOpen: isOpen,
    handleClick: handleClick,
    handleSegmentChange: handleSegmentChange
  };
})(window);

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

  /* ---------- フォーム描画 ---------- */
  function paintSheet() {
    var d = draft;
    var names = [];
    M.state.entries.forEach(function (e) {
      if (names.indexOf(e.company) < 0) names.push(e.company);
    });

    $('#sheet').innerHTML =
      '<div class="sheet-head">' +
        '<h2>' + (isNew ? 'エントリーを追加' : 'エントリーを編集') + '</h2>' +
        '<button type="button" class="btn subtle sm" data-close="1">閉じる</button>' +
      '</div>' +
      '<div class="sheet-body">' +

        '<div class="field"><label for="f-company">企業名</label>' +
          '<input id="f-company" type="text" list="company-list" value="' + esc(d.company) + '" placeholder="例）〇〇商事">' +
          '<datalist id="company-list">' +
            names.map(function (n) { return '<option value="' + esc(n) + '">'; }).join('') +
          '</datalist>' +
          '<div class="hint">同じ企業名にすると、一覧では1つのカードにまとまります。</div></div>' +

        '<div class="field"><label>種別</label><div class="radios">' +
          '<label><input type="radio" name="kind" value="intern"' + (d.kind === 'intern' ? ' checked' : '') + '>インターン</label>' +
          '<label><input type="radio" name="kind" value="honsen"' + (d.kind === 'honsen' ? ' checked' : '') + '>本選考</label>' +
        '</div></div>' +

        '<div class="field" id="f-season-wrap"' + (d.kind === 'honsen' ? ' hidden' : '') + '>' +
          '<label>時期</label><div class="radios">' +
          M.SEASONS.map(function (s) {
            return '<label><input type="radio" name="season" value="' + s + '"' +
              (d.season === s ? ' checked' : '') + '>' + s + '</label>';
          }).join('') + '</div></div>' +

        '<div class="grid2">' +
          '<div class="field"><label for="f-role">職種・コース</label>' +
            '<input id="f-role" type="text" value="' + esc(d.role) + '" placeholder="例）総合職 / エンジニア"></div>' +
          '<div class="field"><label for="f-label">見出しメモ（任意）</label>' +
            '<input id="f-label" type="text" value="' + esc(d.label) + '" placeholder="例）3days仕事体験"></div>' +
        '</div>' +

        '<div class="field"><label>志望度</label><div class="radios">' +
          [1, 2, 3].map(function (p) {
            return '<label><input type="radio" name="pri" value="' + p + '"' +
              (d.pri === p ? ' checked' : '') + '>' + '★'.repeat(p) + '</label>';
          }).join('') + '</div></div>' +

        '<div class="field"><label>選考ステップ（企業ごとに自由に変えられます）</label>' +
          '<div class="steps-editor" id="f-steps"></div>' +
          '<div class="hint">丸印を押すと、そこが現在地になります。テンプレを入れ直す：' +
            '<button type="button" class="btn subtle sm" data-template="intern">インターン</button> ' +
            '<button type="button" class="btn subtle sm" data-template="honsen">本選考</button></div></div>' +

        '<div class="field"><label>結果</label><div class="radios">' +
          M.RESULTS[d.kind].map(function (r) {
            return '<label><input type="radio" name="result" value="' + r + '"' +
              (d.result === r ? ' checked' : '') + '>' + r + '</label>';
          }).join('') + '</div></div>' +

        '<div class="grid2">' +
          '<div class="field"><label for="f-task">次にやること</label>' +
            '<input id="f-task" type="text" value="' + esc(d.task) + '" placeholder="例）ES提出 / 二次面接"></div>' +
          '<div class="field"><label for="f-due">期限</label>' +
            '<input id="f-due" type="date" value="' + esc(d.due) + '"></div>' +
        '</div>' +

        '<div class="field"><label for="f-url">マイページ・応募先URL</label>' +
          '<input id="f-url" type="url" value="' + esc(d.url) + '" placeholder="https://">' +
          '<div class="hint">パスワードは書かないでください。データは暗号化されずに保存されます。</div></div>' +

        '<div class="field"><label for="f-memo">メモ（ESの設問、面接で聞かれたこと など）</label>' +
          '<textarea id="f-memo" placeholder="例）ガクチカ400字で提出済み／面接官2名・逆質問あり">' + esc(d.memo) + '</textarea></div>' +

        (d.history.length
          ? '<div class="history"><label style="font-size:12px;color:var(--muted)">記録</label><ul>' +
              d.history.slice().reverse().map(function (h) {
                return '<li><span class="d">' + esc(h.d) + '</span>' + esc(h.t) + '</li>';
              }).join('') + '</ul></div>'
          : '') +

      '</div>' +
      '<div class="sheet-foot">' +
        (isNew ? '' : '<button type="button" class="btn danger sm" data-delete="1">削除</button>') +
        '<button type="button" class="btn" data-save="1">保存する</button>' +
      '</div>';

    paintSteps();
  }

  function paintSteps() {
    $('#f-steps').innerHTML = draft.steps.map(function (s, i) {
      return '<div class="step-row">' +
        '<button type="button" class="mark" data-set-current="' + i + '" title="現在地にする">' +
          (i === draft.cur ? '●' : '○') + '</button>' +
        '<input type="text" value="' + esc(s) + '" data-step-index="' + i + '">' +
        '<button type="button" class="x" data-remove-step="' + i + '" title="削除">×</button>' +
      '</div>';
    }).join('') +
    '<div class="step-row"><span class="mark"></span>' +
      '<button type="button" class="btn subtle sm" data-add-step="1" style="width:100%">＋ ステップを追加</button></div>';
  }

  /** 画面の入力値を draft に取り込む */
  function collect() {
    if (!draft) return;
    var d = draft, sheet = $('#sheet');
    var val = function (id) { var el = $(id); return el ? el.value : ''; };
    var picked = function (name) { return sheet.querySelector('input[name=' + name + ']:checked'); };

    d.company = val('#f-company').trim();
    d.role = val('#f-role').trim();
    d.label = val('#f-label').trim();
    d.task = val('#f-task').trim();
    d.due = val('#f-due');
    d.url = val('#f-url').trim();
    d.memo = val('#f-memo');

    var k = picked('kind'); if (k) d.kind = k.value;
    var s = picked('season'); if (s) d.season = s.value;
    var p = picked('pri'); if (p) d.pri = parseInt(p.value, 10);
    var r = picked('result'); if (r) d.result = r.value;

    Array.prototype.forEach.call($('#f-steps').querySelectorAll('input[data-step-index]'), function (inp) {
      d.steps[parseInt(inp.dataset.stepIndex, 10)] = inp.value.trim() || '（無題）';
    });
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
    var stamp = M.todayISO();
    var i = M.state.entries.findIndex(function (x) { return x.id === next.id; });

    if (i < 0) {
      next.history = [{ d: stamp, t: '登録' }];
      M.state.entries.push(next);
    } else {
      var prev = M.state.entries[i];
      if (prev.steps[prev.cur] !== next.steps[next.cur]) {
        next.history.push({ d: stamp, t: next.steps[next.cur] + ' に更新' });
      }
      if (prev.result !== next.result) {
        next.history.push({ d: stamp, t: '結果：' + next.result });
      }
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

    if (target.dataset.template) {
      collect();
      draft.steps = M.TEMPLATES[target.dataset.template].slice();
      draft.cur = Math.min(draft.cur, draft.steps.length - 1);
      paintSteps();
      return true;
    }
    if (target.dataset.addStep) {
      collect();
      draft.steps.push('新しいステップ');
      paintSteps();
      return true;
    }
    if (target.dataset.removeStep !== undefined) {
      collect();
      if (draft.steps.length <= 1) { App.view.toast('ステップは1つ以上必要です'); return true; }
      draft.steps.splice(parseInt(target.dataset.removeStep, 10), 1);
      draft.cur = Math.min(draft.cur, draft.steps.length - 1);
      paintSteps();
      return true;
    }
    if (target.dataset.setCurrent !== undefined) {
      collect();
      draft.cur = parseInt(target.dataset.setCurrent, 10);
      paintSteps();
      return true;
    }
    return false;
  }

  /** 種別を切り替えたらステップと結果を初期化する */
  function handleKindChange() {
    if (!draft) return;
    collect();
    draft.steps = M.TEMPLATES[draft.kind].slice();
    draft.cur = 0;
    draft.result = '進行中';
    paintSheet();
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
    handleKindChange: handleKindChange
  };
})(window);

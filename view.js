/* ==========================================================
   view.js — 画面の描画
   ========================================================== */
(function (global) {
  'use strict';

  var App = global.App = global.App || {};
  var M = App.model;
  var $ = M.$, esc = M.esc;

  var toastTimer = null;
  function toast(message) {
    var el = $('#toast');
    el.textContent = message;
    el.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('on'); }, 2200);
  }

  /* ---------- 上部の集計 ---------- */
  function renderTally() {
    var t = M.tally();
    $('#tally').innerHTML =
      '<div class="tally-cell intern">' +
        '<div class="tally-label">インターン 参加</div>' +
        '<div class="tally-main"><span class="n">' + t.internJoin + '</span><span class="unit">社</span></div>' +
        '<div class="tally-sub">応募 <span class="num">' + t.internAll + '</span> 社 ／ <span class="num">' + t.internEntries + '</span> 件</div>' +
      '</div>' +
      '<div class="tally-cell honsen">' +
        '<div class="tally-label">本選考 選考中</div>' +
        '<div class="tally-main"><span class="n">' + t.honsenLive + '</span><span class="unit">社</span>' +
          '<span class="unit">／ ' + t.honsenAll + ' 社中</span></div>' +
        '<div class="tally-sub">終了 <span class="num">' + t.honsenOut + '</span> 社</div>' +
      '</div>' +
      '<div class="tally-cell">' +
        '<div class="tally-label">内定</div>' +
        '<div class="tally-main"><span class="n">' + t.offer + '</span><span class="unit">社</span></div>' +
        '<div class="tally-sub">インターン参加済み <span class="num">' + t.internDone + '</span> 社</div>' +
      '</div>' +
      '<div class="tally-cell">' +
        '<div class="tally-label">ES提出済み</div>' +
        '<div class="tally-main"><span class="n">' + t.esDone + '</span><span class="unit">件</span></div>' +
        '<div class="tally-sub">全エントリー <span class="num">' + t.total + '</span> 件</div>' +
      '</div>';
  }

  /* ---------- 直近の締切 ---------- */
  function renderDeadlines() {
    var rows = M.state.entries
      .filter(function (e) { return e.task && e.due && !M.isEnded(e); })
      .map(function (e) { return { e: e, days: M.daysUntil(e.due) }; })
      .filter(function (x) { return x.days !== null && x.days <= 7; })
      .sort(function (a, b) { return a.days - b.days; });

    $('#dlSec').hidden = rows.length === 0;
    $('#dlCount').textContent = rows.length ? rows.length + '件' : '';
    $('#deadlines').innerHTML = rows.map(function (x) {
      var e = x.e;
      return '<button type="button" class="dl ' + M.signalOf(x.days) + '" data-edit="' + e.id + '">' +
        '<span class="dl-when">' + M.whenText(x.days) + '</span>' +
        '<span class="dl-body">' +
          '<span class="dl-task">' + esc(e.task) + '</span>' +
          '<span class="dl-meta">' + esc(e.company) + ' ・ ' + esc(M.kindLabel(e)) +
            (e.role ? ' ・ ' + esc(e.role) : '') +
            ' ・ <span class="num">' + esc(e.due) + '</span></span>' +
        '</span></button>';
    }).join('');
  }

  /* ---------- 路線図 ---------- */
  function railHTML(entry) {
    var stations = entry.steps.map(function (name, i) {
      var cls = i < entry.cur ? 'passed' : (i === entry.cur ? 'here' : '');
      return '<button type="button" class="stn ' + cls + '" data-jump="' + entry.id + ':' + i + '"' +
        ' title="' + esc(name) + ' に変更">' +
        '<span class="bar"></span><span class="dot"></span>' +
        '<span class="lbl">' + esc(name) + '</span></button>';
    }).join('');
    return '<div class="rail"><div class="rail-track">' + stations + '</div></div>';
  }

  /* ---------- エントリー1件 ---------- */
  function entryHTML(entry) {
    var days = M.daysUntil(entry.due);
    var ended = M.isEnded(entry);

    var badge = '';
    if (entry.result === '内定') badge = '<span class="result-badge offer">内定</span>';
    else if (entry.result === '参加確定' || entry.result === '参加済み') badge = '<span class="result-badge join">' + esc(entry.result) + '</span>';
    else if (ended) badge = '<span class="result-badge out">' + esc(entry.result) + '</span>';

    var next;
    if (ended) {
      next = '';
    } else if (entry.task) {
      next = '<span class="next">' +
        (days !== null ? '<span class="tag ' + M.signalOf(days) + '">' + M.whenText(days) + '</span>' : '') +
        '<span>' + esc(entry.task) + '</span>' +
        (entry.due ? '<span class="num due">' + esc(entry.due) + '</span>' : '') +
        '</span>';
    } else {
      next = '<span class="next none">次のタスク未設定</span>';
    }

    var advance = (!ended && entry.cur < entry.steps.length - 1)
      ? '<button type="button" class="btn subtle sm" data-advance="' + entry.id + '">次へ進む →</button>' : '';

    return '<div class="entry ' + entry.kind + (ended ? ' ended' : '') + '">' +
      '<div class="entry-top">' +
        '<div class="entry-title">' +
          '<span class="chip ' + (ended ? 'done' : entry.kind) + '">' + esc(M.kindLabel(entry)) + '</span>' +
          (entry.role ? '<span class="role"> ' + esc(entry.role) + '</span>' : '') +
          (entry.label ? '<span class="role"> / ' + esc(entry.label) + '</span>' : '') +
        '</div>' +
        badge +
        '<span class="stars" aria-label="志望度' + entry.pri + '">' +
          '★'.repeat(entry.pri) + '☆'.repeat(3 - entry.pri) + '</span>' +
      '</div>' +
      railHTML(entry) +
      '<div class="entry-foot">' + next +
        '<span class="entry-actions">' + advance +
          '<button type="button" class="btn subtle sm" data-edit="' + entry.id + '">編集</button>' +
        '</span>' +
      '</div></div>';
  }

  /* ---------- 企業カード ---------- */
  function renderCompanies() {
    var list = M.visibleEntries();
    var groups = M.groupByCompany(list);
    $('#coCount').textContent = groups.length ? groups.length + '社 / ' + list.length + '件' : '';

    if (!groups.length) {
      $('#companies').innerHTML = M.state.entries.length
        ? '<div class="empty"><h3>該当なし</h3>' +
          '<p>絞り込みを変えるか、検索キーワードを消してみてください。</p></div>'
        : '<div class="empty"><h3>まだ記録がありません</h3>' +
          '<p>1件目のエントリーを追加すると、選考の進み具合が路線図で見えるようになります。</p>' +
          '<div class="row">' +
            '<button type="button" class="btn" data-new="1">エントリーを追加</button>' +
            '<button type="button" class="btn ghost" id="btnSample">サンプルを入れて試す</button>' +
          '</div></div>';
      return;
    }

    $('#companies').innerHTML = groups.map(function (g) {
      var open = M.ui.closed[g.name] !== true;
      var chips = g.entries.map(function (e) {
        var cls = M.isEnded(e) ? 'done' : (e.result === '内定' ? 'offer' : e.kind);
        var status = M.isEnded(e) ? e.result : (e.result !== '進行中' ? e.result : e.steps[e.cur]);
        return '<span class="chip ' + cls + '">' + esc(M.kindLabel(e)) + '・' + esc(status) + '</span>';
      }).join('');

      return '<div class="co' + (open ? ' open' : '') + '">' +
        '<button type="button" class="co-head" data-company="' + esc(g.name) + '" aria-expanded="' + open + '">' +
          '<span style="min-width:0">' +
            '<span class="co-name">' + esc(g.name) + '</span>' +
            '<span class="co-chips">' + chips + '</span>' +
          '</span>' +
          '<span class="caret" aria-hidden="true">▼</span>' +
        '</button>' +
        '<div class="co-body">' + g.entries.map(entryHTML).join('') +
          '<div style="margin-top:10px">' +
            '<button type="button" class="btn subtle sm" data-add-company="' + esc(g.name) + '">＋ この企業に追加</button>' +
          '</div>' +
        '</div></div>';
    }).join('');
  }

  function render() {
    renderTally();
    renderDeadlines();
    renderCompanies();
  }

  App.view = { render: render, toast: toast };
})(window);

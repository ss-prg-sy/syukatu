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

  /* ---------- 上部の集計（これが本題） ---------- */
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
        '<div class="tally-label">登録ぜんぶ</div>' +
        '<div class="tally-main"><span class="n">' + t.companies + '</span><span class="unit">社</span></div>' +
        '<div class="tally-sub">エントリー <span class="num">' + t.total + '</span> 件</div>' +
      '</div>';
  }

  /* ---------- 締切（入れた人だけ出る） ---------- */
  function renderDeadlines() {
    var rows = M.state.entries
      .filter(function (e) { return e.due && !M.isEnded(e); })
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
          '<span class="dl-task">' + esc(e.company) + '</span>' +
          '<span class="dl-meta">' + esc(M.kindLabel(e)) + ' ・ <span class="num">' + esc(e.due) + '</span></span>' +
        '</span></button>';
    }).join('');
  }

  /* ---------- エントリー1件 ----------
     状況はその場で変えられるように select にしている。 */
  function entryHTML(entry) {
    var days = M.daysUntil(entry.due);
    var ended = M.isEnded(entry);

    var options = M.RESULTS[entry.kind].map(function (r) {
      return '<option value="' + r + '"' + (entry.result === r ? ' selected' : '') + '>' +
        esc(M.RESULT_LABEL[entry.kind][r] || r) + '</option>';
    }).join('');

    var due = (!ended && entry.due && days !== null)
      ? '<span class="due-tag ' + M.signalOf(days) + '">' + M.whenText(days) + '</span>' : '';

    return '<div class="entry ' + entry.kind + (ended ? ' ended' : '') + '">' +
      '<span class="chip ' + (ended ? 'done' : entry.kind) + '">' + esc(M.kindLabel(entry)) + '</span>' +
      '<select class="status-select ' + (entry.result === '内定' ? 'offer' : '') + '" data-status="' + entry.id + '"' +
        ' aria-label="状況">' + options + '</select>' +
      due +
      '<button type="button" class="btn subtle sm entry-edit" data-edit="' + entry.id + '">…</button>' +
    '</div>';
  }

  /* ---------- 企業カード ---------- */
  function renderCompanies() {
    var list = M.visibleEntries();
    var groups = M.groupByCompany(list);
    $('#coCount').textContent = groups.length ? groups.length + '社 / ' + list.length + '件' : '';

    if (!groups.length) {
      $('#companies').innerHTML = M.state.entries.length
        ? '<div class="empty"><h3>該当なし</h3><p>絞り込みか検索キーワードを外してみてください。</p></div>'
        : '<div class="empty"><h3>まだ記録がありません</h3>' +
          '<p>企業名を入れて、区分と状況を選ぶだけです。</p>' +
          '<div class="row">' +
            '<button type="button" class="btn" data-new="1">追加する</button>' +
            '<button type="button" class="btn ghost" id="btnSample">サンプルで試す</button>' +
          '</div></div>';
      return;
    }

    $('#companies').innerHTML = groups.map(function (g) {
      return '<div class="co">' +
        '<div class="co-head-static">' +
          '<span class="co-name">' + esc(g.name) + '</span>' +
          '<button type="button" class="btn subtle sm" data-add-company="' + esc(g.name) + '">＋</button>' +
        '</div>' +
        '<div class="co-body">' + g.entries.map(entryHTML).join('') + '</div>' +
      '</div>';
    }).join('');
  }

  function render() {
    renderTally();
    renderDeadlines();
    renderCompanies();
  }

  App.view = { render: render, toast: toast };
})(window);

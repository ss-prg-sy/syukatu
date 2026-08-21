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

  /* ---------- エントリー1件 ----------
     状況はその場で変えられるように select にしている。 */
  function entryHTML(entry) {
    var ended = M.isEnded(entry);

    var options = M.RESULTS[entry.kind].map(function (r) {
      return '<option value="' + r + '"' + (entry.result === r ? ' selected' : '') + '>' +
        esc(M.RESULT_LABEL[entry.kind][r] || r) + '</option>';
    }).join('');

    return '<div class="entry-wrap' + (ended ? ' ended' : '') + '">' +
      '<div class="entry">' +
        '<span class="chip ' + (ended ? 'done' : entry.kind) + '">' + esc(M.kindLabel(entry)) + '</span>' +
        '<select class="status-select ' + (entry.result === '内定' ? 'offer' : '') + '" data-status="' + entry.id + '"' +
          ' aria-label="状況">' + options + '</select>' +
        '<button type="button" class="btn subtle sm entry-edit" data-edit="' + entry.id + '">…</button>' +
      '</div>' +
      (entry.memo ? '<p class="entry-memo">' + esc(entry.memo) + '</p>' : '') +
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
    renderCompanies();
  }

  App.view = { render: render, toast: toast };
})(window);

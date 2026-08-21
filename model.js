/* ==========================================================
   model.js — データ定義・集計・端末間マージ
   記録するのは「企業名・区分・状況」の3つだけ。
   ========================================================== */
(function (global) {
  'use strict';

  var App = global.App = global.App || {};

  var SEASONS = ['夏', '秋冬', '春', 'その他'];

  /* 区分＝種別と時期をひとまとめにした選択肢 */
  var SEGMENTS = [
    { value: 'intern:夏',     label: '夏インターン' },
    { value: 'intern:秋冬',   label: '秋冬インターン' },
    { value: 'intern:春',     label: '春インターン' },
    { value: 'intern:その他', label: 'その他インターン' },
    { value: 'honsen:',       label: '本選考' }
  ];

  /* 内部の値 → 画面に出す言い回し */
  var RESULTS = {
    intern: ['進行中', '参加確定', '参加済み', '不通過', '辞退'],
    honsen: ['進行中', '内定', '不通過', '辞退']
  };
  var RESULT_LABEL = {
    intern: { '進行中': '応募した', '参加確定': '参加が決まった', '参加済み': '参加した', '不通過': '落ちた', '辞退': '辞退した' },
    honsen: { '進行中': '選考中', '内定': '内定', '不通過': '落ちた', '辞退': '辞退した' }
  };

  var ENDED_RESULTS = ['不通過', '辞退'];
  var TOMBSTONE_DAYS = 90;

  var state = { entries: [], deleted: {} };
  var ui = { kind: 'all', life: 'active', q: '', closed: {} };

  /* ---------- ヘルパー ---------- */
  function $(sel) { return document.querySelector(sel); }

  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function nowISO() { return new Date().toISOString(); }

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function todayISO(offsetDays) {
    var d = new Date();
    if (offsetDays) d.setDate(d.getDate() + offsetDays);
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }

  function daysUntil(iso) {
    if (!iso) return null;
    var target = new Date(iso + 'T00:00:00');
    if (isNaN(target)) return null;
    var base = new Date();
    base.setHours(0, 0, 0, 0);
    return Math.round((target - base) / 86400000);
  }

  function signalOf(days) {
    if (days === null) return null;
    if (days <= 1) return 'stop';
    if (days <= 3) return 'caution';
    return 'go';
  }

  function whenText(days) {
    if (days === null) return '';
    if (days < 0) return (-days) + '日超過';
    if (days === 0) return '今日';
    if (days === 1) return '明日';
    return 'あと' + days + '日';
  }

  function isEnded(entry) { return ENDED_RESULTS.indexOf(entry.result) >= 0; }

  function kindLabel(entry) {
    return entry.kind === 'intern' ? (entry.season || 'その他') + 'インターン' : '本選考';
  }

  function resultLabel(entry) {
    var map = RESULT_LABEL[entry.kind] || {};
    return map[entry.result] || entry.result;
  }

  function segmentOf(entry) {
    return entry.kind === 'honsen' ? 'honsen:' : 'intern:' + (entry.season || 'その他');
  }

  function touch(entry) { entry.updated = nowISO(); return entry; }

  function markDeleted(id) {
    state.deleted = state.deleted || {};
    state.deleted[id] = nowISO();
    state.entries = state.entries.filter(function (e) { return e.id !== id; });
  }

  function blankEntry(company) {
    return {
      id: uid(),
      company: company || '',
      kind: 'intern',
      season: '夏',
      result: '進行中',
      memo: '',
      created: todayISO(),
      updated: nowISO()
    };
  }

  /** 古い形式（選考ステップ入り）のデータを新しい形に整える */
  function normalize(entry) {
    if (!entry.result) entry.result = '進行中';
    if (!entry.kind) entry.kind = 'intern';
    if (entry.kind === 'intern' && !entry.season) entry.season = 'その他';
    if (!entry.updated) entry.updated = entry.created ? entry.created + 'T00:00:00.000Z' : nowISO();
    ['steps', 'cur', 'pri', 'role', 'label', 'task', 'url', 'history', 'due'].forEach(function (k) {
      delete entry[k];
    });
    return entry;
  }

  /* ---------- 端末間のマージ ---------- */
  function mergeInto(local, remote) {
    if (!remote || !Array.isArray(remote.entries)) return local;

    var byId = {};
    (local.entries || []).forEach(function (e) { byId[e.id] = e; });
    remote.entries.forEach(function (r) {
      var mine = byId[r.id];
      if (!mine || (r.updated || '') > (mine.updated || '')) byId[r.id] = normalize(r);
    });

    var deleted = {};
    [local.deleted || {}, remote.deleted || {}].forEach(function (src) {
      Object.keys(src).forEach(function (id) {
        if (!deleted[id] || src[id] > deleted[id]) deleted[id] = src[id];
      });
    });
    Object.keys(deleted).forEach(function (id) {
      var e = byId[id];
      if (e && (e.updated || '') <= deleted[id]) delete byId[id];
    });

    var limit = new Date(Date.now() - TOMBSTONE_DAYS * 86400000).toISOString();
    Object.keys(deleted).forEach(function (id) {
      if (deleted[id] < limit && !byId[id]) delete deleted[id];
    });

    local.entries = Object.keys(byId).map(function (id) { return byId[id]; });
    local.deleted = deleted;
    return local;
  }

  function fingerprint(s) {
    return JSON.stringify({
      e: (s.entries || []).map(function (x) { return x.id + '@' + (x.updated || ''); }).sort(),
      d: s.deleted || {}
    });
  }

  /* ---------- 集計 ----------
     「何社」は企業名の重複を除いて数える。 */
  function tally() {
    var countCompanies = function (fn) {
      var set = {};
      state.entries.filter(fn).forEach(function (e) { set[e.company.trim()] = 1; });
      return Object.keys(set).length;
    };
    var isIntern = function (e) { return e.kind === 'intern'; };
    var isHonsen = function (e) { return e.kind === 'honsen'; };
    var joined = function (e) { return e.result === '参加確定' || e.result === '参加済み'; };

    return {
      internJoin: countCompanies(function (e) { return isIntern(e) && joined(e); }),
      internDone: countCompanies(function (e) { return isIntern(e) && e.result === '参加済み'; }),
      internAll: countCompanies(isIntern),
      internEntries: state.entries.filter(isIntern).length,
      honsenAll: countCompanies(isHonsen),
      honsenLive: countCompanies(function (e) { return isHonsen(e) && e.result === '進行中'; }),
      offer: countCompanies(function (e) { return isHonsen(e) && e.result === '内定'; }),
      honsenOut: countCompanies(function (e) { return isHonsen(e) && isEnded(e); }),
      companies: countCompanies(function () { return true; }),
      total: state.entries.length
    };
  }

  function visibleEntries() {
    var q = ui.q.trim().toLowerCase();
    return state.entries.filter(function (e) {
      if (ui.kind !== 'all' && e.kind !== ui.kind) return false;
      if (ui.life === 'active' && isEnded(e)) return false;
      if (ui.life === 'ended' && !isEnded(e)) return false;
      if (q && (e.company + ' ' + (e.memo || '')).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
  }

  function groupByCompany(list) {
    var map = {};
    list.forEach(function (e) {
      var key = e.company.trim();
      (map[key] = map[key] || []).push(e);
    });
    return Object.keys(map).map(function (name) {
      var entries = map[name].slice().sort(function (a, b) {
        if (a.kind !== b.kind) return a.kind === 'honsen' ? -1 : 1;
        return (a.created || '').localeCompare(b.created || '');
      });
      return { name: name, entries: entries };
    }).sort(function (a, b) {
      return a.name.localeCompare(b.name, 'ja');   // 名前順。並びが動かない方が探しやすい
    });
  }

  function sampleEntries() {
    var mk = function (o) {
      var e = blankEntry();
      Object.keys(o).forEach(function (k) { e[k] = o[k]; });
      e.id = uid();
      return e;
    };
    return [
      mk({ company: 'みなと商事', kind: 'intern', season: '夏', result: '参加済み' }),
      mk({ company: 'みなと商事', kind: 'honsen', result: '進行中' }),
      mk({ company: 'あおば製作所', kind: 'intern', season: '春', result: '進行中' }),
      mk({ company: 'あおば製作所', kind: 'intern', season: '秋冬', result: '参加済み' }),
      mk({ company: 'つばさ情報システム', kind: 'honsen', result: '内定' }),
      mk({ company: 'しおかぜ食品', kind: 'honsen', result: '不通過' }),
      mk({ company: 'こもれび銀行', kind: 'intern', season: '夏', result: '参加確定' })
    ];
  }

  App.model = {
    SEASONS: SEASONS,
    SEGMENTS: SEGMENTS,
    RESULTS: RESULTS,
    RESULT_LABEL: RESULT_LABEL,
    state: state,
    ui: ui,
    $: $, uid: uid, esc: esc, nowISO: nowISO, todayISO: todayISO,
    daysUntil: daysUntil, signalOf: signalOf, whenText: whenText,
    isEnded: isEnded, kindLabel: kindLabel, resultLabel: resultLabel, segmentOf: segmentOf,
    touch: touch, markDeleted: markDeleted, blankEntry: blankEntry, normalize: normalize,
    mergeInto: mergeInto, fingerprint: fingerprint,
    tally: tally, visibleEntries: visibleEntries, groupByCompany: groupByCompany,
    sampleEntries: sampleEntries
  };
})(window);

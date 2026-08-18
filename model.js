/* ==========================================================
   model.js — データ定義・共通ヘルパー・集計・端末間マージ
   ========================================================== */
(function (global) {
  'use strict';

  var App = global.App = global.App || {};

  /* ---------- 選考ステップのテンプレート ----------
     エントリーごとに自由に編集できるので、ここは「初期値」にすぎない。
     よく使う流れがあれば書き換えて構わない。 */
  var TEMPLATES = {
    intern: ['エントリー', 'ES提出', '適性検査', '面接', '参加確定', '参加済み'],
    honsen: ['プレエントリー', 'ES提出', '適性検査', '一次面接', '二次面接', '最終面接', '内定']
  };

  var SEASONS = ['夏', '秋冬', '春', 'その他'];

  var RESULTS = {
    intern: ['進行中', '参加確定', '参加済み', '不通過', '辞退'],
    honsen: ['進行中', '内定', '不通過', '辞退']
  };

  var ENDED_RESULTS = ['不通過', '辞退'];

  /* ステップ名が結果に直結する対応表（「次へ進む」で自動反映される） */
  var STEP_TO_RESULT = {
    intern: { '参加確定': '参加確定', '参加済み': '参加済み' },
    honsen: { '内定': '内定' }
  };

  var TOMBSTONE_DAYS = 90; // 削除記録を保持する日数

  /* ---------- アプリの状態 ----------
     deleted は「削除したエントリーのid → 削除時刻」。
     これが無いと、別端末から古いデータが復活してしまう。 */
  var state = { entries: [], deleted: {} };
  var ui = { kind: 'all', life: 'active', q: '', closed: {} };

  /* ---------- ヘルパー ---------- */
  function $(sel) { return document.querySelector(sel); }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function nowISO() { return new Date().toISOString(); }

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function todayISO(offsetDays) {
    var d = new Date();
    if (offsetDays) d.setDate(d.getDate() + offsetDays);
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + m + '-' + day;
  }

  /** 期限まであと何日か。期限なしは null、過去日は負の数。 */
  function daysUntil(iso) {
    if (!iso) return null;
    var target = new Date(iso + 'T00:00:00');
    if (isNaN(target)) return null;
    var base = new Date();
    base.setHours(0, 0, 0, 0);
    return Math.round((target - base) / 86400000);
  }

  /** 鉄道信号に見立てた緊急度。停止=赤 / 注意=橙 / 進行=緑 */
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

  /** 更新時刻を打つ。マージのときに新旧の判定に使う。 */
  function touch(entry) { entry.updated = nowISO(); return entry; }

  /** 削除を記録する（別端末での復活を防ぐ） */
  function markDeleted(id) {
    state.deleted = state.deleted || {};
    state.deleted[id] = nowISO();
    state.entries = state.entries.filter(function (e) { return e.id !== id; });
  }

  /** 空のエントリーを作る */
  function blankEntry(company) {
    return {
      id: uid(),
      company: company || '',
      kind: 'intern',
      season: '夏',
      role: '',
      label: '',
      pri: 2,
      steps: TEMPLATES.intern.slice(),
      cur: 0,
      result: '進行中',
      task: '',
      due: '',
      url: '',
      memo: '',
      history: [],
      created: todayISO(),
      updated: nowISO()
    };
  }

  /** 現在のステップ名から結果を自動更新する */
  function syncResultToStep(entry) {
    var map = STEP_TO_RESULT[entry.kind] || {};
    var hit = map[entry.steps[entry.cur]];
    if (hit) entry.result = hit;
  }

  /** 結果からステップ位置へ反映する（「内定」を選んだら路線図も内定へ） */
  function syncStepToResult(entry) {
    var map = STEP_TO_RESULT[entry.kind] || {};
    var stepName = null;
    Object.keys(map).forEach(function (name) {
      if (map[name] === entry.result) stepName = name;
    });
    if (!stepName) return;
    var i = entry.steps.indexOf(stepName);
    if (i >= 0) entry.cur = i;
  }

  /* ---------- 端末間のマージ ----------
     PCとスマホの両方で編集された場合に備え、
     「エントリー単位で、更新時刻が新しい方を採用」する。
     どちらか一方でしか触っていないエントリーはそのまま残る。 */
  function mergeInto(local, remote) {
    if (!remote || !Array.isArray(remote.entries)) return local;

    var byId = {};
    (local.entries || []).forEach(function (e) { byId[e.id] = e; });

    remote.entries.forEach(function (r) {
      var mine = byId[r.id];
      if (!mine) { byId[r.id] = r; return; }
      if ((r.updated || '') > (mine.updated || '')) byId[r.id] = r;
    });

    // 削除記録を統合（新しい削除時刻を採用）
    var deleted = {};
    [local.deleted || {}, remote.deleted || {}].forEach(function (src) {
      Object.keys(src).forEach(function (id) {
        if (!deleted[id] || src[id] > deleted[id]) deleted[id] = src[id];
      });
    });

    // 削除より後に編集されていれば復活させる。そうでなければ消す。
    Object.keys(deleted).forEach(function (id) {
      var e = byId[id];
      if (e && (e.updated || '') <= deleted[id]) delete byId[id];
    });

    // 古い削除記録は捨てる
    var limit = new Date(Date.now() - TOMBSTONE_DAYS * 86400000).toISOString();
    Object.keys(deleted).forEach(function (id) {
      if (deleted[id] < limit && !byId[id]) delete deleted[id];
    });

    local.entries = Object.keys(byId).map(function (id) { return byId[id]; });
    local.deleted = deleted;
    return local;
  }

  /** 中身が同じかどうか（無駄な送信を避けるため） */
  function fingerprint(s) {
    return JSON.stringify({
      e: (s.entries || []).map(function (x) { return x.id + '@' + (x.updated || ''); }).sort(),
      d: s.deleted || {}
    });
  }

  /* ---------- 集計 ----------
     「何社」は企業名の重複を除いて数える。
     同じ企業で夏・春の2件があっても、参加社数は1社。 */
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
      esDone: state.entries.filter(function (e) {
        var i = e.steps.indexOf('ES提出');
        return i >= 0 && e.cur >= i;
      }).length,
      total: state.entries.length
    };
  }

  /** 絞り込み後のエントリー */
  function visibleEntries() {
    var q = ui.q.trim().toLowerCase();
    return state.entries.filter(function (e) {
      if (ui.kind !== 'all' && e.kind !== ui.kind) return false;
      if (ui.life === 'active' && isEnded(e)) return false;
      if (ui.life === 'ended' && !isEnded(e)) return false;
      if (q) {
        var hay = (e.company + ' ' + (e.role || '') + ' ' + (e.label || '')).toLowerCase();
        if (hay.indexOf(q) < 0) return false;
      }
      return true;
    });
  }

  /** 企業名でまとめ、締切の近い順に並べる */
  function groupByCompany(list) {
    var map = {};
    list.forEach(function (e) {
      var key = e.company.trim();
      (map[key] = map[key] || []).push(e);
    });
    var soonest = function (arr) {
      return Math.min.apply(null, arr.map(function (e) {
        var d = daysUntil(e.due);
        return (d === null || isEnded(e)) ? 9999 : d;
      }));
    };
    return Object.keys(map).map(function (name) {
      var entries = map[name].slice().sort(function (a, b) {
        if (a.kind !== b.kind) return a.kind === 'honsen' ? -1 : 1;
        return (a.created || '').localeCompare(b.created || '');
      });
      return { name: name, entries: entries, soonest: soonest(entries) };
    }).sort(function (a, b) {
      return a.soonest - b.soonest || a.name.localeCompare(b.name, 'ja');
    });
  }

  /** 動作確認用のサンプルデータ */
  function sampleEntries() {
    var mk = function (o) {
      var e = blankEntry();
      Object.keys(o).forEach(function (k) { e[k] = o[k]; });
      e.id = uid();
      e.history = [{ d: todayISO(-20), t: '登録' }];
      e.updated = nowISO();
      return e;
    };
    return [
      mk({ company: 'みなと商事', kind: 'intern', season: '夏', role: '総合職',
           steps: TEMPLATES.intern.slice(), cur: 5, result: '参加済み' }),
      mk({ company: 'みなと商事', kind: 'honsen', role: '総合職',
           steps: TEMPLATES.honsen.slice(), cur: 3, result: '進行中',
           task: '二次面接', due: todayISO(2), pri: 3, memo: '夏インターン参加者は一次免除' }),
      mk({ company: 'あおば製作所', kind: 'intern', season: '春', role: '技術職',
           steps: TEMPLATES.intern.slice(), cur: 1, result: '進行中',
           task: 'ES提出（志望動機400字）', due: todayISO(0), pri: 3 }),
      mk({ company: 'あおば製作所', kind: 'intern', season: '秋冬', role: '技術職',
           steps: TEMPLATES.intern.slice(), cur: 5, result: '参加済み' }),
      mk({ company: 'つばさ情報システム', kind: 'honsen', role: 'エンジニア',
           steps: TEMPLATES.honsen.slice(), cur: 6, result: '内定', pri: 2 }),
      mk({ company: 'しおかぜ食品', kind: 'honsen', role: 'マーケティング',
           steps: TEMPLATES.honsen.slice(), cur: 2, result: '不通過' }),
      mk({ company: 'こもれび銀行', kind: 'intern', season: '夏', role: '総合職',
           steps: TEMPLATES.intern.slice(), cur: 3, result: '進行中',
           task: '適性検査の受検期限', due: todayISO(5), pri: 1 })
    ];
  }

  App.model = {
    TEMPLATES: TEMPLATES,
    SEASONS: SEASONS,
    RESULTS: RESULTS,
    state: state,
    ui: ui,
    $: $,
    uid: uid,
    esc: esc,
    nowISO: nowISO,
    todayISO: todayISO,
    daysUntil: daysUntil,
    signalOf: signalOf,
    whenText: whenText,
    isEnded: isEnded,
    kindLabel: kindLabel,
    touch: touch,
    markDeleted: markDeleted,
    blankEntry: blankEntry,
    syncResultToStep: syncResultToStep,
    syncStepToResult: syncStepToResult,
    mergeInto: mergeInto,
    fingerprint: fingerprint,
    tally: tally,
    visibleEntries: visibleEntries,
    groupByCompany: groupByCompany,
    sampleEntries: sampleEntries
  };
})(window);

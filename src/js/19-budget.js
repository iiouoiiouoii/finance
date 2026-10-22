/* 예산 : 월별 예산(기본 + 이 달만) · 카테고리별 소진율 · 예산 알림(초과·경고·속도) · 지난달 기반 추천 */
(function (App) {
  'use strict';
  var u = App.u, C = App.calc, B = App.budget = {};
  var db = function () { return App.db; };
  var own = function (o, k) { return Object.prototype.hasOwnProperty.call(o, k); };

  /* ---------- 예산 알림 ---------- */
  B.alerts = function (mo) {
    mo = mo || App.state.month;
    var warn = +(db().settings.budgetWarn) || 80, b = C.budgetFor(mo), sp = {}, out = [], d = new Date(), cur = mo === u.nowM(), day = d.getDate(), dim = u.dim(mo);
    C.monthTx(mo).forEach(function (t) { if (t.type === 'EXPENSE') sp[t.category] = (sp[t.category] || 0) + t.amount; });
    Object.keys(b).forEach(function (c) {
      var bud = b[c]; if (!(bud > 0)) return;
      var s = sp[c] || 0, pc = s / bud * 100, lv = pc >= 100 ? 'over' : pc >= warn ? 'warn' : null;
      var pj = cur && day >= 10 && !C.FIXEDCAT.test(c) ? s / day * dim : 0;
      if (!lv && pj > bud * 1.05) lv = 'pace';
      if (lv) out.push({ c: c, b: bud, s: s, pc: pc, lv: lv, pj: pj });
    });
    return out.sort(function (a, b) { return b.pc - a.pc; });
  };
  B.alertHtml = function (a) {
    var m = { over: ['bg-red-50 border-red-200 text-red-800', 'fa-circle-exclamation', '예산 초과 ' + u.K(a.s - a.b)], warn: ['bg-amber-50 border-amber-200 text-amber-900', 'fa-triangle-exclamation', a.pc.toFixed(0) + '% 사용 · 잔여 ' + u.K(a.b - a.s)], pace: ['bg-sky-50 border-sky-200 text-sky-800', 'fa-gauge-high', '현재 속도면 월말 약 ' + u.K(a.pj) + ' (예산 대비 ' + (a.pj / a.b * 100).toFixed(0) + '%)'] }[a.lv];
    return '<div class="flex flex-wrap items-center gap-2 px-3 py-2 rounded-lg border text-xs ' + m[0] + '"><i class="fa-solid ' + m[1] + '"></i><b>' + u.esc(a.c) + '</b><span>' + m[2] + '</span><span class="ml-auto opacity-70">' + u.K(a.s) + ' / ' + u.K(a.b) + '</span></div>';
  };
  var seen = {};
  function notify(first) {
    var L = B.alerts().filter(function (a) { return a.lv !== 'pace'; }), fresh = [];
    L.forEach(function (a) { [a.lv, 'warn'].forEach(function (lv) { var k = App.state.month + a.c + lv; if (!seen[k]) { seen[k] = 1; if (lv === a.lv) fresh.push(a); } }); });
    if (first) { if (L.length) u.toast('예산 알림: ' + L.length + '개 카테고리가 기준을 넘었습니다.', 'warning'); }
    else fresh.forEach(function (a) { u.toast(a.c + (a.lv === 'over' ? ' 예산 초과 (' + a.pc.toFixed(0) + '%)' : ' 예산 ' + a.pc.toFixed(0) + '% 사용'), 'warning'); });
  }
  App.on('saved', u.safe('예산 알림', function () { notify(false); }));
  B.boot = function () { setTimeout(u.safe('예산 알림', function () { notify(true); }), 2200); };
  B.setWarn = function (v) { db().settings.budgetWarn = Math.max(50, Math.min(100, +v || 80)); seen = {}; App.store.save(); u.toast('예산 경고 기준이 ' + db().settings.budgetWarn + '%로 저장되었습니다.'); };
  App.ui.headerItems.push([40, function () {
    var n = B.alerts().filter(function (a) { return a.lv !== 'pace'; }).length;
    return '<button onclick="App.ui.go(\'budget\')" title="예산 알림" class="relative px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-600"><i class="fa-solid fa-bell"></i>'
      + (n ? '<span class="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full text-[10px] w-4 h-4 flex items-center justify-center">' + n + '</span>' : '') + '</button>';
  }]);

  /* ---------- 예산 바꾸기 : 이 달만 / 이 달부터 계속 ---------- */
  function firstTxMonth() {
    var mn = null; (db().transactions || []).forEach(function (t) { var m = String(t.date || '').slice(0, 7); if (/^\d{4}-\d{2}$/.test(m) && (!mn || m < mn)) mn = m; }); return mn;
  }
  function needAsk(mo) { var f = firstTxMonth(); return (f && f < mo) || Object.keys(db().budgetsByMonth).some(function (m) { return m !== mo; }); }
  function clean() { Object.keys(db().budgetsByMonth).forEach(function (m) { var o = db().budgetsByMonth[m]; if (!o || typeof o !== 'object' || !Object.keys(o).length) delete db().budgetsByMonth[m]; }); }
  function applyChange(mo, k, v, scope) {
    var base = db().budgets, bbm = db().budgetsByMonth;
    if (scope === 'month') {
      var ov = bbm[mo] || (bbm[mo] = {});
      if (v === (Number(base[k]) || 0)) delete ov[k]; else ov[k] = v;
      return;
    }
    /* 이 달부터 계속 : 지난달들은 지금 값을 고정하고 기본 예산을 바꾼다 */
    var old = Number(base[k]) || 0, f = firstTxMonth(), past = {}, i;
    if (f && f < mo) for (i = u.mIdx(f); i < u.mIdx(mo); i++) past[u.iMon(i)] = 1;
    Object.keys(bbm).forEach(function (m) { if (m < mo) past[m] = 1; });
    Object.keys(past).forEach(function (m) { var o = bbm[m] || (bbm[m] = {}); if (!own(o, k)) o[k] = old; });
    Object.keys(bbm).forEach(function (m) { if (m >= mo && bbm[m]) delete bbm[m][k]; });
    base[k] = v;
  }
  /* changes : { 카테고리: 새 금액 } */
  B.change = function (changes, opt) {
    var mo = App.state.month, cur = C.budgetFor(mo), keys = Object.keys(changes).filter(function (k) { return (Number(cur[k]) || 0) !== changes[k]; });
    if (!keys.length) { App.ui.render(); return; }
    var finish = function (scope) {
      if (scope !== 'month' && scope !== 'forward') { App.ui.render(); return; }
      keys.forEach(function (k) { applyChange(mo, k, changes[k], scope); }); clean();
      App.store.save();
      u.toast(opt && opt.msg ? opt.msg : (scope === 'month' ? mo + ' 예산만 변경했습니다. 다른 달은 그대로입니다.' : mo + '부터 기본 예산을 변경했습니다. 지난달 예산은 그대로 유지됩니다.'));
      if (opt && opt.after) opt.after();
    };
    if (!needAsk(mo)) { finish('forward'); return; }
    var label = u.monthLabel(mo);
    var lines = keys.slice(0, 6).map(function (k) { return '· ' + u.esc(k) + ': ' + u.K(cur[k]) + ' → <b>' + u.K(changes[k]) + '</b>'; }).join('<br>') + (keys.length > 6 ? '<br>· 외 ' + (keys.length - 6) + '개' : '');
    u.choose('<i class="fa-solid fa-calendar-check text-accent mr-1.5"></i>예산 변경을 어디에 적용할까요?', lines, [
      { label: label + '만 (기본 예산은 그대로)', value: 'month' },
      { label: label + '부터 계속 (기본 예산도 변경, 지난달은 그대로)', value: 'forward', cls: 'border-slate-300 text-slate-700 hover:bg-slate-50' },
      { label: '취소', value: 'cancel', cls: 'border-transparent text-slate-400' }
    ]).then(finish);
  };
  B.edit = function (k, v) { var o = {}; o[k] = u.P(v); B.change(o); };
  B.editIdx = function (i, v) { var c = db().categories[i]; if (c) B.edit(c.name, v); };
  B.resetMonth = function () {
    var mo = App.state.month;
    u.confirm('이 달 전용 예산 해제', mo + '의 전용 예산을 지우고 기본 예산을 적용합니다.', function () { delete db().budgetsByMonth[mo]; App.store.save(); u.toast(mo + '에 기본 예산을 적용했습니다.'); });
  };
  B.recommend = function () {
    var mo = App.state.month, prev = u.addM(mo, -1), tx = C.monthTx(prev).filter(function (t) { return t.type === 'EXPENSE'; });
    if (!tx.length) { u.toast('지난달(' + prev + ') 지출 데이터가 없습니다.', 'warning'); return; }
    var ch = {};
    db().categories.forEach(function (c) { var s = u.sum(tx.filter(function (t) { return t.category === c.name; }), function (t) { return t.amount; }); if (s > 0) ch[c.name] = Math.ceil(s * 1.05 / 1000) * 1000; });
    B.change(ch, {
      msg: '지난달(' + prev + ') 지출 기반 예산이 반영되었습니다.', after: function () {
        var T = C.savingTarget(mo), avail = C.incomeBase(mo).base - T, tot = C.budgetTotal(mo);
        if (T && tot > avail) setTimeout(function () { u.toast('지난달 기준 예산이 선저축 후 가용액보다 ' + u.K(tot - avail) + ' 많습니다. [목표 · 선저축]에서 조정하세요.', 'warning'); }, 600);
      }
    });
  };

  /* ---------- 화면 ---------- */
  App.views.add({
    id: 'budget', order: 60, title: '카테고리별 예산 바로 관리', nav: { label: '예산 바로 관리', icon: 'fa-sliders' },
    render: function (el) {
      var mo = App.state.month, bud = C.budgetFor(mo), ov = C.monthOverride(mo), n = Object.keys(ov).length, L = B.alerts(mo);
      var T = C.savingTarget(mo), avail = C.incomeBase(mo).base - T, tot = C.budgetTotal(mo), over = tot - avail;
      var spent = {}; C.monthTx(mo).forEach(function (t) { if (t.type === 'EXPENSE') spent[t.category] = (spent[t.category] || 0) + t.amount; });
      el.innerHTML = '<div class="p-4 rounded-xl border shadow-sm text-xs flex flex-wrap items-center gap-3 ' + (!T ? 'bg-sky-50 border-sky-200 text-sky-900' : over > 0 ? 'bg-red-50 border-red-200 text-red-800' : 'bg-emerald-50 border-emerald-200 text-emerald-800') + '"><i class="fa-solid fa-piggy-bank"></i>'
        + (!T ? '<span>저축·투자 목표가 없습니다. 지난달 지출을 기준으로 예산을 잡으면 저축이 \'남는 돈\'이 됩니다. 저축액부터 정해 두세요.</span>'
          : '<span>선저축 ' + u.K(T) + ' → 생활비 가용 <b>' + u.K(avail) + '</b> · 예산 합계 <b>' + u.K(tot) + '</b>' + (over > 0 ? ' (' + u.K(over) + ' 초과)' : ' (여유 ' + u.K(-over) + ')') + '</span>')
        + '<button onclick="App.ui.go(\'goals\')" class="ml-auto bg-white border border-current px-3 py-1.5 rounded-lg font-semibold">목표 · 선저축 설정</button></div>'
        + '<div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-2"><div class="flex flex-wrap items-center gap-2 text-xs"><b class="text-slate-800">예산 알림</b><span class="text-slate-500">경고 기준</span>'
        + '<input type="number" min="50" max="100" value="' + ((db().settings.budgetWarn) || 80) + '" onchange="App.budget.setWarn(this.value)" class="w-16 border border-slate-300 rounded px-2 py-1 text-right"><span class="text-slate-500">% 이상 사용 시 알림</span></div>'
        + '<div class="space-y-1.5">' + (L.length ? L.map(B.alertHtml).join('') : '<div class="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2"><i class="fa-solid fa-circle-check mr-1"></i>모든 카테고리가 예산 범위 안에 있습니다.</div>') + '</div></div>'
        + '<div class="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-5"><div class="flex flex-wrap justify-between items-center pb-4 border-b border-slate-100 gap-3"><div><h3 class="font-bold text-slate-800 text-base flex items-center gap-2"><i class="fa-solid fa-sliders text-accent"></i> 카테고리별 예산 바로 변경 & 자동 추천</h3>'
        + '<p class="text-xs text-slate-400 mt-0.5">세분화된 카테고리별 예산을 즉시 수정하고 지난달 지출 기반 추천 기능을 활용하세요.</p></div>'
        + '<button onclick="App.budget.recommend()" class="bg-accent hover:bg-accent-hover text-white text-xs px-4 py-2.5 rounded-lg font-semibold flex items-center gap-2 shadow-sm"><i class="fa-solid fa-wand-magic-sparkles text-amber-300"></i> 지난달 지출 기반 예산 자동 추천</button></div>'
        + '<div class="p-3 rounded-lg border text-xs flex flex-wrap items-center justify-between gap-2 ' + (n ? 'bg-indigo-50 border-indigo-200 text-indigo-800' : 'bg-slate-50 border-slate-200 text-slate-600') + '"><span><i class="fa-solid fa-calendar-days mr-1"></i><b>' + mo + '</b> 예산 · '
        + (n ? '이 달 전용 예산 ' + n + '개 항목 적용 중 (나머지는 기본 예산)' : '기본 예산 적용 중') + ' · 예산을 고치면 이 달만/이 달부터 계속 중에서 고를 수 있습니다.</span>'
        + (n ? '<button onclick="App.budget.resetMonth()" class="px-2.5 py-1 rounded border border-indigo-300 bg-white font-semibold hover:bg-indigo-100">이 달 전용 예산 해제</button>' : '') + '</div>'
        + '<div id="budget-inline-container" class="grid grid-cols-1 md:grid-cols-2 gap-5">' + db().categories.map(function (c, i) {
          var b = bud[c.name] || 0, s = spent[c.name] || 0, rem = b - s, rate = b > 0 ? Math.round(s / b * 100) : 0;
          return '<div class="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3"><div class="flex justify-between items-center"><span class="font-bold text-slate-800 text-sm flex items-center gap-2"><span class="w-3 h-3 rounded-full" style="background-color:' + u.esc(c.color) + '"></span> ' + u.esc(c.name) + '</span>'
            + '<span class="text-xs text-slate-500">당월 지출: <strong class="text-slate-800">' + u.K(s) + '</strong></span></div>'
            + '<div class="grid grid-cols-2 gap-3 items-center"><div><label class="block text-[11px] text-slate-500 mb-1">월 예산 목표액' + (own(ov, c.name) ? ' <span class="text-[9px] font-bold text-indigo-600 bg-indigo-50 border border-indigo-200 rounded px-1">이 달만</span>' : '') + '</label>'
            + '<input type="text" data-money inputmode="numeric" value="' + u.n0(b) + '" onchange="App.budget.editIdx(' + i + ', this.value)" class="w-full border border-slate-300 rounded-lg p-2 font-bold text-slate-800 text-xs"></div>'
            + '<div class="text-right"><div class="text-[11px] text-slate-400">잔여 예산</div><div class="text-sm font-bold ' + (rem < 0 ? 'text-red-500' : 'text-slate-700') + '">' + u.K(rem) + '</div></div></div>'
            + '<div class="w-full bg-slate-200 rounded-full h-2 overflow-hidden"><div class="' + (rate >= 100 ? 'bg-red-500' : rate >= 80 ? 'bg-amber-500' : 'bg-accent') + ' h-2 rounded-full" style="width:' + Math.min(rate, 100) + '%"></div></div></div>';
        }).join('') + '</div></div>';
    }
  });
})(window.App);

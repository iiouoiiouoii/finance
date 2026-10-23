/* 월말 한 장 리포트 : 부부가 함께 보는 한 달 요약 + 다음 달 할 일 (인쇄 · 메신저용 텍스트 복사) */
(function (App) {
  'use strict';
  var u = App.u, C = App.calc, RP = App.report = {};
  var db = function () { return App.db; };

  function catSums(mo) { return C.budgetSpend(mo).byCat; }   /* 할부 회차 제외 (예산과 같은 기준) */

  /* 한 달 데이터를 모은다 (화면 · 텍스트가 같이 쓴다) */
  RP.build = function (mo) {
    var prev = u.addM(mo, -1), tx = C.monthTx(mo), inc = C.sumType(tx, 'INCOME'), exp = C.sumType(tx, 'EXPENSE');
    var bud = C.budgetFor(mo), cs = catSums(mo), ps = catSums(prev), avg3 = {};
    [1, 2, 3].forEach(function (i) { var s = catSums(u.addM(mo, -i)); Object.keys(s).forEach(function (k) { avg3[k] = (avg3[k] || 0) + s[k] / 3; }); });
    var cats = db().categories.map(function (c) { var b = bud[c.name] || 0, s = cs[c.name] || 0; return { name: c.name, color: c.color, b: b, s: s, diff: b - s, rate: b > 0 ? s / b * 100 : (s > 0 ? 999 : 0), prev: ps[c.name] || 0, avg: avg3[c.name] || 0 }; })
      .filter(function (x) { return x.b > 0 || x.s > 0; });
    var T = C.savingTarget(mo), S = C.savedIn(mo), h = C.health(mo), n = C.netWorth(mo);
    var snapNow = db().snapshots[mo], snapPrev = db().snapshots[prev];
    var nwNow = snapNow ? snapNow.nw : n.nw, nwChange = snapPrev ? nwNow - snapPrev.nw : null;
    var cpl = C.coupleStats(mo);
    var inst = C.instSummary(mo), instNext = C.instSummary(u.addM(mo, 1));
    var ending = (db().installments || []).map(function (i) { return { i: i, c: C.calcInst(i, mo) }; }).filter(function (x) { return !x.c.settled && x.c.lastMonth === mo; });
    var fixedUnapplied = db().fixedExpenses.filter(function (f) { return f.type !== 'INCOME' && !App.fixed.isApplied(f, mo); });
    var goals = (db().goals || []).map(function (g) {
      var i = C.goalInfo(g), m = u.sum(db().transactions.filter(function (t) { return t.goalId === g.id && String(t.date).indexOf(mo) === 0; }), function (t) { return t.amount; });
      return { g: g, i: i, month: m };
    });
    var weekly = App.weekly.checks(mo).length;
    return { mo: mo, prev: prev, inc: inc, exp: exp, surplus: inc - exp, rate: inc > 0 ? (inc - exp) / inc * 100 : null, cats: cats, T: T, S: S, h: h, n: n, nwNow: nwNow, nwChange: nwChange, cpl: cpl, inst: inst, instNext: instNext, ending: ending, fixedUnapplied: fixedUnapplied, goals: goals, weekly: weekly, budgetTotal: C.budgetTotal(mo), avail: C.incomeBase(mo).base - T };
  };

  /* 다음 달 조언 : 중요한 것부터 */
  RP.advice = function (r) {
    var a = [], s = db().settings, H = C.short('H'), W = C.short('W');
    var over = r.cats.filter(function (c) { return c.b > 0 && c.s > c.b; }).sort(function (x, y) { return (y.s - y.b) - (x.s - x.b); });
    if (r.h.efMonths != null && r.h.efMonths < 3) a.push(['high', '비상자금이 ' + r.h.efMonths.toFixed(1) + '개월치뿐입니다. 저축·투자보다 먼저 생활비 3개월치(' + u.K(r.h.avgExp * 3) + ')를 파킹통장에 채우세요.']);
    if (r.h.dsr != null && r.h.dsr >= 40) a.push(['high', '대출·할부 상환이 정기 수입의 ' + r.h.dsr.toFixed(0) + '%입니다(권장 40% 이하). 새 할부를 멈추고 [대출 상환 판단 도우미]에서 금리 높은 빚부터 정리하세요.']);
    if (r.T > 0 && r.S < r.T) a.push(['high', '선저축 목표 ' + u.K(r.T) + ' 중 ' + u.K(r.S) + '만 저축·투자했습니다(' + u.K(r.T - r.S) + ' 부족). 다음 달은 월급날 자동이체로 저축부터 떼세요.']);
    if (!r.T) a.push(['mid', '저축·투자 목표가 없습니다. 이번 달 잉여 ' + u.K(Math.max(0, r.surplus)) + '을 참고해 [목표 · 선저축]에서 월 목표액을 정하세요.']);
    if (over.length) a.push(['high', '예산 초과: ' + over.slice(0, 3).map(function (c) { return c.name + ' ' + u.K(c.s - c.b); }).join(', ') + '. 다음 달 이 항목들은 주간 점검 때 먼저 확인하세요.']);
    if (r.T > 0 && r.budgetTotal > r.avail) a.push(['mid', '예산 합계가 선저축 후 가용액보다 ' + u.K(r.budgetTotal - r.avail) + ' 많습니다. 예산을 줄이거나 저축 목표를 조정해야 둘 다 지킬 수 있습니다.']);
    ['H', 'W'].forEach(function (c) { var lim = +s[c === 'H' ? 'allowanceH' : 'allowanceW'] || 0, used = r.cpl.exp[c]; if (lim && used > lim) a.push(['mid', (c === 'H' ? H : W) + ' 용돈이 한도보다 ' + u.K(used - lim) + ' 많았습니다. 다음 달 한도를 다시 정하거나 개인 지출을 줄이기로 이야기해 보세요.']); });
    if (r.ending.length) a.push(['good', '이번 달로 끝나는 할부 ' + r.ending.length + '건(월 ' + u.K(u.sum(r.ending, function (x) { return x.c.thisCharge; })) + ')이 있습니다. 다음 달부터 그만큼을 저축으로 돌리면 생활 수준을 바꾸지 않고 저축이 늘어납니다.']);
    if (r.fixedUnapplied.length && r.mo <= u.nowM()) a.push(['low', '지출에 반영하지 않은 고정비 ' + r.fixedUnapplied.length + '건(' + r.fixedUnapplied.slice(0, 3).map(function (f) { return f.name; }).join(', ') + ')이 있습니다. 실제로 나갔다면 [고정비] 화면에서 반영하세요.']);
    if (!r.weekly && r.mo === u.nowM()) a.push(['low', '이번 달 주간 점검 기록이 없습니다. 일주일에 한 번 카드 앱 누적액만 적어도 월중에 속도를 조절할 수 있습니다.']);
    r.goals.forEach(function (x) { var pl = +x.g.plan || 0; if (x.i.rem > 0 && x.i.req && pl < x.i.req) a.push(['mid', '목표 \'' + x.g.name + '\'를 기한에 맞추려면 월 ' + u.K(x.i.req) + '이 필요합니다(계획 ' + u.K(pl) + '). 기한을 늦추거나 적립액을 늘리세요.']); });
    if (r.rate != null && r.rate >= 30 && !over.length) a.push(['good', '저축률 ' + r.rate.toFixed(0) + '%로 예산도 지켰습니다. 이 흐름을 유지하세요.']);
    return a;
  };

  function cell(t, v, sub, cls) { return '<div class="p-3 rounded-lg border border-slate-200 bg-white min-w-0"><div class="text-[11px] font-semibold text-slate-500">' + t + '</div><div class="text-base font-extrabold whitespace-nowrap ' + (cls || 'text-slate-800') + '">' + v + '</div><div class="text-[10px] text-slate-400 mt-0.5">' + sub + '</div></div>'; }
  function sec(title, icon, body) { return '<section class="rp-sec space-y-2"><h3 class="font-bold text-slate-800 text-sm border-b border-slate-200 pb-1"><i class="fa-solid ' + icon + ' text-accent mr-1.5"></i>' + title + '</h3>' + body + '</section>'; }
  var TONE = { high: ['bg-red-50 border-red-200 text-red-800', 'fa-circle-exclamation'], mid: ['bg-amber-50 border-amber-200 text-amber-900', 'fa-triangle-exclamation'], low: ['bg-slate-50 border-slate-200 text-slate-700', 'fa-circle-info'], good: ['bg-emerald-50 border-emerald-200 text-emerald-800', 'fa-circle-check'] };

  RP.html = function (mo) {
    var r = RP.build(mo), adv = RP.advice(r), H = u.esc(C.short('H')), W = u.esc(C.short('W'));
    var top = r.cats.slice().sort(function (a, b) { return b.s - a.s; });
    var chg = r.cats.filter(function (c) { return c.prev > 0 || c.s > 0; }).map(function (c) { c.d = c.s - c.prev; return c; }).sort(function (a, b) { return Math.abs(b.d) - Math.abs(a.d); }).slice(0, 4);
    var head = '<div class="flex flex-wrap items-end justify-between gap-2 border-b-2 border-slate-800 pb-3"><div><div class="text-[11px] text-slate-500">' + u.esc(C.nm('H')) + ' · ' + u.esc(C.nm('W')) + '</div><h2 class="text-xl font-extrabold text-slate-900">' + u.monthLabel(mo) + ' 우리 집 재무 리포트</h2></div>'
      + '<div class="text-[11px] text-slate-400">작성 ' + u.today() + '</div></div>';
    var kpi = '<div class="grid grid-cols-2 lg:grid-cols-6 gap-2">' + cell('수입', u.K(r.inc), '') + cell('지출', u.K(r.exp), '예산 ' + u.K(r.budgetTotal))
      + cell('남은 돈 (저축률)', u.K(r.surplus), r.rate == null ? '-' : r.rate.toFixed(0) + '%', r.surplus < 0 ? 'text-red-600' : 'text-emerald-700')
      + cell('실제 저축·투자', u.K(r.S), r.T ? '목표 ' + u.K(r.T) + ' · ' + Math.round(r.S / r.T * 100) + '%' : '목표 미설정', r.T && r.S >= r.T ? 'text-emerald-700' : 'text-slate-800')
      + cell('순자산', u.K(r.nwNow), r.nwChange == null ? '전월 기록 없음' : '전월 대비 ' + (r.nwChange >= 0 ? '+' : '') + u.K(r.nwChange), r.nwChange != null && r.nwChange < 0 ? 'text-red-600' : 'text-slate-800')
      + cell('비상자금', r.h.efMonths == null ? '-' : r.h.efMonths.toFixed(1) + '개월', '권장 3~6개월', r.h.efMonths != null && r.h.efMonths < 3 ? 'text-red-600' : 'text-slate-800') + '</div>';
    var budget = '<div class="overflow-x-auto"><table class="w-full text-xs"><thead><tr class="text-slate-500 bg-slate-50"><th class="p-1.5 text-left">카테고리</th><th class="p-1.5 text-right">예산</th><th class="p-1.5 text-right">지출</th><th class="p-1.5 text-right">차이</th><th class="p-1.5 text-right">지난달</th><th class="p-1.5 text-right">3개월 평균</th></tr></thead><tbody>'
      + top.map(function (c) {
        return '<tr class="border-t border-slate-100' + (c.b > 0 && c.s > c.b ? ' bg-red-50/60' : '') + '"><td class="p-1.5"><span class="inline-block w-2 h-2 rounded-full mr-1" style="background:' + u.esc(c.color) + '"></span>' + u.esc(c.name) + '</td><td class="p-1.5 text-right">' + (c.b ? u.K(c.b) : '-') + '</td><td class="p-1.5 text-right font-bold">' + u.K(c.s) + '</td>'
          + '<td class="p-1.5 text-right ' + (c.diff < 0 ? 'text-red-600 font-bold' : 'text-emerald-700') + '">' + (c.b ? (c.diff < 0 ? '' : '+') + u.K(c.diff) : '-') + '</td><td class="p-1.5 text-right text-slate-500">' + u.K(c.prev) + '</td><td class="p-1.5 text-right text-slate-500">' + u.K(c.avg) + '</td></tr>';
      }).join('') + '</tbody></table></div>'
      + (chg.length ? '<div class="text-[11px] text-slate-600">지난달보다 많이 달라진 항목: ' + chg.map(function (c) { return u.esc(c.name) + ' <b class="' + (c.d > 0 ? 'text-red-600' : 'text-emerald-700') + '">' + (c.d > 0 ? '+' : '') + u.K(c.d) + '</b>'; }).join(' · ') + '</div>' : '');
    var lim = function (c) { return +db().settings[c === 'H' ? 'allowanceH' : 'allowanceW'] || 0; };
    var couple = '<div class="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">'
      + '<div class="p-3 rounded-lg border border-slate-200"><div class="font-semibold text-slate-600 mb-1">지출 귀속</div>공동 생활비 <b>' + u.K(r.cpl.exp.J) + '</b><br>' + H + ' 개인 <b>' + u.K(r.cpl.exp.H) + '</b><br>' + W + ' 개인 <b>' + u.K(r.cpl.exp.W) + '</b></div>'
      + '<div class="p-3 rounded-lg border border-slate-200"><div class="font-semibold text-slate-600 mb-1">용돈 사용</div>' + ['H', 'W'].map(function (c) { var l = lim(c), used = r.cpl.exp[c]; return (c === 'H' ? H : W) + ' <b class="' + (l && used > l ? 'text-red-600' : '') + '">' + u.K(used) + '</b>' + (l ? ' / ' + u.K(l) : ' (한도 없음)'); }).join('<br>') + '</div>'
      + '</div>';
    var goals = r.goals.length ? '<div class="grid grid-cols-1 md:grid-cols-2 gap-2">' + r.goals.map(function (x) {
      return '<div class="p-3 rounded-lg border border-slate-200 text-xs"><div class="flex justify-between"><b>' + u.esc(x.g.name) + '</b><span class="text-accent font-bold">' + x.i.pc.toFixed(0) + '%</span></div>' + u.bar(x.i.pc, 'bg-accent')
        + '<div class="text-[11px] text-slate-500 mt-1">' + u.K(x.i.saved) + ' / ' + u.K(x.i.tgt) + ' · 이번 달 적립 ' + u.K(x.month) + (x.i.req ? ' · 필요 월 ' + u.K(x.i.req) : '') + '</div></div>';
    }).join('') + '</div>' : '<div class="text-xs text-slate-400">등록된 목표가 없습니다.</div>';
    var cash = '<div class="grid grid-cols-2 lg:grid-cols-4 gap-2">' + cell('고정비 (등록 기준)', u.K(C.fixedTotal()), db().fixedExpenses.filter(function (f) { return f.type !== 'INCOME'; }).length + '건') + cell('이번 달 할부 청구', u.K(r.inst.thisCharge), '잔액 ' + u.K(r.inst.remaining))
      + cell('다음 달 할부 청구', u.K(r.instNext.thisCharge), r.ending.length ? '이번 달 종료 ' + r.ending.length + '건' : '') + cell('대출 월 상환', u.K(C.loansMonthly(mo)), 'DSR ' + (r.h.dsr == null ? '-' : r.h.dsr.toFixed(0) + '%')) + '</div>';
    var advice = adv.length ? adv.map(function (x, i) { var t = TONE[x[0]]; return '<div class="flex gap-2 items-start px-3 py-2 rounded-lg border text-xs ' + t[0] + '"><i class="fa-solid ' + t[1] + ' mt-0.5"></i><span><b>' + (i + 1) + '.</b> ' + x[1] + '</span></div>'; }).join('') : '<div class="text-xs text-emerald-700">특별히 고칠 점이 없습니다. 이번 달처럼만 하세요.</div>';
    var todo = '<ul class="text-xs text-slate-700 space-y-1">' + ['이번 달 카드 이용내역(1일~말일)을 모두 붙여넣었나요?', '다음 달 저축·투자 자동이체 금액을 확인했나요?', '예산을 넘은 항목의 다음 달 예산을 정했나요?', '할부·대출 중 이번 달에 끝나거나 새로 생긴 것이 있나요?']
      .map(function (t) { return '<li class="flex items-start gap-2"><span class="inline-block w-3.5 h-3.5 border border-slate-400 rounded-sm mt-0.5 shrink-0"></span>' + t + '</li>'; }).join('') + '</ul>';
    return '<div id="report-page" class="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-5 max-w-4xl mx-auto">' + head + kpi
      + sec('다음 달에 할 일 (중요한 순서)', 'fa-list-check', advice)
      + sec('예산 대비 실적', 'fa-sliders', budget) + sec('부부 재무', 'fa-people-roof', couple) + sec('목표별 자금', 'fa-flag-checkered', goals) + sec('고정비 · 할부 · 대출', 'fa-calendar-check', cash)
      + sec('함께 확인할 것', 'fa-handshake', todo) + '<div class="text-[10px] text-slate-400">이 리포트는 가계부에 기록된 내역만으로 계산합니다. 내역이 빠졌다면 숫자도 실제와 다를 수 있습니다.</div></div>';
  };

  /* 메신저로 보낼 텍스트 */
  RP.text = function (mo) {
    var r = RP.build(mo), adv = RP.advice(r), L = [];
    L.push('[' + u.monthLabel(mo) + ' 우리 집 재무 리포트]');
    L.push('수입 ' + u.K(r.inc) + ' / 지출 ' + u.K(r.exp) + ' / 남은 돈 ' + u.K(r.surplus) + (r.rate == null ? '' : ' (저축률 ' + r.rate.toFixed(0) + '%)'));
    L.push('실제 저축·투자 ' + u.K(r.S) + (r.T ? ' (목표 ' + u.K(r.T) + ')' : ''));
    L.push('순자산 ' + u.K(r.nwNow) + (r.nwChange == null ? '' : ' (전월 대비 ' + (r.nwChange >= 0 ? '+' : '') + u.K(r.nwChange) + ')'));
    var over = r.cats.filter(function (c) { return c.b > 0 && c.s > c.b; });
    if (over.length) L.push('예산 초과: ' + over.map(function (c) { return c.name + ' ' + u.K(c.s - c.b); }).join(', '));
    if (adv.length) { L.push(''); L.push('다음 달 할 일'); adv.forEach(function (x, i) { L.push((i + 1) + '. ' + x[1]); }); }
    return L.join('\n');
  };
  RP.copy = function () {
    var t = RP.text(App.state.month), done = function () { u.toast('리포트 요약을 복사했습니다. 메신저에 붙여넣으세요.'); };
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(t).then(done, function () { prompt('아래 내용을 복사하세요', t); });
    else prompt('아래 내용을 복사하세요', t);
  };
  RP.print = function () { document.body.classList.add('printing-report'); window.print(); setTimeout(function () { document.body.classList.remove('printing-report'); }, 500); };

  App.views.add({
    id: 'report', order: 65, title: '월말 한 장 리포트', nav: { label: '월말 한 장 리포트', icon: 'fa-file-lines', color: 'text-amber-300' },
    render: function (el) {
      el.innerHTML = '<div class="flex flex-wrap items-center gap-2 no-print"><div class="text-xs text-slate-500 flex-1 min-w-[220px]">달을 바꾸려면 위쪽 월 선택을 쓰세요. 월말에 부부가 함께 보며 다음 달 할 일을 정하는 용도입니다.</div>'
        + '<button onclick="App.report.copy()" class="text-xs bg-white border border-slate-300 hover:bg-slate-50 px-3.5 py-2 rounded-lg font-semibold"><i class="fa-solid fa-copy mr-1"></i>요약 텍스트 복사</button>'
        + '<button onclick="App.report.print()" class="text-xs bg-slate-800 hover:bg-slate-900 text-white px-3.5 py-2 rounded-lg font-semibold"><i class="fa-solid fa-print mr-1"></i>인쇄 / PDF 저장</button></div>'
        + RP.html(App.state.month);
    }
  });
})(window.App);

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
    if (r.h.efMonths != null && r.h.efMonths < 3) a.push(['high', '비상자금이 ' + r.h.efMonths.toFixed(1) + '개월치뿐이에요. 저축·투자보다 먼저 생활비 3개월치(' + u.K(r.h.avgExp * 3) + ')를 파킹통장에 채우세요.']);
    if (r.h.dsr != null && r.h.dsr >= 40) a.push(['high', '대출·할부 상환이 정기 수입의 ' + r.h.dsr.toFixed(0) + '%예요(권장 40% 이하). 새 할부를 멈추고 [계산기 › 대출 먼저 갚을까]에서 금리 높은 빚부터 정리하세요.']);
    if (r.T > 0 && r.S < r.T) a.push(['high', '저축 목표 ' + u.K(r.T) + ' 중 ' + u.K(r.S) + '만 저축·투자했어요(' + u.K(r.T - r.S) + ' 부족). 다음 달은 월급날 자동이체로 저축부터 떼세요.']);
    if (!r.T) a.push(['mid', '저축·투자 목표가 없어요. 이번 달 남은 돈 ' + u.K(Math.max(0, r.surplus)) + '을 참고해 [목표 · 저축]에서 월 목표액을 정하세요.']);
    if (over.length) a.push(['high', '예산 초과: ' + over.slice(0, 3).map(function (c) { return c.name + ' ' + u.K(c.s - c.b); }).join(', ') + '. 다음 달엔 이 항목부터 지켜보세요.']);
    if (r.T > 0 && r.budgetTotal > r.avail) a.push(['mid', '예산 합계가 저축하고 남는 돈보다 ' + u.K(r.budgetTotal - r.avail) + ' 많아요. 예산을 줄이거나 저축 목표를 조정해야 둘 다 지킬 수 있어요.']);
    ['H', 'W'].forEach(function (c) { var lim = +s[c === 'H' ? 'allowanceH' : 'allowanceW'] || 0, used = r.cpl.exp[c]; if (lim && used > lim) a.push(['mid', (c === 'H' ? H : W) + ' 용돈이 한도보다 ' + u.K(used - lim) + ' 많았어요. 다음 달 한도를 다시 정하거나 개인 지출을 줄이기로 이야기해 보세요.']); });
    if (r.ending.length) a.push(['good', '이번 달로 끝나는 할부 ' + r.ending.length + '건(월 ' + u.K(u.sum(r.ending, function (x) { return x.c.thisCharge; })) + ')이 있어요. 다음 달부터 그만큼을 저축으로 돌리면 생활 수준을 바꾸지 않고 저축이 늘어나요.']);
    if (r.fixedUnapplied.length && r.mo <= u.nowM()) a.push(['low', '지출에 반영하지 않은 고정비 ' + r.fixedUnapplied.length + '건(' + r.fixedUnapplied.slice(0, 3).map(function (f) { return f.name; }).join(', ') + ')이 있어요. 실제로 나갔다면 [고정비 · 할부] 화면에서 반영하세요.']);
    r.goals.forEach(function (x) { var pl = +x.g.plan || 0; if (x.i.rem > 0 && x.i.req && pl < x.i.req) a.push(['mid', '목표 \'' + x.g.name + '\'를 기한에 맞추려면 월 ' + u.K(x.i.req) + '이 필요해요(계획 ' + u.K(pl) + '). 기한을 늦추거나 적립액을 늘리세요.']); });
    if (r.rate != null && r.rate >= 30 && !over.length) a.push(['good', '저축률 ' + r.rate.toFixed(0) + '%로 예산도 지켰어요. 이 흐름을 유지하세요.']);
    return a;
  };

  /* ---------- 화면 : 상자 없이 한 장, 큰 숫자 하나 → 세 숫자 → 어디에 썼나 → 할 일 → 자산 · 목표 ---------- */
  var TONE = { high: 1, mid: 1, low: 0, good: 0 };
  function sec(title, body, right) { return '<section class="rp-sec"><div class="rp-h"><h3>' + title + '</h3>' + (right || '') + '</div>' + body + '</section>'; }

  RP.html = function (mo) {
    var r = RP.build(mo), adv = RP.advice(r), won = function (v) { return u.n0(v) + '원'; };
    var top = r.cats.filter(function (c) { return c.s > 0; }).sort(function (a, b) { return b.s - a.s; });
    var spend = u.sum(top, function (c) { return c.s; });
    var head = '<div class="rp-top"><div><div class="rp-eyebrow">' + u.esc(C.nm('H')) + ' · ' + u.esc(C.nm('W')) + '</div><h2>' + u.monthLabel(mo) + ' 우리 집 리포트</h2></div>'
      + '<div class="rp-tools no-print"><button onclick="App.report.copy()"><i class="fa-regular fa-copy"></i> 요약 복사</button><button onclick="App.report.print()"><i class="fa-solid fa-print"></i> 인쇄</button></div></div>';
    var hero = '<div class="rp-hero"><div class="sub">이번 달 남은 돈</div><div class="big' + (r.surplus < 0 ? ' text-red-600' : '') + '">' + won(r.surplus) + '</div>'
      + (r.rate == null ? '' : '<div class="rp-rate"><span style="color:' + (r.rate >= 0 ? '#191F28' : '#E0464B') + '">저축률 ' + r.rate.toFixed(0) + '%</span> · 수입에서 지출을 뺀 돈</div>') + '</div>'
      + '<div class="kv rp-kv"><div><small>들어온 돈</small><b>' + u.KS(r.inc) + '</b></div>'
      + '<div><small>나간 돈</small><b>' + u.KS(r.exp) + '</b><small>예산 ' + u.KS(r.budgetTotal) + '</small></div>'
      + '<div><small>저축 · 투자</small><b>' + u.KS(r.S) + '</b><small>' + (r.T ? '목표의 ' + Math.round(r.S / r.T * 100) + '%' : '목표 없음') + '</small></div></div>';
    /* 어디에 썼나 : 위에 색 막대 한 줄, 아래 큰 항목 순 */
    var stack = spend ? '<div class="rp-stack">' + top.map(function (c, i) { return '<i style="width:' + (c.s / spend * 100).toFixed(1) + '%;background:rgba(25,31,40,' + Math.max(0.12, 0.85 - i * 0.14).toFixed(2) + ')" title="' + u.esc(c.name) + '"></i>'; }).join('') + '</div>' : '';
    var cats = top.length ? stack + top.slice(0, 6).map(function (c) {
      var over = c.b > 0 && c.s > c.b, d = c.s - c.prev;
      return '<div class="rp-cat has-ic">' + u.ic(u.iconFor(c.name), 'sm') + '<span class="n">' + u.esc(c.name) + '</span>'
        + '<span class="m">' + (c.b ? (over ? '<em class="bad">예산보다 ' + u.KS(c.s - c.b) + ' 더</em>' : '예산 ' + Math.round(c.s / c.b * 100) + '%') : '') + (c.prev ? ' · 지난달 ' + (d > 0 ? '+' : '') + u.KS(d) : '') + '</span>'
        + '<b>' + won(c.s) + '</b></div>';
    }).join('') + (top.length > 6 ? '<div class="text-[13px] text-slate-400 pt-2">그 밖에 ' + (top.length - 6) + '개 항목 ' + won(u.sum(top.slice(6), function (c) { return c.s; })) + '</div>' : '')
      : '<div class="empty">이 달 지출 기록이 없어요.</div>';
    var todo = adv.length ? '<ol class="rp-todo">' + adv.slice(0, 5).map(function (x) {
      return '<li' + (TONE[x[0]] ? ' class="key"' : '') + '><span class="rp-no"></span><p>' + x[1] + '</p></li>';
    }).join('') + '</ol>' + (adv.length > 5 ? '<details class="rp-more"><summary>' + (adv.length - 5) + '개 더 보기</summary><ol class="rp-todo">' + adv.slice(5).map(function (x) { return '<li' + (TONE[x[0]] ? ' class="key"' : '') + '><span class="rp-no"></span><p>' + x[1] + '</p></li>'; }).join('') + '</ol></details>' : '')
      : '<p class="text-[15px] text-slate-700">특별히 고칠 점이 없어요. 이번 달처럼만 하면 돼요.</p>';
    var assets = '<div class="kv"><div><small>순자산</small><b>' + u.KS(r.nwNow) + '</b><small>' + (r.nwChange == null ? '지난달 기록 없음' : '지난달보다 ' + (r.nwChange >= 0 ? '+' : '') + u.KS(r.nwChange)) + '</small></div>'
      + '<div><small>비상금</small><b' + (r.h.efMonths != null && r.h.efMonths < 3 ? ' class="text-red-600"' : '') + '>' + (r.h.efMonths == null ? '-' : r.h.efMonths.toFixed(1) + '개월') + '</b><small>3~6개월이면 든든</small></div>'
      + '<div><small>매달 정해진 돈</small><b>' + u.KS(C.fixedTotal() + r.inst.thisCharge + C.loansMonthly(mo)) + '</b><small>고정비 · 할부 · 대출</small></div></div>'
      + (r.ending.length ? '<p class="text-[14px] mt-3 text-slate-600">이번 달로 끝나는 할부 ' + r.ending.length + '건 · 다음 달부터 월 ' + won(u.sum(r.ending, function (x) { return x.c.thisCharge; })) + '이 가벼워져요.</p>' : '');
    var goals = r.goals.length ? r.goals.map(function (x) {
      return '<div class="rp-goal"><div class="flex justify-between gap-3"><b>' + u.esc(x.g.name) + '</b><span>' + u.KS(x.i.saved) + ' / ' + u.KS(x.i.tgt) + ' · <b>' + x.i.pc.toFixed(0) + '%</b></span></div>'
        + '<div class="track mt-2" style="height:6px"><div class="fill" style="width:' + Math.min(100, x.i.pc) + '%;background:#0B7A57"></div></div>'
        + '<small>이번 달 ' + won(x.month) + ' 모음' + (x.i.req ? ' · 기한까지 매달 ' + won(x.i.req) + ' 필요' : '') + '</small></div>';
    }).join('') : '';
    return '<div id="report-page" class="rp">' + head + hero
      + sec('어디에 썼나', cats, spend ? '<span class="rp-sum">' + won(spend) + '</span>' : '')
      + sec('다음 달에 할 일', todo)
      + sec('우리 집 살림', assets)
      + (goals ? sec('목표', goals) : '')
      + '<p class="rp-foot">가계부에 기록된 내역만으로 계산했어요 · ' + u.today() + '</p></div>';
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
    var t = RP.text(App.state.month), done = function () { u.toast('리포트 요약을 복사했어요. 메신저에 붙여넣으세요.'); };
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(t).then(done, function () { prompt('아래 내용을 복사하세요', t); });
    else prompt('아래 내용을 복사하세요', t);
  };
  RP.print = function () { document.body.classList.add('printing-report'); window.print(); setTimeout(function () { document.body.classList.remove('printing-report'); }, 500); };

  App.views.add({
    id: 'report', order: 65, title: '월말 리포트', nav: { label: '월말 리포트', icon: 'fa-file-lines', color: 'text-amber-300' },
    render: function (el) {
      el.innerHTML = RP.html(App.state.month) + '<div class="rp" style="padding-top:.5rem">' + App.dash.analysisHtml(App.state.month) + '</div>';
      App.dash.drawCharts(App.state.month);
    }
  });
})(window.App);

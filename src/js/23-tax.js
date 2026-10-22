/* 연말정산 : 카드 소득공제(현행 한도) · 과세표준·결정세액 추정 · 부부 공제 배분(카드·의료비·연금계좌) */
(function (App) {
  'use strict';
  var u = App.u, C = App.calc, X = App.tax = {};
  var db = function () { return App.db; };
  var S = null;   /* 단일 시뮬레이터 입력값 (화면을 다시 그려도 유지) */

  /* ---------- 세액 추정 엔진 (2024년 귀속 이후 기준) ---------- */
  function wageDed(s) { var d = s <= 5e6 ? s * 0.7 : s <= 1.5e7 ? 3.5e6 + (s - 5e6) * 0.4 : s <= 4.5e7 ? 7.5e6 + (s - 1.5e7) * 0.15 : s <= 1e8 ? 1.2e7 + (s - 4.5e7) * 0.05 : 1.475e7 + (s - 1e8) * 0.02; return Math.min(d, 2e7); }
  function social(s) { return Math.min(s * 0.045, 3.33e6) + s * 0.04 + s * 0.009; }   /* 국민연금(상한)·건강+장기요양·고용 근사 */
  var BR = [[1.4e7, .06, 0], [5e7, .15, 1.26e6], [8.8e7, .24, 5.76e6], [1.5e8, .35, 1.544e7], [3e8, .38, 1.994e7], [5e8, .40, 2.594e7], [1e9, .42, 3.594e7], [Infinity, .45, 6.594e7]];
  X.taxEst = function (sal, people, extraDed) {
    var base = Math.max(0, sal - wageDed(sal) - 1.5e6 * (people || 1) - social(sal) - (extraDed || 0));
    var b = BR.filter(function (x) { return base <= x[0]; })[0], calc = Math.max(0, base * b[1] - b[2]);
    var wc = calc <= 1.3e6 ? calc * 0.55 : 715000 + (calc - 1.3e6) * 0.3;
    var lim = sal <= 3.3e7 ? 740000 : sal <= 7e7 ? Math.max(660000, 740000 - (sal - 3.3e7) * 0.008) : sal <= 1.2e8 ? Math.max(500000, 660000 - (sal - 7e7) * 0.5) : Math.max(200000, 500000 - (sal - 1.2e8) * 0.5);
    return { base: base, rate: b[1], calc: calc, det: Math.max(0, calc - Math.min(wc, lim) - 130000) };   /* 표준세액공제 13만 원 포함 */
  };
  /* 카드 소득공제 : 25% 문턱은 신용 → 체크·현금·문화 → 전통시장·대중교통 순으로 차감 */
  X.cardDed = function (sal, c) {
    var le70 = sal <= 7e7, rem = sal * 0.25, raw = 0, sp = 0, total = 0;
    [{ a: (c.credit || 0) + (le70 ? 0 : c.culture || 0), r: .15 }, { a: c.debit || 0, r: .30 }, { a: le70 ? c.culture || 0 : 0, r: .30, sp: 1 }, { a: c.market || 0, r: .40, sp: 1 }, { a: c.transit || 0, r: .40, sp: 1 }]
      .forEach(function (x) { total += x.a; var use = Math.min(rem, x.a); rem -= use; var d = (x.a - use) * x.r; raw += d; if (x.sp) sp += d; });
    var baseLim = le70 ? 3e6 : 2.5e6, extraLim = le70 ? 3e6 : 2e6;
    return { th: sal * 0.25, total: total, over: Math.max(0, total - sal * 0.25), raw: raw, ded: Math.min(raw, baseLim) + Math.min(Math.max(0, raw - baseLim), extraLim, sp), baseLim: baseLim, extraLim: extraLim };
  };
  /* 가계부 내역 → 공제 항목별 사용액 (who : 카드 소유자 기준 H/W) */
  X.buckets = function (year, who) {
    var b = { credit: 0, debit: 0, cash: 0, market: 0, transit: 0, culture: 0 };
    db().transactions.forEach(function (t) {
      if (t.type !== 'EXPENSE' || String(t.date).indexOf(year) !== 0) return;
      var p = String(t.payment || ''), card = C.cardOf(p), kind;
      if (card) kind = card.type === '체크카드' ? 'debit' : 'credit';
      else if (p.indexOf('현금영수증') >= 0) kind = 'cash';
      else if (/계좌이체|자산이동|현금/.test(p)) return;
      else kind = 'credit';
      if (who) { var o = (card && C.codeOfName(card.owner)) || C.ownerOf(t); if (o !== who) return; }
      if (t.subcategory === '대중교통') kind = 'transit';
      else if (/전통시장|재래시장/.test(t.memo || '')) kind = 'market';
      else if (t.subcategory === '도서/교재' || t.subcategory === '영화/공연') kind = 'culture';
      b[kind] += t.amount;
    });
    return b;
  };

  /* ---------- 단일 시뮬레이터 ---------- */
  var FIELDS = [['salary', '연간 급여 총액 (비과세 포함, 원)'], ['nontax', '연간 비과세 수당 (원)'], ['credit', '신용카드 (원)'], ['debit', '체크카드 (원)'], ['cash', '현금영수증 (원)'], ['market', '전통시장 (40%)'], ['transit', '대중교통 (40%)'], ['culture', '도서·공연·체육 (30%, 7천만 이하)']];
  function init() { if (!S) S = { salary: +db().settings.husbandAnnual || 0, nontax: 0, credit: 0, debit: 0, cash: 0, market: 0, transit: 0, culture: 0, people: 1 }; }
  X.set = function (k, v) { S[k] = k === 'people' ? Math.max(1, parseInt(v, 10) || 1) : u.P(v); X.calc(); };
  X.calc = function () {
    var box = u.$('tax-result'); if (!box) return;
    var sal = Math.max(0, S.salary - S.nontax), c = X.cardDed(sal, { credit: S.credit, debit: S.debit + S.cash, market: S.market, transit: S.transit, culture: S.culture });
    var t0 = X.taxEst(sal, S.people, 0), t1 = X.taxEst(sal, S.people, c.ded), saved = Math.round((t0.det - t1.det) * 1.1);
    var row = function (a, b) { return '<div class="flex justify-between gap-2"><span>' + a + '</span><b>' + b + '</b></div>'; };
    box.innerHTML = '<div><div class="text-xs text-slate-400 font-semibold mb-1">카드 공제로 줄어드는 세금 (추정)</div><div id="tax-refund-result" class="text-2xl font-extrabold text-emerald-400">' + (sal > 0 ? '약 ' + u.K(saved) : '입력 대기') + '</div>'
      + '<div class="text-xs text-slate-300 mt-1">' + (sal > 0 ? '카드 소득공제로 줄어드는 세금 추정치 (지방소득세 포함)' : '총급여와 카드 사용액을 입력해 주세요.') + '</div></div>'
      + '<div class="space-y-1 border-t border-slate-800 pt-3 text-[11px] text-slate-300">' + row('총급여 (비과세 제외)', u.K(sal)) + row('카드 25% 문턱 금액', u.K(c.th)) + row('문턱 초과 사용액 (공제액 아님)', u.K(c.over))
      + row('카드 소득공제액', u.K(c.ded)) + row('공제 한도 (기본 + 추가)', u.K(c.baseLim) + ' + ' + u.K(c.extraLim)) + (c.raw > c.ded ? row('한도를 넘어 버려지는 공제', u.K(c.raw - c.ded)) : '')
      + row('과세표준 추정 (공제 후)', u.K(t1.base)) + row('한계세율', Math.round(t1.rate * 100) + '%') + row('결정세액 추정 (공제 전 → 후)', u.K(t0.det) + ' → ' + u.K(t1.det))
      + '<div class="text-slate-400 pt-1 leading-relaxed">※ 2024년 귀속 이후 기준: 기본한도 총급여 7천만 원 이하 300만·초과 250만, 추가한도(전통시장·대중교통·문화) 300만/200만. 근로소득공제·4대보험은 근사치이며 다른 소득·세액공제는 반영하지 않았습니다. 세법은 해마다 바뀌므로 홈택스 모의계산으로 확인하세요.</div></div>';
  };
  X.sync = function () {
    var b = X.buckets(App.state.month.slice(0, 4));
    ['credit', 'debit', 'cash', 'market', 'transit', 'culture'].forEach(function (k) { S[k] = Math.round(b[k]); });
    App.ui.render();
    u.toast(App.state.month.slice(0, 4) + '년 카드/현금 실적 (' + u.K(b.credit + b.debit + b.cash + b.market + b.transit + b.culture) + ')이 연말정산에 연동되었습니다.');
  };

  /* ---------- 부부 공제 배분 ---------- */
  var PF = [['credit', '신용카드'], ['debit', '체크·현금영수증'], ['sp40', '대중교통·전통시장'], ['culture', '도서·공연·체육'], ['pens', '연금저축 납입'], ['irp', 'IRP 납입']];
  function autoPlan() {
    var y = App.state.month.slice(0, 4), o = { year: y };
    ['H', 'W'].forEach(function (c) {
      var b = X.buckets(y, c), acc = function (t) { return u.sum(db().assets.filter(function (a) { return a.subType === t && (a.owner || 'J') === c; }), function (a) { return a.annualContrib; }); };
      o[c] = { credit: b.credit, debit: b.debit + b.cash, sp40: b.market + b.transit, culture: b.culture, pens: acc('연금저축'), irp: acc('IRP') };
    });
    o.medical = u.sum(db().transactions.filter(function (t) { return t.type === 'EXPENSE' && String(t.date).indexOf(y) === 0 && t.category === '건강/의료' && t.subcategory !== '건강식품'; }), function (t) { return t.amount; });
    o.salA = +db().settings.husbandAnnual || 0; o.salB = +db().settings.wifeAnnual || 0;
    return o;
  }
  function person(sal, uu, med) {
    var t0 = X.taxEst(sal, 1, 0), c = X.cardDed(sal, { credit: uu.credit, debit: uu.debit, market: uu.sp40, culture: uu.culture }), t1 = X.taxEst(sal, 1, c.ded);
    var pr = sal <= 5.5e7 ? 0.15 : 0.12, pElig = Math.min(Math.min(uu.pens || 0, 6e6) + (uu.irp || 0), 9e6), pCred = pElig * pr;
    var mCred = med > 0 ? Math.min(Math.max(0, med - sal * 0.03), 7e6) * 0.15 : 0, mNet = Math.max(0, mCred - 130000);   /* 의료비를 받으면 표준세액공제 13만 원은 빠짐 */
    return { sal: sal, c: c, card: t0.det - t1.det, pCred: pCred, mNet: mNet, pElig: pElig, pr: pr, det1: t1.det, capped: pCred + mNet > t1.det, total: (t0.det - t1.det + Math.min(t1.det, pCred + mNet)) * 1.1 };
  }
  X.planSet = function (who, k, v) {
    var tp = db().taxPlan; if (!tp) return;
    if (who === 'M') tp.medical = u.P(v); else if (who === 'S') tp[k] = u.P(v); else tp[who][k] = u.P(v);
    App.store.save({ quiet: true }); renderCouple();
  };
  X.planAuto = function () { db().taxPlan = autoPlan(); App.store.save({ quiet: true }); App.ui.render(); u.toast('가계부 내역으로 부부별 카드·의료비·연금 납입액을 불러왔습니다.'); };
  function renderCouple() {
    var box = u.$('tax-couple'); if (!box) return;
    var y = App.state.month.slice(0, 4);
    if (!db().taxPlan || db().taxPlan.year !== y) { db().taxPlan = autoPlan(); App.store.save({ quiet: true }); }
    var tp = db().taxPlan, sA = tp.salA != null ? tp.salA : (+db().settings.husbandAnnual || 0), sB = tp.salB != null ? tp.salB : (+db().settings.wifeAnnual || 0);
    var A = u.esc(C.short('H')), B = u.esc(C.short('W'));
    var inp = function (who, k, v) { return '<input type="text" data-money value="' + u.n0(v) + '" onchange="App.tax.planSet(\'' + who + '\',\'' + k + '\', this.value)" class="w-full border border-slate-300 rounded px-2 py-1 text-right">'; };
    var head = '<div class="flex flex-wrap justify-between items-center gap-2"><div class="font-bold text-accent text-sm"><i class="fa-solid fa-scale-balanced text-amber-500 mr-1"></i>부부 공제 배분 시뮬레이터 (' + y + '년)</div>'
      + '<button onclick="App.tax.planAuto()" class="bg-emerald-700 hover:bg-emerald-800 text-white px-3 py-1.5 rounded-lg text-xs"><i class="fa-solid fa-rotate mr-1"></i>가계부에서 다시 불러오기</button></div>'
      + '<div class="overflow-x-auto"><table class="w-full text-xs"><thead><tr class="text-slate-500 bg-slate-50"><th class="p-2 text-left">항목 (연간, 원)</th><th class="p-2">' + A + '</th><th class="p-2">' + B + '</th></tr></thead><tbody>'
      + '<tr class="border-t border-slate-100"><td class="p-2 font-semibold">연간 총급여</td><td class="p-1">' + inp('S', 'salA', sA) + '</td><td class="p-1">' + inp('S', 'salB', sB) + '</td></tr>'
      + PF.map(function (f) { return '<tr class="border-t border-slate-100"><td class="p-2">' + f[1] + '</td><td class="p-1">' + inp('H', f[0], tp.H[f[0]]) + '</td><td class="p-1">' + inp('W', f[0], tp.W[f[0]]) + '</td></tr>'; }).join('')
      + '<tr class="border-t border-slate-100"><td class="p-2">부부 의료비 합계 (누구 몫이든)</td><td class="p-1" colspan="2">' + inp('M', 'medical', tp.medical) + '</td></tr></tbody></table></div>';
    if (!sA || !sB) { box.innerHTML = head + '<div class="text-xs text-slate-500">두 사람의 연간 총급여를 입력하면 카드·의료비·연금계좌 공제를 누구에게 두는 것이 유리한지 계산합니다. ([설정]의 연간 총급여가 자동으로 들어옵니다.)</div>'; return; }
    var zero = { credit: 0, debit: 0, sp40: 0, culture: 0 }, merge = function (a, b) { var o = {}; Object.keys(zero).forEach(function (k) { o[k] = (a[k] || 0) + (b[k] || 0); }); return o; };
    var withPen = function (x, src) { return Object.assign({}, x, { pens: src.pens, irp: src.irp }); };
    var cards = { cur: [tp.H, tp.W], A: [merge(tp.H, tp.W), zero], B: [zero, merge(tp.H, tp.W)] }, combos = [];
    Object.keys(cards).forEach(function (ck) { ['H', 'W'].forEach(function (mt) {
      var pa = person(sA, withPen(cards[ck][0], tp.H), mt === 'H' ? tp.medical : 0), pb = person(sB, withPen(cards[ck][1], tp.W), mt === 'W' ? tp.medical : 0);
      combos.push({ ck: ck, mt: mt, a: pa, b: pb, total: pa.total + pb.total });
    }); });
    combos.sort(function (x, z) { return z.total - x.total; });
    var best = combos[0], cur = combos.filter(function (c) { return c.ck === 'cur'; }).sort(function (x, z) { return z.total - x.total; })[0];
    var label = function (c) { return '카드: ' + (c.ck === 'cur' ? '지금처럼 각자' : (c.ck === 'A' ? A : B) + '에게 몰기') + ' · 의료비: ' + (c.mt === 'H' ? A : B); };
    var pcard = function (who, p, uu) {
      var under = p.c.total < p.c.th, room = 9e6 - p.pElig, extra = 0;
      if (room > 0) extra = person(p.sal, Object.assign({}, uu, { irp: (uu.irp || 0) + room }), 0).total - person(p.sal, uu, 0).total;
      return '<div class="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-1 text-xs"><div class="font-bold text-slate-800">' + who + ' <span class="font-normal text-slate-400">총급여 ' + u.K(p.sal) + '</span></div>'
        + '<div class="flex justify-between"><span>카드 25% 문턱 / 사용액</span><b>' + u.K(p.c.th) + ' / ' + u.K(p.c.total) + '</b></div>'
        + (under ? '<div class="text-amber-700">문턱 미달 → 카드 공제 0원. 사용액이 적은 쪽은 공제를 받기 어렵습니다.</div>' : '<div class="flex justify-between"><span>카드 공제로 줄어든 세금</span><b>' + u.K(p.card * 1.1) + '</b></div>')
        + '<div class="flex justify-between"><span>연금계좌 세액공제 (' + (p.pr === 0.15 ? '16.5%' : '13.2%') + ')</span><b>' + u.K(p.pCred * 1.1) + '</b></div>'
        + (p.mNet ? '<div class="flex justify-between"><span>의료비 세액공제 (표준공제 13만 차감 후)</span><b>' + u.K(p.mNet * 1.1) + '</b></div>' : '')
        + '<div class="flex justify-between"><span>결정세액 추정</span><b>' + u.K(p.det1 * 1.1) + '</b></div>'
        + (p.capped ? '<div class="text-red-600">낼 세금보다 세액공제가 많아 일부가 사라집니다. 공제를 배우자 쪽으로 옮기세요.</div>' : '')
        + (room > 0 && extra > 1000 ? '<div class="text-emerald-700">IRP에 ' + u.K(room) + ' 더 넣으면 약 ' + u.K(extra) + ' 더 돌려받습니다.</div>' : '') + '</div>';
    };
    box.innerHTML = head + '<div class="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs"><b>추천:</b> ' + label(best) + ' → 부부 합산 절세 약 <b>' + u.K(best.total) + '</b>'
      + (best.total - cur.total > 1000 ? ' (지금 방식 중 최선인 \'' + label(cur) + '\'보다 ' + u.K(best.total - cur.total) + ' 많음)' : ' · 지금 방식이 이미 최선에 가깝습니다.') + '</div>'
      + '<div class="grid grid-cols-1 lg:grid-cols-2 gap-3">' + pcard(A, best.a, withPen(cards[best.ck][0], tp.H)) + pcard(B, best.b, withPen(cards[best.ck][1], tp.W)) + '</div>'
      + '<div class="overflow-x-auto"><table class="w-full text-xs"><thead><tr class="text-slate-500 bg-slate-50"><th class="p-2 text-left">배분 방식</th><th class="p-2 text-right">' + A + '</th><th class="p-2 text-right">' + B + '</th><th class="p-2 text-right">합계</th></tr></thead><tbody>'
      + combos.map(function (c) { return '<tr class="border-t border-slate-100' + (c === best ? ' bg-emerald-50 font-bold' : '') + '"><td class="p-2">' + label(c) + '</td><td class="p-2 text-right">' + u.K(c.a.total) + '</td><td class="p-2 text-right">' + u.K(c.b.total) + '</td><td class="p-2 text-right">' + u.K(c.total) + '</td></tr>'; }).join('') + '</tbody></table></div>'
      + '<div class="text-[11px] text-slate-500 leading-relaxed">※ 맞벌이 부부는 배우자 카드 사용액을 옮겨 공제받을 수 없습니다(각자 본인 사용분만). \'몰기\'는 앞으로 결제 카드를 바꿀 때의 효과입니다. 의료비는 배우자 몫도 실제로 낸 사람이 공제받을 수 있어, 총급여 3% 문턱이 낮은 쪽이 대체로 유리하지만 낼 세금이 적으면 효과가 사라집니다. 연금저축·IRP는 본인 계좌만 공제됩니다. 의료비 한도는 일반 700만 원으로 계산했습니다(본인·65세 이상·장애인 등은 한도 없음). 모든 금액은 지방소득세를 포함한 추정치입니다.</div>';
  }

  App.views.add({
    id: 'tax', order: 80, title: '맞벌이 부부 연말정산 시뮬레이터', nav: { label: '맞벌이 연말정산', icon: 'fa-calculator', color: 'text-emerald-400' },
    render: function (el) {
      init();
      var f = function (k, label) { return '<div><label class="block font-semibold text-slate-600 mb-1">' + label + '</label><input type="text" data-money value="' + u.n0(S[k]) + '" onchange="App.tax.set(\'' + k + '\', this.value)" class="w-full border border-slate-300 rounded p-2 font-bold text-slate-800"></div>'; };
      el.innerHTML = '<div class="bg-white p-6 rounded-xl border border-slate-200 shadow-sm"><div class="flex flex-wrap justify-between items-center pb-3 border-b border-slate-100 gap-2"><h3 class="font-bold text-slate-800 text-base flex items-center gap-2"><i class="fa-solid fa-calculator text-accent"></i> 카드 소득공제 시뮬레이터</h3>'
        + '<button onclick="App.tax.sync()" class="bg-emerald-700 hover:bg-emerald-800 text-white text-xs px-3.5 py-2 rounded-lg font-medium flex items-center gap-1.5 shadow-sm"><i class="fa-solid fa-rotate"></i> 가계부 카드실적 불러오기</button></div>'
        + '<div class="grid grid-cols-12 gap-6 mt-4"><div class="col-span-12 lg:col-span-7 space-y-4 text-xs">'
        + '<div class="p-4 bg-slate-50 rounded-lg border border-slate-200 space-y-3"><h4 class="font-bold text-slate-800 text-xs border-b border-slate-200 pb-1.5">1. 근로 소득 정보</h4><div class="grid grid-cols-2 gap-3">' + f('salary', FIELDS[0][1]) + f('nontax', FIELDS[1][1]) + '</div>'
        + '<div class="w-40"><label class="block font-semibold text-slate-600 mb-1">인적공제 인원 (본인 포함)</label><input type="number" min="1" max="10" value="' + S.people + '" onchange="App.tax.set(\'people\', this.value)" class="w-full border border-slate-300 rounded p-2 font-bold"></div></div>'
        + '<div class="p-4 bg-slate-50 rounded-lg border border-slate-200 space-y-3"><h4 class="font-bold text-slate-800 text-xs border-b border-slate-200 pb-1.5">2. 카드 / 체크카드 / 현금영수증 사용액</h4><div class="grid grid-cols-3 gap-3">' + f('credit', FIELDS[2][1]) + f('debit', FIELDS[3][1]) + f('cash', FIELDS[4][1]) + '</div>'
        + '<div class="grid grid-cols-3 gap-3">' + f('market', FIELDS[5][1]) + f('transit', FIELDS[6][1]) + f('culture', FIELDS[7][1]) + '</div>'
        + '<div class="text-[11px] text-slate-500">아래 3개 금액은 신용·체크·현금영수증 칸과 겹치지 않게 넣으세요. [가계부 카드실적 불러오기]는 대중교통·도서/공연 소분류와 메모의 \'전통시장\'을 자동으로 나눕니다.</div></div></div>'
        + '<div id="tax-result" class="col-span-12 lg:col-span-5 bg-slate-900 text-white p-5 rounded-xl flex flex-col justify-between space-y-4"></div></div></div>'
        + '<div id="tax-couple" class="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4"></div>';
      X.calc(); renderCouple();
    }
  });
})(window.App);

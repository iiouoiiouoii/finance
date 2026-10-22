/* 계산 엔진 : 화면과 무관한 순수 계산만 모은다.
   (명의 판단 · 자산 평가 · 대출 상환 · 할부 스케줄 · 월별 예산 · 순자산 · 재무 건강 지표) */
(function (App) {
  'use strict';
  var u = App.u, C = App.calc = {};
  var db = function () { return App.db; };
  var st = function () { return App.db.settings || (App.db.settings = {}); };
  C.month = function () { return App.state.month; };

  /* =========================================================
     명의 · 사용자 (J 공동 · H 남편 · W 아내)
     ========================================================= */
  C.OW = ['J', 'H', 'W'];
  function baseName(s) { return String(s || '').replace(/\s*\(.*?\)\s*/g, '').trim(); }
  C.nm = function (c) { return c === 'H' ? (st().husbandName || '남편') : c === 'W' ? (st().wifeName || '아내') : '공동'; };
  C.short = function (c) { return c === 'J' ? '공동' : (baseName(C.nm(c)) || C.nm(c)); };
  C.codeOfName = function (s) {
    s = String(s || '').trim(); if (!s) return null;
    if (s === '공동') return 'J';
    var h = st().husbandName || '남편', w = st().wifeName || '아내';
    if (s === h || s === baseName(h) || s === '남편' || s === '본인') return 'H';
    if (s === w || s === baseName(w) || s === '아내' || s === '배우자') return 'W';
    if (s.indexOf('남편') === 0) return 'H';
    if (s.indexOf('아내') === 0) return 'W';
    return null;
  };
  C.cardOf = function (payment) {
    var p = String(payment || '');
    return (db().cards || []).filter(function (c) { return c.name && p.indexOf(c.name) >= 0; })[0];
  };
  /* 결제수단의 주인 (카드 소유자, 없으면 "(이름)" 꼬리표) */
  C.cardOwner = function (payment) {
    var c = C.cardOf(payment);
    if (c) { var k = C.codeOfName(c.owner); if (k) return k; }
    var m = String(payment || '').match(/\(([^()]+)\)\s*$/);
    return m ? C.codeOfName(m[1]) : null;
  };
  function tokens(c) {
    var n = C.nm(c), inner = (n.match(/\(([^)]+)\)/) || [])[1];
    return [c === 'H' ? '남편' : '아내', baseName(n), inner].filter(function (x) { return x && x.length >= 2; });
  }
  function memoOwner(memo) {
    memo = String(memo || '');
    var h = tokens('H').some(function (k) { return memo.indexOf(k) >= 0; }), w = tokens('W').some(function (k) { return memo.indexOf(k) >= 0; });
    return h && !w ? 'H' : (w && !h ? 'W' : null);
  }
  /* 귀속(누구 몫) : 지정값 우선. 미지정 지출은 공동 생활비. 미지정 수입은 메모의 이름 → 카드 소유자 순으로 추정 */
  C.ownerOf = function (t) { return t.owner || (t.type === 'INCOME' ? memoOwner(t.memo) || C.cardOwner(t.payment) : null) || 'J'; };
  var BC = { J: 'bg-slate-100 text-slate-600 border-slate-300', H: 'bg-sky-50 text-sky-700 border-sky-300', W: 'bg-rose-50 text-rose-700 border-rose-300' };
  /* 명의 배지 (inferred 이면 점선 : 직접 지정하지 않은 값) */
  C.badge = function (c, inferred) {
    c = BC[c] ? c : 'J';
    return '<span class="own-badge inline-block align-middle text-[10px] font-bold px-1.5 py-0.5 rounded border ' + BC[c] + '"'
      + (inferred ? ' style="border-style:dashed" title="지정하지 않은 값입니다 (지출은 공동, 수입은 메모의 이름으로 추정). 수정 화면에서 지정할 수 있습니다."' : '') + '>' + u.esc(C.short(c)) + '</span>';
  };
  C.ownerOptions = function (isTxn) {
    return C.OW.map(function (c) { return '<option value="' + c + '">' + u.esc(c === 'J' ? (isTxn ? '공동 생활비' : '공동 (부부 공동)') : C.nm(c) + (isTxn ? ' 개인 (용돈)' : '')) + '</option>'; }).join('');
  };
  C.payments = function () {
    return ['계좌이체', '현금'].concat((db().cards || []).map(function (c) { return c.name + ' (' + (c.owner || '남편') + ')'; }));
  };

  /* =========================================================
     거래 집계
     ========================================================= */
  C.monthTx = function (mo) { mo = mo || C.month(); return (db().transactions || []).filter(function (t) { return t.date && String(t.date).indexOf(mo) === 0; }); };
  C.sumType = function (list, type) { return u.sum(list.filter(function (t) { return t.type === type; }), function (t) { return t.amount; }); };
  C.income = function (mo) { return C.sumType(C.monthTx(mo), 'INCOME'); };
  C.expense = function (mo) { return C.sumType(C.monthTx(mo), 'EXPENSE'); };
  C.expenseByMonth = function () {
    var by = {};
    (db().transactions || []).forEach(function (t) { if (t.type === 'EXPENSE' && t.date) { var m = String(t.date).slice(0, 7); by[m] = (by[m] || 0) + (t.amount || 0); } });
    return by;
  };
  /* 고정 지출 합계 (고정 수입 항목은 제외) */
  C.fixedTotal = function () { return u.sum((db().fixedExpenses || []).filter(function (f) { return f.type !== 'INCOME'; }), function (f) { return f.amount; }); };
  /* 최근 3개월(지출이 있는 달) 평균 지출. 기록이 없으면 고정비+할부 */
  C.avgExp = function (mo) {
    mo = mo || C.month();
    var by = C.expenseByMonth(), ex = [0, 1, 2].map(function (i) { return by[u.addM(mo, -i)] || 0; }).filter(Boolean);
    if (ex.length) return ex.reduce(function (a, b) { return a + b; }, 0) / ex.length;
    return C.fixedTotal() + C.instSummary(mo).thisCharge;
  };

  /* =========================================================
     자산 (예적금 · 연금 · 보증금)
     ========================================================= */
  C.EXT = { '전세보증금': 'LEASE', '국민연금': 'NPS', '퇴직연금': 'PEN', '연금저축': 'PEN', 'IRP': 'PEN', 'ISA': 'ISA' };
  C.NONLIQ = { '전세보증금': 1, '국민연금': 1, '퇴직연금': 1, '연금저축': 1, 'IRP': 1 };
  /* 적금은 만기총액이 아닌 '지금까지 납입한 금액'만 계상 */
  C.assetValue = function (a, mo) {
    mo = mo || C.month();
    if (a.subType !== '적금') return a.amount || 0;
    var m = a.months || 12;
    var paid = Math.max(0, Math.min(m, a.paidRounds != null ? a.paidRounds : (a.startMonth ? u.mIdx(mo) - u.mIdx(a.startMonth) + 1 : m)));
    return (a.amount || 0) * paid;
  };
  C.assetsTotal = function (mo) { return u.sum(db().assets, function (a) { return C.assetValue(a, mo); }); };
  C.liquidOnly = function (mo) { return u.sum((db().assets || []).filter(function (a) { return !C.NONLIQ[a.subType]; }), function (a) { return C.assetValue(a, mo); }); };
  /* 예적금 이자 (세후 15.4%) */
  C.depositDetail = function (a) {
    var subType = a.subType || '입출금', amount = a.amount || 0, rate = a.rate || 0, months = a.months || 12;
    var r = { bankName: a.bankName || '기타', subType: subType, name: a.name || '', amount: amount, rate: rate, months: months, totalPrincipal: amount, preTaxInterest: 0, tax: 0, postTaxInterest: 0, maturityAmount: amount, monthlyPostTaxInterest: 0 };
    if (subType === '예금') r.preTaxInterest = Math.round(amount * (rate / 100) * (months / 12));
    else if (subType === '적금') { r.totalPrincipal = amount * months; r.preTaxInterest = Math.round(amount * (rate / 100) * ((months * (months + 1)) / (2 * 12))); }
    else if (subType === '파킹' || subType === '입출금') r.preTaxInterest = Math.round(amount * (rate / 100));
    else return r;
    r.tax = Math.round(r.preTaxInterest * 0.154);
    r.postTaxInterest = r.preTaxInterest - r.tax;
    r.maturityAmount = r.totalPrincipal + r.postTaxInterest;
    if (subType === '파킹' || subType === '입출금') r.monthlyPostTaxInterest = Math.round(r.postTaxInterest / 12);
    return r;
  };

  /* =========================================================
     대출 상환
     ========================================================= */
  C.DTYPE = { EQUAL_PAYMENT: '원리금균등', EQUAL_PRINCIPAL: '원금균등', BULLET: '만기일시' };
  /* 월 상환액 (금리 0% 도 원금 분할) */
  C.loanPayment = function (p, rate, type, n) {
    p = +p || 0; n = +n || 0; rate = +rate || 0;
    if (!p || !n) return 0;
    var r = rate / 1200;
    if (type === 'EQUAL_PRINCIPAL') return Math.round(p / n + p * r);
    if (type === 'BULLET') return Math.round(p * r);
    if (!r) return Math.round(p / n);
    var f = Math.pow(1 + r, n); return Math.round(p * r * f / (f - 1));
  };
  /* 시작월 + 최초 대출금이 있으면 그 달 잔액을 상환 방식대로 계산한다 */
  C.hasSchedule = function (l) { return !!(l && /^\d{4}-\d{2}$/.test(l.startMonth || '') && +l.principal > 0 && +l.months > 0); };
  C.loanSchedule = function (l, mo) {
    var P = +l.principal, N = parseInt(l.months, 10), r = (+l.rate || 0) / 1200, k = u.mIdx(mo) - u.mIdx(l.startMonth), B;
    if (k < 0) return { amount: 0, months: 0, paid: 0, total: N, notYet: true };
    if (k > N) k = N;
    if (l.debtType === 'EQUAL_PRINCIPAL') B = P * (1 - k / N);
    else if (l.debtType === 'BULLET') B = k < N ? P : 0;
    else if (!r) B = P * (1 - k / N);
    else { var f = Math.pow(1 + r, N), g = Math.pow(1 + r, k), A = P * r * f / (f - 1); B = P * g - A * (g - 1) / r; }
    return { amount: Math.max(0, Math.round(B)), months: N - k, paid: k, total: N };
  };
  /* 그 달 기준 { 잔액, 남은 회차, 월 상환액 } */
  C.loanState = function (l, mo) {
    mo = mo || C.month();
    var s = C.hasSchedule(l) ? C.loanSchedule(l, mo) : { amount: l.amount || 0, months: l.months || 120 };
    s.monthly = C.loanPayment(s.amount, l.rate || 0, l.debtType || 'EQUAL_PAYMENT', s.months);
    s.interest = Math.round(s.amount * (l.rate || 0) / 100 / 12);
    return s;
  };
  C.loanBalance = function (l, mo) { return C.loanState(l, mo).amount; };
  C.loansTotal = function (mo) { return u.sum(db().liabilities, function (l) { return C.loanBalance(l, mo); }); };
  C.loansMonthly = function (mo) { return u.sum(db().liabilities, function (l) { return C.loanState(l, mo).monthly; }); };

  /* =========================================================
     카드 할부 (원금균등 + 잔존원금 기준 수수료, 선결제 SHORTEN/REDUCE)
     ========================================================= */
  C.instSchedule = function (inst, applyPrepay) {
    var months = Math.max(1, parseInt(inst.months, 10) || 1), total = Math.max(0, inst.total || 0);
    var unit = Math.floor(total / months / 10) * 10, rows = [], acc = 0, k;
    for (k = 1; k <= months; k++) {
      var pr = k === months ? total - acc : unit; acc += pr;
      rows.push({ round: k, month: u.addM(inst.startMonth, k - 1), principal: pr, cancelled: 0, charge: pr, interest: 0 });
    }
    if (applyPrepay) {
      var pool = u.sum(inst.prepayments, function (p) { return p.amount; });
      if (inst.prepayMode === 'REDUCE') {
        var refI = u.mIdx(C.month()), fut = rows.filter(function (r) { return u.mIdx(r.month) > refI; });
        if (!fut.length) fut = rows.slice();
        var per = pool / fut.length;
        fut.forEach(function (r) { r.cancelled = Math.min(r.principal, Math.round(per)); });
        var left = pool - u.sum(fut, function (r) { return r.cancelled; });
        for (var z = fut.length - 1; z >= 0 && left > 0; z--) { var add = Math.min(fut[z].principal - fut[z].cancelled, left); fut[z].cancelled += add; left -= add; }
      } else {
        for (k = rows.length - 1; k >= 0 && pool > 0; k--) { var cut = Math.min(rows[k].principal, pool); rows[k].cancelled = cut; pool -= cut; }
      }
    }
    rows.forEach(function (r) { r.charge = Math.max(0, r.principal - r.cancelled); });
    var remain = total;
    rows.forEach(function (r) { r.interest = (inst.apr > 0 && r.charge > 0) ? Math.round(remain * (inst.apr / 100) / 12) : 0; remain -= (r.charge + r.cancelled); });
    return rows;
  };
  C.calcInst = function (inst, ref) {
    ref = ref || C.month();
    var baseRows = C.instSchedule(inst, false), rows = C.instSchedule(inst, true);
    var refI = u.mIdx(ref), stI = u.mIdx(inst.startMonth), total = inst.total || 0;
    var prepaid = u.sum((inst.prepayments || []).filter(function (p) { return String(p.date || '').slice(0, 7) <= ref; }), function (p) { return p.amount; });
    var paidByRound = u.sum(rows.filter(function (r) { return u.mIdx(r.month) <= refI; }), function (r) { return r.charge; });
    var paid = Math.min(total, paidByRound + prepaid), remaining = Math.max(0, total - paid);
    var thisRow = rows.filter(function (r) { return r.month === ref; })[0] || null;
    var closed = inst.closedMonth && ref > inst.closedMonth;
    var active = rows.filter(function (r) { return r.charge > 0; });
    var lastMonth = active.length ? active[active.length - 1].month : inst.startMonth;
    var future = rows.filter(function (r) { return u.mIdx(r.month) > refI && r.charge > 0; });
    var settled = remaining <= 0;
    return {
      rows: rows, total: total, paid: paid, remaining: remaining,
      prepaidTotal: u.sum(inst.prepayments, function (p) { return p.amount; }),
      thisCharge: (thisRow && !closed) ? thisRow.charge + thisRow.interest : 0,
      roundNo: thisRow ? thisRow.round : (refI < stI ? 0 : inst.months),
      doneRounds: Math.max(0, Math.min(inst.months, refI - stI + 1)),
      remainRounds: future.length, lastMonth: lastMonth,
      nextMonthCharge: future.length ? future[0].charge + future[0].interest : 0,
      savedInterest: Math.max(0, u.sum(baseRows, function (r) { return r.interest; }) - u.sum(rows, function (r) { return r.interest; })),
      progress: total > 0 ? Math.min(100, Math.round(paid / total * 100)) : 100,
      settled: settled, status: settled ? 'SETTLED' : (refI < stI ? 'SCHEDULED' : 'ACTIVE'),
      earlyClosed: settled && (inst.prepayments || []).length > 0 && u.mIdx(lastMonth) <= u.mIdx(u.addM(inst.startMonth, inst.months - 1))
    };
  };
  C.instSummary = function (ref) {
    ref = ref || C.month();
    var s = { count: 0, active: 0, settled: 0, thisCharge: 0, remaining: 0, saved: 0, maxMonth: null };
    (db().installments || []).forEach(function (i) {
      var c = C.calcInst(i, ref);
      s.count++; if (c.settled) s.settled++; else s.active++;
      s.thisCharge += c.thisCharge; s.remaining += c.remaining; s.saved += c.savedInterest;
      if (!c.settled && (!s.maxMonth || u.mIdx(c.lastMonth) > u.mIdx(s.maxMonth))) s.maxMonth = c.lastMonth;
    });
    return s;
  };
  /* 약정 회차가 이미 끝난 할부를 완납으로 보정 (데이터를 고친다) */
  C.autoCloseInstallments = function () {
    var cm = C.month(), changed = false;
    (db().installments || []).forEach(function (i) {
      if (i.closedMonth) return;
      var end = u.addM(i.startMonth, Math.max(1, i.months || 1) - 1);
      if (u.mIdx(end) < u.mIdx(cm)) { i.closedMonth = end; changed = true; return; }
      if (C.calcInst(i, cm).remaining <= 0) { i.closedMonth = cm; changed = true; }
    });
    return changed;
  };

  /* =========================================================
     월별 예산 : budgets = 기본 예산, budgetsByMonth[YYYY-MM] = 그 달만 다른 값
     ========================================================= */
  C.budgetFor = function (mo) {
    mo = mo || C.month();
    var v = {}, base = db().budgets || {}, ov = (db().budgetsByMonth || {})[mo];
    Object.keys(base).forEach(function (k) { v[k] = Number(base[k]) || 0; });
    if (ov && typeof ov === 'object') Object.keys(ov).forEach(function (k) { v[k] = Number(ov[k]) || 0; });
    return v;
  };
  C.budgetTotal = function (mo) { var b = C.budgetFor(mo); return u.sum(Object.keys(b), function (k) { return b[k]; }); };
  C.FIXEDCAT = /주거|통신|금융|보험|세금/;
  C.varBudget = function (mo) { var b = C.budgetFor(mo); return u.sum(Object.keys(b), function (k) { return C.FIXEDCAT.test(k) ? 0 : b[k]; }); };
  C.monthOverride = function (mo) { var o = (db().budgetsByMonth || {})[mo || C.month()]; return o && typeof o === 'object' ? o : {}; };

  /* =========================================================
     순자산 · 재무 건강
     ========================================================= */
  C.investTotal = function () { return u.sum(db().investments, function (i) { return i.value; }); };
  C.reTotal = function () { return u.sum(db().realEstates, function (r) { return r.value; }); };
  /* 내 집을 전세·월세로 놓고 받은 세입자 보증금 : 돌려줘야 할 돈이라 부채로 본다 (전세로 사는 집에는 없음) */
  C.reTenantDep = function (r) { return r.tenure === 'JEONSE' ? 0 : u.num(r.tenantDeposit); };
  C.reTenantTotal = function () { return u.sum(db().realEstates, C.reTenantDep); };
  C.netWorth = function (mo) {
    mo = mo || C.month();
    var liquid = C.assetsTotal(mo), inv = C.investTotal(), re = C.reTotal(), inst = C.instSummary(mo);
    var tenant = C.reTenantTotal(), assets = liquid + inv + re, debt = C.loansTotal(mo) + inst.remaining + tenant;
    return { liquid: liquid, invest: inv, re: re, assets: assets, loans: C.loansTotal(mo), instRemaining: inst.remaining, tenantDep: tenant, debt: debt, nw: assets - debt };
  };
  C.health = function (mo) {
    mo = mo || C.month();
    var tx = C.monthTx(mo), inc = C.sumType(tx, 'INCOME'), exp = C.sumType(tx, 'EXPENSE');
    var invT = u.sum(tx.filter(function (t) { return t.type === 'TRANSFER' && t.subcategory === '투자매수'; }), function (t) { return t.amount; });
    var inst = C.instSummary(mo), n = C.netWorth(mo), liq = C.liquidOnly(mo), invs = n.invest, avg = C.avgExp(mo);
    var debtPay = C.loansMonthly(mo) + inst.thisCharge;
    var s = st(), base = (+s.husbandIncome || 0) + (+s.wifeIncome || 0) || inc;
    return {
      inc: inc, exp: exp, invT: invT, liq: liq, invs: invs, assets: n.assets, debt: n.debt, nw: n.nw, avgExp: avg,
      efMonths: avg > 0 ? liq / avg : null, dsr: base > 0 ? debtPay / base * 100 : null, debtPay: debtPay,
      saveRate: inc > 0 ? (inc - exp) / inc * 100 : null, invShare: (liq + invs) > 0 ? invs / (liq + invs) * 100 : 0, target: +s.targetNetWorth || 0
    };
  };
  /* 명의별 순자산 */
  C.nwByOwner = function (mo) {
    mo = mo || C.month();
    var r = { J: { a: 0, d: 0 }, H: { a: 0, d: 0 }, W: { a: 0, d: 0 } }, add = function (o, k, v) { r[r[o] ? o : 'J'][k] += Number(v) || 0; };
    (db().assets || []).forEach(function (a) { add(a.owner, 'a', C.assetValue(a, mo)); });
    (db().investments || []).forEach(function (i) { add(i.owner, 'a', i.value); });
    (db().realEstates || []).forEach(function (x) { add(x.owner, 'a', x.value); add(x.owner, 'd', C.reTenantDep(x)); });
    (db().liabilities || []).forEach(function (l) { add(l.owner, 'd', C.loanBalance(l, mo)); });
    (db().installments || []).forEach(function (i) { add(C.cardOwner(i.payment) || 'J', 'd', C.calcInst(i, mo).remaining); });
    return r;
  };
  /* 이번 달 부부 지출 귀속 (공동 생활비 / 각자 용돈) · 수입 */
  C.coupleStats = function (mo) {
    var r = { exp: { J: 0, H: 0, W: 0 }, inc: { J: 0, H: 0, W: 0 } };
    C.monthTx(mo).forEach(function (t) {
      var o = C.ownerOf(t);
      if (t.type === 'EXPENSE') r.exp[o] += t.amount;
      else if (t.type === 'INCOME') r.inc[o] += t.amount;
    });
    return r;
  };

  /* =========================================================
     선저축 (목표 · 선저축 계획 / 주간 점검 / 리포트가 함께 쓴다)
     ========================================================= */
  C.incomeBase = function (mo) {
    var inc = C.income(mo), reg = (+st().husbandIncome || 0) + (+st().wifeIncome || 0);
    return { inc: inc, reg: reg, base: inc || reg, fromReg: !inc && !!reg };
  };
  C.savingTarget = function (mo) {
    var s = st(), base = C.incomeBase(mo).base;
    return s.saveMode === 'pct' ? Math.round(base * (+s.savePct || 0) / 100) : (+s.saveTarget || 0);
  };
  /* 실제 저축·투자 = 그 달 [이체 › 자산이동] 기록 (투자매도 제외) */
  C.savedIn = function (mo) {
    return u.sum(C.monthTx(mo).filter(function (t) { return t.type === 'TRANSFER' && t.category === '자산이동' && t.subcategory !== '투자매도'; }), function (t) { return t.amount; });
  };
  C.goalSaved = function (g) {
    return (+g.initial || 0) + u.sum((db().transactions || []).filter(function (t) { return t.goalId === g.id && t.type === 'TRANSFER'; }), function (t) { return t.amount; });
  };
  C.goalInfo = function (g) {
    var saved = C.goalSaved(g), tgt = +g.target || 0, rem = Math.max(0, tgt - saved);
    var ml = g.due ? u.mIdx(g.due) - u.mIdx(u.nowM()) + 1 : null;
    var req = rem <= 0 ? 0 : (ml == null ? null : (ml > 0 ? rem / ml : rem));
    return { saved: saved, tgt: tgt, rem: rem, ml: ml, req: req, pc: tgt ? Math.min(100, saved / tgt * 100) : 0 };
  };
})(window.App);

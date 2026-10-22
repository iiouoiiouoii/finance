/* 대출 상환 판단 도우미 : 여유자금을 갚을까, 굴릴까 · 어느 빚부터 · 기간 단축 vs 월 상환액 감소
   - 대출 잔액·남은 회차는 계산 엔진(C.loanState)이 그 달 기준으로 준다.
   - 카드 할부(수수료 있는 것)도 빚 목록에 함께 넣는다. */
(function (App) {
  'use strict';
  var u = App.u, C = App.calc, LA = App.loanAdvisor = {};
  var db = function () { return App.db; };
  var S = { id: null, lump: 10000000, monthly: 0, ret: 3.5, feeRate: 1.2, deduct: 0 };

  /* 빚 목록 : 대출 + 수수료 있는 진행 중 할부 */
  function debts(mo) {
    var list = (db().liabilities || []).map(function (l) {
      var s = C.loanState(l, mo);
      var age = C.hasSchedule(l) ? u.mIdx(mo) - u.mIdx(l.startMonth) : null;
      return { key: 'L' + l.id, kind: '대출', name: l.name, bal: s.amount, rate: +l.rate || 0, n: s.months, type: l.debtType || 'EQUAL_PAYMENT', monthly: s.monthly, age: age, l: l };
    }).filter(function (d) { return d.bal > 0 && d.n > 0; });
    (db().installments || []).forEach(function (i) {
      var c = C.calcInst(i, mo); if (c.settled || !(i.apr > 0)) return;
      /* 잔액(remaining)에는 이번 달 회차까지 낸 것으로 잡혀 있으므로 남은 회차는 다음 달부터 센다 */
      list.push({ key: 'I' + i.id, kind: '카드할부', name: i.title, bal: c.remaining, rate: +i.apr || 0, n: Math.max(1, c.remainRounds), type: 'EQUAL_PRINCIPAL', monthly: c.nextMonthCharge || c.thisCharge, age: null, inst: true });
    });
    return list.sort(function (a, b) { return b.rate - a.rate; });
  }

  /* 월 단위 상환 시뮬레이션
     mode 'shorten' : 월 상환액(원금 몫)은 그대로 → 기간이 줄어든다 / 'reduce' : 기간 그대로 → 월 상환액이 준다 */
  LA.simulate = function (d, lump, extraMonthly, mode) {
    var r = d.rate / 1200, n = d.n, bal = Math.max(0, d.bal - (lump || 0)), months = 0, interest = 0, first = 0;
    if (bal <= 0) return { months: 0, interest: 0, firstPay: 0 };
    var A = 0, pp = 0;
    if (d.type === 'EQUAL_PAYMENT') {
      var B0 = mode === 'reduce' ? bal : d.bal;
      A = !r ? B0 / n : B0 * r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1);
    } else if (d.type === 'EQUAL_PRINCIPAL') pp = (mode === 'reduce' ? bal : d.bal) / n;
    for (var m = 1; m <= n + 600 && bal > 0.5; m++) {
      var it = bal * r, prin;
      if (d.type === 'EQUAL_PAYMENT') prin = Math.min(bal, A - it);
      else if (d.type === 'EQUAL_PRINCIPAL') prin = Math.min(bal, pp);
      else prin = m >= n ? bal : 0;   /* 만기일시 */
      if (prin < 0) prin = 0;
      interest += it; if (m === 1) first = prin + it;
      bal -= prin;
      if (extraMonthly > 0 && bal > 0) bal -= Math.min(bal, extraMonthly);
      months = m;
      if (d.type === 'BULLET' && m >= n) break;
    }
    return { months: months, interest: interest, firstPay: first };
  };
  /* 중도상환수수료 : 보통 3년 이내 상환분에 수수료율 × 남은 면제기간/36 (대출마다 다르니 직접 입력) */
  function prepayFee(d, lump) {
    if (d.inst) return 0;
    if (d.age == null) return Math.round(lump * S.feeRate / 100);
    return d.age >= 36 ? 0 : Math.round(lump * S.feeRate / 100 * (36 - d.age) / 36);
  }
  function fv(amount, monthlyAdd, annualPct, months) {
    var i = annualPct / 1200, v = amount;
    for (var k = 0; k < months; k++) v = v * (1 + i) + monthlyAdd;
    return v;
  }

  LA.set = function (k, v) { S[k] = k === 'id' ? v : (k === 'lump' || k === 'monthly' ? u.P(v) : (parseFloat(v) || 0)); App.ui.render(); };

  function verdict(eff, ret) {
    if (eff >= ret + 0.5) return ['상환 유리', 'bg-emerald-100 text-emerald-800', '대출 실효금리(' + eff.toFixed(2) + '%)가 기대 수익률(' + ret.toFixed(2) + '%)보다 높습니다. 갚는 것이 위험 없이 그만큼 버는 것과 같습니다.'];
    if (eff <= ret - 0.5) return ['투자·보유 유리', 'bg-sky-100 text-sky-800', '기대 수익률이 대출 실효금리보다 높습니다. 다만 투자 수익은 보장되지 않으니, 확실한 이자 절감과 비교해 위험을 감수할 수 있을 때만 유리합니다.'];
    return ['비슷함', 'bg-slate-100 text-slate-700', '금리와 기대 수익률 차이가 0.5%p 안쪽입니다. 숫자보다는 빚이 줄어드는 안정감, 비상자금 여유, 금리 변동 가능성으로 정하세요.'];
  }

  App.views.add({
    id: 'loan', order: 55, title: '대출 상환 판단 도우미', nav: { label: '대출 상환 판단 도우미', icon: 'fa-scale-balanced', color: 'text-red-300' },
    render: function (el) {
      var mo = App.state.month, list = debts(mo), h = C.health(mo);
      if (!list.length) {
        el.innerHTML = '<div class="bg-white p-6 rounded-xl border border-slate-200 shadow-sm text-sm text-slate-600 space-y-2"><h3 class="font-bold text-slate-800 text-base"><i class="fa-solid fa-scale-balanced text-red-500 mr-2"></i>대출 상환 판단 도우미</h3>'
          + '<p>' + mo + ' 기준 남아 있는 대출(또는 수수료가 있는 카드 할부)이 없습니다. [자산 · 부채] 화면에서 대출을 등록하면 여유자금을 갚을지, 굴릴지 비교해 드립니다.</p><button onclick="App.loans.open()" class="text-xs bg-slate-800 text-white px-3.5 py-2 rounded-lg">부채 등록</button></div>';
        return;
      }
      if (!S.id || !list.some(function (d) { return d.key === S.id; })) S.id = list[0].key;
      var d = list.filter(function (x) { return x.key === S.id; })[0], lump = Math.min(S.lump, d.bal);
      var eff = d.rate * (1 - (S.deduct || 0) / 100), ef = h.efMonths, efTarget = h.avgExp * 3, cash = C.liquidOnly(mo), spare = Math.max(0, cash - efTarget);
      var base = LA.simulate(d, 0, 0, 'shorten'), sh = LA.simulate(d, lump, 0, 'shorten'), rd = LA.simulate(d, lump, 0, 'reduce'), fee = prepayFee(d, lump);
      var saveSh = base.interest - sh.interest, saveRd = base.interest - rd.interest;
      var invGain = fv(lump, 0, S.ret, base.months) - lump;
      var v = verdict(eff, S.ret);
      var mx = S.monthly > 0 ? LA.simulate(d, 0, S.monthly, 'shorten') : null, mxInv = S.monthly > 0 ? fv(0, S.monthly, S.ret, mx.months) - S.monthly * mx.months : 0;
      var inp = function (k, label, money, step) { return '<div><label class="block font-semibold text-slate-600 mb-1 text-xs">' + label + '</label><input type="' + (money ? 'text' : 'number') + '"' + (money ? ' data-money' : ' step="' + (step || '0.1') + '"') + ' value="' + (money ? u.n0(S[k]) : S[k]) + '" onchange="App.loanAdvisor.set(\'' + k + '\', this.value)" class="' + u.IN + (money ? ' text-right font-bold' : '') + '"></div>'; };
      var warn = [];
      if (ef != null && ef < 3) warn.push('비상자금이 ' + ef.toFixed(1) + '개월치뿐입니다. 대출을 갚기 전에 생활비 3개월치(' + u.K(efTarget) + ')부터 확보하세요. 갚은 돈은 다시 꺼내 쓰기 어렵습니다.');
      if (list[0].key !== d.key && list[0].rate > d.rate + 0.5) warn.push('\'' + list[0].name + '\'(' + list[0].rate + '%)의 금리가 더 높습니다. 같은 돈이면 금리 높은 빚부터 갚는 것이 이자를 가장 많이 줄입니다.');
      if (fee > 0 && fee >= saveSh) warn.push('중도상환수수료(' + u.K(fee) + ')가 줄어드는 이자보다 큽니다. 면제 시점(보통 대출 후 3년)까지 기다리는 편이 낫습니다.');
      if (S.lump > d.bal) warn.push('입력한 여유자금이 대출 잔액보다 많아 잔액(' + u.K(d.bal) + ')만큼만 계산했습니다.');
      el.innerHTML = '<div class="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4"><div class="flex flex-wrap justify-between items-center gap-2 pb-3 border-b border-slate-100"><div><h3 class="font-bold text-slate-800 text-base"><i class="fa-solid fa-scale-balanced text-red-500 mr-2"></i>대출 상환 판단 도우미</h3>'
        + '<p class="text-xs text-slate-400 mt-0.5">여유자금을 대출에 넣을지, 굴릴지 · 어느 빚부터 갚을지 · 기간 단축과 월 상환액 감소 중 무엇이 나은지 비교합니다. (' + mo + ' 잔액 기준)</p></div></div>'
        + '<div class="overflow-x-auto"><table class="w-full text-xs"><thead><tr class="text-slate-500 bg-slate-50"><th class="p-2 text-left">갚는 순서 (금리 높은 순)</th><th class="p-2 text-right">잔액</th><th class="p-2 text-right">금리</th><th class="p-2 text-right">월 상환</th><th class="p-2 text-right">남은 기간</th><th class="p-2 text-right">남은 이자 (그대로 갚을 때)</th><th class="p-2"></th></tr></thead><tbody>'
        + list.map(function (x, i) {
          var b = LA.simulate(x, 0, 0, 'shorten');
          return '<tr class="border-t border-slate-100' + (x.key === d.key ? ' bg-amber-50' : '') + '"><td class="p-2"><b>' + (i + 1) + '.</b> ' + u.esc(x.name) + ' <span class="text-[10px] text-slate-400">' + x.kind + ' · ' + (C.DTYPE[x.type] || '') + '</span></td>'
            + '<td class="p-2 text-right">' + u.K(x.bal) + '</td><td class="p-2 text-right font-bold">' + x.rate + '%</td><td class="p-2 text-right">' + u.K(x.monthly) + '</td><td class="p-2 text-right">' + x.n + '개월</td><td class="p-2 text-right text-red-600">' + u.K(b.interest) + '</td>'
            + '<td class="p-2 text-right"><button onclick="App.loanAdvisor.set(\'id\',\'' + x.key + '\')" class="text-[11px] px-2 py-1 rounded border ' + (x.key === d.key ? 'border-amber-400 text-amber-700 font-bold' : 'border-slate-300 text-slate-600') + '">' + (x.key === d.key ? '선택됨' : '선택') + '</button></td></tr>';
        }).join('') + '</tbody></table></div>'
        + '<div class="grid grid-cols-2 lg:grid-cols-5 gap-3">' + inp('lump', '지금 넣을 여유자금 (원)', true) + inp('monthly', '매달 추가로 갚을 돈 (원)', true) + inp('ret', '굴릴 때 기대 수익률 (세후 %)') + inp('feeRate', '중도상환수수료율 (%)') + inp('deduct', '이자 소득공제 한계세율 (%, 없으면 0)', false, '1') + '</div>'
        + '<div class="text-[11px] text-slate-500 leading-relaxed">기대 수익률 예: 예금·파킹 2~3%, 채권형 3~4%, 주식형 장기 평균 5~7%(손실 가능). 주택담보대출 이자 소득공제를 받고 있다면 그 한계세율만큼 실제 금리 부담이 줄어듭니다. 수수료는 대출 시작월을 넣은 대출이면 3년 면제기간을 자동으로 반영합니다.</div>'
        + (warn.length ? '<div class="space-y-1.5">' + warn.map(function (w) { return '<div class="text-xs bg-amber-50 border border-amber-200 text-amber-900 rounded-lg px-3 py-2"><i class="fa-solid fa-triangle-exclamation mr-1"></i>' + w + '</div>'; }).join('') + '</div>' : '') + '</div>'
        + '<div class="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4"><div class="flex flex-wrap items-center gap-2"><h3 class="font-bold text-slate-800 text-sm">\'' + u.esc(d.name) + '\'에 ' + u.K(lump) + '을 넣으면</h3><span class="text-[11px] font-bold px-2 py-0.5 rounded-full ' + v[1] + '">' + v[0] + '</span></div>'
        + '<div class="text-xs text-slate-600">' + v[2] + '</div>'
        + '<div class="grid grid-cols-1 lg:grid-cols-3 gap-3">'
        + '<div class="p-4 rounded-xl border border-emerald-200 bg-emerald-50/50 space-y-1 text-xs"><div class="font-bold text-emerald-800">① 갚고 기간 단축</div><div>줄어드는 이자 <b class="text-emerald-700 text-sm">' + u.K(saveSh) + '</b></div><div>상환 기간 ' + base.months + '개월 → <b>' + sh.months + '개월</b> (' + (base.months - sh.months) + '개월 단축)</div><div>월 상환액은 그대로 (' + u.K(d.monthly) + ')</div>'
        + (fee ? '<div class="text-red-600">중도상환수수료 −' + u.K(fee) + '</div>' : '') + '<div class="pt-1 border-t border-emerald-200">순이익 <b>' + u.K(saveSh - fee) + '</b></div></div>'
        + '<div class="p-4 rounded-xl border border-sky-200 bg-sky-50/50 space-y-1 text-xs"><div class="font-bold text-sky-800">② 갚고 월 상환액 감소</div><div>줄어드는 이자 <b class="text-sky-700 text-sm">' + u.K(saveRd) + '</b></div><div>월 상환액 ' + u.K(d.monthly) + ' → <b>' + u.K(rd.firstPay) + '</b> (월 ' + u.K(d.monthly - rd.firstPay) + ' 여유)</div><div>기간은 그대로 (' + base.months + '개월)</div>'
        + (fee ? '<div class="text-red-600">중도상환수수료 −' + u.K(fee) + '</div>' : '') + '<div class="pt-1 border-t border-sky-200">순이익 <b>' + u.K(saveRd - fee) + '</b></div></div>'
        + '<div class="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-1 text-xs"><div class="font-bold text-slate-700">③ 갚지 않고 굴리기</div><div>' + base.months + '개월 동안 연 ' + S.ret + '%로 굴리면</div><div>예상 수익 <b class="text-slate-800 text-sm">' + u.K(invGain) + '</b></div><div class="text-slate-500">수익은 보장되지 않고, 이자는 계속 냅니다.</div>'
        + '<div class="pt-1 border-t border-slate-200">①과 차이 <b class="' + (invGain > saveSh - fee ? 'text-sky-700' : 'text-emerald-700') + '">' + (invGain > saveSh - fee ? '굴리기가 ' + u.K(invGain - (saveSh - fee)) + ' 많음' : '갚기가 ' + u.K(saveSh - fee - invGain) + ' 많음') + '</b></div></div></div>'
        + '<div class="text-[11px] text-slate-500">기간 단축(①)이 이자를 더 많이 줄입니다. 월 상환액 감소(②)는 매달 현금흐름이 빠듯할 때, 줄어든 상환액만큼 저축을 늘릴 자신이 있을 때 고르세요.'
        + (spare > 0 ? ' 지금 유동자산 중 비상자금 3개월치를 빼면 약 <b>' + u.K(spare) + '</b>을 쓸 수 있습니다.' : '') + '</div>'
        + (mx ? '<div class="p-4 rounded-xl border border-slate-200 text-xs space-y-1"><div class="font-bold text-slate-700">매달 ' + u.K(S.monthly) + '씩 더 갚으면</div><div>상환 기간 ' + base.months + '개월 → <b>' + mx.months + '개월</b> · 줄어드는 이자 <b class="text-emerald-700">' + u.K(base.interest - mx.interest) + '</b></div>'
          + '<div class="text-slate-500">같은 돈을 같은 기간 연 ' + S.ret + '%로 적립하면 수익 약 ' + u.K(mxInv) + ' (보장 안 됨)</div></div>' : '')
        + '<div class="text-[10px] text-slate-400">※ 매달 같은 금리를 가정한 추정입니다. 변동금리·우대금리 조건, 실제 중도상환수수료 규정은 대출 약정서를 확인하세요. 카드 할부는 원금균등으로 계산합니다.</div></div>';
    }
  });
})(window.App);

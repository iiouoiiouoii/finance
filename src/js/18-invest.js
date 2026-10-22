/* 투자 : 종목(수량·평단 / 원금·평가액) · 수익률 · CAGR · 배당 · 매매 기록 · 자산배분 */
(function (App) {
  'use strict';
  var u = App.u, C = App.calc, V = App.invest = {};
  var db = function () { return App.db; };
  var num = u.num, won = u.K;
  function pct(x, d) { return u.pct(x, d); }
  function sgn(v) { return v > 0 ? 'text-emerald-600' : (v < 0 ? 'text-red-500' : 'text-slate-600'); }
  function sgnTxt(v) { return (v > 0 ? '+' : '') + won(v); }
  function qtyTxt(q) { return (Math.round(q * 10000) / 10000).toLocaleString('ko-KR'); }
  function priceTxt(p, cur) { var s = (Math.round(p * 100) / 100).toLocaleString('ko-KR'); return cur === 'KRW' ? s + '원' : '$' + s; }
  var CLASSES = ['국내주식', '해외주식', 'ETF', '펀드', '채권', '연금', '코인', '금/원자재', '기타'];
  var CLS_COLOR = { '국내주식': 'bg-blue-500', '해외주식': 'bg-indigo-500', 'ETF': 'bg-sky-500', '펀드': 'bg-teal-500', '채권': 'bg-emerald-500', '연금': 'bg-purple-500', '코인': 'bg-amber-500', '금/원자재': 'bg-yellow-600', '기타': 'bg-slate-400' };

  /* ---------- 핵심 지표 ---------- */
  V.detail = function (inv) {
    var cur = inv.currency || 'KRW', fx = cur === 'KRW' ? 1 : (num(inv.fxRate) || 1), mode = inv.inputMode || (num(inv.qty) > 0 ? 'QTY' : 'AMOUNT');
    var qty = num(inv.qty), avg = num(inv.avgPrice), cp = num(inv.curPrice), costCur, valCur;
    if (mode === 'QTY') { costCur = qty * avg; valCur = qty * (cp > 0 ? cp : avg); }
    else { costCur = num(inv.costCur); valCur = inv.valueCur == null ? costCur : num(inv.valueCur); }
    var cost = Math.round(costCur * fx), value = Math.round(valCur * fx), dividend = Math.round(num(inv.dividend) * fx), realized = Math.round(num(inv.realized) * fx), fee = Math.round(num(inv.fee) * fx);
    var unreal = value - cost, totalPnl = unreal + dividend + realized - fee;
    var basis = Math.round(((num(inv.cumCost) > 0 && (inv.trades || []).length) ? num(inv.cumCost) : costCur) * fx);   /* 매도 후에도 성과가 남도록 누적 투입원금 기준 */
    var roi = cost > 0 ? unreal / cost : 0, totalRoi = basis > 0 ? totalPnl / basis : 0;
    var dur = null, eff = null, cagr = null, dca = num(inv.monthly) > 0;
    if (inv.startDate) {
      dur = Math.max(1, u.daysBetween(inv.startDate, u.today()));
      eff = dca ? Math.max(1, Math.round(dur / 2)) : dur;   /* 적립식은 평균 투자기간이 절반 */
      if (eff >= 60 && basis > 0 && (1 + totalRoi) > 0) cagr = Math.pow(1 + totalRoi, 365 / eff) - 1;
    }
    return {
      cur: cur, fx: fx, mode: mode, qty: qty, avg: avg, cp: cp, cost: cost, value: value, basis: basis, dividend: dividend, realized: realized, fee: fee,
      unreal: unreal, totalPnl: totalPnl, roi: roi, totalRoi: totalRoi, yoc: basis > 0 ? dividend / basis : 0, days: dur, cagr: cagr, dca: dca,
      stale: (mode === 'QTY' && inv.priceUpdatedAt) ? Math.max(0, u.daysBetween(inv.priceUpdatedAt, u.today())) : null,
      closed: mode === 'QTY' && qty <= 0 && (inv.trades || []).length > 0
    };
  };
  V.portfolio = function () {
    var list = db().investments || [], s = { cost: 0, value: 0, basis: 0, unreal: 0, dividend: 0, realized: 0, fee: 0, totalPnl: 0, fxValue: 0, byClass: {}, items: [], stale: 0 };
    list.forEach(function (inv) {
      var d = V.detail(inv);
      ['cost', 'value', 'basis', 'unreal', 'dividend', 'realized', 'fee', 'totalPnl'].forEach(function (k) { s[k] += d[k]; });
      if (d.cur !== 'KRW') s.fxValue += d.value;
      if (d.stale != null && d.stale >= 14) s.stale++;
      var c = inv.assetClass || '기타'; s.byClass[c] = (s.byClass[c] || 0) + d.value;
      s.items.push({ inv: inv, d: d });
    });
    s.roi = s.cost > 0 ? s.unreal / s.cost : 0;
    s.items.sort(function (a, b) { return b.d.value - a.d.value; });
    s.topWeight = s.value > 0 && s.items.length ? s.items[0].d.value / s.value : 0;
    s.fxWeight = s.value > 0 ? s.fxValue / s.value : 0;
    s.alloc = Object.keys(s.byClass).map(function (k) {
      var w = s.value > 0 ? s.byClass[k] / s.value : 0, tgt = 0, has = false;
      list.forEach(function (inv) { if ((inv.assetClass || '기타') === k && inv.targetWeight != null) { tgt += num(inv.targetWeight); has = true; } });
      return { cls: k, amount: s.byClass[k], w: w, target: has ? tgt / 100 : null, gap: has ? w - tgt / 100 : null };
    }).sort(function (a, b) { return b.amount - a.amount; });
    return s;
  };

  /* ---------- 목록 ---------- */
  V.listHtml = function () {
    var list = db().investments || [];
    if (!list.length) return '<div class="text-center text-slate-400 text-xs py-4">등록된 투자 자산이 없습니다.<br><span class="text-[11px]">수량·평단으로 기록하면 수익률과 연평균 수익률(CAGR)이 자동 계산됩니다.</span></div>';
    var p = V.portfolio();
    var head = '<div class="bg-slate-50 border border-slate-200 rounded-xl p-3 mb-2 space-y-2"><div class="grid grid-cols-3 gap-2 text-center">'
      + '<div><div class="text-[10px] text-slate-500">투자 원금</div><div class="text-sm font-bold text-slate-800">' + won(p.cost) + '</div></div>'
      + '<div><div class="text-[10px] text-slate-500">평가 금액</div><div class="text-sm font-bold text-emerald-700">' + won(p.value) + '</div></div>'
      + '<div><div class="text-[10px] text-slate-500">총 손익</div><div class="text-sm font-bold ' + sgn(p.totalPnl) + '">' + sgnTxt(p.totalPnl) + '</div></div></div>'
      + '<div class="flex flex-wrap justify-between gap-1 text-[11px] pt-1 border-t border-slate-200"><span class="text-slate-500">평가 수익률 <strong class="' + sgn(p.unreal) + '">' + (p.roi >= 0 ? '+' : '') + pct(p.roi, 2) + '</strong></span>'
      + '<span class="text-slate-500">배당 누계 <strong class="text-blue-600">' + won(p.dividend) + '</strong></span><span class="text-slate-500">실현 손익 <strong class="' + sgn(p.realized) + '">' + sgnTxt(p.realized) + '</strong></span></div>';
    if (p.value > 0) {
      head += '<div class="pt-1.5 border-t border-slate-200"><div class="text-[10px] text-slate-500 mb-1">자산 배분</div><div class="w-full h-2 bg-slate-200 rounded-full overflow-hidden flex">'
        + p.alloc.map(function (a) { return '<div class="h-full ' + (CLS_COLOR[a.cls] || 'bg-slate-400') + '" style="width:' + (a.w * 100).toFixed(1) + '%" title="' + u.esc(a.cls) + '"></div>'; }).join('') + '</div>'
        + '<div class="flex flex-wrap gap-x-2 gap-y-0.5 mt-1">' + p.alloc.map(function (a) {
          var gap = a.gap != null && Math.abs(a.gap) >= 0.05 ? '<span class="' + (a.gap > 0 ? 'text-red-500' : 'text-blue-500') + ' font-bold"> ' + (a.gap > 0 ? '초과' : '부족') + ' ' + pct(Math.abs(a.gap), 0) + '</span>' : '';
          return '<span class="text-[10px] text-slate-500"><span class="inline-block w-1.5 h-1.5 rounded-full ' + (CLS_COLOR[a.cls] || 'bg-slate-400') + '"></span> ' + u.esc(a.cls) + ' ' + pct(a.w, 0) + (a.target != null ? ' / 목표 ' + pct(a.target, 0) : '') + gap + '</span>';
        }).join('') + '</div></div>';
    }
    var warn = [];
    if (p.topWeight >= 0.4) warn.push('단일 종목 비중이 ' + pct(p.topWeight, 0) + '입니다. 집중 위험을 점검하세요.');
    if (p.fxWeight > 0) warn.push('외화 자산 비중 ' + pct(p.fxWeight, 0) + ' — 환율 변동이 수익률에 직접 반영됩니다.');
    if (p.stale) warn.push(p.stale + '개 종목의 현재가가 2주 이상 갱신되지 않았습니다.');
    if (warn.length) head += '<div class="text-[10px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2 leading-relaxed">' + warn.map(function (w) { return '· ' + w; }).join('<br>') + '</div>';
    head += '</div>';
    return head + p.items.map(function (x) {
      var inv = x.inv, d = x.d, w = p.value > 0 ? d.value / p.value : 0;
      return '<div class="p-3 bg-white border border-slate-200 rounded-xl space-y-1.5 mb-2"><div class="flex justify-between items-center gap-2"><div class="flex items-center gap-1.5 min-w-0 flex-wrap">'
        + '<span class="inline-block w-1.5 h-1.5 rounded-full ' + (CLS_COLOR[inv.assetClass] || 'bg-slate-400') + '"></span><span class="font-bold text-slate-800 text-xs truncate">' + u.esc(inv.name) + '</span>'
        + '<span class="text-[9px] font-semibold bg-slate-50 border border-slate-200 text-slate-500 px-1 rounded">' + u.esc(inv.assetClass || '기타') + '</span>'
        + (d.cur !== 'KRW' ? '<span class="text-[9px] font-bold bg-indigo-50 border border-indigo-200 text-indigo-600 px-1 rounded">' + u.esc(d.cur) + '</span>' : '')
        + (d.closed ? '<span class="text-[9px] font-bold bg-slate-100 border border-slate-200 text-slate-500 px-1 rounded">청산</span>' : '') + ' ' + C.badge(inv.owner || 'J', !inv.owner) + '</div>'
        + '<div class="flex items-center gap-1 shrink-0"><button onclick="App.invest.trade(' + inv.id + ')" class="text-[10px] bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-emerald-800 font-semibold px-1.5 py-0.5 rounded">거래기록</button>'
        + '<button onclick="App.invest.open(' + inv.id + ')" class="text-slate-400 hover:text-accent text-xs p-1"><i class="fa-solid fa-pen-to-square"></i></button></div></div>'
        + '<div class="flex justify-between items-end"><div class="text-[11px] text-slate-500 space-y-0.5">'
        + (d.mode === 'QTY' ? '<div>' + qtyTxt(d.qty) + '주 · 평단 ' + priceTxt(d.avg, d.cur) + ' → 현재 ' + priceTxt(d.cp || d.avg, d.cur) + '</div>' : '<div>원금 ' + won(d.cost) + (d.dca ? ' · 월 ' + won(Math.round(num(inv.monthly) * d.fx)) + ' 적립' : '') + '</div>')
        + '<div>비중 ' + pct(w, 1) + (inv.targetWeight != null ? ' / 목표 ' + inv.targetWeight + '%' : '') + (inv.broker ? ' · ' + u.esc(inv.broker) : '') + '</div></div>'
        + '<div class="text-right"><div class="text-sm font-bold text-slate-800">' + won(d.value) + '</div><div class="text-[11px] font-bold ' + sgn(d.unreal) + '">' + sgnTxt(d.unreal) + ' (' + (d.roi >= 0 ? '+' : '') + pct(d.roi, 2) + ')</div></div></div>'
        + '<div class="flex flex-wrap gap-x-3 gap-y-0.5 pt-1 border-t border-slate-100 text-[10px] text-slate-500">'
        + (d.dividend ? '<span>배당 <strong class="text-blue-600">' + won(d.dividend) + '</strong> (YoC ' + pct(d.yoc, 2) + ')</span>' : '')
        + (d.realized ? '<span>실현 <strong class="' + sgn(d.realized) + '">' + sgnTxt(d.realized) + '</strong></span>' : '')
        + (d.fee ? '<span>비용 <strong class="text-slate-600">' + won(d.fee) + '</strong></span>' : '')
        + (d.dividend || d.realized || d.fee ? '<span>총수익률 <strong class="' + sgn(d.totalPnl) + '">' + (d.totalRoi >= 0 ? '+' : '') + pct(d.totalRoi, 2) + '</strong></span>' : '')
        + (d.cagr !== null ? '<span>CAGR <strong class="' + sgn(d.cagr) + '">' + (d.cagr >= 0 ? '+' : '') + pct(d.cagr, 2) + '</strong>' + (d.dca ? ' (적립식 보정)' : '') + '</span>' : '')
        + (d.stale != null && d.stale >= 14 ? '<span class="text-amber-600">현재가 ' + d.stale + '일 전</span>' : '') + '</div></div>';
    }).join('');
  };

  /* ---------- 종목 등록 · 수정 ---------- */
  function modal() {
    var L = function (t) { return '<label class="block text-[11px] text-slate-500 mb-1">' + t + '</label>'; };
    return u.modal('investment-modal', u.modalHead('inv-modal-title', '투자 종목 등록', 'investment-modal')
      + '<form onsubmit="App.invest.save(event)" class="space-y-3"><input type="hidden" id="inv-edit-id">'
      + '<div><label class="block text-xs font-semibold text-slate-600 mb-1">명의 (계좌 소유자)</label><select id="inv-owner" class="' + u.IN + ' font-bold bg-sky-50/40"></select></div>'
      + '<div class="grid grid-cols-3 gap-2"><div class="col-span-2"><label class="block text-xs font-semibold text-slate-600 mb-1">종목명</label><input type="text" id="inv-name" required placeholder="예: 삼성전자, VOO" class="' + u.IN + ' font-bold"></div>'
      + '<div><label class="block text-xs font-semibold text-slate-600 mb-1">자산군</label><select id="inv-class" onchange="App.invest.preview()" class="' + u.IN + '">' + CLASSES.map(function (c) { return '<option>' + c + '</option>'; }).join('') + '</select></div></div>'
      + '<div class="grid grid-cols-3 gap-2"><div><label class="block text-xs font-semibold text-slate-600 mb-1">증권사/계좌</label><input type="text" id="inv-broker" placeholder="예: 키움, ISA" class="' + u.IN + '"></div>'
      + '<div><label class="block text-xs font-semibold text-slate-600 mb-1">통화</label><select id="inv-currency" onchange="App.invest.onCurrency()" class="' + u.IN + '"><option value="KRW">원화 (KRW)</option><option value="USD">달러 (USD)</option></select></div>'
      + '<div id="inv-fx-wrap" class="hidden"><label class="block text-xs font-semibold text-slate-600 mb-1">적용 환율</label><input type="number" step="0.01" id="inv-fx" placeholder="1380" oninput="App.invest.preview()" class="' + u.IN + '"></div></div>'
      + '<div class="pt-2 border-t border-slate-100"><label class="block text-xs font-bold text-slate-700 mb-1.5">기록 방식</label><select id="inv-mode" onchange="App.invest.onMode()" class="' + u.IN + ' mb-2"><option value="QTY">수량 · 평균단가 (주식/ETF/코인 — 수익률 정확)</option><option value="AMOUNT">투자원금 · 평가액 (펀드/연금 — 간편)</option></select>'
      + '<div id="inv-qty-block" class="grid grid-cols-3 gap-2"><div>' + L('보유 수량') + '<input type="number" step="any" id="inv-qty" oninput="App.invest.preview()" class="' + u.IN + ' font-bold"></div><div>' + L('평균 매수단가') + '<input type="number" step="any" id="inv-avg" oninput="App.invest.preview()" class="' + u.IN + ' font-bold"></div><div>' + L('현재가') + '<input type="number" step="any" id="inv-cur" oninput="App.invest.preview()" class="' + u.IN + ' font-bold text-emerald-700"></div></div>'
      + '<div id="inv-amount-block" class="hidden grid grid-cols-2 gap-2"><div>' + L('투자 원금 (누적 납입)') + '<input type="text" id="inv-cost" data-money oninput="App.invest.preview()" class="' + u.IN + ' font-bold"></div><div>' + L('현재 평가액') + '<input type="text" id="inv-value" data-money oninput="App.invest.preview()" class="' + u.IN + ' font-bold text-emerald-700"></div></div></div>'
      + '<div class="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100"><div>' + L('누적 배당/이자') + '<input type="text" id="inv-dividend" data-money oninput="App.invest.preview()" class="' + u.IN + '"></div><div>' + L('누적 수수료/세금') + '<input type="text" id="inv-fee" data-money oninput="App.invest.preview()" class="' + u.IN + '"></div><div>' + L('월 적립액 (적립식)') + '<input type="text" id="inv-monthly" data-money oninput="App.invest.preview()" class="' + u.IN + '"></div></div>'
      + '<div class="grid grid-cols-2 gap-2"><div>' + L('투자 시작일 (수익률 연환산용)') + '<input type="date" id="inv-start" onchange="App.invest.preview()" class="' + u.IN + '"></div><div>' + L('목표 비중 % (리밸런싱)') + '<input type="number" step="0.1" id="inv-target" oninput="App.invest.preview()" class="' + u.IN + '"></div></div>'
      + '<input type="text" id="inv-memo" placeholder="메모 (투자 근거 · 매도 원칙)" class="' + u.IN + '"><div id="inv-preview" class="text-[11px]"></div>'
      + '<div class="pt-2 flex justify-between items-center"><button type="button" id="inv-delete-btn" onclick="App.invest.remove()" class="hidden text-[11px] text-red-500 hover:text-red-700 font-semibold">이 종목 삭제</button>'
      + '<div class="flex gap-2 ml-auto"><button type="button" onclick="App.u.close(\'investment-modal\')" class="px-4 py-2 bg-slate-100 text-slate-600 rounded-lg text-xs">취소</button><button type="submit" class="px-4 py-2 bg-accent text-white rounded-lg text-xs font-semibold">저장하기</button></div></div></form>', 580);
  }
  V.onCurrency = function () { var c = u.val('inv-currency'); u.$('inv-fx-wrap').classList.toggle('hidden', c === 'KRW'); if (c !== 'KRW' && !num(u.val('inv-fx'))) u.$('inv-fx').value = 1380; V.preview(); };
  V.onMode = function () { var m = u.val('inv-mode'); u.$('inv-qty-block').classList.toggle('hidden', m !== 'QTY'); u.$('inv-amount-block').classList.toggle('hidden', m !== 'AMOUNT'); V.preview(); };
  function readForm() {
    var cur = u.val('inv-currency');
    return {
      name: u.val('inv-name').trim(), assetClass: u.val('inv-class'), broker: u.val('inv-broker').trim(), currency: cur, fxRate: cur === 'KRW' ? 1 : (num(u.val('inv-fx')) || 1),
      inputMode: u.val('inv-mode'), qty: num(u.val('inv-qty')), avgPrice: num(u.val('inv-avg')), curPrice: num(u.val('inv-cur')),
      costCur: u.P(u.val('inv-cost')), valueCur: u.P(u.val('inv-value')), dividend: u.P(u.val('inv-dividend')), fee: u.P(u.val('inv-fee')), monthly: u.P(u.val('inv-monthly')),
      startDate: u.val('inv-start') || null, targetWeight: u.val('inv-target') === '' ? null : num(u.val('inv-target')), memo: u.val('inv-memo').trim(), owner: u.val('inv-owner') || 'J'
    };
  }
  V.preview = function () {
    var box = u.$('inv-preview'); if (!box) return;
    var f = readForm(); f.realized = 0; f.trades = [];
    var d = V.detail(f);
    if (d.cost <= 0 && d.value <= 0) { box.innerHTML = ''; return; }
    box.innerHTML = '<div class="bg-slate-50 border border-slate-200 rounded-lg p-2.5 space-y-1"><div class="flex justify-between"><span class="text-slate-500">투자 원금</span><strong class="text-slate-800">' + won(d.cost) + '</strong></div>'
      + '<div class="flex justify-between"><span class="text-slate-500">평가 금액</span><strong class="text-emerald-700">' + won(d.value) + '</strong></div>'
      + '<div class="flex justify-between"><span class="text-slate-500">평가 손익</span><strong class="' + sgn(d.unreal) + '">' + sgnTxt(d.unreal) + ' (' + (d.roi >= 0 ? '+' : '') + pct(d.roi, 2) + ')</strong></div>'
      + (d.dividend || d.fee ? '<div class="flex justify-between"><span class="text-slate-500">배당 포함 총손익</span><strong class="' + sgn(d.totalPnl) + '">' + sgnTxt(d.totalPnl) + ' (' + (d.totalRoi >= 0 ? '+' : '') + pct(d.totalRoi, 2) + ')</strong></div>' : '')
      + (d.cagr !== null ? '<div class="flex justify-between"><span class="text-slate-500">연평균 수익률(CAGR' + (d.dca ? ' · 적립식 보정' : '') + ')</span><strong class="' + sgn(d.cagr) + '">' + (d.cagr >= 0 ? '+' : '') + pct(d.cagr, 2) + '</strong></div>' : '')
      + (d.cur !== 'KRW' ? '<div class="text-[10px] text-slate-400 pt-1 border-t border-slate-200">환율 ' + d.fx + '원 적용 · 환율 변동도 수익률에 포함됩니다.</div>' : '') + '</div>';
  };
  V.open = function (id) {
    modal();
    var inv = id ? u.byId(db().investments, id) : null, n = function (v) { return inv && num(v) ? v : ''; }, m = function (v) { return inv && num(v) ? u.n0(v) : ''; };
    u.$('inv-owner').innerHTML = C.ownerOptions(false);
    u.$('inv-edit-id').value = inv ? inv.id : ''; u.$('inv-modal-title').innerText = inv ? '투자 종목 수정' : '투자 종목 등록';
    u.$('inv-delete-btn').classList.toggle('hidden', !inv);
    u.$('inv-owner').value = inv && inv.owner ? inv.owner : 'J';
    u.$('inv-name').value = inv ? inv.name : ''; u.$('inv-class').value = inv && inv.assetClass ? inv.assetClass : '국내주식';
    u.$('inv-broker').value = inv && inv.broker ? inv.broker : ''; u.$('inv-currency').value = inv && inv.currency ? inv.currency : 'KRW';
    u.$('inv-fx').value = inv && inv.currency !== 'KRW' ? (inv.fxRate || 1380) : ''; u.$('inv-mode').value = inv && inv.inputMode ? inv.inputMode : 'QTY';
    u.$('inv-qty').value = n(inv && inv.qty); u.$('inv-avg').value = n(inv && inv.avgPrice); u.$('inv-cur').value = n(inv && inv.curPrice);
    u.$('inv-cost').value = m(inv && inv.costCur); u.$('inv-value').value = m(inv && inv.valueCur); u.$('inv-dividend').value = m(inv && inv.dividend);
    u.$('inv-fee').value = m(inv && inv.fee); u.$('inv-monthly').value = m(inv && inv.monthly); u.$('inv-start').value = inv && inv.startDate ? inv.startDate : '';
    u.$('inv-target').value = inv && inv.targetWeight != null ? inv.targetWeight : ''; u.$('inv-memo').value = inv && inv.memo ? inv.memo : '';
    V.onCurrency(); V.onMode(); u.open('investment-modal');
  };
  V.save = function (e) {
    e.preventDefault();
    var f = readForm();
    if (!f.name) { u.toast('종목명을 입력하세요.', 'warning'); return; }
    if (f.inputMode === 'QTY' && !(f.qty > 0 && f.avgPrice > 0)) { u.toast('보유 수량과 평균 매수단가를 입력하세요.', 'warning'); return; }
    if (f.inputMode === 'AMOUNT' && !(f.costCur > 0)) { u.toast('투자 원금을 입력하세요.', 'warning'); return; }
    var id = u.val('inv-edit-id'), inv = id ? u.byId(db().investments, id) : null;
    if (id && !inv) { u.toast('수정할 종목을 찾지 못했습니다.', 'error'); return; }
    if (!inv) { inv = { id: u.uid(), realized: 0, trades: [], cumCost: 0 }; db().investments.push(inv); }
    Object.keys(f).forEach(function (k) { inv[k] = f[k]; });
    if (f.inputMode === 'QTY' && !(f.curPrice > 0)) inv.curPrice = f.avgPrice;
    if (!Array.isArray(inv.trades)) inv.trades = [];
    if (inv.realized == null) inv.realized = 0;
    if (!num(inv.cumCost) || !inv.trades.length) inv.cumCost = f.inputMode === 'QTY' ? f.qty * f.avgPrice : f.costCur;
    if (f.inputMode === 'QTY') inv.priceUpdatedAt = u.today();
    var d = V.detail(inv); inv.cost = d.cost; inv.value = d.value;   /* cost/value 는 항상 원화 환산액 */
    App.store.save(); u.close('investment-modal'); u.toast('투자 \'' + f.name + '\' 이(가) 저장되었습니다.');
  };
  V.remove = function () {
    var inv = u.byId(db().investments, u.val('inv-edit-id')); if (!inv) return;
    u.confirm('투자 종목 삭제', '[' + inv.name + ']을 삭제합니다. 거래 이력도 함께 사라집니다.', function () {
      db().investments = db().investments.filter(function (x) { return x.id !== inv.id; });
      App.store.save(); u.close('investment-modal'); u.toast('삭제되었습니다.');
    });
  };

  /* ---------- 거래 기록 ---------- */
  function tradeModal() {
    var L = function (id, t) { return '<label' + (id ? ' id="' + id + '"' : '') + ' class="block text-[11px] text-slate-500 mb-1">' + t + '</label>'; };
    return u.modal('inv-trade-modal', u.modalHead('invt-title', '거래 기록', 'inv-trade-modal')
      + '<form onsubmit="App.invest.saveTrade(event)" class="space-y-3"><input type="hidden" id="invt-id"><div class="grid grid-cols-4 gap-1.5">'
      + [['BUY', '추가매수', 'accent-emerald-600'], ['SELL', '매도', 'accent-red-600'], ['DIV', '배당', 'accent-blue-600'], ['PRICE', '시세갱신', 'accent-slate-600']].map(function (t) {
        return '<label class="flex items-center justify-center gap-1 p-1.5 border border-slate-300 rounded-lg cursor-pointer text-[11px] hover:border-accent"><input type="radio" name="invt-type" value="' + t[0] + '" class="' + t[2] + '" onchange="App.invest.onTradeType()"> ' + t[1] + '</label>';
      }).join('') + '</div>'
      + '<div class="grid grid-cols-3 gap-2"><div>' + L(null, '거래일') + '<input type="date" id="invt-date" class="' + u.IN + '"></div><div id="invt-qty-wrap">' + L(null, '수량') + '<input type="number" step="any" id="invt-qty" oninput="App.invest.tradePreview()" class="' + u.IN + ' font-bold"></div>'
      + '<div id="invt-price-wrap">' + L('invt-price-label', '단가') + '<input type="number" step="any" id="invt-price" oninput="App.invest.tradePreview()" class="' + u.IN + ' font-bold"></div></div>'
      + '<div class="grid grid-cols-2 gap-2"><div id="invt-amount-wrap" class="hidden">' + L('invt-amount-label', '금액') + '<input type="text" id="invt-amount" data-money oninput="App.invest.tradePreview()" class="' + u.IN + ' font-bold"></div><div>' + L(null, '수수료/세금') + '<input type="text" id="invt-fee" data-money oninput="App.invest.tradePreview()" class="' + u.IN + '"></div></div>'
      + '<label class="flex items-start gap-2 text-[11px] text-slate-600 bg-slate-50 border border-slate-200 rounded-lg p-2"><input type="checkbox" id="invt-cash" class="mt-0.5"><span>현금 흐름을 가계부에 함께 기록합니다. 매수는 소비가 아닌 <strong>저축/투자</strong>로 분류되어 생활비 분석을 왜곡하지 않습니다.</span></label>'
      + '<div id="invt-preview" class="text-[11px]"></div><div class="pt-2 flex justify-end gap-2"><button type="button" onclick="App.u.close(\'inv-trade-modal\')" class="px-4 py-2 bg-slate-100 text-slate-600 rounded-lg text-xs">취소</button><button type="submit" class="px-4 py-2 bg-accent text-white rounded-lg text-xs font-semibold">기록 저장</button></div></form>'
      + '<div class="pt-3 border-t border-slate-100"><div class="text-xs font-bold text-slate-700 mb-1.5">거래 이력</div><div id="invt-history" class="space-y-1 max-h-[200px] overflow-y-auto"></div></div>', 520);
  }
  function tradeType() { var r = document.querySelector('input[name="invt-type"]:checked'); return r ? r.value : 'BUY'; }
  function curInv() { return u.byId(db().investments, u.val('invt-id')); }
  V.onTradeType = function () {
    var inv = curInv(); if (!inv) return;
    var t = tradeType(), isQty = (inv.inputMode || 'QTY') === 'QTY';
    u.$('invt-qty-wrap').classList.toggle('hidden', !(isQty && (t === 'BUY' || t === 'SELL')));
    u.$('invt-price-wrap').classList.toggle('hidden', !(isQty && t !== 'DIV'));
    u.$('invt-amount-wrap').classList.toggle('hidden', !(!isQty || t === 'DIV'));
    u.$('invt-price-label').innerText = t === 'PRICE' ? '현재가' : '단가';
    u.$('invt-amount-label').innerText = t === 'DIV' ? '배당/이자 금액' : t === 'BUY' ? '매수 금액' : t === 'SELL' ? '매도 금액' : '현재 평가액';
    u.$('invt-cash').checked = t === 'DIV' || t === 'SELL';
    V.tradePreview();
  };
  function calc(inv, t, q, price, amount, fee) {
    var isQty = (inv.inputMode || 'QTY') === 'QTY', r = { ok: false, msg: '', after: {}, cash: 0, realized: 0 };
    var qty = num(inv.qty), avg = num(inv.avgPrice), costCur = num(inv.costCur), valCur = num(inv.valueCur);
    if (t === 'BUY') {
      if (isQty) { if (!(q > 0 && price > 0)) { r.msg = '수량과 단가를 입력하세요.'; return r; } var nq = qty + q; r.after = { qty: nq, avgPrice: (qty * avg + q * price) / nq, curPrice: price }; r.cash = q * price + fee; }
      else { if (!(amount > 0)) { r.msg = '매수 금액을 입력하세요.'; return r; } r.after = { costCur: costCur + amount, valueCur: valCur + amount }; r.cash = amount + fee; }
    } else if (t === 'SELL') {
      if (isQty) {
        if (!(q > 0 && price > 0)) { r.msg = '수량과 단가를 입력하세요.'; return r; }
        if (q > qty + 1e-9) { r.msg = '보유 수량(' + qtyTxt(qty) + ')보다 많이 매도할 수 없습니다.'; return r; }
        r.realized = q * (price - avg); r.after = { qty: qty - q, avgPrice: avg, curPrice: price }; r.cash = q * price - fee;
      } else {
        if (!(amount > 0)) { r.msg = '매도 금액을 입력하세요.'; return r; }
        if (amount > valCur + 1e-9) { r.msg = '평가액보다 많이 매도할 수 없습니다.'; return r; }
        var out = costCur * (valCur > 0 ? amount / valCur : 0); r.realized = amount - out; r.after = { costCur: costCur - out, valueCur: valCur - amount }; r.cash = amount - fee;
      }
    } else if (t === 'DIV') { if (!(amount > 0)) { r.msg = '배당·이자 금액을 입력하세요.'; return r; } r.cash = amount - fee; }
    else if (t === 'PRICE') {
      if (isQty) { if (!(price > 0)) { r.msg = '현재가를 입력하세요.'; return r; } r.after = { curPrice: price }; }
      else { if (!(amount > 0)) { r.msg = '현재 평가액을 입력하세요.'; return r; } r.after = { valueCur: amount }; }
    }
    r.ok = true; return r;
  }
  V.tradePreview = function () {
    var box = u.$('invt-preview'), inv = curInv(); if (!box || !inv) return;
    var t = tradeType(), r = calc(inv, t, num(u.val('invt-qty')), num(u.val('invt-price')), u.P(u.val('invt-amount')), u.P(u.val('invt-fee')));
    if (!r.ok) { box.innerHTML = '<div class="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2">' + u.esc(r.msg) + '</div>'; return; }
    var fx = (inv.currency || 'KRW') === 'KRW' ? 1 : (num(inv.fxRate) || 1), LBL = { BUY: '매수 대금', SELL: '매도 수령액', DIV: '배당 수령액', PRICE: '' };
    box.innerHTML = '<div class="bg-slate-50 border border-slate-200 rounded-lg p-2.5 space-y-1">' + (LBL[t] ? '<div class="flex justify-between"><span class="text-slate-500">' + LBL[t] + '</span><strong class="text-slate-800">' + won(Math.round(Math.abs(r.cash) * fx)) + '</strong></div>' : '')
      + (r.realized ? '<div class="flex justify-between"><span class="text-slate-500">실현 손익</span><strong class="' + sgn(r.realized) + '">' + sgnTxt(Math.round(r.realized * fx)) + '</strong></div>' : '')
      + (r.after.qty != null ? '<div class="flex justify-between"><span class="text-slate-500">변경 후 수량 · 평단</span><strong class="text-slate-800">' + qtyTxt(r.after.qty) + '주 · ' + priceTxt(r.after.avgPrice || 0, inv.currency || 'KRW') + '</strong></div>' : '') + '</div>';
  };
  function renderHistory(inv) {
    var box = u.$('invt-history'), list = (inv.trades || []).slice().reverse(), cur = inv.currency || 'KRW';
    var LBL = { BUY: '매수', SELL: '매도', DIV: '배당', PRICE: '시세' }, CLS = { BUY: 'bg-emerald-50 text-emerald-700 border-emerald-200', SELL: 'bg-red-50 text-red-600 border-red-200', DIV: 'bg-blue-50 text-blue-700 border-blue-200', PRICE: 'bg-slate-100 text-slate-600 border-slate-200' };
    box.innerHTML = list.length ? list.map(function (tr, i) {
      var txt = tr.type === 'DIV' ? won(tr.amount || 0) : (tr.qty ? qtyTxt(tr.qty) + ' × ' + priceTxt(tr.price || 0, cur) : (tr.amount ? won(tr.amount) : priceTxt(tr.price || 0, cur)));
      return '<div class="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-2 py-1.5"><span class="px-1.5 py-0.5 rounded border text-[10px] font-bold ' + (CLS[tr.type] || '') + '">' + (LBL[tr.type] || tr.type) + '</span><span class="text-[10px] text-slate-400">' + u.esc(tr.date) + '</span>'
        + '<span class="text-[11px] text-slate-700 flex-1 text-right">' + txt + '</span>' + (tr.realized ? '<span class="text-[10px] font-bold ' + sgn(tr.realized) + '">' + sgnTxt(Math.round(tr.realized)) + '</span>' : '')
        + (i === 0 ? '<button onclick="App.invest.undo(' + inv.id + ')" class="text-[10px] text-slate-400 hover:text-red-500" title="되돌리기"><i class="fa-solid fa-rotate-left"></i></button>' : '') + '</div>';
    }).join('') : '<div class="text-center text-[11px] text-slate-400 py-3">기록된 거래가 없습니다.</div>';
  }
  V.trade = function (id) {
    var inv = u.byId(db().investments, id); if (!inv) return;
    tradeModal();
    u.$('invt-id').value = inv.id; u.$('invt-title').innerText = inv.name + ' — 거래 기록'; u.$('invt-date').value = u.today();
    ['invt-qty', 'invt-price', 'invt-amount', 'invt-fee'].forEach(function (k) { u.$(k).value = ''; });
    u.qa('input[name="invt-type"]').forEach(function (r) { r.checked = r.value === 'BUY'; });
    if ((inv.inputMode || 'QTY') === 'QTY' && num(inv.curPrice)) u.$('invt-price').value = inv.curPrice;
    V.onTradeType(); renderHistory(inv); u.open('inv-trade-modal');
  };
  V.saveTrade = function (e) {
    e.preventDefault();
    var inv = curInv(); if (!inv) return;
    var t = tradeType(), q = num(u.val('invt-qty')), price = num(u.val('invt-price')), amount = u.P(u.val('invt-amount')), fee = u.P(u.val('invt-fee')), date = u.val('invt-date') || u.today();
    var r = calc(inv, t, q, price, amount, fee);
    if (!r.ok) { u.toast(r.msg, 'warning'); return; }
    var snap = {}; ['qty', 'avgPrice', 'curPrice', 'costCur', 'valueCur', 'cost', 'value', 'dividend', 'realized', 'fee', 'cumCost', 'priceUpdatedAt'].forEach(function (k) { snap[k] = inv[k]; });
    if (inv.cumCost == null) inv.cumCost = num(inv.costCur) || num(inv.qty) * num(inv.avgPrice);
    if (t === 'BUY') inv.cumCost = num(inv.cumCost) + ((inv.inputMode || 'QTY') === 'QTY' ? q * price : amount);
    Object.keys(r.after).forEach(function (k) { inv[k] = r.after[k]; });
    if (t === 'DIV') inv.dividend = num(inv.dividend) + amount;
    inv.realized = num(inv.realized) + r.realized; inv.fee = num(inv.fee) + fee;
    if (t !== 'DIV') inv.priceUpdatedAt = date;
    if (!Array.isArray(inv.trades)) inv.trades = [];
    var d = V.detail(inv); inv.cost = d.cost; inv.value = d.value;
    var txnId = null;
    if (u.$('invt-cash').checked && t !== 'PRICE') {
      var fx = (inv.currency || 'KRW') === 'KRW' ? 1 : (num(inv.fxRate) || 1), cash = Math.round(Math.abs(r.cash) * fx);
      if (cash > 0) {
        txnId = u.uid();
        var tag = t === 'BUY' ? '[투자매수] ' : t === 'SELL' ? '[투자매도] ' : '[배당] ';
        db().transactions.push({ id: txnId, date: date, type: t === 'DIV' ? 'INCOME' : 'TRANSFER', amount: cash, memo: tag + inv.name, category: t === 'DIV' ? '금융소득' : '자산이동', subcategory: t === 'BUY' ? '투자매수' : t === 'SELL' ? '투자매도' : '배당금', payment: '계좌이체', lockCategory: true, investmentId: inv.id, owner: inv.owner || 'J' });
      }
    }
    inv.trades.push({ id: u.uid(), date: date, type: t, qty: q || null, price: price || null, amount: amount || null, fee: fee || null, realized: r.realized || 0, txnId: txnId, snap: snap });
    App.store.save(); u.close('inv-trade-modal');
    var LBL = { BUY: '추가매수', SELL: '매도', DIV: '배당', PRICE: '시세갱신' }, fx2 = (inv.currency || 'KRW') === 'KRW' ? 1 : (num(inv.fxRate) || 1);
    u.toast(inv.name + ' ' + LBL[t] + ' 기록이 반영되었습니다.' + (r.realized ? ' 실현손익 ' + sgnTxt(Math.round(r.realized * fx2)) : ''));
  };
  V.undo = function (id) {
    var inv = u.byId(db().investments, id); if (!inv || !(inv.trades || []).length) return;
    var last = inv.trades[inv.trades.length - 1];
    u.confirm('거래 기록 되돌리기', last.date + ' 거래를 취소하고 직전 상태로 복원합니다. 연동된 가계부 내역도 함께 삭제됩니다.', function () {
      Object.keys(last.snap || {}).forEach(function (k) { inv[k] = last.snap[k]; });
      if (last.txnId) db().transactions = db().transactions.filter(function (x) { return x.id !== last.txnId; });
      inv.trades.pop();
      var d = V.detail(inv); inv.cost = d.cost; inv.value = d.value;
      App.store.save(); u.close('inv-trade-modal'); u.toast('거래 기록이 되돌려졌습니다.');
    });
  };
})(window.App);

/* 자산 화면 : 순자산 요약 · 명의별 요약 · 탭(예적금·연금·보증금 / 부동산 / 투자 / 부채) · 예적금 등록 */
(function (App) {
  'use strict';
  var u = App.u, C = App.calc, A = App.assets = {};
  var db = function () { return App.db; };

  /* ---------- 예적금 · 연금 · 보증금 목록 ---------- */
  function extLine(a) {
    var t = a.subType, txt;
    if (!C.EXT[t]) return '';
    if (t === '국민연금') txt = '예상 월 수령 <b>' + u.K(a.pensionMonthly) + '</b> · ' + (a.pensionStartAge || 65) + '세 개시 · 순자산 제외';
    else if (t === '전세보증금') txt = (a.leaseEnd ? '계약 만기 <b>' + u.esc(a.leaseEnd) + '</b> · ' : '') + '비상자금(유동자산)에서 제외';
    else if (t === 'ISA') txt = '올해 납입 ' + u.K(a.annualContrib) + ' / 한도 2,000만';
    else txt = (t !== '퇴직연금' ? '올해 납입 ' + u.K(a.annualContrib) + ' · ' : '') + (a.pensionMonthly ? '예상 월 ' + u.K(a.pensionMonthly) + ' (' + (a.pensionStartAge || 65) + '세~) · ' : '') + '비상자금 제외';
    return '<div class="mt-1 pt-1.5 border-t border-slate-200/60 text-[11px] text-slate-500">' + txt + '</div>';
  }
  A.listHtml = function () {
    if (!db().assets.length) return '<div class="text-center text-slate-400 text-xs py-4">등록된 자산이 없습니다.</div>';
    return db().assets.map(function (a) {
      var d = C.depositDetail(a), badge = { '파킹': 'bg-purple-100 text-purple-800 border-purple-200', '예금': 'bg-emerald-100 text-emerald-800 border-emerald-200', '적금': 'bg-blue-100 text-blue-800 border-blue-200' }[d.subType] || (C.EXT[d.subType] ? 'bg-indigo-100 text-indigo-800 border-indigo-200' : 'bg-slate-100 text-slate-700 border-slate-200');
      var extra = '';
      if (d.subType === '예금' || d.subType === '적금') extra = '<div class="mt-1 pt-1.5 border-t border-slate-200/60 flex justify-between text-[11px]"><span class="text-slate-500">' + d.months + '개월 만기수령 (세후):</span><strong class="text-emerald-700">' + u.K(d.maturityAmount) + '</strong></div>';
      else if (d.subType === '파킹') extra = '<div class="mt-1 pt-1.5 border-t border-slate-200/60 flex justify-between text-[11px]"><span class="text-slate-500">연 세후이자 (월 약 ' + u.K(d.monthlyPostTaxInterest) + '):</span><strong class="text-purple-700">' + u.K(d.postTaxInterest) + '</strong></div>';
      return '<div class="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1 hover:border-slate-300 transition"><div class="flex justify-between items-start"><div class="flex items-center gap-1.5 flex-wrap">'
        + '<span class="text-[10px] font-bold px-1.5 py-0.5 rounded border bg-white text-slate-600">' + u.esc(d.bankName) + '</span><span class="text-[10px] font-bold px-1.5 py-0.5 rounded border ' + badge + '">' + u.esc(d.subType) + '</span>'
        + '<span class="font-bold text-slate-800 text-xs">' + u.esc(d.name) + '</span> ' + C.badge(a.owner || 'J', !a.owner) + '</div>'
        + '<div class="flex items-center gap-1"><button onclick="App.assets.open(' + a.id + ')" class="text-slate-400 hover:text-accent text-xs p-1"><i class="fa-solid fa-pen-to-square"></i></button><button onclick="App.assets.remove(' + a.id + ')" class="text-slate-300 hover:text-red-500 text-xs p-1"><i class="fa-solid fa-trash-can"></i></button></div></div>'
        + '<div class="flex justify-between items-center text-xs pt-1"><span class="text-slate-500">' + (d.subType === '적금' ? '월 납입금' : d.subType === '국민연금' ? '누적 납부액' : '현재 잔액') + ': <strong class="text-slate-800">' + u.K(d.subType === '국민연금' ? a.pensionPaid : d.amount) + '</strong></span>'
        + (C.EXT[d.subType] === 'NPS' || C.EXT[d.subType] === 'LEASE' ? '' : '<span class="text-slate-500">이율: <strong class="text-accent">' + d.rate + '%</strong></span>') + '</div>' + extra + extLine(a) + '</div>';
    }).join('');
  };

  /* ---------- 등록 · 수정 모달 ---------- */
  var BANKS = [['KB국민', 'KB국민은행'], ['신한', '신한은행'], ['하나', '하나은행'], ['우리', '우리은행'], ['NH농협', 'NH농협은행'], ['IBK기업', 'IBK기업은행'], ['카카오', '카카오뱅크'], ['토스', '토스뱅크'], ['케이', '케이뱅크'], ['새마을', '새마을금고'], ['신협', '신협'], ['우체국', '우체국'], ['기타', '기타 금융사']];
  function modal() {
    return u.modal('asset-modal', u.modalHead('asset-modal-title', '자산 등록 (예적금 · 연금 · 보증금)', 'asset-modal')
      + '<form onsubmit="App.assets.save(event)" class="space-y-3"><input type="hidden" id="asset-edit-id">'
      + '<div><label class="block text-xs font-semibold text-slate-600 mb-1">명의</label><select id="asset-owner" class="' + u.IN + ' font-bold bg-sky-50/40"></select></div>'
      + '<div class="grid grid-cols-2 gap-3"><div><label class="block text-xs font-semibold text-slate-600 mb-1">은행명 / 금융사</label><select id="asset-bank" class="' + u.IN + ' font-bold">' + BANKS.map(function (b) { return '<option value="' + b[0] + '">' + b[1] + '</option>'; }).join('') + '</select></div>'
      + '<div><label class="block text-xs font-semibold text-slate-600 mb-1">계좌 구분</label><select id="asset-subtype" onchange="App.assets.fields()" class="' + u.IN + ' font-bold bg-amber-50/60">'
      + '<option value="입출금">입출금 (보통예금)</option><option value="파킹">파킹 (파킹통장)</option><option value="예금">예금 (정기예금)</option><option value="적금">적금 (정기적금)</option>'
      + '<optgroup label="보증금"><option value="전세보증금">전세·월세 보증금 (임차)</option></optgroup>'
      + '<optgroup label="연금 · 절세계좌"><option value="국민연금">국민연금 (공적연금)</option><option value="퇴직연금">퇴직연금 (DB/DC)</option><option value="연금저축">연금저축</option><option value="IRP">IRP (개인형 퇴직연금)</option><option value="ISA">ISA</option></optgroup></select></div></div>'
      + u.field('asset-name', '계좌 / 상품 명칭', { ph: '예: 주거래 생활비 통장, 파킹통장', attrs: 'required', cls: 'font-bold' })
      + '<div class="grid grid-cols-2 gap-3"><div><label id="asset-amount-label" class="block text-xs font-semibold text-slate-600 mb-1">현재 잔액 (원)</label><input type="text" id="asset-amount" data-money inputmode="numeric" oninput="App.assets.preview()" class="' + u.IN + ' font-bold"></div>'
      + '<div id="asset-rate-wrap"><label class="block text-xs font-semibold text-slate-600 mb-1">연 이율 (%)</label><input type="number" step="0.01" id="asset-rate" placeholder="0.0" oninput="App.assets.preview()" class="' + u.IN + ' font-bold text-accent"></div></div>'
      + '<div id="asset-months-wrapper" class="hidden"><label class="block text-xs font-semibold text-slate-600 mb-1">가입 약정 기간 (개월)</label><input type="number" id="asset-months" value="12" min="1" max="120" oninput="App.assets.preview()" class="' + u.IN + ' font-bold"></div>'
      + '<div id="asset-ext" class="hidden grid grid-cols-2 gap-3">'
      + u.field('asset-pen-monthly', '예상 월 연금 (현재가치, 원)', { money: true, oninput: 'App.assets.preview()' })
      + u.field('asset-pen-age', '연금 개시 나이', { type: 'number', ph: '65', oninput: 'App.assets.preview()' })
      + u.field('asset-pen-contrib', '올해 납입액 (세액공제용, 원)', { money: true, oninput: 'App.assets.preview()' })
      + u.field('asset-lease-end', '계약 만기', { type: 'month' }) + '</div>'
      + '<div id="asset-preview-box" class="p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs"></div>'
      + '<div class="pt-2 flex justify-end gap-2"><button type="button" onclick="App.u.close(\'asset-modal\')" class="px-4 py-2 bg-slate-100 text-slate-600 rounded-lg text-xs">취소</button><button type="submit" class="px-4 py-2 bg-accent text-white rounded-lg text-xs font-semibold">저장하기</button></div></form>', 480);
  }
  A.fields = function () {
    var t = u.val('asset-subtype'), k = C.EXT[t], lab = u.$('asset-amount-label'), amt = u.$('asset-amount');
    u.$('asset-months-wrapper').classList.toggle('hidden', !(t === '적금' || t === '예금'));
    u.$('asset-ext').classList.toggle('hidden', !k);
    var show = { 'asset-pen-monthly': k === 'NPS' || k === 'PEN', 'asset-pen-age': k === 'NPS' || k === 'PEN', 'asset-pen-contrib': t === '연금저축' || t === 'IRP' || t === 'ISA', 'asset-lease-end': k === 'LEASE' };
    u.qa('#asset-ext > [data-k]').forEach(function (d) { d.style.display = show[d.dataset.k] ? '' : 'none'; });
    u.$('asset-rate-wrap').style.display = (k === 'NPS' || k === 'LEASE') ? 'none' : '';
    amt.required = k !== 'NPS';
    lab.innerText = t === '적금' ? '월 납입금 (원)' : t === '예금' ? '예치 원금 (원)' : k === 'NPS' ? '누적 납부액 (참고용 · 순자산 제외)' : k === 'LEASE' ? '보증금 (원)' : k ? '현재 적립금 / 평가액 (원)' : '현재 잔액 (원)';
    A.preview();
  };
  A.preview = function () {
    var box = u.$('asset-preview-box'); if (!box) return;
    var t = u.val('asset-subtype'), amount = u.P(u.val('asset-amount')), rate = parseFloat(u.val('asset-rate')) || 0, months = parseInt(u.val('asset-months'), 10) || 12;
    if (C.EXT[t]) {
      var pm = u.P(u.val('asset-pen-monthly')), pa = +u.val('asset-pen-age') || 65, ct = u.P(u.val('asset-pen-contrib')), msg;
      if (t === '국민연금') msg = '예상 수령: 월 <b>' + u.K(pm) + '</b> (연 ' + u.K(pm * 12) + ') · ' + pa + '세부터<br><span class="text-slate-500">팔거나 인출할 수 없는 권리라 순자산에는 넣지 않고, 은퇴 시뮬레이터의 연금 수입으로 반영합니다. 예상액은 국민연금공단 \'내 곁에 국민연금\'에서 확인할 수 있습니다.</span>';
      else if (t === '전세보증금') msg = '보증금 <b>' + u.K(amount) + '</b>은 순자산에 포함하지만, 바로 쓸 수 없는 돈이라 <b>비상자금(유동자산)과 은퇴 준비자산에서는 제외</b>합니다.';
      else if (t === 'ISA') msg = 'ISA 평가액 <b>' + u.K(amount) + '</b> · 올해 납입 ' + u.K(ct) + ' (연 2,000만 원 한도). 유동자산으로 봅니다.';
      else msg = '적립금 <b>' + u.K(amount) + '</b> · 연금 개시 전 인출이 어려워 비상자금에서는 제외하고 은퇴 준비자산에 포함합니다.'
        + (t !== '퇴직연금' ? '<br>올해 납입 ' + u.K(ct) + ' → 세액공제 대상 약 ' + u.K(Math.min(ct, t === '연금저축' ? 6e6 : 9e6)) + ' (연금저축 600만 · IRP 합산 900만 한도, 부부 각자 본인 계좌만 공제)' : '')
        + (pm ? '<br>예상 월 수령 ' + u.K(pm) + ' · ' + pa + '세부터 (참고)' : '');
      box.innerHTML = '<div class="text-[11px] leading-relaxed text-slate-700">' + msg + '</div>'; return;
    }
    if (amount <= 0) { box.innerHTML = '<span class="text-slate-400">금액과 이율을 입력하시면 세후 이자가 자동 산출됩니다.</span>'; return; }
    var d = C.depositDetail({ subType: t, amount: amount, rate: rate, months: months });
    if (t === '예금' || t === '적금') box.innerHTML = '<div class="font-bold text-emerald-800 text-xs flex justify-between"><span>' + months + '개월 만기 예상 수령액 (세후):</span><span class="text-sm">' + u.K(d.maturityAmount) + '</span></div><div class="text-[11px] text-slate-600 flex justify-between"><span>' + (t === '적금' ? '총 납입원금' : '원금') + ': ' + u.K(d.totalPrincipal) + '</span><span>세전이자: ' + u.K(d.preTaxInterest) + ' | 세금(15.4%): ' + u.K(d.tax) + '</span></div>';
    else if (rate > 0) box.innerHTML = '<div class="font-bold text-purple-800 text-xs flex justify-between"><span>연간 세후 이자 수익:</span><span class="text-sm">' + u.K(d.postTaxInterest) + '</span></div><div class="text-[11px] text-slate-600 flex justify-between"><span>월 예상 세후 이자: 약 ' + u.K(d.monthlyPostTaxInterest) + '</span><span>연 세전이자: ' + u.K(d.preTaxInterest) + ' (세금 ' + u.K(d.tax) + ')</span></div>';
    else box.innerHTML = '<span class="text-slate-600">입출금 통장 (이율 0%)</span>';
  };
  A.open = function (id) {
    modal();
    var a = id ? u.byId(db().assets, id) : null;
    u.$('asset-owner').innerHTML = C.ownerOptions(false);
    u.$('asset-modal-title').innerText = a ? '자산 수정 (예적금 · 연금 · 보증금)' : '자산 등록 (예적금 · 연금 · 보증금)';
    u.$('asset-edit-id').value = a ? a.id : '';
    u.$('asset-owner').value = a && a.owner ? a.owner : 'J';
    u.$('asset-bank').value = a ? a.bankName || 'KB국민' : 'KB국민';
    u.$('asset-subtype').value = a ? a.subType || '입출금' : '입출금';
    u.$('asset-name').value = a ? a.name || '' : '';
    u.$('asset-amount').value = a ? u.n0(a.subType === '국민연금' ? a.pensionPaid : a.amount) : '';
    u.$('asset-rate').value = a && a.rate != null ? a.rate : '';
    u.$('asset-months').value = a ? a.months || 12 : 12;
    u.setMoney('asset-pen-monthly', a && a.pensionMonthly); u.$('asset-pen-age').value = a && a.pensionStartAge ? a.pensionStartAge : '';
    u.setMoney('asset-pen-contrib', a && a.annualContrib); u.$('asset-lease-end').value = (a && a.leaseEnd) || '';
    A.fields(); u.open('asset-modal');
  };
  A.save = function (e) {
    e.preventDefault();
    var id = u.val('asset-edit-id'), a = id ? u.byId(db().assets, id) : null;
    if (!a) { a = { id: u.uid(), type: 'ASSET' }; db().assets.push(a); }
    a.owner = u.val('asset-owner') || 'J'; a.bankName = u.val('asset-bank'); a.subType = u.val('asset-subtype'); a.name = u.val('asset-name');
    a.amount = u.P(u.val('asset-amount')); a.rate = parseFloat(u.val('asset-rate')) || 0; a.months = parseInt(u.val('asset-months'), 10) || 12;
    ['pensionMonthly', 'pensionStartAge', 'annualContrib', 'leaseEnd', 'pensionPaid'].forEach(function (k) { delete a[k]; });
    if (C.EXT[a.subType]) {
      a.pensionMonthly = u.P(u.val('asset-pen-monthly')); a.pensionStartAge = parseInt(u.val('asset-pen-age'), 10) || 65;
      a.annualContrib = u.P(u.val('asset-pen-contrib')); a.leaseEnd = u.val('asset-lease-end') || null;
      if (a.subType === '국민연금') { a.pensionPaid = a.amount; a.amount = 0; a.rate = 0; }
    }
    App.store.save(); u.close('asset-modal'); u.toast(id ? '자산 정보가 수정되었습니다.' : '자산 계좌가 등록되었습니다.');
  };
  A.remove = function (id) {
    u.confirm('자산 삭제', '선택한 자산을 삭제하시겠습니까?', function () {
      db().assets = db().assets.filter(function (a) { return a.id !== Number(id); }); App.store.save(); u.toast('자산이 삭제되었습니다.');
    });
  };

  /* ---------- 화면 ---------- */
  var TABS = [['deposit', '예·적금·연금', 'fa-piggy-bank', 'assets'], ['re', '부동산', 'fa-house-chimney', 'realEstates'], ['invest', '투자', 'fa-chart-line', 'investments'], ['debt', '부채(대출)', 'fa-file-invoice-dollar', 'liabilities']];
  function curTab() { var c = null; try { c = localStorage.getItem('FC19_ASSET_TAB'); } catch (e) {} return c == null ? '0' : c; }
  A.tab = function (k) { try { localStorage.setItem('FC19_ASSET_TAB', String(k)); } catch (e) {} App.ui.render(); };
  function panel(i, title, icon, btn, body) {
    return '<div class="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-3" data-panel="' + i + '"><div class="flex justify-between items-center pb-2 border-b border-slate-100"><h4 class="font-bold text-slate-800 flex items-center gap-1.5">' + icon + ' ' + title + '</h4>' + btn + '</div>' + body + '</div>';
  }
  App.views.add({
    id: 'assets', order: 50, title: '자산 · 부동산 · 부채(대출) 현황', nav: { label: '자산 · 부동산 · 부채(대출)', icon: 'fa-building-user', color: 'text-amber-400' },
    render: function (el) {
      var mo = App.state.month, n = C.netWorth(mo), nw = C.nwByOwner(mo), cur = curTab(), single = cur !== 'all';
      var by = function (f) { return u.sum(db().assets.filter(f), function (a) { return a.amount; }); };
      var pen = by(function (a) { return a.subType === '퇴직연금' || a.subType === '연금저축' || a.subType === 'IRP'; }), lease = by(function (a) { return a.subType === '전세보증금'; });
      var nps = u.sum(db().assets.filter(function (a) { return a.subType === '국민연금'; }), function (a) { return a.pensionMonthly; });
      var cell = function (t, v, sub, cls) { return '<div class="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm"><div class="text-[11px] font-semibold text-slate-500">' + t + '</div><div class="text-base font-extrabold ' + (cls || 'text-slate-800') + '">' + v + '</div><div class="text-[10px] text-slate-400 mt-0.5">' + sub + '</div></div>'; };
      var panels = [
        panel(0, '예적금 · 연금 · 보증금', '<i class="fa-solid fa-wallet text-emerald-600"></i>', '<button onclick="App.assets.open()" class="text-xs text-accent font-semibold hover:underline">+ 등록</button>', '<div id="asset-items-list" class="asset-list space-y-2.5 text-xs">' + A.listHtml() + '</div>'),
        panel(1, '부동산 자산', '<i class="fa-solid fa-building text-amber-600"></i>', '<button onclick="App.re.open()" class="text-xs text-amber-600 font-semibold hover:underline">+ 등록</button>', '<div id="realestate-items-grid" class="asset-list space-y-2 text-xs">' + App.re.listHtml() + '</div>'),
        panel(2, '투자 평가액', '<i class="fa-solid fa-chart-line text-blue-600"></i>', '<button onclick="App.invest.open()" class="text-xs text-accent font-semibold hover:underline">+ 종목 추가</button>', '<div id="investment-items-list" class="asset-list space-y-2 text-xs">' + App.invest.listHtml() + '</div>'),
        panel(3, '대출 및 부채', '<i class="fa-solid fa-hand-holding-dollar text-red-500"></i>', '<button onclick="App.loans.open()" class="text-xs text-red-500 font-semibold hover:underline">+ 부채 등록</button>', '<div id="liability-items-list" class="asset-list space-y-2.5 text-xs">' + App.loans.listHtml() + '</div>')
      ];
      el.innerHTML = '<div class="bg-slate-900 text-white p-6 rounded-xl flex flex-wrap items-center justify-between gap-4 shadow-md"><div><div class="text-xs text-slate-400">종합 순자산 (Net Worth)</div><div id="asset-summary-networth" class="text-3xl font-extrabold mt-1">' + u.K(n.nw) + '</div></div>'
        + '<div class="flex flex-wrap gap-8 border-l border-slate-800 pl-8 text-xs"><div><div class="text-slate-400">총 자산 (부동산 포함)</div><div id="asset-summary-total" class="text-base font-bold text-slate-200 mt-0.5">' + u.K(n.assets) + '</div></div>'
        + '<div><div class="text-slate-400">부동산 (시세 · 전세금)</div><div id="asset-summary-realestate" class="text-base font-bold text-amber-300 mt-0.5">' + u.K(n.re) + '</div></div>'
        + '<div><div class="text-slate-400">총 부채 (대출 · 세입자 보증금 포함)</div><div id="asset-summary-debt" class="text-base font-bold text-red-400 mt-0.5">' + u.K(n.debt) + '</div></div></div></div>'
        + '<div class="grid grid-cols-2 lg:grid-cols-6 gap-3">' + C.OW.map(function (c) { return cell(C.badge(c) + ' 명의 순자산', u.K(nw[c].a - nw[c].d), '자산 ' + u.K(nw[c].a) + ' · 부채 ' + u.K(nw[c].d), nw[c].a - nw[c].d < 0 ? 'text-red-600' : 'text-slate-800'); }).join('')
        + cell('연금 적립금 (퇴직·연금저축·IRP)', u.K(pen), '비상자금 제외 · 은퇴자산 포함', 'text-indigo-700') + cell('국민연금 예상 (부부 합산)', '월 ' + u.K(nps), '현재가치 · 순자산 제외', 'text-indigo-700') + cell('전세·월세 보증금', u.K(lease), '순자산 포함 · 비상자금 제외', 'text-amber-700') + '</div>'
        + '<div class="flex flex-wrap gap-2">' + TABS.map(function (t, i) {
          var on = String(i) === cur;
          return '<button onclick="App.assets.tab(' + i + ')" class="px-4 py-2 rounded-lg text-xs font-semibold border ' + (on ? 'bg-accent text-white border-accent' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-100') + '"><i class="fa-solid ' + t[2] + ' mr-1.5"></i>' + t[1] + ' <span class="opacity-70">' + (db()[t[3]] || []).length + '</span></button>';
        }).join('') + '<button onclick="App.assets.tab(\'all\')" class="px-4 py-2 rounded-lg text-xs font-semibold border ' + (cur === 'all' ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-100') + '"><i class="fa-solid fa-table-columns mr-1.5"></i>4칸 모두 보기</button>'
        + '<button onclick="App.ui.go(\'loan\')" class="ml-auto px-4 py-2 rounded-lg text-xs font-semibold border border-red-200 bg-red-50 text-red-700 hover:bg-red-100"><i class="fa-solid fa-scale-balanced mr-1.5"></i>대출 상환 판단 도우미</button></div>'
        + '<div class="grid gap-5 ' + (single ? 'asset-single grid-cols-1' : 'grid-cols-1 lg:grid-cols-4') + '">' + (single ? panels[+cur] || panels[0] : panels.join('')) + '</div>';
    }
  });
})(window.App);

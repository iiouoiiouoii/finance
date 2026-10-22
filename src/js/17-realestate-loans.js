/* 부동산 · 부채(대출) : 부동산-담보대출 연동 · LTV · 대출 잔액 자동 상환(시작월+최초 대출금) */
(function (App) {
  'use strict';
  var u = App.u, C = App.calc, RE = App.re = {}, L = App.loans = {};
  var db = function () { return App.db; };
  var KINDS = ['아파트', '오피스텔', '단독/다가구', '빌라', '상가', '토지', '분양권', '기타'];
  var loanById = function (id) { return u.byId(db().liabilities, id); };
  function loanIds(re) { var ids = Array.isArray(re.loanIds) ? re.loanIds : (re.loanId ? [re.loanId] : []); return ids.filter(function (id, i, a) { return a.indexOf(id) === i && !!loanById(id); }); }
  function ownerRE(loanId) { return (db().realEstates || []).filter(function (r) { return loanIds(r).indexOf(loanId) >= 0; })[0]; }
  RE.loanIds = loanIds;

  RE.detail = function (re, mo) {
    var loans = loanIds(re).map(loanById), st = loans.map(function (l) { return C.loanState(l, mo); });
    var debt = u.sum(st, function (s) { return s.amount; }), value = u.num(re.value), acq = u.num(re.acquiredPrice);
    return {
      loans: loans, states: st, debt: debt, monthly: u.sum(st, function (s) { return s.monthly; }), interest: u.sum(st, function (s) { return s.interest; }), value: value,
      ltv: value > 0 ? debt / value : 0, equity: value - debt, gain: acq > 0 ? value - acq : null, gainRate: acq > 0 ? (value - acq) / acq : null
    };
  };
  RE.ltvInfo = function (ltv) {
    if (ltv <= 0) return { label: '무차입', cls: 'bg-emerald-100 text-emerald-800 border-emerald-200', bar: 'bg-emerald-500' };
    if (ltv < 0.4) return { label: '안정', cls: 'bg-emerald-100 text-emerald-800 border-emerald-200', bar: 'bg-emerald-500' };
    if (ltv < 0.6) return { label: '보통', cls: 'bg-blue-100 text-blue-800 border-blue-200', bar: 'bg-blue-500' };
    if (ltv < 0.7) return { label: '주의', cls: 'bg-amber-100 text-amber-800 border-amber-200', bar: 'bg-amber-500' };
    return { label: '위험', cls: 'bg-red-100 text-red-800 border-red-200', bar: 'bg-red-500' };
  };

  /* =========================================================
     부동산
     ========================================================= */
  RE.listHtml = function () {
    var list = db().realEstates || [], mo = App.state.month;
    if (!list.length) return '<div class="text-center text-slate-400 text-xs py-4">등록된 부동산이 없습니다.<br><span class="text-[11px]">담보대출이 있다면 <strong>부채를 먼저 등록</strong>한 뒤 연동하면 LTV가 자동 계산됩니다.</span></div>';
    return list.map(function (re) {
      var d = RE.detail(re, mo), info = RE.ltvInfo(d.ltv);
      var loans = d.loans.length ? d.loans.map(function (l, i) {
        return '<div class="flex items-center justify-between gap-1 bg-white border border-slate-200 rounded px-1.5 py-1"><span class="text-[10px] font-semibold text-slate-700 truncate flex-1">' + u.esc(l.name) + '</span>'
          + '<span class="text-[10px] text-red-500 font-bold">' + u.K(d.states[i].amount) + '</span><span class="text-[9px] text-slate-400">' + (C.DTYPE[l.debtType] || '') + ' ' + (l.rate || 0) + '%</span>'
          + '<button onclick="App.re.unlink(' + re.id + ',' + l.id + ')" class="text-slate-300 hover:text-red-500 text-[10px]" title="연동 해제"><i class="fa-solid fa-link-slash"></i></button></div>';
      }).join('') : '<div class="text-[10px] text-slate-400 bg-white border border-dashed border-slate-200 rounded px-1.5 py-1 text-center">연동된 담보대출 없음</div>';
      return '<div class="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1.5"><div class="flex justify-between items-center"><span class="font-bold text-slate-800 text-xs flex items-center gap-1 truncate"><i class="fa-solid fa-house-chimney text-amber-600"></i> ' + u.esc(re.name)
        + ' <span class="text-[9px] font-semibold bg-white border border-slate-200 text-slate-500 px-1 rounded">' + u.esc(re.kind || '기타') + '</span> ' + C.badge(re.owner || 'J', !re.owner) + '</span>'
        + '<div class="flex items-center gap-1"><button onclick="App.re.open(' + re.id + ')" class="text-slate-400 hover:text-accent text-xs"><i class="fa-solid fa-pen-to-square"></i></button><button onclick="App.re.remove(' + re.id + ')" class="text-slate-300 hover:text-red-500 text-xs"><i class="fa-solid fa-trash-can"></i></button></div></div>'
        + '<div class="text-[11px] text-slate-500 flex justify-between"><span>평가 시세</span><strong class="text-amber-700">' + u.K(d.value) + '</strong></div>'
        + (d.gain !== null ? '<div class="text-[11px] text-slate-500 flex justify-between"><span>취득 대비</span><strong class="' + (d.gain >= 0 ? 'text-emerald-700' : 'text-red-500') + '">' + (d.gain >= 0 ? '+' : '') + u.K(d.gain) + ' (' + (d.gainRate >= 0 ? '+' : '') + u.pct(d.gainRate) + ')</strong></div>' : '')
        + '<div class="space-y-1 pt-1">' + loans + '</div>'
        + '<div class="flex items-center justify-between pt-1"><span class="text-[11px] text-slate-500">LTV <strong class="text-slate-800">' + u.pct(d.ltv) + '</strong></span><span class="px-1.5 py-0.5 rounded border text-[10px] font-bold ' + info.cls + '">' + info.label + '</span></div>'
        + '<div class="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden"><div class="h-full ' + info.bar + '" style="width:' + Math.min(100, Math.round(d.ltv * 100)) + '%"></div></div>'
        + (d.monthly > 0 ? '<div class="text-[11px] text-slate-500 flex justify-between"><span>월 상환액(이자 ' + u.K(d.interest) + ')</span><strong class="text-red-500">' + u.K(d.monthly) + '</strong></div>' : '')
        + '<div class="text-[11px] text-slate-500 pt-1 border-t border-slate-200/80 flex justify-between"><span>순 자본금</span><strong class="text-emerald-700">' + u.K(d.equity) + '</strong></div></div>';
    }).join('');
  };

  function reModal() {
    return u.modal('realestate-modal', u.modalHead('re-modal-title', '부동산 자산 등록', 'realestate-modal')
      + '<form onsubmit="App.re.save(event)" class="space-y-3"><input type="hidden" id="re-edit-id">'
      + '<div><label class="block text-xs font-semibold text-slate-600 mb-1">명의 (공동명의는 공동)</label><select id="re-owner" class="' + u.IN + ' font-bold bg-sky-50/40"></select></div>'
      + '<div class="grid grid-cols-3 gap-2"><div class="col-span-2">' + u.field('re-name', '부동산 명칭', { ph: '예: 마포 래미안', attrs: 'required', cls: 'font-bold' }).replace('<div data-k', '<div data-x') + '</div>'
      + '<div><label class="block text-xs font-semibold text-slate-600 mb-1">유형</label><select id="re-kind" class="' + u.IN + '">' + KINDS.map(function (k) { return '<option>' + k + '</option>'; }).join('') + '</select></div></div>'
      + '<div class="grid grid-cols-3 gap-2">' + u.field('re-value', '현재 시세 (원)', { money: true, oninput: 'App.re.preview()', attrs: 'required' }) + u.field('re-acq-price', '취득가 (선택)', { money: true, oninput: 'App.re.preview()' }) + u.field('re-acq-date', '취득일 (선택)', { type: 'date' }) + '</div>'
      + '<div class="pt-2 border-t border-slate-100"><div class="flex items-center justify-between mb-1.5"><label class="text-xs font-bold text-slate-700">담보 대출 연동</label>'
      + '<button type="button" onclick="App.re.newDebtFirst()" class="text-[10px] bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 font-bold px-2 py-1 rounded"><i class="fa-solid fa-plus"></i> 부채 먼저 등록</button></div>'
      + '<div class="flex gap-1.5 mb-2">' + [['NONE', '대출 없음'], ['EXIST', '등록된 부채 연동'], ['NEW', '새 대출 입력']].map(function (m) {
        return '<label class="flex-1 flex items-center justify-center gap-1 p-1.5 border border-slate-300 rounded-lg cursor-pointer text-[11px] bg-white hover:border-amber-400"><input type="radio" name="re-link-mode" value="' + m[0] + '" class="accent-amber-600" onchange="App.re.mode(\'' + m[0] + '\')"> ' + m[1] + '</label>';
      }).join('') + '</div>'
      + '<div id="re-exist-block" class="hidden bg-slate-50 border border-slate-200 rounded-lg p-2 space-y-1.5"><div class="text-[10px] text-slate-500">연동할 부채를 선택하세요. 여러 건(주담대 + 추가 대출) 선택이 가능합니다.</div><div id="re-loan-picker" class="space-y-1 max-h-[160px] overflow-y-auto"></div></div>'
      + '<div id="re-loan-fields" class="hidden bg-slate-50 border border-slate-200 rounded-lg p-2 space-y-2"><input type="text" id="re-loan-name" placeholder="대출 명칭 (미입력 시 \'OO 담보대출\')" class="' + u.IN + '">'
      + '<div class="grid grid-cols-2 gap-2"><input type="text" id="re-loan-amount" data-money inputmode="numeric" placeholder="대출 잔액" oninput="App.re.preview()" class="' + u.IN + ' font-bold text-red-500"><input type="number" step="0.01" id="re-loan-rate" placeholder="연 이율 %" oninput="App.re.preview()" class="' + u.IN + '"></div>'
      + '<div class="grid grid-cols-2 gap-2"><select id="re-loan-type" class="' + u.IN + '"><option value="EQUAL_PAYMENT">원리금 균등상환</option><option value="EQUAL_PRINCIPAL">원금 균등상환</option><option value="BULLET">만기 일시상환</option></select>'
      + '<input type="number" id="re-loan-months" placeholder="잔여 개월 (예: 240)" class="' + u.IN + '"></div></div></div>'
      + '<div id="re-preview" class="text-[11px]"></div>'
      + '<div class="pt-2 flex justify-end gap-2"><button type="button" onclick="App.u.close(\'realestate-modal\')" class="px-4 py-2 bg-slate-100 text-slate-600 rounded-lg text-xs">취소</button><button type="submit" class="px-4 py-2 bg-accent text-white rounded-lg text-xs font-semibold">저장하기</button></div></form>', 560);
  }
  function curMode() { var r = document.querySelector('input[name="re-link-mode"]:checked'); return r ? r.value : 'NONE'; }
  function selectedIds() { return u.qa('.re-loan-cb').filter(function (c) { return c.checked; }).map(function (c) { return +c.value; }); }
  RE.mode = function (m) {
    u.qa('input[name="re-link-mode"]').forEach(function (r) { r.checked = r.value === m; });
    u.$('re-exist-block').classList.toggle('hidden', m !== 'EXIST'); u.$('re-loan-fields').classList.toggle('hidden', m !== 'NEW');
    if (m === 'EXIST') renderPicker();
    RE.preview();
  };
  function renderPicker(preset) {
    var box = u.$('re-loan-picker'); if (!box) return;
    var editing = u.val('re-edit-id') ? +u.val('re-edit-id') : null, sel = preset || selectedIds(), list = db().liabilities || [];
    if (!list.length) { box.innerHTML = '<div class="text-center text-[11px] text-slate-500 py-3 bg-white border border-dashed border-slate-300 rounded-lg">등록된 부채가 없습니다.<br>위 <strong>부채 먼저 등록</strong> 버튼으로 대출을 만든 뒤 연동하세요.</div>'; return; }
    box.innerHTML = list.map(function (l) {
      var own = ownerRE(l.id), taken = own && own.id !== editing, checked = sel.indexOf(l.id) >= 0;
      return '<label class="flex items-center gap-2 p-1.5 bg-white border rounded-lg ' + (taken ? 'border-slate-200 opacity-60' : 'border-slate-300 cursor-pointer hover:border-amber-400') + '">'
        + '<input type="checkbox" class="re-loan-cb w-3.5 h-3.5 accent-amber-600" value="' + l.id + '"' + (checked ? ' checked' : '') + (taken ? ' disabled' : '') + ' onchange="App.re.preview()">'
        + '<span class="font-bold text-slate-800 text-[11px] truncate flex-1">' + u.esc(l.name) + '</span><span class="text-[10px] text-red-500 font-bold">' + u.K(C.loanBalance(l, App.state.month)) + '</span><span class="text-[10px] text-slate-500">' + (l.rate || 0) + '%</span>'
        + (taken ? '<span class="text-[9px] bg-slate-100 border border-slate-200 text-slate-500 px-1 rounded">' + u.esc(own.name) + ' 연동</span>' : '') + '</label>';
    }).join('');
  }
  RE.preview = function () {
    var box = u.$('re-preview'); if (!box) return;
    var value = u.P(u.val('re-value')), acq = u.P(u.val('re-acq-price')), m = curMode(), debt = 0, monthly = 0;
    if (m === 'EXIST') selectedIds().forEach(function (id) { var l = loanById(id); if (l) { var s = C.loanState(l); debt += s.amount; monthly += s.monthly; } });
    else if (m === 'NEW') { debt = u.P(u.val('re-loan-amount')); monthly = debt > 0 ? C.loanPayment(debt, parseFloat(u.val('re-loan-rate')) || 0, u.val('re-loan-type'), parseInt(u.val('re-loan-months'), 10) || 240) : 0; }
    if (value <= 0) { box.innerHTML = ''; return; }
    var ltv = debt / value, info = RE.ltvInfo(ltv), eq = value - debt, lev = eq > 0 ? value / eq : null, gain = acq > 0 ? value - acq : null;
    box.innerHTML = '<div class="bg-slate-50 border border-slate-200 rounded-lg p-2.5 space-y-1"><div class="flex justify-between"><span class="text-slate-500">순자산(시세-부채)</span><strong class="text-emerald-700">' + u.K(eq) + '</strong></div>'
      + '<div class="flex justify-between items-center"><span class="text-slate-500">LTV</span><span class="flex items-center gap-1"><strong class="text-slate-800">' + u.pct(ltv) + '</strong><span class="px-1.5 py-0.5 rounded border text-[10px] font-bold ' + info.cls + '">' + info.label + '</span></span></div>'
      + '<div class="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden"><div class="h-full ' + info.bar + '" style="width:' + Math.min(100, Math.round(ltv * 100)) + '%"></div></div>'
      + (monthly > 0 ? '<div class="flex justify-between"><span class="text-slate-500">월 상환액(추정)</span><strong class="text-red-500">' + u.K(monthly) + '</strong></div>' : '')
      + (lev ? '<div class="flex justify-between"><span class="text-slate-500">레버리지</span><strong class="text-slate-700">' + lev.toFixed(2) + '배</strong></div>' : '')
      + (gain !== null ? '<div class="flex justify-between"><span class="text-slate-500">취득 대비 평가차익</span><strong class="' + (gain >= 0 ? 'text-emerald-700' : 'text-red-500') + '">' + (gain >= 0 ? '+' : '') + u.K(gain) + '</strong></div>' : '')
      + (ltv >= 0.7 ? '<div class="text-[10px] text-red-600 pt-1 border-t border-slate-200">LTV 70% 이상은 시세 하락 시 담보 부족 위험이 큽니다.</div>' : '') + '</div>';
  };
  var draft = null, debtReturn = false;
  RE.newDebtFirst = function () {
    draft = { editId: u.val('re-edit-id'), name: u.val('re-name'), kind: u.val('re-kind'), value: u.val('re-value'), acqPrice: u.val('re-acq-price'), acqDate: u.val('re-acq-date'), owner: u.val('re-owner'), sel: selectedIds() };
    debtReturn = true; u.close('realestate-modal'); L.open(null);
    u.toast('부채를 먼저 등록하면 부동산 화면으로 돌아가 자동 연동됩니다.');
  };
  RE.open = function (id, presetLoanId) {
    reModal();
    var d = draft; draft = null;
    var re = id ? u.byId(db().realEstates, id) : (d && d.editId ? u.byId(db().realEstates, d.editId) : null);
    u.$('re-owner').innerHTML = C.ownerOptions(false);
    u.$('re-edit-id').value = re ? re.id : '';
    u.$('re-modal-title').innerText = re ? '부동산 자산 수정' : '부동산 자산 등록';
    u.$('re-owner').value = re && re.owner ? re.owner : (d && d.owner) || 'J';
    u.$('re-name').value = re ? re.name : (d ? d.name : '');
    u.$('re-kind').value = re && re.kind ? re.kind : (d && d.kind) || '아파트';
    u.$('re-value').value = re ? u.n0(re.value) : (d ? d.value : '');
    u.$('re-acq-price').value = re && re.acquiredPrice ? u.n0(re.acquiredPrice) : (d ? d.acqPrice : '');
    u.$('re-acq-date').value = re && re.acquiredDate ? re.acquiredDate : (d ? d.acqDate : '');
    ['re-loan-name', 're-loan-amount', 're-loan-rate', 're-loan-months'].forEach(function (k) { u.$(k).value = ''; });
    var sel = re ? loanIds(re) : (d ? d.sel : []);
    if (presetLoanId) sel = sel.concat([presetLoanId]);
    sel = sel.filter(function (x, i, a) { return a.indexOf(x) === i; });
    RE.mode(sel.length ? 'EXIST' : 'NONE'); if (sel.length) renderPicker(sel);
    RE.preview(); u.open('realestate-modal');
  };
  RE.save = function (e) {
    e.preventDefault();
    var editId = u.val('re-edit-id') ? +u.val('re-edit-id') : null, name = u.val('re-name').trim(), value = u.P(u.val('re-value'));
    if (!name) { u.toast('부동산 명칭을 입력하세요.', 'warning'); return; }
    if (!(value > 0)) { u.toast('현재 시세를 입력하세요.', 'warning'); return; }
    var mode = curMode(), ids = [];
    if (mode === 'EXIST') ids = selectedIds();
    else if (mode === 'NEW') {
      var amt = u.P(u.val('re-loan-amount'));
      if (amt > 0) {
        var nid = u.uid();
        db().liabilities.push({ id: nid, type: 'LIABILITY', name: u.val('re-loan-name').trim() || name + ' 담보대출', amount: amt, rate: parseFloat(u.val('re-loan-rate')) || 0, debtType: u.val('re-loan-type') || 'EQUAL_PAYMENT', months: parseInt(u.val('re-loan-months'), 10) || 240, createdFrom: 'REALESTATE', owner: u.val('re-owner') || 'J' });
        ids = [nid];
      }
    }
    var re;
    if (editId) {
      re = u.byId(db().realEstates, editId); if (!re) { u.toast('수정할 부동산을 찾지 못했습니다.', 'error'); return; }
      loanIds(re).forEach(function (id) { if (ids.indexOf(id) >= 0) return; var l = loanById(id); if (l && l.createdFrom === 'REALESTATE') db().liabilities = db().liabilities.filter(function (x) { return x.id !== id; }); });
      if (mode === 'NEW' && ids.length) ids = loanIds(re).concat(ids);
    } else { re = { id: u.uid() }; db().realEstates.push(re); }
    re.name = name; re.kind = u.val('re-kind'); re.value = value; re.owner = u.val('re-owner') || 'J';
    re.acquiredPrice = u.P(u.val('re-acq-price')) || null; re.acquiredDate = u.val('re-acq-date') || null;
    re.loanIds = ids.filter(function (id, i, a) { return a.indexOf(id) === i && !!loanById(id); }); re.loanId = re.loanIds[0] || null;
    App.store.syncLoanRefs(); App.store.save(); u.close('realestate-modal');
    u.toast('부동산 \'' + name + '\' 이(가) 저장되었습니다. (연동 부채 ' + re.loanIds.length + '건)');
  };
  RE.unlink = function (reId, loanId) {
    var re = u.byId(db().realEstates, reId); if (!re) return;
    var l = loanById(loanId), own = l && l.createdFrom === 'REALESTATE';
    u.confirm('담보 대출 연동 해제', '[' + (l ? l.name : '') + '] 연동을 해제합니다.\n' + (own ? '이 화면에서 만든 대출이므로 부채 목록에서도 삭제됩니다.' : '부채 목록에는 그대로 남고 연동만 끊어집니다.'), function () {
      re.loanIds = loanIds(re).filter(function (id) { return id !== loanId; }); re.loanId = re.loanIds[0] || null;
      if (own) db().liabilities = db().liabilities.filter(function (x) { return x.id !== loanId; });
      App.store.syncLoanRefs(); App.store.save(); u.toast('연동이 해제되었습니다.');
    });
  };
  RE.remove = function (id) {
    var re = u.byId(db().realEstates, id); if (!re) return;
    var loans = loanIds(re).map(loanById), own = loans.filter(function (l) { return l.createdFrom === 'REALESTATE'; }), kept = loans.length - own.length;
    var msg = '\'' + re.name + '\'을 삭제합니다.\n' + (own.length ? '이 화면에서 만든 대출 ' + own.length + '건도 함께 삭제됩니다.\n' : '') + (kept ? '따로 등록하신 부채 ' + kept + '건은 삭제되지 않고 연동만 해제됩니다.' : '');
    u.confirm('부동산 자산 삭제', msg, function () {
      own.forEach(function (l) { db().liabilities = db().liabilities.filter(function (x) { return x.id !== l.id; }); });
      db().realEstates = db().realEstates.filter(function (r) { return r.id !== re.id; });
      App.store.syncLoanRefs(); App.store.save(); u.toast('부동산 자산이 삭제되었습니다.' + (kept ? ' 부채 ' + kept + '건은 유지됩니다.' : ''));
    });
  };

  /* =========================================================
     부채 (대출)
     ========================================================= */
  L.listHtml = function () {
    var list = db().liabilities || [], mo = App.state.month;
    if (!list.length) return '<div class="text-center text-slate-400 text-xs py-4">등록된 대출/부채가 없습니다.</div>';
    var st = list.map(function (l) { return C.loanState(l, mo); });
    return '<div class="grid grid-cols-2 gap-2 mb-2"><div class="bg-slate-50 border border-slate-200 rounded-lg p-2 text-center"><div class="text-[10px] text-slate-500">부채 총액</div><div class="text-sm font-bold text-red-500">' + u.K(u.sum(st, function (s) { return s.amount; })) + '</div></div>'
      + '<div class="bg-slate-50 border border-slate-200 rounded-lg p-2 text-center"><div class="text-[10px] text-slate-500">월 상환 합계</div><div class="text-sm font-bold text-slate-800">' + u.K(u.sum(st, function (s) { return s.monthly; })) + '</div></div></div>'
      + list.map(function (l, i) {
        var s = st[i], own = ownerRE(l.id), sch = C.hasSchedule(l) ? C.loanSchedule(l, mo) : null;
        return '<div class="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1.5 mb-2"><div class="flex justify-between items-center"><span class="font-bold text-slate-800 text-xs truncate flex items-center gap-1">' + u.esc(l.name) + ' ' + C.badge(l.owner || 'J', !l.owner)
          + (own ? '<span class="text-[9px] font-semibold bg-amber-50 border border-amber-200 text-amber-700 px-1 rounded"><i class="fa-solid fa-link"></i> ' + u.esc(own.name) + '</span>' : '') + '</span>'
          + '<div class="flex items-center gap-1"><button onclick="App.loans.open(' + l.id + ')" class="text-slate-400 hover:text-accent text-xs"><i class="fa-solid fa-pen-to-square"></i></button><button onclick="App.loans.remove(' + l.id + ')" class="text-slate-300 hover:text-red-500 text-xs"><i class="fa-solid fa-xmark"></i></button></div></div>'
          + '<div class="flex justify-between text-[11px] text-slate-500"><span>대출 잔액: <strong class="text-red-500">' + u.K(s.amount) + '</strong></span><span>' + (C.DTYPE[l.debtType] || '') + ' · <strong class="text-slate-700">' + (l.rate || 0) + '%</strong></span></div>'
          + '<div class="flex justify-between items-center pt-1 border-t border-slate-200/60"><span class="text-[11px] text-slate-600">월 상환액: <strong class="text-slate-800">' + u.K(s.monthly) + '</strong><span class="text-[10px] text-slate-400"> (잔여 ' + (s.months || 0) + '개월)</span></span>'
          + '<button onclick="App.loans.toFixed(' + l.id + ')" class="text-[10px] bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 font-semibold px-1.5 py-0.5 rounded">+ 고정비</button></div>'
          + (sch ? '<div class="text-[10px] text-slate-500 pt-1">' + (sch.notYet ? u.esc(l.startMonth) + ' 대출 시작 예정' : '시작 ' + u.esc(l.startMonth) + ' · 최초 ' + u.K(l.principal) + ' · ' + sch.paid + '/' + sch.total + '회 상환 (' + mo + ' 기준)') + '</div>' : '') + '</div>';
      }).join('');
  };
  function debtModal() {
    return u.modal('liability-modal', u.modalHead('debt-modal-title', '부채 및 대출 등록', 'liability-modal')
      + '<form onsubmit="App.loans.save(event)" class="space-y-3"><input type="hidden" id="debt-edit-id">'
      + '<div><label class="block text-xs font-semibold text-slate-600 mb-1">명의 (차주)</label><select id="debt-owner" class="' + u.IN + ' font-bold bg-sky-50/40"></select></div>'
      + u.field('debt-name', '대출 명칭', { ph: '예: 신용대출, 마이너스 통장', attrs: 'required', cls: 'font-bold' })
      + '<div class="grid grid-cols-2 gap-3"><div><label id="debt-amount-label" class="block text-xs font-semibold text-slate-600 mb-1">현재 대출 잔액 (원)</label><input type="text" id="debt-amount" data-money inputmode="numeric" placeholder="30,000,000" class="' + u.IN + ' font-bold text-red-500"></div>'
      + u.field('debt-rate', '연 대출 이율 (%)', { type: 'number', ph: '4.5', attrs: 'step="0.01" required', oninput: 'App.loans.preview()' }) + '</div>'
      + '<div class="grid grid-cols-2 gap-3"><div><label class="block text-xs font-semibold text-slate-600 mb-1">상환 방식</label><select id="debt-type" onchange="App.loans.preview()" class="' + u.IN + '"><option value="EQUAL_PAYMENT">원리금 균등상환</option><option value="EQUAL_PRINCIPAL">원금 균등상환</option><option value="BULLET">만기 일시상환 (이자만)</option></select></div>'
      + '<div><label id="debt-months-label" class="block text-xs font-semibold text-slate-600 mb-1">잔여 상환 기간 (개월)</label><input type="number" id="debt-months" required placeholder="36" oninput="App.loans.preview()" class="' + u.IN + '"></div></div>'
      + '<div class="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-2"><div class="text-[11px] font-semibold text-slate-600"><i class="fa-solid fa-calendar-check text-accent mr-1"></i>잔액 자동 상환 (선택)</div>'
      + '<div class="grid grid-cols-2 gap-3">' + u.field('debt-start', '대출 시작월', { type: 'month', on: 'App.loans.preview()' }) + u.field('debt-principal', '최초 대출금 (원)', { money: true, oninput: 'App.loans.preview()', ph: '300,000,000' }) + '</div>'
      + '<div id="debt-preview" class="text-[11px] text-slate-500"></div></div>'
      + '<div class="pt-3 flex justify-end gap-2"><button type="button" onclick="App.u.close(\'liability-modal\')" class="px-4 py-2 bg-slate-100 text-slate-600 rounded-lg text-xs">취소</button><button type="submit" class="px-4 py-2 bg-accent text-white rounded-lg text-xs font-semibold">저장하기</button></div></form>', 460);
  }
  function draftLoan() { return { startMonth: u.val('debt-start'), principal: u.P(u.val('debt-principal')), months: parseInt(u.val('debt-months'), 10) || 0, rate: parseFloat(u.val('debt-rate')) || 0, debtType: u.val('debt-type') || 'EQUAL_PAYMENT' }; }
  L.preview = function () {
    var l = draftLoan(), box = u.$('debt-preview'); if (!box) return;
    var on = C.hasSchedule(l);
    u.$('debt-amount-label').textContent = on ? '현재 대출 잔액 (자동 계산)' : '현재 대출 잔액 (원)';
    u.$('debt-months-label').textContent = on ? '전체 대출 기간 (개월)' : '잔여 상환 기간 (개월)';
    u.$('debt-amount').readOnly = on;
    if (!on) { box.innerHTML = '두 값을 넣으면 상환 방식에 따라 매달 잔액과 월 상환액이 자동으로 줄어듭니다. 이때 기간은 <b>전체 대출 기간</b>으로 입력하세요.'; return; }
    var now = C.loanState(l, u.nowM()), sel = C.loanState(l, App.state.month), sch = C.loanSchedule(l, u.nowM());
    u.$('debt-amount').value = u.n0(now.amount);
    box.innerHTML = '<b>' + u.nowM() + '</b> 기준 잔액 <b class="text-red-500">' + u.K(now.amount) + '</b> · ' + sch.paid + '/' + sch.total + '회 상환 · 월 상환 ' + u.K(now.monthly)
      + (App.state.month !== u.nowM() ? '<br>보고 있는 달(' + App.state.month + ') 기준 잔액 ' + u.K(sel.amount) + ' · 월 상환 ' + u.K(sel.monthly) : '');
  };
  L.open = function (id) {
    debtModal();
    var l = id ? loanById(id) : null;
    u.$('debt-owner').innerHTML = C.ownerOptions(false);
    u.$('debt-edit-id').value = l ? l.id : '';
    u.$('debt-modal-title').innerText = l ? '부채 / 대출 수정' : '부채 및 대출 등록';
    u.$('debt-owner').value = l && l.owner ? l.owner : 'J';
    u.$('debt-name').value = l ? l.name : ''; u.$('debt-amount').value = l ? u.n0(l.amount) : '';
    u.$('debt-rate').value = l ? (l.rate || 0) : ''; u.$('debt-type').value = l ? (l.debtType || 'EQUAL_PAYMENT') : 'EQUAL_PAYMENT';
    u.$('debt-months').value = l ? (l.months || 120) : '';
    u.$('debt-start').value = l && l.startMonth ? l.startMonth : ''; u.setMoney('debt-principal', l && +l.principal > 0 ? l.principal : 0);
    L.preview(); u.open('liability-modal');
  };
  L.save = function (e) {
    e.preventDefault();
    var editId = u.val('debt-edit-id') ? +u.val('debt-edit-id') : null, name = u.val('debt-name').trim();
    if (!name) { u.toast('대출 명칭을 입력하세요.', 'warning'); return; }
    var l = editId ? loanById(editId) : null;
    if (editId && !l) { u.toast('수정할 부채를 찾지 못했습니다.', 'error'); return; }
    if (!l) { l = { id: u.uid(), type: 'LIABILITY', createdFrom: 'MANUAL' }; db().liabilities.push(l); }
    l.owner = u.val('debt-owner') || 'J'; l.name = name; l.amount = u.P(u.val('debt-amount'));
    l.rate = parseFloat(u.val('debt-rate')) || 0; l.debtType = u.val('debt-type') || 'EQUAL_PAYMENT'; l.months = parseInt(u.val('debt-months'), 10) || 120;
    var d = draftLoan();
    if (d.startMonth && d.principal) { l.startMonth = d.startMonth; l.principal = d.principal; if (C.hasSchedule(l)) l.amount = C.loanSchedule(l, u.nowM()).amount; }
    else { delete l.startMonth; delete l.principal; }
    if (!l.createdFrom) l.createdFrom = 'MANUAL';
    App.store.syncLoanRefs(); App.store.save(); u.close('liability-modal'); u.toast('부채 \'' + name + '\' 이(가) 저장되었습니다.');
    if (debtReturn) { debtReturn = false; var nid = l.id; setTimeout(function () { RE.open(null, nid); }, 60); }
  };
  L.remove = function (id) {
    var l = loanById(id); if (!l) return;
    var own = ownerRE(l.id);
    u.confirm('부채 삭제', own ? '[' + l.name + ']은 부동산 \'' + own.name + '\'에 연동되어 있습니다. 삭제하면 연동도 함께 해제됩니다.' : '선택한 대출/부채를 삭제하시겠습니까?', function () {
      db().liabilities = db().liabilities.filter(function (x) { return x.id !== l.id; });
      (db().realEstates || []).forEach(function (r) { r.loanIds = loanIds(r); r.loanId = r.loanIds[0] || null; });
      App.store.syncLoanRefs(); App.store.save(); u.toast('부채가 삭제되었습니다.');
    });
  };
  L.toFixed = function (id) {
    var l = loanById(id); if (!l) return;
    var pay = C.loanState(l).monthly, nm = '[대출상환] ' + l.name;
    if (db().fixedExpenses.some(function (f) { return f.name === nm; })) { u.toast('이미 고정비 항목에 동일한 대출 상환금이 등록되어 있습니다.', 'warning'); return; }
    db().fixedExpenses.push({ id: u.uid(), name: nm, day: 25, amount: pay });
    App.store.save(); u.toast('\'' + l.name + '\' 월 상환금 (' + u.K(pay) + ')이 고정비로 등록되었습니다!');
  };
})(window.App);

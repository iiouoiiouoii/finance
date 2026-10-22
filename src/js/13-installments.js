/* 카드 할부 : 진행/완납 패널 · 등록/수정 · 선결제 · 완납 · 되돌리기 · 상환 스케줄 · 당월 지출 반영 */
(function (App) {
  'use strict';
  var u = App.u, C = App.calc, I = App.inst = {};
  var db = function () { return App.db; };
  var get = function (id) { return u.byId(db().installments, id); };
  function applied(id, cm) { return (db().transactions || []).some(function (t) { return t.installmentId === id && String(t.date || '').slice(0, 7) === cm; }); }
  function split() {
    var cm = App.state.month, all = (db().installments || []).map(function (i) { return { i: i, c: C.calcInst(i, cm) }; });
    var act = all.filter(function (x) { return !x.c.settled; }), set = all.filter(function (x) { return x.c.settled; });
    act.sort(function (a, b) { return u.mIdx(a.c.lastMonth) - u.mIdx(b.c.lastMonth); });
    set.sort(function (a, b) { return u.mIdx(b.i.closedMonth || b.c.lastMonth) - u.mIdx(a.i.closedMonth || a.c.lastMonth); });
    return { cm: cm, act: act, set: set };
  }
  var view = function () { return db().ui.instView === 'SETTLED' ? 'SETTLED' : 'ACTIVE'; };
  I.setView = function (v) { db().ui.instView = v === 'SETTLED' ? 'SETTLED' : 'ACTIVE'; App.store.save(); };

  /* ---------- 패널 ---------- */
  I.panelHtml = function () {
    if (C.autoCloseInstallments()) App.store.save({ quiet: true });
    var s = split(), v = view(), won = u.K, esc = u.esc;
    function tab(key, label, n) {
      var on = v === key;
      return '<button onclick="App.inst.setView(\'' + key + '\')" class="flex-1 py-1.5 text-[11px] font-bold rounded-lg border transition ' + (on ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400') + '">' + label + ' <span class="' + (on ? 'text-white/80' : 'text-slate-400') + '">' + n + '</span></button>';
    }
    var h = '<li class="pt-1"><div class="flex gap-1.5 mb-2">' + tab('ACTIVE', '진행 중', s.act.length) + tab('SETTLED', '완납', s.set.length) + '</div></li>';
    if (v === 'ACTIVE') {
      var charge = 0, unapplied = 0, endM = null;
      s.act.forEach(function (x) { if (x.c.status === 'ACTIVE') { charge += x.c.thisCharge; if (!applied(x.i.id, s.cm)) unapplied += x.c.thisCharge; } if (!endM || u.mIdx(x.c.lastMonth) > u.mIdx(endM)) endM = x.c.lastMonth; });
      var remaining = u.sum(s.act, function (x) { return x.c.remaining; }), next = u.sum(s.act, function (x) { return x.c.nextMonthCharge; });
      h += '<li class="py-2"><div class="grid grid-cols-3 gap-2 text-center">'
        + '<div class="bg-slate-50 border border-slate-200 rounded-lg p-2"><div class="text-[10px] text-slate-500">이번 달 청구</div><div class="text-sm font-bold text-red-500">' + won(charge) + '</div></div>'
        + '<div class="bg-slate-50 border border-slate-200 rounded-lg p-2"><div class="text-[10px] text-slate-500">미상환 잔액</div><div class="text-sm font-bold text-slate-800">' + won(remaining) + '</div></div>'
        + '<div class="bg-slate-50 border border-slate-200 rounded-lg p-2"><div class="text-[10px] text-slate-500">다음 달 청구</div><div class="text-sm font-bold text-slate-700">' + won(next) + '</div></div></div>'
        + (endM ? '<div class="text-[11px] text-slate-500 mt-2">마지막 할부 종료 <strong class="text-slate-700">' + endM + '</strong></div>' : '')
        + (unapplied > 0 ? '<button onclick="App.inst.applyActive()" class="mt-2 w-full text-[11px] bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-emerald-800 font-semibold py-1.5 rounded-lg">진행 중 할부 ' + won(unapplied) + ' 지출에 일괄 반영</button>' : '');
      var pend = s.set.filter(function (x) { return x.c.thisCharge > 0 && !applied(x.i.id, s.cm); });
      if (pend.length) h += '<div class="mt-2 text-[10px] bg-amber-50 border border-amber-200 text-amber-800 rounded-lg p-2">이번 달 완납된 ' + pend.length + '건의 당월 청구분이 지출에 반영되지 않았습니다. 완납 탭에서 확인하세요.</div>';
      h += '</li>';
      h += s.act.length ? s.act.map(function (x) {
        var i = x.i, c = x.c, badge = c.status === 'SCHEDULED'
          ? '<span class="px-2 py-0.5 rounded bg-slate-100 text-slate-500 border border-slate-200 font-bold text-[10px]">' + esc(i.startMonth) + ' 시작</span>'
          : '<span class="px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 font-bold text-[10px]">' + c.roundNo + '/' + i.months + '회차</span>';
        var btn = c.status === 'ACTIVE' && c.thisCharge > 0 ? (applied(i.id, s.cm) ? '<span class="text-[10px] text-emerald-600 font-semibold"><i class="fa-solid fa-check"></i> 반영됨</span>'
          : '<button onclick="App.inst.apply(' + i.id + ')" class="text-[10px] bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-emerald-800 font-semibold px-1.5 py-0.5 rounded">당월 반영</button>') : '';
        return '<li class="py-2.5 border-t border-slate-100"><div class="flex justify-between items-center gap-2"><div class="flex items-center gap-1.5 min-w-0">' + badge + '<span class="font-bold text-slate-800 text-xs truncate">' + esc(i.title) + '</span></div>'
          + '<div class="flex items-center gap-1 shrink-0"><button onclick="App.inst.detail(' + i.id + ')" class="text-slate-400 hover:text-slate-700 text-[11px] p-1"><i class="fa-solid fa-list-ul"></i></button>'
          + '<button onclick="App.inst.open(' + i.id + ')" class="text-slate-400 hover:text-accent text-[11px] p-1"><i class="fa-solid fa-pen-to-square"></i></button>'
          + '<button onclick="App.inst.remove(' + i.id + ')" class="text-slate-300 hover:text-red-500 text-[11px] p-1"><i class="fa-solid fa-trash-can"></i></button></div></div>'
          + '<div class="flex justify-between text-[11px] text-slate-500 mt-1"><span>월 ' + won(c.thisCharge || c.nextMonthCharge) + ' · 잔여 <strong class="text-slate-700">' + c.remainRounds + '회</strong></span><span>잔액 <strong class="text-red-500">' + won(c.remaining) + '</strong></span></div>'
          + '<div class="w-full h-1.5 bg-slate-100 rounded-full mt-1.5 overflow-hidden"><div class="h-full ' + (c.status === 'SCHEDULED' ? 'bg-slate-400' : 'bg-accent') + ' rounded-full" style="width:' + c.progress + '%"></div></div>'
          + '<div class="flex justify-between items-center mt-1.5"><span class="text-[10px] text-slate-400">' + esc(i.payment || '') + ' · ' + esc(c.lastMonth) + ' 종료</span>'
          + '<div class="flex items-center gap-1">' + btn + '<button onclick="App.inst.openPrepay(' + i.id + ')" class="text-[10px] bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 font-semibold px-1.5 py-0.5 rounded">선결제</button>'
          + '<button onclick="App.inst.settle(' + i.id + ')" class="text-[10px] bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 font-semibold px-1.5 py-0.5 rounded">완납처리</button></div></div></li>';
      }).join('') : '<li class="py-5 text-center text-slate-400 text-xs border-t border-slate-100">진행 중인 할부가 없습니다.' + (s.set.length ? '<br><span class="text-[11px]">완납 탭에 ' + s.set.length + '건이 보관되어 있습니다.</span>' : '') + '</li>';
    } else if (!s.set.length) {
      h += '<li class="py-5 text-center text-slate-400 text-xs">완납된 할부가 아직 없습니다.</li>';
    } else {
      var early = s.set.filter(function (x) { return x.c.earlyClosed; });
      h += '<li class="py-2"><div class="grid grid-cols-3 gap-2 text-center">'
        + '<div class="bg-emerald-50 border border-emerald-200 rounded-lg p-2"><div class="text-[10px] text-emerald-700">완납 건수</div><div class="text-sm font-bold text-emerald-800">' + s.set.length + '건</div></div>'
        + '<div class="bg-slate-50 border border-slate-200 rounded-lg p-2"><div class="text-[10px] text-slate-500">완납 원금 누계</div><div class="text-sm font-bold text-slate-800">' + won(u.sum(s.set, function (x) { return x.i.total; })) + '</div></div>'
        + '<div class="bg-slate-50 border border-slate-200 rounded-lg p-2"><div class="text-[10px] text-slate-500">조기상환 / 절감</div><div class="text-sm font-bold text-blue-600">' + early.length + '건 · ' + won(u.sum(s.set, function (x) { return x.c.savedInterest; })) + '</div></div></div></li>';
      h += s.set.map(function (x) {
        var i = x.i, c = x.c;
        return '<li class="py-2.5 border-t border-slate-100"><div class="flex justify-between items-center gap-2"><div class="flex items-center gap-1.5 min-w-0">'
          + (c.earlyClosed ? '<span class="px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 font-bold text-[10px]">조기상환</span>' : '<span class="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold text-[10px]">정상완납</span>')
          + '<span class="font-bold text-slate-600 text-xs truncate line-through decoration-slate-300">' + esc(i.title) + '</span></div><div class="flex items-center gap-1 shrink-0">'
          + '<button onclick="App.inst.detail(' + i.id + ')" class="text-slate-400 hover:text-slate-700 text-[11px] p-1"><i class="fa-solid fa-list-ul"></i></button>'
          + ((i.prepayments || []).length ? '<button onclick="App.inst.reopen(' + i.id + ')" class="text-[10px] bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-700 font-semibold px-1.5 py-0.5 rounded">되돌리기</button>' : '')
          + '<button onclick="App.inst.remove(' + i.id + ')" class="text-slate-300 hover:text-red-500 text-[11px] p-1"><i class="fa-solid fa-trash-can"></i></button></div></div>'
          + '<div class="flex justify-between text-[11px] text-slate-500 mt-1"><span>' + esc(i.closedMonth || c.lastMonth) + ' 완납 · 총 ' + i.months + '회</span><span>원금 <strong class="text-slate-700">' + won(i.total || 0) + '</strong></span></div>'
          + (c.earlyClosed && c.savedInterest > 0 ? '<div class="text-[10px] text-emerald-600 mt-1">조기상환으로 수수료 ' + won(c.savedInterest) + ' 절감</div>' : '') + '</li>';
      }).join('');
    }
    return h;
  };

  /* ---------- 당월 반영 ---------- */
  function pushCharge(i, m, c) {
    db().transactions.push({ id: u.uid(), date: m + '-' + u.pad(Math.min(28, i.billingDay || 15)), type: 'EXPENSE', category: i.category || '기타지출', subcategory: i.subcategory || '기타', payment: i.payment || '계좌이체', amount: c.thisCharge, memo: '[할부] ' + i.title + ' (' + c.roundNo + '/' + i.months + '회)', installmentId: i.id, lockCategory: true });
  }
  function chargedThisMonth(i, m) { return db().transactions.some(function (t) { return t.installmentId === i.id && String(t.date).indexOf(m) === 0 && String(t.memo).indexOf('[할부]') === 0; }); }
  I.apply = function (id) {
    var i = get(id); if (!i) return;
    var m = App.state.month, c = C.calcInst(i, m);
    if (c.thisCharge <= 0) { u.toast('이번 달 청구 회차가 없습니다.', 'warning'); return; }
    if (chargedThisMonth(i, m)) { u.toast('이미 이번 달에 반영되었습니다.', 'warning'); return; }
    pushCharge(i, m, c); App.store.save();
    u.toast('할부 ' + c.roundNo + '회차 ' + u.K(c.thisCharge) + '이 지출에 반영되었습니다.');
  };
  I.applyActive = function () {
    var s = split(), n = 0, sum = 0;
    s.act.forEach(function (x) {
      if (x.c.status === 'ACTIVE' && x.c.thisCharge > 0 && !applied(x.i.id, s.cm) && !chargedThisMonth(x.i, s.cm)) { pushCharge(x.i, s.cm, x.c); n++; sum += x.c.thisCharge; }
    });
    if (!n) { u.toast('반영할 당월 청구분이 없습니다.', 'warning'); return; }
    App.store.save(); u.toast(n + '건 · ' + u.K(sum) + '이 당월 지출에 반영되었습니다.');
  };
  /* 자동 반영용 : m 월에 청구일(uptoDay 이하)이 지난 진행 중 할부를 반영 (저장은 부르는 쪽) */
  I.applyDue = function (m, uptoDay) {
    var n = 0, sum = 0;
    (db().installments || []).forEach(function (i) {
      var c = C.calcInst(i, m);
      if (c.thisCharge <= 0 || (c.status !== 'ACTIVE' && !c.settled) || chargedThisMonth(i, m) || applied(i.id, m)) return;
      if (Math.min(28, i.billingDay || 15) > uptoDay) return;
      pushCharge(i, m, c); n++; sum += c.thisCharge;
    });
    return { n: n, sum: sum };
  };
  I.setAuto = function (on) {
    var a = db().ui.instAuto || (db().ui.instAuto = {});
    a.on = !!on; if (on) { a.from = u.nowM(); delete a.last; }
    App.store.save();
    u.toast(on ? '진행 중 할부의 매달 청구분을 청구일이 지나면 자동으로 반영합니다.' : '할부 자동 반영을 껐습니다.');
    if (on && App.fixed) App.fixed.autoRun();
  };

  /* ---------- 등록 · 수정 ---------- */
  function modal() {
    return u.modal('installment-modal', u.modalHead('inst-modal-title', '신용카드 할부 등록', 'installment-modal')
      + '<form onsubmit="App.inst.save(event)" class="space-y-3"><input type="hidden" id="inst-edit-id">'
      + '<input type="text" id="inst-title" required placeholder="할부 항목명 (예: 아이폰 15 구입)" class="' + u.IN + '">'
      + '<input type="text" id="inst-total" required data-money inputmode="numeric" placeholder="할부 원금 총액 (원)" oninput="App.inst.preview()" class="' + u.IN + ' font-bold">'
      + '<div class="grid grid-cols-3 gap-2"><div><label class="block text-[11px] font-semibold text-slate-600 mb-1">할부 개월수</label><input type="number" id="inst-months" min="1" max="60" required value="12" oninput="App.inst.preview()" class="' + u.IN + '"></div>'
      + '<div><label class="block text-[11px] font-semibold text-slate-600 mb-1">최초 청구월</label><input type="month" id="inst-start-month" required oninput="App.inst.preview()" class="' + u.IN + '"></div>'
      + '<div><label class="block text-[11px] font-semibold text-slate-600 mb-1">연 수수료율(%)</label><input type="number" id="inst-apr" min="0" max="30" step="0.1" value="0" oninput="App.inst.preview()" class="' + u.IN + '"></div></div>'
      + '<div class="grid grid-cols-2 gap-2"><div><label class="block text-[11px] font-semibold text-slate-600 mb-1">결제 카드</label><select id="inst-payment" class="' + u.IN + ' bg-white"></select></div>'
      + '<div><label class="block text-[11px] font-semibold text-slate-600 mb-1">매월 청구일</label><input type="number" id="inst-billing-day" min="1" max="31" value="15" class="' + u.IN + '"></div></div>'
      + '<div id="inst-preview" class="text-[11px] text-slate-600 bg-slate-50 border border-slate-200 rounded-lg p-2.5 leading-relaxed"></div>'
      + '<div class="flex justify-end gap-2 pt-1"><button type="button" onclick="App.u.close(\'installment-modal\')" class="px-3 py-1.5 bg-slate-100 text-xs rounded-lg">취소</button><button type="submit" class="px-3 py-1.5 bg-accent text-white text-xs font-semibold rounded-lg">저장하기</button></div></form>');
  }
  I.open = function (id) {
    modal();
    var i = id ? get(id) : null;
    u.$('inst-payment').innerHTML = C.payments().map(function (p) { return '<option value="' + u.esc(p) + '">' + u.esc(p) + '</option>'; }).join('');
    u.$('inst-edit-id').value = i ? i.id : '';
    u.$('inst-modal-title').innerText = i ? '할부 정보 수정' : '신용카드 할부 등록';
    u.$('inst-title').value = i ? i.title : '';
    u.$('inst-total').value = i ? u.n0(i.total) : '';
    u.$('inst-months').value = i ? i.months : 12;
    u.$('inst-start-month').value = i ? i.startMonth : App.state.month;
    u.$('inst-apr').value = i ? i.apr : 0;
    u.$('inst-billing-day').value = i ? i.billingDay : 15;
    if (i) u.$('inst-payment').value = i.payment;
    I.preview(); u.open('installment-modal');
  };
  I.preview = function () {
    var el = u.$('inst-preview'); if (!el) return;
    var total = u.P(u.val('inst-total')), months = parseInt(u.val('inst-months'), 10) || 1, apr = parseFloat(u.val('inst-apr')) || 0;
    if (!total) { el.innerHTML = '금액과 개월수를 입력하면 월 납입액이 계산됩니다.'; return; }
    var rows = C.instSchedule({ total: total, months: months, apr: apr, startMonth: u.val('inst-start-month') || App.state.month, prepayments: [], prepayMode: 'SHORTEN' }, false);
    var fee = u.sum(rows, function (r) { return r.interest; });
    el.innerHTML = '월 납입액 약 <strong>' + u.K(rows[0].charge + rows[0].interest) + '</strong> · 종료 <strong>' + rows[rows.length - 1].month + '</strong>'
      + (fee > 0 ? ' · 총 수수료 <strong class="text-red-500">' + u.K(fee) + '</strong> (총 상환 ' + u.K(total + fee) + ')' : ' · 무이자');
  };
  I.save = function (e) {
    e.preventDefault();
    var id = u.val('inst-edit-id');
    var rec = {
      title: u.val('inst-title').trim(), total: u.P(u.val('inst-total')), months: Math.max(1, parseInt(u.val('inst-months'), 10) || 1),
      startMonth: u.val('inst-start-month') || App.state.month, apr: parseFloat(u.val('inst-apr')) || 0, payment: u.val('inst-payment'),
      billingDay: Math.min(31, Math.max(1, parseInt(u.val('inst-billing-day'), 10) || 15))
    };
    if (!rec.title || rec.total <= 0) { u.toast('항목명과 금액을 확인해주세요.', 'warning'); return; }
    var i = id ? get(id) : null;
    if (i) Object.keys(rec).forEach(function (k) { i[k] = rec[k]; });
    else { rec.id = u.uid(); rec.prepayments = []; rec.prepayMode = 'SHORTEN'; rec.closedMonth = null; rec.category = '기타지출'; rec.subcategory = '기타'; db().installments.push(rec); }
    App.store.save(); u.close('installment-modal'); u.toast('할부 정보가 저장되었습니다.');
  };
  I.remove = function (id) {
    var i = get(id); if (!i) return;
    u.confirm('할부 삭제', '[' + i.title + '] 할부를 삭제합니다. 이미 지출에 반영된 내역은 유지됩니다.', function () {
      db().installments = db().installments.filter(function (x) { return x.id !== i.id; });
      App.store.save(); u.toast('할부가 삭제되었습니다.');
    });
  };

  /* ---------- 선결제 ---------- */
  function prepayModal() {
    return u.modal('prepay-modal', '<div><h3 class="font-bold text-slate-800">할부 선결제 · 부분결제</h3><p class="text-[11px] text-slate-400 mt-0.5">일부만 미리 갚아도 잔액에 즉시 반영되고, 잔액이 0이 되면 자동으로 완납 처리됩니다.</p></div>'
      + '<input type="hidden" id="prepay-inst-id"><div id="prepay-info" class="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs leading-relaxed"></div>'
      + '<div class="grid grid-cols-2 gap-2"><div><label class="block text-[11px] font-semibold text-slate-600 mb-1">결제일</label><input type="date" id="prepay-date" class="' + u.IN + '"></div>'
      + '<div><label class="block text-[11px] font-semibold text-slate-600 mb-1">결제 금액</label><input type="text" id="prepay-amount" data-money inputmode="numeric" placeholder="0" class="' + u.IN + ' font-bold"></div></div>'
      + '<div class="flex gap-2"><button type="button" onclick="App.inst.fillPrepay(1)" class="flex-1 text-[11px] bg-emerald-50 border border-emerald-300 text-emerald-800 font-semibold py-1.5 rounded-lg">잔액 전액 입력 (완납)</button>'
      + '<button type="button" onclick="App.inst.fillPrepay(0.5)" class="flex-1 text-[11px] bg-slate-50 border border-slate-300 text-slate-700 font-semibold py-1.5 rounded-lg">잔액의 50%</button></div>'
      + '<div><label class="block text-[11px] font-semibold text-slate-600 mb-1">선결제 반영 방식</label><select id="prepay-mode" class="' + u.IN + ' bg-white"><option value="SHORTEN">회차 단축 (뒤 회차부터 소멸 · 수수료 절감 큼)</option><option value="REDUCE">월 납입금 감소 (회차 유지 · 월 부담 완화)</option></select></div>'
      + '<label class="flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" id="prepay-make-txn" checked class="accent-emerald-600"> 이 선결제를 당월 지출 내역에도 등록</label>'
      + '<div><div class="text-[11px] font-semibold text-slate-600 mb-1">기존 선결제 기록</div><div id="prepay-list" class="space-y-1"></div></div>'
      + '<div class="pt-2 border-t border-slate-100 flex justify-end gap-2"><button type="button" onclick="App.u.close(\'prepay-modal\')" class="px-3 py-1.5 bg-slate-100 text-xs rounded-lg">닫기</button><button type="button" onclick="App.inst.savePrepay()" class="px-3 py-1.5 bg-accent text-white text-xs font-semibold rounded-lg">결제 등록</button></div>', 560);
  }
  var curPrepay = function () { return get(u.val('prepay-inst-id')); };
  function renderPrepayInfo() {
    var i = curPrepay(); if (!i) return;
    var c = C.calcInst(i, App.state.month);
    u.$('prepay-info').innerHTML = '<div class="font-bold text-slate-800">' + u.esc(i.title) + '</div><div class="text-slate-600 mt-1">총 ' + u.K(i.total) + ' · ' + i.months + '개월 · ' + (i.apr > 0 ? '연 ' + i.apr + '%' : '무이자') + '</div>'
      + '<div class="text-slate-600">현재 ' + c.roundNo + '회차 진행 · 납입 ' + u.K(c.paid) + ' · <strong class="text-red-500">잔액 ' + u.K(c.remaining) + '</strong></div>';
    u.$('prepay-list').innerHTML = (i.prepayments || []).length ? i.prepayments.map(function (p) {
      return '<div class="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-[11px]"><span class="text-slate-600">' + u.esc(p.date) + '</span><span class="font-bold text-slate-800">' + u.K(p.amount) + '</span>'
        + '<button onclick="App.inst.deletePrepay(' + i.id + ',' + p.id + ')" class="text-slate-300 hover:text-red-500"><i class="fa-solid fa-xmark"></i></button></div>';
    }).join('') : '<div class="text-[11px] text-slate-400">등록된 선결제가 없습니다.</div>';
  }
  I.openPrepay = function (id) {
    var i = get(id); if (!i) return;
    prepayModal();
    u.$('prepay-inst-id').value = id; u.$('prepay-date').value = u.today(); u.$('prepay-amount').value = '';
    u.$('prepay-mode').value = i.prepayMode || 'SHORTEN'; u.$('prepay-make-txn').checked = true;
    renderPrepayInfo(); u.open('prepay-modal');
  };
  I.fillPrepay = function (ratio) {
    var i = curPrepay(); if (!i) return;
    var rem = C.calcInst(i, App.state.month).remaining;
    u.$('prepay-amount').value = (ratio === 1 ? Math.round(rem) : Math.round(rem * ratio / 10) * 10).toLocaleString('ko-KR');
  };
  I.savePrepay = function () {
    var i = curPrepay(); if (!i) return;
    var amt = u.P(u.val('prepay-amount')), date = u.val('prepay-date') || u.today();
    if (!(amt > 0)) { u.toast('결제 금액을 입력해주세요.', 'warning'); return; }
    var before = C.calcInst(i, App.state.month);
    if (amt > before.remaining) { u.toast('잔액 ' + u.K(before.remaining) + '보다 큰 금액은 등록할 수 없습니다. 잔액으로 조정합니다.', 'warning'); amt = before.remaining; }
    i.prepayMode = u.val('prepay-mode');
    i.prepayments.push({ id: u.uid(), date: date, amount: amt });
    if (u.$('prepay-make-txn').checked) db().transactions.push({ id: u.uid(), date: date, type: 'EXPENSE', category: i.category || '기타지출', subcategory: i.subcategory || '기타', payment: i.payment || '계좌이체', amount: amt, memo: '[할부선결제] ' + i.title, installmentId: i.id, lockCategory: true });
    var after = C.calcInst(i, App.state.month);
    if (after.remaining <= 0) { i.closedMonth = String(date).slice(0, 7); db().ui.instView = 'SETTLED'; }
    App.store.save();
    if (after.remaining <= 0) { u.close('prepay-modal'); u.toast('완납 처리되었습니다. 절감 수수료 ' + u.K(after.savedInterest) + ' · 잔여 회차 소멸'); }
    else { renderPrepayInfo(); u.toast('선결제 ' + u.K(amt) + ' 반영 · 잔액 ' + u.K(after.remaining)); }
  };
  I.deletePrepay = function (instId, payId) {
    var i = get(instId); if (!i) return;
    i.prepayments = i.prepayments.filter(function (p) { return p.id !== payId; });
    if (C.calcInst(i, App.state.month).remaining > 0) i.closedMonth = null;
    App.store.save(); renderPrepayInfo(); u.toast('선결제 기록이 삭제되었습니다.');
  };

  /* ---------- 완납 · 되돌리기 ---------- */
  I.settle = function (id) {
    var i = get(id); if (!i) return;
    var c = C.calcInst(i, App.state.month);
    if (c.remaining <= 0) { u.toast('이미 완납된 할부입니다.', 'warning'); return; }
    u.confirm('할부 완납 처리', '[' + i.title + '] 잔액 ' + u.K(c.remaining) + '을 전액 상환 처리합니다. 잔여 ' + c.remainRounds + '회차가 소멸되고 수수료 ' + u.K(Math.max(0, c.savedInterest)) + '이 절감됩니다.', function () {
      var d = u.today();
      i.prepayments.push({ id: u.uid(), date: d, amount: c.remaining }); i.closedMonth = d.slice(0, 7);
      db().transactions.push({ id: u.uid(), date: d, type: 'EXPENSE', category: i.category || '기타지출', subcategory: i.subcategory || '기타', payment: i.payment || '계좌이체', amount: c.remaining, memo: '[할부완납] ' + i.title, installmentId: i.id, lockCategory: true });
      db().ui.instView = 'SETTLED';
      App.store.save(); u.toast('[' + i.title + '] 완납 처리되었습니다.');
    });
  };
  I.reopen = function (id) {
    var i = get(id); if (!i) return;
    var pre = i.prepayments || [];
    if (!pre.length) { u.toast('약정 회차가 정상 종료된 할부입니다. 되돌릴 선결제 기록이 없습니다.', 'warning'); return; }
    u.confirm('완납 되돌리기', '[' + i.title + '] 선결제·완납 기록 ' + pre.length + '건과 그에 따라 생성된 지출 내역을 삭제하고 잔여 회차를 복원합니다.', function () {
      db().transactions = db().transactions.filter(function (t) { if (t.installmentId !== i.id) return true; var m = String(t.memo || ''); return m.indexOf('[할부완납]') !== 0 && m.indexOf('[할부선결제]') !== 0; });
      i.prepayments = []; i.closedMonth = null; db().ui.instView = 'ACTIVE';
      App.store.save(); u.toast('[' + i.title + '] 완납이 취소되고 잔여 회차가 복원되었습니다.');
    });
  };

  /* ---------- 상환 스케줄 ---------- */
  I.detail = function (id) {
    var i = get(id); if (!i) return;
    u.modal('instdetail-modal', u.modalHead('instdetail-title', '할부 상환 스케줄', 'instdetail-modal') + '<div id="instdetail-body" class="text-xs"></div>', 620);
    var m = App.state.month, c = C.calcInst(i, m);
    u.$('instdetail-title').innerText = i.title + ' · 상환 스케줄';
    u.$('instdetail-body').innerHTML = '<div class="grid grid-cols-4 gap-2 mb-3 text-center">'
      + [['원금', u.K(i.total), ''], ['납입', u.K(c.paid), 'text-emerald-600'], ['잔액', u.K(c.remaining), 'text-red-500'], ['절감 수수료', u.K(c.savedInterest), '']].map(function (x) { return '<div class="border border-slate-200 rounded-lg p-2"><div class="text-[10px] text-slate-500">' + x[0] + '</div><div class="font-bold ' + x[2] + '">' + x[1] + '</div></div>'; }).join('')
      + '</div><table class="w-full"><thead><tr class="bg-slate-50 text-slate-500 text-[11px]"><th class="p-2 text-left">회차</th><th class="p-2 text-left">청구월</th><th class="p-2 text-right">원금</th><th class="p-2 text-right">수수료</th><th class="p-2 text-right">청구액</th><th class="p-2 text-center">상태</th></tr></thead><tbody>'
      + c.rows.map(function (r) {
        var cls = r.month === m ? 'bg-amber-50 font-bold' : (r.charge <= 0 ? 'text-slate-300 line-through' : '');
        return '<tr class="' + cls + ' border-b border-slate-100"><td class="p-2">' + r.round + '회차</td><td class="p-2 font-mono">' + r.month + '</td><td class="p-2 text-right">' + u.K(r.charge) + '</td><td class="p-2 text-right">' + (r.interest ? u.K(r.interest) : '-') + '</td>'
          + '<td class="p-2 text-right font-semibold">' + u.K(r.charge + r.interest) + '</td><td class="p-2 text-center text-[10px]">' + (r.cancelled > 0 ? '<span class="text-emerald-600">선결제 소멸</span>' : (u.mIdx(r.month) <= u.mIdx(m) ? '납부' : '예정')) + '</td></tr>';
      }).join('') + '</tbody></table>';
    u.open('instdetail-modal');
  };
})(window.App);

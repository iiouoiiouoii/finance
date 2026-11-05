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
    var h = '<div class="seg mb-3"><button onclick="App.inst.setView(\'ACTIVE\')" class="' + (v === 'ACTIVE' ? 'on' : '') + '">진행 중 ' + s.act.length + '</button>'
      + '<button onclick="App.inst.setView(\'SETTLED\')" class="' + (v === 'SETTLED' ? 'on' : '') + '">다 갚음 ' + s.set.length + '</button></div>';
    if (v === 'ACTIVE') {
      if (!s.act.length) return h + '<div class="empty">진행 중인 할부가 없어요. 홀가분해요 🎈</div>';
      var charge = 0, unapplied = 0;
      s.act.forEach(function (x) { if (x.c.status === 'ACTIVE') { charge += x.c.thisCharge; if (!applied(x.i.id, s.cm)) unapplied += x.c.thisCharge; } });
      var remaining = u.sum(s.act, function (x) { return x.c.remaining; }), next = u.sum(s.act, function (x) { return x.c.nextMonthCharge; });
      h += '<div class="kv mb-2"><div><small>이번 달</small><b>' + u.KS(charge) + '</b></div><div><small>다음 달</small><b>' + u.KS(next) + '</b></div><div><small>남은 돈</small><b>' + u.KS(remaining) + '</b></div></div>';
      if (unapplied > 0) h += '<div class="flex items-center justify-between gap-3 py-2 text-[14px] text-slate-600"><span>이번 달 할부금 ' + won(unapplied) + '이 아직 내역에 없어요.</span><button onclick="App.inst.applyActive()" class="it-btn">넣기</button></div>';
      h += '<div class="list-wrap">' + s.act.map(function (x) {
        var i = x.i, c = x.c, sched = c.status === 'SCHEDULED';
        return u.item({
          tap: 'App.inst.menu(' + i.id + ')', title: esc(i.title), icon: u.iconFor(i.title, i.category || '') === 'fa-receipt' ? 'fa-calendar-days' : u.iconFor(i.title, i.category || ''),
          meta: u.dots([sched ? esc(i.startMonth) + ' 시작' : c.roundNo + '/' + i.months + '회', '월 ' + won(c.thisCharge || c.nextMonthCharge), esc(c.lastMonth) + ' 끝']),
          val: won(c.remaining), valSub: c.remainRounds + '회 남음',
          bar: c.progress, barColor: sched ? '#B0B8C1' : '#0B7A57'
        });
      }).join('') + '</div>';
      return h;
    }
    if (!s.set.length) return h + '<div class="empty">다 갚은 할부가 아직 없어요.</div>';
    return h + '<div class="list-wrap">' + s.set.map(function (x) {
      var i = x.i, c = x.c;
      return u.item({
        tap: 'App.inst.menu(' + i.id + ')', title: esc(i.title), icon: u.iconFor(i.title, i.category || '') === 'fa-receipt' ? 'fa-calendar-days' : u.iconFor(i.title, i.category || ''),
        meta: u.dots([esc(i.closedMonth || c.lastMonth) + ' 다 갚음', i.months + '개월', c.earlyClosed ? '미리 갚음' : '']),
        val: won(i.total || 0), valSub: c.earlyClosed && c.savedInterest > 0 ? '수수료 ' + won(c.savedInterest) + ' 아낌' : '',
        valCls: 'text-slate-500'
      });
    }).join('') + '</div>';
  };
  /* 할부 한 줄을 누르면 : 할 수 있는 일 */
  I.menu = function (id) {
    var i = get(id); if (!i) return;
    var c = C.calcInst(i, App.state.month);
    if (c.settled) return u.sheet(u.esc(i.title), [
      ['갚는 일정 보기', 'App.inst.detail(' + id + ')'],
      (i.prepayments || []).length ? ['다 갚음 되돌리기', 'App.inst.reopen(' + id + ')'] : null,
      ['삭제', 'App.inst.remove(' + id + ')', 1]
    ], '다 갚은 할부');
    var canApply = c.status === 'ACTIVE' && c.thisCharge > 0 && !applied(id, App.state.month);
    u.sheet(u.esc(i.title), [
      canApply ? ['이번 달 ' + u.K(c.thisCharge) + ' 내역에 넣기', 'App.inst.apply(' + id + ')'] : null,
      ['갚는 일정 보기', 'App.inst.detail(' + id + ')'],
      ['일부 미리 갚기', 'App.inst.openPrepay(' + id + ')'],
      ['남은 돈 한 번에 다 갚았어요', 'App.inst.settle(' + id + ')'],
      ['수정', 'App.inst.open(' + id + ')'],
      ['삭제', 'App.inst.remove(' + id + ')', 1]
    ], c.roundNo + '/' + i.months + '회 · 남은 돈 ' + u.K(c.remaining));
  };

  /* ---------- 당월 반영 ---------- */
  function pushCharge(i, m, c) {
    db().transactions.push({ id: u.uid(), date: m + '-' + u.pad(Math.min(28, i.billingDay || 15)), type: 'EXPENSE', category: i.category || '기타지출', subcategory: i.subcategory || '기타', payment: i.payment || '계좌이체', amount: c.thisCharge, memo: '[할부] ' + i.title + ' (' + c.roundNo + '/' + i.months + '회)', installmentId: i.id, lockCategory: true });
  }
  function chargedThisMonth(i, m) { return db().transactions.some(function (t) { return t.installmentId === i.id && String(t.date).indexOf(m) === 0 && String(t.memo).indexOf('[할부]') === 0; }); }
  I.apply = function (id) {
    var i = get(id); if (!i) return;
    var m = App.state.month, c = C.calcInst(i, m);
    if (c.thisCharge <= 0) { u.toast('이번 달 청구 회차가 없어요.', 'warning'); return; }
    if (chargedThisMonth(i, m)) { u.toast('이미 이번 달에 반영되었어요.', 'warning'); return; }
    pushCharge(i, m, c); App.store.save();
    u.toast('할부 ' + c.roundNo + '회차 ' + u.K(c.thisCharge) + '이 지출에 반영되었어요.');
  };
  I.applyActive = function () {
    var s = split(), n = 0, sum = 0;
    s.act.forEach(function (x) {
      if (x.c.status === 'ACTIVE' && x.c.thisCharge > 0 && !applied(x.i.id, s.cm) && !chargedThisMonth(x.i, s.cm)) { pushCharge(x.i, s.cm, x.c); n++; sum += x.c.thisCharge; }
    });
    if (!n) { u.toast('반영할 당월 청구분이 없어요.', 'warning'); return; }
    App.store.save(); u.toast(n + '건 · ' + u.K(sum) + '이 당월 지출에 반영되었어요.');
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
    u.toast(on ? '진행 중 할부의 매달 청구분을 청구일이 지나면 자동으로 반영해요.' : '할부 자동 반영을 껐어요.');
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
    if (!total) { el.innerHTML = '금액과 개월수를 입력하면 월 납입액이 계산돼요.'; return; }
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
    App.store.save(); u.close('installment-modal'); u.toast('할부 정보가 저장되었어요.');
  };
  I.remove = function (id) {
    var i = get(id); if (!i) return;
    u.confirm('할부 삭제', '[' + i.title + '] 할부를 삭제해요. 이미 지출에 반영된 내역은 유지돼요.', function () {
      db().installments = db().installments.filter(function (x) { return x.id !== i.id; });
      App.store.save(); u.toast('할부가 삭제되었어요.');
    });
  };

  /* ---------- 선결제 ---------- */
  function prepayModal() {
    return u.modal('prepay-modal', '<div><h3 class="font-bold text-slate-800">할부 선결제 · 부분결제</h3><p class="text-[11px] text-slate-400 mt-0.5">일부만 미리 갚아도 잔액에 즉시 반영되고, 잔액이 0이 되면 자동으로 완납 처리돼요.</p></div>'
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
    }).join('') : '<div class="text-[11px] text-slate-400">등록된 선결제가 없어요.</div>';
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
    if (amt > before.remaining) { u.toast('잔액 ' + u.K(before.remaining) + '보다 큰 금액은 등록할 수 없어요. 잔액으로 조정해요.', 'warning'); amt = before.remaining; }
    i.prepayMode = u.val('prepay-mode');
    i.prepayments.push({ id: u.uid(), date: date, amount: amt });
    if (u.$('prepay-make-txn').checked) db().transactions.push({ id: u.uid(), date: date, type: 'EXPENSE', category: i.category || '기타지출', subcategory: i.subcategory || '기타', payment: i.payment || '계좌이체', amount: amt, memo: '[할부선결제] ' + i.title, installmentId: i.id, lockCategory: true });
    var after = C.calcInst(i, App.state.month);
    if (after.remaining <= 0) { i.closedMonth = String(date).slice(0, 7); db().ui.instView = 'SETTLED'; }
    App.store.save();
    if (after.remaining <= 0) { u.close('prepay-modal'); u.toast('완납 처리되었어요. 절감 수수료 ' + u.K(after.savedInterest) + ' · 잔여 회차 소멸'); }
    else { renderPrepayInfo(); u.toast('선결제 ' + u.K(amt) + ' 반영 · 잔액 ' + u.K(after.remaining)); }
  };
  I.deletePrepay = function (instId, payId) {
    var i = get(instId); if (!i) return;
    i.prepayments = i.prepayments.filter(function (p) { return p.id !== payId; });
    if (C.calcInst(i, App.state.month).remaining > 0) i.closedMonth = null;
    App.store.save(); renderPrepayInfo(); u.toast('선결제 기록이 삭제되었어요.');
  };

  /* ---------- 완납 · 되돌리기 ---------- */
  I.settle = function (id) {
    var i = get(id); if (!i) return;
    var c = C.calcInst(i, App.state.month);
    if (c.remaining <= 0) { u.toast('이미 완납된 할부예요.', 'warning'); return; }
    u.confirm('할부 완납 처리', '[' + i.title + '] 잔액 ' + u.K(c.remaining) + '을 전액 상환 처리해요. 잔여 ' + c.remainRounds + '회차가 소멸되고 수수료 ' + u.K(Math.max(0, c.savedInterest)) + '이 절감돼요.', function () {
      var d = u.today();
      i.prepayments.push({ id: u.uid(), date: d, amount: c.remaining }); i.closedMonth = d.slice(0, 7);
      db().transactions.push({ id: u.uid(), date: d, type: 'EXPENSE', category: i.category || '기타지출', subcategory: i.subcategory || '기타', payment: i.payment || '계좌이체', amount: c.remaining, memo: '[할부완납] ' + i.title, installmentId: i.id, lockCategory: true });
      db().ui.instView = 'SETTLED';
      App.store.save(); u.toast('[' + i.title + '] 완납 처리되었어요.');
    });
  };
  I.reopen = function (id) {
    var i = get(id); if (!i) return;
    var pre = i.prepayments || [];
    if (!pre.length) { u.toast('약정 회차가 정상 종료된 할부예요. 되돌릴 선결제 기록이 없어요.', 'warning'); return; }
    u.confirm('완납 되돌리기', '[' + i.title + '] 선결제·완납 기록 ' + pre.length + '건과 그에 따라 생성된 지출 내역을 삭제하고 잔여 회차를 복원해요.', function () {
      db().transactions = db().transactions.filter(function (t) { if (t.installmentId !== i.id) return true; var m = String(t.memo || ''); return m.indexOf('[할부완납]') !== 0 && m.indexOf('[할부선결제]') !== 0; });
      i.prepayments = []; i.closedMonth = null; db().ui.instView = 'ACTIVE';
      App.store.save(); u.toast('[' + i.title + '] 완납이 취소되고 잔여 회차가 복원되었어요.');
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

/* 수입 · 지출 내역 : 등록/수정 모달 · 목록(필터 · 검색 · 합계) · 다중 선택 일괄 편집 · CSV */
(function (App) {
  'use strict';
  var u = App.u, C = App.calc, T = App.txn = {};
  var db = function () { return App.db; };

  /* ---------- 분류 선택지 ---------- */
  var INCOME_SUB = { '급여': ['급여/상여', '월급', '성과급'], '금융소득': ['예적금이자', '배당금', '주식수익'], '부수입': ['부수입/기타', '중고거래/당근', '환급금', '캐시백'] };
  var TRANSFER_SUB = { '자산이동': ['저축/적금 납입', '투자매수', '투자매도', '목표적립', '연금 납입', '자신계좌이체', '부부간이체'], '계좌이체': ['자신계좌이체', '부부간이체', '공동통장 입금'] };
  function opt(v) { return '<option value="' + u.esc(v) + '">' + u.esc(v) + '</option>'; }
  T.updateCategories = function () {
    var type = u.val('txn-type'), sel = u.$('txn-category');
    var cats = type === 'EXPENSE' ? db().categories.map(function (c) { return c.name; }) : type === 'INCOME' ? ['급여', '부수입', '금융소득'] : ['계좌이체', '자산이동'];
    sel.innerHTML = cats.map(opt).join('');
    T.updateSubs();
  };
  T.updateSubs = function () {
    var type = u.val('txn-type'), c = u.val('txn-category'), subs;
    if (type === 'EXPENSE') { var x = db().categories.filter(function (k) { return k.name === c; })[0]; subs = x && x.subcategories.length ? x.subcategories.map(function (s) { return s.name; }) : ['기타']; }
    else if (type === 'INCOME') subs = INCOME_SUB[c] || INCOME_SUB['부수입'];
    else subs = TRANSFER_SUB[c] || TRANSFER_SUB['계좌이체'];
    u.$('txn-subcategory').innerHTML = subs.map(opt).join('');
  };
  function ensureOption(id, v) {
    var s = u.$(id); if (!s || !v) return;
    if (![].some.call(s.options, function (o) { return o.value === v; })) s.insertAdjacentHTML('beforeend', opt(v));
    s.value = v;
  }
  T.autoClassify = function (memo) {
    if (u.val('txn-type') !== 'EXPENSE' || !memo) return;
    var p = App.cat.predict(memo);
    u.$('txn-category').value = p.category; T.updateSubs(); u.$('txn-subcategory').value = p.subcategory;
  };

  /* ---------- 모달 ---------- */
  function modal() {
    return u.modal('transaction-modal', u.modalHead('txn-modal-title', '거래 내역 등록', 'transaction-modal')
      + '<form id="txn-form" onsubmit="App.txn.save(event)" class="space-y-3"><input type="hidden" id="edit-txn-id">'
      + '<div><label class="block text-xs font-semibold text-slate-600 mb-1">사용자 (누구의 수입·지출인가)</label><select id="txn-owner" class="' + u.IN + ' font-bold bg-sky-50/40"></select></div>'
      + '<div><label class="block text-xs font-semibold text-slate-600 mb-1">날짜</label><input type="date" id="txn-date" required class="' + u.IN + '"></div>'
      + '<div class="grid grid-cols-2 gap-3"><div><label class="block text-xs font-semibold text-slate-600 mb-1">구분</label>'
      + '<select id="txn-type" onchange="App.txn.updateCategories()" class="' + u.IN + '"><option value="EXPENSE">지출</option><option value="INCOME">수입</option><option value="TRANSFER">이체</option></select></div>'
      + '<div><label class="block text-xs font-semibold text-slate-600 mb-1">결제수단 / 보유카드</label><select id="txn-payment" class="' + u.IN + '"></select></div></div>'
      + '<div class="grid grid-cols-2 gap-3"><div><label class="block text-xs font-semibold text-slate-600 mb-1">대분류</label><select id="txn-category" onchange="App.txn.updateSubs()" class="' + u.IN + ' font-bold text-slate-800"></select></div>'
      + '<div><label class="block text-xs font-semibold text-slate-600 mb-1">소분류</label><select id="txn-subcategory" class="' + u.IN + ' bg-amber-50/50 font-semibold"></select></div></div>'
      + '<div><label class="block text-xs font-semibold text-slate-600 mb-1">금액 (원)</label><input type="text" id="txn-amount" required data-money inputmode="numeric" placeholder="0" class="' + u.IN + ' font-bold"></div>'
      + '<div><label class="block text-xs font-semibold text-slate-600 mb-1">메모 / 가맹점 (자동분류 키워드 인식)</label><input type="text" id="txn-memo" onchange="App.txn.autoClassify(this.value)" placeholder="예: 스타벅스, 올리브영, GS칼텍스" class="' + u.IN + '"></div>'
      + '<div class="pt-3 flex justify-end gap-2"><button type="button" onclick="App.u.close(\'transaction-modal\')" class="px-4 py-2 bg-slate-100 text-slate-600 rounded-lg text-xs">취소</button>'
      + '<button type="submit" class="px-4 py-2 bg-accent text-white rounded-lg text-xs font-semibold">저장하기</button></div></form>');
  }
  function prep() {
    modal();
    u.$('txn-owner').innerHTML = C.ownerOptions(true);
    u.$('txn-payment').innerHTML = C.payments().map(opt).join('');
  }
  T.openNew = function () {
    prep();
    u.$('txn-modal-title').innerText = '거래 내역 등록';
    u.$('txn-form').reset(); u.$('edit-txn-id').value = '';
    u.$('txn-date').value = App.state.month + '-15';
    u.$('txn-owner').value = 'J';
    T.updateCategories();
    u.open('transaction-modal');
  };
  T.openEdit = function (id) {
    var t = u.byId(db().transactions, id); if (!t) return;
    prep();
    u.$('txn-modal-title').innerText = '거래 내역 수정';
    u.$('edit-txn-id').value = t.id; u.$('txn-date').value = t.date; u.$('txn-type').value = t.type;
    T.updateCategories(); ensureOption('txn-category', t.category); T.updateSubs(); ensureOption('txn-subcategory', t.subcategory || '');
    ensureOption('txn-payment', t.payment);
    u.$('txn-amount').value = u.n0(t.amount); u.$('txn-memo').value = t.memo || '';
    u.$('txn-owner').value = C.ownerOf(t);
    u.open('transaction-modal');
  };
  T.save = function (e) {
    e.preventDefault();
    var editId = u.val('edit-txn-id'), before = editId ? u.byId(db().transactions, editId) : null;
    var t = before || { id: u.uid() };
    var cat0 = before ? before.category : null, sub0 = before ? (before.subcategory || '') : null;
    t.date = u.val('txn-date'); t.type = u.val('txn-type'); t.payment = u.val('txn-payment');
    t.category = u.val('txn-category'); t.subcategory = u.val('txn-subcategory');
    t.amount = u.P(u.val('txn-amount')); t.memo = u.val('txn-memo'); t.owner = u.val('txn-owner') || 'J';
    /* 직접 고른 분류는 재분류 대상에서 제외 (분류를 바꿨을 때만) */
    var changed = !before || cat0 !== t.category || sub0 !== t.subcategory;
    if (t.type === 'EXPENSE' && !t.installmentId && changed) t.lockCategory = true;
    if (typeof t.lockCategory !== 'boolean') t.lockCategory = false;
    /* 분류 학습 : 고친 분류(새 내역은 자동 추론과 다르게 고른 분류)를 이 가맹점의 규칙으로 기억 */
    var learned = '';
    if (t.type === 'EXPENSE' && !t.installmentId && t.memo) {
      var guess = App.cat.predict(t.memo);
      if (before ? changed : (guess.category !== t.category || guess.subcategory !== t.subcategory)) learned = App.cat.learn(t.memo, t.category, t.subcategory);
    }
    if (!before) db().transactions.push(t);
    App.store.save(); u.close('transaction-modal');
    u.toast((before ? '거래 내역이 수정되었습니다.' : '거래 내역이 등록되었습니다.') + App.cat.learnToast([learned], t.category, t.subcategory));
  };
  T.remove = function (id) {
    u.confirm('내역 삭제', '해당 거래 내역을 삭제하시겠습니까?', function () {
      db().transactions = db().transactions.filter(function (t) { return t.id !== Number(id); });
      App.store.save(); u.toast('거래 내역이 삭제되었습니다.');
    });
  };

  /* ---------- 목록 ---------- */
  var F = { type: 'ALL', pay: 'ALL', owner: 'ALL', q: '' }, SEL = {};
  function filtered() {
    var q = F.q.trim().toLowerCase();
    return C.monthTx().filter(function (t) {
      if (F.type !== 'ALL' && t.type !== F.type) return false;
      if (F.pay !== 'ALL' && t.payment !== F.pay) return false;
      if (F.owner !== 'ALL' && C.ownerOf(t) !== F.owner) return false;
      if (q && [t.date, t.category, t.subcategory, t.payment, t.memo, C.short(C.ownerOf(t))].join(' ').toLowerCase().indexOf(q) < 0) return false;
      return true;
    }).sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; });
  }
  T.setFilter = function (k, v) { F[k] = v; if (k === 'q') { renderRows(); return; } App.ui.render(); };
  function selIds() { return Object.keys(SEL).filter(function (k) { return SEL[k]; }).map(Number); }

  function rowHtml(t) {
    var typeTxt = t.type === 'INCOME' ? '<span class="text-emerald-600 font-bold">수입</span>' : t.type === 'TRANSFER' ? '<span class="text-slate-500">이체</span>' : '지출';
    var lock = t.type === 'EXPENSE' && !t.installmentId ? (t.lockCategory
      ? '<i class="fa-solid fa-lock text-[9px] text-amber-500 ml-1 cursor-pointer" onclick="event.stopPropagation();App.cat.toggleLock(' + t.id + ')" title="분류 고정됨 · 클릭하여 해제"></i>'
      : '<i class="fa-solid fa-lock-open text-[9px] text-slate-300 ml-1 cursor-pointer hover:text-slate-500" onclick="event.stopPropagation();App.cat.toggleLock(' + t.id + ')" title="클릭하면 재분류에서 제외됩니다"></i>') : '';
    var inst = t.installmentId ? ' <span class="px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 text-[9px] font-bold">할부</span>' : '';
    var on = !!SEL[t.id];
    return '<tr data-id="' + t.id + '" class="hover:bg-slate-50 transition cursor-pointer' + (on ? ' bg-emerald-50' : '') + '" onclick="App.txn.rowClick(event,' + t.id + ')" ondblclick="App.txn.openEdit(' + t.id + ')">'
      + '<td class="p-4"><input type="checkbox" class="txn-ck" ' + (on ? 'checked' : '') + ' onclick="event.stopPropagation()" onchange="App.txn.sel(' + t.id + ',this.checked)"></td>'
      + '<td class="p-4 font-mono">' + u.esc(t.date) + '</td><td class="p-4">' + typeTxt + '</td>'
      + '<td class="p-4 font-bold text-slate-800">' + u.esc(t.category) + lock + '</td>'
      + '<td class="p-4"><span class="px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-medium">' + u.esc(t.subcategory || '일반') + '</span></td>'
      + '<td class="p-4 text-slate-600">' + C.badge(C.ownerOf(t), !t.owner) + ' ' + u.esc(t.payment) + '</td>'
      + '<td class="p-4 text-slate-700">' + u.esc(t.memo || '-') + inst + '</td>'
      + '<td class="p-4 text-right font-bold ' + (t.type === 'INCOME' ? 'text-emerald-600' : 'text-slate-800') + '">' + u.K(t.amount) + '</td>'
      + '<td class="p-4 text-center"><div class="flex items-center justify-center gap-2">'
      + '<button onclick="event.stopPropagation();App.txn.openEdit(' + t.id + ')" class="text-slate-400 hover:text-accent p-1"><i class="fa-solid fa-pen-to-square"></i></button>'
      + '<button onclick="event.stopPropagation();App.txn.remove(' + t.id + ')" class="text-slate-400 hover:text-red-500 p-1"><i class="fa-solid fa-trash-can"></i></button></div></td></tr>';
  }
  function renderRows() {
    var tb = u.$('txn-table-body'); if (!tb) return;
    var list = filtered(), live = {};
    db().transactions.forEach(function (t) { live[t.id] = 1; });
    Object.keys(SEL).forEach(function (k) { if (!live[k]) delete SEL[k]; });
    tb.innerHTML = list.length ? list.map(rowHtml).join('') : '<tr><td colspan="9" class="p-8 text-center text-slate-400">등록된 내역이 없습니다.</td></tr>';
    var inc = C.sumType(list, 'INCOME'), exp = C.sumType(list, 'EXPENSE');
    u.$('txn-count').innerText = list.length;
    u.$('txn-sum').innerHTML = (F.owner !== 'ALL' ? '<b>' + u.esc(C.short(F.owner)) + '</b> · ' : '') + '수입 <b class="text-emerald-600">' + u.K(inc) + '</b> · 지출 <b class="text-slate-800">' + u.K(exp) + '</b>';
    var all = u.$('txn-all'); if (all) all.checked = list.length > 0 && list.every(function (t) { return SEL[t.id]; });
    renderBulk();
  }
  T.rowClick = function (e, id) { if (e.target.closest('button,input,a,i')) return; T.sel(id, !SEL[id]); };
  T.sel = function (id, on) {
    SEL[id] = on;
    var tr = document.querySelector('#txn-table-body tr[data-id="' + id + '"]');
    if (tr) { tr.classList.toggle('bg-emerald-50', on); var c = tr.querySelector('.txn-ck'); if (c) c.checked = on; }
    renderBulk();
  };
  T.selAll = function (on) { filtered().forEach(function (t) { SEL[t.id] = on; }); renderRows(); };
  T.clearSel = function () { SEL = {}; renderRows(); };

  /* ---------- 일괄 편집 ---------- */
  function renderBulk() {
    var b = u.$('txn-bulk'); if (!b) return;
    var ids = selIds(); b.classList.toggle('hidden', !ids.length);
    if (!ids.length) return;
    if (!u.$('bulk-cat')) {
      var cats = db().categories.map(function (c) { return c.name; }), pays = C.payments();
      b.innerHTML = '<b id="bulk-cnt" class="mr-1"></b><button onclick="App.txn.bulkDelete()" class="bg-red-600 hover:bg-red-700 px-3 py-1.5 rounded-lg font-semibold"><i class="fa-solid fa-trash-can mr-1"></i>선택 삭제</button><span class="text-slate-400 mx-1">|</span>'
        + '<select id="bulk-cat" onchange="App.txn.bulkSubs()" class="text-slate-800 rounded px-2 py-1.5"><option value="">대분류 변경 안 함</option>' + cats.map(opt).join('') + '</select>'
        + '<select id="bulk-sub" class="text-slate-800 rounded px-2 py-1.5"><option value="">소분류 자동</option></select>'
        + '<select id="bulk-pay" class="text-slate-800 rounded px-2 py-1.5"><option value="">결제수단 변경 안 함</option>' + pays.map(opt).join('') + '</select>'
        + '<select id="bulk-owner" class="text-slate-800 rounded px-2 py-1.5"><option value="">사용자 변경 안 함</option>' + C.ownerOptions(true) + '</select>'
        + '<input id="bulk-date" type="date" class="text-slate-800 rounded px-2 py-1.5" title="날짜 일괄 변경">'
        + '<button onclick="App.txn.bulkApply()" class="bg-accent hover:bg-accent-hover px-3 py-1.5 rounded-lg font-semibold">일괄 변경</button><button onclick="App.txn.clearSel()" class="ml-auto text-slate-300 hover:text-white">선택 해제</button>';
    }
    u.$('bulk-cnt').textContent = ids.length + '건 선택';
  }
  T.bulkSubs = function () {
    var c = db().categories.filter(function (x) { return x.name === u.val('bulk-cat'); })[0];
    u.$('bulk-sub').innerHTML = '<option value="">소분류 자동</option>' + (c ? c.subcategories.map(function (s) { return opt(s.name); }).join('') : '');
  };
  var undoBuf = null, undoTimer = null;
  T.bulkDelete = function () {
    var ids = selIds(); if (!ids.length) return;
    var linked = db().transactions.filter(function (t) { return SEL[t.id] && t.investmentId; }).length;
    u.confirm('선택 내역 삭제', ids.length + '건을 삭제합니다.' + (linked ? ' (투자 거래 연동 ' + linked + '건 포함 · 투자 이력은 유지됩니다)' : '') + ' 삭제 직후 되돌릴 수 있습니다.', function () {
      undoBuf = db().transactions.filter(function (t) { return SEL[t.id]; });
      db().transactions = db().transactions.filter(function (t) { return !SEL[t.id]; }); SEL = {};
      App.store.save();
      var x = u.$('undo-bar'); if (x) x.remove(); clearTimeout(undoTimer);
      document.body.insertAdjacentHTML('beforeend', '<div id="undo-bar" class="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-slate-900 text-white text-xs rounded-xl px-4 py-3 shadow-xl flex items-center gap-4">' + undoBuf.length + '건 삭제됨 <button onclick="App.txn.undoDelete()" class="font-bold text-amber-300">되돌리기</button></div>');
      undoTimer = setTimeout(function () { var y = u.$('undo-bar'); if (y) y.remove(); undoBuf = null; }, 12000);
    });
  };
  T.undoDelete = function () {
    if (!undoBuf) return;
    db().transactions = db().transactions.concat(undoBuf); u.toast(undoBuf.length + '건을 복원했습니다.'); undoBuf = null;
    var x = u.$('undo-bar'); if (x) x.remove();
    App.store.save();
  };
  T.bulkApply = function () {
    var ids = selIds(), c = u.val('bulk-cat'), s = u.val('bulk-sub'), p = u.val('bulk-pay'), o = u.val('bulk-owner'), d = u.val('bulk-date');
    if (!ids.length || !(c || p || d || o)) { u.toast('변경할 항목을 선택해 주세요.', 'warning'); return; }
    var cat = db().categories.filter(function (x) { return x.name === c; })[0], learned = [], sub = '';
    db().transactions.forEach(function (t) {
      if (!SEL[t.id]) return;
      if (c) {
        t.category = c; t.subcategory = sub = s || (cat && cat.subcategories[0] ? cat.subcategories[0].name : '기타');
        /* 일괄 편집도 가맹점별로 학습 (지출 · 할부/고정비 제외) */
        if (t.type === 'EXPENSE' && !t.installmentId) {
          t.lockCategory = true;
          var k = App.cat.learn(t.memo, t.category, t.subcategory); if (k && learned.indexOf(k) < 0) learned.push(k);
        }
      }
      if (p) t.payment = p; if (d) t.date = d; if (o) t.owner = o;
    });
    u.toast(ids.length + '건을 일괄 변경했습니다.' + App.cat.learnToast(learned, c, sub)); App.store.save();
  };

  /* ---------- CSV ---------- */
  T.exportCSV = function () {
    var q = function (v) { return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; };
    var rows = [['날짜', '구분', '대분류', '소분류', '사용자', '결제수단', '메모', '금액']].concat(db().transactions.slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; }).map(function (t) {
      return [t.date, { INCOME: '수입', EXPENSE: '지출', TRANSFER: '이체' }[t.type] || t.type, t.category, t.subcategory, C.short(C.ownerOf(t)), t.payment, t.memo, t.amount];
    }));
    u.download('가계부_내역_' + u.nowM() + '.csv', '﻿' + rows.map(function (r) { return r.map(q).join(','); }).join('\r\n'), 'text/csv;charset=utf-8');
    u.toast('전체 거래내역 ' + db().transactions.length + '건을 CSV로 내보냈습니다.');
  };

  /* ---------- 화면 ---------- */
  function sel(id, val, options, label) {
    return '<select onchange="App.txn.setFilter(\'' + id + '\', this.value)" class="flt-in" aria-label="' + label + '">' + options.map(function (o) { return '<option value="' + u.esc(o[0]) + '"' + (o[0] === val ? ' selected' : '') + '>' + u.esc(o[1]) + '</option>'; }).join('') + '</select>';
  }
  App.views.add({
    id: 'transactions', order: 20, title: '수입 · 지출 거래 내역', nav: { label: '수입 · 지출 내역', icon: 'fa-receipt' },
    render: function (el) {
      if (db().ui.autoReclassify && App.cat.silentReclassify()) App.store.save({ quiet: true });
      var pays = [['ALL', '전체 결제수단/카드']].concat(C.payments().map(function (p) { return [p, p]; }));
      if (F.pay !== 'ALL' && C.payments().indexOf(F.pay) < 0) F.pay = 'ALL';
      el.innerHTML = '<div id="txn-bar" class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3">'
        + '<div class="flt-row">' + sel('type', F.type, [['ALL', '전체 구분'], ['INCOME', '수입'], ['EXPENSE', '지출'], ['TRANSFER', '이체']], '구분')
        + sel('pay', F.pay, pays, '결제수단') + sel('owner', F.owner, [['ALL', '전체 사용자'], ['J', '공동 생활비'], ['H', C.nm('H') + ' 개인'], ['W', C.nm('W') + ' 개인']], '사용자')
        + '<div class="flt-search"><i class="fa-solid fa-magnifying-glass"></i><input id="txn-search" type="search" value="' + u.esc(F.q) + '" placeholder="메모·분류·결제수단 검색" oninput="App.txn.setFilter(\'q\', this.value)" class="flt-in"></div>'
        + '<button onclick="App.txn.exportCSV()" class="flt-btn"><i class="fa-solid fa-file-csv"></i> CSV</button>'
        + '<button onclick="App.paste.open()" class="flt-btn flt-dark"><i class="fa-solid fa-paste text-amber-400"></i> 스마트 붙여넣기</button></div>'
        + '<div class="flt-row flt-r2"><div class="flt-chips"><span class="flt-chip">조회된 내역 <strong id="txn-count" class="text-slate-800">0</strong> 건</span><span id="txn-sum" class="flt-chip"></span></div>'
        + '<div class="flt-tools"><label class="flex items-center gap-1.5 text-[11px] text-slate-500 cursor-pointer select-none" title="켜면 내역 화면을 열 때마다 키워드 규칙으로 자동 재분류합니다">'
        + '<input type="checkbox" ' + (db().ui.autoReclassify ? 'checked' : '') + ' onchange="App.cat.setAuto(this.checked)" class="accent-emerald-600"> 자동 적용</label>'
        + '<button onclick="App.cat.openReclass(\'MONTH\')" class="flt-btn flt-sm flt-green" title="키워드 규칙으로 기존 내역 다시 분류"><i class="fa-solid fa-rotate"></i> 새로고침 · 재분류</button>'
        + '<button onclick="App.cat.undo()" class="flt-btn flt-sm" title="직전 재분류 되돌리기"><i class="fa-solid fa-rotate-left"></i></button></div></div></div>'
        + '<div id="txn-bulk" class="hidden bg-slate-900 text-white rounded-xl p-3 flex flex-wrap items-center gap-2 text-xs"></div>'
        + '<div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden"><table class="w-full text-left border-collapse" id="txn-table"><thead><tr class="bg-slate-100/70 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider">'
        + '<th class="p-4 w-8"><input type="checkbox" id="txn-all" onchange="App.txn.selAll(this.checked)" title="화면에 보이는 내역 전체 선택"></th><th class="p-4">날짜</th><th class="p-4">구분</th><th class="p-4">대분류</th><th class="p-4">소분류</th><th class="p-4">사용자 · 결제수단</th><th class="p-4">메모 / 가맹점</th><th class="p-4 text-right">금액</th><th class="p-4 text-center">관리</th>'
        + '</tr></thead><tbody id="txn-table-body" class="divide-y divide-slate-100 text-xs"></tbody></table></div>';
      renderRows();
    }
  });
})(window.App);

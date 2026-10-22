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
  /* 입력 순서 : 구분 → 금액 → 어디서(메모) → 날짜 → 분류 → 결제수단 → 누구 돈. 금액에 바로 커서가 간다 */
  function modal() {
    var lab = function (t) { return '<label class="block text-xs font-semibold text-slate-600 mb-1.5">' + t + '</label>'; };
    return u.modal('transaction-modal', u.modalHead('txn-modal-title', '한 건 입력', 'transaction-modal')
      + '<form id="txn-form" onsubmit="App.txn.save(event)" class="space-y-4"><input type="hidden" id="edit-txn-id">'
      + '<select id="txn-type" onchange="App.txn.updateCategories();App.txn.typeSeg()" class="hidden"><option value="EXPENSE">지출</option><option value="INCOME">수입</option><option value="TRANSFER">이체</option></select>'
      + '<div class="seg w-full" id="txn-type-seg">' + [['EXPENSE', '나간 돈'], ['INCOME', '들어온 돈'], ['TRANSFER', '이체 · 저축']].map(function (x) { return '<button type="button" data-v="' + x[0] + '" onclick="App.txn.setType(\'' + x[0] + '\')" class="flex-1">' + x[1] + '</button>'; }).join('') + '</div>'
      + '<div>' + lab('금액') + '<div class="relative"><input type="text" id="txn-amount" required data-money inputmode="numeric" placeholder="0" autocomplete="off" class="w-full border border-slate-300 rounded-xl px-4 py-3 pr-10 text-2xl font-bold text-right"><span class="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 font-semibold">원</span></div></div>'
      + '<div>' + lab('어디서 · 무엇에') + '<input type="text" id="txn-memo" oninput="App.txn.autoClassify(this.value)" placeholder="예: 스타벅스, 관리비, 남편 급여" autocomplete="off" class="' + u.IN + '"><div class="text-[12px] text-slate-500 mt-1">가맹점 이름을 쓰면 분류가 자동으로 골라져요.</div></div>'
      + '<div class="grid grid-cols-2 gap-3"><div>' + lab('날짜') + '<input type="date" id="txn-date" required class="' + u.IN + '"></div>'
      + '<div>' + lab('결제수단') + '<select id="txn-payment" class="' + u.IN + '"></select></div></div>'
      + '<div class="grid grid-cols-2 gap-3"><div>' + lab('분류') + '<select id="txn-category" onchange="App.txn.updateSubs()" class="' + u.IN + '"></select></div>'
      + '<div>' + lab('세부 분류') + '<select id="txn-subcategory" class="' + u.IN + '"></select></div></div>'
      + '<div>' + lab('누구 돈') + '<select id="txn-owner" class="' + u.IN + '"></select></div>'
      + '<div class="pt-2 flex items-center gap-2"><button type="button" id="txn-del" onclick="App.txn.removeFromModal()" class="btn sec hidden" style="color:#C4282D">삭제</button>'
      + '<button type="button" onclick="App.u.close(\'transaction-modal\')" class="btn sec ml-auto">취소</button><button type="submit" class="btn pri px-6">저장</button></div></form>');
  }
  function prep() {
    modal();
    u.$('txn-owner').innerHTML = C.ownerOptions(true);
    u.$('txn-payment').innerHTML = C.payments().map(opt).join('');
  }
  T.typeSeg = function () { var v = u.val('txn-type'); u.qa('#txn-type-seg button').forEach(function (b) { b.classList.toggle('on', b.dataset.v === v); }); };
  T.setType = function (v) { u.$('txn-type').value = v; T.updateCategories(); T.typeSeg(); if (u.val('txn-memo')) T.autoClassify(u.val('txn-memo')); };
  T.openNew = function () {
    prep();
    u.$('txn-modal-title').innerText = '한 건 입력';
    u.$('txn-form').reset(); u.$('edit-txn-id').value = ''; u.$('txn-del').classList.add('hidden');
    /* 날짜 : 이번 달이면 오늘, 다른 달을 보고 있으면 그 달 1일 */
    u.$('txn-date').value = App.state.month === u.nowM() ? u.today() : App.state.month + '-01';
    u.$('txn-owner').value = 'J';
    T.updateCategories(); T.typeSeg();
    u.open('transaction-modal');
    setTimeout(function () { var a = u.$('txn-amount'); if (a) a.focus(); }, 60);
  };
  T.openEdit = function (id) {
    var t = u.byId(db().transactions, id); if (!t) return;
    prep();
    u.$('txn-modal-title').innerText = '내역 고치기';
    u.$('edit-txn-id').value = t.id; u.$('txn-date').value = t.date; u.$('txn-type').value = t.type;
    T.updateCategories(); ensureOption('txn-category', t.category); T.updateSubs(); ensureOption('txn-subcategory', t.subcategory || '');
    ensureOption('txn-payment', t.payment);
    u.$('txn-amount').value = u.n0(t.amount); u.$('txn-memo').value = t.memo || '';
    u.$('txn-owner').value = C.ownerOf(t); u.$('txn-del').classList.remove('hidden'); T.typeSeg();
    u.open('transaction-modal');
  };
  T.removeFromModal = function () { var id = u.val('edit-txn-id'); if (!id) return; u.close('transaction-modal'); T.remove(+id); };
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
    u.toast((before ? '고쳤습니다.' : '기록했습니다.') + App.cat.learnToast([learned], t.category, t.subcategory));
  };
  T.remove = function (id) {
    u.confirm('내역 삭제', '이 내역을 지울까요?', function () {
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

  var WD = ['일', '월', '화', '수', '목', '금', '토'];
  function catColor(name) { var c = (db().categories || []).filter(function (x) { return x.name === name; })[0]; return c && c.color ? c.color : '#8B95A1'; }
  /* 한 줄 : 눌러서 고치기, 왼쪽 체크로 여러 건 선택 */
  function rowHtml(t) {
    var on = !!SEL[t.id], inc = t.type === 'INCOME', tr = t.type === 'TRANSFER', own = C.ownerOf(t), col = tr ? '#A5ADB7' : inc ? '#0B7A57' : catColor(t.category);
    var lock = t.type === 'EXPENSE' && !t.installmentId && t.lockCategory ? ' <i class="fa-solid fa-lock text-[10px] text-slate-400 cursor-pointer" onclick="event.stopPropagation();App.cat.toggleLock(' + t.id + ')" title="분류 고정됨 (규칙 다시 적용에서 제외) · 눌러서 풀기"></i>' : '';
    var meta = [tr ? u.esc(t.subcategory || '이체') : u.esc(t.category) + (t.subcategory ? ' · ' + u.esc(t.subcategory) : ''), u.esc(t.payment || '')].filter(Boolean).join(' · ')
      + (own !== 'J' ? ' · ' + u.esc(C.short(own)) + ' 개인' : '') + (t.installmentId ? ' · <span class="text-amber-700 font-semibold">할부</span>' : '') + lock;
    return '<div data-id="' + t.id + '" class="txn-row' + (on ? ' sel' : '') + '" onclick="App.txn.rowClick(event,' + t.id + ')">'
      + '<input type="checkbox" class="txn-ck" aria-label="선택" ' + (on ? 'checked' : '') + ' onclick="event.stopPropagation()" onchange="App.txn.sel(' + t.id + ',this.checked)">'
      + '<span class="txn-dot" style="background:' + col + '"></span>'
      + '<div class="t"><b>' + u.esc(t.memo || t.subcategory || t.category || '-') + '</b><small>' + meta + '</small></div>'
      + '<div class="v ' + (inc ? 'text-accent' : tr ? 'text-slate-500' : 'text-slate-900') + '">' + (inc ? '+' : tr ? '' : '-') + u.n0(t.amount) + '원</div></div>';
  }
  function renderRows() {
    var box = u.$('txn-list'); if (!box) return;
    var list = filtered(), live = {};
    db().transactions.forEach(function (t) { live[t.id] = 1; });
    Object.keys(SEL).forEach(function (k) { if (!live[k]) delete SEL[k]; });
    var html = '', day = null;
    list.forEach(function (t) {
      if (t.date !== day) {
        day = t.date;
        var same = list.filter(function (x) { return x.date === day; }), dOut = C.sumType(same, 'EXPENSE'), dIn = C.sumType(same, 'INCOME'), dt = new Date(day + 'T00:00:00');
        html += '<div class="txn-day"><span>' + (+day.slice(8)) + '일 ' + WD[dt.getDay()] + '요일' + (day === u.today() ? ' · 오늘' : '') + '</span><span>' + (dIn ? '<b class="text-accent">+' + u.n0(dIn) + '</b> ' : '') + (dOut ? '-' + u.n0(dOut) : '') + '</span></div>';
      }
      html += rowHtml(t);
    });
    var allOn = list.length > 0 && list.every(function (t) { return SEL[t.id]; });
    box.innerHTML = list.length ? '<label class="txn-all"><input type="checkbox" id="txn-all" ' + (allOn ? 'checked' : '') + ' onchange="App.txn.selAll(this.checked)"> 보이는 내역 모두 선택</label>' + html
      : '<div class="empty py-12">' + (F.q || nFilters() ? '조건에 맞는 내역이 없어요.' : '이 달에는 내역이 없어요.<br><button onclick="App.ui.addMenu()" class="btn pri mt-4">기록하기</button>') + '</div>';
    var inc = C.sumType(list, 'INCOME'), exp = C.sumType(list, 'EXPENSE');
    u.$('txn-sum').innerHTML = '<b class="text-slate-900">' + list.length + '건</b>' + (F.owner !== 'ALL' ? ' · ' + u.esc(C.short(F.owner)) : '') + ' <span class="mx-1 text-slate-300">|</span> 들어온 돈 <b class="text-accent">' + u.n0(inc) + '원</b> <span class="mx-1 text-slate-300">|</span> 나간 돈 <b class="text-slate-900">' + u.n0(exp) + '원</b>';
    renderBulk();
  }
  function nFilters() { return (F.type !== 'ALL') + (F.pay !== 'ALL') + (F.owner !== 'ALL'); }
  var showF = false;
  T.toggleFilters = function () { showF = !showF; var f = u.$('txn-filters'); if (f) f.classList.toggle('hidden', !showF); };
  T.resetFilters = function () { F.type = F.pay = F.owner = 'ALL'; F.q = ''; App.ui.render(); };
  T.rowClick = function (e, id) { if (e.target.closest('button,input,a,i,label')) return; if (selIds().length) { T.sel(id, !SEL[id]); return; } T.openEdit(id); };
  T.sel = function (id, on) {
    SEL[id] = on;
    var tr = document.querySelector('#txn-list .txn-row[data-id="' + id + '"]');
    if (tr) { tr.classList.toggle('sel', on); var c = tr.querySelector('.txn-ck'); if (c) c.checked = on; }
    renderBulk();
  };
  T.selAll = function (on) { filtered().forEach(function (t) { SEL[t.id] = on; }); renderRows(); };
  T.clearSel = function () { SEL = {}; renderRows(); };

  /* ---------- 일괄 편집 ---------- */
  function renderBulk() {
    var b = u.$('txn-bulk'); if (!b) return;
    var ids = selIds(); b.className = ids.length ? 'txn-bulk' : 'hidden';
    if (!ids.length) return;
    if (!u.$('bulk-cat')) {
      var cats = db().categories.map(function (c) { return c.name; }), pays = C.payments();
      b.innerHTML = '<b id="bulk-cnt" class="text-slate-900"></b><span class="text-slate-500">한꺼번에 바꾸기</span>'
        + '<select id="bulk-cat" onchange="App.txn.bulkSubs()" class="flt-in flt-sm"><option value="">분류 그대로</option>' + cats.map(opt).join('') + '</select>'
        + '<select id="bulk-sub" class="flt-in flt-sm"><option value="">소분류 자동</option></select>'
        + '<select id="bulk-pay" class="flt-in flt-sm"><option value="">결제수단 그대로</option>' + pays.map(opt).join('') + '</select>'
        + '<select id="bulk-owner" class="flt-in flt-sm"><option value="">누구 돈 그대로</option>' + C.ownerOptions(true) + '</select>'
        + '<input id="bulk-date" type="date" class="flt-in flt-sm" title="날짜 한꺼번에 바꾸기">'
        + '<button onclick="App.txn.bulkApply()" class="btn pri" style="height:38px">바꾸기</button><button onclick="App.txn.bulkDelete()" class="btn sec" style="height:38px;color:#C4282D">선택 삭제</button><button onclick="App.txn.clearSel()" class="ml-auto text-slate-500 hover:text-slate-900 font-semibold">선택 해제</button>';
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
    id: 'transactions', order: 20, title: '내역', nav: { label: '내역', icon: 'fa-list-ul' },
    render: function (el) {
      if (db().ui.autoReclassify && App.cat.silentReclassify()) App.store.save({ quiet: true });
      var pays = [['ALL', '모든 카드 · 결제수단']].concat(C.payments().map(function (p) { return [p, p]; }));
      if (F.pay !== 'ALL' && C.payments().indexOf(F.pay) < 0) F.pay = 'ALL';
      var nf = nFilters();
      el.innerHTML = '<div id="txn-bar" class="card" style="padding:1rem">'
        + '<div class="flex gap-2"><div class="flt-search"><i class="fa-solid fa-magnifying-glass"></i><input id="txn-search" type="search" value="' + u.esc(F.q) + '" placeholder="가게 이름 · 분류 · 카드로 찾기" oninput="App.txn.setFilter(\'q\', this.value)" class="flt-in"></div>'
        + '<button onclick="App.txn.toggleFilters()" class="flt-btn"' + (nf ? ' style="border-color:#0B7A57;color:#086247"' : '') + '><i class="fa-solid fa-sliders"></i> 필터' + (nf ? ' ' + nf : '') + '</button></div>'
        + '<div id="txn-filters" class="' + (showF || nf ? '' : 'hidden') + ' pt-3 space-y-3"><div class="flt-row">' + sel('type', F.type, [['ALL', '나간 돈 · 들어온 돈 · 이체'], ['EXPENSE', '나간 돈만'], ['INCOME', '들어온 돈만'], ['TRANSFER', '이체만']], '구분')
        + sel('pay', F.pay, pays, '결제수단') + sel('owner', F.owner, [['ALL', '누구 돈이든'], ['J', '공동 생활비'], ['H', C.nm('H') + ' 개인'], ['W', C.nm('W') + ' 개인']], '누구 돈')
        + (nf || F.q ? '<button onclick="App.txn.resetFilters()" class="flt-btn">조건 지우기</button>' : '') + '</div>'
        + '<div class="flex flex-wrap items-center gap-2 pt-3 border-t border-slate-100 text-[13px] text-slate-600"><span class="font-semibold text-slate-700">분류 규칙</span>'
        + '<button onclick="App.cat.openReclass(\'MONTH\')" class="flt-btn flt-sm" title="키워드 규칙으로 이 달 내역을 다시 분류합니다">이 달 다시 분류</button><button onclick="App.cat.undo()" class="flt-btn flt-sm">되돌리기</button>'
        + '<label class="flex items-center gap-1.5 cursor-pointer select-none ml-1"><input type="checkbox" ' + (db().ui.autoReclassify ? 'checked' : '') + ' onchange="App.cat.setAuto(this.checked)" class="accent-emerald-600"> 내역을 열 때마다 자동으로</label>'
        + '<button onclick="App.txn.exportCSV()" class="flt-btn flt-sm ml-auto"><i class="fa-solid fa-download"></i> 전체 내역 CSV로 받기</button></div></div>'
        + '<div id="txn-sum" class="text-[14px] text-slate-600 mt-3"></div></div>'
        + '<div id="txn-bulk" class="hidden"></div>'
        + '<div id="txn-list" class="card" style="padding:.5rem 0"></div>';
      renderRows();
    }
  });
})(window.App);

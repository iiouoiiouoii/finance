/* 고정 항목 : 반복 지출 추천 · 고정 지출/수입(급여) 목록 · 당월 반영 · 매달 자동 반영 (+ 카드 할부 패널을 같은 화면에)
   - 고정 항목 { id, name, day, amount, type: EXPENSE|INCOME, owner: J|H|W, payment, auto, autoFrom, autoLast }
   - 자동 반영 : 앱을 열 때 · 화면으로 돌아올 때 · 10분마다, 이번 달 출금일이 지난 항목을 내역에 넣는다.
     autoFrom(켠 달) 이전은 건드리지 않고, 앱을 못 연 달은 최근 2달까지 채운다. autoLast 로 이미 처리한 달을 기억해
     자동으로 넣은 내역을 지워도 다시 넣지 않는다. */
(function (App) {
  'use strict';
  var u = App.u, C = App.calc, Fx = App.fixed = {};
  var db = function () { return App.db; };
  var isInc = function (f) { return f.type === 'INCOME'; };
  var tag = function (f) { return isInc(f) ? '[고정수입] ' : '[고정비] '; };

  function recommendations() {
    var cnt = {};
    db().transactions.filter(function (t) { return t.type === 'EXPENSE' && t.memo; }).forEach(function (t) {
      var c = cnt[t.memo] || (cnt[t.memo] = { count: 0, total: 0 });
      c.count++; c.total += t.amount;
    });
    return Object.keys(cnt).filter(function (m) { return cnt[m].count >= 2 && m.indexOf('[') !== 0 && !db().fixedExpenses.some(function (f) { return f.name.indexOf(m) >= 0; }); })
      .map(function (m) { return { memo: m, avg: Math.round(cnt[m].total / cnt[m].count), count: cnt[m].count }; });
  }
  Fx.addRecommended = function (i) {
    var r = recommendations()[i]; if (!r) return;
    db().fixedExpenses.push({ id: u.uid(), name: r.memo, day: 15, amount: r.avg, type: 'EXPENSE', owner: 'J', payment: '계좌이체', auto: false });
    App.store.save(); u.toast('\'' + r.memo + '\' (' + u.K(r.avg) + ') 항목이 월 고정비로 등록되었습니다.');
  };

  /* 그 달에 이미 들어갔나 : 이 항목으로 만든 내역, 또는 같은 구분·금액에 이름이 들어간 내역(붙여넣기로 먼저 들어온 경우) */
  var norm = function (s) { return String(s || '').toLowerCase().replace(/^\s*\[[^\]]*\]\s*/, '').replace(/[^0-9a-z가-힣]/g, ''); };
  Fx.isApplied = function (f, mo) {
    mo = mo || App.state.month;
    var nm = norm(f.name), type = isInc(f) ? 'INCOME' : 'EXPENSE';
    return db().transactions.some(function (t) {
      if (String(t.date).indexOf(mo) !== 0) return false;
      if (t.fixedId === f.id || t.memo === tag(f) + f.name) return true;
      var tm = norm(t.memo);
      return t.type === type && Number(t.amount) === Number(f.amount) && nm.length >= 2 && tm.length >= 2 && (tm.indexOf(nm) >= 0 || nm.indexOf(tm) >= 0);
    });
  };
  function txnFor(f, mo) {
    var p = isInc(f) ? App.cat.predictIncome(f.name) : App.cat.predict(f.name);
    return {
      id: u.uid(), date: mo + '-' + u.pad(Math.min(f.day || 1, u.dim(mo))), type: isInc(f) ? 'INCOME' : 'EXPENSE', category: p.category, subcategory: p.subcategory || '고정비',
      payment: f.payment || '계좌이체', amount: f.amount, memo: tag(f) + f.name, owner: f.owner || (isInc(f) ? 'H' : 'J'), fixedId: f.id, lockCategory: false
    };
  }
  Fx.apply = function (id) {
    var f = u.byId(db().fixedExpenses, id); if (!f) return;
    db().transactions.push(txnFor(f, App.state.month));
    App.store.save(); u.toast('\'' + f.name + '\' (' + u.K(f.amount) + ') 내역이 ' + (isInc(f) ? '수입' : '지출') + '에 반영되었습니다.');
  };
  Fx.applyAll = function () {
    var n = 0, s = 0, mo = App.state.month;
    db().fixedExpenses.forEach(function (f) { if (!Fx.isApplied(f, mo)) { db().transactions.push(txnFor(f, mo)); n++; s += isInc(f) ? 0 : f.amount; } });
    if (!n) { u.toast('이번 달에 반영할 고정 항목이 없습니다.', 'warning'); return; }
    App.store.save(); u.toast('고정 항목 ' + n + '건을 이번 달 내역에 반영했습니다.' + (s ? ' (지출 ' + u.K(s) + ')' : ''));
  };

  /* ---------- 매달 자동 반영 ---------- */
  Fx.autoRun = function () {
    if (!App.db) return 0;
    var now = u.nowM(), nowI = u.mIdx(now), today = new Date().getDate(), n = 0, sum = 0, touched = false;
    db().fixedExpenses.forEach(function (f) {
      if (!f.auto) return;
      var start = Math.max(u.mIdx(f.autoFrom || now), nowI - 2, f.autoLast ? u.mIdx(f.autoLast) + 1 : -Infinity);
      for (var i = start; i <= nowI; i++) {
        var m = u.iMon(i);
        if (i === nowI && Math.min(f.day || 1, u.dim(m)) > today) break;
        if (!Fx.isApplied(f, m)) { db().transactions.push(txnFor(f, m)); n++; if (!isInc(f)) sum += f.amount; }
        f.autoLast = m; touched = true;
      }
    });
    var a = db().ui.instAuto;
    if (a && a.on && App.inst && App.inst.applyDue) {
      var st = Math.max(u.mIdx(a.from || now), nowI - 2, a.last ? u.mIdx(a.last) + 1 : -Infinity);
      for (var j = st; j <= nowI; j++) {
        var r = App.inst.applyDue(u.iMon(j), j === nowI ? today : 31);
        n += r.n; sum += r.sum;
        if (j < nowI) { a.last = u.iMon(j); touched = true; }
      }
    }
    if (n) { App.store.save(); u.toast('자동 반영 ' + n + '건' + (sum ? ' · 지출 ' + u.K(sum) : '') + ' (고정 항목 · 할부)'); }
    else if (touched) App.store.save({ quiet: true });
    return n;
  };
  Fx.setAuto = function (id, on) {
    var f = u.byId(db().fixedExpenses, id); if (!f) return;
    setAutoFlag(f, on); App.store.save();
    u.toast(on ? '\'' + f.name + '\' : 매달 ' + f.day + '일이 지나면 자동으로 내역에 넣습니다.' : '\'' + f.name + '\' 자동 반영을 껐습니다.');
    if (on) Fx.autoRun();
  };
  function setAutoFlag(f, on) {
    if (!!f.auto === !!on) return;
    f.auto = !!on;
    if (on) { f.autoFrom = u.nowM(); delete f.autoLast; }
  }
  /* 시작 시 : 동기화를 쓰면 저장소 확인이 끝난 뒤에 (다른 기기에서 이미 넣은 항목과 겹치지 않게) */
  var bootDone = false;
  function bootRun() { if (bootDone) return; bootDone = true; Fx.autoRun(); }
  App.on('booted', function () {
    if (App.sync && App.sync.ready && App.sync.ready()) { App.on('sync-checked', bootRun); setTimeout(bootRun, 15000); }
    else bootRun();
    setInterval(function () { if (bootDone) Fx.autoRun(); }, 600000);
    document.addEventListener('visibilitychange', function () { if (!document.hidden && bootDone) setTimeout(Fx.autoRun, 2000); });
  });
  App.on('saved', function (opt) { if (opt && opt.fromSync && bootDone) setTimeout(Fx.autoRun, 0); });

  /* ---------- 등록 · 수정 ---------- */
  Fx.open = function (id) {
    u.modal('fixed-modal', u.modalHead('fixed-modal-title', '고정 항목 추가', 'fixed-modal')
      + '<form onsubmit="App.fixed.save(event)" class="space-y-3"><input type="hidden" id="fixed-edit-id">'
      + '<div class="grid grid-cols-2 gap-3"><div><label class="block font-semibold text-slate-600 mb-1 text-xs">구분</label><select id="fixed-type" onchange="App.fixed.typeChanged()" class="' + u.IN + ' font-bold"><option value="EXPENSE">지출 (월세·관리비·보험)</option><option value="INCOME">수입 (급여·용돈)</option></select></div>'
      + '<div><label class="block font-semibold text-slate-600 mb-1 text-xs">사용자</label><select id="fixed-owner" class="' + u.IN + '"></select></div></div>'
      + u.field('fixed-name', '항목명', { ph: '예: 월세, 아파트 관리비, 남편 급여', attrs: 'required', cls: 'font-bold' })
      + '<div class="grid grid-cols-2 gap-3">' + u.field('fixed-day', '매월 출금일 / 입금일', { type: 'number', ph: '예: 25', attrs: 'required min="1" max="31"' })
      + u.field('fixed-amount', '월 금액 (원)', { money: true, attrs: 'required' }) + '</div>'
      + '<div><label class="block font-semibold text-slate-600 mb-1 text-xs">결제수단</label><select id="fixed-payment" class="' + u.IN + '"></select></div>'
      + '<label class="flex items-start gap-2 text-xs text-slate-700 bg-emerald-50/60 border border-emerald-200 rounded-lg p-2.5 cursor-pointer"><input type="checkbox" id="fixed-auto" class="accent-emerald-600 mt-0.5">'
      + '<span><b>매달 자동 반영</b><br><span class="text-[11px] text-slate-500">앱을 열었을 때 이번 달 날짜가 지났으면 내역에 자동으로 넣습니다. 이미 들어간 달은 건너뜁니다.</span></span></label>'
      + '<div class="flex justify-end gap-2 pt-2"><button type="button" onclick="App.u.close(\'fixed-modal\')" class="px-3 py-1.5 bg-slate-100 text-xs rounded-lg">취소</button><button type="submit" class="px-3 py-1.5 bg-accent text-white text-xs font-semibold rounded-lg">저장하기</button></div></form>', 420);
    var f = id ? u.byId(db().fixedExpenses, id) : null;
    u.$('fixed-owner').innerHTML = C.ownerOptions(true);
    u.$('fixed-payment').innerHTML = C.payments().map(function (p) { return '<option value="' + u.esc(p) + '">' + u.esc(p) + '</option>'; }).join('');
    u.$('fixed-modal-title').innerText = f ? '고정 항목 수정' : '고정 항목 추가';
    u.$('fixed-edit-id').value = f ? f.id : ''; u.$('fixed-name').value = f ? f.name : ''; u.$('fixed-day').value = f ? f.day : ''; u.$('fixed-amount').value = f ? u.n0(f.amount) : '';
    u.$('fixed-type').value = f && isInc(f) ? 'INCOME' : 'EXPENSE';
    u.$('fixed-owner').value = f ? (f.owner || 'J') : 'J';
    u.$('fixed-payment').value = f && f.payment && C.payments().indexOf(f.payment) >= 0 ? f.payment : '계좌이체';
    u.$('fixed-auto').checked = f ? !!f.auto : true;
    u.open('fixed-modal');
  };
  Fx.typeChanged = function () { if (u.val('fixed-type') === 'INCOME' && u.val('fixed-owner') === 'J') u.$('fixed-owner').value = 'H'; };
  Fx.save = function (e) {
    e.preventDefault();
    var id = u.val('fixed-edit-id'), f = id ? u.byId(db().fixedExpenses, id) : null;
    var rec = { name: u.val('fixed-name').trim(), day: Math.min(31, Math.max(1, parseInt(u.val('fixed-day'), 10) || 1)), amount: u.P(u.val('fixed-amount')), type: u.val('fixed-type') === 'INCOME' ? 'INCOME' : 'EXPENSE', owner: u.val('fixed-owner') || 'J', payment: u.val('fixed-payment') || '계좌이체' };
    if (f) Object.keys(rec).forEach(function (k) { f[k] = rec[k]; }); else { f = rec; f.id = u.uid(); f.auto = false; db().fixedExpenses.push(f); }
    setAutoFlag(f, u.$('fixed-auto').checked);
    App.store.save(); u.close('fixed-modal'); u.toast(id ? '고정 항목이 수정되었습니다.' : '고정 항목이 추가되었습니다.');
    if (f.auto) Fx.autoRun();
  };
  Fx.remove = function (id) {
    u.confirm('고정 항목 삭제', '이 고정 항목을 삭제하시겠습니까? 이미 반영된 내역은 남습니다.', function () {
      db().fixedExpenses = db().fixedExpenses.filter(function (f) { return f.id !== Number(id); });
      App.store.save(); u.toast('고정 항목이 삭제되었습니다.');
    });
  };

  function itemHtml(f) {
    var applied = Fx.isApplied(f);
    var btn = applied ? '<span class="text-xs bg-slate-100 border border-slate-200 text-slate-500 font-semibold px-2.5 py-1 rounded-lg flex items-center gap-1"><i class="fa-solid fa-check text-[10px] text-emerald-600"></i> 반영완료</span>'
      : '<button onclick="App.fixed.apply(' + f.id + ')" class="text-xs bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-emerald-800 font-semibold px-2.5 py-1 rounded-lg flex items-center gap-1"><i class="fa-solid fa-plus text-[10px]"></i> 반영하기</button>';
    var kind = isInc(f) ? '<span class="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">수입</span>' : '';
    var auto = '<label class="inline-flex items-center gap-1 text-[10px] font-semibold cursor-pointer select-none ' + (f.auto ? 'text-emerald-700' : 'text-slate-400') + '" title="매달 자동 반영">'
      + '<input type="checkbox" ' + (f.auto ? 'checked' : '') + ' onchange="App.fixed.setAuto(' + f.id + ', this.checked)" class="accent-emerald-600"> 자동</label>';
    return '<li class="py-3 flex items-center justify-between gap-2 flex-wrap"><div class="min-w-0"><div class="font-bold text-slate-700 flex items-center gap-1.5 flex-wrap">' + kind + C.badge(f.owner || 'J') + ' ' + u.esc(f.name) + '</div>'
      + '<div class="text-[11px] text-slate-400 mt-0.5">매월 ' + f.day + '일 · ' + u.esc(f.payment || '계좌이체') + '</div></div>'
      + '<div class="flex items-center gap-1.5 ml-auto"><span class="font-bold mr-1 ' + (isInc(f) ? 'text-emerald-600' : 'text-slate-800') + '">' + u.K(f.amount) + '</span>' + auto + btn
      + '<button onclick="App.fixed.open(' + f.id + ')" class="text-slate-400 hover:text-accent p-1"><i class="fa-solid fa-pen-to-square"></i></button><button onclick="App.fixed.remove(' + f.id + ')" class="text-slate-300 hover:text-red-500 p-1"><i class="fa-solid fa-xmark"></i></button></div></li>';
  }

  App.views.add({
    id: 'fixed', order: 40, title: '월 고정비 & 카드 할부', nav: { label: '고정비 & 카드할부', icon: 'fa-calendar-check' },
    render: function (el) {
      var rec = recommendations().slice(0, 3), list = db().fixedExpenses, unapplied = list.filter(function (f) { return !Fx.isApplied(f); }).length;
      var exp = list.filter(function (f) { return !isInc(f); }), inc = list.filter(isInc), ia = db().ui.instAuto || {};
      el.innerHTML = '<div class="bg-amber-50/80 border border-amber-200 rounded-2xl p-5 space-y-3"><div class="flex justify-between items-center"><h4 class="font-bold text-amber-900 text-xs flex items-center gap-2"><i class="fa-solid fa-wand-magic-sparkles text-amber-600"></i> 과거 지출 패턴 분석: 반복 고정비 자동 추천</h4><span class="text-[11px] text-amber-700">최근 반복 지출 감지</span></div>'
        + '<div class="grid grid-cols-1 md:grid-cols-3 gap-3">' + (rec.length ? rec.map(function (r, i) {
          return '<div class="bg-white p-3 rounded-xl border border-amber-200 shadow-sm flex justify-between items-center text-xs"><div><div class="font-bold text-slate-800">' + u.esc(r.memo) + '</div><div class="text-[11px] text-slate-400">과거 ' + r.count + '회 반복 (평균 ' + u.K(r.avg) + ')</div></div>'
            + '<button onclick="App.fixed.addRecommended(' + i + ')" class="bg-amber-500 hover:bg-amber-600 text-white px-2.5 py-1 rounded-lg font-bold text-[11px] shadow-sm">+ 고정비 전환</button></div>';
        }).join('') : '<div class="md:col-span-3 text-center text-amber-700/70 text-xs py-2">현재 추천할 새로운 반복 지출 항목이 없습니다.</div>') + '</div></div>'
        + '<div class="grid grid-cols-1 lg:grid-cols-2 gap-6">'
        + '<div class="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4"><div class="flex justify-between items-center pb-3 border-b border-slate-100 gap-2 flex-wrap"><div><h3 class="font-bold text-slate-800">월 고정 지출 · 수입</h3><p class="text-xs text-slate-400 mt-0.5">\'반영하기\'를 누르면 ' + u.esc(u.monthLabel(App.state.month)) + ' 내역에 들어갑니다. <b class="text-emerald-700">자동</b>을 켜면 날짜가 지나면 알아서 들어갑니다.</p></div>'
        + '<div class="flex gap-1.5 shrink-0">' + (unapplied ? '<button onclick="App.fixed.applyAll()" class="text-xs bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-emerald-800 font-semibold px-3 py-1.5 rounded-lg">' + unapplied + '건 모두 반영</button>' : '')
        + '<button onclick="App.fixed.open()" class="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 rounded-lg border border-slate-200">+ 고정 항목 추가</button></div></div>'
        + '<ul class="divide-y divide-slate-100 text-xs">' + (list.length ? exp.map(itemHtml).join('')
          + (inc.length ? '<li class="pt-3 pb-1 text-[11px] font-bold text-emerald-700">고정 수입 · 합계 ' + u.K(u.sum(inc, function (f) { return f.amount; })) + '</li>' + inc.map(itemHtml).join('') : '')
          : '<li class="py-4 text-center text-slate-400">등록된 고정 항목이 없습니다.</li>') + '</ul></div>'
        + '<div class="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4"><div class="flex justify-between items-center pb-3 border-b border-slate-100 gap-2 flex-wrap"><div><h3 class="font-bold text-slate-800">신용카드 할부 현황</h3><p class="text-xs text-slate-400 mt-0.5">잔여 회차 및 남은 할부 잔액 집계</p></div>'
        + '<div class="flex items-center gap-2"><label class="inline-flex items-center gap-1 text-[11px] font-semibold cursor-pointer select-none ' + (ia.on ? 'text-emerald-700' : 'text-slate-500') + '" title="진행 중 할부의 당월 청구분을 청구일이 지나면 자동으로 지출에 반영"><input type="checkbox" ' + (ia.on ? 'checked' : '') + ' onchange="App.inst.setAuto(this.checked)" class="accent-emerald-600"> 매달 자동 반영</label>'
        + '<button onclick="App.inst.open()" class="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 rounded-lg border border-slate-200">+ 할부 수동 등록</button></div></div>'
        + '<ul id="installment-list" class="divide-y divide-slate-100 text-xs space-y-1">' + App.inst.panelHtml() + '</ul></div></div>';
    }
  });
})(window.App);

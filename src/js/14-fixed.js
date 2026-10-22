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
    var applied = Fx.isApplied(f), own = f.owner && f.owner !== 'J';
    var btn = applied ? '<span class="fx-done"><i class="fa-solid fa-check"></i> 들어감</span>'
      : '<button onclick="App.fixed.apply(' + f.id + ')" class="fx-put">넣기</button>';
    var auto = '<label class="fx-auto' + (f.auto ? ' on' : '') + '" title="날짜가 지나면 이 달 내역에 알아서 들어갑니다"><input type="checkbox" ' + (f.auto ? 'checked' : '') + ' onchange="App.fixed.setAuto(' + f.id + ', this.checked)"> 매달 자동</label>';
    return '<li class="fx-row"><div class="min-w-0 flex-1"><div class="font-semibold text-[15px] text-slate-900 truncate">' + u.esc(f.name) + (own ? ' <span class="text-[13px] font-normal text-slate-500">· ' + u.esc(C.short(f.owner)) + '</span>' : '') + '</div>'
      + '<div class="text-[13px] text-slate-500 mt-0.5">매달 ' + f.day + '일 · ' + u.esc(f.payment || '계좌이체') + '</div></div>'
      + '<div class="text-right shrink-0"><div class="font-bold text-[15px] ' + (isInc(f) ? 'text-accent' : 'text-slate-900') + '">' + (isInc(f) ? '+' : '') + u.n0(f.amount) + '원</div></div>'
      + '<div class="fx-act">' + auto + btn
      + '<button onclick="App.fixed.open(' + f.id + ')" class="fx-ic" aria-label="고치기"><i class="fa-solid fa-pen"></i></button><button onclick="App.fixed.remove(' + f.id + ')" class="fx-ic" aria-label="삭제"><i class="fa-solid fa-trash-can"></i></button></div></li>';
  }

  App.views.add({
    id: 'fixed', order: 40, title: '고정비 · 할부', nav: { label: '고정비 · 할부', icon: 'fa-rotate' },
    render: function (el) {
      var rec = recommendations().slice(0, 3), list = db().fixedExpenses, unapplied = list.filter(function (f) { return !Fx.isApplied(f); }).length;
      var exp = list.filter(function (f) { return !isInc(f); }), inc = list.filter(isInc), ia = db().ui.instAuto || {}, m = parseInt(App.state.month.slice(5), 10);
      var sum = function (L) { return u.n0(u.sum(L, function (f) { return f.amount; })) + '원'; };
      el.innerHTML = '<div class="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">'
        + '<div class="card"><div class="card-h"><h3>매달 나가고 들어오는 돈</h3><button onclick="App.fixed.open()" class="btn sec" style="height:38px">+ 추가</button></div>'
        + (unapplied ? '<div class="flex items-center justify-between gap-3 p-3.5 rounded-xl bg-amber-50 text-[14px] text-amber-900 mb-2"><span>' + m + '월 내역에 아직 안 들어간 항목이 <b>' + unapplied + '건</b> 있어요.</span><button onclick="App.fixed.applyAll()" class="btn pri" style="height:38px">모두 넣기</button></div>'
          : (list.length ? '<div class="text-[14px] text-slate-500 mb-2">' + m + '월 내역에 모두 들어갔어요.</div>' : ''))
        + (list.length ? (exp.length ? '<div class="fx-sec"><span>나가는 돈</span><span>' + sum(exp) + '</span></div><ul>' + exp.map(itemHtml).join('') + '</ul>' : '')
          + (inc.length ? '<div class="fx-sec"><span>들어오는 돈</span><span class="text-accent">+' + sum(inc) + '</span></div><ul>' + inc.map(itemHtml).join('') + '</ul>' : '')
          : '<div class="empty">월세 · 관리비 · 통신비 · 보험 · 월급처럼 매달 같은 돈을 등록해 두면, 버튼 한 번(또는 자동으로) 이 달 내역에 들어가요.</div>')
        + '</div>'
        + '<div class="card"><div class="card-h"><h3>카드 할부</h3><button onclick="App.inst.open()" class="btn sec" style="height:38px">+ 할부 등록</button></div>'
        + '<label class="fx-auto' + (ia.on ? ' on' : '') + ' mb-2" title="진행 중인 할부의 이 달 청구분을 청구일이 지나면 지출로 넣습니다"><input type="checkbox" ' + (ia.on ? 'checked' : '') + ' onchange="App.inst.setAuto(this.checked)"> 매달 청구분을 자동으로 지출에 넣기</label>'
        + '<ul id="installment-list" class="divide-y divide-slate-100 text-xs space-y-1">' + App.inst.panelHtml() + '</ul></div></div>'
        + (rec.length ? '<div class="card"><div class="card-h"><h3>반복해서 나간 돈</h3><span class="text-[13px] text-slate-500">고정비로 등록하면 매달 자동으로 넣을 수 있어요</span></div>'
          + rec.map(function (r, i) {
            return '<div class="row"><div class="t"><b>' + u.esc(r.memo) + '</b><small>지난 ' + r.count + '번 · 평균 ' + u.n0(r.avg) + '원</small></div><button onclick="App.fixed.addRecommended(' + i + ')" class="btn sec" style="height:36px">고정비로 등록</button></div>';
          }).join('') + '</div>' : '');
    }
  });
})(window.App);

/* 고정비 : 반복 지출 추천 · 고정비 목록 · 당월 지출 반영 (+ 카드 할부 패널을 같은 화면에) */
(function (App) {
  'use strict';
  var u = App.u, Fx = App.fixed = {};
  var db = function () { return App.db; };

  function recommendations() {
    var cnt = {};
    db().transactions.filter(function (t) { return t.type === 'EXPENSE' && t.memo; }).forEach(function (t) {
      var c = cnt[t.memo] || (cnt[t.memo] = { count: 0, total: 0 });
      c.count++; c.total += t.amount;
    });
    return Object.keys(cnt).filter(function (m) { return cnt[m].count >= 2 && !db().fixedExpenses.some(function (f) { return f.name.indexOf(m) >= 0; }); })
      .map(function (m) { return { memo: m, avg: Math.round(cnt[m].total / cnt[m].count), count: cnt[m].count }; });
  }
  Fx.addRecommended = function (i) {
    var r = recommendations()[i]; if (!r) return;
    db().fixedExpenses.push({ id: u.uid(), name: r.memo, day: 15, amount: r.avg });
    App.store.save(); u.toast('\'' + r.memo + '\' (' + u.K(r.avg) + ') 항목이 월 고정비로 등록되었습니다.');
  };
  function isApplied(f) { var m = App.state.month; return db().transactions.some(function (t) { return String(t.date).indexOf(m) === 0 && t.memo === '[고정비] ' + f.name; }); }
  Fx.apply = function (id) {
    var f = u.byId(db().fixedExpenses, id); if (!f) return;
    var mo = App.state.month, day = u.pad(Math.min(f.day || 1, u.dim(mo))), p = App.cat.predict(f.name);
    db().transactions.push({ id: u.uid(), date: mo + '-' + day, type: 'EXPENSE', category: p.category, subcategory: p.subcategory || '고정비', payment: '계좌이체', amount: f.amount, memo: '[고정비] ' + f.name, lockCategory: false });
    App.store.save(); u.toast('\'' + f.name + '\' (' + u.K(f.amount) + ') 내역이 지출에 반영되었습니다.');
  };
  Fx.applyAll = function () {
    var n = 0, s = 0;
    db().fixedExpenses.forEach(function (f) { if (!isApplied(f)) { var mo = App.state.month, p = App.cat.predict(f.name); db().transactions.push({ id: u.uid(), date: mo + '-' + u.pad(Math.min(f.day || 1, u.dim(mo))), type: 'EXPENSE', category: p.category, subcategory: p.subcategory || '고정비', payment: '계좌이체', amount: f.amount, memo: '[고정비] ' + f.name, lockCategory: false }); n++; s += f.amount; } });
    if (!n) { u.toast('이번 달에 반영할 고정비가 없습니다.', 'warning'); return; }
    App.store.save(); u.toast('고정비 ' + n + '건 · ' + u.K(s) + '을 이번 달 지출에 반영했습니다.');
  };
  Fx.open = function (id) {
    u.modal('fixed-modal', u.modalHead('fixed-modal-title', '월 고정비 추가', 'fixed-modal')
      + '<form onsubmit="App.fixed.save(event)" class="space-y-3"><input type="hidden" id="fixed-edit-id">'
      + u.field('fixed-name', '고정비 항목명', { ph: '예: 월세, 아파트 관리비, 실손보험료', attrs: 'required', cls: 'font-bold' })
      + u.field('fixed-day', '매월 출금일 (일)', { type: 'number', ph: '예: 25', attrs: 'required min="1" max="31"' })
      + u.field('fixed-amount', '월 금액 (원)', { money: true, attrs: 'required' })
      + '<div class="flex justify-end gap-2 pt-2"><button type="button" onclick="App.u.close(\'fixed-modal\')" class="px-3 py-1.5 bg-slate-100 text-xs rounded-lg">취소</button><button type="submit" class="px-3 py-1.5 bg-accent text-white text-xs font-semibold rounded-lg">저장하기</button></div></form>', 400);
    var f = id ? u.byId(db().fixedExpenses, id) : null;
    u.$('fixed-modal-title').innerText = f ? '월 고정비 수정' : '월 고정비 추가';
    u.$('fixed-edit-id').value = f ? f.id : ''; u.$('fixed-name').value = f ? f.name : ''; u.$('fixed-day').value = f ? f.day : ''; u.$('fixed-amount').value = f ? u.n0(f.amount) : '';
    u.open('fixed-modal');
  };
  Fx.save = function (e) {
    e.preventDefault();
    var id = u.val('fixed-edit-id'), f = id ? u.byId(db().fixedExpenses, id) : null;
    var rec = { name: u.val('fixed-name'), day: parseInt(u.val('fixed-day'), 10), amount: u.P(u.val('fixed-amount')) };
    if (f) Object.keys(rec).forEach(function (k) { f[k] = rec[k]; }); else { rec.id = u.uid(); db().fixedExpenses.push(rec); }
    App.store.save(); u.close('fixed-modal'); u.toast(f ? '고정비 항목이 수정되었습니다.' : '고정비가 추가되었습니다.');
  };
  Fx.remove = function (id) {
    u.confirm('고정비 삭제', '이 고정비 항목을 삭제하시겠습니까?', function () {
      db().fixedExpenses = db().fixedExpenses.filter(function (f) { return f.id !== Number(id); });
      App.store.save(); u.toast('고정비 항목이 삭제되었습니다.');
    });
  };

  App.views.add({
    id: 'fixed', order: 40, title: '월 고정비 & 카드 할부', nav: { label: '고정비 & 카드할부', icon: 'fa-calendar-check' },
    render: function (el) {
      var rec = recommendations().slice(0, 3), unapplied = db().fixedExpenses.filter(function (f) { return !isApplied(f); }).length;
      el.innerHTML = '<div class="bg-amber-50/80 border border-amber-200 rounded-2xl p-5 space-y-3"><div class="flex justify-between items-center"><h4 class="font-bold text-amber-900 text-xs flex items-center gap-2"><i class="fa-solid fa-wand-magic-sparkles text-amber-600"></i> 과거 지출 패턴 분석: 반복 고정비 자동 추천</h4><span class="text-[11px] text-amber-700">최근 반복 지출 감지</span></div>'
        + '<div class="grid grid-cols-1 md:grid-cols-3 gap-3">' + (rec.length ? rec.map(function (r, i) {
          return '<div class="bg-white p-3 rounded-xl border border-amber-200 shadow-sm flex justify-between items-center text-xs"><div><div class="font-bold text-slate-800">' + u.esc(r.memo) + '</div><div class="text-[11px] text-slate-400">과거 ' + r.count + '회 반복 (평균 ' + u.K(r.avg) + ')</div></div>'
            + '<button onclick="App.fixed.addRecommended(' + i + ')" class="bg-amber-500 hover:bg-amber-600 text-white px-2.5 py-1 rounded-lg font-bold text-[11px] shadow-sm">+ 고정비 전환</button></div>';
        }).join('') : '<div class="md:col-span-3 text-center text-amber-700/70 text-xs py-2">현재 추천할 새로운 반복 지출 항목이 없습니다.</div>') + '</div></div>'
        + '<div class="grid grid-cols-1 lg:grid-cols-2 gap-6">'
        + '<div class="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4"><div class="flex justify-between items-center pb-3 border-b border-slate-100 gap-2"><div><h3 class="font-bold text-slate-800">월 고정비 트래킹</h3><p class="text-xs text-slate-400 mt-0.5">\'반영하기\'를 누르면 ' + u.esc(u.monthLabel(App.state.month)) + ' 지출에 들어갑니다.</p></div>'
        + '<div class="flex gap-1.5 shrink-0">' + (unapplied ? '<button onclick="App.fixed.applyAll()" class="text-xs bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-emerald-800 font-semibold px-3 py-1.5 rounded-lg">' + unapplied + '건 모두 반영</button>' : '')
        + '<button onclick="App.fixed.open()" class="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 rounded-lg border border-slate-200">+ 고정비 추가</button></div></div>'
        + '<ul class="divide-y divide-slate-100 text-xs">' + (db().fixedExpenses.length ? db().fixedExpenses.map(function (f) {
          var btn = isApplied(f) ? '<span class="text-xs bg-slate-100 border border-slate-200 text-slate-500 font-semibold px-2.5 py-1 rounded-lg flex items-center gap-1"><i class="fa-solid fa-check text-[10px] text-emerald-600"></i> 반영완료</span>'
            : '<button onclick="App.fixed.apply(' + f.id + ')" class="text-xs bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-emerald-800 font-semibold px-2.5 py-1 rounded-lg flex items-center gap-1"><i class="fa-solid fa-plus text-[10px]"></i> 반영하기</button>';
          return '<li class="py-3 flex items-center justify-between gap-2"><div><div class="font-bold text-slate-700">' + u.esc(f.name) + '</div><div class="text-[11px] text-slate-400">매월 ' + f.day + '일 정기 출금</div></div>'
            + '<div class="flex items-center gap-1.5"><span class="font-bold text-slate-800 mr-1">' + u.K(f.amount) + '</span>' + btn
            + '<button onclick="App.fixed.open(' + f.id + ')" class="text-slate-400 hover:text-accent p-1"><i class="fa-solid fa-pen-to-square"></i></button><button onclick="App.fixed.remove(' + f.id + ')" class="text-slate-300 hover:text-red-500 p-1"><i class="fa-solid fa-xmark"></i></button></div></li>';
        }).join('') : '<li class="py-4 text-center text-slate-400">등록된 고정비가 없습니다.</li>') + '</ul></div>'
        + '<div class="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4"><div class="flex justify-between items-center pb-3 border-b border-slate-100"><div><h3 class="font-bold text-slate-800">신용카드 할부 현황</h3><p class="text-xs text-slate-400 mt-0.5">잔여 회차 및 남은 할부 잔액 집계</p></div>'
        + '<button onclick="App.inst.open()" class="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 rounded-lg border border-slate-200">+ 할부 수동 등록</button></div>'
        + '<ul id="installment-list" class="divide-y divide-slate-100 text-xs space-y-1">' + App.inst.panelHtml() + '</ul></div></div>';
    }
  });
})(window.App);

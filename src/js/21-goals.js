/* 목표 · 선저축 계획 : 먼저 저축하고 남은 돈으로 쓰기 · 목표별 자금(기한·월 적립) */
(function (App) {
  'use strict';
  var u = App.u, C = App.calc, G = App.goals = {};
  var db = function () { return App.db; };
  var FIXEDCAT = /주거|금융|보험|세금/;
  var editMode = null;   /* 선저축 입력 방식(금액/%) 화면 상태 */

  function plan(mo) {
    var b = C.incomeBase(mo), T = C.savingTarget(mo), tx = C.monthTx(mo), exp = C.sumType(tx, 'EXPENSE');
    return { b: b, T: T, avail: b.base - T, B: C.budgetTotal(mo), S: C.savedIn(mo), exp: exp, surplus: b.inc - exp, fixed: C.fixedTotal() + C.instSummary(mo).thisCharge };
  }
  function status(g, i) {
    var pl = +g.plan || 0;
    if (i.rem <= 0) return ['달성', 'bg-emerald-100 text-emerald-800'];
    if (i.ml != null && i.ml <= 0) return ['기한 경과', 'bg-red-100 text-red-700'];
    if (i.req == null) return ['기한 미정', 'bg-slate-100 text-slate-600'];
    if (pl >= i.req) return ['순항', 'bg-emerald-100 text-emerald-800'];
    return [pl ? '월 ' + u.K(i.req - pl) + ' 부족' : '적립 계획 필요', 'bg-amber-100 text-amber-800'];
  }
  function goalCard(g) {
    var i = C.goalInfo(g), s = status(g, i), thisM = u.sum(db().transactions.filter(function (t) { return t.goalId === g.id && String(t.date).indexOf(u.nowM()) === 0; }), function (t) { return t.amount; });
    return '<div class="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5"><div class="flex justify-between items-start gap-2"><div class="font-bold text-slate-800 text-sm">' + u.esc(g.name) + ' ' + C.badge(g.owner || 'J') + '</div><span class="text-[10px] font-bold px-2 py-0.5 rounded-full ' + s[1] + '">' + s[0] + '</span></div>'
      + '<div class="flex justify-between text-xs"><span>' + u.K(i.saved) + ' / <b>' + u.K(i.tgt) + '</b></span><span class="font-bold text-accent">' + i.pc.toFixed(0) + '%</span></div>' + u.bar(i.pc, 'bg-accent')
      + '<div class="grid grid-cols-3 gap-2 text-[11px] text-slate-500"><div>남은 금액<br><b class="text-slate-800">' + u.K(i.rem) + '</b></div><div>기한<br><b class="text-slate-800">' + (g.due ? u.esc(g.due) + (i.ml > 0 ? ' (' + i.ml + '개월)' : '') : '-') + '</b></div>'
      + '<div>필요 월 적립<br><b class="text-slate-800">' + (i.req == null ? '-' : u.K(i.req)) + '</b>' + (g.plan ? '<br>계획 ' + u.K(g.plan) : '') + '</div></div>'
      + '<div class="flex items-center gap-2 pt-1 border-t border-slate-200/70"><span class="text-[11px] text-slate-500">이번 달 ' + u.K(thisM) + '</span>'
      + '<input id="goal-c-' + g.id + '" type="text" data-money placeholder="' + (g.plan ? u.n0(g.plan) : '적립액') + '" class="ml-auto w-28 border border-slate-300 rounded-lg px-2 py-1.5 text-xs text-right">'
      + '<button onclick="App.goals.contrib(' + g.id + ')" class="text-xs bg-accent text-white px-3 py-1.5 rounded-lg font-semibold">적립</button>'
      + '<button onclick="App.goals.edit(' + g.id + ')" class="text-slate-400 hover:text-accent text-xs p-1" title="수정"><i class="fa-solid fa-pen-to-square"></i></button>'
      + '<button onclick="App.goals.remove(' + g.id + ')" class="text-slate-400 hover:text-red-500 text-xs p-1" title="삭제"><i class="fa-solid fa-trash-can"></i></button></div></div>';
  }
  G.form = function (g) {
    var f = u.$('goal-form'); if (!f) return;
    f.classList.remove('hidden');
    f.innerHTML = '<div class="grid grid-cols-2 lg:grid-cols-6 gap-3 text-xs">' + u.field('goal-name', '목표 이름', { ph: '예: 내 집 마련, 아이 교육비, 차 교체' })
      + '<div><label class="block font-semibold text-slate-600 mb-1 text-xs">누구의 목표</label><select id="goal-owner" class="' + u.IN + '">' + C.OW.map(function (c) { return '<option value="' + c + '">' + u.esc(c === 'J' ? '부부 공동' : C.nm(c)) + '</option>'; }).join('') + '</select></div>'
      + u.field('goal-target', '목표 금액 (원)', { money: true }) + u.field('goal-due', '목표 시점', { type: 'month' }) + u.field('goal-initial', '이미 모아 둔 돈 (원)', { money: true }) + u.field('goal-plan', '월 적립 계획 (원)', { money: true })
      + '</div><input type="hidden" id="goal-id"><div class="flex justify-end gap-2 mt-3"><button onclick="App.goals.cancel()" class="px-4 py-2 bg-slate-100 text-slate-600 rounded-lg text-xs">취소</button><button onclick="App.goals.save()" class="px-4 py-2 bg-accent text-white rounded-lg text-xs font-semibold">목표 저장</button></div>';
    u.$('goal-id').value = g ? g.id : ''; u.$('goal-name').value = g ? g.name : ''; u.$('goal-owner').value = g ? (g.owner || 'J') : 'J';
    u.setMoney('goal-target', g && g.target); u.$('goal-due').value = g && g.due ? g.due : ''; u.setMoney('goal-initial', g && g.initial); u.setMoney('goal-plan', g && g.plan);
    u.$('goal-name').focus();
  };
  G.edit = function (id) { G.form(u.byId(db().goals, id)); };
  G.cancel = function () { u.$('goal-form').classList.add('hidden'); };
  G.save = function () {
    var name = u.val('goal-name').trim(), tgt = u.P(u.val('goal-target'));
    if (!name || !tgt) { u.toast('목표 이름과 목표 금액을 입력하세요.', 'warning'); return; }
    var g = u.val('goal-id') ? u.byId(db().goals, u.val('goal-id')) : null;
    if (!g) { g = { id: Date.now() }; db().goals.push(g); }
    g.name = name; g.owner = u.val('goal-owner'); g.target = tgt; g.due = u.val('goal-due') || null; g.initial = u.P(u.val('goal-initial')); g.plan = u.P(u.val('goal-plan'));
    App.store.save(); u.toast('목표 \'' + name + '\'이(가) 저장되었습니다.');
  };
  G.contrib = function (id) {
    var g = u.byId(db().goals, id); if (!g) return;
    var amt = u.P(u.val('goal-c-' + id)) || (+g.plan || 0);
    if (!amt) { u.toast('적립할 금액을 입력하세요.', 'warning'); return; }
    db().transactions.push({ id: Date.now(), date: u.today(), type: 'TRANSFER', category: '자산이동', subcategory: '목표적립', payment: '계좌이체', amount: amt, memo: '[목표] ' + g.name, owner: g.owner || 'J', goalId: g.id });
    App.store.save(); u.toast('\'' + g.name + '\'에 ' + u.K(amt) + '을 적립했습니다. (이체 내역에 기록)');
  };
  G.remove = function (id) {
    var g = u.byId(db().goals, id); if (!g) return;
    u.confirm('목표 삭제', '[' + g.name + '] 목표를 삭제합니다. 이미 기록된 적립 이체 내역은 그대로 남습니다.', function () {
      db().goals = db().goals.filter(function (x) { return x.id !== g.id; }); App.store.save(); u.toast('목표가 삭제되었습니다.');
    });
  };
  G.setMode = function (m) { editMode = m; App.ui.render(); };
  G.setSave = function () {
    var s = db().settings; s.saveMode = u.val('save-mode');
    if (s.saveMode === 'pct') s.savePct = Math.max(0, Math.min(90, parseFloat(u.val('save-val')) || 0)); else s.saveTarget = u.P(u.val('save-val'));
    editMode = null; App.store.save(); u.toast('선저축 목표가 저장되었습니다.');
  };
  G.adjustBudgets = function () {
    var mo = App.state.month, p = plan(mo), bud = C.budgetFor(mo), keys = Object.keys(bud);
    if (!p.T) { u.toast('먼저 월 저축·투자 목표를 정하세요.', 'warning'); return; }
    var fixedSum = u.sum(keys.filter(function (k) { return FIXEDCAT.test(k); }), function (k) { return bud[k]; });
    var vars = keys.filter(function (k) { return !FIXEDCAT.test(k) && bud[k] > 0; }), varSum = u.sum(vars, function (k) { return bud[k]; }), room = p.avail - fixedSum;
    if (room <= 0 || !varSum) { u.toast('고정성 예산만으로 가용액을 넘습니다. 저축 목표나 고정비를 먼저 점검하세요.', 'warning'); return; }
    var f = Math.min(1, room / varSum);
    u.confirm('예산 선저축 기준 조정', '주거·금융·보험·세금 예산은 그대로 두고, 나머지 ' + vars.length + '개 카테고리 예산을 ' + Math.round(f * 100) + '% 수준으로 줄여 총액을 ' + u.K(p.avail) + ' 이내로 맞춥니다.', function () {
      var ch = {}; vars.forEach(function (k) { ch[k] = Math.floor(bud[k] * f / 1000) * 1000; });
      App.budget.change(ch, { msg: '예산을 선저축 기준으로 조정했습니다.' });
    });
  };

  function presaveHtml(mo) {
    var s = db().settings, p = plan(mo), over = p.B - p.avail, gl = (db().goals || []).map(C.goalInfo), reqSum = u.sum(gl.filter(function (i) { return i.req; }), function (i) { return i.req; }), pc = p.T ? p.S / p.T * 100 : 0;
    var mode = editMode || (s.saveMode === 'pct' ? 'pct' : 'amt');
    var val = mode === 'pct' ? (s.savePct || '') : (s.saveTarget ? u.n0(s.saveTarget) : '');
    return '<div class="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4"><div class="flex flex-wrap justify-between items-center gap-3 pb-3 border-b border-slate-100"><div><h3 class="font-bold text-slate-800 text-base"><i class="fa-solid fa-piggy-bank text-accent mr-2"></i>먼저 저축하고, 남은 돈으로 쓰기</h3>'
      + '<p class="text-xs text-slate-400 mt-0.5">수입이 들어오면 저축·투자 목표액부터 떼고, 나머지를 생활비 예산으로 나눕니다. (' + mo + ' 기준)</p></div>'
      + '<div class="flex items-center gap-2 text-xs"><select id="save-mode" onchange="App.goals.setMode(this.value)" class="border border-slate-300 rounded-lg px-2 py-2"><option value="amt"' + (mode === 'amt' ? ' selected' : '') + '>월 금액</option><option value="pct"' + (mode === 'pct' ? ' selected' : '') + '>수입 대비 %</option></select>'
      + '<input id="save-val" type="text" ' + (mode === 'amt' ? 'data-money ' : '') + 'value="' + val + '" placeholder="' + (mode === 'pct' ? '예: 30' : '예: 2,000,000') + '" class="w-32 border border-slate-300 rounded-lg px-2 py-2 text-right"><button onclick="App.goals.setSave()" class="bg-slate-900 text-white px-3.5 py-2 rounded-lg font-semibold">저장</button></div></div>'
      + '<div class="grid grid-cols-2 lg:grid-cols-5 gap-3">'
      + u.statCell('기준 수입', u.K(p.b.base), p.b.fromReg ? '이번 달 수입 기록이 없어 정기 수입 합계 사용' : '이번 달 수입 기록 합계')
      + u.statCell('저축·투자 목표', u.K(p.T), s.saveMode === 'pct' ? '수입의 ' + (+s.savePct || 0) + '%' : '월 고정 금액', 'text-accent')
      + u.statCell('생활비 가용액', u.K(p.avail), '이 안에 고정비+할부 ' + u.K(p.fixed) + ' 포함', p.avail < 0 ? 'text-red-600' : 'text-slate-800')
      + u.statCell('카테고리 예산 합계', u.K(p.B), over > 0 ? '가용액보다 ' + u.K(over) + ' 많음' : '가용액 이내', over > 0 ? 'text-red-600' : 'text-emerald-600')
      + u.statCell('이번 달 실제 저축·투자', u.K(p.S), (p.T ? '목표의 ' + pc.toFixed(0) + '% · ' : '') + '수입-지출 잉여 ' + u.K(p.surplus), p.T && p.S >= p.T ? 'text-emerald-600' : 'text-slate-800')
      + '</div>' + (p.T ? u.bar(pc, pc >= 100 ? 'bg-emerald-500' : 'bg-accent') : '')
      + '<div class="flex flex-wrap items-center gap-3 text-xs">'
      + (over > 0 && p.T ? '<div class="flex-1 min-w-[240px] bg-red-50 border border-red-200 text-red-800 rounded-lg px-3 py-2">예산을 다 쓰면 저축 목표를 지킬 수 없습니다. 예산을 ' + u.K(over) + ' 줄여야 합니다.</div><button onclick="App.goals.adjustBudgets()" class="bg-red-600 text-white px-3.5 py-2 rounded-lg font-semibold">예산 자동 조정</button>' : '')
      + (reqSum ? '<div class="flex-1 min-w-[240px] ' + (reqSum > p.T ? 'bg-amber-50 border-amber-200 text-amber-900' : 'bg-emerald-50 border-emerald-200 text-emerald-800') + ' border rounded-lg px-3 py-2">목표 달성에 필요한 월 적립 합계 <b>' + u.K(reqSum) + '</b> · 선저축 목표 ' + u.K(p.T) + (reqSum > p.T ? ' → 목표 시점을 늦추거나 저축액을 ' + u.K(reqSum - p.T) + ' 늘려야 합니다.' : ' 안에서 감당할 수 있습니다.') + '</div>' : '')
      + '<div class="text-[11px] text-slate-400 w-full">실제 저축·투자 = 이번 달 [이체 › 자산이동] 기록(투자매도 제외). 적금 납입·투자매수·목표적립·연금 납입을 이체로 기록하면 자동 집계됩니다.</div></div></div>';
  }

  App.views.add({
    id: 'goals', order: 90, title: '목표 · 선저축 계획', nav: { label: '목표 · 선저축 계획', icon: 'fa-flag-checkered', color: 'text-emerald-400' },
    render: function (el) {
      var list = (db().goals || []).slice().sort(function (a, b) { return (a.due || '9999') < (b.due || '9999') ? -1 : 1; });
      el.innerHTML = presaveHtml(App.state.month)
        + '<div class="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4"><div class="flex justify-between items-center pb-3 border-b border-slate-100 gap-3"><div><h3 class="font-bold text-slate-800 text-base"><i class="fa-solid fa-flag-checkered text-accent mr-2"></i>목표별 자금</h3>'
        + '<p class="text-xs text-slate-400 mt-0.5">목표마다 기한과 월 적립 계획을 두고, [적립]을 누르면 이체 내역에 기록되어 진행률이 올라갑니다.</p></div>'
        + '<button onclick="App.goals.form(null)" class="bg-slate-800 hover:bg-slate-900 text-white text-xs px-4 py-2 rounded-lg shrink-0"><i class="fa-solid fa-plus text-amber-400 mr-1"></i>목표 추가</button></div>'
        + '<div id="goal-form" class="hidden p-4 bg-amber-50/60 border border-amber-200 rounded-xl"></div>'
        + '<div class="grid grid-cols-1 lg:grid-cols-2 gap-4">' + (list.length ? list.map(goalCard).join('') : '<div class="text-xs text-slate-400 p-6 text-center border border-dashed border-slate-300 rounded-xl lg:col-span-2">아직 목표가 없습니다. 주택 자금, 자녀 교육비, 차량 교체, 여행처럼 쓸 곳이 정해진 돈을 목표로 등록해 보세요.</div>') + '</div></div>';
    }
  });
})(window.App);

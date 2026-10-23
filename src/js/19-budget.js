/* 예산 : 월별 예산(기본 + 이 달만) · 카테고리별 소진율 · 예산 알림(초과·경고·속도) · 지난달 기반 추천 */
(function (App) {
  'use strict';
  var u = App.u, C = App.calc, B = App.budget = {};
  var db = function () { return App.db; };
  var own = function (o, k) { return Object.prototype.hasOwnProperty.call(o, k); };

  /* ---------- 예산 알림 ---------- */
  B.alerts = function (mo) {
    mo = mo || App.state.month;
    var warn = +(db().settings.budgetWarn) || 80, b = C.budgetFor(mo), sp = {}, out = [], d = new Date(), cur = mo === u.nowM(), day = d.getDate(), dim = u.dim(mo);
    sp = C.budgetSpend(mo).byCat;   /* 할부 회차는 예산 밖 (고정비처럼) */
    Object.keys(b).forEach(function (c) {
      var bud = b[c]; if (!(bud > 0)) return;
      var s = sp[c] || 0, pc = s / bud * 100, lv = pc >= 100 ? 'over' : pc >= warn ? 'warn' : null;
      var pj = cur && day >= 10 && !C.FIXEDCAT.test(c) ? s / day * dim : 0;
      if (!lv && pj > bud * 1.05) lv = 'pace';
      if (lv) out.push({ c: c, b: bud, s: s, pc: pc, lv: lv, pj: pj });
    });
    return out.sort(function (a, b) { return b.pc - a.pc; });
  };
  B.alertHtml = function (a) {
    var m = { over: ['bg-red-50 border-red-200 text-red-800', 'fa-circle-exclamation', '예산 초과 ' + u.K(a.s - a.b)], warn: ['bg-amber-50 border-amber-200 text-amber-900', 'fa-triangle-exclamation', a.pc.toFixed(0) + '% 사용 · 잔여 ' + u.K(a.b - a.s)], pace: ['bg-sky-50 border-sky-200 text-sky-800', 'fa-gauge-high', '현재 속도면 월말 약 ' + u.K(a.pj) + ' (예산 대비 ' + (a.pj / a.b * 100).toFixed(0) + '%)'] }[a.lv];
    return '<div class="flex flex-wrap items-center gap-2 px-3 py-2 rounded-lg border text-xs ' + m[0] + '"><i class="fa-solid ' + m[1] + '"></i><b>' + u.esc(a.c) + '</b><span>' + m[2] + '</span><span class="ml-auto opacity-70">' + u.K(a.s) + ' / ' + u.K(a.b) + '</span></div>';
  };
  var seen = {};
  function notify(first) {
    var L = B.alerts().filter(function (a) { return a.lv !== 'pace'; }), fresh = [];
    L.forEach(function (a) { [a.lv, 'warn'].forEach(function (lv) { var k = App.state.month + a.c + lv; if (!seen[k]) { seen[k] = 1; if (lv === a.lv) fresh.push(a); } }); });
    if (first) return;   /* 시작할 때는 알림을 띄우지 않는다 : 홈의 [지금 할 일]과 종 아이콘에 이미 보인다 */
    else fresh.forEach(function (a) { u.toast(a.c + (a.lv === 'over' ? ' 예산 초과 (' + a.pc.toFixed(0) + '%)' : ' 예산 ' + a.pc.toFixed(0) + '% 사용'), 'warning'); });
  }
  App.on('saved', u.safe('예산 알림', function () { notify(false); }));
  B.boot = function () { setTimeout(u.safe('예산 알림', function () { notify(true); }), 2200); };
  B.setWarn = function (v) { db().settings.budgetWarn = Math.max(50, Math.min(100, +v || 80)); seen = {}; App.store.save(); u.toast('예산 경고 기준이 ' + db().settings.budgetWarn + '%로 저장되었습니다.'); };
  App.ui.headerItems.push([40, function () {
    var n = B.alerts().filter(function (a) { return a.lv !== 'pace'; }).length;
    return '<button onclick="App.ui.go(\'budget\')" title="' + (n ? '예산을 넘었거나 거의 다 쓴 항목 ' + n + '개' : '예산 알림 없음') + '" aria-label="예산 알림" class="hdr-icon"><i class="fa-regular fa-bell"></i>'
      + (n ? '<span class="dot">' + n + '</span>' : '') + '</button>';
  }]);

  /* ---------- 예산 바꾸기 : 이 달만 / 이 달부터 계속 ---------- */
  function firstTxMonth() {
    var mn = null; (db().transactions || []).forEach(function (t) { var m = String(t.date || '').slice(0, 7); if (/^\d{4}-\d{2}$/.test(m) && (!mn || m < mn)) mn = m; }); return mn;
  }
  function needAsk(mo) { var f = firstTxMonth(); return (f && f < mo) || Object.keys(db().budgetsByMonth).some(function (m) { return m !== mo; }); }
  function clean() { Object.keys(db().budgetsByMonth).forEach(function (m) { var o = db().budgetsByMonth[m]; if (!o || typeof o !== 'object' || !Object.keys(o).length) delete db().budgetsByMonth[m]; }); }
  function applyChange(mo, k, v, scope) {
    var base = db().budgets, bbm = db().budgetsByMonth;
    if (scope === 'month') {
      var ov = bbm[mo] || (bbm[mo] = {});
      if (v === (Number(base[k]) || 0)) delete ov[k]; else ov[k] = v;
      return;
    }
    /* 이 달부터 계속 : 지난달들은 지금 값을 고정하고 기본 예산을 바꾼다 */
    var old = Number(base[k]) || 0, f = firstTxMonth(), past = {}, i;
    if (f && f < mo) for (i = u.mIdx(f); i < u.mIdx(mo); i++) past[u.iMon(i)] = 1;
    Object.keys(bbm).forEach(function (m) { if (m < mo) past[m] = 1; });
    Object.keys(past).forEach(function (m) { var o = bbm[m] || (bbm[m] = {}); if (!own(o, k)) o[k] = old; });
    Object.keys(bbm).forEach(function (m) { if (m >= mo && bbm[m]) delete bbm[m][k]; });
    base[k] = v;
  }
  /* changes : { 카테고리: 새 금액 } */
  B.change = function (changes, opt) {
    var mo = App.state.month, cur = C.budgetFor(mo), keys = Object.keys(changes).filter(function (k) { return (Number(cur[k]) || 0) !== changes[k]; });
    if (!keys.length) { App.ui.render(); return; }
    var finish = function (scope) {
      if (scope !== 'month' && scope !== 'forward') { App.ui.render(); return; }
      keys.forEach(function (k) { applyChange(mo, k, changes[k], scope); }); clean();
      App.store.save();
      u.toast(opt && opt.msg ? opt.msg : (scope === 'month' ? mo + ' 예산만 변경했습니다. 다른 달은 그대로입니다.' : mo + '부터 기본 예산을 변경했습니다. 지난달 예산은 그대로 유지됩니다.'));
      if (opt && opt.after) opt.after();
    };
    if (!needAsk(mo)) { finish('forward'); return; }
    var label = u.monthLabel(mo);
    var lines = keys.slice(0, 6).map(function (k) { return '· ' + u.esc(k) + ': ' + u.K(cur[k]) + ' → <b>' + u.K(changes[k]) + '</b>'; }).join('<br>') + (keys.length > 6 ? '<br>· 외 ' + (keys.length - 6) + '개' : '');
    u.choose('예산을 언제부터 바꿀까요?', lines, [
      { label: label + '부터 계속', value: 'forward' },
      { label: label + '만', value: 'month', cls: 'border-transparent bg-slate-100 text-slate-700 hover:bg-slate-200' },
      { label: '취소', value: 'cancel', cls: 'border-transparent text-slate-500' }
    ]).then(finish);
  };
  B.edit = function (k, v) { var o = {}; o[k] = u.P(v); B.change(o); };
  B.editIdx = function (i, v) { var c = db().categories[i]; if (c) B.edit(c.name, v); };
  B.resetMonth = function () {
    var mo = App.state.month;
    u.confirm('이 달 전용 예산 해제', mo + '의 전용 예산을 지우고 기본 예산을 적용합니다.', function () { delete db().budgetsByMonth[mo]; App.store.save(); u.toast(mo + '에 기본 예산을 적용했습니다.'); });
  };
  B.recommend = function () {
    var mo = App.state.month, prev = u.addM(mo, -1), tx = C.monthTx(prev).filter(function (t) { return t.type === 'EXPENSE' && !C.isInstTx(t); });
    if (!tx.length) { u.toast('지난달(' + prev + ') 지출 데이터가 없습니다.', 'warning'); return; }
    var ch = {};
    db().categories.forEach(function (c) { var s = u.sum(tx.filter(function (t) { return t.category === c.name; }), function (t) { return t.amount; }); if (s > 0) ch[c.name] = Math.ceil(s * 1.05 / 1000) * 1000; });
    B.change(ch, {
      msg: '지난달(' + prev + ') 지출 기반 예산이 반영되었습니다.', after: function () {
        var T = C.savingTarget(mo), avail = C.incomeBase(mo).base - T, tot = C.budgetTotal(mo);
        if (T && tot > avail) setTimeout(function () { u.toast('지난달 기준 예산이 선저축 후 가용액보다 ' + u.K(tot - avail) + ' 많습니다. [목표 · 선저축]에서 조정하세요.', 'warning'); }, 600);
      }
    });
  };

  /* ---------- 화면 : 남은 예산 요약 → 항목별 예산(바로 고치기) → 알림 기준 ---------- */
  App.views.add({
    id: 'budget', order: 60, title: '예산', nav: { label: '예산', icon: 'fa-chart-simple' },
    render: function (el) {
      var mo = App.state.month, bud = C.budgetFor(mo), ov = C.monthOverride(mo), n = Object.keys(ov).length;
      var T = C.savingTarget(mo), base = C.incomeBase(mo).base, avail = base - T, tot = C.budgetTotal(mo), over = tot - avail;
      var bs = C.budgetSpend(mo), spent = bs.byCat, spentAll = bs.total;
      var left = tot - spentAll, pc = tot ? Math.min(100, spentAll / tot * 100) : 0, m = parseInt(mo.slice(5), 10);
      var won = function (v) { return u.n0(v) + '원'; };
      var plan = !T ? '<p class="text-[14px] text-slate-600 mt-4 leading-relaxed">저축 목표를 먼저 정해 두면, 예산이 <b>쓸 수 있는 돈</b> 안에 들어오는지 알려 드려요. <button onclick="App.ui.go(\'goals\')" class="more">저축 목표 정하기</button></p>'
        : '<div class="mt-4 p-3.5 rounded-xl text-[14px] leading-relaxed ' + (over > 0 ? 'bg-red-50 text-red-800' : 'bg-slate-50 text-slate-700') + '">수입 ' + won(base) + ' − 저축 목표 ' + won(T) + ' = 쓸 수 있는 돈 <b>' + won(avail) + '</b><br>'
          + (over > 0 ? '예산 합계가 쓸 수 있는 돈보다 <b>' + won(over) + '</b> 많아요. 예산을 줄이거나 저축 목표를 다시 보세요.' : '예산 합계가 쓸 수 있는 돈 안에 있어요 (여유 ' + won(-over) + ').') + '</div>';
      var rows = db().categories.map(function (c, i) {
        var bv = bud[c.name] || 0, sv = spent[c.name] || 0, rem = bv - sv, rate = bv > 0 ? sv / bv * 100 : 0;
        return '<div class="bud-row"><div class="flex items-center gap-2.5 min-w-0"><span class="txn-dot" style="background:' + u.esc(c.color) + '"></span><b class="truncate">' + u.esc(c.name) + '</b>' + (own(ov, c.name) ? '<span class="pill mute">이 달만</span>' : '') + '</div>'
          + '<div class="bud-in"><input type="text" data-money inputmode="numeric" value="' + (bv ? u.n0(bv) : '') + '" placeholder="예산 없음" onchange="App.budget.editIdx(' + i + ', this.value)" aria-label="' + u.esc(c.name) + ' 예산"><span>원</span></div>'
          + '<div class="col-span-2"><div class="track" style="height:6px"><div class="fill" style="width:' + Math.min(100, rate) + '%;background:' + (rate >= 100 ? '#E5484D' : rate >= 80 ? '#E8A10A' : '#0B7A57') + '"></div></div>'
          + '<div class="flex justify-between text-[13px] mt-1.5"><span class="text-slate-500">쓴 돈 ' + won(sv) + '</span>' + (bv ? '<span class="' + (rem < 0 ? 'text-red-600 font-semibold' : 'text-slate-600') + '">' + (rem < 0 ? won(-rem) + ' 넘음' : won(rem) + ' 남음') + '</span>' : '') + '</div></div></div>';
      }).join('');
      el.innerHTML = '<div class="card"><div class="sub">' + m + '월 예산</div>'
        + (tot ? '<div class="big mt-1">' + (left < 0 ? '<span class="text-red-600">' + won(-left) + ' 넘었어요</span>' : won(left) + ' 남았어요') + '</div><div class="sub mt-1">예산 ' + won(tot) + ' 중 ' + won(spentAll) + ' 썼어요</div>'
          + '<div class="track mt-4"><div class="fill" style="width:' + pc + '%;background:' + (left < 0 ? '#E5484D' : '#0B7A57') + '"></div></div>'
          : '<div class="big mt-1">아직 예산이 없어요</div><p class="sub mt-2">아래 항목에 금액을 넣거나, 지난달 쓴 만큼으로 한 번에 채울 수 있어요.</p>')
        + (bs.inst ? '<p class="text-[13px] text-slate-500 mt-3">카드 할부 ' + won(bs.inst) + '은 이미 정해진 돈이라 고정비처럼 따로 묶고, 예산에는 넣지 않았어요.</p>' : '')
        + plan + '</div>'
        + '<div class="card"><div class="card-h"><h3>항목별 예산</h3><button onclick="App.budget.recommend()" class="btn sec" style="height:38px"><i class="fa-solid fa-wand-magic-sparkles"></i>지난달 쓴 만큼 채우기</button></div>'
        + '<p class="text-[13px] text-slate-500 -mt-2 mb-2">금액을 고치면 이 달만 바꿀지, 이 달부터 계속 쓸지 물어봐요.' + (n ? ' 지금 이 달만 다르게 정한 항목이 ' + n + '개 있어요. <button onclick="App.budget.resetMonth()" class="more">기본 예산으로 되돌리기</button>' : '') + '</p>'
        + '<div id="budget-inline-container" class="bud-grid">' + rows + '</div></div>'
        + '<div class="card flex flex-wrap items-center gap-2 text-[14px] text-slate-700"><b class="text-slate-900 mr-1">알림</b>예산의 <input type="number" min="50" max="100" value="' + ((db().settings.budgetWarn) || 80) + '" onchange="App.budget.setWarn(this.value)" class="w-20 border border-slate-300 rounded-lg px-2 py-2 text-right" aria-label="알림 기준 %">% 를 쓰면 알려 드려요.</div>';
    }
  });
})(window.App);

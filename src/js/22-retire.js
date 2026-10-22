/* 부부 은퇴자금 시뮬레이터 : 두 사람의 나이·은퇴·연금 개시 · 1인 생존기 · 유족연금 · 필요 월 저축 */
(function (App) {
  'use strict';
  var u = App.u, C = App.calc, R = App.retire = {};
  var db = function () { return App.db; };
  var num = function (id) { return parseFloat(String(u.val(id) || '').replace(/,/g, '')) || 0; };

  var PA = [['aAge', '현재 나이'], ['aRet', '은퇴 나이'], ['aLife', '기대수명'], ['aPen', '공적연금 월 예상액 (현재가치)', 1], ['aPAge', '연금 개시 나이']];
  var PB = PA.map(function (f) { return ['b' + f[0].slice(1), f[1], f[2]]; });
  var PH = [['assets', '현재 은퇴 준비자산 (원)', 1], ['save', '부부 월 저축·투자액 (원)', 1], ['shareA', '저축 중 남편 소득 몫 (%)'], ['growth', '저축액 연 증가율 (%)'],
    ['pre', '은퇴 전 수익률 (%)'], ['post', '은퇴 후 수익률 (%)'], ['infl', '물가상승률 (%)'], ['cost', '부부 월 생활비 (현재가치, 원)', 1], ['surv', '1인 생존 시 생활비 (%)'], ['survPen', '유족연금 비율 (%)']];
  var ALL = PA.concat(PB, PH);

  function pensionOf(o) {
    var l = db().assets.filter(function (a) { return a.subType === '국민연금' && (a.owner || 'J') === o; });
    return { m: u.sum(l, function (a) { return a.pensionMonthly; }), age: l.length ? (l[0].pensionStartAge || 65) : 65 };
  }
  R.defaults = function () {
    var s = db().settings, y = new Date().getFullYear(), aAge = s.husbandBirthYear ? y - s.husbandBirthYear : 40, bAge = s.wifeBirthYear ? y - s.wifeBirthYear : aAge, mo = App.state.month;
    var pa = pensionOf('H'), pb = pensionOf('W');
    var assets = u.sum(db().assets.filter(function (a) { return a.subType !== '전세보증금' && a.subType !== '국민연금'; }), function (a) { return C.assetValue(a, mo); }) + C.investTotal();
    var inc = {}, ex = {};
    db().transactions.forEach(function (t) { var m = String(t.date || '').slice(0, 7); if (t.type === 'INCOME') inc[m] = (inc[m] || 0) + t.amount; if (t.type === 'EXPENSE') ex[m] = (ex[m] || 0) + t.amount; });
    var ms = Object.keys(ex).sort().slice(-3), ae = ms.length ? u.sum(ms, function (m) { return ex[m]; }) / ms.length : 0, sv = ms.length ? u.sum(ms, function (m) { return (inc[m] || 0) - ex[m]; }) / ms.length : 0;
    var tgt = C.savingTarget(mo), h = +s.husbandIncome || 0, w = +s.wifeIncome || 0;
    return { aAge: aAge, aRet: 60, aLife: 88, aPen: pa.m, aPAge: pa.age, bAge: bAge, bRet: 60, bLife: 92, bPen: pb.m, bPAge: pb.age,
      assets: Math.round(assets), save: Math.max(0, Math.round((tgt || sv) / 1e4) * 1e4), shareA: h + w > 0 ? Math.round(h / (h + w) * 100) : 50, growth: 2,
      pre: 5, post: 3, infl: 2.5, cost: Math.max(2e6, Math.round(ae * 0.7 / 1e4) * 1e4), surv: 70, survPen: 50 };
  };
  function setForm(o) { ALL.forEach(function (f) { var el = u.$('q-' + f[0]); if (el) el.value = f[2] ? u.n0(+o[f[0]] || 0) : (o[f[0]] != null ? o[f[0]] : ''); }); }
  function readForm() { var o = {}; ALL.forEach(function (f) { o[f[0]] = num('q-' + f[0]); }); o.shareA = Math.min(100, Math.max(0, o.shareA)) / 100; return o; }

  /* 한 해의 상태 : 생존·근로 여부, 연금(유족연금 포함), 생활비 */
  function step(p, y) {
    var aA = p.aAge + y, bA = p.bAge + y, aL = aA < p.aLife, bL = bA < p.bLife, f = Math.pow(1 + p.infl / 100, y);
    var aW = aL && aA < p.aRet, bW = bL && bA < p.bRet, aP = aA >= p.aPAge ? p.aPen : 0, bP = bA >= p.bPAge ? p.bPen : 0, sp = p.survPen / 100;
    var pen = aL && bL ? aP + bP : aL ? Math.max(aP + p.bPen * sp * 0.3, p.bPen * sp) : bL ? Math.max(bP + p.aPen * sp * 0.3, p.aPen * sp) : 0;
    var alive = (aL ? 1 : 0) + (bL ? 1 : 0);
    return { aA: aA, bA: bA, alive: alive, work: aW || bW, share: (aW ? p.shareA : 0) + (bW ? 1 - p.shareA : 0), pen: pen * 12 * f, cost: alive ? p.cost * 12 * f * (alive === 2 ? 1 : p.surv / 100) : 0 };
  }
  function span(p) { return Math.max(p.aLife - p.aAge, p.bLife - p.bAge, 0); }
  function retY(p) { return Math.max(0, Math.min(p.aRet - p.aAge, p.aLife - p.aAge), Math.min(p.bRet - p.bAge, p.bLife - p.bAge)); }
  R.sim = function (p, sv) {
    var bal = p.assets, rows = [], depl = null, atR = null, n = span(p), rY = retY(p);
    for (var y = 0; y < n; y++) {
      var s = step(p, y);
      if (y === rY) atR = bal;
      if (s.work) bal = bal * (1 + p.pre / 100) + (sv * 12 * Math.pow(1 + p.growth / 100, y) * s.share + s.pen) * (1 + p.pre / 200);
      else { bal = (bal - (s.cost - s.pen)) * (1 + p.post / 100); if (bal < 0) { if (!depl) depl = s; bal = 0; } }
      rows.push({ aA: s.aA + 1, bA: s.bA + 1, n: bal, r: bal / Math.pow(1 + p.infl / 100, y + 1) });
    }
    if (atR == null) atR = bal;
    return { rows: rows, depl: depl, atR: atR, end: bal };
  };
  function need(p) { var rY = retY(p), s = 0; for (var y = rY; y < span(p); y++) { var x = step(p, y); if (!x.work) s += (x.cost - x.pen) / Math.pow(1 + p.post / 100, y - rY); } return Math.max(0, s); }
  function events(p) {
    var E = [], A = C.short('H'), B = C.short('W'), add = function (a0, at, l) { if (at - a0 >= 0) E.push({ y: at - a0, label: l }); };
    add(p.aAge, p.aRet, A + ' 은퇴'); add(p.bAge, p.bRet, B + ' 은퇴'); add(p.aAge, p.aPAge, A + ' 연금 개시'); add(p.bAge, p.bPAge, B + ' 연금 개시');
    add(p.aAge, p.aLife, A + ' 기대수명 도달 → 1인 가구'); add(p.bAge, p.bLife, B + ' 기대수명 도달 → 1인 가구');
    return E.sort(function (a, b) { return a.y - b.y; });
  }
  var chartInst = null;
  R.run = function (persist) {
    var out = u.$('q-out'), p = readForm(); if (!out) return;
    if (persist) { db().retire2 = {}; ALL.forEach(function (f) { db().retire2[f[0]] = num('q-' + f[0]); }); App.store.save({ quiet: true }); }
    var bad = [['a', C.short('H')], ['b', C.short('W')]].filter(function (x) { return !(p[x[0] + 'Ret'] >= p[x[0] + 'Age'] && p[x[0] + 'Life'] > p[x[0] + 'Ret']); });
    if (bad.length) { out.innerHTML = '<div class="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">' + u.esc(bad.map(function (x) { return x[1]; }).join(', ')) + '의 나이 조건을 확인하세요 (현재 나이 ≤ 은퇴 나이 < 기대수명).</div>'; return; }
    var s = R.sim(p, p.save), nd = need(p), rY = retY(p), inf = Math.pow(1 + p.infl / 100, rY), ratio = nd > 0 ? s.atR / nd * 100 : 100, req = 0;
    if (s.depl) { if (R.sim(p, 5e7).depl) req = null; else { var lo = 0, hi = 5e7; for (var i = 0; i < 40; i++) { var m = (lo + hi) / 2; if (R.sim(p, m).depl) lo = m; else hi = m; } req = Math.ceil(hi / 1e4) * 1e4; } }
    var A = u.esc(C.short('H')), B = u.esc(C.short('W')), ok = !s.depl, Y = new Date().getFullYear();
    var card = function (t, v, sub, c) { return '<div class="p-4 bg-white rounded-xl border border-slate-200 shadow-sm"><div class="text-[11px] font-semibold text-slate-400">' + t + '</div><div class="text-lg font-extrabold ' + (c || 'text-slate-800') + '">' + v + '</div><div class="text-[11px] text-slate-400 mt-0.5">' + sub + '</div></div>'; };
    var penNow = p.aPen + p.bPen, repl = p.cost > 0 ? penNow / p.cost * 100 : 0;
    var sc = [-1, 0, 1].map(function (d) {
      var q = Object.assign({}, p, { pre: p.pre + d, post: p.post + d }), r = R.sim(q, q.save);
      return '<tr class="border-t border-slate-100"><td class="p-2">' + (d ? (d > 0 ? '낙관 (+1%p)' : '보수 (-1%p)') : '기준') + '</td><td class="p-2 text-right">' + u.K(r.atR) + '</td><td class="p-2 ' + (r.depl ? 'text-red-600' : 'text-emerald-600') + '">' + (r.depl ? A + ' ' + r.depl.aA + '세 · ' + B + ' ' + r.depl.bA + '세에 고갈' : '두 사람 기대수명까지 유지 (잔액 ' + u.K(r.end) + ')') + '</td></tr>';
    }).join('');
    var ev = events(p).map(function (e) { var bal = e.y === 0 ? p.assets : (s.rows[e.y - 1] || {}).n; return '<tr class="border-t border-slate-100"><td class="p-2">' + (Y + e.y) + '년</td><td class="p-2 text-center">' + (p.aAge + e.y) + ' / ' + (p.bAge + e.y) + '</td><td class="p-2">' + u.esc(e.label) + '</td><td class="p-2 text-right">' + u.K(bal) + '</td></tr>'; }).join('');
    out.innerHTML = '<div class="p-4 rounded-xl border text-sm font-bold ' + (ok ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800') + '">'
      + (ok ? '현재 계획이면 두 사람 모두 기대수명(' + A + ' ' + p.aLife + '세 · ' + B + ' ' + p.bLife + '세)까지 자금이 유지됩니다.' : '현재 계획이면 ' + A + ' ' + s.depl.aA + '세 · ' + B + ' ' + s.depl.bA + '세 무렵 자금이 고갈됩니다.') + '</div>'
      + '<div class="grid grid-cols-2 lg:grid-cols-5 gap-4">' + card('두 사람 모두 은퇴할 때 자산', u.K(s.atR), (Y + rY) + '년 · 현재가치 ' + u.K(s.atR / inf)) + card('필요 은퇴자산', u.K(nd), '현재가치 ' + u.K(nd / inf))
      + card('자금 충족률', ratio.toFixed(0) + '%', '예상 ÷ 필요', ratio >= 100 ? 'text-emerald-600' : ratio >= 70 ? 'text-amber-600' : 'text-red-600')
      + card('필요 월 저축', req == null ? '산출 불가' : req === 0 ? '추가 불필요' : u.K(req), '현재 ' + u.K(p.save) + (req > p.save ? ' · 월 ' + u.K(req - p.save) + ' 부족' : ''), req == null || req > p.save ? 'text-red-600' : 'text-emerald-600')
      + card('공적연금 소득대체율', repl.toFixed(0) + '%', '부부 연금 ' + u.K(penNow) + ' ÷ 생활비 ' + u.K(p.cost), repl >= 50 ? 'text-emerald-600' : 'text-amber-600') + '</div>'
      + '<div class="bg-white p-5 rounded-xl border border-slate-200 shadow-sm"><div class="text-xs font-bold text-slate-700 mb-2">연도별 자산 추이 <span class="font-normal text-slate-400">(가로축: ' + A + ' 나이 / ' + B + ' 나이)</span></div><div style="height:260px"><canvas id="q-chart"></canvas></div></div>'
      + '<div class="grid grid-cols-1 lg:grid-cols-2 gap-4"><div class="bg-white p-5 rounded-xl border border-slate-200 shadow-sm overflow-x-auto"><div class="text-xs font-bold text-slate-700 mb-2">부부 생애 이벤트</div><table class="w-full text-xs"><thead><tr class="text-slate-500 bg-slate-50"><th class="p-2 text-left">연도</th><th class="p-2">' + A + ' / ' + B + '</th><th class="p-2 text-left">이벤트</th><th class="p-2 text-right">그 시점 자산</th></tr></thead><tbody>' + ev + '</tbody></table></div>'
      + '<div class="bg-white p-5 rounded-xl border border-slate-200 shadow-sm overflow-x-auto"><div class="text-xs font-bold text-slate-700 mb-2">수익률 시나리오</div><table class="w-full text-xs"><thead><tr class="text-slate-500 bg-slate-50"><th class="p-2 text-left">시나리오</th><th class="p-2 text-right">은퇴 시점 자산</th><th class="p-2 text-left">결과</th></tr></thead><tbody>' + sc + '</tbody></table></div></div>'
      + '<div class="text-[11px] text-slate-400 leading-relaxed">※ 한 사람만 은퇴한 기간에는 은퇴한 사람의 소득 몫만큼 저축이 줄고, 생활비는 남은 근로소득으로 충당한다고 가정합니다. 두 사람이 모두 은퇴하면 자산에서 생활비를 꺼내 쓰고 연금으로 일부를 메웁니다. 한 사람이 떠난 뒤에는 생활비를 설정 비율로 줄이고, 남은 사람은 \'본인 연금 + 유족연금의 30%\'와 \'유족연금\' 중 큰 쪽을 받는다고 봅니다. 세금·건강보험료·주택(전세보증금 포함)은 반영하지 않은 단순 시뮬레이션이며 투자 결과를 보장하지 않습니다.</div>';
    var cv = u.$('q-chart');
    if (window.Chart && cv) {
      if (chartInst) { try { chartInst.destroy(); } catch (e) {} }
      chartInst = new Chart(cv, { type: 'line', data: { labels: s.rows.map(function (r) { return r.aA + '/' + r.bA; }), datasets: [{ label: '명목 자산', data: s.rows.map(function (r) { return Math.round(r.n); }), borderColor: '#2E6F40', tension: .2, pointRadius: 0 }, { label: '현재가치', data: s.rows.map(function (r) { return Math.round(r.r); }), borderColor: '#F59E0B', borderDash: [4, 4], tension: .2, pointRadius: 0 }] },
        options: { maintainAspectRatio: false, plugins: { tooltip: { callbacks: { label: function (c) { return c.dataset.label + ': ' + u.K(c.parsed.y); } } } }, scales: { y: { ticks: { callback: function (v) { return (v / 1e8).toFixed(1) + '억'; } } } } } });
    }
  };
  R.auto = function () { setForm(R.defaults()); R.run(true); u.toast('가계부 데이터로 나이·연금·자산·저축·생활비를 채웠습니다.'); };

  App.views.add({
    id: 'retire', order: 100, title: '부부 은퇴자금 시뮬레이터', nav: { label: '부부 은퇴자금 시뮬레이터', icon: 'fa-umbrella-beach', color: 'text-rose-400' },
    render: function (el) {
      var inp = function (f) { return u.field('q-' + f[0], f[1], { money: !!f[2], on: 'App.retire.run(1)' }); };
      var col = function (title, icon, list, cls) { return '<div class="p-4 rounded-xl border space-y-3 ' + cls + '"><div class="font-bold text-slate-800 text-xs"><i class="fa-solid ' + icon + ' mr-1.5"></i>' + title + '</div><div class="grid grid-cols-2 gap-3">' + list.map(inp).join('') + '</div></div>'; };
      el.innerHTML = '<div class="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4"><div class="flex flex-wrap justify-between items-center gap-3 pb-3 border-b border-slate-100"><div><h3 class="font-bold text-slate-800 text-base"><i class="fa-solid fa-umbrella-beach text-rose-500 mr-2"></i>부부 은퇴자금 시뮬레이터</h3>'
        + '<p class="text-xs text-slate-400 mt-0.5">두 사람의 나이·은퇴 시기·연금 개시를 따로 넣고, 한 사람이 먼저 떠난 뒤의 생활비와 유족연금까지 반영합니다.</p></div>'
        + '<button onclick="App.retire.auto()" class="text-xs bg-emerald-700 hover:bg-emerald-800 text-white px-3.5 py-2 rounded-lg"><i class="fa-solid fa-rotate mr-1"></i>가계부 데이터로 자동 채우기</button></div>'
        + '<div class="grid grid-cols-1 lg:grid-cols-3 gap-4">' + col(u.esc(C.nm('H')), 'fa-user text-sky-600', PA, 'bg-sky-50/50 border-sky-200') + col(u.esc(C.nm('W')), 'fa-user text-rose-600', PB, 'bg-rose-50/50 border-rose-200') + col('가계 공통', 'fa-house text-slate-600', PH, 'bg-slate-50 border-slate-200') + '</div>'
        + '<div class="text-[11px] text-slate-400">자동 채우기: 나이는 [설정 › 부부 재무 규칙]의 출생연도, 연금은 명의별 \'국민연금\' 자산, 준비자산은 예적금·연금계좌·투자 합계(전세보증금 제외), 저축액은 선저축 목표(없으면 최근 3개월 평균 잉여)에서 가져옵니다.</div></div>'
        + '<div id="q-out" class="space-y-4"></div>';
      setForm(Object.assign({}, R.defaults(), db().retire2 || {}));
      R.run(false);
    }
  });
})(window.App);

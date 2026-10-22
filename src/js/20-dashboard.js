/* 대시보드 : 이번 달 페이스 · 흐름 분석 · 예산 알림 · 재무 건강진단 · 부부 재무 현황 · 핵심 지표 · 차트 · 달력 */
(function (App) {
  'use strict';
  var u = App.u, C = App.calc, D = App.dash = {};
  var db = function () { return App.db; };
  var charts = {};
  function chart(id, cfg) {
    var cv = u.$(id); if (!cv || !window.Chart) return;
    if (charts[id]) { try { charts[id].destroy(); } catch (e) {} }
    var old = Chart.getChart && Chart.getChart(cv); if (old) old.destroy();
    charts[id] = new Chart(cv, cfg);
  }

  /* 순자산 월별 기록 : 이번 달을 보고 있을 때 자동으로 남긴다 */
  App.on('render', u.safe('순자산 기록', function () {
    var mo = App.state.month; if (mo !== u.nowM()) return;
    var n = C.netWorth(mo); if (!n.assets && !n.debt) return;
    var c = db().snapshots[mo];
    if (!c || c.nw !== n.nw || c.assets !== n.assets || c.debt !== n.debt) { db().snapshots[mo] = { nw: n.nw, assets: n.assets, debt: n.debt }; App.store.save({ quiet: true }); }
  }));
  D.setTarget = function (v) { db().settings.targetNetWorth = Math.max(0, u.P(v)); App.store.save(); u.toast('목표 순자산이 저장되었습니다.'); };

  function analysisHtml(mo) {
    var tx = C.monthTx(mo), inc = C.sumType(tx, 'INCOME'), exp = C.sumType(tx, 'EXPENSE'), cs = {}, maxCat = '-', maxAmt = 0;
    tx.filter(function (t) { return t.type === 'EXPENSE'; }).forEach(function (t) { cs[t.category] = (cs[t.category] || 0) + t.amount; });
    Object.keys(cs).forEach(function (c) { if (cs[c] > maxAmt) { maxAmt = cs[c]; maxCat = c; } });
    var days = {}; tx.forEach(function (t) { if (t.type === 'EXPENSE') days[parseInt(String(t.date).slice(8, 10), 10)] = 1; });
    var noSpend = u.dim(mo) - Object.keys(days).length, rate = inc > 0 ? Math.round((inc - exp) / inc * 100) : 0;
    return '<div class="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white p-6 rounded-2xl shadow-lg space-y-3"><div class="flex items-center justify-between border-b border-slate-700/80 pb-3 gap-2">'
      + '<div class="flex items-center gap-3"><div class="w-10 h-10 rounded-xl bg-accent/30 border border-accent/40 flex items-center justify-center text-accent-border text-lg"><i class="fa-solid fa-chart-line"></i></div>'
      + '<div><h3 class="font-bold text-base text-amber-300">' + parseInt(mo.slice(5), 10) + '월 지출 및 재정 흐름 종합 분석</h3><p class="text-xs text-slate-300 mt-0.5">당월 수입 대비 지출 패턴 및 세분화 카테고리 소비를 실시간 진단합니다.</p></div></div>'
      + '<button onclick="App.ui.go(\'report\')" class="text-xs bg-slate-800 text-amber-300 px-3 py-1.5 rounded-full border border-slate-700 font-semibold hover:bg-slate-700 shrink-0"><i class="fa-solid fa-file-lines mr-1"></i>월말 리포트</button></div>'
      + '<div id="dash-expense-analysis-text" class="text-xs text-slate-200 leading-relaxed pt-1 space-y-1">'
      + '<div>• <strong>월 잉여 자금 및 저축률:</strong> 당월 수입 <span class="text-emerald-300 font-bold">' + u.K(inc) + '</span> 대비 지출은 <span class="text-amber-300 font-bold">' + u.K(exp) + '</span>로, 약 <strong>' + rate + '%</strong>의 여유자금을 확보했습니다.</div>'
      + '<div>• <strong>최대 지출 분야:</strong> 이번 달 최고 지출 카테고리는 <span class="text-amber-300 font-bold">' + u.esc(maxCat) + ' (' + u.K(maxAmt) + ')</span> 입니다.</div>'
      + '<div>• <strong>무지출 데이 실천:</strong> 이번 달 지출이 없었던 날은 총 <strong class="text-emerald-300">' + noSpend + '일 🎉</strong> 입니다.</div></div></div>';
  }
  function healthHtml(mo) {
    var m = C.health(mo), pr = m.target > 0 ? Math.max(0, Math.min(100, m.nw / m.target * 100)) : 0;
    var tone = function (v, bad, warn, rev) { var b = rev ? v < bad : v >= bad, w = rev ? v < warn : v >= warn; return b ? 'text-red-600' : (w ? 'text-amber-600' : 'text-emerald-600'); };
    var nonliq = db().assets.some(function (a) { return C.NONLIQ[a.subType]; }) ? ' (연금·보증금 제외)' : '';
    return '<div id="dash-health" class="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4"><div class="flex items-center justify-between"><h3 class="font-bold text-slate-800 text-sm"><i class="fa-solid fa-stethoscope text-accent mr-1.5"></i>재무 건강진단</h3><span class="text-[11px] text-slate-400">유동자산·부채·소득 기준 자동 계산</span></div>'
      + '<div class="grid grid-cols-2 lg:grid-cols-4 gap-3">'
      + u.statCell('비상자금 (권장 3~6개월)', m.efMonths == null ? '-' : m.efMonths.toFixed(1) + '개월', '유동자산 ' + u.K(m.liq) + ' ÷ 월평균 지출 ' + u.K(m.avgExp) + nonliq, m.efMonths == null ? 'text-slate-400' : tone(m.efMonths, 3, 6, true))
      + u.statCell('월 부채상환 부담 (DSR 근사)', m.dsr == null ? '-' : m.dsr.toFixed(0) + '%', '대출·할부 월 상환 ' + u.K(m.debtPay) + ' · 40% 이하 권장', m.dsr == null ? 'text-slate-400' : tone(m.dsr, 40, 30))
      + u.statCell('당월 저축률', m.saveRate == null ? '-' : m.saveRate.toFixed(0) + '%', '투자 이체 ' + u.K(m.invT) + ' 별도', m.saveRate == null ? 'text-slate-400' : tone(m.saveRate, 10, 20, true))
      + u.statCell('금융자산 중 투자 비중', m.invShare.toFixed(0) + '%', '투자 ' + u.K(m.invs) + ' / 예·적금 ' + u.K(m.liq) + nonliq, 'text-slate-700') + '</div>'
      + '<div class="flex flex-wrap items-center gap-3 text-xs"><span class="font-semibold text-slate-600">목표 순자산</span><input type="text" data-money value="' + u.n0(m.target) + '" onchange="App.dash.setTarget(this.value)" class="w-40 border border-slate-300 rounded-lg px-2 py-1.5 text-right">'
      + '<div class="flex-1 min-w-[160px]"><div class="h-2 bg-slate-100 rounded-full overflow-hidden"><div class="h-full bg-accent" style="width:' + pr + '%"></div></div></div><span class="font-bold text-slate-700">' + (m.target > 0 ? pr.toFixed(1) + '% 달성' : '목표를 입력하세요') + '</span></div>'
      + '<div><div class="text-[11px] font-semibold text-slate-500 mb-1">순자산 추이 (월별 자동 기록)</div>' + (Object.keys(db().snapshots).length ? '<div style="height:150px"><canvas id="dash-trend"></canvas></div>' : '<div class="text-xs text-slate-400 py-6 text-center">이번 달 자산·부채를 등록하면 월별 추이가 기록됩니다.</div>') + '</div></div>';
  }
  function coupleHtml(mo) {
    var s = db().settings, r = C.coupleStats(mo), totE = r.exp.J + r.exp.H + r.exp.W, nw = C.nwByOwner(mo);
    var box = function (t, body) { return '<div class="p-4 rounded-lg bg-slate-50 border border-slate-200 space-y-2"><div class="text-[11px] font-bold text-slate-600">' + t + '</div>' + body + '</div>'; };
    var line = function (l, v, extra) { return '<div class="flex justify-between items-center text-xs gap-2"><span>' + l + '</span><b class="text-slate-800">' + v + '</b></div>' + (extra || ''); };
    var spend = C.OW.map(function (c) { return line(C.badge(c) + (c === 'J' ? ' 공동 생활비' : ' 개인'), u.K(r.exp[c]) + ' <span class="text-slate-400 font-normal">' + (totE ? Math.round(r.exp[c] / totE * 100) : 0) + '%</span>'); }).join('');
    var allow = ['H', 'W'].map(function (c) {
      var lim = +s[c === 'H' ? 'allowanceH' : 'allowanceW'] || 0, used = r.exp[c], p = lim ? used / lim * 100 : 0;
      return line(u.esc(C.short(c)) + ' 용돈', u.K(used) + (lim ? ' / ' + u.K(lim) : ''), lim ? u.bar(p, p >= 100 ? 'bg-red-500' : p >= 80 ? 'bg-amber-500' : 'bg-accent') + (p >= 100 ? '<div class="text-[10px] text-red-600">한도 ' + u.K(used - lim) + ' 초과</div>' : '') : '<div class="text-[10px] text-slate-400">설정 탭에서 한도를 정하세요</div>');
    }).join('');
    var tot = r.cH + r.cW, sh = C.shareH(), diff = r.cH - tot * sh, pH = tot ? r.cH / tot * 100 : 0;
    var settle = tot <= 0 ? '<div class="text-[11px] text-slate-400">공동 생활비 지출이나 공동통장 입금 기록이 아직 없습니다.</div>'
      : Math.abs(diff) < 1000 ? '<div class="text-[11px] text-emerald-700">목표 비율대로 분담되고 있습니다.</div>'
      : '<div class="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1">정산: <b>' + u.esc(C.short(diff > 0 ? 'W' : 'H')) + '</b> → <b>' + u.esc(C.short(diff > 0 ? 'H' : 'W')) + '</b> ' + u.K(Math.abs(diff)) + ' 보내면 목표 비율이 됩니다.</div>';
    var share = line(u.esc(C.short('H')) + ' 부담', u.K(r.cH)) + line(u.esc(C.short('W')) + ' 부담', u.K(r.cW))
      + '<div class="h-2 rounded-full overflow-hidden flex mt-1"><div class="bg-sky-400" style="width:' + pH + '%"></div><div class="bg-rose-400 flex-1"></div></div>'
      + '<div class="text-[10px] text-slate-500">실제 ' + Math.round(pH) + ' : ' + Math.round(100 - pH) + ' · 목표 ' + Math.round(sh * 100) + ' : ' + Math.round(100 - sh * 100) + ' (' + ({ income: '소득 비례', half: '반반', custom: '직접 지정' }[s.shareMode || 'income']) + ')</div>' + settle;
    var ownH = C.OW.map(function (c) { return line(C.badge(c) + ' 순자산', u.K(nw[c].a - nw[c].d)); }).join('') + '<div class="text-[10px] text-slate-400">명의를 지정하지 않은 자산·부채는 공동으로 집계합니다. 배우자 증여공제는 10년간 6억 원까지입니다.</div>';
    return '<div id="dash-couple" class="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4"><div class="flex items-center justify-between"><h3 class="font-bold text-slate-800 text-sm"><i class="fa-solid fa-people-roof text-accent mr-1.5"></i>부부 재무 현황 <span class="text-[11px] text-slate-400 font-normal">(' + mo + ')</span></h3>'
      + '<button onclick="App.ui.go(\'settings\')" class="text-[11px] text-slate-500 hover:text-accent">용돈·분담 규칙 설정 <i class="fa-solid fa-chevron-right"></i></button></div>'
      + '<div class="grid grid-cols-1 lg:grid-cols-4 gap-3">' + box('지출 귀속', spend) + box('개인 용돈 사용', allow) + box('공동 생활비 분담', share) + box('명의별 순자산', ownH) + '</div></div>';
  }
  function kpiHtml(mo) {
    var n = C.netWorth(mo), inc = C.income(mo), exp = C.expense(mo), fixedT = C.fixedTotal() + C.instSummary(mo).thisCharge, inst = C.instSummary(mo).thisCharge;
    var burden = inc > 0 ? Math.round(fixedT / inc * 100) : 0, tb = C.budgetTotal(mo), rate = tb > 0 ? Math.round(exp / tb * 100) : 0;
    var card = function (t, id, v, cls, sub) { return '<div class="bg-white p-5 rounded-xl border border-slate-200 shadow-sm min-w-0"><div class="text-xs font-semibold text-slate-400 mb-1 tracking-wider">' + t + '</div><div id="' + id + '" class="text-2xl font-extrabold ' + cls + '">' + v + '</div>' + sub + '</div>'; };
    return '<div class="grid grid-cols-2 lg:grid-cols-4 gap-5 dash-kpi">'
      + card('종합 순자산 (Net Worth)', 'kpi-net-worth', u.K(n.nw), 'text-slate-800', '<div class="text-xs text-slate-500 mt-2 flex flex-wrap justify-between gap-1"><span>총 자산: <span id="kpi-total-assets" class="text-slate-700 font-medium">' + u.K(n.assets) + '</span></span><span>부채: <span id="kpi-total-liabilities" class="text-red-500 font-medium">' + u.K(n.debt) + '</span></span></div>')
      + card('당월 총 수입', 'kpi-month-income', u.K(inc), 'text-accent', '<div class="text-xs text-slate-500 mt-2">부부 합산 수입 집계</div>')
      + card('당월 총 지출', 'kpi-month-expense', u.K(exp), 'text-slate-800', '<div class="text-xs text-slate-500 mt-2">고정비 <span id="kpi-fixed-ratio" class="font-medium text-slate-700">' + u.K(fixedT) + '</span> 포함<div class="text-[11px] mt-1">고정비+할부 부담률 <strong class="' + (burden >= 50 ? 'text-red-600' : 'text-slate-600') + '">' + burden + '%</strong>'
        + (burden >= 50 ? ' <span class="text-red-500">· 권장 50% 초과</span>' : '') + (inst > 0 ? ' <span class="text-slate-400">(당월 할부 ' + u.K(inst) + ')</span>' : '') + '</div></div>')
      + card('당월 예산 소진율', 'kpi-budget-rate', rate + '%', 'text-slate-800', '<div class="w-full bg-slate-100 rounded-full h-2 mt-3 overflow-hidden"><div class="h-2 rounded-full ' + (rate > 100 ? 'bg-red-500' : rate > 85 ? 'bg-amber-500' : 'bg-accent') + '" style="width:' + Math.min(rate, 100) + '%"></div></div>') + '</div>';
  }
  function chartsHtml() {
    return '<div class="grid grid-cols-12 gap-6"><div class="col-span-12 bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-3"><div class="flex flex-wrap justify-between items-center border-b border-slate-100 pb-3 gap-2"><div><h3 class="font-bold text-slate-800 text-base flex items-center gap-2"><i class="fa-solid fa-chart-pie text-amber-500"></i> 자산 구조 구성 비중</h3><p class="text-xs text-slate-400 mt-0.5">총 자산 대비 금융자산, 투자, 부동산 및 대출 부채 비중을 비교합니다.</p></div><div id="asset-100-legend" class="flex flex-wrap gap-4 text-xs font-semibold"></div></div><div class="h-20 w-full"><canvas id="chart-asset-100percent"></canvas></div></div>'
      + '<div class="col-span-12 lg:col-span-7 bg-white p-6 rounded-xl border border-slate-200 shadow-sm"><h3 class="font-bold text-slate-800 mb-4 flex items-center justify-between"><span>수입 및 지출 대조 추이</span><span class="text-xs font-normal text-slate-400">최근 6개월</span></h3><div class="h-64"><canvas id="chart-income-expense"></canvas></div></div>'
      + '<div class="col-span-12 lg:col-span-5 bg-white p-6 rounded-xl border border-slate-200 shadow-sm"><h3 class="font-bold text-slate-800 mb-4">세분화 카테고리별 지출 비중</h3><div class="h-64 flex items-center justify-center"><canvas id="chart-category"></canvas></div></div></div>';
  }
  function calendarHtml(mo) {
    var p = mo.split('-').map(Number), first = new Date(p[0], p[1] - 1, 1).getDay(), dim = u.dim(mo), by = {};
    C.monthTx(mo).forEach(function (t) { var d = String(t.date); var x = by[d] || (by[d] = { i: 0, e: 0 }); if (t.type === 'INCOME') x.i += t.amount; else if (t.type === 'EXPENSE') x.e += t.amount; });
    var cells = '';
    for (var i = 0; i < first; i++) cells += '<div></div>';
    for (var d = 1; d <= dim; d++) {
      var x = by[mo + '-' + u.pad(d)] || { i: 0, e: 0 };
      cells += '<div class="h-20 p-1.5 border-b border-r border-slate-100 flex flex-col justify-between"><div class="flex justify-between items-center"><span class="font-semibold">' + d + '</span>' + (!x.i && !x.e ? '<span>🎉</span>' : '') + '</div>'
        + (!x.i && !x.e ? '<div class="text-[10px] text-emerald-600 font-bold bg-emerald-50 text-center py-0.5 rounded">무지출</div>' : '<div class="space-y-0.5">' + (x.i ? '<div class="text-[10px] text-emerald-600 font-bold">+' + u.K(x.i) + '</div>' : '') + (x.e ? '<div class="text-[10px] text-red-500 font-bold">-' + u.K(x.e) + '</div>' : '') + '</div>') + '</div>';
    }
    return '<div class="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4"><div class="flex flex-wrap justify-between items-center pb-2 border-b border-slate-100 gap-2"><div><h3 class="font-bold text-slate-800 text-base flex items-center gap-2"><i class="fa-solid fa-calendar-days text-accent"></i> 월별 가계부 달력</h3><p class="text-xs text-slate-400 mt-0.5">날짜별 수입·지출 현황과 무지출 데이(🎉)를 확인하세요.</p></div>'
      + '<div class="flex items-center gap-3 text-xs"><span class="flex items-center gap-1"><span class="w-2.5 h-2.5 rounded-full bg-emerald-500"></span> 수입</span><span class="flex items-center gap-1"><span class="w-2.5 h-2.5 rounded-full bg-red-500"></span> 지출</span><span>🎉 무지출</span></div></div>'
      + '<div class="border border-slate-200 rounded-lg overflow-hidden"><div class="grid grid-cols-7 bg-slate-100 text-center text-xs font-bold text-slate-600 py-2 border-b border-slate-200"><div class="text-red-500">일</div><div>월</div><div>화</div><div>수</div><div>목</div><div>금</div><div class="text-blue-500">토</div></div>'
      + '<div id="calendar-grid" class="grid grid-cols-7 bg-white text-xs">' + cells + '</div></div></div>';
  }
  function drawCharts(mo) {
    var keys = Object.keys(db().snapshots).sort();
    if (keys.length) chart('dash-trend', {
      type: 'line', data: { labels: keys, datasets: [
        { label: '순자산', data: keys.map(function (k) { return db().snapshots[k].nw; }), borderColor: '#2E6F40', backgroundColor: '#E8F3EB', fill: true, tension: .25 },
        { label: '부채', data: keys.map(function (k) { return db().snapshots[k].debt; }), borderColor: '#EF4444', borderDash: [4, 4], tension: .25 }] },
      options: { maintainAspectRatio: false, plugins: { legend: { labels: { boxWidth: 10, font: { size: 10 } } }, tooltip: { callbacks: { label: function (c) { return c.dataset.label + ': ' + u.K(c.parsed.y); } } } }, scales: { y: { ticks: { callback: function (v) { return (v / 1e8).toFixed(1) + '억'; }, font: { size: 10 } } }, x: { ticks: { font: { size: 10 } } } } }
    });
    var labels = [], inc = [], exp = [];
    for (var i = 5; i >= 0; i--) { var m = u.addM(mo, -i), tx = C.monthTx(m); labels.push(m.slice(2, 4) + '년 ' + parseInt(m.slice(5), 10) + '월'); inc.push(C.sumType(tx, 'INCOME')); exp.push(C.sumType(tx, 'EXPENSE')); }
    chart('chart-income-expense', { type: 'bar', data: { labels: labels, datasets: [{ label: '수입', data: inc, backgroundColor: '#2E6F40' }, { label: '지출', data: exp, backgroundColor: '#94A3B8' }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } } });
    var n = C.netWorth(mo), tot = n.assets || 1, P = function (v) { return (v / tot * 100).toFixed(1); };
    u.$('asset-100-legend').innerHTML = [['bg-blue-600', '예적금/현금', n.liquid], ['bg-emerald-600', '투자자산', n.invest], ['bg-amber-500', '부동산', n.re], ['bg-red-500', '대출/부채', n.debt]].map(function (x) { return '<span class="flex items-center gap-1.5"><span class="w-3 h-3 rounded ' + x[0] + '"></span> ' + x[1] + ' (' + P(x[2]) + '%)</span>'; }).join('');
    chart('chart-asset-100percent', {
      type: 'bar', data: { labels: ['자산 구성 비중'], datasets: [{ label: '예적금/현금', data: [n.liquid], backgroundColor: '#2563EB' }, { label: '투자자산', data: [n.invest], backgroundColor: '#059669' }, { label: '부동산 자산', data: [n.re], backgroundColor: '#F59E0B' }, { label: '대출/부채', data: [n.debt], backgroundColor: '#EF4444' }] },
      options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, scales: { x: { stacked: true, display: false, max: n.assets + n.debt }, y: { stacked: true, display: false } }, plugins: { legend: { display: false }, tooltip: { callbacks: { label: function (c) { return c.dataset.label + ': ' + u.K(c.raw || 0) + ' (' + P(c.raw || 0) + '%)'; } } } } }
    });
    var cs = {}; C.monthTx(mo).filter(function (t) { return t.type === 'EXPENSE'; }).forEach(function (t) { cs[t.category] = (cs[t.category] || 0) + t.amount; });
    var ck = Object.keys(cs), colors = ck.map(function (l) { var m2 = db().categories.filter(function (c) { return c.name === l; })[0]; return m2 ? m2.color : '#94A3B8'; });
    chart('chart-category', { type: 'doughnut', data: { labels: ck.length ? ck : ['지출 없음'], datasets: [{ data: ck.length ? ck.map(function (k) { return cs[k]; }) : [1], backgroundColor: ck.length ? colors : ['#E2E8F0'] }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } } });
  }

  App.views.add({
    id: 'dashboard', order: 10, title: '대시보드 및 지출 종합 분석', nav: { label: '대시보드 및 지출 분석', icon: 'fa-square-poll-vertical', color: 'text-accent-border' },
    render: function (el) {
      var mo = App.state.month, L = App.budget.alerts(mo);
      el.innerHTML = App.weekly.paceHtml(mo) + analysisHtml(mo)
        + (L.length ? '<div class="space-y-1.5"><div class="text-xs font-bold text-slate-700">예산 알림 (' + mo + ')</div>' + L.map(App.budget.alertHtml).join('') + '</div>' : '')
        + healthHtml(mo) + coupleHtml(mo) + kpiHtml(mo) + chartsHtml() + calendarHtml(mo);
      drawCharts(mo);
    }
  });
})(window.App);

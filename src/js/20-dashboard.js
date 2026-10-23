/* 홈 : 한눈에 "이번 달 얼마 남았나 · 지금 할 일 · 어디에 썼나 · 최근 내역 · 순자산"
   - 자주 보는 것만 위에 두고, 재무 건강 지표 · 부부별 · 추이 차트 · 달력은 [자세한 분석] 안에 접어 둔다.
   - 계산은 calc / weekly / budget 모듈 결과만 쓴다 (화면에서 다시 계산하지 않는다). */
(function (App) {
  'use strict';
  var u = App.u, C = App.calc, D = App.dash = {};
  var db = function () { return App.db; };
  var charts = {};
  var FOLD_KEY = 'FC30_HOME_FOLD';
  function chart(id, cfg) {
    var cv = u.$(id); if (!cv || !window.Chart) return;
    if (charts[id]) { try { charts[id].destroy(); } catch (e) {} }
    var old = Chart.getChart && Chart.getChart(cv); if (old) old.destroy();
    charts[id] = new Chart(cv, cfg);
  }
  var won = function (v) { return u.n0(v) + '원'; };
  var md = function (s) { var p = String(s).split('-'); return +p[1] + '월 ' + +p[2] + '일'; };

  /* 순자산 월별 기록 : 이번 달을 보고 있을 때 자동으로 남긴다 */
  App.on('render', u.safe('순자산 기록', function () {
    var mo = App.state.month; if (mo !== u.nowM()) return;
    var n = C.netWorth(mo); if (!n.assets && !n.debt) return;
    var c = db().snapshots[mo];
    if (!c || c.nw !== n.nw || c.assets !== n.assets || c.debt !== n.debt) { db().snapshots[mo] = { nw: n.nw, assets: n.assets, debt: n.debt }; App.store.save({ quiet: true }); }
  }));
  D.setTarget = function (v) { db().settings.targetNetWorth = Math.max(0, u.P(v)); App.store.save(); u.toast('목표 순자산을 저장했습니다.'); };

  /* ---------- 1. 이번 달 생활비 : 남은 돈 하나만 크게 ---------- */
  function heroHtml(mo) {
    var r = App.weekly.compute(mo), V = r.V, left = V - r.est, label = parseInt(mo.slice(5), 10) + '월';
    var btns = '<div class="flex flex-wrap gap-2 mt-5"><button onclick="App.paste.open()" class="btn pri"><i class="fa-solid fa-paste"></i>카드 · 은행 내역 넣기</button>'
      + (r.cur ? '<button onclick="App.weekly.open()" class="btn sec">주간 점검</button>' : '') + '</div>';
    if (!V) return '<div class="card" style="order:1"><div class="sub">' + label + ' 생활비</div><div class="big mt-1">' + won(r.est) + ' 썼어요</div>'
      + '<p class="sub mt-3">생활비 예산을 정하면 이번 달에 얼마 남았는지, 오늘까지 적당히 쓰고 있는지 알려드려요.</p>'
      + '<div class="flex flex-wrap gap-2 mt-5"><button onclick="App.ui.go(\'budget\')" class="btn pri">예산 정하기</button><button onclick="App.paste.open()" class="btn sec">내역 넣기</button></div></div>';
    var over = left < 0, p = Math.min(100, r.est / V * 100), m = Math.min(100, r.allowed / V * 100);
    var fast = r.est > r.allowed * 1.1, warn = !fast && r.est > r.allowed;
    var pill = !r.hasData ? '<span class="pill mute">기록 없음</span>' : fast ? '<span class="pill bad">빨라요</span>' : warn ? '<span class="pill warn">조금 빨라요</span>' : '<span class="pill ok">적당해요</span>';
    var note = '';
    if (r.cur && r.hasData) {
      note = r.diff >= 0 ? '오늘까지 기준보다 <b>' + won(r.diff) + '</b> 덜 썼어요.' : '오늘까지 기준보다 <b class="text-red-600">' + won(-r.diff) + '</b> 더 썼어요.';
      if (r.perDay != null) note += r.perDay > 0 ? ' 남은 기간엔 하루 <b>' + won(r.perDay) + '</b>씩 쓰면 돼요.' : ' 남은 기간엔 지출을 멈춰야 예산을 지킬 수 있어요.';
    } else if (r.past) note = '예산 ' + won(V) + ' 중 ' + Math.round(r.est / V * 100) + '%를 썼어요.';
    else if (!r.hasData) note = '아직 이번 달 지출 기록이 없어요. 카드 앱에서 이용내역을 복사해 넣어 보세요.';
    return '<div class="card" style="order:1"><div class="flex items-center justify-between gap-2"><div class="sub">' + label + ' 생활비' + (r.past ? '' : ' · 고정비 빼고') + '</div>' + pill + '</div>'
      + '<div class="big mt-1">' + (over ? '<span class="text-red-600">' + won(-left) + ' 넘었어요</span>' : won(left) + ' 남았어요') + '</div>'
      + '<div class="sub mt-1">예산 ' + won(V) + ' 중 ' + won(r.est) + ' 썼어요' + (r.hasActual || !r.list.length ? '' : ' (주간 점검 기준 추정)') + '</div>'
      + '<div class="track mt-5"><div class="fill" style="width:' + p + '%;background:' + (fast || over ? '#E5484D' : warn ? '#E8A10A' : '#0B7A57') + '"></div>' + (r.cur ? '<div class="mark" style="left:calc(' + m + '% - 1px)" title="오늘까지 써도 되는 선"></div>' : '') + '</div>'
      + (r.cur ? '<div class="relative h-5 text-[12px] text-slate-500 mt-1.5"><span class="absolute left-0">1일</span><span class="absolute whitespace-nowrap" style="left:' + Math.max(14, Math.min(86, m)) + '%;transform:translateX(-50%)">오늘 기준선</span><span class="absolute right-0">' + r.D + '일</span></div>' : '')
      + (note ? '<p class="text-[14.5px] text-slate-700 mt-3 leading-relaxed">' + note + '</p>' : '') + btns + '</div>';
  }

  /* ---------- 2. 지금 할 일 : 눌러서 바로 처리할 수 있는 것만 ---------- */
  function todos(mo) {
    var out = [], cur = mo === u.nowM(), tx = C.monthTx(mo);
    if (cur && !tx.some(function (t) { return t.type === 'EXPENSE'; })) out.push(['fa-paste', '이번 달 카드 내역이 아직 없어요', '카드 앱 이용내역을 복사해 붙여넣으면 한 번에 들어가요.', 'App.paste.open()', '넣기']);
    var fx = (db().fixedExpenses || []).filter(function (f) { return !App.fixed.isApplied(f, mo); });
    if (fx.length) out.push(['fa-rotate', '고정비 · 정기 수입 ' + fx.length + '건이 이번 달에 아직 안 들어갔어요', fx.slice(0, 3).map(function (f) { return f.name; }).join(', ') + (fx.length > 3 ? ' 외' : ''), 'App.ui.go(\'fixed\')', '확인']);
    /* 새 할부 : 예산에서 빠지는 만큼, 첫 청구 달에는 산 사실을 한 번 보여 준다 */
    (db().installments || []).filter(function (i) { return i.startMonth === mo && !C.instSettledOn(i); }).forEach(function (i) {
      out.push(['fa-cart-shopping', '새 할부: ' + i.title + ' ' + won(i.total) + ' (' + i.months + '개월)', '매달 ' + won(C.calcInst(i, mo).thisCharge) + '씩 나가요 · 예산 대신 고정비처럼 따로 묶어요', 'App.ui.go(\'fixed\')', '보기']);
    });
    App.budget.alerts(mo).filter(function (a) { return a.lv === 'over'; }).slice(0, 2).forEach(function (a) { out.push(['fa-triangle-exclamation', a.c + ' 예산을 ' + won(a.s - a.b) + ' 넘었어요', '예산 ' + won(a.b) + ' · 쓴 돈 ' + won(a.s), 'App.ui.go(\'budget\')', '예산 보기']); });
    if (cur) { var ng = App.weekly.nag(); if (ng.nag) out.push(['fa-gauge-high', '이번 주 점검을 아직 안 했어요', '카드 앱의 이번 달 이용금액만 옮겨 적으면 돼요. 1분이면 끝나요.', 'App.weekly.open()', '점검하기']); }
    (db().realEstates || []).forEach(function (re) {
      if (re.tenure !== 'JEONSE') return; var d = App.re.leaseLeft(re);
      if (d != null && d <= 183) out.push(['fa-key', re.name + ' 전세 만기 ' + (d < 0 ? '지남' : 'D-' + d), d < 0 ? '갱신했다면 만기일을 고쳐 주세요.' : '갱신하거나 이사·보증금 반환을 준비할 때예요.', 'App.ui.go(\'assets\')', '보기']);
    });
    /* 카드값 : 결제일 3일 전부터, 아직 안 냈을 때 */
    if (cur) App.cards.upcoming().forEach(function (x) {
      if (x.b.paid || x.b.left > 3 || x.b.left < 0) return;
      out.push(['fa-credit-card', x.c.name + ' 카드값 ' + (x.b.left === 0 ? '오늘' : x.b.left + '일 뒤') + ' 나가요', '약 ' + won(x.b.total) + (x.c.payAccount ? ' · ' + x.c.payAccount + ' 잔액을 확인하세요' : ' · 결제 계좌 잔액을 확인하세요'), 'App.ui.go(\'cards\')', '보기']);
    });
    if (cur && App.sync.backupDue()) out.push(['fa-cloud-arrow-up', '데이터가 이 기기에만 있어요', '로그인해 두면 휴대폰 · PC에서 같이 보고, 기기를 바꿔도 안전해요.', 'App.sync.showLogin()', '로그인']);
    return out;
  }
  function todoHtml(mo) {
    var L = todos(mo);
    return '<div class="card" style="order:2"><div class="card-h"><h3>지금 할 일' + (L.length ? ' <span class="text-accent">' + L.length + '</span>' : '') + '</h3></div>'
      + (L.length ? L.map(function (t) {
        return '<button onclick="' + t[3] + '" class="todo"><span class="dotc bg-white text-slate-500"><i class="fa-solid ' + t[0] + '"></i></span><span class="min-w-0"><b>' + u.esc(t[1]) + '</b><small>' + u.esc(t[2]) + '</small></span><span class="go">' + t[4] + '</span></button>';
      }).join('') : '<div class="empty">지금은 할 일이 없어요.</div>') + '</div>';
  }

  /* ---------- 3. 이번 달 수입 · 지출 · 남은 돈 ---------- */
  function monthHtml(mo) {
    var inc = C.income(mo), exp = C.expense(mo), rest = inc - exp, T = C.savingTarget(mo), S = C.savedIn(mo);
    return '<div class="card" style="order:3"><div class="card-h"><h3>' + parseInt(mo.slice(5), 10) + '월 돈 흐름</h3><button onclick="App.ui.go(\'report\')" class="more">월말 리포트</button></div>'
      + '<div class="kv"><div><small>들어온 돈</small><b class="text-accent" title="' + won(inc) + '">' + u.KS(inc) + '</b></div><div><small>나간 돈</small><b title="' + won(exp) + '">' + u.KS(exp) + '</b></div><div><small>남은 돈</small><b class="' + (rest < 0 ? 'text-red-600' : '') + '" title="' + won(rest) + '">' + u.KS(rest) + '</b></div></div>'
      + (T > 0 ? '<div class="mt-4"><div class="flex justify-between text-[14px]"><span class="text-slate-600">저축 · 투자</span><span><b>' + won(S) + '</b> <span class="text-slate-500">/ 목표 ' + won(T) + '</span></span></div>'
        + '<div class="track mt-2" style="height:8px"><div class="fill" style="width:' + Math.min(100, S / T * 100) + '%;background:#0B7A57"></div></div></div>' : '') + '</div>';
  }

  /* ---------- 4. 어디에 썼나 : 카테고리별 (예산과 함께) ---------- */
  function catHtml(mo) {
    var sp = {}, tot = 0, b = C.budgetFor(mo), color = {};
    (db().categories || []).forEach(function (c) { color[c.name] = c.color; });
    var bs = C.budgetSpend(mo); sp = bs.byCat; tot = bs.total;
    var keys = Object.keys(sp).sort(function (a, c) { return sp[c] - sp[a]; });
    var body = keys.length ? keys.slice(0, 7).map(function (k) {
      var bud = b[k] || 0, pc = bud ? sp[k] / bud * 100 : 0;
      return '<div class="row"><span class="dotc" style="background:' + (color[k] || '#8B95A1') + '1A;color:' + (color[k] || '#8B95A1') + '"><i class="fa-solid fa-circle text-[8px]"></i></span>'
        + '<div class="t"><b>' + u.esc(k) + '</b><small>' + (bud ? '예산 ' + won(bud) + ' 중 <span class="' + (pc > 100 ? 'text-red-600 font-semibold' : '') + '">' + Math.round(pc) + '%</span>' : '지출의 ' + Math.round(sp[k] / tot * 100) + '%') + '</small>'
        + (bud ? '<div class="track mt-1.5" style="height:5px"><div class="fill" style="width:' + Math.min(100, pc) + '%;background:' + (pc > 100 ? '#E5484D' : pc >= 80 ? '#E8A10A' : (color[k] || '#0B7A57')) + '"></div></div>' : '') + '</div>'
        + '<div class="v">' + won(sp[k]) + '</div></div>';
    }).join('') : (bs.inst ? '' : '<div class="empty">이번 달 지출 기록이 없어요.</div>');
    if (bs.inst) body += '<div class="row"><span class="dotc bg-slate-100 text-slate-500"><i class="fa-solid fa-rotate text-[12px]"></i></span><div class="t"><b>카드 할부</b><small>이미 정해진 돈이라 예산과 남은 생활비에서는 뺐어요</small></div><div class="v text-slate-500">' + won(bs.inst) + '</div></div>';
    return '<div class="card" style="order:4"><div class="card-h"><h3>어디에 썼나</h3><button onclick="App.ui.go(\'budget\')" class="more">예산</button></div>' + body + '</div>';
  }

  /* ---------- 5. 최근 내역 ---------- */
  function recentHtml(mo) {
    var L = C.monthTx(mo).slice().sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : (b.id || 0) - (a.id || 0); }).slice(0, 6);
    var body = L.length ? L.map(function (t) {
      var inc = t.type === 'INCOME', tr = t.type === 'TRANSFER';
      return '<div class="row"><div class="t"><b>' + u.esc(t.memo || t.subcategory || t.category || '-') + '</b><small>' + md(t.date) + ' · ' + u.esc(tr ? (t.subcategory || '이체') : (t.category || '')) + (t.payment ? ' · ' + u.esc(t.payment) : '') + '</small></div>'
        + '<div class="v ' + (inc ? 'text-accent' : tr ? 'text-slate-500' : '') + '">' + (inc ? '+' : tr ? '' : '-') + won(t.amount) + '</div></div>';
    }).join('') : '<div class="empty">이번 달 내역이 없어요.</div>';
    return '<div class="card" style="order:5"><div class="card-h"><h3>최근 내역</h3><button onclick="App.ui.go(\'transactions\')" class="more">전체 보기</button></div>' + body + '</div>';
  }

  /* ---------- 6. 순자산 ---------- */
  function assetHtml(mo) {
    var n = C.netWorth(mo), prev = db().snapshots[u.addM(mo, -1)], ch = prev ? n.nw - prev.nw : null;
    if (!n.assets && !n.debt) return '<div class="card" style="order:6"><div class="card-h"><h3>순자산</h3></div><p class="sub">예금 · 투자 · 집 · 대출을 등록하면 우리 집 순자산과 매달 변화를 보여 드려요.</p><button onclick="App.ui.go(\'assets\')" class="btn sec mt-4">자산 등록하기</button></div>';
    return '<div class="card" style="order:6"><div class="card-h"><h3>순자산</h3><button onclick="App.ui.go(\'assets\')" class="more">자산 · 대출</button></div>'
      + '<div class="text-[28px] font-extrabold tracking-tight">' + won(n.nw) + '</div>'
      + (ch != null ? '<div class="text-[14px] mt-0.5 ' + (ch >= 0 ? 'text-accent' : 'text-red-600') + '">지난달보다 ' + (ch >= 0 ? '+' : '-') + won(Math.abs(ch)) + '</div>' : '')
      + '<div class="kv mt-4" style="grid-template-columns:repeat(2,minmax(0,1fr))"><div><small>가진 것</small><b title="' + won(n.assets) + '">' + u.KS(n.assets) + '</b></div><div><small>갚을 것</small><b title="' + won(n.debt) + '">' + u.KS(n.debt) + '</b></div></div></div>';
  }

  /* ---------- 7. 자세한 분석 (접어 둠) ---------- */
  function healthHtml(mo) {
    var m = C.health(mo), pr = m.target > 0 ? Math.max(0, Math.min(100, m.nw / m.target * 100)) : 0;
    var tone = function (v, bad, warn, rev) { var b = rev ? v < bad : v >= bad, w = rev ? v < warn : v >= warn; return b ? 'text-red-600' : (w ? 'text-amber-600' : 'text-accent'); };
    return '<div><h4>재무 건강</h4><div class="grid grid-cols-2 lg:grid-cols-4 gap-2">'
      + u.statCell('비상금으로 버틸 수 있는 기간', m.efMonths == null ? '-' : m.efMonths.toFixed(1) + '개월', '3~6개월이면 안심 · 예금 ' + won(m.liq) + ' ÷ 월평균 지출 ' + won(m.avgExp), m.efMonths == null ? 'text-slate-400' : tone(m.efMonths, 3, 6, true))
      + u.statCell('소득 중 빚 갚는 비율', m.dsr == null ? '-' : m.dsr.toFixed(0) + '%', '대출 · 할부 월 ' + won(m.debtPay) + ' · 40% 아래가 좋아요', m.dsr == null ? 'text-slate-400' : tone(m.dsr, 40, 30))
      + u.statCell('이번 달 저축률', m.saveRate == null ? '-' : m.saveRate.toFixed(0) + '%', '(수입 - 지출) ÷ 수입', m.saveRate == null ? 'text-slate-400' : tone(m.saveRate, 10, 20, true))
      + u.statCell('금융자산 중 투자 비중', m.invShare.toFixed(0) + '%', '투자 ' + won(m.invs) + ' · 예금 ' + won(m.liq), 'text-slate-800') + '</div>'
      + '<div class="flex flex-wrap items-center gap-3 mt-4 text-[14px]"><span class="font-semibold text-slate-600">목표 순자산</span><input type="text" data-money value="' + u.n0(m.target) + '" onchange="App.dash.setTarget(this.value)" class="w-44 border border-slate-300 rounded-lg px-3 py-2 text-right">'
      + '<div class="flex-1 min-w-[140px] track" style="height:8px"><div class="fill" style="width:' + pr + '%;background:#0B7A57"></div></div><span class="font-bold text-slate-700">' + (m.target > 0 ? pr.toFixed(0) + '% 달성' : '목표를 넣어 보세요') + '</span></div></div>';
  }
  function coupleHtml(mo) {
    var s = db().settings, r = C.coupleStats(mo), nw = C.nwByOwner(mo);
    var line = function (l, v, extra) { return '<div class="flex justify-between items-center text-[14px] gap-2 py-1"><span class="text-slate-600">' + l + '</span><b>' + v + '</b></div>' + (extra || ''); };
    var allow = ['H', 'W'].map(function (c) {
      var lim = +s[c === 'H' ? 'allowanceH' : 'allowanceW'] || 0, used = r.exp[c], p = lim ? used / lim * 100 : 0;
      return line(u.esc(C.short(c)) + ' 용돈', won(used) + (lim ? ' <span class="text-slate-400 font-normal">/ ' + won(lim) + '</span>' : ''), lim ? '<div class="track" style="height:5px"><div class="fill" style="width:' + Math.min(100, p) + '%;background:' + (p >= 100 ? '#E5484D' : p >= 80 ? '#E8A10A' : '#0B7A57') + '"></div></div>' : '');
    }).join('');
    var own = C.OW.map(function (c) { return line((c === 'J' ? '공동' : u.esc(C.short(c))) + ' 명의 순자산', won(nw[c].a - nw[c].d)); }).join('');
    return '<div><h4>부부별</h4><div class="grid grid-cols-1 lg:grid-cols-3 gap-4"><div>' + line('공동 생활비', won(r.exp.J)) + line(u.esc(C.short('H')) + ' 개인', won(r.exp.H)) + line(u.esc(C.short('W')) + ' 개인', won(r.exp.W)) + '</div>'
      + '<div>' + allow + '<button onclick="App.ui.go(\'settings\')" class="more text-[13px] mt-1">용돈 한도 정하기</button></div><div>' + own + '</div></div></div>';
  }
  function chartsHtml() {
    return '<div><h4>최근 6개월 수입 · 지출</h4><div class="h-60"><canvas id="chart-income-expense"></canvas></div></div>'
      + (Object.keys(db().snapshots).length ? '<div><h4>순자산 변화</h4><div class="h-48"><canvas id="dash-trend"></canvas></div></div>' : '');
  }
  function calendarHtml(mo) {
    var p = mo.split('-').map(Number), first = new Date(p[0], p[1] - 1, 1).getDay(), dim = u.dim(mo), by = {}, today = u.today();
    C.monthTx(mo).forEach(function (t) { var d = String(t.date); var x = by[d] || (by[d] = { i: 0, e: 0 }); if (t.type === 'INCOME') x.i += t.amount; else if (t.type === 'EXPENSE') x.e += t.amount; });
    var cells = '', zero = 0;
    for (var i = 0; i < first; i++) cells += '<div></div>';
    for (var d = 1; d <= dim; d++) {
      var key = mo + '-' + u.pad(d), x = by[key] || { i: 0, e: 0 }, future = key > today, none = !x.i && !x.e && !future;
      if (none) zero++;
      cells += '<div class="min-h-[64px] p-1.5 border-t border-slate-100 ' + (future ? 'text-slate-300' : '') + '"><div class="text-[12px] font-semibold ' + (key === today ? 'text-accent' : '') + '">' + d + '</div>'
        + (x.i ? '<div class="text-[11.5px] text-accent font-semibold">+' + u.n0(x.i) + '</div>' : '') + (x.e ? '<div class="text-[11.5px] text-slate-700 font-semibold">-' + u.n0(x.e) + '</div>' : '')
        + (none ? '<div class="text-[11px] text-slate-400">무지출</div>' : '') + '</div>';
    }
    return '<div><h4>달력 <span class="text-[13px] font-normal text-slate-500">· 무지출 ' + zero + '일</span></h4><div class="grid grid-cols-7 text-center text-[12px] font-semibold text-slate-500 pb-1"><div class="text-red-500">일</div><div>월</div><div>화</div><div>수</div><div>목</div><div>금</div><div class="text-blue-500">토</div></div>'
      + '<div class="grid grid-cols-7">' + cells + '</div></div>';
  }
  function foldHtml(mo) {
    var open = false; try { open = localStorage.getItem(FOLD_KEY) === '1'; } catch (e) {}
    return '<details id="home-fold" class="fold" style="order:7"' + (open ? ' open' : '') + ' ontoggle="App.dash.fold(this.open)"><summary>자세한 분석 · 재무 건강 · 달력</summary><div class="fold-body">'
      + healthHtml(mo) + coupleHtml(mo) + chartsHtml() + calendarHtml(mo) + '</div></details>';
  }
  D.fold = function (open) { try { localStorage.setItem(FOLD_KEY, open ? '1' : '0'); } catch (e) {} if (open) drawCharts(App.state.month); };
  function drawCharts(mo) {
    var f = u.$('home-fold'); if (!f || !f.open) return;
    var keys = Object.keys(db().snapshots).sort();
    if (keys.length) chart('dash-trend', {
      type: 'line', data: { labels: keys.map(function (k) { return +k.slice(5) + '월'; }), datasets: [
        { label: '순자산', data: keys.map(function (k) { return db().snapshots[k].nw; }), borderColor: '#0B7A57', backgroundColor: 'rgba(11,122,87,.08)', fill: true, tension: .3, pointRadius: 2 }] },
      options: { maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: function (c) { return won(c.parsed.y); } } } }, scales: { y: { grid: { color: '#F2F4F6' }, border: { display: false }, ticks: { callback: function (v) { return (v / 1e8).toFixed(1) + '억'; }, color: '#8B95A1' } }, x: { grid: { display: false }, ticks: { color: '#8B95A1' } } } }
    });
    var labels = [], inc = [], exp = [];
    for (var i = 5; i >= 0; i--) { var m = u.addM(mo, -i), tx = C.monthTx(m); labels.push(parseInt(m.slice(5), 10) + '월'); inc.push(C.sumType(tx, 'INCOME')); exp.push(C.sumType(tx, 'EXPENSE')); }
    chart('chart-income-expense', { type: 'bar', data: { labels: labels, datasets: [{ label: '들어온 돈', data: inc, backgroundColor: '#0B7A57', borderRadius: 6, maxBarThickness: 22 }, { label: '나간 돈', data: exp, backgroundColor: '#C4CAD1', borderRadius: 6, maxBarThickness: 22 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, boxHeight: 10, color: '#4E5968' } }, tooltip: { callbacks: { label: function (c) { return c.dataset.label + ' ' + won(c.parsed.y); } } } }, scales: { y: { grid: { color: '#F2F4F6' }, border: { display: false }, ticks: { color: '#8B95A1', callback: function (v) { return (v / 1e4).toLocaleString('ko-KR') + '만'; } } }, x: { grid: { display: false }, ticks: { color: '#8B95A1' } } } } });
  }

  App.views.add({
    id: 'dashboard', order: 10, title: '홈', nav: { label: '홈', icon: 'fa-house' },
    render: function (el) {
      var mo = App.state.month;
      el.innerHTML = '<div class="home-grid"><div class="home-col">' + heroHtml(mo) + catHtml(mo) + recentHtml(mo) + '</div>'
        + '<div class="home-col">' + todoHtml(mo) + monthHtml(mo) + assetHtml(mo) + '</div></div>' + foldHtml(mo);
      drawCharts(mo);
    }
  });
})(window.App);

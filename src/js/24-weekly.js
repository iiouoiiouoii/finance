/* 주간 빠른 점검 : 카드 앱의 '이번 달 누적 이용액'만 적어 예산 속도를 본다 (거래 내역은 만들지 않음)
   db.weeklyChecks[YYYY-MM] = [{ date, byCard: { cardId: 금액 }, other }]
   출처(카드별 · 계좌이체/현금)마다 실제 내역이 있는 날짜까지는 실제 값, 그 뒤는 점검값의 증가분으로 추정 */
(function (App) {
  'use strict';
  var u = App.u, C = App.calc, W = App.weekly = {};
  var db = function () { return App.db; };
  function dayOf(s) { return +String(s).slice(8, 10); }
  function md(mo, d) { return +mo.slice(5) + '/' + d; }
  function store() { return db().weeklyChecks; }
  function byDate(a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; }
  W.checks = function (mo) { return (store()[mo] || []).filter(function (c) { return c && c.date; }).sort(byDate); };
  function lastCheck() { var best = null; Object.keys(store()).forEach(function (m) { (store()[m] || []).forEach(function (c) { if (c && c.date && (!best || c.date > best.date)) best = c; }); }); return best; }
  function cards() { return db().cards || []; }
  function srcOf(t) { var c = C.cardOf(t.payment); return c ? String(c.id) : 'other'; }
  function valOf(c, src) { if (src === 'other') return Number(c.other) || 0; var v = c.byCard ? c.byCard[src] : null; return v == null || v === '' ? null : Number(v) || 0; }
  function checkTotal(c) { return u.sum(Object.keys(c.byCard || {}), function (k) { return c.byCard[k]; }) + (Number(c.other) || 0); }

  /* 출처 하나의 이번 달 누적 추정 */
  function srcEst(mo, src, list, varOnly) {
    var actual = 0, L = 0, n = 0;
    C.monthTx(mo).forEach(function (t) {
      if (t.type !== 'EXPENSE' || (varOnly && C.FIXEDCAT.test(t.category || '')) || srcOf(t) !== src) return;
      actual += Number(t.amount) || 0; n++; if (dayOf(t.date) > L) L = dayOf(t.date);
    });
    var pts = [{ d: 0, v: 0 }];
    list.forEach(function (c) { var v = valOf(c, src); if (v != null) pts.push({ d: dayOf(c.date), v: v }); });
    var last = pts[pts.length - 1], has = pts.length > 1, inc = 0, base = 0;
    if (has && last.d > L) {
      for (var i = 0; i < pts.length - 1; i++) if (pts[i].d <= L && L < pts[i + 1].d) { base = pts[i].v + (pts[i + 1].v - pts[i].v) * (L - pts[i].d) / (pts[i + 1].d - pts[i].d); break; }
      inc = Math.max(0, last.v - base);
    }
    return { actual: actual, n: n, L: L, check: has ? last.v : null, checkDay: has ? last.d : 0, est: actual + inc, day: Math.max(L, has ? last.d : 0) };
  }
  W.compute = function (mo, draft) {
    var list = W.checks(mo);
    if (draft && draft.date.indexOf(mo) === 0) { list = list.filter(function (c) { return c.date !== draft.date; }); list.push(draft); list.sort(byDate); }
    var D = u.dim(mo), now = u.nowM(), cur = mo === now, past = mo < now, tday = cur ? new Date().getDate() : past ? D : 0;
    var rows = cards().map(function (c) { return { card: c, src: String(c.id) }; }).concat([{ card: null, src: 'other' }]);
    var est = 0, asOf = 0, hasActual = false, maxL = 0;
    rows.forEach(function (r) { r.v = srcEst(mo, r.src, list, true); r.a = srcEst(mo, r.src, list, false); est += r.v.est; if (r.v.day > asOf) asOf = r.v.day; if (r.v.n) hasActual = true; if (r.v.L > maxL) maxL = r.v.L; });
    if (past && asOf) asOf = D;
    if (cur) asOf = Math.min(asOf, tday);
    var V = C.varBudget(mo), allowed = D ? V * asOf / D : 0, proj = past ? est : (asOf ? est / asOf * D : 0), weekEnd = 0, week = null, perDay = null;
    if (cur) {
      weekEnd = Math.min(D, tday + (7 - new Date().getDay()) % 7);
      week = Math.max(0, V * weekEnd / D - est);
      var left = asOf < tday ? D - tday + 1 : D - tday; if (left > 0) perDay = (V - est) / left;
    }
    var sv = null, T = C.savingTarget(mo);
    if (T > 0) {
      var ib = C.incomeBase(mo), bud = C.budgetFor(mo), fixB = u.sum(Object.keys(bud), function (k) { return C.FIXEDCAT.test(k) ? bud[k] : 0; });
      var fixR = C.fixedTotal() + C.instSummary(mo).thisCharge, fixP = Math.max(fixB, fixR), room = ib.base - T - fixP;
      sv = { T: T, base: ib.base, fromReg: ib.fromReg, fixB: fixB, fixR: fixR, fixP: fixP, room: room, allowed: D ? room * asOf / D : 0, proj: proj };
    }
    return { mo: mo, D: D, cur: cur, past: past, tday: tday, asOf: asOf, V: V, est: est, allowed: allowed, diff: allowed - est, proj: proj, weekEnd: weekEnd, week: week, perDay: perDay, rows: rows, list: list, hasActual: hasActual, maxL: maxL, sv: sv, hasData: asOf > 0 || est > 0 };
  };
  function status(r) {
    if (!r.hasData) return ['기록 없음', 'bg-slate-100 text-slate-500'];
    if (r.est <= r.allowed) return ['예산 속도 안', 'bg-emerald-100 text-emerald-800'];
    if (r.est <= r.allowed * 1.1) return ['조금 빠름', 'bg-amber-100 text-amber-800'];
    return ['빠름', 'bg-red-100 text-red-700'];
  }
  W.status = status;
  function cell(t, v, sub, cls) { return '<div class="p-3 rounded-lg bg-slate-50 border border-slate-200 min-w-0"><div class="text-[11px] font-semibold text-slate-500">' + t + '</div><div class="text-base font-extrabold ' + (cls || 'text-slate-800') + '">' + v + '</div><div class="text-[10px] text-slate-400 mt-0.5 leading-snug">' + sub + '</div></div>'; }
  function paceBar(r) {
    if (!r.V) return '';
    var p = Math.min(100, r.est / r.V * 100), m = Math.min(100, r.allowed / r.V * 100), cls = r.est > r.allowed * 1.1 ? 'bg-red-500' : r.est > r.allowed ? 'bg-amber-500' : 'bg-emerald-500';
    return '<div class="relative h-2 bg-slate-100 rounded-full mt-1"><div class="h-full rounded-full ' + cls + '" style="width:' + p + '%"></div><div class="absolute -top-1 w-0.5 h-4 bg-slate-700" style="left:calc(' + m + '% - 1px)" title="오늘까지 써도 되는 선"></div></div>';
  }
  function summaryCells(r) {
    var asOfTxt = r.asOf ? md(r.mo, r.asOf) + ' 기준' : '기록 없음', over = r.diff < 0;
    var c = cell('누적 변동 지출 (추정)', u.K(r.est), asOfTxt + (r.hasActual ? ' · 실제 내역 우선' : ' · 주간 점검값'))
      + cell(r.past ? '월 변동 생활비 예산' : '오늘까지 써도 되는 금액', u.K(r.past ? r.V : r.allowed), r.past ? '지난달 최종 비교' : '예산 ' + u.K(r.V) + ' × ' + r.asOf + '/' + r.D + '일')
      + (r.cur ? cell('이번 주 남은 사용 가능액', u.K(r.week), '~' + md(r.mo, r.weekEnd) + '(일)까지' + (r.perDay != null ? ' · 남은 기간 하루 ' + u.K(Math.max(0, r.perDay)) : ''), r.week > 0 ? 'text-accent' : 'text-red-600')
        : cell(r.past ? '예산 대비' : '이번 주 남은 사용 가능액', r.past ? (r.V ? Math.round(r.est / r.V * 100) + '%' : '-') : '-', r.past ? (r.est > r.V ? u.K(r.est - r.V) + ' 초과' : u.K(r.V - r.est) + ' 남음') : '이번 달에만 계산', r.past && r.est > r.V ? 'text-red-600' : ''))
      + cell(r.past ? '월 최종 지출' : '월말 예상 지출 (현재 속도)', u.K(r.proj), r.V ? '예산 대비 ' + Math.round(r.proj / r.V * 100) + '%' + (r.proj > r.V ? ' · ' + u.K(r.proj - r.V) + ' 초과 예상' : '') : '변동 생활비 예산을 정하면 비교합니다', r.V && r.proj > r.V ? 'text-red-600' : 'text-slate-800');
    var msg = !r.hasData || r.past ? '' : '<div class="text-[11px] ' + (over ? 'text-red-700' : 'text-emerald-700') + '">오늘까지 기준보다 <b>' + u.K(Math.abs(r.diff)) + '</b> ' + (over ? '더 썼습니다. 남은 기간에 나눠 줄여야 합니다.' : '덜 썼습니다.') + '</div>';
    return { cells: c, msg: msg };
  }
  function savingHtml(r) {
    var s = r.sv; if (!s) return '';
    var over = r.est > s.allowed, projOver = s.proj > s.room;
    return '<div class="p-3 rounded-lg border text-xs space-y-1 ' + (projOver ? 'bg-amber-50 border-amber-200 text-amber-900' : 'bg-emerald-50 border-emerald-200 text-emerald-800') + '"><div class="font-bold"><i class="fa-solid fa-piggy-bank mr-1"></i>선저축 가용액 기준</div>'
      + '<div>수입 ' + u.K(s.base) + (s.fromReg ? ' (정기 수입)' : '') + ' − 선저축 ' + u.K(s.T) + ' − 고정비 ' + u.K(s.fixP) + ' = 변동비 가용 <b>' + u.K(s.room) + '</b></div>'
      + (s.room > 0 ? '<div>오늘까지 가용 ' + u.K(s.allowed) + ' 대비 누적 ' + u.K(r.est) + ' → ' + (over ? '<b>' + u.K(r.est - s.allowed) + ' 초과</b>' : u.K(s.allowed - r.est) + ' 여유') + ' · 월말 예상 ' + u.K(s.proj) + (projOver ? ' → 선저축을 지키려면 <b>' + u.K(s.proj - s.room) + '</b> 줄여야 합니다.' : ' (가용액 이내)') + '</div>'
        : '<div class="text-red-700">선저축과 고정비만으로 수입을 넘습니다. 저축 목표나 고정비를 먼저 점검하세요.</div>')
      + '<div class="text-[10px] opacity-70">고정비 = 고정성 예산(주거·통신·금융·보험·세금) ' + u.K(s.fixB) + '과 등록 고정비+할부 ' + u.K(s.fixR) + ' 중 큰 값</div></div>';
  }
  function cardTable(r) {
    return '<div class="overflow-x-auto"><table class="w-full text-[11px] text-slate-700" style="white-space:nowrap"><thead><tr class="text-slate-400 text-left"><th class="py-1 pr-2 font-semibold">결제수단</th><th class="py-1 pr-2 font-semibold text-right">주간 점검</th><th class="py-1 pr-2 font-semibold text-right">실제 내역</th><th class="py-1 pr-2 font-semibold text-right">반영 누적</th><th class="py-1 font-semibold">실적 목표</th></tr></thead><tbody>'
      + r.rows.map(function (x) {
        var c = x.card, a = x.a, name = c ? u.esc(c.name) + (c.owner ? ' <span class="text-slate-400">(' + u.esc(c.owner) + ')</span>' : '') : '계좌이체 · 현금', tgt = c ? Number(c.targetAmount) || 0 : 0, pc = tgt ? a.est / tgt * 100 : 0;
        var perf = !c ? '<span class="text-slate-300">-</span>' : !tgt ? '<span class="text-slate-400">목표 없음</span>' : '<div class="min-w-[90px]">' + (a.est >= tgt ? '<b class="text-emerald-600">달성</b>' : u.K(tgt - a.est) + ' 남음') + ' <span class="text-slate-400">/ ' + u.K(tgt) + '</span>' + u.bar(pc, a.est >= tgt ? 'bg-emerald-500' : 'bg-accent') + '</div>';
        return '<tr class="border-t border-slate-100 align-top"><td class="py-1.5 pr-2">' + name + '</td><td class="py-1.5 pr-2 text-right">' + (a.check == null ? '<span class="text-slate-300">-</span>' : u.K(a.check) + '<div class="text-[10px] text-slate-400">' + md(r.mo, a.checkDay) + ' 점검</div>') + '</td>'
          + '<td class="py-1.5 pr-2 text-right">' + (a.n ? u.K(a.actual) + '<div class="text-[10px] text-slate-400">' + a.n + '건 · ~' + md(r.mo, a.L) + '</div>' : '<span class="text-slate-300">-</span>') + '</td><td class="py-1.5 pr-2 text-right font-bold">' + u.K(a.est) + '</td><td class="py-1.5">' + perf + '</td></tr>';
      }).join('') + '</tbody></table></div><div class="text-[10px] text-slate-400">카드별 누적·실적은 모든 카테고리 기준, 위 페이스는 주거·통신·금융·보험·세금을 뺀 변동 생활비 기준입니다.</div>';
  }
  function histHtml(r) {
    if (!r.list.length) return '<div class="text-[11px] text-slate-400">' + r.mo + ' 주간 점검 기록이 없습니다.</div>';
    return '<div class="text-[11px] font-bold text-slate-600">' + r.mo + ' 점검 기록' + (r.hasActual ? ' <span class="font-normal text-slate-400">— 실제 내역이 생겨 참고(추정)로만 씁니다</span>' : '') + '</div>'
      + r.list.map(function (c) {
        var real = r.hasActual && dayOf(c.date) <= r.maxL, saved = W.checks(r.mo).some(function (x) { return x.date === c.date; });
        return '<div class="flex items-center gap-2 text-[11px] px-2 py-1.5 rounded border border-slate-200 bg-slate-50"><b>' + u.esc(c.date) + '</b><span>' + u.K(checkTotal(c)) + '</span>'
          + (r.hasActual ? '<span class="text-[10px] px-1.5 rounded bg-slate-200 text-slate-600">참고(추정)</span>' : '') + (real ? '<span class="text-[10px] text-slate-400">이 날짜까지는 실제 내역 우선</span>' : '')
          + (saved ? '<button onclick="App.weekly.remove(\'' + u.esc(c.date) + '\')" class="ml-auto text-slate-400 hover:text-red-500" title="삭제"><i class="fa-solid fa-trash-can"></i></button>' : '<span class="ml-auto text-[10px] text-accent">미리보기</span>') + '</div>';
      }).join('');
  }

  /* ---------- 모달 ---------- */
  function modal() {
    return u.modal('weekly-modal', '<div class="flex justify-between items-center pb-3 border-b border-slate-100"><h3 class="font-bold text-slate-800"><i class="fa-solid fa-calendar-check text-accent mr-1.5"></i>주간 빠른 점검</h3><button onclick="App.u.close(\'weekly-modal\')" class="text-slate-400 hover:text-slate-600"><i class="fa-solid fa-xmark"></i></button></div>'
      + '<p class="text-[11px] text-slate-500 leading-relaxed">카드 앱 첫 화면의 <b>이번 달 이용금액(누적)</b>을 카드마다 그대로 옮겨 적으세요. 거래 내역은 만들지 않고 예산 속도만 계산합니다. 통신비·보험료처럼 카드로 자동결제되는 고정비가 이미 포함돼 있다면 그만큼 빼고 적으면 더 정확합니다.</p>'
      + '<div class="grid grid-cols-2 gap-3"><div><label class="block font-semibold text-slate-600 mb-1 text-xs">점검일</label><input id="weekly-date" type="date" onchange="App.weekly.fill()" class="' + u.IN + '"></div><div id="weekly-prev" class="text-[10px] text-slate-400 self-end pb-1"></div></div>'
      + '<div id="weekly-inputs" class="grid grid-cols-1 sm:grid-cols-2 gap-3"></div>'
      + '<div class="flex justify-end gap-2"><button onclick="App.u.close(\'weekly-modal\')" class="px-4 py-2 bg-slate-100 text-slate-600 rounded-lg text-xs">닫기</button><button onclick="App.weekly.save()" class="px-4 py-2 bg-accent text-white rounded-lg text-xs font-semibold">점검 저장</button></div>'
      + '<div id="weekly-result" class="space-y-3 pt-3 border-t border-slate-100"></div><div id="weekly-hist" class="space-y-1.5"></div>', 620);
  }
  function moneyIn(id, label, ph, val) {
    return '<div><label class="block font-semibold text-slate-600 mb-1 text-xs">' + label + '</label><input id="' + id + '" type="text" data-money inputmode="numeric" oninput="App.weekly.preview()"'
      + ' placeholder="' + (ph != null ? '지난 점검 ' + u.n0(ph) : '이번 달 누적 이용액') + '" value="' + (val != null ? u.n0(val) : '') + '" class="' + u.IN + ' text-right font-bold"></div>';
  }
  W.fill = function () {
    var d = u.val('weekly-date') || u.today(), mo = d.slice(0, 7), list = W.checks(mo);
    var same = list.filter(function (c) { return c.date === d; })[0], prev = list.filter(function (c) { return c.date < d; }).pop();
    var html = cards().map(function (c, i) {
      var k = String(c.id), v = same && same.byCard && same.byCard[k] != null ? same.byCard[k] : null, ph = prev && prev.byCard && prev.byCard[k] != null ? prev.byCard[k] : null;
      return moneyIn('weekly-c-' + i, u.esc(c.name) + (c.owner ? ' <span class="font-normal text-slate-400">(' + u.esc(c.owner) + ')</span>' : ''), ph, v);
    }).join('');
    if (!cards().length) html = '<div class="sm:col-span-2 text-[11px] text-slate-500 bg-slate-50 border border-dashed border-slate-300 rounded-lg p-3">등록된 카드가 없습니다. [보유 카드] 탭에서 카드를 등록하면 카드별로 입력할 수 있습니다.</div>';
    html += moneyIn('weekly-other', '계좌이체 · 현금 생활비 <span class="font-normal text-slate-400">(선택)</span>', prev ? prev.other : null, same ? same.other : null);
    u.$('weekly-inputs').innerHTML = html;
    u.$('weekly-prev').innerHTML = same ? '<span class="text-amber-700">이 날짜의 점검 기록을 수정합니다.</span>' : prev ? '흐린 글씨는 ' + u.esc(prev.date) + ' 점검값입니다.' : '';
    W.preview();
  };
  function readDraft() {
    var by = {}, any = false;
    cards().forEach(function (c, i) { var el = u.$('weekly-c-' + i); if (el && el.value.trim() !== '') { by[String(c.id)] = u.P(el.value); any = true; } });
    var o = u.$('weekly-other'), ov = o && o.value.trim() !== '' ? u.P(o.value) : 0; if (o && o.value.trim() !== '') any = true;
    return { date: u.val('weekly-date'), byCard: by, other: ov, any: any };
  }
  W.preview = function () {
    var dr = readDraft(), mo = (dr.date || '').slice(0, 7), same = dr.date ? W.checks(mo).filter(function (c) { return c.date === dr.date; })[0] : null;
    var dirty = dr.any && dr.date && (!same || JSON.stringify(same.byCard || {}) !== JSON.stringify(dr.byCard) || (Number(same.other) || 0) !== dr.other);
    var draft = dirty ? { date: dr.date, byCard: dr.byCard, other: dr.other } : null, d = u.val('weekly-date') || u.today(), r = W.compute(d.slice(0, 7), draft), s = status(r), sc = summaryCells(r);
    u.$('weekly-result').innerHTML = '<div class="flex items-center gap-2 flex-wrap"><b class="text-sm text-slate-800">' + r.mo + ' 예산 속도</b><span class="text-[10px] font-bold px-2 py-0.5 rounded-full ' + s[1] + '">' + s[0] + '</span>'
      + (draft ? '<span class="text-[10px] text-accent">입력값 미리보기</span>' : '') + '<span class="ml-auto text-[10px] text-slate-400">월 변동 생활비 예산 ' + u.K(r.V) + '</span></div>'
      + (r.V ? '' : '<div class="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1">변동 생활비 예산이 0원입니다. [예산 관리]에서 식비·교통 등 카테고리 예산을 정하면 속도를 비교합니다.</div>')
      + '<div class="grid grid-cols-2 gap-2">' + sc.cells + '</div>' + paceBar(r) + sc.msg + savingHtml(r) + cardTable(r);
    u.$('weekly-hist').innerHTML = histHtml(r);
  };
  W.open = function () {
    modal();
    var now = u.nowM(), mo = App.state.month;
    u.$('weekly-date').max = u.today();
    u.$('weekly-date').value = mo >= now ? u.today() : mo + '-' + u.pad(u.dim(mo));
    W.fill(); u.open('weekly-modal');
  };
  W.save = function () {
    var dr = readDraft();
    if (!dr.date) { u.toast('점검일을 선택하세요.', 'warning'); return; }
    if (dr.date > u.today()) { u.toast('미래 날짜로는 점검할 수 없습니다.', 'warning'); return; }
    if (!dr.any) { u.toast('카드 누적 이용액을 하나 이상 입력하세요.', 'warning'); return; }
    var mo = dr.date.slice(0, 7), list = (store()[mo] || []).filter(function (c) { return c && c.date !== dr.date; });
    list.push({ date: dr.date, byCard: dr.byCard, other: dr.other }); list.sort(byDate); store()[mo] = list;
    App.store.save();
    var r = W.compute(mo);
    u.toast(dr.date + ' 주간 점검 저장 · ' + (r.cur ? '이번 주 남은 사용 가능액 ' + u.K(r.week) : '누적 ' + u.K(r.est)));
    W.fill();
  };
  W.remove = function (date) {
    var mo = String(date).slice(0, 7);
    u.confirm('주간 점검 삭제', date + ' 주간 점검 기록을 삭제합니다. 거래 내역에는 영향이 없습니다.', function () {
      store()[mo] = (store()[mo] || []).filter(function (c) { return c.date !== date; }); if (!store()[mo].length) delete store()[mo];
      App.store.save(); u.toast('주간 점검 기록을 삭제했습니다.'); if (u.isOpen('weekly-modal')) W.fill();
    });
  };

  /* ---------- 대시보드 카드 · 알림 점 ---------- */
  function nagInfo() {
    var lc = lastCheck();
    if (!lc) return { nag: true, txt: '아직 주간 점검 기록이 없습니다. 일주일에 한 번, 카드 앱의 이번 달 이용금액만 옮겨 적으면 월중에도 예산 속도를 알 수 있습니다.' };
    var n = u.daysBetween(lc.date, u.today());
    return n > 7 ? { nag: true, txt: '마지막 주간 점검이 ' + n + '일 전(' + lc.date + ')입니다.' } : { nag: false };
  }
  W.paceHtml = function (mo) {
    var r = W.compute(mo), s = status(r), sc = summaryCells(r), ng = nagInfo(), showNag = ng.nag && mo === u.nowM();
    return '<div id="dash-pace" class="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-3"><div class="flex flex-wrap items-center gap-2"><h3 class="font-bold text-slate-800 text-sm"><i class="fa-solid fa-gauge-high text-accent mr-1.5"></i>이번 달 페이스 <span class="text-[11px] text-slate-400 font-normal">(' + mo + ' · 변동 생활비 예산 ' + u.K(r.V) + ')</span></h3>'
      + '<span class="text-[10px] font-bold px-2 py-0.5 rounded-full ' + s[1] + '">' + s[0] + '</span><button onclick="App.weekly.open()" class="ml-auto bg-slate-800 hover:bg-slate-900 text-white text-xs px-3.5 py-2 rounded-lg font-semibold"><i class="fa-solid fa-calendar-check text-amber-400 mr-1"></i>주간 점검</button></div>'
      + (showNag ? '<div class="flex flex-wrap items-center gap-2 text-xs bg-amber-50 border border-amber-200 text-amber-900 rounded-lg px-3 py-2"><i class="fa-solid fa-bell"></i><span class="flex-1 min-w-[200px]">' + ng.txt + '</span><button onclick="App.weekly.open()" class="bg-amber-600 text-white px-3 py-1.5 rounded-lg font-semibold">이번 주 점검하기</button></div>' : '')
      + (r.hasData ? '<div class="grid grid-cols-2 lg:grid-cols-4 gap-2">' + sc.cells + '</div>' + paceBar(r) + sc.msg : '<div class="text-[11px] text-slate-400">' + mo + ' 지출 기록과 주간 점검이 아직 없습니다.</div>')
      + '<div class="text-[10px] text-slate-400">' + (r.hasActual ? '실제 내역이 있는 날짜까지는 내역 합계를, 그 뒤는 주간 점검값을 씁니다. 점검 기록 ' + r.list.length + '회는 참고(추정)입니다.' : r.list.length ? '주간 점검 ' + r.list.length + '회 기록 기준 추정치입니다. 월말에 이용내역을 붙여넣으면 실제 값으로 바뀝니다.' : '') + '</div></div>';
  };
  App.on('rendered', u.safe('주간 알림 점', function () { var d = u.$('weekly-mdot'); if (d) d.style.display = nagInfo().nag ? '' : 'none'; if (u.isOpen('weekly-modal')) W.preview(); }));
})(window.App);

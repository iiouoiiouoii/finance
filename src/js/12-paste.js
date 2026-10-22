/* 스마트 붙여넣기 : 카드 이용내역·명세서·승인문자 → 내역 자동 분류 (할부 인식 · 중복 방지) */
(function (App) {
  'use strict';
  var u = App.u, C = App.calc, PA = App.paste = {};
  var db = function () { return App.db; };
  var items = [];   /* 미리보기 중인 내역 */

  var ALLOWED = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 15, 18, 20, 24, 30, 36, 48, 60];
  var DATE_RE = /^\d{2,4}[-./]\d{1,2}([-./]\d{1,2})?$/;
  var AMT_RE = /^[₩\s]*-?[\d,]+\s*(원)?$/;

  /* ---------- 날짜 · 결제수단 ---------- */
  PA.cleanDate = function (str) {
    var mo = App.state.month;
    if (!str) return mo + '-15';
    str = String(str).replace(/[년월]/g, '-').replace(/일/g, '').replace(/\./g, '-').replace(/\//g, '-').trim();
    var p = str.split('-').map(function (s) { return s.trim(); }).filter(Boolean);
    if (p.length === 3) { var y = p[0]; if (y.length === 2) y = '20' + y; return y + '-' + p[1].padStart(2, '0') + '-' + p[2].padStart(2, '0'); }
    if (p.length === 2) return mo.split('-')[0] + '-' + p[0].padStart(2, '0') + '-' + p[1].padStart(2, '0');
    return mo + '-15';
  };
  PA.matchPayment = function (str, def) {
    if (!str) return def;
    var f = (db().cards || []).filter(function (c) { return str.indexOf(c.name) >= 0 || c.name.indexOf(str) >= 0; })[0];
    if (f) return f.name + ' (' + (f.owner || '남편') + ')';
    if (str.indexOf('현금') >= 0) return '현금';
    if (str.indexOf('이체') >= 0 || str.indexOf('계좌') >= 0) return '계좌이체';
    return def;
  };

  /* ---------- 행 나누기 (천 단위 쉼표 보호) ---------- */
  function protect(l) { return l.replace(/(\d),(?=\d{3}(?:\D|$))/g, '$1\u0001'); }
  function hasRealComma(l) { return protect(l).indexOf(',') >= 0; }
  function splitRow(line) {
    if (line.indexOf('\t') >= 0) return line.split('\t').map(function (s) { return s.trim(); });
    if (line.indexOf('|') >= 0) return line.split('|').map(function (s) { return s.trim(); });
    if (hasRealComma(line)) return protect(line).split(',').map(function (s) { return s.replace(/\u0001/g, ',').replace(/^["']|["']$/g, '').trim(); });
    if (/\s{2,}/.test(line)) return line.split(/\s{2,}/).map(function (s) { return s.trim(); });
    return line.split(/\s+/).map(function (s) { return s.trim(); });
  }

  /* ---------- 할부 판정 ----------
     amountIsTotal : 금액이 '총 이용금액'(12개월 할부)인가, '월 청구액'(3/6 회차)인가 */
  function parseInstToken(v, plain) {
    v = String(v == null ? '' : v).trim(); if (!v) return null;
    if (/^(일시불|00|0)$/.test(v)) return { months: 1, round: 1, free: false, amountIsTotal: true };
    var m = v.match(/^(\d{1,2})\s*회?\s*\/\s*(\d{1,2})\s*회?$/);
    if (m) { var a = +m[1], b = +m[2]; return (b >= 2 && a >= 1 && a <= b && ALLOWED.indexOf(b) >= 0) ? { months: b, round: a, free: false, amountIsTotal: false } : null; }
    m = v.match(/^(\d{1,2})\s*개월(\s*무이자)?$/);
    if (m) return { months: +m[1], round: 1, free: !!m[2], amountIsTotal: true };
    if (plain && /^\d{1,2}$/.test(v)) { var n = +v; if (n <= 1) return { months: 1, round: 1, free: false, amountIsTotal: true }; if (ALLOWED.indexOf(n) >= 0) return { months: n, round: 1, free: false, amountIsTotal: true }; }
    return null;
  }
  function parseInstText(text) {
    text = String(text || '');
    var m = text.match(/할부\s*[:\s]?\s*(\d{1,2})\s*개월/);
    if (m) return { months: +m[1], round: 1, free: /무이자/.test(text), amountIsTotal: true };
    m = text.match(/(\d{1,2})\s*개월\s*(?:무이자\s*)?할부/);
    if (m) return { months: +m[1], round: 1, free: /무이자/.test(text), amountIsTotal: true };
    m = text.match(/(\d{1,2})\s*개월\s*무이자/);
    if (m) return { months: +m[1], round: 1, free: true, amountIsTotal: true };
    m = text.match(/[(\[]\s*(\d{1,2})\s*회?\s*\/\s*(\d{1,2})\s*회?\s*[)\]]/);   /* 괄호 안 n/m 만 회차로 (날짜 오인 방지) */
    if (m) { var a = +m[1], b = +m[2]; if (b >= 2 && a <= b && ALLOWED.indexOf(b) >= 0) return { months: b, round: a, free: false, amountIsTotal: false }; }
    if (/일시불/.test(text)) return { months: 1, round: 1, free: false, amountIsTotal: true };
    return null;
  }
  function cleanMemo(s) {
    return String(s || '').replace(/[(\[]\s*\d{1,2}\s*회?\s*\/\s*\d{1,2}\s*회?\s*[)\]]/g, ' ').replace(/\d{1,2}\s*개월\s*(?:무이자\s*)?할부/g, ' ')
      .replace(/할부\s*[:\s]?\s*\d{1,2}\s*개월/g, ' ').replace(/\d{1,2}\s*개월\s*무이자/g, ' ').replace(/일시불/g, ' ').replace(/[(\[]\s*[)\]]/g, ' ')
      .replace(/\s{2,}/g, ' ').replace(/^[\s\-·,]+|[\s\-·,]+$/g, '').trim();
  }
  /* 머리글 없는 표 : 열마다 날짜·금액·할부·글자 비율로 역할 추정 */
  function analyzeColumns(rows) {
    var n = 0, stat = []; rows.forEach(function (r) { if (r.length > n) n = r.length; });
    for (var c = 0; c < n; c++) {
      var s = { c: c, date: 0, amt: 0, inst: 0, txt: 0 };
      rows.forEach(function (r) {
        var v = (r[c] || '').trim(); if (!v) return;
        if (DATE_RE.test(v) || /\d{1,2}\s*월\s*\d{1,2}\s*일/.test(v)) s.date++;
        if (AMT_RE.test(v) && u.P(v) >= 100) s.amt++;
        if (parseInstToken(v, false)) s.inst++;
        if (/[가-힣A-Za-z]{2,}/.test(v) && !AMT_RE.test(v)) s.txt++;
      });
      stat.push(s);
    }
    function best(key, ex) { var p = -1, mx = 0; stat.forEach(function (s) { if (ex.indexOf(s.c) < 0 && s[key] > mx) { mx = s[key]; p = s.c; } }); return mx > 0 ? p : -1; }
    var date = best('date', []), ex = date >= 0 ? [date] : [], inst = best('inst', ex); if (inst >= 0) ex.push(inst);
    var amount = best('amt', ex); if (amount >= 0) ex.push(amount);
    return { date: date, amount: amount, memo: best('txt', ex), inst: inst };
  }
  var NOISE = /^(승인|취소|결제|누적|잔액|거래|사용|체크|신용|일시불|할부|원|확인|정상)$/;
  function parseFreeLine(line, def) {
    var info = parseInstText(line), toks = line.split(/\s+/).filter(Boolean), dateTok = null, amount = 0;
    toks.forEach(function (t) { if (!dateTok && DATE_RE.test(t)) dateTok = t; });
    toks.forEach(function (t) { if (t !== dateTok && AMT_RE.test(t)) { var v = u.P(t); if (v >= 100 && v > amount) amount = v; } });
    var memo = toks.filter(function (t) {
      return t !== dateTok && !AMT_RE.test(t) && !/카드|할부|개월|회차/.test(t) && !/^\d{1,2}\/\d{1,2}$/.test(t) && !NOISE.test(t) && !/^[\d,.:]+$/.test(t) && /[가-힣A-Za-z]/.test(t);
    }).join(' ');
    return { date: dateTok ? PA.cleanDate(dateTok) : App.state.month + '-15', amount: amount, memo: memo, payment: PA.matchPayment(line, def), info: info };
  }

  /* ---------- 분석 ---------- */
  PA.parse = function () {
    var raw = u.val('paste-raw-text').trim();
    if (!raw) { u.toast('분석할 텍스트를 입력해주세요.', 'warning'); return; }
    var def = u.val('paste-default-payment') || '계좌이체';
    var lines = raw.split('\n').map(function (l) { return l.trim(); }).filter(function (l) { return l.length > 0 && !/^(합\s*계|총\s*계|소\s*계|total)/i.test(l); });
    if (!lines.length) { u.toast('분석할 내역이 없습니다.', 'warning'); return; }
    items = []; var seq = 0;
    function push(date, amount, memo, payment, info) {
      memo = cleanMemo(memo) || '붙여넣기 내역';
      if (!(amount > 0)) return;
      var p = App.cat.predict(memo);
      var it = { id: u.uid() + (seq++), date: date, type: 'EXPENSE', category: p.category, subcategory: p.subcategory, payment: payment, amount: amount, memo: memo, inst: null };
      if (info && info.months > 1) {
        var total, monthly;
        if (info.amountIsTotal) { total = amount; monthly = Math.floor(total / info.months / 10) * 10; } else { monthly = amount; total = monthly * info.months; }
        it.inst = { months: info.months, round: info.round, free: info.free, total: total, monthly: monthly };
        it.amount = monthly;
      }
      items.push(it);
    }
    var delimited = lines.some(function (l) { return l.indexOf('\t') >= 0 || l.indexOf('|') >= 0 || hasRealComma(l) || /\s{2,}/.test(l); });
    if (!delimited) {
      lines.forEach(function (l) { var r = parseFreeLine(l, def); push(r.date, r.amount, r.memo, r.payment, r.info); });
    } else {
      var rows = lines.map(splitRow).filter(function (r) { return r.some(function (c) { return c; }); });
      var H = { date: -1, amount: -1, memo: -1, payment: -1, inst: -1 };
      rows[0].map(function (s) { return String(s).toLowerCase(); }).forEach(function (cell, i) {
        if (/날짜|일자|거래일|승인일|이용일/.test(cell)) { if (H.date < 0) H.date = i; }
        else if (/할부|개월/.test(cell)) { if (H.inst < 0) H.inst = i; }
        else if (/금액|amount/.test(cell)) { if (H.amount < 0) H.amount = i; }
        else if (/가맹점|내용|적요|상호|메모|내역/.test(cell)) { if (H.memo < 0) H.memo = i; }
        else if (/결제|카드|수단/.test(cell)) { if (H.payment < 0) H.payment = i; }
        else if (/date/.test(cell)) { if (H.date < 0) H.date = i; }
      });
      var hasHeader = H.date !== -1 || H.amount !== -1 || H.memo !== -1, data = hasHeader ? rows.slice(1) : rows;
      if (!data.length) { u.toast('데이터 행을 찾지 못했습니다.', 'warning'); return; }
      var auto = analyzeColumns(data), headerInst = hasHeader && H.inst !== -1;
      var I = {
        date: hasHeader ? (H.date !== -1 ? H.date : auto.date) : auto.date,
        amount: hasHeader && H.amount !== -1 ? H.amount : auto.amount,
        memo: hasHeader && H.memo !== -1 ? H.memo : auto.memo,
        inst: headerInst ? H.inst : auto.inst,
        payment: hasHeader ? H.payment : -1
      };
      data.forEach(function (row) {
        var date = I.date >= 0 && row[I.date] ? PA.cleanDate(row[I.date]) : App.state.month + '-15';
        var amount = I.amount >= 0 ? u.P(row[I.amount]) : 0;
        if (!amount) row.forEach(function (c, ci) { if (ci !== I.date && ci !== I.inst && AMT_RE.test(String(c).trim())) { var v = u.P(c); if (v > amount) amount = v; } });
        var memo = I.memo >= 0 && row[I.memo] ? row[I.memo] : '';
        if (!memo) row.forEach(function (c, ci) { if (ci !== I.date && ci !== I.amount && ci !== I.inst && !memo && /[가-힣A-Za-z]{2,}/.test(c) && !AMT_RE.test(c)) memo = c; });
        var pay = I.payment >= 0 && row[I.payment] ? PA.matchPayment(row[I.payment], def) : PA.matchPayment(row.join(' '), def);
        var info = I.inst >= 0 ? parseInstToken(row[I.inst], headerInst) : null;
        if (!info) info = parseInstText(row.filter(function (c, ci) { return ci !== I.date; }).join(' '));
        push(date, amount, memo, pay, info);
      });
    }
    renderTable();
    var instN = items.filter(function (t) { return t.inst; }).length;
    u.toast(items.length + '건 분석 완료' + (instN ? ' · 할부 ' + instN + '건 인식' : ''));
  };

  /* ---------- 중복 판정 : 날짜·금액이 같고 가맹점·결제수단이 거의 같은 기존 내역 ---------- */
  function nDate(s) { var d = String(s || '').replace(/\D/g, ''); return d.length >= 8 ? d.slice(0, 8) : d; }
  function nMemo(s) {
    return String(s || '').toLowerCase().replace(/^\s*\[할부\]\s*/, '').replace(/\(\s*\d+\s*\/\s*\d+\s*회\s*\)\s*$/, '')
      .replace(/\(주\)|㈜|주식회사|\(유\)|유한회사/g, '').replace(/[^0-9a-z가-힣]/g, '');
  }
  function nPay(s) { return String(s || '').toLowerCase().replace(/\s+/g, ''); }
  function looseEq(a, b) { return a === b || (a.length >= 2 && b.length >= 2 && (a.indexOf(b) >= 0 || b.indexOf(a) >= 0)); }
  PA.markDups = function (list) {
    list = list || items;
    var pool = {};
    (db().transactions || []).forEach(function (t) {
      if (t.type && t.type !== 'EXPENSE') return;
      var k = nDate(t.date) + '|' + (Number(t.amount) || 0);
      (pool[k] = pool[k] || []).push({ t: t, memo: nMemo(t.memo), pay: nPay(t.payment), used: false });
    });
    list.forEach(function (p) {
      p._dup = null;
      var c = pool[nDate(p.date) + '|' + (Number(p.amount) || 0)];
      if (c) {
        var pm = nMemo(p.memo), pp = nPay(p.payment), hit = null;
        c.forEach(function (x) { if (!hit && !x.used && x.memo === pm && looseEq(x.pay, pp)) hit = x; });
        c.forEach(function (x) { if (!hit && !x.used && looseEq(x.memo, pm) && looseEq(x.pay, pp)) hit = x; });
        if (hit) { hit.used = true; p._dup = { date: hit.t.date, memo: hit.t.memo, payment: hit.t.payment }; }
      }
      p._skip = !!p._dup && p._keep !== true;
    });
    return list;
  };

  /* ---------- 미리보기 ---------- */
  function renderTable() {
    var tb = u.$('parse-table-body'); if (!tb) return;
    var opts = C.payments().map(function (p) { return '<option value="' + u.esc(p) + '">' + u.esc(p) + '</option>'; }).join('');
    PA.markDups();
    var nd = 0, ns = 0;
    if (!items.length) { tb.innerHTML = '<tr><td colspan="7" class="p-4 text-center text-slate-400">파싱 가능한 내역을 찾지 못했습니다.</td></tr>'; }
    else tb.innerHTML = items.map(function (t, i) {
      if (t._dup) { nd++; if (t._skip) ns++; }
      var inst = t.inst ? '<div class="mt-0.5"><span class="px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 text-[9px] font-bold">할부 ' + t.inst.round + '/' + t.inst.months + (t.inst.free ? ' 무이자' : '') + '</span>'
        + '<span class="text-[9px] text-slate-400 ml-1">총 ' + u.K(t.inst.total) + ' · 월 ' + u.K(t.inst.monthly) + '</span></div>' : '';
      var dup = t._dup ? '<div class="mt-1 flex flex-wrap items-center gap-1"><span class="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-300 text-[9px] font-bold">중복 의심</span>'
        + '<span class="text-[9px] text-slate-500">이미 있음: ' + u.esc(t._dup.date) + ' ' + u.esc(t._dup.memo) + ' · ' + u.esc(t._dup.payment) + '</span>'
        + '<button onclick="App.paste.toggleDup(' + i + ')" class="text-[10px] font-semibold px-1.5 py-0.5 rounded border ' + (t._skip ? 'border-accent text-accent' : 'border-slate-300 text-slate-500') + '">' + (t._skip ? '다시 포함' : '제외') + '</button></div>' : '';
      return '<tr class="' + (t._dup ? (t._skip ? 'bg-amber-50/70 opacity-60' : 'bg-amber-50/40') : 'hover:bg-slate-50') + '">'
        + '<td class="p-2 font-mono">' + u.esc(t.date) + '</td><td class="p-2 font-bold text-slate-800">' + u.esc(t.category) + '</td><td class="p-2 text-accent font-semibold">' + u.esc(t.subcategory) + '</td>'
        + '<td class="p-2"><select onchange="App.paste.setPayment(' + i + ', this.value)" class="border border-slate-300 rounded p-1 text-xs bg-white font-semibold">' + opts.replace('value="' + u.esc(t.payment) + '"', 'value="' + u.esc(t.payment) + '" selected') + '</select></td>'
        + '<td class="p-2 text-slate-600">' + u.esc(t.memo) + inst + dup + '</td>'
        + '<td class="p-2 text-right font-bold text-slate-800"' + (t._skip ? ' style="text-decoration:line-through"' : '') + '>' + u.K(t.amount) + '</td>'
        + '<td class="p-2 text-center"><button onclick="App.paste.removeItem(' + i + ')" class="text-slate-300 hover:text-red-500"><i class="fa-solid fa-xmark"></i></button></td></tr>';
    }).join('');
    var btn = u.$('btn-import-parsed');
    btn.disabled = !items.length;
    btn.textContent = '가계부 등록' + (ns ? ' (' + (items.length - ns) + '건, 중복 ' + ns + '건 제외)' : '');
    var info = u.$('paste-dup-info');
    info.className = nd ? 'mb-2 p-2 rounded-lg bg-amber-50 border border-amber-200 text-[11px] text-amber-800' : 'hidden';
    info.innerHTML = nd ? '<i class="fa-solid fa-clone mr-1"></i>이미 등록된 내역과 날짜·금액·결제수단·가맹점이 같은 <b>' + nd + '건</b>을 찾았습니다. 중복 의심 건은 기본으로 제외되며, [다시 포함]으로 등록할 수 있습니다.' : '';
    u.$('parse-result-wrapper').classList.remove('hidden');
  }
  PA.setPayment = function (i, v) { if (items[i]) items[i].payment = v; renderTable(); };
  PA.setAllPayments = function (v) { items.forEach(function (t) { t.payment = v; }); if (items.length) renderTable(); };
  PA.removeItem = function (i) { items.splice(i, 1); renderTable(); };
  PA.toggleDup = function (i) { var t = items[i]; if (!t) return; t._keep = t._skip ? true : false; renderTable(); };

  /* ---------- 등록 ---------- */
  PA.import = function () {
    if (!items.length) return;
    PA.markDups();
    var keep = items.filter(function (t) { return !t._skip; }), skipped = items.length - keep.length;
    if (!keep.length) { items = []; u.close('smart-paste-modal'); u.toast('새로 등록할 내역이 없습니다. 중복 의심 ' + skipped + '건을 제외했습니다.', 'warning'); return; }
    var created = 0;
    keep.forEach(function (t) {
      if (t.inst && t.inst.months > 1) {
        var rec = {
          id: u.uid(), title: t.memo, total: t.inst.total, months: t.inst.months, startMonth: u.addM(String(t.date).slice(0, 7), -(t.inst.round - 1)),
          apr: 0, prepayments: [], prepayMode: 'SHORTEN', closedMonth: null, payment: t.payment, category: t.category, subcategory: t.subcategory,
          billingDay: parseInt(String(t.date).slice(8, 10), 10) || 15, source: 'PASTE'
        };
        var dup = db().installments.filter(function (x) { return x.title === rec.title && x.total === rec.total && x.months === rec.months && x.startMonth === rec.startMonth; })[0];
        if (!dup) { db().installments.push(rec); created++; } else rec = dup;
        db().transactions.push({ id: u.uid(), date: t.date, type: 'EXPENSE', category: t.category, subcategory: t.subcategory, payment: t.payment, amount: t.amount, memo: '[할부] ' + t.memo + ' (' + t.inst.round + '/' + t.inst.months + '회)', installmentId: rec.id, lockCategory: true });
      } else {
        db().transactions.push({ id: u.uid(), date: t.date, type: 'EXPENSE', category: t.category, subcategory: t.subcategory, payment: t.payment, amount: t.amount, memo: t.memo, lockCategory: false });
      }
    });
    items = [];
    App.store.save(); u.close('smart-paste-modal');
    u.toast(keep.length + '건이 등록되었습니다.' + (skipped ? ' 중복 의심 ' + skipped + '건은 제외했습니다.' : '') + (created ? ' 할부 ' + created + '건이 자동 생성되었습니다.' : ''));
  };

  /* ---------- 모달 ---------- */
  PA.open = function () {
    var m = u.$('smart-paste-modal');
    if (!m) {
      m = document.createElement('div');
      m.id = 'smart-paste-modal'; m.className = 'app-modal fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center hidden z-50 p-3';
      m.innerHTML = '<div class="bg-white rounded-xl shadow-2xl w-[920px] max-w-full max-h-[92vh] flex flex-col border border-slate-200 overflow-hidden">'
        + '<div class="p-5 border-b border-slate-200 flex justify-between items-center bg-slate-900 text-white"><h3 class="font-bold text-base flex items-center gap-2"><i class="fa-solid fa-wand-magic-sparkles text-amber-400"></i> 카드 내역 / 엑셀 스마트 파싱 및 일괄 자동 분류</h3>'
        + '<button onclick="App.u.close(\'smart-paste-modal\')" class="text-slate-400 hover:text-white text-lg"><i class="fa-solid fa-xmark"></i></button></div>'
        + '<div class="p-6 space-y-4 overflow-y-auto flex-1 custom-scrollbar">'
        + '<div class="grid grid-cols-2 gap-4 items-end bg-slate-50 p-3.5 rounded-xl border border-slate-200"><div><label class="block text-xs font-semibold text-slate-700 mb-1">일괄 적용 결제수단 선택</label>'
        + '<select id="paste-default-payment" onchange="App.paste.setAllPayments(this.value)" class="w-full border border-slate-300 rounded-lg p-2 text-xs bg-white font-bold text-slate-800"></select></div>'
        + '<p class="text-[11px] text-slate-500 leading-relaxed">💡 카드사 앱·홈페이지의 <b>이용일 기준</b> 내역(1일~말일)을 복사해 붙여넣으세요. 명세서(결제일 기준)는 기간이 달과 어긋날 수 있습니다. 이미 등록된 내역은 자동으로 걸러집니다.</p></div>'
        + '<textarea id="paste-raw-text" rows="5" placeholder="붙여넣을 카드 승인 문자나 엑셀 데이터를 입력하세요.&#10;(예시:&#10;2026-10-02&#9;스타벅스 해운대점&#9;12,500&#10;2026-10-03&#9;GS칼텍스 부산주유소&#9;85,000)" class="w-full border border-slate-300 rounded-lg p-3 text-xs font-mono bg-slate-50/50"></textarea>'
        + '<button onclick="App.paste.parse()" class="bg-slate-900 text-white px-4 py-2 rounded-lg font-semibold text-xs hover:bg-slate-800">분석 및 자동분류 실행</button>'
        + '<div id="parse-result-wrapper" class="hidden space-y-3 border-t border-slate-200 pt-4"><div id="paste-dup-info" class="hidden"></div>'
        + '<div class="max-h-60 overflow-y-auto border border-slate-200 rounded-lg custom-scrollbar"><table class="w-full text-left text-xs"><thead><tr class="bg-slate-100 border-b border-slate-200 text-slate-600 font-semibold">'
        + '<th class="p-2">날짜</th><th class="p-2">대분류 (자동)</th><th class="p-2">소분류 (자동)</th><th class="p-2">결제수단</th><th class="p-2">가맹점 / 메모</th><th class="p-2 text-right">금액</th><th class="p-2 text-center">삭제</th>'
        + '</tr></thead><tbody id="parse-table-body" class="divide-y divide-slate-100"></tbody></table></div></div></div>'
        + '<div class="p-4 border-t border-slate-200 bg-slate-50 flex justify-end gap-2"><button onclick="App.u.close(\'smart-paste-modal\')" class="px-4 py-2 bg-slate-200 text-slate-700 rounded-lg text-xs hover:bg-slate-300">취소</button>'
        + '<button onclick="App.paste.import()" id="btn-import-parsed" disabled class="px-5 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg text-xs font-semibold disabled:opacity-50">가계부 등록</button></div></div>';
      m.addEventListener('mousedown', function (e) { if (e.target === m) u.close('smart-paste-modal'); });
      document.body.appendChild(m);
    }
    items = [];
    u.$('paste-raw-text').value = '';
    u.$('parse-result-wrapper').classList.add('hidden');
    u.$('btn-import-parsed').disabled = true; u.$('btn-import-parsed').textContent = '가계부 등록';
    u.$('paste-default-payment').innerHTML = C.payments().map(function (p) { return '<option value="' + u.esc(p) + '">' + u.esc(p) + '</option>'; }).join('');
    u.open('smart-paste-modal');
  };
  PA.items = function () { return items; };
})(window.App);

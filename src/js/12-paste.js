/* 스마트 붙여넣기 : 카드 이용내역·명세서·승인문자·은행 거래내역·엑셀 파일 → 내역 자동 분류 (할부 인식 · 입출금 구분 · 중복 방지) */
(function (App) {
  'use strict';
  var u = App.u, C = App.calc, PA = App.paste = {};
  var db = function () { return App.db; };
  var items = [];   /* 미리보기 중인 내역 */

  var ALLOWED = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 15, 18, 20, 24, 30, 36, 48, 60];
  var DATE_RE = /^\d{2,4}[-./]\d{1,2}([-./]\d{1,2})?\.?(\s+\d{1,2}:\d{2}(:\d{2})?)?$/;
  var AMT_RE = /^[₩\s]*[+-]?\s*[₩]?[\d,]+\s*(원)?$/;
  var TYPE_LABEL = { EXPENSE: '지출', INCOME: '수입', TRANSFER: '이체' };

  /* ---------- 날짜 · 결제수단 · 부호 ---------- */
  PA.cleanDate = function (str) {
    var mo = App.state.month;
    if (!str) return mo + '-15';
    str = String(str).trim();
    var m = str.match(/^(\d{2,4})\s*[-./년]\s*(\d{1,2})\s*[-./월]\s*(\d{1,2})/);
    if (m) { var y = m[1].length === 2 ? '20' + m[1] : m[1]; return y + '-' + u.pad(+m[2]) + '-' + u.pad(+m[3]); }
    m = str.match(/^(\d{4})(\d{2})(\d{2})$/);
    if (m) return m[1] + '-' + m[2] + '-' + m[3];
    m = str.match(/^(\d{1,2})\s*[-./월]\s*(\d{1,2})/);
    if (m) return mo.split('-')[0] + '-' + u.pad(+m[1]) + '-' + u.pad(+m[2]);
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
  /* 금액 칸의 부호 : -1 (출금) · +1 (입금) · 0 (부호 없음) */
  function signOf(v) {
    v = String(v == null ? '' : v).trim();
    if (/^[₩\s]*-/.test(v) || /^\(.*\)$/.test(v)) return -1;
    if (/^[₩\s]*\+/.test(v)) return 1;
    return 0;
  }

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

  /* ---------- 머리글 : 열 이름으로 역할 찾기 (카드 · 은행 공통) ---------- */
  var MEMO_MAIN = /가맹점|이용처|상호|내용|받는|보낸|거래처|기재|의뢰인|상대/, MEMO_SUB = /적요|메모|내역|비고|거래점/;
  function headerMap(row) {
    var H = { date: -1, amount: -1, memo: -1, memos: [], payment: -1, inst: -1, inn: -1, out: -1, kind: -1, bal: -1 }, main = [], sub = [];
    row.map(function (s) { return String(s || '').toLowerCase().replace(/\s+/g, ''); }).forEach(function (cell, i) {
      if (!cell || cell.length > 20) return;
      if (/잔액|잔고|balance/.test(cell)) { if (H.bal < 0) H.bal = i; }
      else if (/날짜|일자|거래일|승인일|이용일|일시|date/.test(cell)) { if (H.date < 0) H.date = i; }
      else if (/구분|입출|종류/.test(cell) && !/이용구분|카드구분|매출구분|할부/.test(cell)) { if (H.kind < 0) H.kind = i; }
      else if (/할부|개월/.test(cell)) { if (H.inst < 0) H.inst = i; }
      else if (/출금|찾으신|지급|인출|withdraw|debit/.test(cell)) { if (H.out < 0) H.out = i; }
      else if (/입금|맡기신|deposit|credit/.test(cell)) { if (H.inn < 0) H.inn = i; }
      else if (/금액|amount/.test(cell)) { if (H.amount < 0) H.amount = i; }
      else if (MEMO_MAIN.test(cell)) main.push(i);
      else if (MEMO_SUB.test(cell)) sub.push(i);
      else if (/결제|카드|수단/.test(cell)) { if (H.payment < 0) H.payment = i; }
    });
    H.memos = main.concat(sub); H.memo = H.memos.length ? H.memos[0] : -1;
    H.score = [H.date, H.amount, H.memo, H.inn, H.out].filter(function (x) { return x >= 0; }).length;
    H.bank = H.inn >= 0 || H.out >= 0;   /* 잔액 열만으로는 은행으로 보지 않는다 (카드 명세서에도 '결제 후 잔액'이 있다) */
    return H;
  }
  /* 맨 위 몇 줄이 안내 문구인 표 : 머리글 행을 찾는다 (없으면 -1) */
  PA.findHeader = function (rows, limit) {
    for (var r = 0; r < Math.min(rows.length, limit || 40); r++) { var H = headerMap(rows[r]); if (H.score >= 2 && (H.date >= 0 || H.amount >= 0 || H.inn >= 0 || H.out >= 0)) return r; }
    return -1;
  };

  var NOISE = /^(승인|취소|결제|누적|잔액|거래|사용|체크|신용|일시불|할부|원|확인|정상|입금|출금|지급|이체)$/;
  function parseFreeLine(line, def) {
    var info = parseInstText(line), toks = line.split(/\s+/).filter(Boolean), dateTok = null, amount = 0, amtTok = '';
    toks.forEach(function (t) { if (!dateTok && DATE_RE.test(t)) dateTok = t; });
    toks.forEach(function (t) { if (t !== dateTok && AMT_RE.test(t)) { var v = u.P(t); if (v >= 100 && v > amount) { amount = v; amtTok = t; } } });
    var memo = toks.filter(function (t) {
      return t !== dateTok && !AMT_RE.test(t) && !/카드|할부|개월|회차/.test(t) && !/^\d{1,2}\/\d{1,2}$/.test(t) && !NOISE.test(t) && !/^[\d,.:]+$/.test(t) && /[가-힣A-Za-z]/.test(t);
    }).join(' ');
    var dir = null, sg = signOf(amtTok);
    if (/(^|\s)(입금|이체입금|급여입금)(\s|$)/.test(line)) dir = 'IN'; else if (/(^|\s)(출금|지급|이체출금|인출)(\s|$)/.test(line)) dir = 'OUT';
    return { date: dateTok ? PA.cleanDate(dateTok) : App.state.month + '-15', amount: amount, memo: memo || (/카드/.test(line) ? line.replace(/[\d,.:/\-+₩원]+/g, ' ').replace(/\s+/g, ' ').trim() : ''), payment: PA.matchPayment(line, def), info: info, dir: dir, sign: sg };
  }

  /* 은행 내역의 구분 → 분류 */
  function classify(it, dir, text) {
    var tr = App.cat.predictTransfer(text, dir), p;
    if (tr) { it.type = 'TRANSFER'; p = tr; }
    else if (dir === 'IN') { it.type = 'INCOME'; p = App.cat.predictIncome(text); }
    else { it.type = 'EXPENSE'; p = App.cat.predict(it.memo); }
    it.category = p.category; it.subcategory = p.subcategory;
  }

  /* ---------- 분석 ---------- */
  PA.parse = function () {
    var raw = u.val('paste-raw-text').replace(/\r/g, '');
    if (!raw.trim()) { u.toast('분석할 텍스트를 입력해주세요.', 'warning'); return; }
    var def = u.val('paste-default-payment') || '계좌이체';
    /* 줄 앞의 탭은 빈 칸이므로 남긴다 (공백만 다듬기) */
    var lines = raw.split('\n').map(function (l) { return l.replace(/^[  ]+|[  \t]+$/g, ''); }).filter(function (l) { var t = l.trim(); return t.length > 0 && !/^(합\s*계|총\s*계|소\s*계|total)/i.test(t); });
    if (!lines.length) { u.toast('분석할 내역이 없습니다.', 'warning'); return; }
    items = []; var seq = 0;
    function push(date, amount, memo, payment, info, bank) {
      memo = cleanMemo(memo) || '붙여넣기 내역';
      if (!(amount > 0)) return;
      var p = App.cat.predict(memo);
      var it = { id: u.uid() + (seq++), date: date, type: 'EXPENSE', category: p.category, subcategory: p.subcategory, payment: payment, amount: amount, memo: memo, inst: null };
      if (bank) { classify(it, bank.dir, memo + ' ' + (bank.text || '')); items.push(it); return; }
      if (info && info.months > 1) {
        var total, monthly;
        if (info.amountIsTotal) { total = amount; monthly = Math.floor(total / info.months / 10) * 10; } else { monthly = amount; total = monthly * info.months; }
        it.inst = { months: info.months, round: info.round, free: info.free, total: total, monthly: monthly };
        it.amount = monthly;
      }
      items.push(it);
    }
    var delimited = lines.some(function (l) { return l.indexOf('\t') >= 0 || l.indexOf('|') >= 0 || hasRealComma(l) || /\s{2,}/.test(l.trim()); });
    if (!delimited) {
      var parsed = lines.map(function (l) { return parseFreeLine(l.trim(), def); });
      var plus = parsed.filter(function (r) { return r.sign > 0; }).length, words = parsed.filter(function (r) { return r.dir; }).length;
      var bankFree = plus > 0 || words > 0;
      parsed.forEach(function (r) {
        var dir = r.dir || (r.sign < 0 ? 'OUT' : r.sign > 0 ? 'IN' : null);
        if (bankFree && !dir) dir = 'OUT';
        push(r.date, r.amount, r.memo, bankFree ? PA.matchPayment(r.memo, '계좌이체') : r.payment, bankFree ? null : r.info, bankFree ? { dir: dir } : null);
      });
    } else {
      var rows = lines.map(splitRow).filter(function (r) { return r.some(function (c) { return c; }); });
      var hr = PA.findHeader(rows, 10), H = headerMap(hr >= 0 ? rows[hr] : rows[0]);
      var hasHeader = hr >= 0 || H.date !== -1 || H.amount !== -1 || H.memo !== -1, data = hasHeader ? rows.slice(hr >= 0 ? hr + 1 : 1) : rows;
      if (!data.length) { u.toast('데이터 행을 찾지 못했습니다.', 'warning'); return; }
      var auto = analyzeColumns(data), headerInst = hasHeader && H.inst !== -1;
      if (!hasHeader) H = headerMap([]);
      var I = {
        date: H.date !== -1 ? H.date : auto.date,
        amount: H.amount !== -1 ? H.amount : (H.inn >= 0 || H.out >= 0 ? -1 : auto.amount),
        memo: H.memo !== -1 ? H.memo : auto.memo,
        inst: headerInst ? H.inst : auto.inst,
        payment: hasHeader ? H.payment : -1
      };
      /* 은행 형식인가 : 입금/출금 열 · 구분 열(입금·출금 값) · 잔액 열 · + 부호 금액 */
      var kindVals = H.kind >= 0 ? data.filter(function (r) { return /입금|출금|지급|인출/.test(r[H.kind] || ''); }).length : 0;
      var plusN = 0, minusN = 0;
      if (I.amount >= 0) data.forEach(function (r) { var s = signOf(r[I.amount]); if (s > 0) plusN++; else if (s < 0) minusN++; });
      var bankMode = H.bank || kindVals > 0 || plusN > 0 || (minusN > 0 && H.bal >= 0 && H.inst < 0);
      var signed = bankMode && (plusN > 0 || minusN > 0);
      data.forEach(function (row) {
        var date = I.date >= 0 && row[I.date] ? PA.cleanDate(row[I.date]) : App.state.month + '-15';
        var amount = I.amount >= 0 ? u.P(row[I.amount]) : 0, dir = null;
        if (H.inn >= 0 || H.out >= 0) {
          var ia = H.inn >= 0 ? u.P(row[H.inn]) : 0, oa = H.out >= 0 ? u.P(row[H.out]) : 0;
          if (ia > 0 && !(oa > 0)) { dir = 'IN'; amount = ia; } else if (oa > 0) { dir = 'OUT'; amount = oa; }
        }
        if (!dir && H.kind >= 0 && kindVals) { var k = row[H.kind] || ''; if (/입금|입고|수입/.test(k)) dir = 'IN'; else if (/출금|지급|인출|송금|지출|결제/.test(k)) dir = 'OUT'; }
        if (!dir && signed && I.amount >= 0) { var sg = signOf(row[I.amount]); dir = sg < 0 ? 'OUT' : sg > 0 ? 'IN' : (plusN > 0 ? 'OUT' : 'IN'); }
        if (!amount && !(H.inn >= 0 || H.out >= 0)) row.forEach(function (c, ci) { if (ci !== I.date && ci !== I.inst && ci !== H.bal && AMT_RE.test(String(c).trim())) { var v = u.P(c); if (v > amount) amount = v; } });
        var memo = '';
        H.memos.forEach(function (ci) { if (!memo && row[ci] && !AMT_RE.test(row[ci])) memo = row[ci]; });
        if (!memo && I.memo >= 0 && row[I.memo]) memo = row[I.memo];
        if (!memo) row.forEach(function (c, ci) { if (ci !== I.date && ci !== I.amount && ci !== I.inst && ci !== H.kind && !memo && /[가-힣A-Za-z]{2,}/.test(c) && !AMT_RE.test(c)) memo = c; });
        if (bankMode) {
          var text = H.memos.map(function (ci) { return row[ci] || ''; }).join(' ');
          push(date, amount, memo, I.payment >= 0 && row[I.payment] ? PA.matchPayment(row[I.payment], '계좌이체') : PA.matchPayment(text, '계좌이체'), null, { dir: dir || 'OUT', text: text });
          return;
        }
        var pay = I.payment >= 0 && row[I.payment] ? PA.matchPayment(row[I.payment], def) : PA.matchPayment(row.join(' '), def);
        var info = I.inst >= 0 ? parseInstToken(row[I.inst], headerInst) : null;
        if (!info) info = parseInstText(row.filter(function (c, ci) { return ci !== I.date; }).join(' '));
        push(date, amount, memo, pay, info);
      });
    }
    renderTable();
    var instN = items.filter(function (t) { return t.inst; }).length, cnt = counts();
    u.toast(items.length + '건 분석 완료' + (cnt.INCOME || cnt.TRANSFER ? ' · 지출 ' + cnt.EXPENSE + ' · 수입 ' + cnt.INCOME + ' · 이체 ' + cnt.TRANSFER : '') + (instN ? ' · 할부 ' + instN + '건 인식' : ''));
  };
  function counts() { var c = { EXPENSE: 0, INCOME: 0, TRANSFER: 0 }; items.forEach(function (t) { c[t.type] = (c[t.type] || 0) + 1; }); return c; }

  /* ---------- 중복 판정 : 날짜·금액이 같고 가맹점·결제수단이 거의 같은 기존 내역 (지출 · 수입 · 이체) ---------- */
  function nDate(s) { var d = String(s || '').replace(/\D/g, ''); return d.length >= 8 ? d.slice(0, 8) : d; }
  function nMemo(s) {
    return String(s || '').toLowerCase().replace(/^\s*\[[^\]]*\]\s*/, '').replace(/\(\s*\d+\s*\/\s*\d+\s*회\s*\)\s*$/, '')
      .replace(/\(주\)|㈜|주식회사|\(유\)|유한회사/g, '').replace(/[^0-9a-z가-힣]/g, '');
  }
  function nPay(s) { return String(s || '').toLowerCase().replace(/\s+/g, ''); }
  function looseEq(a, b) { return a === b || (a.length >= 2 && b.length >= 2 && (a.indexOf(b) >= 0 || b.indexOf(a) >= 0)); }
  /* 같은 거래로 볼 구분 : 같은 구분, 또는 예전에 지출로 넣은 카드대금 · 이체 */
  function typeEq(a, b) { a = a || 'EXPENSE'; b = b || 'EXPENSE'; return a === b || (a === 'TRANSFER' && b === 'EXPENSE') || (a === 'EXPENSE' && b === 'TRANSFER'); }
  PA.markDups = function (list) {
    list = list || items;
    var pool = {}, byMonth = {};
    (db().transactions || []).forEach(function (t) {
      var x = { t: t, memo: nMemo(t.memo), pay: nPay(t.payment), used: false }, k = nDate(t.date) + '|' + (Number(t.amount) || 0);
      (pool[k] = pool[k] || []).push(x);
      if (t.fixedId || t.installmentId) { var mk = String(t.date).slice(0, 7) + '|' + (Number(t.amount) || 0); (byMonth[mk] = byMonth[mk] || []).push(x); }
    });
    list.forEach(function (p) {
      p._dup = null;
      var pm = nMemo(p.memo), pp = nPay(p.payment), hit = null, c = pool[nDate(p.date) + '|' + (Number(p.amount) || 0)];
      if (c) {
        c.forEach(function (x) { if (!hit && !x.used && typeEq(x.t.type, p.type) && x.memo === pm && looseEq(x.pay, pp)) hit = x; });
        c.forEach(function (x) { if (!hit && !x.used && typeEq(x.t.type, p.type) && looseEq(x.memo, pm) && looseEq(x.pay, pp)) hit = x; });
      }
      /* 자동 반영된 고정 항목 · 할부 청구분 : 날짜가 며칠 달라도 같은 달 · 같은 금액 · 이름이 겹치면 같은 거래 */
      if (!hit) (byMonth[String(p.date).slice(0, 7) + '|' + (Number(p.amount) || 0)] || []).forEach(function (x) { if (!hit && !x.used && typeEq(x.t.type, p.type) && looseEq(x.memo, pm)) hit = x; });
      if (hit) { hit.used = true; p._dup = { date: hit.t.date, memo: hit.t.memo, payment: hit.t.payment }; }
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
    if (!items.length) { tb.innerHTML = '<tr><td colspan="8" class="p-4 text-center text-slate-400">파싱 가능한 내역을 찾지 못했습니다.</td></tr>'; }
    else tb.innerHTML = items.map(function (t, i) {
      if (t._dup) { nd++; if (t._skip) ns++; }
      var inst = t.inst ? '<div class="mt-0.5"><span class="px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 text-[9px] font-bold">할부 ' + t.inst.round + '/' + t.inst.months + (t.inst.free ? ' 무이자' : '') + '</span>'
        + '<span class="text-[9px] text-slate-400 ml-1">총 ' + u.K(t.inst.total) + ' · 월 ' + u.K(t.inst.monthly) + '</span></div>' : '';
      var dup = t._dup ? '<div class="mt-1 flex flex-wrap items-center gap-1"><span class="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-300 text-[9px] font-bold">중복 의심</span>'
        + '<span class="text-[9px] text-slate-500">이미 있음: ' + u.esc(t._dup.date) + ' ' + u.esc(t._dup.memo) + ' · ' + u.esc(t._dup.payment) + '</span>'
        + '<button onclick="App.paste.toggleDup(' + i + ')" class="text-[10px] font-semibold px-1.5 py-0.5 rounded border ' + (t._skip ? 'border-accent text-accent' : 'border-slate-300 text-slate-500') + '">' + (t._skip ? '다시 포함' : '제외') + '</button></div>' : '';
      var typeCls = t.type === 'INCOME' ? 'text-emerald-700 bg-emerald-50 border-emerald-300' : t.type === 'TRANSFER' ? 'text-slate-600 bg-slate-100 border-slate-300' : 'text-slate-800 bg-white border-slate-300';
      return '<tr class="' + (t._dup ? (t._skip ? 'bg-amber-50/70 opacity-60' : 'bg-amber-50/40') : 'hover:bg-slate-50') + '">'
        + '<td class="p-2 font-mono pt-date">' + u.esc(t.date) + '</td>'
        + '<td class="p-2 pt-type"><select onchange="App.paste.setType(' + i + ', this.value)" class="border rounded p-1 text-xs font-bold ' + typeCls + '">'
        + ['EXPENSE', 'INCOME', 'TRANSFER'].map(function (k) { return '<option value="' + k + '"' + (t.type === k ? ' selected' : '') + '>' + TYPE_LABEL[k] + '</option>'; }).join('') + '</select></td>'
        + '<td class="p-2 font-bold text-slate-800 pt-cat">' + u.esc(t.category) + '</td><td class="p-2 text-accent font-semibold pt-sub">' + u.esc(t.subcategory) + '</td>'
        + '<td class="p-2 pt-pay"><select onchange="App.paste.setPayment(' + i + ', this.value)" class="border border-slate-300 rounded p-1 text-xs bg-white font-semibold max-w-[11rem]">' + opts.replace('value="' + u.esc(t.payment) + '"', 'value="' + u.esc(t.payment) + '" selected') + '</select></td>'
        + '<td class="p-2 text-slate-600 pt-memo">' + u.esc(t.memo) + inst + dup + '</td>'
        + '<td class="p-2 text-right font-bold pt-amt ' + (t.type === 'INCOME' ? 'text-emerald-600' : t.type === 'TRANSFER' ? 'text-slate-500' : 'text-slate-800') + '"' + (t._skip ? ' style="text-decoration:line-through"' : '') + '>' + (t.type === 'INCOME' ? '+' : '') + u.K(t.amount) + '</td>'
        + '<td class="p-2 text-center pt-del"><button onclick="App.paste.removeItem(' + i + ')" aria-label="삭제" class="text-slate-300 hover:text-red-500"><i class="fa-solid fa-xmark"></i></button></td></tr>';
    }).join('');
    var btn = u.$('btn-import-parsed');
    btn.disabled = !items.length;
    btn.textContent = '가계부 등록' + (ns ? ' (' + (items.length - ns) + '건, 중복 ' + ns + '건 제외)' : '');
    var cnt = counts(), sum = function (k) { return u.sum(items.filter(function (t) { return t.type === k && !t._skip; }), function (t) { return t.amount; }); };
    var sm = u.$('paste-summary');
    if (sm) sm.innerHTML = items.length ? '<span>지출 <b>' + cnt.EXPENSE + '</b>건 ' + u.K(sum('EXPENSE')) + '</span>' + (cnt.INCOME ? '<span class="text-emerald-700">수입 <b>' + cnt.INCOME + '</b>건 ' + u.K(sum('INCOME')) + '</span>' : '')
      + (cnt.TRANSFER ? '<span class="text-slate-500">이체 <b>' + cnt.TRANSFER + '</b>건 ' + u.K(sum('TRANSFER')) + ' <span class="text-[10px]">(카드대금·본인계좌 · 지출 합계에서 빠짐)</span></span>' : '') : '';
    var info = u.$('paste-dup-info');
    info.className = nd ? 'mb-2 p-2 rounded-lg bg-amber-50 border border-amber-200 text-[11px] text-amber-800' : 'hidden';
    info.innerHTML = nd ? '<i class="fa-solid fa-clone mr-1"></i>이미 등록된 내역과 날짜·금액·결제수단·가맹점이 같은 <b>' + nd + '건</b>을 찾았습니다. 중복 의심 건은 기본으로 제외되며, [다시 포함]으로 등록할 수 있습니다.' : '';
    u.$('parse-result-wrapper').classList.remove('hidden');
  }
  PA.setPayment = function (i, v) { if (items[i]) items[i].payment = v; renderTable(); };
  PA.setAllPayments = function (v) { items.forEach(function (t) { if (t.type === 'EXPENSE') t.payment = v; }); if (items.length) renderTable(); };
  PA.setType = function (i, v) {
    var t = items[i]; if (!t || !TYPE_LABEL[v]) return;
    t.type = v;
    var p = v === 'INCOME' ? App.cat.predictIncome(t.memo) : v === 'TRANSFER' ? (App.cat.predictTransfer(t.memo) || { category: '계좌이체', subcategory: '자신계좌이체' }) : App.cat.predict(t.memo);
    t.category = p.category; t.subcategory = p.subcategory;
    if (v !== 'EXPENSE' && t.inst) { t.amount = t.inst.total; t.inst = null; }
    renderTable();
  };
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
      if (t.type === 'EXPENSE' && t.inst && t.inst.months > 1) {
        var rec = {
          id: u.uid(), title: t.memo, total: t.inst.total, months: t.inst.months, startMonth: u.addM(String(t.date).slice(0, 7), -(t.inst.round - 1)),
          apr: 0, prepayments: [], prepayMode: 'SHORTEN', closedMonth: null, payment: t.payment, category: t.category, subcategory: t.subcategory,
          billingDay: parseInt(String(t.date).slice(8, 10), 10) || 15, source: 'PASTE'
        };
        var dup = db().installments.filter(function (x) { return x.title === rec.title && x.total === rec.total && x.months === rec.months && x.startMonth === rec.startMonth; })[0];
        if (!dup) { db().installments.push(rec); created++; } else rec = dup;
        db().transactions.push({ id: u.uid(), date: t.date, type: 'EXPENSE', category: t.category, subcategory: t.subcategory, payment: t.payment, amount: t.amount, memo: '[할부] ' + t.memo + ' (' + t.inst.round + '/' + t.inst.months + '회)', installmentId: rec.id, lockCategory: true });
      } else {
        db().transactions.push({ id: u.uid(), date: t.date, type: t.type || 'EXPENSE', category: t.category, subcategory: t.subcategory, payment: t.payment, amount: t.amount, memo: t.memo, lockCategory: false });
      }
    });
    var c = { EXPENSE: 0, INCOME: 0, TRANSFER: 0 }; keep.forEach(function (t) { c[t.type]++; });
    items = [];
    App.store.save(); u.close('smart-paste-modal');
    u.toast(keep.length + '건이 등록되었습니다.' + (c.INCOME || c.TRANSFER ? ' (지출 ' + c.EXPENSE + ' · 수입 ' + c.INCOME + ' · 이체 ' + c.TRANSFER + ')' : '') + (skipped ? ' 중복 의심 ' + skipped + '건은 제외했습니다.' : '') + (created ? ' 할부 ' + created + '건이 자동 생성되었습니다.' : ''));
  };

  /* ---------- 엑셀 · CSV 파일 읽기 (SheetJS 는 처음 쓸 때만 불러온다) ---------- */
  var XLSX_URL = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js', xlsxP = null;
  function loadXlsx() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    if (!xlsxP) xlsxP = new Promise(function (res, rej) {
      var s = document.createElement('script'); s.src = XLSX_URL; s.async = true;
      s.onload = function () { window.XLSX ? res(window.XLSX) : rej(new Error('엑셀 읽기 도구를 불러오지 못했습니다.')); };
      s.onerror = function () { xlsxP = null; rej(new Error('엑셀 읽기 도구를 불러오지 못했습니다. 인터넷 연결을 확인하세요.')); };
      document.head.appendChild(s);
    });
    return xlsxP;
  }
  function readBuf(file) { return new Promise(function (res, rej) { var fr = new FileReader(); fr.onload = function () { res(fr.result); }; fr.onerror = function () { rej(fr.error); }; fr.readAsArrayBuffer(file); }); }
  function decodeText(buf) {
    try { return new TextDecoder('utf-8', { fatal: true }).decode(buf).replace(/^\uFEFF/, ''); } catch (e) { return new TextDecoder('euc-kr').decode(buf); }
  }
  /* 시트 → 탭 구분 텍스트 : 머리글 위 안내 문구와 빈 줄 · 빈 열을 버린다 */
  PA.sheetToText = function (rows) {
    rows = rows.map(function (r) { return (r || []).map(function (c) { return String(c == null ? '' : c).replace(/[\t\r\n]+/g, ' ').trim(); }); })
      .filter(function (r) { return r.some(function (c) { return c; }); });
    var hr = PA.findHeader(rows, 40), pre = hr > 0 ? rows.slice(0, hr) : [];
    if (hr > 0) rows = rows.slice(hr);
    var w = 0; rows.forEach(function (r) { if (r.length > w) w = r.length; });
    var used = []; for (var c = 0; c < w; c++) used.push(rows.some(function (r) { return r[c]; }));
    return { text: rows.map(function (r) { return r.filter(function (x, ci) { return used[ci]; }).join('\t'); }).join('\n'), pre: pre.map(function (r) { return r.join(' '); }).join(' '), header: hr };
  };
  /* 파일 이름 · 안내 문구에 카드사 이름이 있고, 보유 카드 중 하나만 맞으면 그 카드를 기본 결제수단으로 */
  var BRANDS = [['현대', /hyundai|현대/i], ['삼성', /samsung|삼성/i], ['신한', /shinhan|신한/i], ['국민', /kbcard|kb국민|국민/i], ['KB', /kbcard|kb국민/i], ['롯데', /lotte|롯데/i], ['하나', /hana|하나/i], ['우리', /woori|우리/i], ['농협', /nh|농협/i], ['BC', /bccard|비씨|bc카드/i]];
  function guessCard(hint) {
    var cards = db().cards || [];
    for (var i = 0; i < BRANDS.length; i++) {
      if (!BRANDS[i][1].test(hint)) continue;
      var hit = cards.filter(function (c) { return String(c.name).indexOf(BRANDS[i][0]) >= 0; });
      if (hit.length === 1) return hit[0].name + ' (' + (hit[0].owner || '남편') + ')';
    }
    return null;
  }
  /* ---------- 암호 걸린 엑셀 풀기 (Office 표준 '애자일' 암호화 · AES) ----------
     카드사 · 은행 엑셀은 보통 생년월일 같은 비밀번호가 걸려 있다. 브라우저 안에서만 풀고, 비밀번호는 어디에도 저장하지 않는다. */
  var HASHES = { SHA1: 'SHA-1', 'SHA-1': 'SHA-1', SHA256: 'SHA-256', 'SHA-256': 'SHA-256', SHA384: 'SHA-384', 'SHA-384': 'SHA-384', SHA512: 'SHA-512', 'SHA-512': 'SHA-512' };
  var BLK_VIN = [0xfe, 0xa7, 0xd2, 0x76, 0x3b, 0x4b, 0x9e, 0x79], BLK_VHASH = [0xd7, 0xaa, 0x0f, 0x6d, 0x30, 0x61, 0x34, 0x4e], BLK_KEY = [0x14, 0x6e, 0x0b, 0xe7, 0xab, 0xac, 0xd0, 0xd6];
  function bytes(a) { return a instanceof Uint8Array ? a : a instanceof ArrayBuffer ? new Uint8Array(a) : Uint8Array.from(a || []); }
  function join() { var n = 0, i, o, p = 0; for (i = 0; i < arguments.length; i++) n += arguments[i].length; o = new Uint8Array(n); for (i = 0; i < arguments.length; i++) { o.set(arguments[i], p); p += arguments[i].length; } return o; }
  function le32(i) { return new Uint8Array([i & 255, (i >>> 8) & 255, (i >>> 16) & 255, (i >>> 24) & 255]); }
  function b64(s) { return Uint8Array.from(atob(s || ''), function (c) { return c.charCodeAt(0); }); }
  function fit(b, n, pad) { if (b.length >= n) return b.slice(0, n); var o = new Uint8Array(n).fill(pad); o.set(b); return o; }
  function digest(alg, data) { return crypto.subtle.digest(alg, data).then(function (r) { return new Uint8Array(r); }); }
  /* 덧붙임(padding) 없는 AES-CBC 복호화 : 마지막에 '패딩 블록'을 만들어 붙여 WebCrypto 로 푼다 */
  function aesCbc(keyBytes, iv, data) {
    var S = crypto.subtle;
    return S.importKey('raw', keyBytes, 'AES-CBC', false, ['encrypt', 'decrypt']).then(function (key) {
      return S.encrypt({ name: 'AES-CBC', iv: data.slice(data.length - 16) }, key, new Uint8Array(16).fill(16)).then(function (pad) {
        return S.decrypt({ name: 'AES-CBC', iv: iv }, key, join(data, new Uint8Array(pad).slice(0, 16)));
      });
    }).then(function (r) { return new Uint8Array(r); });
  }
  PA.isEncrypted = function (X, buf) {
    var b = bytes(buf); if (!(b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0)) return false;
    try { var cfb = X.CFB.read(b, { type: 'array' }); return !!X.CFB.find(cfb, 'EncryptedPackage'); } catch (e) { return false; }
  };
  PA.decrypt = async function (X, buf, password) {
    var cfb = X.CFB.read(bytes(buf), { type: 'array' }), ie = X.CFB.find(cfb, 'EncryptionInfo'), pe = X.CFB.find(cfb, 'EncryptedPackage');
    if (!ie || !pe) throw new Error('암호 정보를 찾지 못했습니다.');
    var info = bytes(ie.content), pkg = bytes(pe.content);
    if (!(info[0] === 4 && info[2] === 4)) throw new Error('이 파일의 암호 방식(표준 암호화)은 아직 풀 수 없습니다. 엑셀에서 암호를 풀고 다시 저장한 뒤 올려 주세요.');
    var doc = new DOMParser().parseFromString(new TextDecoder().decode(info.slice(8)), 'application/xml');
    var kd = doc.getElementsByTagName('keyData')[0], ek = doc.getElementsByTagNameNS('http://schemas.microsoft.com/office/2006/keyEncryptor/password', 'encryptedKey')[0];
    if (!kd || !ek) throw new Error('비밀번호 방식이 아닌 암호(인증서 등)는 풀 수 없습니다.');
    var A = function (el, k) { return el.getAttribute(k); }, alg = HASHES[A(ek, 'hashAlgorithm')], kAlg = HASHES[A(kd, 'hashAlgorithm')];
    if (!alg || !kAlg) throw new Error('지원하지 않는 암호 해시 방식입니다.');
    var salt = b64(A(ek, 'saltValue')), keyLen = (+A(ek, 'keyBits') || 128) / 8, spin = +A(ek, 'spinCount') || 100000, hashSize = +A(ek, 'hashSize') || 20;
    var pw = new Uint8Array(String(password).length * 2);
    for (var i = 0; i < password.length; i++) { var c = password.charCodeAt(i); pw[i * 2] = c & 255; pw[i * 2 + 1] = c >> 8; }
    var h = await digest(alg, join(salt, pw));
    for (i = 0; i < spin; i++) h = await digest(alg, join(le32(i), h));
    var derive = function (blk) { return digest(alg, join(h, new Uint8Array(blk))).then(function (d) { return fit(d, keyLen, 0x36); }); };
    var vIn = await aesCbc(await derive(BLK_VIN), salt, b64(A(ek, 'encryptedVerifierHashInput')));
    var vHash = await aesCbc(await derive(BLK_VHASH), salt, b64(A(ek, 'encryptedVerifierHashValue')));
    var calc = await digest(alg, vIn.slice(0, +A(ek, 'saltSize') || 16));
    for (i = 0; i < hashSize; i++) if (calc[i] !== vHash[i]) { var e = new Error('비밀번호가 맞지 않습니다.'); e.badPassword = true; throw e; }
    var secret = (await aesCbc(await derive(BLK_KEY), salt, b64(A(ek, 'encryptedKeyValue')))).slice(0, keyLen);
    var kSalt = b64(A(kd, 'saltValue')), bs = +A(kd, 'blockSize') || 16, size = pkg[0] + pkg[1] * 256 + pkg[2] * 65536 + pkg[3] * 16777216 + (pkg[4] + pkg[5] * 256) * 4294967296;
    var enc = pkg.slice(8), out = new Uint8Array(enc.length);
    for (var seg = 0, off = 0; off < enc.length; seg++, off += 4096) {
      var iv = fit(await digest(kAlg, join(kSalt, le32(seg))), bs, 0x36);
      out.set(await aesCbc(secret, iv, enc.slice(off, Math.min(enc.length, off + 4096))), off);
    }
    return out.slice(0, size);
  };

  var pending = null;   /* 비밀번호를 기다리는 파일 { name, buf } */
  function status(html) { var st = u.$('paste-file-status'); if (st) st.innerHTML = html; }
  function showPw(on, msg) {
    var row = u.$('paste-pw-row'); if (!row) return;
    row.classList.toggle('hidden', !on);
    u.$('paste-pw-msg').innerHTML = msg || '';
    var inp = u.$('paste-pw'); inp.value = ''; if (on) setTimeout(function () { inp.focus(); }, 50);
  }
  function openBook(X, name, buf) {
    var wb = /\.(csv|txt)$/i.test(name) ? X.read(decodeText(buf), { type: 'string', raw: true }) : X.read(bytes(buf), { type: 'array', cellDates: true });
    var best = null;
    wb.SheetNames.some(function (sn) {
      var rows = X.utils.sheet_to_json(wb.Sheets[sn], { header: 1, raw: false, defval: '', dateNF: 'yyyy-mm-dd', blankrows: false });
      var s = PA.sheetToText(rows); if (!best || (best.header < 0 && s.header >= 0)) best = s;
      return s.header >= 0;
    });
    if (!best || !best.text.trim()) throw new Error('파일에서 내역을 찾지 못했습니다.');
    var card = guessCard(name + ' ' + best.pre);
    if (card && C.payments().indexOf(card) >= 0) u.$('paste-default-payment').value = card;
    u.$('paste-raw-text').value = best.text;
    status('<i class="fa-solid fa-file-excel text-emerald-600 mr-1"></i><b>' + u.esc(name) + '</b> · ' + best.text.split('\n').length + '줄 읽음' + (best.header > 0 ? ' (안내 문구 ' + best.header + '줄 건너뜀)' : '') + (card ? ' · 결제수단 ' + u.esc(card) : ''));
    PA.parse();
  }
  function fail(e) {
    console.warn('[엑셀 읽기]', e);
    var msg = (e && e.message) || '파일을 읽지 못했습니다.';
    /* 예전 .xls 의 암호(RC4 등)는 풀 수 없다 */
    if (/password|encrypt|AlgID|RC4|FilePass/i.test(msg)) msg = '이 파일의 암호 방식은 풀 수 없습니다. 엑셀에서 열어 암호를 풀거나 .xlsx 로 다시 저장한 뒤 올려 주세요.';
    status('<span class="text-red-600">' + u.esc(msg) + '</span>');
    u.toast(msg, 'warning');
  }
  PA.readFile = function (file) {
    if (!file) return;
    var name = file.name || '';
    if (!/\.(xlsx|xlsm|xls|csv|txt)$/i.test(name)) { u.toast('엑셀(.xlsx · .xls) 또는 .csv 파일을 골라 주세요.', 'warning'); return; }
    pending = null; showPw(false);
    status('<i class="fa-solid fa-spinner fa-spin mr-1"></i>' + u.esc(name) + ' 읽는 중...');
    Promise.all([loadXlsx(), readBuf(file)]).then(function (r) {
      if (!/\.(csv|txt)$/i.test(name) && PA.isEncrypted(r[0], r[1])) {
        pending = { name: name, buf: r[1] };
        status('<i class="fa-solid fa-lock text-amber-500 mr-1"></i><b>' + u.esc(name) + '</b> · 비밀번호가 걸린 파일입니다.');
        showPw(true, '카드사 · 은행에서 정한 비밀번호(보통 생년월일 6자리 등)를 넣으세요. 이 기기 안에서만 쓰고 저장하지 않습니다.');
        return;
      }
      openBook(r[0], name, r[1]);
    }).catch(fail);
  };
  PA.unlock = function () {
    var pw = u.val('paste-pw'); if (!pending) return;
    if (!pw) { u.$('paste-pw').focus(); return; }
    var p = pending, btn = u.$('paste-pw-btn');
    btn.disabled = true; u.$('paste-pw-msg').innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i>암호를 푸는 중... (몇 초 걸립니다)';
    loadXlsx().then(function (X) {
      return PA.decrypt(X, p.buf, pw).then(function (plain) { pending = null; showPw(false); openBook(X, p.name, plain); });
    }).catch(function (e) {
      if (e && e.badPassword) { showPw(true, '<span class="text-red-600">비밀번호가 맞지 않습니다. 다시 넣어 주세요.</span>'); return; }
      showPw(false); pending = null; fail(e);
    }).then(function () { btn.disabled = false; });
  };
  PA.fileChosen = function (input) { var f = input.files && input.files[0]; input.value = ''; PA.readFile(f); };
  function bindDrop(zone) {
    ['dragenter', 'dragover'].forEach(function (ev) { zone.addEventListener(ev, function (e) { e.preventDefault(); zone.classList.add('ring-2', 'ring-accent'); }); });
    ['dragleave', 'drop'].forEach(function (ev) { zone.addEventListener(ev, function (e) { e.preventDefault(); zone.classList.remove('ring-2', 'ring-accent'); }); });
    zone.addEventListener('drop', function (e) { var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]; if (f) PA.readFile(f); });
  }

  /* ---------- 모달 ---------- */
  PA.open = function () {
    var m = u.$('smart-paste-modal');
    if (!m) {
      m = document.createElement('div');
      m.id = 'smart-paste-modal'; m.className = 'app-modal fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center hidden z-50 p-3';
      m.innerHTML = '<div class="bg-white rounded-xl shadow-2xl w-[960px] max-w-full max-h-[92vh] flex flex-col border border-slate-200 overflow-hidden">'
        + '<div class="p-5 border-b border-slate-200 flex justify-between items-center bg-slate-900 text-white"><h3 class="font-bold text-base flex items-center gap-2"><i class="fa-solid fa-wand-magic-sparkles text-amber-400"></i> 카드 · 은행 내역 스마트 붙여넣기</h3>'
        + '<button onclick="App.u.close(\'smart-paste-modal\')" aria-label="닫기" class="text-slate-400 hover:text-white text-lg"><i class="fa-solid fa-xmark"></i></button></div>'
        + '<div class="p-6 space-y-4 overflow-y-auto flex-1 custom-scrollbar">'
        + '<div class="grid grid-cols-1 md:grid-cols-2 gap-4 items-end bg-slate-50 p-3.5 rounded-xl border border-slate-200"><div><label class="block text-xs font-semibold text-slate-700 mb-1">카드 내역의 결제수단 (은행 내역은 계좌이체)</label>'
        + '<select id="paste-default-payment" onchange="App.paste.setAllPayments(this.value)" class="w-full border border-slate-300 rounded-lg p-2 text-xs bg-white font-bold text-slate-800"></select></div>'
        + '<p class="text-[11px] text-slate-500 leading-relaxed">💡 카드사 <b>이용일 기준</b> 내역이나 은행 <b>거래내역</b>(입금/출금 열 또는 +/- 금액)을 붙여넣거나 엑셀 파일을 그대로 올리세요. 입금은 수입, 카드대금·본인 계좌 이체는 이체로 나뉘고, 이미 등록된 내역은 자동으로 걸러집니다.</p></div>'
        + '<label id="paste-drop" class="flex items-center gap-3 border-2 border-dashed border-slate-300 hover:border-accent rounded-xl p-3 cursor-pointer bg-white transition"><i class="fa-solid fa-file-arrow-up text-2xl text-accent"></i>'
        + '<span class="text-xs text-slate-600 leading-snug"><b class="text-slate-800">엑셀 · CSV 파일 선택</b> (또는 여기로 끌어놓기)<br><span id="paste-file-status" class="text-[11px] text-slate-400">카드사 · 은행에서 내려받은 .xlsx · .xls · .csv 파일의 첫 시트를 읽습니다.</span></span>'
        + '<input type="file" id="paste-file" accept=".xlsx,.xls,.xlsm,.csv,.txt,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv" onchange="App.paste.fileChosen(this)" class="hidden"></label>'
        + '<div id="paste-pw-row" class="hidden bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-2"><div class="flex gap-2">'
        + '<input type="password" id="paste-pw" autocomplete="off" placeholder="파일 비밀번호" onkeydown="if(event.key===\'Enter\'){event.preventDefault();App.paste.unlock()}" class="flex-1 min-w-0 border border-slate-300 rounded-lg px-2.5 py-2 text-xs">'
        + '<button type="button" id="paste-pw-btn" onclick="App.paste.unlock()" class="shrink-0 bg-slate-900 text-white px-3 py-2 rounded-lg text-xs font-semibold disabled:opacity-50"><i class="fa-solid fa-unlock mr-1"></i>열기</button></div>'
        + '<div id="paste-pw-msg" class="text-[11px] text-amber-800 leading-snug"></div></div>'
        + '<textarea id="paste-raw-text" rows="5" placeholder="붙여넣을 카드 승인 문자나 엑셀 · 은행 거래내역을 입력하세요.&#10;(예시:&#10;2026-10-02&#9;스타벅스 해운대점&#9;12,500&#10;2026-10-25&#9;급여&#9;+3,500,000)" class="w-full border border-slate-300 rounded-lg p-3 text-xs font-mono bg-slate-50/50"></textarea>'
        + '<button onclick="App.paste.parse()" class="bg-slate-900 text-white px-4 py-2 rounded-lg font-semibold text-xs hover:bg-slate-800">분석 및 자동분류 실행</button>'
        + '<div id="parse-result-wrapper" class="hidden space-y-3 border-t border-slate-200 pt-4"><div id="paste-dup-info" class="hidden"></div>'
        + '<div id="paste-summary" class="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-700"></div>'
        + '<div class="max-h-72 overflow-y-auto border border-slate-200 rounded-lg custom-scrollbar"><table id="parse-table" class="w-full text-left text-xs"><thead><tr class="bg-slate-100 border-b border-slate-200 text-slate-600 font-semibold">'
        + '<th class="p-2">날짜</th><th class="p-2">구분</th><th class="p-2">대분류 (자동)</th><th class="p-2">소분류 (자동)</th><th class="p-2">결제수단</th><th class="p-2">가맹점 / 메모</th><th class="p-2 text-right">금액</th><th class="p-2 text-center">삭제</th>'
        + '</tr></thead><tbody id="parse-table-body" class="divide-y divide-slate-100"></tbody></table></div></div></div>'
        + '<div class="p-4 border-t border-slate-200 bg-slate-50 flex justify-end gap-2"><button onclick="App.u.close(\'smart-paste-modal\')" class="px-4 py-2 bg-slate-200 text-slate-700 rounded-lg text-xs hover:bg-slate-300">취소</button>'
        + '<button onclick="App.paste.import()" id="btn-import-parsed" disabled class="px-5 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg text-xs font-semibold disabled:opacity-50">가계부 등록</button></div></div>';
      m.addEventListener('mousedown', function (e) { if (e.target === m) u.close('smart-paste-modal'); });
      document.body.appendChild(m);
      bindDrop(u.$('paste-drop'));
    }
    items = [];
    u.$('paste-raw-text').value = '';
    pending = null; showPw(false);
    u.$('paste-file-status').innerHTML = '카드사 · 은행에서 내려받은 .xlsx · .xls · .csv 파일의 첫 시트를 읽습니다.';
    u.$('parse-result-wrapper').classList.add('hidden');
    u.$('btn-import-parsed').disabled = true; u.$('btn-import-parsed').textContent = '가계부 등록';
    u.$('paste-default-payment').innerHTML = C.payments().map(function (p) { return '<option value="' + u.esc(p) + '">' + u.esc(p) + '</option>'; }).join('');
    u.open('smart-paste-modal');
  };
  PA.items = function () { return items; };
})(window.App);

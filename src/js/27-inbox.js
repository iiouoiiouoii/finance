/* 알림 자동 기록 : 휴대폰 단축어가 카드 알림을 읽어 가계부 주소에 실어 열면, 받아서 내역에 넣는다
   주소 형식 (둘 중 하나, ? 대신 # 도 됨)
     https://…/finance/?add&d=11/03&m=스타벅스&a=12,500&c=하나   ← 날짜 · 가맹점 · 금액 · 카드(이름 첫 낱말, 빼도 됨)
     https://…/finance/?add&t=11/03, 스타벅스, 12,500원&c=하나    ← 단축어가 만든 글 그대로 (줄바꿈 · 쉼표로 나뉜 세 값)
   - 받은 건 먼저 이 기기의 FC_INBOX 에 쌓고, 동기화로 최신 데이터를 받은 뒤 넣는다 (다른 기기 데이터 덮어쓰기 방지)
   - 넣은 내역은 src: 'push' 표시 → 월말 명세서 붙여넣기 때 가맹점 이름이 조금 달라도 날짜 · 금액 · 카드로 중복을 거른다
   - '취소'가 들어 있으면 같은 카드 · 같은 금액으로 알림 기록된 내역을 지운다 */
(function (App) {
  'use strict';
  var u = App.u, C = App.calc, IN = App.inbox = {}, KEY = 'FC_INBOX';
  var db = function () { return App.db; };
  function queue() { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) { return []; } }
  function setQueue(L) { try { if (L.length) localStorage.setItem(KEY, JSON.stringify(L)); else localStorage.removeItem(KEY); } catch (e) {} }

  /* ---------- 값 읽기 ---------- */
  var DATE_FULL = /(20\d{2})\s*[.\/\-년]\s*(\d{1,2})\s*[.\/\-월]\s*(\d{1,2})/, DATE_MD = /(\d{1,2})\s*(?:월\s*|[\/.\-])\s*(\d{1,2})\s*일?/;
  IN.date = function (s) {
    s = String(s || ''); var t = u.today(), y = +t.slice(0, 4), a = s.match(DATE_FULL);
    if (a) return a[1] + '-' + u.pad(+a[2]) + '-' + u.pad(+a[3]);
    a = s.match(DATE_MD);
    if (a && +a[1] >= 1 && +a[1] <= 12 && +a[2] >= 1 && +a[2] <= 31) {
      var d = y + '-' + u.pad(+a[1]) + '-' + u.pad(+a[2]);
      return d > t && u.daysBetween(t, d) > 2 ? (y - 1) + d.slice(4) : d;   /* 1월에 받은 12월 결제 */
    }
    return t;
  };
  IN.amount = function (s) { var m = String(s || '').match(/-?\s*[\d,]+/); return m ? Math.abs(parseInt(m[0].replace(/[^\d]/g, ''), 10) || 0) : 0; };
  /* 세 값이 한 글에 들어온 경우 : 줄바꿈 · 탭 · | · 쉼표(천 단위 쉼표 제외)로 나눠 날짜 · 금액 · 나머지(가맹점)로 */
  IN.fromText = function (t) {
    /* '날짜: 11/03, 가맹점: 스타벅스, 금액: 12,500원' 처럼 이름표가 붙은 글 (단축어의 AI 모델 출력) */
    var s = String(t || ''), lab = function (re) { var m = s.match(re); return m ? m[1].trim() : null; };
    var LD = lab(/(?:날짜|일시|승인일(?:시)?|이용일(?:시)?)\s*[:：]\s*([^,\n|]+)/), LM = lab(/(?:가맹점(?:명)?|사용처|이용처|상호|내용)\s*[:：]\s*([^,\n|]+)/), LA = lab(/(?:금액|승인금액|이용금액|결제금액)\s*[:：]\s*(-?\s*[\d,]+\s*원?)/);
    if (LA && (LD || LM)) return { date: IN.date(LD || s), memo: (LM || '').replace(/^[\[\]'"]+|[\[\]'"]+$/g, '').trim(), amount: IN.amount(LA), cancel: /취소/.test(s) };
    var parts = String(t || '').split(/\r?\n|\t|\||,(?!\d{3}(?!\d))/).map(function (x) { return x.trim(); }).filter(Boolean), d = null, a = 0, rest = [];
    parts.forEach(function (p) {
      if (!d && (DATE_FULL.test(p) || /^\d{1,2}\s*(월|[\/.\-])\s*\d{1,2}/.test(p))) { d = IN.date(p); return; }
      if (!a && /^-?[\d,]+\s*원?$/.test(p.replace(/\s+/g, ''))) { a = IN.amount(p); return; }
      if (/^\d{1,2}:\d{2}$/.test(p) || /^(승인|일시불|누적|체크|신용)$/.test(p)) return;
      rest.push(p);
    });
    if (!a) { var m = String(t || '').match(/([\d,]{2,})\s*원/); if (m) a = IN.amount(m[1]); }
    return { date: d || IN.date(t), memo: rest.join(' ').replace(/\s+/g, ' ').trim(), amount: a, cancel: /취소/.test(t) };
  };
  /* 카드 찾기 : c(카드 이름 첫 낱말) → 등록 카드의 결제수단 이름 */
  function payFor(c, text) {
    var cards = db().cards || [], hit = null, w = String(c || '').replace(/카드$/, '').trim();
    if (w) hit = cards.filter(function (x) { return x.name.indexOf(w) >= 0; })[0];
    if (!hit && text) hit = cards.filter(function (x) { var f = x.name.split(/\s+/)[0]; return f && String(text).indexOf(f) >= 0; })[0];
    if (hit) return C.payments().filter(function (p) { return p.indexOf(hit.name) === 0; })[0] || hit.name;
    return w ? w + '카드' : '카드';
  }

  /* ---------- 주소로 받기 (페이지를 여는 순간) ---------- */
  IN.capture = function () {
    var raw = (location.search.replace(/^\?/, '') + '&' + location.hash.replace(/^#/, '')).replace(/^&|&$/g, '');
    if (!/(^|&)add(=|&|$)/.test(raw)) return;
    var q = new URLSearchParams(raw), it = q.get('t') ? IN.fromText(q.get('t')) : { date: IN.date(q.get('d')), memo: String(q.get('m') || '').trim(), amount: IN.amount(q.get('a')), cancel: /취소/.test((q.get('m') || '') + (q.get('x') || '')) || /^\s*-/.test(q.get('a') || '') };
    it.card = q.get('c') || ''; it.raw = q.get('t') || [q.get('d'), q.get('m'), q.get('a')].join(' / '); it.at = Date.now();
    try { history.replaceState(null, '', location.pathname); } catch (e) {}   /* 새로고침해도 두 번 들어가지 않게 */
    if (!it.amount) { setTimeout(function () { u.toast('알림에서 금액을 못 읽었어요: ' + u.esc(it.raw), 'warning'); }, 800); return; }
    var L = queue(); L.push(it); setQueue(L);
  };
  IN.capture();

  /* ---------- 쌓인 것 넣기 ---------- */
  IN.drain = function () {
    var L = queue(); if (!L.length || !App.db) return;
    var added = [], removed = [], skipped = 0, tx = db().transactions;
    L.forEach(function (it) {
      var pay = payFor(it.card, it.raw), same = function (t) { return t.type === 'EXPENSE' && Number(t.amount) === it.amount && String(t.payment || '').replace(/\s+/g, '') === pay.replace(/\s+/g, ''); };
      if (it.cancel) {
        var lim = u.addM(it.date.slice(0, 7), -1) + '-01', hit = tx.filter(function (t) { return same(t) && t.src === 'push' && t.date >= lim && t.date <= it.date; }).pop();
        if (hit) { db().transactions = tx = tx.filter(function (t) { return t !== hit; }); removed.push(hit.memo); } else skipped++;
        return;
      }
      if (tx.some(function (t) { return same(t) && t.date === it.date; })) { skipped++; return; }   /* 단축어가 두 번 돌았을 때 */
      var p = App.cat.predict(it.memo);
      var t = { id: u.uid(), date: it.date, type: 'EXPENSE', category: p.category, subcategory: p.subcategory, payment: pay, amount: it.amount, memo: it.memo || '카드 결제', owner: 'J', lockCategory: false, src: 'push' };
      tx.push(t); added.push(t);
    });
    setQueue([]);
    if (!added.length && !removed.length) { if (skipped) u.toast('이미 기록된 알림이라 넘어갔어요.'); return; }
    App.store.save();
    var msg = added.length === 1 ? '알림으로 기록했어요: ' + u.esc(added[0].memo) + ' ' + u.n0(added[0].amount) + '원 (' + u.esc(added[0].category) + ')' : added.length ? '알림으로 ' + added.length + '건 기록했어요.' : '';
    if (removed.length) msg += (msg ? ' · ' : '') + '결제 취소 ' + removed.length + '건을 지웠어요.';
    u.toast(msg);
  };
  /* 시작 뒤 : 동기화를 쓰면 최신 데이터를 받은 다음에, 아니면 바로 */
  App.on('booted', function () {
    if (!queue().length) return;
    if (App.sync && App.sync.ready && App.sync.ready()) { var done = false, go = function () { if (!done) { done = true; IN.drain(); } }; App.on('sync-checked', go); setTimeout(go, 12000); }
    else { var skip = null; try { skip = localStorage.getItem('FC27_SKIP'); } catch (e) {} if (skip === '1') IN.drain(); }   /* 로그인 화면이 뜨는 경우엔 로그인 · '로그인 없이'를 고른 뒤에 넣는다 */
  });
})(window.App);

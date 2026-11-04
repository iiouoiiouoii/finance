/* 알림 자동 기록 : 휴대폰 단축어가 카드 · 통장 알림을 보내면 내역에 넣는다. 두 가지 길 : ① 가계부 주소에 실어 열기 ② 화면 없이 GitHub 비공개 수신함(이슈)에 쌓기
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
  /* 알림 글에서 안내 문구를 걷어내고 가게 · 보낸 사람 이름만 남긴다 (띄어쓰기로 이어진 카드 알림 · 통장 알림) */
  var BANKS = '국민은행|KB국민|KB스타|신한은행|하나은행|우리은행|농협|NH농협|기업은행|IBK|카카오뱅크|토스뱅크|케이뱅크|SC제일|씨티|새마을|우체국|신협|수협|부산은행|대구은행|iM뱅크|경남은행|광주은행|전북은행|제주은행';
  var CARDS = '현대카드|하나카드|신한카드|국민카드|KB국민카드|삼성카드|롯데카드|우리카드|BC카드|비씨카드|NH카드|농협카드|씨티카드';
  /* bank : 통장 알림이면 카드사 이름 · '자동이체'는 남긴다 (카드대금 이체 구분 · 카드값 '냈어요' 자동 확인에 쓰인다) */
  IN.cleanMemo = function (s, bank) {
    s = String(s || '')
      .replace(/누적\s*(이용)?\s*(금액)?\s*[:：]?\s*[\d,]+\s*원?/g, ' ').replace(/잔액\s*[:：]?\s*-?[\d,]+\s*원?/g, ' ')
      .replace(/\d{2,6}-[\d*]+(-[\d*]+)*/g, ' ')   /* 계좌번호 562102-**-***535 */
      .replace(/\[[^\]]*\]/g, ' ').replace(/\(?[가-힣A-Za-z0-9]*\*[가-힣A-Za-z0-9*]*\)?\s*님?/g, ' ')   /* [현대카드] · 박*영님 · (2*7*) */
      .replace(/(20\d{2}[.\/\-])?\d{1,2}[.\/\-]\d{1,2}(\s*\d{1,2}:\d{2}(:\d{2})?)?/g, ' ').replace(/\d{1,2}:\d{2}(:\d{2})?/g, ' ')
      .replace(/-?[\d,]+\s*원/g, ' ').replace(/(^|\s)-?[\d,]{2,}(?=\s|$)/g, ' ')
      .replace(new RegExp(bank ? BANKS : BANKS + '|' + CARDS, 'g'), ' ');
    s = bank ? s.replace(/전자금융|인터넷뱅킹|인터넷|모바일|스마트폰|스마트|타행|오픈뱅킹|CMS|FBS|(입금|출금|지급|인출)(?=\s|$)/g, ' ')
      : s.replace(/(정상)?승인(취소)?|일시불|\d+\s*개월|할부|체크카드|체크|신용|님(?=\s|$)/g, ' ');
    return s.replace(/\(\s*\)/g, ' ').replace(/[\/|,·:]+/g, ' ').replace(/\s+/g, ' ').trim();
  };
  IN.fromText = function (t) {
    /* '날짜: 11/03, 가맹점: 스타벅스, 금액: 12,500원' 처럼 이름표가 붙은 글 (단축어의 AI 모델 출력) */
    var s = String(t || ''), lab = function (re) { var m = s.match(re); return m ? m[1].trim() : null; };
    /* 통장 입출금 알림 (KB국민은행 예: 입금 10,000원 박*영님 11/04 11:23 562102-**-***535 부흥중학교 전자금융입금 10,000 잔액5,602,864) */
    var bank = /잔액/.test(s) && s.match(/(입금|출금|지급|인출)\s*[:：]?\s*([\d,]+)\s*원?/);
    if (bank) return { date: IN.date(s), memo: IN.cleanMemo(s, true), amount: IN.amount(bank[2]), dir: bank[1] === '입금' ? 'IN' : 'OUT', cancel: false };
    var LD = lab(/(?:날짜|일시|승인일(?:시)?|이용일(?:시)?)\s*[:：]\s*([^,\n|]+)/), LM = lab(/(?:가맹점(?:명)?|사용처|이용처|상호|내용)\s*[:：]\s*([^,\n|]+)/), LA = lab(/(?:금액|승인금액|이용금액|결제금액)\s*[:：]\s*(-?\s*[\d,]+\s*원?)/);
    if (LA && (LD || LM)) return { date: IN.date(LD || s), memo: (LM || '').replace(/^[\[\]'"]+|[\[\]'"]+$/g, '').trim(), amount: IN.amount(LA), cancel: /취소/.test(s) };
    /* 카드사 알림 원문 : '/' 로 나뉜 형식 (하나카드 예: 정상승인 (2*7*)박*영님 11/04 09:48/일시불/승인/8,180원/쿠팡/누적이용금액 7,595,988원)
       금액 칸 = 처음 나오는 'N원' 칸, 가맹점 = 금액 다음 칸 중 안내 문구가 아닌 첫 칸 (없으면 금액 앞쪽에서) */
    if (s.indexOf('/') >= 0) {
      var seg = s.split('/').map(function (x) { return x.trim(); }), ai = -1, memo = '', skip = /누적|잔액|한도|이용금액|일시불|할부|승인|취소|체크|신용|개월|^[\d\s:.\-]+$/;
      for (var i = 0; i < seg.length; i++) if (/^-?[\d,]+\s*원$/.test(seg[i])) { ai = i; break; }
      if (ai >= 0) {
        for (var j = ai + 1; j < seg.length && !memo; j++) if (seg[j] && !skip.test(seg[j])) memo = seg[j];
        for (var k = ai - 1; k >= 0 && !memo; k--) if (seg[k] && !skip.test(seg[k]) && !/님|\*/.test(seg[k])) memo = seg[k];
        var mon = s.match(/(\d{1,2})\s*개월/);
        return { date: IN.date(s), memo: memo, amount: IN.amount(seg[ai]), cancel: /취소/.test(s), months: mon && !/일시불/.test(s) ? +mon[1] : 0 };
      }
    }
    var parts = String(t || '').split(/\r?\n|\t|\||,(?!\d{3}(?!\d))/).map(function (x) { return x.trim(); }).filter(Boolean), d = null, a = 0, rest = [];
    parts.forEach(function (p) {
      if (!d && (DATE_FULL.test(p) || /^\d{1,2}\s*(월|[\/.\-])\s*\d{1,2}/.test(p))) { d = IN.date(p); return; }
      if (!a && /^-?[\d,]+\s*원?$/.test(p.replace(/\s+/g, ''))) { a = IN.amount(p); return; }
      if (/^\d{1,2}:\d{2}$/.test(p) || /^(승인|일시불|누적|체크|신용)$/.test(p)) return;
      rest.push(p);
    });
    if (!a) { var m = String(t || '').match(/([\d,]{2,})\s*원/); if (m) a = IN.amount(m[1]); }
    /* 한 줄로 띄어 쓴 카드 알림 (현대카드 등) : 안내 문구를 걷어낸 나머지가 가맹점 */
    var mm = s.match(/(\d{1,2})\s*개월/), one = parts.length <= 1;
    return { date: d || IN.date(t), memo: IN.cleanMemo(one ? s : rest.join(' ')), amount: a, cancel: /취소/.test(t), months: one && mm && !/일시불/.test(s) ? +mm[1] : 0 };
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
    var added = [], removed = [], skipped = 0, inst = [], tx = db().transactions;
    L.forEach(function (it) {
      /* 할부 결제 : 전액을 지출로 넣으면 예산이 틀어진다 → 명세서 붙여넣기 때 할부로 들어가도록 넘긴다 */
      if (it.months > 1 && !it.cancel) { inst.push(it); return; }
      /* 통장 입출금 : 명세서 붙여넣기와 같은 규칙으로 수입 · 지출 · 이체(카드대금 · 내 계좌 · 저축) 구분 */
      if (it.dir) {
        var bt = { date: it.date, amount: it.amount, memo: it.memo || (it.dir === 'IN' ? '입금' : '출금') }, text = it.memo + ' ' + it.raw;
        var tr = App.cat.predictTransfer(text, it.dir), bp = tr || (it.dir === 'IN' ? App.cat.predictIncome(text) : App.cat.predict(bt.memo));
        bt.type = tr ? 'TRANSFER' : it.dir === 'IN' ? 'INCOME' : 'EXPENSE';
        if (tx.some(function (t) { return t.type === bt.type && Number(t.amount) === it.amount && t.date === it.date && t.payment === '계좌이체'; })) { skipped++; return; }
        var b = { id: u.uid(), date: it.date, type: bt.type, category: bp.category, subcategory: bp.subcategory, payment: '계좌이체', amount: it.amount, memo: bt.memo, owner: 'J', lockCategory: false, src: 'push' };
        tx.push(b); added.push(b); return;
      }
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
    if (inst.length) setTimeout(function () { u.toast(inst.map(function (x) { return u.esc(x.memo) + ' ' + u.n0(x.amount) + '원 ' + x.months + '개월 할부'; }).join(', ') + '는 월말 명세서를 붙여넣을 때 할부로 들어가요.', 'warning'); }, 400);
    if (!added.length && !removed.length) { if (skipped) u.toast('이미 기록된 알림이라 넘어갔어요.'); return; }
    App.store.save();
    var a0 = added[0], sign = a0 ? (a0.type === 'INCOME' ? '+' : a0.type === 'TRANSFER' ? '' : '') : '';
    var msg = added.length === 1 ? '알림으로 기록했어요: ' + u.esc(a0.memo) + ' ' + sign + u.n0(a0.amount) + '원 (' + (a0.type === 'TRANSFER' ? '이체 · ' : a0.type === 'INCOME' ? '수입 · ' : '') + u.esc(a0.category) + ')' : added.length ? '알림으로 ' + added.length + '건 기록했어요.' : '';
    if (removed.length) msg += (msg ? ' · ' : '') + '결제 취소 ' + removed.length + '건을 지웠어요.';
    u.toast(msg);
  };
  /* =========================================================
     화면 없이 쌓아 두기 : GitHub 비공개 저장소(수신함)의 이슈
     - 단축어가 알림마다 이슈 하나를 만든다 (제목 = 카드 · 은행 이름 첫 낱말, 본문 = 알림 제목 + 본문)
     - 가계부는 열 때 · 다시 볼 때 열린 이슈를 읽어 기록하고 이슈를 닫는다 (닫지 못해도 다음에 중복으로 걸러진다)
     - 읽기 · 닫기는 동기화 토큰을 쓴다 → 그 토큰에 수신함 저장소의 Issues 권한을 더해야 한다
     ========================================================= */
  var pulling = false;
  IN.repo = function () { return (db().settings || {}).inboxRepo || ''; };
  IN.owner = function () { return String(App.sync.home || '').split('/')[0] || 'iiouoiiouoii'; };
  IN.pull = async function (manual) {
    var repo = IN.repo(); if (!repo || !App.sync.ready() || pulling) return; pulling = true;
    try {
      var r = await App.sync.api(repo, '/issues?state=open&per_page=100&sort=created&direction=asc');
      if (!r) throw new Error('수신함(' + repo + ')을 찾지 못했어요. 저장소 이름과, 가계부 토큰에 이 저장소 Issues 권한이 있는지 확인하세요.');
      var list = (await r.json()).filter(function (x) { return !x.pull_request; }), L = queue(), bad = [];
      db().ui.inboxLast = { at: Date.now(), n: list.length };
      if (!list.length) { if (manual) u.toast('수신함에 새 알림이 없어요.'); return; }
      list.forEach(function (x) {
        var body = String(x.body || '').trim(), it = IN.fromText(body);
        it.card = String(x.title || '').trim(); it.raw = body; it.at = Date.now();
        if (it.amount) L.push(it); else bad.push(body.slice(0, 40));
      });
      setQueue(L); IN.drain();
      await Promise.all(list.map(function (x) { return App.sync.api(repo, '/issues/' + x.number, 'PATCH', { state: 'closed' }).catch(function () {}); }));
      if (bad.length) setTimeout(function () { u.toast('못 읽은 알림 ' + bad.length + '건: ' + u.esc(bad[0]), 'warning'); }, 600);
    } catch (e) { if (manual || /GitHub 401/.test(e.message)) App.sync.failToast(e, ''); else console.warn('[알림 수신함]', e); }
    finally { pulling = false; if (u.isOpen && u.isOpen('inbox-modal')) IN.fill(); }
  };

  /* ---------- 설정 창 : 수신함 연결 · 단축어 만드는 법 ---------- */
  function copyBtn(text) { return '<button type="button" onclick="App.inbox.copy(this)" data-v="' + u.esc(text) + '" class="text-[13px] font-semibold text-accent shrink-0">복사</button>'; }
  IN.copy = function (b) { var v = b.getAttribute('data-v'), ok = function () { u.toast('복사했어요.'); }; if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(v).then(ok, function () { prompt('복사하세요', v); }); else prompt('복사하세요', v); };
  IN.open = function () {
    u.modal('inbox-modal', u.modalHead('inbox-title', '카드 · 통장 알림 자동 기록', 'inbox-modal') + '<div id="inbox-body" class="space-y-4 text-[14px] text-slate-700"></div>', 560);
    IN.fill(); u.open('inbox-modal');
  };
  IN.fill = function () {
    var box = u.$('inbox-body'); if (!box) return;
    var o = IN.owner(), repo = IN.repo() || o + '/finance-inbox', on = !!IN.repo(), last = db().ui.inboxLast, ready = App.sync.ready();
    var api = 'https://api.github.com/repos/' + repo + '/issues';
    var step = function (n, t, body) { return '<div class="flex gap-3"><span class="w-6 h-6 rounded-full bg-accent text-white text-[12px] font-bold flex items-center justify-center shrink-0 mt-0.5">' + n + '</span><div class="min-w-0 flex-1 space-y-1.5"><div class="font-semibold text-slate-900">' + t + '</div>' + body + '</div></div>'; };
    var kv = function (k, v, copy) { return '<div class="flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-2"><span class="text-[12px] text-slate-500 shrink-0 w-14">' + k + '</span><code class="text-[12.5px] text-slate-800 break-all flex-1">' + u.esc(v) + '</code>' + (copy ? copyBtn(v) : '') + '</div>'; };
    box.innerHTML = '<p class="text-slate-600 leading-relaxed">결제 · 입출금 알림이 오면 휴대폰 단축어가 내용을 <b>나만 보는 GitHub 비공개 저장소(수신함)</b>에 보내 둡니다. 화면은 아무것도 안 뜨고, 가계부를 열 때 쌓인 걸 가져와 기록합니다.</p>'
      + (!ready ? '<div class="p-3 rounded-xl bg-amber-50 text-amber-900">먼저 이 기기에서 아이디로 로그인해 주세요. 수신함은 로그인 토큰으로 읽습니다.</div>' : '')
      + '<div class="p-3 rounded-xl ' + (on ? 'bg-accent-light text-accent-hover' : 'bg-slate-100 text-slate-600') + '">' + (on ? '연결됨: <b>' + u.esc(repo) + '</b>' + (last ? ' · 마지막 확인 ' + new Date(last.at).toLocaleString('ko-KR') : '') : '아직 연결하지 않았어요. 아래 순서대로 한 번만 준비하면 됩니다.') + '</div>'
      + step(1, '비공개 저장소 만들기', '<p>이름 <b>finance-inbox</b>, 공개 범위 <b>Private</b>으로 만듭니다. (아래 버튼을 누르면 거의 채워져 있어요)</p><a target="_blank" rel="noopener" href="https://github.com/new?name=finance-inbox&visibility=private&description=' + encodeURIComponent('가계부 알림 수신함') + '" class="btn sec" style="height:38px">GitHub에서 저장소 만들기</a>')
      + step(2, '가계부 토큰에 권한 더하기', '<p>처음 가계부를 만들 때 쓴 토큰을 열어 <b>Edit</b> → Repository access에 <b>finance-inbox</b>를 더하고, Permissions의 <b>Issues</b>를 <b>Read and write</b>로 바꾼 뒤 저장합니다. 토큰 값은 그대로라 가계부는 다시 로그인할 필요가 없어요. (<b>Regenerate</b>는 누르지 마세요. 누르면 가계부 토큰이 바뀌어 <button type="button" onclick="App.sync.tokenOpen()" class="more">토큰 바꾸기</button>를 해야 해요.)</p><a target="_blank" rel="noopener" href="https://github.com/settings/personal-access-tokens" class="btn sec" style="height:38px">내 토큰 목록 열기</a>')
      + step(3, '수신함 연결', '<div class="flex gap-2"><input id="inbox-repo" value="' + u.esc(repo) + '" class="' + u.IN + '"><button type="button" onclick="App.inbox.connect()" class="btn pri"' + (ready ? '' : ' disabled') + '>연결 확인</button></div>' + (on ? '<div class="flex gap-3"><button type="button" onclick="App.inbox.pull(true)" class="more">지금 가져오기</button><button type="button" onclick="App.inbox.disconnect()" class="text-[13px] text-slate-400">연결 끊기</button></div>' : ''))
      + step(4, '단축어용 토큰 만들기', '<p>휴대폰 단축어가 쓸 토큰을 따로 만듭니다. Repository access는 <b>finance-inbox만</b>, Permissions는 <b>Issues: Read and write</b>, Expiration은 <b>No expiration</b>. 만든 토큰(github_pat_…)은 5번의 Authorization 값에 한 번 붙여넣고 끝이에요.</p><a target="_blank" rel="noopener" href="https://github.com/settings/personal-access-tokens/new?name=' + encodeURIComponent('가계부-단축어') + '&description=' + encodeURIComponent('카드 · 통장 알림 보내기') + '&target_name=' + encodeURIComponent(o) + '&expires_in=none&issues=write" class="btn sec" style="height:38px">단축어용 토큰 만들기</a>')
      + step(5, '단축어 바꾸기', '<p>지금 쓰는 단축어에서 <b>URL 인코딩 · 텍스트(주소) · URL 열기</b>를 지우고, <b>[제목] [본문]</b> 텍스트 아래에 <b>"URL 내용 가져오기"</b> 하나만 넣어 이렇게 설정합니다.</p>'
        + kv('URL', api, true) + kv('방법', 'POST', false) + kv('헤더 1', 'Authorization', true) + kv('값', 'Bearer 여기에_단축어용_토큰', true) + kv('헤더 2', 'Accept', true) + kv('값', 'application/vnd.github+json', true)
        + '<p>요청 본문은 <b>JSON</b>으로 바꾸고 텍스트 항목 두 개를 넣습니다.</p>' + kv('title', '하나  (카드 · 은행 이름 첫 낱말: 하나 / 현대 / 국민)', false) + kv('body', '[제목] [본문] 텍스트 변수', false)
        + '<p class="text-[13px] text-slate-500">현대카드 · 통장 단축어도 같고 title만 다릅니다. 결제할 때 아무 화면도 안 뜨면 정상이에요.</p>');
  };
  IN.connect = async function () {
    var repo = String(u.val('inbox-repo') || '').trim().replace(/^https?:\/\/github\.com\//, '').replace(/\/$/, '');
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) return u.toast('저장소를 "계정/이름" 형식으로 넣어 주세요.', 'warning');
    try {
      var r = await App.sync.api(repo, '/issues?state=open&per_page=1');
      if (!r) return u.toast('저장소를 찾지 못했어요. 이름이 맞는지, 2번(토큰에 finance-inbox · Issues 권한)을 했는지 확인하세요.', 'error');
      db().settings.inboxRepo = repo; App.store.save(); u.toast('수신함을 연결했어요.'); IN.fill(); IN.pull(true);
    } catch (e) { if (/403/.test(e.message)) u.toast('토큰에 Issues 권한이 없어요. 2번에서 Issues를 Read and write로 바꿔 주세요.', 'error'); else App.sync.failToast(e, ''); }
  };
  IN.disconnect = function () { u.confirm('수신함 연결 끊기', '이 가계부가 수신함을 더 이상 읽지 않아요. 저장소와 쌓인 알림은 그대로 남습니다.', function () { delete db().settings.inboxRepo; App.store.save(); IN.fill(); }); };

  /* 시작 뒤 : 동기화로 최신 데이터를 받은 다음 → 주소로 받아 둔 것 넣기 → 수신함 가져오기 */
  App.on('booted', function () {
    if (App.sync && App.sync.ready && App.sync.ready()) { var done = false, go = function () { if (done) return; done = true; IN.drain(); IN.pull(); }; App.on('sync-checked', go); setTimeout(go, 12000); }
    else if (queue().length) { var skip = null; try { skip = localStorage.getItem('FC27_SKIP'); } catch (e) {} if (skip === '1') IN.drain(); }   /* 로그인 화면이 뜨는 경우엔 로그인 · '로그인 없이'를 고른 뒤에 넣는다 */
  });
  /* 다시 볼 때 (탭 · 앱으로 돌아오면) : 동기화 확인이 끝난 뒤 수신함 */
  App.on('sync-polled', function () { IN.pull(); });
})(window.App);

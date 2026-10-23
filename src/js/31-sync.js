/* GitHub 암호화 동기화 · 설정 코드 · 아이디/비밀번호 간편 로그인
   - 암호화 : 비밀번호 → PBKDF2(250k) → AES-GCM-256, 올릴 때마다 salt/iv 새로 생성 (v20 과 같은 파일 형식)
   - 저장 키 : FC20_SYNC(연결 정보) · FC20_META(sha·저장 시각·업로드 대기) · FC20_PREV(덮어쓰기 전 이전본)
   - 간편 로그인 : 연결 정보를 로그인 비밀번호로 암호화한 fc-login.json (v27 과 같은 형식)
   - 처음 시작 : 아이디·비밀번호·토큰(한 번)만 받아 웹 가계부 저장소의 data 브랜치에 데이터 파일과 로그인 파일을 직접 만든다.
     데이터 암호는 무작위로 만들어 로그인 파일 안에만 둔다. 다른 기기는 아이디·비밀번호만 넣으면 된다. */
(function (App) {
  'use strict';
  var u = App.u, S = App.sync = {};
  var LS = 'FC20_SYNC', MS = 'FC20_META', DBK = 'FINANCIAL_CORE_DB', LK = 'FC27_LOGIN', SK = 'FC27_SESS', SKIP = 'FC27_SKIP', LOGIN_FILE = 'fc-login.json', LOGIN_ITER = 600000;
  var DATA_BRANCH = 'data', DATA_PATH = 'finance-data.enc.json';
  /* 웹 가계부 저장소 : <계정>.github.io/<저장소>/ 에서 열면 그 저장소, 로컬에서 열면 기본 저장소 */
  var HOME_REPO = (function () { var seg = location.pathname.split('/')[1] || ''; return /\.github\.io$/.test(location.hostname) && seg && seg.indexOf('.') < 0 ? location.hostname.split('.')[0] + '/' + seg : 'iiouoiiouoii/finance'; })();
  var enc = new TextEncoder(), dec = new TextDecoder(), mem = { pass: '' }, timer = null, lastCheck = 0, busy = false;
  var getJ = function (k) { try { return JSON.parse(localStorage.getItem(k)) || null; } catch (e) { return null; } };
  var cfg = function () { return getJ(LS) || {}; };
  var meta = function () { return getJ(MS) || {}; };
  var setMeta = function (o) { localStorage.setItem(MS, JSON.stringify(Object.assign(meta(), o))); };
  /* '로그인 유지'를 끄면 암호는 이 탭(sessionStorage)에만 둔다 */
  var pass = function (c) { var s = ''; try { s = sessionStorage.getItem(SK) || ''; } catch (e) {} return c.pass || mem.pass || s; };
  var ready = function (c) { c = c || cfg(); return !!(c.repo && c.token && c.path && pass(c)); };
  var fmt = function (t) { return t ? new Date(t).toLocaleString('ko-KR') : '-'; };
  function guard() { if (!window.crypto || !crypto.subtle) throw new Error('이 환경에서는 암호화를 쓸 수 없습니다. https 주소나 로컬 파일로 여세요.'); }

  /* ---------- 암호화 ---------- */
  function b64(x) { var s = ''; for (var i = 0; i < x.length; i += 8192) s += String.fromCharCode.apply(null, x.subarray(i, i + 8192)); return btoa(s); }
  function unb64(s) { var b = atob(s), x = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) x[i] = b.charCodeAt(i); return x; }
  async function kdf(p, salt, iter) {
    var m = await crypto.subtle.importKey('raw', enc.encode(p), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: salt, iterations: iter, hash: 'SHA-256' }, m, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  async function seal(obj, p) {
    var salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
    var ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, await kdf(p, salt, 250000), enc.encode(JSON.stringify(obj))));
    return JSON.stringify({ fc: 1, savedAt: obj.savedAt, salt: b64(salt), iv: b64(iv), data: b64(ct) });
  }
  async function unseal(txt, p) {
    var f = JSON.parse(txt), k = await kdf(p, unb64(f.salt), 250000), pt;
    try { pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(f.iv) }, k, unb64(f.data)); } catch (e) { throw new Error('암호가 올바르지 않거나 파일이 손상되었습니다.'); }
    return JSON.parse(dec.decode(pt));
  }

  /* ---------- GitHub API ---------- */
  async function gh(c, path, method, body, accept) {
    var h = { Authorization: 'Bearer ' + c.token, Accept: accept || 'application/vnd.github+json' }; if (body) h['Content-Type'] = 'application/json';
    /* cache: 'no-store' : GitHub 응답은 브라우저가 60초 캐시한다. 캐시된 옛 sha 로 비교·업로드하면
       '다른 기기의 변경' 오탐과 409(sha 불일치)가 난다. 항상 저장소의 지금 값을 읽는다 */
    var r = await fetch('https://api.github.com/repos/' + c.repo + path, { method: method || 'GET', headers: h, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' });
    if (r.status === 404) return null;
    if (!r.ok) { var e = {}; try { e = await r.json(); } catch (x) {} throw new Error('GitHub ' + r.status + (e.message ? ': ' + e.message : '')); }
    return r;
  }
  async function remote(c, ref) {
    ref = ref || c.branch;
    var q = '/contents/' + encodeURI(c.path) + (ref ? '?ref=' + encodeURIComponent(ref) : ''), r = await gh(c, q); if (!r) return null;
    var j = await r.json(), txt;
    if (j.content) txt = dec.decode(unb64(j.content.replace(/\n/g, '')));
    else txt = await (await gh(c, q, 'GET', null, 'application/vnd.github.raw+json')).text();
    return { sha: j.sha, txt: txt };
  }

  /* ---------- 상태 표시 ---------- */
  var state = 'off';
  function setSt(s, msg) {
    state = s;
    if (App.ui.renderFoot) App.ui.renderFoot();
    var t = u.$('sync-status'); if (t) t.innerHTML = msg || (cfg().repo ? '마지막 동기화: <b>' + fmt(meta().savedAt) + '</b>' + (meta().dirty ? ' · <span class="text-amber-600">업로드 대기</span>' : '') : '아직 연결되지 않았습니다.');
  }
  function apply(o, sha) {
    try { localStorage.setItem('FC20_PREV', localStorage.getItem(DBK) || ''); } catch (e) {}
    App.store.replace(o.db, { fromSync: true });
    setMeta({ sha: sha, savedAt: o.savedAt, dirty: false }); setSt(cfg().mode === 'ro' ? 'ro' : 'ok');
    u.toast('저장소의 최신 데이터를 불러왔습니다.');
  }

  /* ---------- 동기화 ---------- */
  S.push = async function (force) {
    var c = cfg(); if (c.mode === 'ro' || !ready(c) || busy) return; busy = true; clearTimeout(timer);
    try {
      guard(); setSt('busy', '업로드 중...');
      var rm = await remote(c), m = meta();
      if (rm && rm.sha !== m.sha && !force) {
        var rf = JSON.parse(rm.txt);
        var ch = await u.choose('<i class="fa-solid fa-cloud-arrow-down text-amber-500 mr-1.5"></i>동기화 확인', '저장소에 이 기기가 모르는 변경이 있습니다.\n저장소 저장 시각: <b>' + fmt(rf.savedAt) + '</b>\n이 기기 마지막 동기화: <b>' + fmt(m.savedAt) + '</b>',
          [{ label: '저장소 데이터 불러오기 (이 기기 변경은 이전 데이터로 보관)', value: 'pull' }, { label: '이 기기 데이터로 덮어쓰기', value: 'force' }, { label: '보류', value: 'hold' }]);
        if (ch === 'pull') { busy = false; return S.pull(true); }
        if (ch !== 'force') { setSt('warn'); return; }
        force = true;   /* 덮어쓰기로 정함 : 아래 409 재시도에서 다시 묻지 않는다 */
      }
      var at = Date.now(), body = await seal({ savedAt: at, db: App.db }, pass(c)), j;
      var put = function (sha) { return gh(c, '/contents/' + encodeURI(c.path), 'PUT', { message: 'backup ' + new Date(at).toISOString(), content: b64(enc.encode(body)), sha: sha, branch: c.branch || undefined }); };
      try { j = await (await put(rm ? rm.sha : undefined)).json(); }
      catch (e) {
        /* 409 : 읽은 뒤 올리기 직전에 다른 기기가 먼저 저장함. 덮어쓰기로 정했으면 최신 sha 로 한 번 더, 아니면 다시 확인 */
        if (!/GitHub 409/.test(e.message)) throw e;
        var now = await remote(c);
        if (!force) { busy = false; return await S.push(false); }
        j = await (await put(now ? now.sha : undefined)).json();
      }
      setMeta({ sha: j.content.sha, savedAt: at, dirty: false }); setSt('ok'); return true;
    } catch (e) { setSt('err', '<span class="text-red-600">' + u.esc(e.message) + '</span>'); u.toast('동기화 실패: ' + e.message, 'error'); }
    finally { busy = false; }
  };
  S.pull = async function (force) {
    var c = cfg(); if (!ready(c)) return;
    try {
      guard(); setSt('busy', '불러오는 중...');
      var rm = await remote(c);
      if (!rm) { u.toast('저장소에 데이터 파일이 아직 없습니다.', 'warning'); setSt('warn'); return; }
      var o = await unseal(rm.txt, pass(c));
      if (!force && (meta().dirty || !meta().sha) && c.mode !== 'ro') {
        var ch = await u.choose('동기화 확인', '이 기기에 업로드되지 않은 변경이 있습니다. 저장소 데이터(' + fmt(o.savedAt) + ')로 바꾸면 이 기기 데이터는 이전본으로만 남습니다.', [{ label: '저장소 데이터로 바꾸기', value: 'go' }, { label: '취소', value: 'no' }]);
        if (ch !== 'go') { setSt('warn'); return; }
      }
      apply(o, rm.sha); return true;
    } catch (e) { setSt('err', '<span class="text-red-600">' + u.esc(e.message) + '</span>'); u.toast(e.message, 'error'); }
  };
  S.check = async function () {
    var c = cfg(); if (!ready(c) || busy) return; lastCheck = Date.now();
    try {
      guard(); var rm = await remote(c), m = meta(), hasLocal = (App.db.transactions || []).length + (App.db.assets || []).length > 0;
      if (!rm) { if (c.mode !== 'ro' && hasLocal) return S.push(); return setSt('warn', '저장소에 파일이 없습니다. [지금 업로드]로 첫 백업을 만드세요.'); }
      if (rm.sha === m.sha) { setSt(c.mode === 'ro' ? 'ro' : 'ok'); return m.dirty && c.mode !== 'ro' ? S.push() : 0; }
      if (c.mode === 'ro') return S.pull(true);
      if (m.sha && !m.dirty) { var ch = await u.choose('동기화 확인', '다른 기기에서 저장한 더 최신 데이터가 있습니다. 불러올까요?', [{ label: '불러오기', value: 'pull' }, { label: '나중에', value: 'no' }]); if (ch === 'pull') S.pull(true); return; }
      if (hasLocal || m.dirty) return S.push(); return S.pull(true);
    } catch (e) { setSt('err', '<span class="text-red-600">' + u.esc(e.message) + '</span>'); }
  };
  /* 데이터가 바뀌면 5초 뒤 자동 업로드 (렌더 중 기록·동기화로 받은 데이터는 제외) */
  App.on('saved', function (opt) {
    if (opt && opt.fromSync) return;
    var c = cfg(); if (!ready(c) || c.mode === 'ro') return;
    setMeta({ dirty: true }); setSt('warn'); clearTimeout(timer); timer = setTimeout(function () { S.push(false); }, 5000);
  });
  document.addEventListener('visibilitychange', function () { if (!document.hidden && Date.now() - lastCheck > 30000) S.check(); });

  /* ---------- 변경 이력 ---------- */
  S.history = async function () {
    var c = cfg(), box = u.$('sync-hist'); if (!ready(c)) return u.toast('먼저 연결 정보를 저장하세요.', 'warning');
    box.innerHTML = '<div class="text-xs text-slate-400">불러오는 중...</div>';
    try {
      var r = await gh(c, '/commits?path=' + encodeURIComponent(c.path) + (c.branch ? '&sha=' + encodeURIComponent(c.branch) : '') + '&per_page=15'), l = r ? await r.json() : [];
      box.innerHTML = l.length ? l.map(function (x) { return '<div class="flex items-center justify-between text-xs py-1.5 border-t border-slate-100"><span>' + fmt(x.commit.committer.date) + '</span><button onclick="App.sync.restore(\'' + x.sha + '\')" class="text-accent font-semibold">이 시점으로 복원</button></div>'; }).join('') : '<div class="text-xs text-slate-400">이력이 없습니다.</div>';
    } catch (e) { box.innerHTML = '<div class="text-xs text-red-600">' + u.esc(e.message) + '</div>'; }
  };
  S.restore = async function (sha) {
    var c = cfg();
    try {
      guard(); var old = await remote(c, sha), head = await remote(c), o = await unseal(old.txt, pass(c));
      if ((await u.choose('복원', '<b>' + fmt(o.savedAt) + '</b> 시점의 데이터로 복원합니다. 현재 기기 데이터는 이전본으로 보관되고, 복원본이 저장소에 새로 저장됩니다.', [{ label: '복원', value: 'go' }, { label: '취소', value: 'no' }])) !== 'go') return;
      apply(o, head.sha); setMeta({ dirty: true }); clearTimeout(timer); timer = setTimeout(function () { S.push(false); }, 1500);
    } catch (e) { u.toast(e.message, 'error'); }
  };

  /* ---------- 설정 모달 ---------- */
  function modal() {
    var inp = function (id, label, type, ph) { return '<div><label class="block font-semibold text-slate-600 mb-1">' + label + '</label><input id="' + id + '" type="' + type + '" placeholder="' + (ph || '') + '" autocomplete="off" class="w-full border border-slate-300 rounded-lg px-2.5 py-2"></div>'; };
    return u.modal('sync-modal', '<div class="flex justify-between items-center"><h3 class="font-bold text-slate-800 text-base"><i class="fa-brands fa-github mr-2"></i>GitHub 암호화 백업·동기화</h3><button onclick="App.u.close(\'sync-modal\')" class="text-slate-400 hover:text-slate-700"><i class="fa-solid fa-xmark"></i></button></div>'
      + '<div id="sync-status" class="bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs"></div>'
      + '<div class="flex flex-wrap gap-2 text-xs"><button onclick="App.sync.push(false)" class="border border-slate-300 px-3.5 py-2 rounded-lg">지금 업로드</button><button onclick="App.sync.pull(false)" class="border border-slate-300 px-3.5 py-2 rounded-lg">지금 불러오기</button><button onclick="App.sync.history()" class="border border-slate-300 px-3.5 py-2 rounded-lg">변경 이력</button></div><div id="sync-hist"></div>'
      + '<div class="border-t border-slate-200 pt-4 space-y-2 text-xs"><div class="font-bold text-slate-700"><i class="fa-solid fa-user-plus mr-1.5"></i>아이디 추가 (배우자용)</div><p class="text-slate-500 leading-relaxed">지금 연결된 가계부에 들어갈 아이디를 하나 더 만듭니다. 배우자는 그 아이디·비밀번호만 넣으면 같은 데이터를 봅니다.</p>'
      + '<div class="grid grid-cols-2 gap-2"><input id="login-new-id" placeholder="아이디" autocomplete="off" autocapitalize="none" class="border border-slate-300 rounded-lg px-2.5 py-2"><select id="login-new-mode" class="border border-slate-300 rounded-lg px-2.5 py-2"><option value="rw">입력·수정 가능</option><option value="ro">조회 전용</option></select>'
      + '<input id="login-new-pw" type="password" placeholder="비밀번호 (10자 이상)" autocomplete="new-password" class="border border-slate-300 rounded-lg px-2.5 py-2"><input id="login-new-pw2" type="password" placeholder="비밀번호 확인" autocomplete="new-password" class="border border-slate-300 rounded-lg px-2.5 py-2"></div>'
      + '<button onclick="App.sync.makeLoginFile()" class="bg-slate-800 text-white px-3.5 py-2 rounded-lg font-semibold">아이디 추가</button><div id="login-mk-msg" class="text-[11px]"></div></div>'
      + '<details class="border-t border-slate-200 pt-3 text-xs"><summary class="font-semibold text-slate-500 cursor-pointer">고급: 연결 정보 직접 입력 · 설정 코드</summary><div class="space-y-3 mt-3">'
      + '<details class="bg-sky-50 border border-sky-200 rounded-lg p-3 text-sky-900 text-xs"><summary class="font-semibold cursor-pointer">직접 연결하는 방법</summary><ol class="list-decimal ml-4 mt-2 space-y-1"><li>GitHub에서 <b>Private(비공개)</b> 저장소를 만듭니다. (예: finance-data)</li><li>Settings → Developer settings → Fine-grained tokens에서 토큰을 만들고 <b>그 저장소만</b> 선택합니다.</li><li>Repository permissions → <b>Contents: Read and write</b> (조회 전용 기기는 Read-only).</li><li>아래에 저장소와 토큰, 암호를 입력합니다. 암호는 분실하면 복구할 수 없습니다.</li></ol></details>'
      + '<div class="space-y-3 text-xs">' + inp('sync-repo', '저장소 (계정/저장소명)', 'text', 'myname/finance-data') + inp('sync-path', '파일 경로', 'text', 'finance-data.enc.json') + inp('sync-token', 'GitHub 토큰', 'password', 'github_pat_...') + inp('sync-pass', '암호화 암호', 'password', '')
      + '<label class="flex items-center gap-2"><input id="sync-remember" type="checkbox"> 이 기기에 암호 저장 (자동 동기화에 필요, 공용 PC에서는 해제)</label>'
      + '<div><label class="block font-semibold text-slate-600 mb-1">이 기기의 역할</label><select id="sync-mode" class="w-full border border-slate-300 rounded-lg px-2.5 py-2"><option value="rw">입력용 (변경 시 자동 업로드)</option><option value="ro">조회 전용 (불러오기만, 업로드 안 함)</option></select></div>'
      + '<div class="flex flex-wrap gap-2"><button onclick="App.sync.saveCfg()" class="bg-accent text-white px-3.5 py-2 rounded-lg font-semibold">저장 후 연결 테스트</button><button onclick="App.sync.off()" class="ml-auto text-red-500 px-2">연결 해제</button></div>'
      + '<div class="border-t border-slate-200 pt-4 space-y-2"><div class="font-bold text-slate-700"><i class="fa-solid fa-mobile-screen mr-1.5"></i>다른 기기에 연결하기 (설정 코드)</div><p class="text-slate-500 leading-relaxed">연결을 저장한 기기에서 코드를 복사해 새 기기에 붙여넣으면 입력이 끝납니다. 코드에는 <b>토큰과 암호가 들어 있으니</b> 나와의 채팅·비밀번호 관리자로만 옮기고, 다 쓰면 지우세요.</p>'
      + '<div class="flex flex-wrap gap-2"><button onclick="App.sync.copyCode(false)" class="border border-slate-300 px-3.5 py-2 rounded-lg">설정 코드 복사</button><button onclick="App.sync.copyCode(true)" class="border border-slate-300 px-3.5 py-2 rounded-lg">설정 링크 복사</button></div>'
      + '<textarea id="sync-code" rows="2" placeholder="이 기기에 적용할 설정 코드를 붙여넣으세요 (FCS1.…)" class="w-full border border-slate-300 rounded-lg px-2.5 py-2 text-[11px]"></textarea><button onclick="App.sync.applyCode(App.u.val(\'sync-code\'))" class="bg-slate-800 text-white px-3.5 py-2 rounded-lg font-semibold">코드 적용하고 연결</button></div>'
      + '</div></div></details>'
      + '<p class="text-[11px] text-slate-400 leading-relaxed">※ 로그인 파일에는 토큰과 데이터 암호가 로그인 비밀번호로 암호화되어 들어 있고, 공개 저장소에 올라갑니다. 비밀번호를 길게 정하세요. 비밀번호가 새었다면 GitHub에서 토큰을 지우고 새로 만든 뒤 아이디를 다시 만들면 됩니다.</p>', 540);
  }
  S.open = function () {
    modal();
    var c = cfg();
    u.$('sync-repo').value = c.repo || ''; u.$('sync-path').value = c.path || 'finance-data.enc.json'; u.$('sync-token').value = c.token || ''; u.$('sync-pass').value = pass(c) || '';
    u.$('sync-remember').checked = !!c.pass; u.$('sync-mode').value = c.mode || 'rw';
    setSt(c.repo ? (c.mode === 'ro' ? 'ro' : 'ok') : 'off'); u.open('sync-modal');
  };
  S.saveCfg = async function () {
    var c = { repo: u.val('sync-repo').trim(), path: u.val('sync-path').trim() || 'finance-data.enc.json', token: u.val('sync-token').trim(), mode: u.val('sync-mode') }, p = u.val('sync-pass');
    if (!/^[\w.-]+\/[\w.-]+$/.test(c.repo) || !c.token || p.length < 8) return u.toast('저장소(계정/이름), 토큰, 8자 이상의 암호를 입력하세요.', 'warning');
    var old = cfg(); if (old.branch && old.repo === c.repo) c.branch = old.branch;
    mem.pass = p; if (u.$('sync-remember').checked) c.pass = p; localStorage.setItem(LS, JSON.stringify(c));
    try {
      guard(); setSt('busy', '연결 확인 중...');
      var rm = await remote(c);
      if (rm) { await unseal(rm.txt, p); u.toast('연결 성공 · 저장소에 기존 백업이 있습니다.'); } else u.toast('연결 성공 · 아직 백업 파일이 없습니다. [지금 업로드]로 첫 백업을 만드세요.');
      setSt(c.mode === 'ro' ? 'ro' : 'ok'); if (rm) S.check();
    } catch (e) { setSt('err', '<span class="text-red-600">' + u.esc(e.message) + '</span>'); }
  };
  S.off = function () { [LS, MS, LK].forEach(function (k) { localStorage.removeItem(k); }); mem.pass = ''; try { sessionStorage.removeItem(SK); } catch (e) {} S.open(); u.toast('연결을 해제했습니다. (저장소의 백업은 삭제되지 않습니다)'); App.ui.render(); };

  /* ---------- 설정 코드 (v21) ---------- */
  function makeCode() {
    var o = { r: u.val('sync-repo').trim(), p: u.val('sync-path').trim(), t: u.val('sync-token').trim(), w: u.val('sync-pass'), m: u.val('sync-mode'), b: cfg().branch };
    if (!o.r || !o.t || !o.w) { u.toast('저장소·토큰·암호를 먼저 입력하고 연결을 저장해 주세요.', 'warning'); return null; }
    return 'FCS1.' + btoa(unescape(encodeURIComponent(JSON.stringify(o)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function parseCode(s) {
    s = String(s || '').trim(); var i = s.indexOf('FCS1.'); if (i < 0) throw new Error('설정 코드 형식이 아닙니다.');
    var b = s.slice(i + 5).replace(/[^\w\-]/g, '').replace(/-/g, '+').replace(/_/g, '/'); while (b.length % 4) b += '=';
    var o = JSON.parse(decodeURIComponent(escape(atob(b)))); if (!o.r || !o.t || !o.w) throw new Error('설정 코드에 필요한 정보가 없습니다.');
    return o;
  }
  function copy(text, msg) {
    var done = function () { u.toast(msg); };
    var fallback = function () { var t = document.createElement('textarea'); t.value = text; t.style.position = 'fixed'; t.style.opacity = '0'; document.body.appendChild(t); t.select(); try { document.execCommand('copy'); done(); } catch (e) { prompt('아래 내용을 복사하세요', text); } t.remove(); };
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done, fallback); else fallback();
  }
  S.copyCode = function (asLink) { var c = makeCode(); if (!c) return; copy(asLink ? location.origin + location.pathname + '#fcs=' + c : c, asLink ? '설정 링크를 복사했습니다. 새 기기 브라우저에서 열면 자동 연결됩니다.' : '설정 코드를 복사했습니다.'); };
  S.applyCode = async function (s) {
    var o; try { o = parseCode(s); } catch (e) { return u.toast(e.message, 'error'); }
    if (o.b) localStorage.setItem(LS, JSON.stringify({ repo: o.r, branch: o.b }));
    S.open();
    u.$('sync-repo').value = o.r; u.$('sync-path').value = o.p || 'finance-data.enc.json'; u.$('sync-token').value = o.t; u.$('sync-pass').value = o.w; u.$('sync-mode').value = o.m === 'ro' ? 'ro' : 'rw'; u.$('sync-remember').checked = true;
    await S.saveCfg();
  };

  /* ---------- 간편 로그인 (v27) ---------- */
  function normId(id) { return String(id || '').trim().toLowerCase(); }
  async function idKey(id) { var h = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode('fc-login-v1|' + normId(id)))); return [].map.call(h, function (x) { return ('0' + x.toString(16)).slice(-2); }).join('').slice(0, 40); }
  async function lseal(obj, pw) {
    var salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
    var ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, await kdf(pw, salt, LOGIN_ITER), enc.encode(JSON.stringify(obj))));
    return { s: b64(salt), i: b64(iv), d: b64(ct), n: LOGIN_ITER };
  }
  async function lunseal(rec, pw) { return JSON.parse(dec.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(rec.i) }, await kdf(pw, unb64(rec.s), rec.n || LOGIN_ITER), unb64(rec.d)))); }
  /* 로그인 파일 : 웹 가계부 저장소의 data 브랜치 → (예전 방식) 웹 가계부 옆 파일 순서로 찾는다 */
  async function fetchLogins() {
    var ok = function (j) { return j && j.fcLogin === 1 && j.users ? j : null; };
    try {
      var r = await fetch('https://api.github.com/repos/' + HOME_REPO + '/contents/' + LOGIN_FILE + '?ref=' + DATA_BRANCH + '&t=' + Date.now(), { cache: 'no-store', headers: { Accept: 'application/vnd.github.raw+json' } });
      if (r.ok) { var j = ok(await r.json()); if (j) return j; }
    } catch (e) {}
    try { var r2 = await fetch(LOGIN_FILE + '?t=' + Date.now(), { cache: 'no-store' }); if (!r2.ok) return null; return ok(await r2.json()); } catch (e) { return null; }
  }
  function checkIdPw(id, pw, pw2) {
    if (!/^[a-z0-9._@-]{3,40}$/.test(normId(id))) return '아이디는 영문·숫자·._@- 로 3~40자로 정하세요.';
    if (pw.length < 10 || !/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return '비밀번호는 10자 이상, 영문과 숫자를 섞어 주세요. 로그인 파일은 공개 저장소에 올라가므로 쉬운 비밀번호는 위험합니다.';
    if (pw !== pw2) return '비밀번호 확인이 일치하지 않습니다.';
    return '';
  }
  /* 로그인 파일에 아이디 하나를 더하거나 바꿔서 저장소(data 브랜치)에 바로 올린다 */
  async function saveLogin(token, id, pw, conf) {
    var c = { repo: HOME_REPO, token: token, path: LOGIN_FILE, branch: DATA_BRANCH }, rm = await remote(c), L = null;
    try { L = rm ? JSON.parse(rm.txt) : null; } catch (e) {}
    if (!L || L.fcLogin !== 1 || !L.users) L = { fcLogin: 1, users: {} };
    L.users[await idKey(id)] = await lseal(conf, pw); L.updatedAt = new Date().toISOString();
    await gh(c, '/contents/' + LOGIN_FILE, 'PUT', { message: 'login ' + L.updatedAt, content: b64(enc.encode(JSON.stringify(L, null, 1))), sha: rm ? rm.sha : undefined, branch: DATA_BRANCH });
    return Object.keys(L.users).length;
  }
  /* 데이터 전용 data 브랜치가 없으면 빈 브랜치로 만든다 (웹 화면이 나가는 main 과 섞이지 않게) */
  async function ensureBranch(token) {
    var c = { repo: HOME_REPO, token: token };
    if (!(await gh(c, ''))) throw new Error('토큰으로 ' + HOME_REPO + ' 저장소에 접근하지 못했습니다. 토큰을 만들 때 이 저장소를 골랐는지 확인하세요.');
    if (await gh(c, '/branches/' + DATA_BRANCH)) return;
    var post = async function (p, body) { return (await gh(c, p, 'POST', body)).json(); };
    var tree = await post('/git/trees', { tree: [{ path: 'README.md', mode: '100644', type: 'blob', content: '부부 가계부 암호화 데이터 전용 브랜치입니다. 직접 고치지 마세요.\n' }] });
    var cm = await post('/git/commits', { message: '가계부 데이터 브랜치', tree: tree.sha, parents: [] });
    await post('/git/refs', { ref: 'refs/heads/' + DATA_BRANCH, sha: cm.sha });
  }
  function friendly(e) {
    var m = e && e.message || String(e);
    if (/GitHub 401/.test(m)) return '토큰이 올바르지 않거나 만료되었습니다. 토큰을 다시 복사해 붙여넣으세요.';
    if (/GitHub 403/.test(m)) return '토큰에 쓰기 권한이 없습니다. Contents 권한을 Read and write 로 만드세요.';
    return m;
  }
  /* 이 기기를 연결 상태로 만든다 (로그인·처음 시작 공통) */
  function connect(id, conf, keep) {
    var c = { repo: conf.r, path: conf.p || DATA_PATH, token: conf.t, mode: conf.m === 'ro' ? 'ro' : 'rw' };
    if (conf.b) c.branch = conf.b;
    if (keep) c.pass = conf.w;
    localStorage.setItem(LS, JSON.stringify(c)); localStorage.removeItem(MS); localStorage.removeItem(SKIP);
    try { if (keep) sessionStorage.removeItem(SK); else sessionStorage.setItem(SK, conf.w); } catch (e) {}
    mem.pass = conf.w;
    localStorage.setItem(LK, JSON.stringify({ id: normId(id), at: Date.now(), keep: keep, mode: c.mode }));
  }
  /* 배우자용 아이디 추가 : 지금 연결 정보를 그대로 새 아이디·비밀번호로 잠가 올린다 */
  S.makeLoginFile = async function () {
    var c = cfg(), conf = { r: c.repo, p: c.path || DATA_PATH, b: c.branch, t: c.token, w: pass(c) };
    var id = u.val('login-new-id'), pw = u.val('login-new-pw'), out = u.$('login-mk-msg');
    var say = function (t, cls) { out.className = 'text-[11px] ' + (cls || 'text-red-600'); out.innerHTML = t; };
    if (!ready(c)) return say('먼저 로그인(또는 처음 시작)으로 이 기기를 연결하세요.');
    var bad = checkIdPw(id, pw, u.val('login-new-pw2')); if (bad) return say(bad);
    if (pw === conf.w) return say('로그인 비밀번호는 데이터 암호와 다르게 정하세요.');
    conf.m = u.val('login-new-mode') === 'ro' ? 'ro' : 'rw';
    try {
      guard(); say('암호화해서 올리는 중...', 'text-slate-500');
      var n = await saveLogin(c.token, id, pw, conf);
      say('아이디 <b>' + u.esc(normId(id)) + '</b>를 추가했습니다 (모두 ' + n + '개). 다른 기기에서 이 아이디·비밀번호로 로그인하면 됩니다.', 'text-emerald-700');
      u.$('login-new-pw').value = ''; u.$('login-new-pw2').value = '';
    } catch (e) { say(u.esc(friendly(e))); }
  };

  /* ---------- 로그인 화면 (로그인 / 처음 시작) ---------- */
  var gateMode = 'login';
  function tokenUrl() {
    return 'https://github.com/settings/personal-access-tokens/new?name=' + encodeURIComponent('가계부-' + new Date().toISOString().slice(0, 10)) + '&description=' + encodeURIComponent('부부 가계부 데이터 동기화')
      + '&target_name=' + encodeURIComponent(HOME_REPO.split('/')[0]) + '&expires_in=none&contents=write';
  }
  function gate(show, mode) {
    var g = u.$('login-gate');
    if (!g) {
      var IN = 'w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm', TAB = 'flex-1 py-2 rounded-lg text-xs font-bold';
      document.body.insertAdjacentHTML('beforeend', '<div id="login-gate" class="hidden fixed inset-0 z-[9990] bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"><form id="login-form" class="bg-white rounded-2xl p-6 w-full max-w-sm space-y-4 shadow-2xl my-auto" autocomplete="on">'
        + '<div class="flex items-center gap-3"><div class="w-10 h-10 rounded-xl bg-accent text-white flex items-center justify-center"><i class="fa-solid fa-house-chimney-window"></i></div><div><div class="font-bold text-slate-800">부부 가계부</div><div id="login-sub" class="text-[11px] text-slate-500"></div></div></div>'
        + '<div class="flex gap-1 bg-slate-100 p-1 rounded-xl"><button type="button" id="login-tab-login" onclick="App.sync.gateMode(\'login\')" class="' + TAB + '">로그인</button><button type="button" id="login-tab-setup" onclick="App.sync.gateMode(\'setup\')" class="' + TAB + '">처음 시작 (한 번만)</button></div>'
        + '<div><label class="block text-xs font-semibold text-slate-600 mb-1">아이디</label><input id="login-id" name="username" autocomplete="username" autocapitalize="none" class="' + IN + '"></div>'
        + '<div><label class="block text-xs font-semibold text-slate-600 mb-1">비밀번호</label><input id="login-pw" name="password" type="password" autocomplete="current-password" class="' + IN + '"></div>'
        + '<div id="login-setup" class="hidden space-y-4"><div><label class="block text-xs font-semibold text-slate-600 mb-1">비밀번호 확인</label><input id="login-pw2" type="password" autocomplete="new-password" class="' + IN + '"></div>'
        + '<div class="bg-sky-50 border border-sky-200 rounded-xl p-3 space-y-2"><div class="flex items-center justify-between gap-2"><label class="text-xs font-semibold text-sky-900">GitHub 토큰 <span class="font-normal">(이번 한 번만)</span></label><a id="login-token-link" target="_blank" rel="noopener" class="text-[11px] bg-slate-800 text-white px-2.5 py-1 rounded-lg font-semibold whitespace-nowrap"><i class="fa-brands fa-github mr-1"></i>토큰 만들기</a></div>'
        + '<ol class="list-decimal ml-4 text-[11px] text-sky-900 space-y-0.5"><li>[토큰 만들기]를 눌러 GitHub에 로그인합니다.</li><li>Repository access에서 <b>Only select repositories → ' + u.esc(HOME_REPO.split('/')[1]) + '</b>를 고릅니다.</li><li>Permissions의 <b>Contents</b>가 Read and write, Expiration이 <b>No expiration</b>인지 보고 [Generate token]을 누릅니다.</li><li>나온 토큰(github_pat_…)을 복사해 아래에 붙여넣습니다.</li></ol>'
        + '<input id="login-token" type="password" autocomplete="off" placeholder="github_pat_..." class="' + IN + ' bg-white"></div>'
        + '<p class="text-[11px] text-slate-500 leading-relaxed">지금 이 기기에 있는 가계부 데이터가 그대로 올라가고, 이후 다른 기기에서는 <b>아이디·비밀번호만</b> 넣으면 됩니다.</p></div>'
        + '<label class="flex items-center gap-2 text-xs text-slate-600"><input id="login-keep" type="checkbox" checked> 이 기기에서 로그인 유지 (내 휴대폰·PC일 때만)</label><div id="login-msg" class="text-xs"></div>'
        + '<button id="login-go" type="submit" class="w-full bg-accent hover:bg-accent-hover text-white py-2.5 rounded-lg font-bold">로그인</button>'
        + '<button type="button" onclick="App.sync.skipLogin()" class="w-full text-xs text-slate-500 hover:text-slate-800">로그인 없이 이 기기에서만 쓰기</button></form></div>');
      g = u.$('login-gate');
      u.$('login-token-link').href = tokenUrl();
      u.$('login-form').onsubmit = function (e) { e.preventDefault(); if (gateMode === 'setup') S.setup(); else S.login(); };
    }
    S.gateMode(mode || gateMode);
    g.classList.toggle('hidden', !show);
    if (show) setTimeout(function () { u.$('login-id').focus(); }, 50);
  }
  S.gateMode = function (m) {
    gateMode = m === 'setup' ? 'setup' : 'login';
    var on = 'bg-white text-slate-800 shadow-sm', off = 'text-slate-500';
    [['login', 'login-tab-login'], ['setup', 'login-tab-setup']].forEach(function (x) { var b = u.$(x[1]); b.className = b.className.replace(on, '').replace(off, '').trim() + ' ' + (gateMode === x[0] ? on : off); });
    u.$('login-setup').classList.toggle('hidden', gateMode !== 'setup');
    u.$('login-pw').autocomplete = gateMode === 'setup' ? 'new-password' : 'current-password';
    u.$('login-sub').innerText = gateMode === 'setup' ? '아이디·비밀번호를 정하고 토큰을 한 번만 넣으면 끝납니다.' : '아이디와 비밀번호로 내 데이터를 불러옵니다.';
    u.$('login-go').innerText = gateMode === 'setup' ? '시작하기' : '로그인';
    u.$('login-msg').innerText = '';
  };
  S.showLogin = function () { gate(true); };
  S.skipLogin = function () { localStorage.setItem(SKIP, '1'); gate(false); u.toast('이 기기에서만 저장됩니다. 상단 [로그인]으로 언제든 연결할 수 있습니다.'); };
  function gateUi() {
    var msg = u.$('login-msg'), btn = u.$('login-go'), label = btn.innerText;
    return {
      busy: function (t) { btn.disabled = true; btn.innerText = t; msg.innerText = ''; },
      fail: function (t) { msg.className = 'text-xs text-red-600'; msg.innerText = t; btn.disabled = false; btn.innerText = label; },
      ok: function (t) { msg.className = 'text-xs text-emerald-700'; msg.innerText = t; },
      done: function () { btn.disabled = false; btn.innerText = label; }
    };
  }
  /* 처음 시작 : 아이디·비밀번호·토큰 → data 브랜치 · 로그인 파일 · 첫 업로드까지 한 번에 */
  S.setup = async function () {
    var id = u.val('login-id'), pw = u.val('login-pw'), token = u.val('login-token').trim(), keep = u.$('login-keep').checked, ui = gateUi();
    var bad = checkIdPw(id, pw, u.val('login-pw2')); if (bad) return ui.fail(bad);
    if (!/^(github_pat_|ghp_)\w{20,}$/.test(token)) return ui.fail('GitHub 토큰(github_pat_…)을 붙여넣으세요. [토큰 만들기]를 누르면 만드는 화면이 열립니다.');
    ui.busy('준비하는 중...');
    try {
      guard();
      await ensureBranch(token);
      var conf = { r: HOME_REPO, p: DATA_PATH, b: DATA_BRANCH, t: token, m: 'rw' };
      if (await remote({ repo: conf.r, path: conf.p, branch: conf.b, token: token })) return ui.fail('이미 만들어 둔 가계부가 있습니다. [로그인] 탭에서 기존 아이디로 로그인하세요. (배우자 아이디는 로그인한 뒤 ☁ 버튼에서 추가합니다)');
      conf.w = b64(crypto.getRandomValues(new Uint8Array(32)));   /* 데이터 암호 : 사람이 외울 필요 없는 무작위 값 */
      await saveLogin(token, id, pw, conf);
      connect(id, conf, keep);
      ui.ok('아이디를 만들었습니다. 이 기기 데이터를 올리는 중...');
      var ok = await S.push(true);
      ui.done();
      if (ok) { gate(false); u.toast('준비가 끝났습니다. 다른 기기에서는 아이디·비밀번호만 넣으면 됩니다.'); }
      else ui.fail('아이디는 만들었지만 첫 업로드에 실패했습니다. ☁ 버튼에서 [지금 업로드]를 눌러 주세요.');
      App.ui.render();
    } catch (e) { ui.fail(friendly(e)); }
  };
  S.login = async function () {
    var id = u.val('login-id'), pw = u.val('login-pw'), keep = u.$('login-keep').checked, ui = gateUi();
    if (!normId(id) || !pw) return ui.fail('아이디와 비밀번호를 입력하세요.');
    ui.busy('확인 중...');
    try {
      guard();
      var L = await fetchLogins(); if (!L) return ui.fail('아직 만들어진 아이디가 없습니다. [처음 시작] 탭에서 먼저 만드세요.');
      var rec = L.users[await idKey(id)], conf = null;
      if (rec) { try { conf = await lunseal(rec, pw); } catch (e) { conf = null; } }
      if (!conf || !conf.r || !conf.t || !conf.w) return ui.fail('아이디 또는 비밀번호가 맞지 않습니다.');
      connect(id, conf, keep);
      ui.ok('로그인되었습니다. 데이터를 불러옵니다...');
      var ok = await S.pull(true);   /* 이 기기의 기존 데이터는 이전본(FC20_PREV)으로 보관 */
      ui.done();
      if (ok) gate(false);
      App.ui.render();
    } catch (e) { ui.fail(friendly(e)); }
  };
  S.logout = async function () {
    var info = getJ(LK) || {}, m = meta();
    var ch = await u.choose('<i class="fa-solid fa-right-from-bracket mr-1.5 text-slate-500"></i>로그아웃', u.esc(info.id || '') + ' 계정 연결을 이 기기에서 해제합니다. 저장소의 데이터는 그대로 남습니다.' + (m.dirty ? '\n\n<span class="text-amber-700">아직 업로드되지 않은 변경이 있습니다.</span>' : ''),
      (m.dirty ? [{ label: '업로드 후 로그아웃 (이 기기 데이터 지우기)', value: 'push-wipe' }] : []).concat([
        { label: '로그아웃 + 이 기기 데이터 지우기 (공용 기기)', value: 'wipe', cls: m.dirty ? 'border-red-300 text-red-600' : null },
        { label: '로그아웃만 (이 기기 데이터는 남김)', value: 'keep', cls: 'border-slate-300 text-slate-600 hover:bg-slate-50' },
        { label: '취소', value: 'cancel', cls: 'border-transparent text-slate-400' }]));
    if (ch === 'cancel' || !ch) return;
    if (ch === 'push-wipe') { var ok = await S.push(false); if (!ok) { u.toast('업로드하지 못했습니다. 동기화 상태를 확인하세요.', 'error'); return; } }
    [LS, MS, LK].forEach(function (k) { localStorage.removeItem(k); });
    try { sessionStorage.removeItem(SK); } catch (e) {}
    if (ch !== 'keep') { localStorage.removeItem(DBK); localStorage.removeItem('FC20_PREV'); }
    localStorage.setItem(SKIP, '');
    location.reload();
  };

  /* ---------- 메뉴 아래 계정 · 동기화 상태 (한 줄로 : 누가 로그인했고 저장이 어디까지 됐는지) ---------- */
  App.ui.footItems.push([10, function () {
    var info = getJ(LK), on = info && cfg().repo;
    var col = { ok: '#0B7A57', busy: '#3B82F6', warn: '#E8A10A', err: '#E5484D', off: '#C4CAD1', ro: '#7C5CDB' }[state] || '#C4CAD1';
    var label = { ok: '저장됨', busy: '저장 중', warn: '올리기 대기', err: '동기화 오류', off: '이 기기에만 저장', ro: '보기 전용' }[state] || '';
    if (!on) return '<button onclick="App.sync.showLogin()" class="foot-row"><span class="foot-ic"><i class="fa-regular fa-user"></i></span><span class="flex-1 min-w-0"><b>로그인</b><small>이 기기에만 저장 중</small></span></button>';
    return '<div class="foot-row"><span class="foot-ic"><i class="fa-regular fa-user"></i></span><button onclick="App.sync.open()" class="flex-1 min-w-0 text-left" title="동기화 설정 · 아이디 추가"><b>' + u.esc(info.id) + '</b>'
      + '<small><span id="sync-dot" class="inline-block w-1.5 h-1.5 rounded-full align-middle mr-1" style="background:' + col + '"></span>' + label + '</small></button>'
      + '<button onclick="App.sync.logout()" class="foot-out" title="로그아웃" aria-label="로그아웃"><i class="fa-solid fa-arrow-right-from-bracket"></i></button></div>';
  }]);

  /* ---------- 시작 ---------- */
  S.ready = function () { return !!ready(); };
  S.boot = function () {
    var c = cfg();
    state = c.repo ? (c.mode === 'ro' ? 'ro' : 'ok') : 'off';
    if (/^#fcs=/.test(location.hash)) { var h = location.hash.slice(5); try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {} setTimeout(function () { S.applyCode(h); }, 800); }
    if (ready()) setTimeout(function () { Promise.resolve(S.check()).then(function () { App.emit('sync-checked'); }, function () { App.emit('sync-checked'); }); }, 1200);
    else if (c.repo && !c.pass && !getJ(LK)) setTimeout(function () { u.toast('동기화를 쓰려면 ☁ 버튼에서 암호를 다시 입력하세요.', 'warning'); }, 2500);
    /* 아직 연결되지 않은 기기 : 아이디가 있으면 로그인, 없으면 처음 시작 화면 */
    if (!c.repo && localStorage.getItem(SKIP) !== '1') fetchLogins().then(function (L) { gate(true, L && Object.keys(L.users).length ? 'login' : 'setup'); });
    /* 로그인 유지를 끈 상태에서 탭을 새로 열면 다시 로그인 */
    var info = getJ(LK);
    if (info && c.repo && !c.pass) { var s0 = ''; try { s0 = sessionStorage.getItem(SK) || ''; } catch (e) {} if (!s0) setTimeout(function () { gate(true); u.$('login-id').value = info.id || ''; u.$('login-pw').focus(); }, 300); }
  };
  /* 백업 필요 여부 (동기화를 안 쓰고 30일 넘게 파일 백업도 없을 때) : 홈 [지금 할 일]에 보여 준다 */
  S.backupDue = function () {
    if (cfg().repo) return false;
    var last = 0; try { last = +localStorage.getItem('FC_LAST_BACKUP') || 0; } catch (e) {}
    return (App.db.transactions || []).length > 0 && Date.now() - last > 30 * 864e5;
  };
})(window.App);

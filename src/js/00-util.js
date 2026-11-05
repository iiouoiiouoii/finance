/* 공통 도구 : 포맷 · 날짜(월) 계산 · DOM · 토스트 · 확인창 · 모달
   모든 모듈은 window.App 아래에 자기 이름으로 붙는다 (App.u, App.store, App.calc ...). */
window.App = window.App || {};
(function (App) {
  'use strict';
  var u = App.u = {};

  /* ---------- 값 · 포맷 ---------- */
  u.$ = function (id) { return document.getElementById(id); };
  u.qa = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  u.esc = function (v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  };
  u.num = function (v) {
    if (typeof v === 'number') return isFinite(v) ? v : 0;
    var n = parseFloat(String(v == null ? '' : v).replace(/,/g, ''));
    return isFinite(n) ? n : 0;
  };
  /* 입력칸의 "1,234,000" → 1234000 (숫자 이외 문자는 버린다) */
  u.P = function (v) {
    if (typeof v === 'number') return v;
    if (!v) return 0;
    return parseInt(String(v).replace(/[^0-9]/g, ''), 10) || 0;
  };
  u.K = function (v) { return new Intl.NumberFormat('ko-KR').format(Math.round(Number(v) || 0)) + '원'; };
  /* 큰 금액 짧게 : 10.6억원 · 1,234만원 (좁은 칸에서 잘리지 않게) */
  u.KS = function (v) {
    var n = Math.round(Number(v) || 0), a = Math.abs(n), s = n < 0 ? '-' : '';
    if (a >= 1e8) return s + (Math.round(a / 1e7) / 10).toLocaleString('ko-KR') + '억원';
    if (a >= 1e5) return s + Math.round(a / 1e4).toLocaleString('ko-KR') + '만원';
    return s + a.toLocaleString('ko-KR') + '원';
  };
  u.n0 = function (v) { return (Math.round(Number(v) || 0)).toLocaleString('ko-KR'); };
  u.pct = function (x, d) { return ((Number(x) || 0) * 100).toFixed(d == null ? 1 : d) + '%'; };
  u.sum = function (list, f) { return (list || []).reduce(function (s, x) { return s + (Number(f ? f(x) : x) || 0); }, 0); };
  u.uid = function () { return Date.now() * 1000 + Math.floor(Math.random() * 1000); };
  u.byId = function (list, id) { id = Number(id); return (list || []).filter(function (x) { return x.id === id; })[0]; };

  /* ---------- 날짜 · 월 ---------- */
  u.pad = function (n) { return String(n).padStart(2, '0'); };
  u.mIdx = function (m) { var p = String(m || '').split('-'); return (parseInt(p[0], 10) || 1970) * 12 + ((parseInt(p[1], 10) || 1) - 1); };
  u.iMon = function (i) { return Math.floor(i / 12) + '-' + u.pad(i % 12 + 1); };
  u.addM = function (m, n) { return u.iMon(u.mIdx(m) + n); };
  u.today = function () { var d = new Date(); return d.getFullYear() + '-' + u.pad(d.getMonth() + 1) + '-' + u.pad(d.getDate()); };
  u.nowM = function () { return u.today().slice(0, 7); };
  u.dim = function (mo) { var p = String(mo).split('-'); return new Date(+p[0], +p[1], 0).getDate(); };
  u.monthLabel = function (mo) { var p = String(mo).split('-'); return p[0] + '년 ' + parseInt(p[1], 10) + '월'; };
  u.daysBetween = function (a, b) { return Math.round((new Date(b) - new Date(a)) / 86400000); };

  /* ---------- 오류 격리 ---------- */
  u.safe = function (tag, fn) {
    return function () { try { return fn.apply(this, arguments); } catch (e) { console.error('[' + tag + ']', e); } };
  };

  /* ---------- 입력칸 ---------- */
  /* data-money 입력칸은 입력하는 대로 천 단위 쉼표를 붙인다 */
  u.money = function (el) { var raw = u.P(el.value); el.value = raw ? raw.toLocaleString('ko-KR') : ''; };
  u.setMoney = function (id, v) { var el = u.$(id); if (el) el.value = v ? Math.round(v).toLocaleString('ko-KR') : ''; };
  u.val = function (id) { var el = u.$(id); return el ? el.value : ''; };
  document.addEventListener('input', function (e) { if (e.target && e.target.hasAttribute && e.target.hasAttribute('data-money')) u.money(e.target); }, true);

  /* 자주 쓰는 입력칸 HTML */
  u.IN = 'w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm';
  u.field = function (id, label, opt) {
    opt = opt || {};
    return '<div' + (opt.wrap ? ' ' + opt.wrap : '') + ' data-k="' + id + '"><label class="block font-semibold text-slate-600 mb-1.5 text-xs">' + label + '</label>'
      + '<input id="' + id + '" type="' + (opt.type || 'text') + '"' + (opt.money ? ' data-money inputmode="numeric"' : '')
      + (opt.on ? ' onchange="' + opt.on + '"' : '') + (opt.oninput ? ' oninput="' + opt.oninput + '"' : '')
      + (opt.ph ? ' placeholder="' + opt.ph + '"' : '') + (opt.attrs ? ' ' + opt.attrs : '')
      + ' class="' + u.IN + (opt.money ? ' text-right font-bold' : '') + (opt.cls ? ' ' + opt.cls : '') + '"></div>';
  };
  u.bar = function (p, cls) {
    return '<div class="h-1.5 bg-slate-100 rounded-full overflow-hidden mt-1"><div class="h-full ' + cls + '" style="width:' + Math.max(0, Math.min(100, p || 0)) + '%"></div></div>';
  };
  u.statCell = function (t, v, sub, cls) {
    return '<div class="py-2.5 border-t border-slate-100 min-w-0"><div class="text-[11px] font-semibold text-slate-500">' + t + '</div><div class="text-lg font-extrabold ' + (cls || 'text-slate-800') + '">' + v + '</div>'
      + (sub ? '<div class="text-[11px] text-slate-400 mt-0.5 leading-snug">' + sub + '</div>' : '') + '</div>';
  };

  /* ---------- 토스트 ---------- */
  /* 알림은 한 번에 3개까지, 같은 문구는 겹쳐 띄우지 않는다 */
  u.toast = function (msg, type) {
    var box = u.$('toast-container'); if (!box) { console.log(msg); return; }
    if (u.qa('.toast', box).some(function (x) { return x.dataset.msg === String(msg); })) return;
    var icon = type === 'error' ? '<i class="fa-solid fa-circle-exclamation" style="color:#FF8A8D"></i>' : type === 'warning' ? '<i class="fa-solid fa-circle-exclamation" style="color:#F5C04A"></i>' : '<i class="fa-solid fa-circle-check" style="color:#5FD3A6"></i>';
    var el = document.createElement('div');
    el.className = 'toast toast-animate pointer-events-auto'; el.dataset.msg = String(msg);
    el.innerHTML = icon + '<span>' + msg + '</span>';
    box.appendChild(el);
    while (box.children.length > 3) box.removeChild(box.firstChild);
    setTimeout(function () { el.style.transition = 'opacity .3s'; el.style.opacity = '0'; setTimeout(function () { el.remove(); }, 300); }, type ? 4500 : 2800);
  };

  /* ---------- 선택창 (버튼 여러 개) : Promise 로 고른 값을 돌려준다 ---------- */
  u.choose = function (title, msg, buttons) {
    return new Promise(function (res) {
      var d = document.createElement('div');
      d.className = 'choose-wrap fixed inset-0 z-[10000] bg-slate-900/50 flex items-center justify-center p-4';
      d.innerHTML = '<div class="bg-white rounded-2xl p-6 max-w-sm w-full space-y-4 shadow-2xl"><div class="text-base font-bold text-slate-900">' + title + '</div>'
        + '<div class="text-sm text-slate-600 leading-relaxed whitespace-pre-line">' + msg + '</div><div class="flex flex-col gap-2">'
        + buttons.map(function (b, i) {
          return '<button data-i="' + i + '" class="text-sm font-semibold py-3 rounded-xl border ' + (b.cls || (i ? 'border-transparent bg-slate-100 text-slate-700 hover:bg-slate-200' : 'bg-accent text-white border-accent hover:bg-accent-hover')) + '">' + b.label + '</button>';
        }).join('') + '</div></div>';
      d.onclick = function (e) { var b = e.target.closest('button'); if (!b) return; d.remove(); res(buttons[+b.dataset.i].value); };
      document.body.appendChild(d);
    });
  };
  /* 확인 / 취소 */
  u.confirm = function (title, msg, onOk, okLabel) {
    u.choose(title, msg, [{ label: okLabel || '확인', value: true }, { label: '취소', value: false }]).then(function (ok) { if (ok) onOk(); });
  };

  /* ---------- 모달 ----------
     모달은 각 모듈이 처음 열 때 한 번 만든다 (u.modal(id, html)).
     body 에 'fixed inset-0 ... hidden' 래퍼를 붙이고, 바깥 클릭 · Esc 로 닫힌다. */
  u.modal = function (id, inner, width) {
    var m = u.$(id);
    if (!m) {
      m = document.createElement('div');
      m.id = id;
      m.className = 'app-modal fixed inset-0 bg-slate-900/40 flex items-center justify-center hidden z-50 p-3';
      m.innerHTML = '<div class="modal-box bg-white rounded-2xl shadow-2xl w-[' + (width || 480) + 'px] max-w-full max-h-[92vh] overflow-y-auto p-6 space-y-4" role="dialog" aria-modal="true">' + inner + '</div>';
      m.addEventListener('mousedown', function (e) { if (e.target === m) u.close(id); });
      document.body.appendChild(m);
    }
    return m;
  };
  u.modalHead = function (titleId, title, closeId) {
    return '<div class="flex justify-between items-center"><h3 id="' + titleId + '" class="text-lg font-bold text-slate-900">' + title + '</h3>'
      + '<button type="button" onclick="App.u.close(\'' + closeId + '\')" class="w-9 h-9 -mr-2 text-slate-400 hover:text-slate-700" aria-label="닫기"><i class="fa-solid fa-xmark"></i></button></div>';
  };
  /* ---------- 목록 한 줄 · 누르면 나오는 메뉴 ----------
     화면마다 연필 · 휴지통 · 색 꼬리표가 붙던 것을 하나로 : 줄을 누르면 할 수 있는 일이 아래에서 올라온다.
     o = { tap, title, meta, val, valCls, valSub, bar(0~100), barColor, note, noteCls, act(줄 안 버튼 html) } */
  u.item = function (o) {
    return '<div class="it' + (o.icon ? ' has-ic' : '') + '" role="button" tabindex="0" onclick="' + o.tap + '" onkeydown="if(event.key===\'Enter\')this.click()">'
      + (o.icon ? u.ic(o.icon, o.iconCls) : '') + '<div class="it-t"><b>' + o.title + '</b>' + (o.meta ? '<small>' + o.meta + '</small>' : '') + '</div>'
      + '<div class="it-v">' + (o.val != null ? '<b class="' + (o.valCls || '') + '">' + o.val + '</b>' : '') + (o.valSub ? '<small>' + o.valSub + '</small>' : '') + '</div>'
      + (o.bar != null ? '<div class="it-bar"><i style="width:' + Math.max(0, Math.min(100, o.bar)) + '%;background:' + (o.barColor || '#0B7A57') + '"></i></div>' : '')
      + (o.note ? '<div class="it-note ' + (o.noteCls || '') + '">' + o.note + '</div>' : '')
      + (o.act ? '<div class="it-act" onclick="event.stopPropagation()">' + o.act + '</div>' : '') + '</div>';
  };
  u.dots = function (arr) { return arr.filter(function (x) { return x; }).join(' · '); };
  /* acts = [[글자, 실행할 코드, 위험(빨강)], ...] — 빈 값은 건너뛴다 */
  u.sheet = function (title, acts, sub) {
    var m = u.$('sheet-modal'); if (m) m.remove();
    u.modal('sheet-modal', '<div class="flex justify-between items-start gap-2"><div class="min-w-0"><h3 class="text-lg font-bold text-slate-900 truncate">' + title + '</h3>' + (sub ? '<p class="text-[13px] text-slate-500 mt-0.5">' + sub + '</p>' : '') + '</div>'
      + '<button type="button" onclick="App.u.close(\'sheet-modal\')" class="w-9 h-9 -mr-2 -mt-1 text-slate-400 hover:text-slate-700 shrink-0" aria-label="닫기"><i class="fa-solid fa-xmark"></i></button></div>'
      + '<div class="sheet-list">' + acts.filter(Boolean).map(function (a) {
        return '<button type="button" onclick="App.u.close(\'sheet-modal\');' + a[1] + '" class="sheet-btn' + (a[2] ? ' bad' : '') + '">' + a[0] + '</button>';
      }).join('') + '</div>', 420);
    u.open('sheet-modal');
  };
  u.open = function (id) { var m = u.$(id); if (m) m.classList.remove('hidden'); };
  u.close = function (id) { var m = u.$(id); if (m) m.classList.add('hidden'); };
  u.isOpen = function (id) { var m = u.$(id); return !!m && !m.classList.contains('hidden'); };
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') u.qa('.app-modal').forEach(function (m) { m.classList.add('hidden'); });
  });

  /* ---------- 파일 내려받기 ---------- */
  u.download = function (name, text, type) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: type || 'application/octet-stream' }));
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  };
})(window.App);

/* ---------- 아이콘 : 이름(분류 · 소분류 · 가게 · 항목)에서 알맞은 아이콘을 고른다. 색 없이 회색 동그라미 하나 ---------- */
(function (App) {
  'use strict';
  var u = App.u;
  var MAP = [
    [/카페|커피|간식|베이커리|스타벅스/, 'fa-mug-hot'], [/외식|배달|식당/, 'fa-utensils'], [/장보기|식자재|마트/, 'fa-basket-shopping'], [/식비|음식/, 'fa-utensils'],
    [/주유|충전|차량|정비|통행|자동차/, 'fa-car'], [/택시|대리/, 'fa-taxi'], [/대중교통|교통|버스|지하철/, 'fa-bus'],
    [/월세|주거|관리비|공과금|전기|수도|가스/, 'fa-house'], [/통신|인터넷|휴대폰/, 'fa-wifi'],
    [/의류|잡화|뷰티|미용/, 'fa-shirt'], [/쇼핑|생활/, 'fa-bag-shopping'],
    [/여행|숙박|항공/, 'fa-plane'], [/영화|공연/, 'fa-film'], [/OTT|구독/, 'fa-tv'], [/운동|레저|골프|헬스/, 'fa-person-running'], [/취미|여가|문화/, 'fa-masks-theater'],
    [/병원|의료|건강|약국/, 'fa-heart-pulse'], [/경조사|선물|축의|조의|용돈/, 'fa-gift'],
    [/교육|학원|도서|자기계발/, 'fa-book'], [/육아|아이|자녀/, 'fa-baby'], [/반려|동물/, 'fa-paw'],
    [/보험/, 'fa-shield-halved'], [/세금|국세|지방세/, 'fa-landmark'], [/대출|이자|상환/, 'fa-hand-holding-dollar'], [/금융|수수료/, 'fa-building-columns'],
    [/할부/, 'fa-calendar-days'], [/월급|급여|상여|보너스/, 'fa-briefcase'], [/수입|환급|이자수입|배당/, 'fa-arrow-down'],
    [/목표|적금|저축|파킹|예금/, 'fa-piggy-bank'], [/투자|주식|ETF|펀드|코인/, 'fa-chart-line'], [/연금|IRP|ISA/, 'fa-umbrella'], [/전세|보증금|집|아파트|부동산/, 'fa-house'],
    [/카드/, 'fa-credit-card'], [/이체|자산이동|계좌/, 'fa-arrow-right-arrow-left']
  ];
  u.iconFor = function () {
    var s = Array.prototype.join.call(arguments, ' ');
    for (var i = 0; i < MAP.length; i++) if (MAP[i][0].test(s)) return MAP[i][1];
    return 'fa-receipt';
  };
  /* 회색 동그라미 아이콘 html. cls: 'in'(들어온 돈 · 초록) / 'bad'(빨강) */
  /* 아이콘마다 파스텔 색 하나 (같은 종류는 늘 같은 색) */
  var TINT = { 'fa-utensils': 'peach', 'fa-mug-hot': 'peach', 'fa-basket-shopping': 'peach', 'fa-car': 'sky', 'fa-taxi': 'sky', 'fa-bus': 'sky', 'fa-plane': 'sky',
    'fa-house': 'butter', 'fa-wifi': 'butter', 'fa-key': 'butter', 'fa-bag-shopping': 'pink', 'fa-shirt': 'pink', 'fa-gift': 'pink',
    'fa-film': 'lilac', 'fa-tv': 'lilac', 'fa-masks-theater': 'lilac', 'fa-person-running': 'mint', 'fa-heart-pulse': 'mint', 'fa-book': 'lilac', 'fa-graduation-cap': 'lilac',
    'fa-piggy-bank': 'mint', 'fa-chart-line': 'sky', 'fa-umbrella': 'lilac', 'fa-briefcase': 'mint', 'fa-arrow-down': 'mint', 'fa-credit-card': 'sky', 'fa-calendar-days': 'butter',
    'fa-hand-holding-dollar': 'peach', 'fa-building-columns': 'sky', 'fa-shield-halved': 'mint', 'fa-landmark': 'butter', 'fa-baby': 'pink', 'fa-paw': 'butter', 'fa-flag': 'pink',
    'fa-rotate': 'mint', 'fa-triangle-exclamation': 'peach', 'fa-cart-shopping': 'pink', 'fa-cloud-arrow-up': 'sky', 'fa-pen': 'peach', 'fa-paste': 'sky', 'fa-coins': 'butter', 'fa-gem': 'lilac',
    'fa-scale-balanced': 'sky', 'fa-receipt': 'butter', 'fa-umbrella-beach': 'mint', 'fa-arrow-right-arrow-left': 'gray' };
  u.ic = function (icon, cls) { var t = TINT[icon] || 'gray'; return '<span class="ic t-' + t + (cls ? ' ' + cls : '') + '"><i class="fa-solid ' + icon + '"></i></span>'; };
})(window.App);

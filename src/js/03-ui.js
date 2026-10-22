/* 화면 뼈대 : 화면(탭) 등록 · 전환 · 다시 그리기 예약 · 헤더 도구 · 모바일 하단 바 · 화면 모드
   - 각 기능 모듈은 App.views.add({...}) 로 자기 화면을 등록한다.
   - 데이터가 바뀌면(App.store.save) 지금 보고 있는 화면만 다시 그린다. 다른 화면은 열 때 그린다. */
(function (App) {
  'use strict';
  var u = App.u, ui = App.ui = {}, list = [], byId = {};

  App.views = {
    add: function (v) { list.push(v); byId[v.id] = v; list.sort(function (a, b) { return (a.order || 0) - (b.order || 0); }); },
    get: function (id) { return byId[id]; },
    all: function () { return list; }
  };

  /* ---------- 화면 전환 ---------- */
  ui.go = function (id) {
    if (!byId[id]) id = 'dashboard';
    App.state.view = id;
    document.body.classList.remove('nav-open');
    var c = u.$('content'); if (c) c.scrollTop = 0;
    ui.render();
  };
  window.switchTab = ui.go;   /* 예전 버전 북마크·코드 호환 */

  function section(id) {
    var el = u.$('view-' + id);
    if (!el) {
      el = document.createElement('section');
      el.id = 'view-' + id; el.className = 'space-y-6 hidden';
      u.$('content').appendChild(el);
    }
    return el;
  }

  /* ---------- 다시 그리기 ---------- */
  var pending = false;
  ui.invalidate = function () {
    if (pending) return; pending = true;
    (window.requestAnimationFrame || setTimeout)(function () { pending = false; ui.render(); });
  };
  ui.render = function () {
    var v = byId[App.state.view] || byId.dashboard;
    App.emit('render', v.id);
    list.forEach(function (x) {
      var el = u.$('view-' + x.id); if (el && x !== v) el.classList.add('hidden');
    });
    var el = section(v.id);
    el.classList.remove('hidden');
    u.$('page-title').innerText = v.title;
    renderNav(v.id);
    renderHeader();
    try { v.render(el); } catch (e) { console.error('[화면 ' + v.id + ']', e); el.innerHTML = '<div class="p-6 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">이 화면을 그리는 중 오류가 났습니다: ' + u.esc(e.message) + '</div>'; }
    App.emit('rendered', v.id);
  };
  App.on('saved', function () { ui.invalidate(); });

  /* ---------- 사이드바 · 모바일 하단 바 ---------- */
  var NAV_ON = 'w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg transition font-medium text-left bg-slate-800 text-white';
  var NAV_OFF = 'w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white transition font-medium text-left';
  ui.NAV_OFF = NAV_OFF;
  function renderNav(cur) {
    var nav = u.$('side-nav'); if (!nav) return;
    nav.innerHTML = list.filter(function (v) { return v.nav; }).map(function (v) {
      return '<button onclick="App.ui.go(\'' + v.id + '\')" class="' + (v.id === cur ? NAV_ON : NAV_OFF) + '"><i class="fa-solid ' + v.nav.icon + ' w-5 text-center ' + (v.nav.color || '') + '"></i> ' + v.nav.label + '</button>';
    }).join('');
    u.qa('#mobile-bar [data-t]').forEach(function (b) { var on = b.dataset.t === cur; b.classList.toggle('text-accent', on); b.classList.toggle('text-slate-400', !on); });
  }
  function renderMobileBar() {
    var bar = u.$('mobile-bar'); if (!bar) return;
    var tabs = [['dashboard', '홈', 'fa-house'], ['transactions', '내역', 'fa-list-ul'], ['+'], ['assets', '자산', 'fa-wallet'], ['menu', '더보기', 'fa-bars']];
    bar.innerHTML = tabs.map(function (t) {
      if (t[0] === '+') return '<button onclick="App.txn.openNew()" aria-label="거래 등록" class="mx-auto -mt-5 mb-1 w-14 h-14 rounded-full bg-accent text-white text-xl shadow-lg flex items-center justify-center"><i class="fa-solid fa-plus"></i></button>';
      return '<button data-t="' + t[0] + '" onclick="' + (t[0] === 'menu' ? 'App.ui.toggleNav()' : "App.ui.go('" + t[0] + "')") + '" class="py-2 flex flex-col items-center gap-0.5 text-slate-400"><i class="fa-solid ' + t[2] + ' text-lg"></i><span class="text-[10px] font-semibold">' + t[1] + '</span></button>';
    }).join('') + '<button onclick="App.weekly.open()" aria-label="주간 점검" class="absolute -top-3 h-7 px-2.5 rounded-full bg-white border border-slate-300 shadow text-[10px] font-bold text-slate-700 flex items-center gap-1" style="left:calc(50% + 32px)">'
      + '<i class="fa-solid fa-calendar-check text-accent"></i>주간<span id="weekly-mdot" class="w-2 h-2 rounded-full bg-red-500" style="display:none"></span></button>';
  }
  ui.toggleNav = function () { document.body.classList.toggle('nav-open'); };

  /* ---------- 헤더 : 로그인 · 화면 모드 · 동기화 · 예산 알림 · 월 이동 · 빠른 입력 ---------- */
  ui.headerItems = [];   /* 다른 모듈이 [order, html함수] 를 넣는다 */
  function renderHeader() {
    var box = u.$('header-tools'); if (!box) return;
    var mo = App.state.month;
    var items = ui.headerItems.slice().sort(function (a, b) { return a[0] - b[0]; }).map(function (x) { return x[1](); }).join('');
    box.innerHTML = items
      + '<span id="current-month-display" class="text-xs bg-slate-100 text-slate-600 px-2.5 py-1.5 rounded-lg border border-slate-200 font-semibold">' + u.monthLabel(mo) + '</span>'
      + '<button onclick="App.ui.shiftMonth(-1)" title="이전 달" class="px-2 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-600"><i class="fa-solid fa-chevron-left"></i></button>'
      + '<input type="month" id="global-month-picker" value="' + mo + '" onchange="App.ui.setMonth(this.value)" class="bg-slate-50 border border-slate-300 text-slate-700 text-xs rounded-lg px-3 py-2">'
      + '<button onclick="App.ui.shiftMonth(1)" title="다음 달" class="px-2 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-600"><i class="fa-solid fa-chevron-right"></i></button>'
      + '<button onclick="App.paste.open()" class="hdr-paste bg-slate-800 hover:bg-slate-900 text-white px-3.5 py-2 rounded-lg font-medium text-xs flex items-center gap-2"><i class="fa-solid fa-paste text-amber-400"></i><span>스마트 붙여넣기</span></button>'
      + '<button onclick="App.txn.openNew()" class="hdr-new bg-accent hover:bg-accent-hover text-white px-4 py-2 rounded-lg font-medium text-xs flex items-center gap-2"><i class="fa-solid fa-plus"></i> 내역 등록</button>';
  }
  ui.setMonth = function (v) { if (!/^\d{4}-\d{2}$/.test(v || '')) return; App.state.month = v; ui.render(); };
  ui.shiftMonth = function (d) { ui.setMonth(u.addM(App.state.month, d)); };

  /* ---------- 화면 모드 : 자동 / PC / 모바일 ---------- */
  var MODE_KEY = 'FC23_VIEW', mq = window.matchMedia ? window.matchMedia('(max-width:1023px)') : { matches: window.innerWidth < 1024 };
  function mode() { var m = null; try { m = localStorage.getItem(MODE_KEY); } catch (e) {} return m === 'pc' || m === 'm' ? m : 'auto'; }
  function applyMode() {
    var m = mode(), mobile = m === 'm' || (m === 'auto' && mq.matches);
    document.body.classList.toggle('fc-m', mobile); document.body.classList.remove('nav-open');
    var vp = document.querySelector('meta[name=viewport]');
    if (vp) vp.setAttribute('content', m === 'pc' && screen.width < 1024 ? 'width=1280' : 'width=device-width, initial-scale=1.0, viewport-fit=cover');
    window.dispatchEvent(new Event('resize'));
  }
  ui.setMode = function (m) {
    try { localStorage.setItem(MODE_KEY, m); } catch (e) {}
    applyMode(); ui.render();
    u.toast({ auto: '화면 모드: 자동 (기기에 맞춤)', pc: 'PC 화면으로 표시합니다.', m: '모바일 화면으로 표시합니다.' }[m]);
  };
  ui.headerItems.push([20, function () {
    var m = mode();
    return '<div class="flex rounded-lg border border-slate-300 overflow-hidden bg-white shrink-0">'
      + [['auto', 'fa-wand-magic-sparkles', '자동'], ['pc', 'fa-desktop', 'PC 화면'], ['m', 'fa-mobile-screen', '모바일 화면']].map(function (t) {
        return '<button onclick="App.ui.setMode(\'' + t[0] + '\')" title="' + t[2] + '" aria-label="' + t[2] + '" class="px-2.5 py-1.5 text-xs ' + (t[0] === m ? 'bg-accent text-white' : 'text-slate-500') + '"><i class="fa-solid ' + t[1] + '"></i></button>';
      }).join('') + '</div>';
  }]);

  ui.init = function () {
    applyMode();
    if (mq.addEventListener) mq.addEventListener('change', function () { if (mode() === 'auto') applyMode(); });
    else if (mq.addListener) mq.addListener(function () { if (mode() === 'auto') applyMode(); });
    renderMobileBar();
    var ov = u.$('nav-overlay'); if (ov) ov.onclick = function () { document.body.classList.remove('nav-open'); };
  };
})(window.App);

/* 화면 뼈대 : 화면(탭) 등록 · 전환 · 다시 그리기 예약 · 메뉴 · 헤더(월 이동 · 기록하기) · 모바일 하단 바 · 화면 모드
   - 각 기능 모듈은 App.views.add({...}) 로 자기 화면을 등록한다.
   - 메뉴 묶음과 짧은 이름은 여기 NAV 한 곳에서 정한다 (화면마다 이름이 달라 헷갈리지 않게).
   - 데이터가 바뀌면(App.store.save) 지금 보고 있는 화면만 다시 그린다. 다른 화면은 열 때 그린다. */
(function (App) {
  'use strict';
  var u = App.u, ui = App.ui = {}, list = [], byId = {};

  App.views = {
    add: function (v) { list.push(v); byId[v.id] = v; list.sort(function (a, b) { return (a.order || 0) - (b.order || 0); }); },
    get: function (id) { return byId[id]; },
    all: function () { return list; }
  };

  /* 메뉴 : [묶음, 이름, 아이콘, 월 이동 표시 여부] — 자주 쓰는 것 위, 가끔 쓰는 계산기는 아래 */
  var NAV = {
    dashboard: ['', '홈', 'fa-house', 1], transactions: ['', '내역', 'fa-list-ul', 1], budget: ['', '예산', 'fa-chart-simple', 1], report: ['', '월말 리포트', 'fa-file-lines', 1],
    fixed: ['매달 나가는 돈', '고정비 · 할부', 'fa-rotate', 1], cards: ['매달 나가는 돈', '카드', 'fa-credit-card', 1],
    assets: ['모으는 돈', '자산 · 대출', 'fa-building-columns', 0], goals: ['모으는 돈', '목표 · 저축', 'fa-flag', 1], loan: ['모으는 돈', '대출 갚기 계산', 'fa-scale-balanced', 0],
    tax: ['계산기', '연말정산', 'fa-calculator', 0], retire: ['계산기', '은퇴 준비', 'fa-umbrella-beach', 0],
    settings: ['설정', '설정', 'fa-gear', 0]
  };
  ui.label = function (id) { return NAV[id] ? NAV[id][1] : (byId[id] ? byId[id].title : ''); };

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
      el.id = 'view-' + id; el.className = 'view space-y-5 hidden';
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
    u.$('page-title').innerText = ui.label(v.id);
    document.title = ui.label(v.id) + ' · 우리집 가계부';
    renderNav(v.id);
    renderHeader(v.id);
    ui.renderFoot();
    try { v.render(el); } catch (e) { console.error('[화면 ' + v.id + ']', e); el.innerHTML = '<div class="p-6 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">이 화면을 그리는 중 오류가 났습니다: ' + u.esc(e.message) + '</div>'; }
    App.emit('rendered', v.id);
  };
  App.on('saved', function () { ui.invalidate(); });

  /* ---------- 메뉴 · 모바일 하단 바 ---------- */
  function renderNav(cur) {
    var nav = u.$('side-nav'); if (!nav) return;
    var html = '', group = null;
    list.filter(function (v) { return v.nav && NAV[v.id]; }).sort(function (a, b) { return Object.keys(NAV).indexOf(a.id) - Object.keys(NAV).indexOf(b.id); }).forEach(function (v) {
      var n = NAV[v.id];
      if (n[0] !== group) { group = n[0]; if (group && group !== '설정') html += '<div class="nav-group">' + group + '</div>'; else if (group === '설정') html += '<div class="nav-sep"></div>'; }
      html += '<button onclick="App.ui.go(\'' + v.id + '\')" class="nav-item' + (v.id === cur ? ' on' : '') + '"' + (v.id === cur ? ' aria-current="page"' : '') + '><i class="fa-solid ' + n[2] + '"></i><span>' + n[1] + '</span></button>';
    });
    nav.innerHTML = html;
    u.qa('#mobile-bar [data-t]').forEach(function (b) { b.classList.toggle('on', b.dataset.t === cur); });
  }
  function renderMobileBar() {
    var bar = u.$('mobile-bar'); if (!bar) return;
    var tabs = [['dashboard', '홈', 'fa-house'], ['transactions', '내역', 'fa-list-ul'], ['+'], ['budget', '예산', 'fa-chart-simple'], ['menu', '전체', 'fa-bars']];
    bar.innerHTML = tabs.map(function (t) {
      if (t[0] === '+') return '<button onclick="App.ui.addMenu()" aria-label="기록하기" class="mb-add"><i class="fa-solid fa-plus"></i></button>';
      return '<button data-t="' + t[0] + '" onclick="' + (t[0] === 'menu' ? 'App.ui.toggleNav()' : "App.ui.go('" + t[0] + "')") + '" class="mb-tab"><i class="fa-solid ' + t[2] + '"></i><span>' + t[1] + '</span></button>';
    }).join('');
  }
  ui.toggleNav = function () { document.body.classList.toggle('nav-open'); };

  /* 메뉴 아래 : 계정·동기화 상태 (다른 모듈이 [order, html함수] 를 넣는다) */
  ui.footItems = [];
  ui.renderFoot = function () {
    var box = u.$('side-foot'); if (!box) return;
    box.innerHTML = ui.footItems.slice().sort(function (a, b) { return a[0] - b[0]; }).map(function (x) { return x[1](); }).join('');
  };

  /* ---------- 헤더 : 월 이동 · 알림 · 기록하기 ---------- */
  ui.headerItems = [];   /* 다른 모듈이 [order, html함수] 를 넣는다 */
  function renderHeader(cur) {
    var box = u.$('header-tools'); if (!box) return;
    var mo = App.state.month, monthly = NAV[cur] ? NAV[cur][3] : 1, now = u.nowM();
    var items = ui.headerItems.slice().sort(function (a, b) { return a[0] - b[0]; }).map(function (x) { return x[1](); }).join('');
    box.innerHTML = (monthly ? '<div class="mon-sw"><button onclick="App.ui.shiftMonth(-1)" aria-label="이전 달"><i class="fa-solid fa-chevron-left"></i></button>'
      + '<label class="mon-lb" onclick="App.ui.pickMonth(event)">' + u.monthLabel(mo) + '<input type="month" id="global-month-picker" value="' + mo + '" onchange="App.ui.setMonth(this.value)" tabindex="-1" aria-hidden="true"></label>'
      + '<button onclick="App.ui.shiftMonth(1)" aria-label="다음 달"><i class="fa-solid fa-chevron-right"></i></button></div>'
      + (mo !== now ? '<button onclick="App.ui.setMonth(\'' + now + '\')" class="hdr-chip">이번 달</button>' : '') : '')
      + items
      + '<button onclick="App.ui.addMenu()" class="hdr-add"><i class="fa-solid fa-plus"></i><span>기록하기</span></button>';
  }
  ui.pickMonth = function (e) { var i = u.$('global-month-picker'); if (!i) return; e.preventDefault(); try { i.showPicker(); } catch (x) { i.focus(); i.click(); } };
  ui.setMonth = function (v) { if (!/^\d{4}-\d{2}$/.test(v || '')) return; App.state.month = v; ui.render(); };
  ui.shiftMonth = function (d) { ui.setMonth(u.addM(App.state.month, d)); };

  /* ---------- 기록하기 : 무엇을 할지 고르는 한 곳 (붙여넣기 · 파일 · 한 건 · 주간 점검) ---------- */
  ui.addMenu = function () {
    var row = function (fn, icon, t, d, tag) {
      return '<button onclick="App.u.close(\'add-modal\');' + fn + '" class="add-opt"><span class="add-ic"><i class="fa-solid ' + icon + '"></i></span><span class="flex-1 min-w-0"><b>' + t + (tag ? ' <em>' + tag + '</em>' : '') + '</b><small>' + d + '</small></span><i class="fa-solid fa-chevron-right text-slate-300"></i></button>';
    };
    u.modal('add-modal', '<div class="flex items-center justify-between"><h3 class="text-lg font-bold text-slate-900">무엇을 기록할까요?</h3><button onclick="App.u.close(\'add-modal\')" class="w-9 h-9 -mr-2 text-slate-400 hover:text-slate-700" aria-label="닫기"><i class="fa-solid fa-xmark"></i></button></div>'
      + '<div class="space-y-1.5">'
      + row('App.paste.open()', 'fa-paste', '카드 · 은행 내역 한꺼번에', '앱에서 이용내역을 복사해 붙여넣거나 엑셀 파일을 올립니다. 여러 건을 한 번에 넣고, 이미 넣은 건 걸러집니다.', '추천')
      + row('App.txn.openNew()', 'fa-pen', '한 건 직접 입력', '현금이나 계좌이체처럼 내역에 없는 한 건만 넣습니다.')
      + row('App.weekly.open()', 'fa-gauge-high', '주간 점검', '카드 앱의 이번 달 이용금액만 옮겨 적어 예산 속도를 확인합니다.')
      + '</div>', 460);
    u.open('add-modal');
  };

  /* ---------- 화면 모드 : 자동 / PC / 모바일 (설정 화면에서 바꾼다) ---------- */
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
    u.toast({ auto: '화면 크기: 기기에 맞춤', pc: 'PC 화면으로 표시합니다.', m: '휴대폰 화면으로 표시합니다.' }[m]);
  };
  ui.modeHtml = function () {
    var m = mode();
    return '<div class="seg">' + [['auto', '기기에 맞춤'], ['pc', 'PC 화면'], ['m', '휴대폰 화면']].map(function (t) {
      return '<button onclick="App.ui.setMode(\'' + t[0] + '\')" class="' + (t[0] === m ? 'on' : '') + '">' + t[1] + '</button>';
    }).join('') + '</div>';
  };

  ui.init = function () {
    applyMode();
    if (mq.addEventListener) mq.addEventListener('change', function () { if (mode() === 'auto') applyMode(); });
    else if (mq.addListener) mq.addListener(function () { if (mode() === 'auto') applyMode(); });
    renderMobileBar();
    var ov = u.$('nav-overlay'); if (ov) ov.onclick = function () { document.body.classList.remove('nav-open'); };
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') document.body.classList.remove('nav-open'); });
  };
})(window.App);

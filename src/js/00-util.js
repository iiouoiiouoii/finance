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
  u.IN = 'w-full border border-slate-300 rounded-lg px-2.5 py-2 text-xs';
  u.field = function (id, label, opt) {
    opt = opt || {};
    return '<div' + (opt.wrap ? ' ' + opt.wrap : '') + ' data-k="' + id + '"><label class="block font-semibold text-slate-600 mb-1 text-xs">' + label + '</label>'
      + '<input id="' + id + '" type="' + (opt.type || 'text') + '"' + (opt.money ? ' data-money inputmode="numeric"' : '')
      + (opt.on ? ' onchange="' + opt.on + '"' : '') + (opt.oninput ? ' oninput="' + opt.oninput + '"' : '')
      + (opt.ph ? ' placeholder="' + opt.ph + '"' : '') + (opt.attrs ? ' ' + opt.attrs : '')
      + ' class="' + u.IN + (opt.money ? ' text-right font-bold' : '') + (opt.cls ? ' ' + opt.cls : '') + '"></div>';
  };
  u.bar = function (p, cls) {
    return '<div class="h-1.5 bg-slate-100 rounded-full overflow-hidden mt-1"><div class="h-full ' + cls + '" style="width:' + Math.max(0, Math.min(100, p || 0)) + '%"></div></div>';
  };
  u.statCell = function (t, v, sub, cls) {
    return '<div class="p-3 rounded-lg bg-slate-50 border border-slate-200 min-w-0"><div class="text-[11px] font-semibold text-slate-500">' + t + '</div><div class="text-lg font-extrabold ' + (cls || 'text-slate-800') + '">' + v + '</div>'
      + (sub ? '<div class="text-[11px] text-slate-400 mt-0.5 leading-snug">' + sub + '</div>' : '') + '</div>';
  };

  /* ---------- 토스트 ---------- */
  u.toast = function (msg, type) {
    var box = u.$('toast-container'); if (!box) { console.log(msg); return; }
    var bg = 'bg-slate-900 border-slate-700 text-white', icon = '<i class="fa-solid fa-circle-check text-emerald-400"></i>';
    if (type === 'warning') { bg = 'bg-amber-900 border-amber-700 text-amber-100'; icon = '<i class="fa-solid fa-triangle-exclamation text-amber-400"></i>'; }
    if (type === 'error') { bg = 'bg-red-900 border-red-700 text-red-100'; icon = '<i class="fa-solid fa-circle-xmark text-red-400"></i>'; }
    var el = document.createElement('div');
    el.className = 'toast-animate flex items-center gap-3 px-4 py-3 rounded-xl border shadow-xl text-xs font-semibold pointer-events-auto max-w-sm ' + bg;
    el.innerHTML = icon + ' <span>' + msg + '</span>';
    box.appendChild(el);
    setTimeout(function () { el.style.transition = 'opacity .3s'; el.style.opacity = '0'; setTimeout(function () { el.remove(); }, 300); }, 3200);
  };

  /* ---------- 선택창 (버튼 여러 개) : Promise 로 고른 값을 돌려준다 ---------- */
  u.choose = function (title, msg, buttons) {
    return new Promise(function (res) {
      var d = document.createElement('div');
      d.className = 'fixed inset-0 z-[10000] bg-slate-900/60 flex items-center justify-center p-4';
      d.innerHTML = '<div class="bg-white rounded-xl p-5 max-w-sm w-full space-y-3 shadow-2xl"><div class="text-sm font-bold text-slate-800">' + title + '</div>'
        + '<div class="text-xs text-slate-600 leading-relaxed whitespace-pre-line">' + msg + '</div><div class="flex flex-col gap-2">'
        + buttons.map(function (b, i) {
          return '<button data-i="' + i + '" class="text-xs font-semibold py-2 rounded-lg border ' + (b.cls || (i ? 'border-slate-300 text-slate-600 hover:bg-slate-50' : 'bg-accent text-white border-accent')) + '">' + b.label + '</button>';
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
      m.className = 'app-modal fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center hidden z-50 p-3';
      m.innerHTML = '<div class="bg-white rounded-xl shadow-xl w-[' + (width || 480) + 'px] max-w-full max-h-[92vh] overflow-y-auto p-6 border border-slate-200 space-y-4">' + inner + '</div>';
      m.addEventListener('mousedown', function (e) { if (e.target === m) u.close(id); });
      document.body.appendChild(m);
    }
    return m;
  };
  u.modalHead = function (titleId, title, closeId) {
    return '<div class="flex justify-between items-center pb-3 border-b border-slate-100"><h3 id="' + titleId + '" class="font-bold text-slate-800">' + title + '</h3>'
      + '<button type="button" onclick="App.u.close(\'' + closeId + '\')" class="text-slate-400 hover:text-slate-600"><i class="fa-solid fa-xmark"></i></button></div>';
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

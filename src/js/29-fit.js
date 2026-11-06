/* =====================================================================
   글씨 잘림 막기 — 칸보다 긴 글씨를 찾아서
   · 숫자(금액 · %)는 글씨 크기를 줄여 한 줄에 맞춘다 (최소 11px)
   · 글자는 줄바꿈을 허용한다
   화면이 다시 그려지거나 창 크기가 바뀔 때마다 돈다.
   ===================================================================== */
(function () {
  var NUM = /^[\s+\-−]*[\d,.]+\s*(원|만원|억원|만|억|%|개월|회|건|일|년)?[\s\/\d,.원만억%회개월]*$/;
  var ROOTS = '#content, .modal-box, #app-header, #mobile-bar';
  var busy = false, queued = false, late = 0;

  function clipping(el, cs) {
    var ox = cs.overflowX;
    return (ox === 'hidden' || ox === 'clip') && el.scrollWidth > el.clientWidth + 1;
  }
  function fit(el) {
    el.style.fontSize = '';
    var cs = getComputedStyle(el);
    if (!clipping(el, cs)) return;
    var txt = (el.textContent || '').trim();
    var shrink = el.classList.contains('pt-t') || el.classList.contains('fit-shrink');
    if (txt && (shrink || (txt.length <= 32 && NUM.test(txt)))) {
      var size = parseFloat(cs.fontSize), min = Math.min(size, shrink ? 16 : 11);
      var s = Math.max(min, Math.floor(size * el.clientWidth / el.scrollWidth * 10) / 10);
      el.style.setProperty('font-size', s + 'px', 'important');
      while (s > min && el.scrollWidth > el.clientWidth + 1) { s -= .5; el.style.setProperty('font-size', s + 'px', 'important'); }
    } else if (el.childElementCount <= 4 && txt.length <= 120) {
      el.style.setProperty('white-space', 'normal', 'important');
      el.style.setProperty('text-overflow', 'clip', 'important');
      el.style.setProperty('overflow-wrap', 'anywhere');
      el.style.setProperty('word-break', 'keep-all');
    }
  }
  /* 숫자가 두 줄로 꺾였는지 (1,627,302,661원 → 1,627,302,66 / 1원 같은 경우) */
  function multiNum(el) {
    var t = (el.textContent || '').trim(); if (!t || t.length > 24 || t.indexOf(' / ') >= 0 || !NUM.test(t) || !/\d/.test(t)) return false;
    var r = document.createRange(); r.selectNodeContents(el); var tops = {};
    [].forEach.call(r.getClientRects(), function (x) { if (x.width > 1) tops[Math.round(x.top)] = 1; });
    return Object.keys(tops).length > 1;
  }
  /* 설명 줄(10월 13일 · 취미/여가/문화 · 카드)은 ' · ' 자리에서만 줄을 바꾼다 */
  var DOTS = '.it-t small, .txn-row .t small, .row .t small, .todo small, .it-note, .rp-cat .m, .rp-goal small, .add-opt small';
  function splitDots(el) {
    if (el.dataset.dots || el.childElementCount) return;
    el.dataset.dots = '1';
    var t = el.textContent; if (t.indexOf(' · ') < 0 || /[요다]\.?\s*$/.test(t)) return;
    var parts = t.split(' · '), frag = document.createDocumentFragment();
    parts.forEach(function (p, i) {
      var s = document.createElement('span'); if (p.length <= 18) s.className = 'nw';
      s.textContent = p + (i < parts.length - 1 ? ' ·' : '');
      frag.appendChild(s); if (i < parts.length - 1) frag.appendChild(document.createTextNode(' '));
    });
    el.textContent = ''; el.appendChild(frag);
  }
  function run() {
    queued = false; busy = true;
    try { document.querySelectorAll(DOTS).forEach(splitDots); } catch (e) {}
    try {
      document.querySelectorAll(ROOTS).forEach(function (root) {
        root.querySelectorAll('*').forEach(function (el) {
          var tn = el.tagName;
          if (tn === 'INPUT' || tn === 'SELECT' || tn === 'TEXTAREA' || tn === 'CANVAS' || tn === 'svg' || tn === 'I') return;
          if (el.style.fontSize && el.dataset.fit) el.style.fontSize = '';
          if (el.scrollWidth > el.clientWidth + 1 || el.dataset.fit) { el.dataset.fit = '1'; fit(el); }
          else if (el.childElementCount === 0 && multiNum(el)) { el.dataset.fit = '1'; el.style.setProperty('white-space', 'nowrap', 'important'); el.style.setProperty('overflow', 'hidden'); fit(el); }
        });
      });
    } catch (e) { console.warn('[fit]', e); }
    busy = false;
  }
  function queue() { if (queued || busy) return; queued = true; requestAnimationFrame(function () { requestAnimationFrame(run); }); clearTimeout(late); late = setTimeout(run, 600); }
  App.fit = queue;
  App.on('rendered', queue);
  window.addEventListener('resize', queue);
  /* 내용 칸 너비가 바뀔 때(스크롤바 · 차트 등)도 다시 맞춘다 */
  if (window.ResizeObserver) { var lastW = 0; new ResizeObserver(function (es) { var w = Math.round(es[0].contentRect.width); if (w !== lastW) { lastW = w; queue(); } }).observe(document.getElementById('content') || document.body); }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(queue);
  new MutationObserver(function (ms) { if (busy) return; for (var i = 0; i < ms.length; i++) if (ms[i].type === 'childList') return queue(); })
    .observe(document.body, { childList: true, subtree: true });
})();

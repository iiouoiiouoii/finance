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
    var shrink = el.id === 'page-title' || el.classList.contains('fit-shrink');
    if (txt && (shrink || (txt.length <= 24 && NUM.test(txt)))) {
      var size = parseFloat(cs.fontSize), min = shrink ? 16 : 11;
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
  function run() {
    queued = false; busy = true;
    try {
      document.querySelectorAll(ROOTS).forEach(function (root) {
        root.querySelectorAll('*').forEach(function (el) {
          var tn = el.tagName;
          if (tn === 'INPUT' || tn === 'SELECT' || tn === 'TEXTAREA' || tn === 'CANVAS' || tn === 'svg' || tn === 'I') return;
          if (el.style.fontSize && el.dataset.fit) el.style.fontSize = '';
          if (el.scrollWidth > el.clientWidth + 1 || el.dataset.fit) { el.dataset.fit = '1'; fit(el); }
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

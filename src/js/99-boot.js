/* 시작 : 데이터 불러오기 → 화면 뼈대 → 동기화·알림 → 첫 화면 */
(function (App) {
  'use strict';
  function boot() {
    try {
      App.store.load();
      if (App.calc.autoCloseInstallments()) App.store.save({ quiet: true });
      else App.store.save({ quiet: true });   /* 정리(마이그레이션) 결과를 바로 저장 */
      App.ui.init();
      App.sync.boot();
      App.budget.boot();
      App.ui.render();
    } catch (e) {
      console.error('[시작]', e);
      document.getElementById('content').innerHTML = '<div class="p-6 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">가계부를 여는 중 오류가 났습니다: ' + App.u.esc(e.message) + '<br>데이터는 지워지지 않았습니다. 설정의 JSON 백업으로 내보낸 뒤 문의하세요.</div>';
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})(window.App);

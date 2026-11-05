/* 계산기 모음 : 가끔 쓰는 계산 도구를 한 화면에 (메뉴를 짧게 유지) */
(function (App) {
  'use strict';
  var u = App.u;
  var TOOLS = [
    ['loan', 'fa-scale-balanced', '대출 먼저 갚을까', '여윳돈으로 대출을 갚을지, 저축 · 투자할지 비교해요.'],
    ['tax', 'fa-receipt', '연말정산', '맞벌이 부부가 카드 · 공제를 누구 쪽으로 몰면 유리한지 계산해요.'],
    ['retire', 'fa-umbrella-beach', '은퇴 준비', '지금 속도로 모으면 은퇴 후 매달 얼마를 쓸 수 있는지 봐요.']
  ];
  App.views.add({
    id: 'tools', order: 95, title: '계산기', nav: { label: '계산기', icon: 'fa-calculator' },
    render: function (el) {
      el.innerHTML = '<div class="card"><div class="list-wrap">' + TOOLS.map(function (t) {
        return u.item({ tap: 'App.ui.go(\'' + t[0] + '\')', icon: t[1], title: t[2], meta: t[3], val: '<i class="fa-solid fa-chevron-right text-slate-300 text-[13px]"></i>' });
      }).join('') + '</div></div>';
    }
  });
})(window.App);

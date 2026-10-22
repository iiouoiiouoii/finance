/* 설정 : 부부 프로필 · 부부 재무 규칙(출생연도·용돈) · 재분류/백업 도구 · 카테고리 */
(function (App) {
  'use strict';
  var u = App.u, C = App.calc, ST = App.settings = {};
  var db = function () { return App.db; };

  ST.saveProfile = function () {
    var s = db().settings;
    s.husbandName = u.val('set-h-name'); s.husbandIncome = u.P(u.val('set-h-income')); s.husbandAnnual = u.P(u.val('set-h-annual')); s.husbandPayday = parseInt(u.val('set-h-payday'), 10) || 25;
    s.wifeName = u.val('set-w-name'); s.wifeIncome = u.P(u.val('set-w-income')); s.wifeAnnual = u.P(u.val('set-w-annual')); s.wifePayday = parseInt(u.val('set-w-payday'), 10) || 10;
    if (db().taxPlan) { db().taxPlan.salA = s.husbandAnnual; db().taxPlan.salB = s.wifeAnnual; }
    App.store.save(); u.toast('부부 프로필 정보가 저장되었습니다.');
  };
  ST.saveRules = function () {
    var s = db().settings, by = function (id) { var v = parseInt(u.val(id), 10); return v > 1900 && v < 2100 ? v : null; };
    s.husbandBirthYear = by('set-by-h'); s.wifeBirthYear = by('set-by-w');
    s.allowanceH = u.P(u.val('set-allow-h')); s.allowanceW = u.P(u.val('set-allow-w'));
    App.store.save(); u.toast('부부 재무 규칙이 저장되었습니다.');
  };

  function person(p, title, icon, s) {
    var k = p === 'h' ? 'husband' : 'wife';
    return '<div class="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3"><h4 class="font-bold text-slate-800 border-b border-slate-200 pb-2 flex items-center gap-1.5"><i class="fa-solid ' + icon + '"></i> ' + title + '</h4>'
      + '<div class="grid grid-cols-2 gap-3">' + u.field('set-' + p + '-name', '이름 / 별칭') + u.field('set-' + p + '-income', '월 정기 수입 (원)', { money: true }) + u.field('set-' + p + '-annual', '연간 총급여 (원)', { money: true }) + u.field('set-' + p + '-payday', '월 급여일 (일)', { type: 'number', attrs: 'min="1" max="31"' }) + '</div></div>';
  }
  /* 데이터 · 화면 : 백업 · 동기화 · 화면 크기 · 샘플 · 초기화 (위험한 버튼은 맨 아래, 확인을 거친다) */
  function dataCard() {
    var row = function (t, d, right) { return '<div class="flex items-center justify-between gap-4 flex-wrap py-4 border-t border-slate-100 first:border-0"><div class="min-w-0"><div class="font-semibold text-slate-900 text-[15px]">' + t + '</div><div class="text-[13px] text-slate-500 mt-0.5">' + d + '</div></div><div class="flex gap-2 flex-wrap">' + right + '</div></div>'; };
    return '<div class="bg-white p-6 rounded-xl border border-slate-200 shadow-sm"><h3 class="font-bold text-slate-900 text-base mb-1">데이터 · 화면</h3>'
      + row('여러 기기에서 같이 쓰기', '아이디로 로그인하면 휴대폰 · PC · 배우자 기기가 같은 데이터를 봅니다.', '<button onclick="App.sync.open()" class="btn sec">동기화 · 아이디 관리</button>')
      + row('파일로 백업', '이 브라우저 데이터를 파일 하나로 내려받거나, 받아 둔 파일로 되돌립니다.', '<button onclick="App.store.exportBackup()" class="btn sec">백업 파일 받기</button><label class="btn sec cursor-pointer">백업에서 되돌리기<input type="file" accept="application/json" onchange="App.store.importBackup(this)" class="hidden"></label>')
      + row('화면 크기', '보통은 기기에 맞춤으로 두면 됩니다.', App.ui.modeHtml())
      + row('예시 데이터로 둘러보기', '지금 데이터를 지우고 예시 데이터를 넣습니다. 먼저 백업하세요.', '<button onclick="App.store.loadSample()" class="btn sec">예시 데이터 넣기</button>')
      + row('모든 데이터 지우기', '이 기기의 내역 · 자산 · 설정을 모두 지웁니다. 되돌릴 수 없습니다.', '<button onclick="App.store.clearAll()" class="btn sec" style="color:#C4282D">모두 지우기</button>') + '</div>';
  }
  App.views.add({
    id: 'settings', order: 110, title: '설정', nav: { label: '설정', icon: 'fa-gear' },
    render: function (el) {
      var s = db().settings, plan = App.cat.buildPlan('ALL', false);
      el.innerHTML = '<div class="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4"><div class="border-b border-slate-100 pb-3 flex justify-between items-center gap-2"><h3 class="font-bold text-slate-800 text-base flex items-center gap-2"><i class="fa-solid fa-users text-accent"></i> 우리 부부 · 월급</h3>'
        + '<button onclick="App.settings.saveProfile()" class="bg-slate-900 hover:bg-slate-800 text-white text-xs px-4 py-2 rounded-lg font-semibold">부부 정보 저장</button></div>'
        + '<div class="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">' + person('h', '본인 (근로자 A)', 'fa-user text-accent', s) + person('w', '배우자 (근로자 B)', 'fa-user-tie text-amber-600', s) + '</div></div>'
        + '<div class="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4"><div class="border-b border-slate-100 pb-3 flex justify-between items-center gap-3 flex-wrap"><div><h3 class="font-bold text-slate-800 text-base flex items-center gap-2"><i class="fa-solid fa-handshake text-accent"></i> 부부 재무 규칙</h3>'
        + '<p class="text-xs text-slate-500 mt-0.5">생활비는 부부 공동으로 관리합니다. 각자 용돈 한도를 정해 두면 대시보드에서 사용 현황을 보여줍니다. 출생연도는 은퇴 시뮬레이터에 쓰입니다.</p></div>'
        + '<button onclick="App.settings.saveRules()" class="bg-slate-900 hover:bg-slate-800 text-white text-xs px-4 py-2 rounded-lg font-semibold">규칙 저장</button></div>'
        + '<div class="grid grid-cols-2 lg:grid-cols-4 gap-3">' + u.field('set-by-h', u.esc(C.short('H')) + ' 출생연도', { type: 'number', ph: '예: 1988' }) + u.field('set-by-w', u.esc(C.short('W')) + ' 출생연도', { type: 'number', ph: '예: 1990' })
        + u.field('set-allow-h', u.esc(C.short('H')) + ' 월 용돈 한도 (원)', { money: true }) + u.field('set-allow-w', u.esc(C.short('W')) + ' 월 용돈 한도 (원)', { money: true })
        + '<div class="col-span-2 lg:col-span-4 text-[11px] text-slate-500 leading-relaxed">지출은 기본으로 <b>공동 생활비</b>로 잡힙니다. 개인 용돈으로 쓴 것만 내역에서 사용자를 바꾸면 그 사람의 용돈 사용액으로 집계합니다.</div></div></div>'
        + '<div class="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4"><div class="border-b border-slate-100 pb-3 flex justify-between items-center gap-2"><div><h3 class="font-bold text-slate-800 text-base flex items-center gap-2"><i class="fa-solid fa-tags text-accent"></i> 세분화 카테고리 체계</h3>'
        + '<p class="text-xs text-slate-500 mt-0.5">각 카테고리별 소분류와 자동 추론 키워드를 자유롭게 변경하고 신규 카테고리를 추가할 수 있습니다.</p></div><button onclick="App.cat.open()" class="bg-accent hover:bg-accent-hover text-white text-xs px-3.5 py-2 rounded-lg font-medium shrink-0">+ 카테고리 신규 추가</button></div>'
        + '<div class="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3"><div class="flex items-start justify-between gap-3 flex-wrap"><div><div class="font-bold text-slate-800 text-sm">카테고리 규칙 일괄 재적용</div><div class="text-[11px] text-slate-500 mt-0.5">키워드를 수정한 뒤 기존 내역을 새 규칙으로 다시 분류합니다. '
        + (plan.length ? '<strong class="text-amber-600">현재 ' + plan.length + '건이 규칙과 불일치합니다.</strong>' : '모든 내역이 현재 규칙과 일치합니다.') + '</div></div>'
        + '<div class="flex gap-2"><button onclick="App.cat.openReclass(\'ALL\')" class="text-xs bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg font-semibold">전체 기간 재분류</button><button onclick="App.cat.undo()" class="text-xs bg-white border border-slate-300 text-slate-600 px-3 py-1.5 rounded-lg">되돌리기</button></div></div>'
        + '<div class="border-t border-slate-200 pt-3 space-y-2"><div class="flex items-start justify-between gap-3 flex-wrap"><div><div class="font-bold text-slate-800 text-sm">학습된 가맹점 분류 <span class="text-[11px] font-semibold text-slate-400">' + Object.keys(db().merchantRules || {}).length + '개</span></div>'
        + '<div class="text-[11px] text-slate-500 mt-0.5">내역의 분류를 직접(또는 일괄 편집으로) 고치면 그 가맹점은 다음부터 키워드보다 먼저 이 분류로 들어갑니다.</div></div>'
        + (Object.keys(db().merchantRules || {}).length ? '<button onclick="App.cat.clearRules()" class="text-xs bg-white border border-slate-300 text-red-500 px-3 py-1.5 rounded-lg">모두 지우기</button>' : '') + '</div>' + App.cat.rulesHtml() + '</div>'
        + '<div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">' + App.cat.listHtml() + '</div></div>' + dataCard();
      u.$('set-h-name').value = s.husbandName || '남편'; u.setMoney('set-h-income', s.husbandIncome); u.setMoney('set-h-annual', s.husbandAnnual); u.$('set-h-payday').value = s.husbandPayday || 25;
      u.$('set-w-name').value = s.wifeName || '아내'; u.setMoney('set-w-income', s.wifeIncome); u.setMoney('set-w-annual', s.wifeAnnual); u.$('set-w-payday').value = s.wifePayday || 10;
      u.$('set-by-h').value = s.husbandBirthYear || ''; u.$('set-by-w').value = s.wifeBirthYear || '';
      u.setMoney('set-allow-h', s.allowanceH); u.setMoney('set-allow-w', s.allowanceW);

    }
  });
})(window.App);

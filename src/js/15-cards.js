/* 보유 카드 : 카드 목록 · 당월 실적 · 등록/수정 · 혜택 최적화 분석 */
(function (App) {
  'use strict';
  var u = App.u, C = App.calc, CD = App.cards = {};
  var db = function () { return App.db; };

  function spentOf(card, mo) {
    return u.sum(C.monthTx(mo).filter(function (t) { return t.type === 'EXPENSE' && String(t.payment || '').indexOf(card.name) >= 0; }), function (t) { return t.amount; });
  }

  /* ---------- 혜택 문구 해석 : "대중교통 10%, 온라인 5%, 기본 0.7%" ---------- */
  var AL = { '온라인': ['온라인', '쿠팡', '네이버페이', '11번가', 'G마켓', 'SSG'], '주유': ['주유', '충전'], '외식': ['외식', '배달'], '마트': ['식자재', '마트'], '카페': ['카페', '간식'], '대중교통': ['대중교통', '택시', '지하철', '버스'], '쇼핑': ['쇼핑'], '통신': ['통신'], '구독': ['OTT', '구독'], '병원': ['병원', '약국'], '편의점': ['편의점'] };
  function rules(c) {
    var r = [], base = 0;
    String(c.benefits || '').replace(/([가-힣A-Za-z\/·]+)\s*(\d+(?:\.\d+)?)\s*%/g, function (_, k, v) { v = +v; if (/가맹점|기본|전$|모든|적립|일반/.test(k)) base = Math.max(base, v); else r.push([k, v]); });
    return { r: r, base: base };
  }
  function rateOf(c, t) {
    var R = rules(c), hay = [t.category, t.subcategory, t.memo].join(' '), b = R.base;
    R.r.forEach(function (x) { if ([x[0]].concat(AL[x[0]] || []).some(function (w) { return hay.indexOf(w) >= 0; })) b = Math.max(b, x[1]); });
    return b;
  }
  function optimizerHtml() {
    if (!db().cards.length) return '<div class="text-xs text-slate-400">카드를 등록하면 혜택 최적화 분석이 표시됩니다. (혜택 입력 예: <b>대중교통 10%, 온라인 5%, 기본 0.7%</b>)</div>';
    var mo = App.state.month, tx = C.monthTx(mo).filter(function (t) { return t.type === 'EXPENSE'; });
    var d = new Date(), left = mo === u.nowM() ? Math.max(1, u.dim(mo) - d.getDate() + 1) : 0, spent = {}, ben = {};
    db().cards.forEach(function (c) { spent[c.id] = 0; ben[c.id] = 0; });
    tx.forEach(function (t) { var c = C.cardOf(t.payment); if (c) { spent[c.id] += t.amount; ben[c.id] += t.amount * rateOf(c, t) / 100; } });
    var rows = db().cards.map(function (c) {
      var rem = Math.max(0, (c.targetAmount || 0) - spent[c.id]), ok = rem === 0;
      return '<tr class="border-t border-slate-100"><td class="p-2 font-semibold">' + u.esc(c.name) + ' <span class="text-slate-400 font-normal">' + u.esc(c.owner || '') + '</span></td><td class="p-2 text-right">' + u.K(spent[c.id]) + ' / ' + u.K(c.targetAmount) + '</td>'
        + '<td class="p-2 text-right ' + (ok ? 'text-emerald-600' : 'text-amber-600') + '">' + (ok ? '달성' : u.K(rem) + ' 남음') + '</td><td class="p-2 text-right">' + (!ok && left ? u.K(rem / left) + '/일' : '-') + '</td><td class="p-2 text-right font-bold text-accent">' + u.K(ben[c.id]) + '</td></tr>';
    }).join('');
    var grp = {};
    tx.forEach(function (t) {
      if (t.category === '자산이동' || /주거|금융|보험|세금/.test(t.category) || /계좌|현금/.test(t.payment || '')) return;
      var k = t.category + ' > ' + (t.subcategory || '일반'), c = C.cardOf(t.payment), cur = c ? rateOf(c, t) : 0, best = null, br = -1;
      db().cards.forEach(function (x) { var r = rateOf(x, t); if (r > br) { br = r; best = x; } });
      var g = grp[k] || (grp[k] = { k: k, amt: 0, cur: 0, gain: 0, best: best, br: br });
      g.amt += t.amount; g.cur += t.amount * cur / 100; g.gain += Math.max(0, br - cur) * t.amount / 100;
    });
    var list = Object.keys(grp).map(function (k) { return grp[k]; }).sort(function (a, b) { return b.gain - a.gain; }).slice(0, 8), total = u.sum(list, function (g) { return g.gain; });
    var warn = db().cards.filter(function (c) { return (c.targetAmount || 0) > spent[c.id]; }).map(function (c) { return '<b>' + u.esc(c.name) + '</b> 실적까지 ' + u.K(c.targetAmount - spent[c.id]) + (left ? ' (하루 ' + u.K((c.targetAmount - spent[c.id]) / left) + ')' : ''); });
    return '<div class="flex items-center justify-between flex-wrap gap-2"><h3 class="font-bold text-slate-800 flex items-center gap-2"><i class="fa-solid fa-wand-magic-sparkles text-amber-500"></i>카드 혜택 최적화 <span class="text-xs text-slate-400 font-normal">(' + mo + ' 지출 기준)</span></h3><div class="text-xs text-slate-500">최적 카드 사용 시 추가 혜택 <b class="text-accent text-sm">' + u.K(total) + '</b></div></div>'
      + '<div class="overflow-x-auto"><table class="w-full text-xs"><thead><tr class="text-slate-500 bg-slate-50"><th class="p-2 text-left">카드</th><th class="p-2 text-right">당월 사용 / 실적목표</th><th class="p-2 text-right">남은 실적</th><th class="p-2 text-right">잔여일 권장</th><th class="p-2 text-right">예상 혜택</th></tr></thead><tbody>' + rows + '</tbody></table></div>'
      + (warn.length ? '<div class="text-xs bg-amber-50 border border-amber-200 text-amber-900 rounded-lg p-3">실적 미달 카드: ' + warn.join(' · ') + '<div class="text-[11px] mt-1 opacity-80">※ 실적을 채우려고 지출을 늘리면 혜택보다 지출이 더 커질 수 있습니다. 어차피 쓸 돈만 카드를 바꿔 결제하세요.</div></div>' : '')
      + '<div class="overflow-x-auto"><table class="w-full text-xs"><thead><tr class="text-slate-500 bg-slate-50"><th class="p-2 text-left">지출 항목</th><th class="p-2 text-right">지출액</th><th class="p-2 text-right">현재 혜택</th><th class="p-2 text-left">추천 카드</th><th class="p-2 text-right">추가 혜택</th></tr></thead><tbody>'
      + (list.map(function (g) {
        var low = g.best && (g.best.targetAmount || 0) > spent[g.best.id];
        return '<tr class="border-t border-slate-100"><td class="p-2">' + u.esc(g.k) + '</td><td class="p-2 text-right">' + u.K(g.amt) + '</td><td class="p-2 text-right">' + u.K(g.cur) + '</td><td class="p-2">' + u.esc(g.best ? g.best.name : '-') + ' <span class="text-slate-400">' + g.br + '%</span>' + (low ? ' <span class="text-amber-600">⚠실적 필요</span>' : '') + '</td><td class="p-2 text-right font-bold ' + (g.gain > 0 ? 'text-accent' : 'text-slate-400') + '">' + u.K(g.gain) + '</td></tr>';
      }).join('') || '<tr><td colspan="5" class="p-4 text-center text-slate-400">이번 달 지출이 없습니다.</td></tr>')
      + '</tbody></table></div><div class="text-[11px] text-slate-400">※ 카드 혜택 문구의 “항목 N%”를 읽어 계산하는 추정치이며, 월 한도·전월실적 조건은 반영하지 않습니다.</div>';
  }

  /* ---------- 등록 · 수정 ---------- */
  CD.open = function (id) {
    u.modal('card-modal', u.modalHead('card-modal-title', '보유 카드 등록', 'card-modal')
      + '<form onsubmit="App.cards.save(event)" class="space-y-3"><input type="hidden" id="card-edit-id">'
      + u.field('card-name', '카드 별칭 / 명칭', { ph: '예: KB국민 톡톡 M', attrs: 'required', cls: 'font-bold' })
      + '<div class="grid grid-cols-2 gap-3"><div><label class="block text-xs font-semibold text-slate-600 mb-1">카드 소유자</label><select id="card-owner" class="' + u.IN + ' font-bold bg-amber-50"></select></div>'
      + '<div><label class="block text-xs font-semibold text-slate-600 mb-1">카드 종류</label><select id="card-type" class="' + u.IN + '"><option value="신용카드">신용카드</option><option value="체크카드">체크카드</option></select></div></div>'
      + u.field('card-target', '월 실적 목표액 (원)', { money: true, attrs: 'required' })
      + '<div><label class="block text-xs font-semibold text-slate-600 mb-1">카드 혜택 및 메모</label><textarea id="card-benefits" rows="2" placeholder="예) 대중교통 10%, 온라인 5%, 기본 0.7%  (혜택 최적화 분석에 사용됩니다)" class="' + u.IN + '"></textarea></div>'
      + '<div class="pt-3 flex justify-end gap-2"><button type="button" onclick="App.u.close(\'card-modal\')" class="px-4 py-2 bg-slate-100 text-slate-600 rounded-lg text-xs">취소</button><button type="submit" class="px-4 py-2 bg-accent text-white rounded-lg text-xs font-semibold">저장하기</button></div></form>', 420);
    var c = id ? u.byId(db().cards, id) : null, s = db().settings, h = s.husbandName || '남편', w = s.wifeName || '아내';
    var owners = [h, w]; if (c && c.owner && owners.indexOf(c.owner) < 0) owners.push(c.owner);
    u.$('card-owner').innerHTML = owners.map(function (o) { return '<option value="' + u.esc(o) + '">' + u.esc(o) + '</option>'; }).join('');
    u.$('card-modal-title').innerText = c ? '보유 카드 수정' : '보유 카드 등록';
    u.$('card-edit-id').value = c ? c.id : ''; u.$('card-name').value = c ? c.name : '';
    u.$('card-owner').value = c ? c.owner : h; u.$('card-type').value = c ? c.type : '신용카드';
    u.$('card-target').value = c ? u.n0(c.targetAmount) : '300,000'; u.$('card-benefits').value = c ? c.benefits || '' : '';
    u.open('card-modal');
  };
  CD.save = function (e) {
    e.preventDefault();
    var id = u.val('card-edit-id'), c = id ? u.byId(db().cards, id) : null, oldName = c ? c.name : null;
    var rec = { name: u.val('card-name').trim(), owner: u.val('card-owner'), type: u.val('card-type'), targetAmount: u.P(u.val('card-target')), benefits: u.val('card-benefits') };
    if (c) Object.keys(rec).forEach(function (k) { c[k] = rec[k]; }); else { rec.id = u.uid(); db().cards.push(rec); }
    App.store.save(); u.close('card-modal');
    u.toast(c ? '카드 정보가 수정되었습니다.' + (oldName && oldName !== rec.name ? ' 기존 내역의 결제수단 이름은 그대로이니 필요하면 일괄 변경하세요.' : '') : '카드가 등록되었습니다.');
  };
  CD.remove = function (id) {
    u.confirm('카드 삭제', '이 카드를 목록에서 삭제하시겠습니까?', function () {
      db().cards = db().cards.filter(function (c) { return c.id !== Number(id); }); App.store.save(); u.toast('카드가 삭제되었습니다.');
    });
  };

  App.views.add({
    id: 'cards', order: 30, title: '보유 카드 관리 & 당월 실적', nav: { label: '보유 카드 & 실적 관리', icon: 'fa-credit-card', color: 'text-amber-400' },
    render: function (el) {
      var mo = App.state.month;
      var grid = db().cards.length ? db().cards.map(function (card) {
        var spent = spentOf(card, mo), rate = card.targetAmount > 0 ? Math.min(Math.round(spent / card.targetAmount * 100), 100) : 0;
        var own = C.codeOfName(card.owner) === 'W' ? 'bg-rose-100 text-rose-800 border-rose-200' : 'bg-sky-100 text-sky-800 border-sky-200';
        return '<div class="bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-3 hover:shadow-sm transition"><div class="flex justify-between items-start"><div>'
          + '<div class="flex gap-1.5 items-center mb-1"><span class="px-2 py-0.5 rounded text-[10px] font-bold border ' + own + '"><i class="fa-solid fa-user mr-1 text-[9px]"></i>' + u.esc(card.owner || '남편') + '</span>'
          + '<span class="px-2 py-0.5 rounded text-[10px] font-bold ' + (card.type === '신용카드' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800') + '">' + u.esc(card.type) + '</span></div>'
          + '<h4 class="font-bold text-slate-800 text-sm">' + u.esc(card.name) + '</h4></div>'
          + '<div><button onclick="App.cards.open(' + card.id + ')" class="text-slate-300 hover:text-accent text-xs mr-2" title="수정"><i class="fa-solid fa-pen-to-square"></i></button><button onclick="App.cards.remove(' + card.id + ')" class="text-slate-300 hover:text-red-500 text-xs"><i class="fa-solid fa-trash-can"></i></button></div></div>'
          + '<div class="space-y-1"><div class="flex justify-between text-xs"><span class="text-slate-500">당월 실적</span><span class="font-bold text-slate-800">' + u.K(spent) + ' / ' + u.K(card.targetAmount) + '</span></div>'
          + '<div class="w-full bg-slate-200 rounded-full h-2 overflow-hidden"><div class="' + (rate >= 100 ? 'bg-emerald-500' : 'bg-amber-500') + ' h-2 rounded-full" style="width:' + rate + '%"></div></div></div>'
          + '<div class="p-2 bg-white rounded border border-slate-200/80 text-[11px] text-slate-600 truncate"><span class="font-semibold text-slate-700">혜택:</span> ' + u.esc(card.benefits || '설정 없음') + '</div></div>';
      }).join('') : '<div class="md:col-span-3 text-center text-slate-400 py-8">등록된 카드가 없습니다. 상단 \'새 카드 등록\' 버튼으로 추가해보세요.</div>';
      el.innerHTML = '<div class="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4"><div class="flex justify-between items-center pb-4 border-b border-slate-100 gap-2"><div><h3 class="font-bold text-slate-800 text-base flex items-center gap-2"><i class="fa-solid fa-credit-card text-amber-500"></i> 보유 카드 목록 & 당월 실적 관리</h3>'
        + '<p class="text-xs text-slate-500 mt-1">남편/아내 소유자를 구분하여 카드 실적 및 혜택을 통합 관리할 수 있습니다.</p></div><button onclick="App.cards.open()" class="bg-slate-800 hover:bg-slate-900 text-white text-xs px-4 py-2 rounded-lg flex items-center gap-1.5 shrink-0"><i class="fa-solid fa-plus text-amber-400"></i> 새 카드 등록</button></div>'
        + '<div class="grid grid-cols-1 md:grid-cols-3 gap-5">' + grid + '</div></div>'
        + '<div class="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">' + optimizerHtml() + '</div>';
    }
  });
})(window.App);

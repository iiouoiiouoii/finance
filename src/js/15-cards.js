/* 카드 : 다가오는 카드값(결제일 · 이용기간 · 청구 예상 · 냈는지) · 카드 목록 · 실적 · 등록/수정 · 혜택 최적화 분석 */
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
  function dayOpts(sel, none) { var o = none ? '<option value="">' + none + '</option>' : ''; for (var d = 1; d <= 31; d++) o += '<option value="' + d + '"' + (+sel === d ? ' selected' : '') + '>' + d + '일</option>'; return o; }
  /* 이용기간 문구 : 시작일 S, 결제일 D → "전월 1일 ~ 말일" */
  CD.periodText = function (D, S) {
    D = +D; S = +S || C.cardStartDefault(D); if (!D) return '';
    if (S === 1) return '전월 1일 ~ 전월 말일';
    return (S <= D ? '전월 ' + S + '일 ~ 이번 달 ' : '전전월 ' + S + '일 ~ 전월 ') + (S - 1) + '일';
  };
  CD.periodHint = function () {
    var D = u.val('card-payday'), sEl = u.$('card-start'); if (!sEl) return;
    sEl.placeholder = D ? '자동 (' + C.cardStartDefault(D) + '일)' : '결제일 먼저';
    u.$('card-period-hint').innerHTML = D ? '이용기간: <b>' + CD.periodText(D, u.val('card-start')) + '</b> 사용분이 ' + D + '일에 나가요. 카드사 안내와 다르면 시작일을 고치세요.' : '체크카드는 비워 두세요. 결제일을 넣으면 매달 낼 카드값을 미리 알려 드려요.';
  };
  CD.open = function (id) {
    u.modal('card-modal', u.modalHead('card-modal-title', '카드 등록', 'card-modal')
      + '<form onsubmit="App.cards.save(event)" class="space-y-4"><input type="hidden" id="card-edit-id">'
      + u.field('card-name', '카드 이름', { ph: '예: 신한 Deep Dream (카드사 이름을 맨 앞에)', attrs: 'required' })
      + '<div class="grid grid-cols-2 gap-3"><div><label class="block text-xs font-semibold text-slate-600 mb-1.5">누구 카드</label><select id="card-owner" class="' + u.IN + '"></select></div>'
      + '<div><label class="block text-xs font-semibold text-slate-600 mb-1.5">종류</label><select id="card-type" onchange="App.cards.typeChanged()" class="' + u.IN + '"><option value="신용카드">신용카드</option><option value="체크카드">체크카드</option></select></div></div>'
      + '<div id="card-pay-box" class="bg-slate-50 rounded-xl p-3.5 space-y-3"><div class="grid grid-cols-2 gap-3"><div><label class="block text-xs font-semibold text-slate-600 mb-1.5">결제일</label><select id="card-payday" onchange="App.cards.periodHint()" class="' + u.IN + ' bg-white">' + dayOpts(null, '모름 · 없음') + '</select></div>'
      + '<div><label class="block text-xs font-semibold text-slate-600 mb-1.5">이용기간 시작일</label><input id="card-start" type="number" min="1" max="31" oninput="App.cards.periodHint()" class="' + u.IN + ' bg-white"></div></div>'
      + '<div id="card-period-hint" class="text-[13px] text-slate-600 leading-relaxed"></div>'
      + u.field('card-account', '결제 계좌 (선택)', { ph: '예: 국민은행 생활비통장' }).replace(u.IN, u.IN + ' bg-white') + '</div>'
      + u.field('card-target', '월 실적 목표 (선택)', { money: true, ph: '예: 300,000' })
      + '<div><label class="block text-xs font-semibold text-slate-600 mb-1.5">혜택 메모 (선택)</label><textarea id="card-benefits" rows="2" placeholder="예) 대중교통 10%, 온라인 5%, 기본 0.7%" class="' + u.IN + '"></textarea></div>'
      + '<div class="pt-2 flex justify-end gap-2"><button type="button" onclick="App.u.close(\'card-modal\')" class="btn sec">취소</button><button type="submit" class="btn pri px-6">저장</button></div></form>', 460);
    var c = id ? u.byId(db().cards, id) : null, st = db().settings, h = st.husbandName || '남편', w = st.wifeName || '아내';
    var owners = [h, w]; if (c && c.owner && owners.indexOf(c.owner) < 0) owners.push(c.owner);
    u.$('card-owner').innerHTML = owners.map(function (o) { return '<option value="' + u.esc(o) + '">' + u.esc(o) + '</option>'; }).join('');
    u.$('card-modal-title').innerText = c ? '카드 고치기' : '카드 등록';
    u.$('card-edit-id').value = c ? c.id : ''; u.$('card-name').value = c ? c.name : '';
    u.$('card-owner').value = c ? c.owner : h; u.$('card-type').value = c ? c.type : '신용카드';
    u.$('card-payday').value = c && c.payDay ? c.payDay : ''; u.$('card-start').value = c && c.periodStart ? c.periodStart : ''; u.$('card-account').value = c ? c.payAccount || '' : '';
    u.$('card-target').value = c && c.targetAmount ? u.n0(c.targetAmount) : ''; u.$('card-benefits').value = c ? c.benefits || '' : '';
    CD.typeChanged(); CD.periodHint();
    u.open('card-modal');
  };
  CD.typeChanged = function () { u.$('card-pay-box').classList.toggle('hidden', u.val('card-type') === '체크카드'); };
  CD.save = function (e) {
    e.preventDefault();
    var id = u.val('card-edit-id'), c = id ? u.byId(db().cards, id) : null, oldName = c ? c.name : null, check = u.val('card-type') === '체크카드';
    var S = parseInt(u.val('card-start'), 10);
    var rec = { name: u.val('card-name').trim(), owner: u.val('card-owner'), type: u.val('card-type'), targetAmount: u.P(u.val('card-target')), benefits: u.val('card-benefits'),
      payDay: check ? null : (+u.val('card-payday') || null), periodStart: check || !(S >= 1 && S <= 31) ? null : S, payAccount: check ? '' : u.val('card-account').trim() };
    if (c) Object.keys(rec).forEach(function (k) { c[k] = rec[k]; }); else { rec.id = u.uid(); db().cards.push(rec); }
    App.store.save(); u.close('card-modal');
    u.toast(c ? '카드를 고쳤습니다.' + (oldName && oldName !== rec.name ? ' 기존 내역의 결제수단 이름은 그대로이니 필요하면 내역에서 한꺼번에 바꾸세요.' : '') : '카드를 등록했습니다.');
  };
  CD.remove = function (id) {
    u.confirm('카드 삭제', '이 카드를 목록에서 지울까요? 내역은 그대로 남아요.', function () {
      db().cards = db().cards.filter(function (c) { return c.id !== Number(id); }); App.store.save(); u.toast('카드를 지웠습니다.');
    });
  };
  /* 냈어요 표시 (자동으로 못 찾았을 때) */
  CD.markPaid = function (id, P, on) {
    var c = u.byId(db().cards, id); if (!c) return;
    c.paid = c.paid || {};
    if (on) c.paid[P] = { at: u.today(), amount: C.cardBill(c, P).total }; else delete c.paid[P];
    App.store.save(); u.toast(on ? c.name + ' ' + (+P.slice(5)) + '월 카드값을 낸 것으로 표시했습니다.' : '표시를 지웠습니다.');
  };

  /* ---------- 다가오는 카드값 ---------- */
  var md = function (s) { var q = String(s).split('-'); return +q[1] + '월 ' + +q[2] + '일'; };
  CD.upcoming = function () { return (db().cards || []).filter(C.isCredit).map(function (c) { return { c: c, b: C.cardNext(c) }; }).sort(function (x, y) { return x.b.payDate < y.b.payDate ? -1 : 1; }); };
  function billsHtml() {
    var L = CD.upcoming(), noDay = (db().cards || []).filter(function (c) { return c.type !== '체크카드' && !c.payDay; });
    if (!L.length) return '<div class="card"><div class="card-h"><h3>다가오는 카드값</h3></div><p class="sub">신용카드에 <b>결제일</b>을 넣으면, 다음 결제일에 얼마가 나갈지 · 냈는지를 여기서 보여 드려요.</p>'
      + (noDay.length ? '<div class="flex flex-wrap gap-2 mt-4">' + noDay.map(function (c) { return '<button onclick="App.cards.open(' + c.id + ')" class="btn sec" style="height:38px">' + u.esc(c.name) + ' 결제일 넣기</button>'; }).join('') + '</div>' : '') + '</div>';
    var month = u.sum(L.filter(function (x) { return !x.b.paid && x.b.left <= 31; }), function (x) { return x.b.total; });
    return '<div class="card"><div class="card-h"><h3>다가오는 카드값</h3><span class="text-[14px] text-slate-600">낼 돈 합계 <b class="text-slate-900">' + u.n0(month) + '원</b></span></div>'
      + L.map(function (x) {
        var c = x.c, b = x.b, prevP = u.addM(b.P, -1), prev = C.cardBill(c, prevP), prevPaid = C.cardPaid(c, prevP), soon = !b.paid && b.left <= 3;
        var pill = b.paid ? '<span class="pill ok">냈어요</span>' : soon ? '<span class="pill warn">' + (b.left <= 0 ? '오늘' : 'D-' + b.left) + '</span>' : '<span class="pill mute">D-' + b.left + '</span>';
        return '<div class="row items-start"><div class="t"><b>' + u.esc(c.name) + ' <span class="text-[13px] font-normal text-slate-500">· ' + u.esc(c.owner || '') + '</span></b>'
          + '<small>' + md(b.payDate) + ' 결제 · ' + md(b.period.from) + '~' + md(b.period.to) + ' 사용분' + (b.open ? ' (아직 쓰는 중)' : '') + (c.payAccount ? ' · ' + u.esc(c.payAccount) : '') + '</small>'
          + (b.inst ? '<small>일시불 ' + u.n0(b.spend) + '원 + 할부 ' + u.n0(b.inst) + '원</small>' : '')
          + (prev.total || prevPaid ? '<small>지난달(' + md(prev.payDate) + ') ' + u.n0(prevPaid && prevPaid.amount ? prevPaid.amount : prev.total) + '원 · ' + (prevPaid ? '<span class="text-accent">냄' + (prevPaid.by === 'auto' ? ' (계좌 내역 확인)' : '') + '</span>' : '<span class="text-amber-700">낸 기록 없음</span> <button onclick="App.cards.markPaid(' + c.id + ',\'' + prevP + '\',true)" class="more">낸 걸로 표시</button>') + '</small>' : '')
          + '</div><div class="text-right shrink-0"><div class="v">' + (b.open ? '약 ' : '') + u.n0(b.total) + '원</div><div class="mt-1">' + pill + '</div>'
          + (b.paid ? (b.paid.by === 'mark' ? '<button onclick="App.cards.markPaid(' + c.id + ',\'' + b.P + '\',false)" class="text-[12px] text-slate-400 mt-1">표시 취소</button>' : '') : '<button onclick="App.cards.markPaid(' + c.id + ',\'' + b.P + '\',true)" class="text-[13px] font-semibold text-accent mt-1">낸 걸로 표시</button>') + '</div></div>';
      }).join('')
      + '<p class="text-[13px] text-slate-500 mt-3 leading-relaxed">금액은 지금까지 기록한 내역 기준이에요. 은행 내역을 넣으면 카드값이 나간 것을 찾아 자동으로 "냈어요"가 돼요.' + (noDay.length ? ' 결제일이 없는 카드: ' + noDay.map(function (c) { return '<button onclick="App.cards.open(' + c.id + ')" class="more">' + u.esc(c.name) + '</button>'; }).join(' ') : '') + '</p></div>';
  }

  App.views.add({
    id: 'cards', order: 30, title: '카드', nav: { label: '카드', icon: 'fa-credit-card' },
    render: function (el) {
      var mo = App.state.month;
      var grid = db().cards.length ? db().cards.map(function (card) {
        var spent = spentOf(card, mo), rate = card.targetAmount > 0 ? Math.min(Math.round(spent / card.targetAmount * 100), 100) : 0;
        return '<div class="bg-slate-50 rounded-2xl p-4 space-y-3"><div class="flex justify-between items-start gap-2"><div class="min-w-0"><div class="text-[13px] text-slate-500">' + u.esc(card.owner || '') + ' · ' + u.esc(card.type) + (C.isCredit(card) ? ' · 매달 ' + card.payDay + '일 결제' : '') + '</div>'
          + '<h4 class="font-bold text-slate-900 text-[15px] truncate">' + u.esc(card.name) + '</h4></div>'
          + '<div class="shrink-0"><button onclick="App.cards.open(' + card.id + ')" class="fx-ic" aria-label="고치기"><i class="fa-solid fa-pen"></i></button><button onclick="App.cards.remove(' + card.id + ')" class="fx-ic" aria-label="삭제"><i class="fa-solid fa-trash-can"></i></button></div></div>'
          + '<div><div class="flex justify-between text-[13px]"><span class="text-slate-500">' + (+mo.slice(5)) + '월 사용</span><span class="font-semibold text-slate-900">' + u.n0(spent) + '원' + (card.targetAmount ? ' <span class="text-slate-400 font-normal">/ 실적 ' + u.n0(card.targetAmount) + '원</span>' : '') + '</span></div>'
          + (card.targetAmount ? '<div class="track mt-1.5" style="height:6px"><div class="fill" style="width:' + rate + '%;background:' + (rate >= 100 ? '#0B7A57' : '#E8A10A') + '"></div></div>' : '') + '</div>'
          + (card.benefits ? '<div class="text-[13px] text-slate-500 truncate">혜택: ' + u.esc(card.benefits) + '</div>' : '') + '</div>';
      }).join('') : '<div class="md:col-span-3 empty">등록된 카드가 없어요.</div>';
      el.innerHTML = billsHtml()
        + '<div class="card"><div class="card-h"><h3>내 카드</h3><button onclick="App.cards.open()" class="btn sec" style="height:38px">+ 카드 등록</button></div>'
        + '<div class="grid grid-cols-1 md:grid-cols-3 gap-3">' + grid + '</div></div>'
        + '<div class="card space-y-4">' + optimizerHtml() + '</div>';
    }
  });
})(window.App);

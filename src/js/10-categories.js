/* 카테고리 : 가맹점 → 분류 추론 · 키워드 규칙 재분류 · 카테고리 추가/수정/삭제 */
(function (App) {
  'use strict';
  var u = App.u, cat = App.cat = {};
  var db = function () { return App.db; };

  cat.exists = function (name) { return (db().categories || []).some(function (c) { return c.name === name; }); };
  cat.subExists = function (c, s) {
    var x = (db().categories || []).filter(function (k) { return k.name === c; })[0];
    return !!x && (x.subcategories || []).some(function (k) { return k.name === s; });
  };
  function pick(c, s) {
    var x = (db().categories || []).filter(function (k) { return k.name === c; })[0]; if (!x) return null;
    var sub = (x.subcategories || []).filter(function (k) { return k.name === s; })[0];
    return { category: x.name, subcategory: sub ? sub.name : (x.subcategories[0] ? x.subcategories[0].name : '기타') };
  }

  /* ---------- 분류 추론 : 가장 긴 키워드 우선 → 업종 끝말 규칙 ---------- */
  var SUFFIX_EXCEPT = ['하이마트', '전자랜드', '마트몰'];
  var SUFFIX_RULES = [
    { re: /(의원|병원|치과|한의원|내과|정형외과|피부과|안과)$/, cat: '건강/의료', sub: '병원/의원' },
    { re: /약국$/, cat: '건강/의료', sub: '약국' },
    { re: /(주유소|충전소)$/, cat: '교통/차량', sub: '주유/충전' },
    { re: /(미용실|헤어|바버샵)$/, cat: '쇼핑/생활용품', sub: '뷰티/미용' },
    { re: /(마트|슈퍼|청과|정육점|수산)$/, cat: '식비', sub: '식자재/장보기' },
    { re: /(학원|어학원)$/, cat: '교육/자기계발', sub: '학원/강의' },
    { re: /(편의점|CU|GS25|세븐일레븐)$/, cat: '식비', sub: '식자재/장보기' }
  ];
  cat.predict = function (merchant) {
    var fallback = pick('기타지출', '기타') || { category: '기타지출', subcategory: '기타' };
    if (!merchant) return fallback;
    var m = String(merchant).trim(), norm = m.replace(/\s+/g, '').toLowerCase(), bestLen = 0, best = null;
    (db().categories || []).forEach(function (c) {
      (c.subcategories || []).forEach(function (s) {
        (s.keywords || []).forEach(function (kw) {
          if (!kw) return;
          var k = String(kw).replace(/\s+/g, '').toLowerCase();
          if (k.length >= 2 && norm.indexOf(k) >= 0 && k.length > bestLen) { bestLen = k.length; best = { category: c.name, subcategory: s.name }; }
        });
      });
    });
    if (best) return best;
    for (var i = 0; i < SUFFIX_EXCEPT.length; i++) if (norm.indexOf(SUFFIX_EXCEPT[i].toLowerCase()) >= 0) return fallback;
    var clean = m.replace(/\s*(점|지점|본점|\d+호점)$/, '').replace(/\s+/g, '');
    for (var j = 0; j < SUFFIX_RULES.length; j++) {
      if (SUFFIX_RULES[j].re.test(clean)) { var r = pick(SUFFIX_RULES[j].cat, SUFFIX_RULES[j].sub); if (r) return r; }
    }
    return fallback;
  };

  /* ---------- 재분류 계획 ---------- */
  function isProtected(t) { var m = String(t.memo || ''); return !!t.installmentId || m.indexOf('[고정비]') === 0 || m.indexOf('[할부') === 0; }
  cat.buildPlan = function (scope, includeLocked) {
    var m = App.state.month, plan = [];
    (db().transactions || []).forEach(function (t) {
      if (t.type !== 'EXPENSE') return;
      if (scope === 'MONTH' && String(t.date).indexOf(m) !== 0) return;
      if (isProtected(t) || (t.lockCategory && !includeLocked)) return;
      var p = cat.predict(t.memo || ''), noMatch = p.category === '기타지출' && p.subcategory === '기타';
      var orphan = !cat.exists(t.category) || !cat.subExists(t.category, t.subcategory);
      if (noMatch && !orphan) return;   /* 규칙이 없고 기존 분류가 유효하면 건드리지 않는다 */
      if (p.category === t.category && p.subcategory === (t.subcategory || '')) return;
      plan.push({ id: t.id, date: t.date, memo: t.memo || '-', amount: t.amount, fromCat: t.category, fromSub: t.subcategory || '-', toCat: p.category, toSub: p.subcategory, orphan: orphan, locked: !!t.lockCategory });
    });
    return plan;
  };
  var lastSnapshot = null;
  cat.hasSnapshot = function () { return !!(lastSnapshot && lastSnapshot.length); };
  /* 자동 재분류 (확인 없이) : 저장은 부르는 쪽이 한다 */
  cat.silentReclassify = function () {
    var plan = cat.buildPlan('ALL', false); if (!plan.length) return 0;
    var snap = [];
    plan.forEach(function (p) {
      var t = u.byId(db().transactions, p.id); if (!t) return;
      snap.push({ id: t.id, category: t.category, subcategory: t.subcategory, lockCategory: t.lockCategory });
      t.category = p.toCat; t.subcategory = p.toSub;
    });
    lastSnapshot = snap;
    return plan.length;
  };

  /* ---------- 재분류 모달 ---------- */
  function modal() {
    return u.modal('reclass-modal', ''
      + '<div class="flex items-center justify-between pb-3 border-b border-slate-100"><div><h3 class="font-bold text-slate-800">카테고리 규칙 재적용 (일괄 재분류)</h3>'
      + '<p class="text-[11px] text-slate-400 mt-0.5">수정한 키워드 규칙으로 기존 내역을 다시 분류합니다. 적용 전 변경 내용을 확인하세요.</p></div>'
      + '<button onclick="App.u.close(\'reclass-modal\')" class="text-slate-400 hover:text-slate-700"><i class="fa-solid fa-xmark"></i></button></div>'
      + '<div class="flex items-center gap-3 flex-wrap"><select id="reclass-scope" onchange="App.cat.renderPlan()" class="border border-slate-300 rounded-lg p-2 text-xs bg-white"><option value="MONTH">이번 달 내역만</option><option value="ALL">전체 기간</option></select>'
      + '<label class="flex items-center gap-1.5 text-xs text-slate-600"><input type="checkbox" id="reclass-locked" onchange="App.cat.renderPlan()" class="accent-emerald-600"> 직접 수정한 내역도 포함</label>'
      + '<span class="text-xs text-slate-500 ml-auto">변경 대상 <strong id="reclass-count" class="text-slate-800">0</strong> 건</span></div>'
      + '<div id="reclass-body" class="text-xs max-h-[50vh] overflow-y-auto"></div>'
      + '<div class="flex justify-between items-center pt-2 border-t border-slate-100"><button onclick="App.cat.toggleAll()" class="text-xs text-slate-500 hover:text-slate-800 underline">전체 선택 / 해제</button>'
      + '<div class="flex gap-2"><button onclick="App.u.close(\'reclass-modal\')" class="px-3 py-1.5 bg-slate-100 text-xs rounded-lg">취소</button><button onclick="App.cat.applyPlan()" class="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg">선택 항목 적용</button></div></div>', 820);
  }
  cat.openReclass = function (scope) {
    modal();
    u.$('reclass-scope').value = scope || 'MONTH'; u.$('reclass-locked').checked = false;
    cat.renderPlan(); u.open('reclass-modal');
  };
  cat.renderPlan = function () {
    var plan = cat.buildPlan(u.val('reclass-scope'), u.$('reclass-locked').checked), body = u.$('reclass-body');
    u.$('reclass-count').innerText = plan.length;
    if (!plan.length) { body.innerHTML = '<div class="py-10 text-center text-slate-400">현재 키워드 규칙과 모든 내역의 분류가 일치합니다. 변경할 항목이 없습니다.</div>'; return; }
    body.innerHTML = '<table class="w-full"><thead><tr class="bg-slate-50 text-slate-500 text-[11px]"><th class="p-2 w-8"></th><th class="p-2 text-left">날짜</th><th class="p-2 text-left">내용</th><th class="p-2 text-right">금액</th><th class="p-2 text-left">현재 분류</th><th class="p-2 text-left">변경 후</th></tr></thead><tbody>'
      + plan.map(function (p) {
        return '<tr class="border-b border-slate-100 hover:bg-slate-50"><td class="p-2 text-center"><input type="checkbox" class="reclass-cb accent-emerald-600" data-id="' + p.id + '" data-cat="' + u.esc(p.toCat) + '" data-sub="' + u.esc(p.toSub) + '" checked></td>'
          + '<td class="p-2 font-mono text-slate-500">' + u.esc(p.date) + '</td><td class="p-2 text-slate-700">' + u.esc(p.memo)
          + (p.locked ? ' <i class="fa-solid fa-lock text-[9px] text-amber-500" title="직접 수정한 내역"></i>' : '') + (p.orphan ? ' <span class="text-[9px] text-red-500">(분류 없음)</span>' : '') + '</td>'
          + '<td class="p-2 text-right font-semibold">' + u.K(p.amount) + '</td><td class="p-2 text-slate-400">' + u.esc(p.fromCat) + ' › ' + u.esc(p.fromSub) + '</td>'
          + '<td class="p-2 font-bold text-emerald-700">' + u.esc(p.toCat) + ' › ' + u.esc(p.toSub) + '</td></tr>';
      }).join('') + '</tbody></table>';
  };
  cat.toggleAll = function () {
    var cbs = u.qa('.reclass-cb'), allOn = cbs.every(function (c) { return c.checked; });
    cbs.forEach(function (c) { c.checked = !allOn; });
  };
  cat.applyPlan = function () {
    var cbs = u.qa('.reclass-cb:checked');
    if (!cbs.length) { u.toast('적용할 항목을 선택해주세요.', 'warning'); return; }
    var snap = [];
    cbs.forEach(function (cb) {
      var t = u.byId(db().transactions, cb.getAttribute('data-id')); if (!t) return;
      snap.push({ id: t.id, category: t.category, subcategory: t.subcategory, lockCategory: t.lockCategory });
      t.category = cb.getAttribute('data-cat'); t.subcategory = cb.getAttribute('data-sub'); t.lockCategory = false;
    });
    lastSnapshot = snap;
    App.store.save(); u.close('reclass-modal');
    u.toast(snap.length + '건이 재분류되었습니다. 되돌리려면 내역 화면의 되돌리기 버튼을 누르세요.');
  };
  cat.undo = function () {
    if (!cat.hasSnapshot()) { u.toast('되돌릴 재분류 기록이 없습니다.', 'warning'); return; }
    lastSnapshot.forEach(function (s) { var t = u.byId(db().transactions, s.id); if (t) { t.category = s.category; t.subcategory = s.subcategory; t.lockCategory = s.lockCategory; } });
    var n = lastSnapshot.length; lastSnapshot = null;
    App.store.save(); u.toast(n + '건의 재분류를 되돌렸습니다.');
  };
  cat.setAuto = function (on) {
    db().ui.autoReclassify = !!on;
    if (on) { var n = cat.silentReclassify(); u.toast('자동 재분류 ON · 즉시 ' + n + '건 반영'); }
    else u.toast('자동 재분류를 껐습니다.');
    App.store.save();
  };
  cat.toggleLock = function (id) {
    var t = u.byId(db().transactions, id); if (!t) return;
    t.lockCategory = !t.lockCategory; App.store.save();
    u.toast(t.lockCategory ? '이 내역의 분류를 고정했습니다. 재분류 대상에서 제외됩니다.' : '분류 고정을 해제했습니다.');
  };

  /* ---------- 카테고리 추가 · 수정 ---------- */
  function catModal() {
    return u.modal('category-modal', u.modalHead('cat-modal-title', '카테고리 및 소분류/키워드 설정', 'category-modal')
      + '<form onsubmit="App.cat.save(event)" class="space-y-3"><input type="hidden" id="cat-edit-index" value="-1">'
      + '<div class="grid grid-cols-3 gap-3"><div class="col-span-2"><label class="block text-xs font-semibold text-slate-600 mb-1">대분류명</label><input type="text" id="cat-name-input" required class="' + u.IN + ' font-bold"></div>'
      + '<div><label class="block text-xs font-semibold text-slate-600 mb-1">대표 색상</label><input type="color" id="cat-color-input" value="#2E6F40" class="w-full h-9 rounded-lg border border-slate-300 cursor-pointer p-0.5"></div></div>'
      + '<div><label class="block text-xs font-semibold text-slate-600 mb-1">소분류 및 자동 추론 키워드</label>'
      + '<p class="text-[11px] text-slate-400 mb-1.5 leading-relaxed">• 한 줄에 소분류 하나 · 형식 <code>소분류명: 키워드1, 키워드2</code></p>'
      + '<textarea id="cat-subcategories-input" rows="7" placeholder="외식/배달: 배달의민족, 요기요, 쿠팡이츠, 식당" class="w-full border border-slate-300 rounded-lg p-3 text-xs font-mono"></textarea></div>'
      + '<div class="pt-2 flex justify-end gap-2"><button type="button" onclick="App.u.close(\'category-modal\')" class="px-4 py-2 bg-slate-100 text-slate-600 rounded-lg text-xs">취소</button>'
      + '<button type="submit" class="px-4 py-2 bg-accent text-white rounded-lg text-xs font-semibold">저장하기</button></div></form>', 520);
  }
  cat.open = function (idx) {
    catModal(); idx = idx == null ? -1 : idx;
    u.$('cat-edit-index').value = idx;
    var c = idx >= 0 ? db().categories[idx] : null;
    u.$('cat-modal-title').innerText = c ? '카테고리 및 자동 추론 키워드 수정' : '카테고리 신규 추가';
    u.$('cat-name-input').value = c ? c.name : '';
    u.$('cat-color-input').value = c ? c.color : '#2E6F40';
    u.$('cat-subcategories-input').value = c ? (c.subcategories || []).map(function (s) { var k = (s.keywords || []).join(', '); return k ? s.name + ': ' + k : s.name; }).join('\n') : '';
    u.open('category-modal');
  };
  function renameBudgetKey(o, n) {
    var b = db().budgets || (db().budgets = {});
    if (Object.prototype.hasOwnProperty.call(b, o)) { b[n] = b[o]; delete b[o]; }
    Object.keys(db().budgetsByMonth || {}).forEach(function (m) { var ov = db().budgetsByMonth[m]; if (ov && Object.prototype.hasOwnProperty.call(ov, o)) { ov[n] = ov[o]; delete ov[o]; } });
  }
  function dropBudgetKey(k) {
    if (db().budgets) delete db().budgets[k];
    Object.keys(db().budgetsByMonth || {}).forEach(function (m) { var ov = db().budgetsByMonth[m]; if (ov) delete ov[k]; if (ov && !Object.keys(ov).length) delete db().budgetsByMonth[m]; });
  }
  cat.save = function (e) {
    e.preventDefault();
    var idx = parseInt(u.val('cat-edit-index'), 10), name = u.val('cat-name-input').trim(), color = u.val('cat-color-input');
    if (!name) { u.toast('카테고리명을 입력해주세요.', 'warning'); return; }
    var subs = u.val('cat-subcategories-input').split('\n').map(function (l) { return l.trim(); }).filter(Boolean).map(function (line) {
      var sub = line, kw = [];
      var sep = line.indexOf(':') >= 0 ? ':' : (line.indexOf(';') >= 0 ? ';' : null);
      if (sep) { var a = line.split(sep); sub = a[0].trim(); kw = a.slice(1).join(sep).split(',').map(function (k) { return k.trim(); }).filter(Boolean); }
      else kw = [sub];
      if (kw.indexOf(sub) === -1) kw.unshift(sub);
      return { name: sub, keywords: kw };
    });
    if (!subs.length) subs = [{ name: '기타', keywords: ['기타'] }];
    var moved = 0;
    if (idx !== -1) {
      var old = db().categories[idx], oldName = old.name, oldSubs = (old.subcategories || []).map(function (s) { return s.name; }), newSubs = subs.map(function (s) { return s.name; });
      db().categories[idx] = { name: name, color: color, subcategories: subs };
      if (oldName !== name) {
        db().transactions.forEach(function (t) { if (t.category === oldName) { t.category = name; moved++; } });
        (db().installments || []).forEach(function (i) { if (i.category === oldName) i.category = name; });
        renameBudgetKey(oldName, name);
      }
      if (oldSubs.length === newSubs.length) {
        var map = {}; oldSubs.forEach(function (o, k) { if (o !== newSubs[k]) map[o] = newSubs[k]; });
        db().transactions.forEach(function (t) { if (t.category === name && map[t.subcategory]) { t.subcategory = map[t.subcategory]; moved++; } });
      } else {
        db().transactions.forEach(function (t) { if (t.category === name && t.subcategory && newSubs.indexOf(t.subcategory) === -1) { t.subcategory = newSubs[0]; moved++; } });
      }
    } else {
      db().categories.push({ name: name, color: color, subcategories: subs });
      if (!(name in db().budgets)) db().budgets[name] = 0;
    }
    App.store.save(); u.close('category-modal');
    u.toast('카테고리가 저장되었습니다.' + (moved ? ' 기존 내역 ' + moved + '건의 분류명을 함께 변경했습니다.' : ''));
    var plan = cat.buildPlan('ALL', false);
    if (plan.length) u.confirm('기존 내역 재분류', '수정한 키워드 규칙과 다르게 분류된 내역이 ' + plan.length + '건 있습니다. 지금 확인하고 일괄 재분류하시겠습니까?', function () { cat.openReclass('ALL'); });
  };
  cat.remove = function (idx) {
    var c = db().categories[idx]; if (!c) return;
    var used = db().transactions.filter(function (t) { return t.category === c.name; }).length;
    u.confirm('카테고리 삭제', '[' + c.name + '] 카테고리를 삭제합니다.' + (used ? ' 이 분류를 쓰는 내역 ' + used + '건은 [기타지출 › 기타]로 이동됩니다.' : ''), function () {
      db().transactions.forEach(function (t) { if (t.category === c.name) { t.category = '기타지출'; t.subcategory = '기타'; t.lockCategory = false; } });
      db().categories.splice(idx, 1); dropBudgetKey(c.name);
      if (!cat.exists('기타지출')) db().categories.push({ name: '기타지출', color: '#64748B', subcategories: [{ name: '기타', keywords: [] }] });
      App.store.save(); u.toast('카테고리가 삭제되고 관련 내역이 안전하게 이동되었습니다.');
    });
  };

  /* 설정 화면용 카테고리 카드 목록 */
  cat.listHtml = function () {
    return db().categories.map(function (c, idx) {
      var subs = (c.subcategories || []).length ? c.subcategories.map(function (s) {
        return '<div class="mt-1"><strong class="text-slate-700">' + u.esc(s.name) + '</strong>: <span class="text-slate-500">' + ((s.keywords || []).length ? u.esc(s.keywords.join(', ')) : '키워드 없음') + '</span></div>';
      }).join('') : '<span class="text-slate-400">소분류 미지정</span>';
      return '<div class="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2"><div class="flex justify-between items-center">'
        + '<span class="font-bold text-slate-800 text-xs flex items-center gap-2"><span class="w-3.5 h-3.5 rounded-full" style="background-color:' + u.esc(c.color) + '"></span> ' + u.esc(c.name) + '</span>'
        + '<div class="space-x-1"><button onclick="App.cat.open(' + idx + ')" class="text-xs bg-white border border-slate-200 px-2.5 py-1 rounded-lg text-slate-600 hover:text-accent font-semibold shadow-sm">수정</button>'
        + (idx >= 9 ? '<button onclick="App.cat.remove(' + idx + ')" class="text-xs bg-white border border-slate-200 px-2.5 py-1 rounded-lg text-red-500 font-semibold shadow-sm">삭제</button>' : '') + '</div></div>'
        + '<div class="text-[11px] bg-white p-2.5 rounded-lg border border-slate-200/70 leading-relaxed">' + subs + '</div></div>';
    }).join('');
  };
})(window.App);

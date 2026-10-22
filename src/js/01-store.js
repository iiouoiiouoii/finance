/* 데이터 저장소 : 불러오기 · 정리(마이그레이션) · 저장 · 이벤트
   - 저장 키와 데이터 구조는 v14~v28 과 같다 (기존 기기·GitHub 동기화 파일을 그대로 쓴다).
   - 화면은 저장소를 직접 고치지 않고, 고친 뒤 App.store.save() 를 부른다.
     save() 는 localStorage 에 쓰고 'saved' 이벤트를 알린다 → 화면 다시 그리기 · 동기화 예약. */
(function (App) {
  'use strict';
  var u = App.u, KEY = 'FINANCIAL_CORE_DB';
  var store = App.store = {};

  /* ---------- 이벤트 ---------- */
  var handlers = {};
  App.on = function (name, fn) { (handlers[name] = handlers[name] || []).push(fn); };
  App.emit = function (name, data) { (handlers[name] || []).forEach(function (fn) { try { fn(data); } catch (e) { console.error('[이벤트 ' + name + ']', e); } }); };

  /* ---------- 기본 카테고리 ---------- */
  var CATEGORIES = [
        {
            name: '식비',
            color: '#E11D48',
            subcategories: [
                { name: '외식/배달', keywords: ['배달의민족', '요기요', '쿠팡이츠', '식당', '맛집', '맥도날드', '버거킹', '치킨', '피자', '중화요리', '삼겹살'] },
                { name: '카페/간식', keywords: ['스타벅스', '투썸', '메가커피', '컴포즈', '파리바게뜨', '뚜레쥬르', '공차', '설빙', '카페', '베이커리'] },
                { name: '식자재/장보기', keywords: ['이마트', '홈플러스', '롯데마트', '농협하나로', '컬리', '마켓컬리', '정육점', '청과', '마트', '슈퍼'] }
            ]
        },
        {
            name: '교통/차량',
            color: '#2563EB',
            subcategories: [
                { name: '대중교통', keywords: ['지하철', '버스', '티머니', '코레일', 'SRT', '고속버스'] },
                { name: '주유/충전', keywords: ['GS칼텍스', 'SK에너지', 'S-OIL', '현대오일뱅크', '알뜰주유소', '전기차충전'] },
                { name: '택시/대리', keywords: ['카카오T', 'UT', '우티', '타다', '택시', '대리운전'] },
                { name: '차량정비/통행료', keywords: ['하이패스', '카포스', '블루핸즈', '오토큐', '세차', '주차장'] }
            ]
        },
        {
            name: '주거/통신',
            color: '#D97706',
            subcategories: [
                { name: '월세/대출이자', keywords: ['월세', '주택담보대출', '전세자금대출', '대출이자'] },
                { name: '아파트관리비/공과금', keywords: ['관리비', '전기요금', '수도요금', '도시가스', '난방비'] },
                { name: '통신비/인터넷', keywords: ['SKT', 'KT', 'LGU+', '알뜰폰', '인터넷', '통신'] }
            ]
        },
        {
            name: '쇼핑/생활용품',
            color: '#8B5CF6',
            subcategories: [
                { name: '온라인쇼핑', keywords: ['쿠팡', '네이버페이', '11번가', 'G마켓', '옥션', 'SSG'] },
                { name: '의류/잡화', keywords: ['무신사', '유니클로', '자라', 'ZARA', '백화점', '아울렛', '신발', '옷'] },
                { name: '생활/잡화', keywords: ['다이소', '이케아', '모던하우스', '생활용품'] },
                { name: '뷰티/미용', keywords: ['올리브영', '헤어', '미용실', '바버샵', '화장품'] }
            ]
        },
        {
            name: '취미/여가/문화',
            color: '#06B6D4',
            subcategories: [
                { name: '영화/공연', keywords: ['CGV', '롯데시네마', '메가박스', '티켓링크', '인터파크티켓'] },
                { name: 'OTT/구독', keywords: ['넷플릭스', '유튜브', '왓챠', '디즈니', '티빙', '밀리의서재', '스포티파이'] },
                { name: '운동/레저', keywords: ['헬스', '피트니스', '골프', '수영', '필라테스', '요가', '테니스'] },
                { name: '여행/숙박', keywords: ['야놀자', '여기어때', '에어비앤비', '호텔', '리조트', '항공권'] }
            ]
        },
        {
            name: '건강/의료',
            color: '#10B981',
            subcategories: [
                { name: '병원/의원', keywords: ['병원', '의원', '내과', '치과', '안과', '정형외과', '피부과', '한의원'] },
                { name: '약국', keywords: ['약국', '온누리약국'] },
                { name: '건강식품', keywords: ['정관장', '비타민', '유산균', '건강기능식품'] }
            ]
        },
        {
            name: '경조사/선물',
            color: '#F43F5E',
            subcategories: [
                { name: '축의금/조의금', keywords: ['축의금', '조의금', '부의금', '화환'] },
                { name: '용돈/선물', keywords: ['용돈', '카카오선물', '선물하기', '상품권'] }
            ]
        },
        {
            name: '교육/자기계발',
            color: '#6366F1',
            subcategories: [
                { name: '학원/강의', keywords: ['학원', '클래스101', '패스트캠퍼스', '인강', '학습지'] },
                { name: '도서/교재', keywords: ['교보문고', '예스24', '알라딘', '영풍문고', '서점'] },
                { name: '자격증/시험', keywords: ['토익', '검정회', '응시료', '자격증'] }
            ]
        },
        {
            name: '금융/보험/세금',
            color: '#0284C7',
            subcategories: [
                { name: '보장성 보험료', keywords: ['실손보험', '암보험', '자동차보험', '생명보험', '삼성화재', 'DB손해보험'] },
                { name: '세금/공과세', keywords: ['재산세', '자동차세', '주민세', '국세', '지방세', '위택스'] }
            ]
        },
        {
            name: '기타지출',
            color: '#64748B',
            subcategories: [
                { name: '기타', keywords: [] }
            ]
        }
  ];
  store.defaultCategories = function () { return JSON.parse(JSON.stringify(CATEGORIES)); };

  function emptyData() {
    return {
      settings: { goalText: '부부 자산 관리 가계부', targetNetWorth: 0, husbandName: '남편', husbandIncome: 0, husbandAnnual: 0, husbandPayday: 25, wifeName: '아내', wifeIncome: 0, wifeAnnual: 0, wifePayday: 10 },
      categories: store.defaultCategories(),
      transactions: [], fixedExpenses: [], installments: [], realEstates: [], assets: [], liabilities: [], investments: [],
      budgets: { '식비': 0, '교통/차량': 0, '주거/통신': 0, '쇼핑/생활용품': 0, '취미/여가/문화': 0, '건강/의료': 0, '경조사/선물': 0, '교육/자기계발': 0, '금융/보험/세금': 0, '기타지출': 0 },
      cards: []
    };
  }
  function sampleData() {
    var m = u.nowM();
    return {
      settings: { goalText: '부부 공동 알뜰 가계부', targetNetWorth: 1000000000, husbandName: '남편 (철수)', husbandIncome: 4500000, husbandAnnual: 54000000, husbandPayday: 25, wifeName: '아내 (영희)', wifeIncome: 3800000, wifeAnnual: 45000000, wifePayday: 10 },
      categories: store.defaultCategories(),
      transactions: [
        { id: 1, date: m + '-01', type: 'INCOME', category: '급여', subcategory: '급여/상여', payment: '계좌이체', amount: 4500000, memo: '남편 급여' },
        { id: 2, date: m + '-10', type: 'INCOME', category: '급여', subcategory: '급여/상여', payment: '계좌이체', amount: 3800000, memo: '아내 급여' },
        { id: 3, date: m + '-02', type: 'EXPENSE', category: '식비', subcategory: '식자재/장보기', payment: 'KB국민 톡톡 M (남편)', amount: 125000, memo: '이마트 해운대점' },
        { id: 4, date: m + '-03', type: 'EXPENSE', category: '교통/차량', subcategory: '주유/충전', payment: 'KB국민 톡톡 M (남편)', amount: 85000, memo: 'GS칼텍스' },
        { id: 5, date: m + '-05', type: 'EXPENSE', category: '주거/통신', subcategory: '월세/대출이자', payment: '계좌이체', amount: 650000, memo: '[고정비] 월세' },
        { id: 6, date: m + '-07', type: 'EXPENSE', category: '식비', subcategory: '외식/배달', payment: '신한 Deep Dream (아내)', amount: 68000, memo: '주말 외식' },
        { id: 7, date: m + '-08', type: 'EXPENSE', category: '쇼핑/생활용품', subcategory: '뷰티/미용', payment: '신한 Deep Dream (아내)', amount: 34000, memo: '올리브영 화장품 구매' }
      ],
      fixedExpenses: [{ id: 1, name: '월세', day: 5, amount: 650000 }, { id: 2, name: '아파트 관리비', day: 20, amount: 180000 }, { id: 3, name: '통신비 (부부 합산)', day: 15, amount: 120000 }],
      installments: [{ id: 1, title: '아이폰 15 구입', total: 1500000, months: 10, startMonth: u.addM(m, -5), apr: 0, prepayments: [], prepayMode: 'SHORTEN', closedMonth: null, payment: 'KB국민 톡톡 M (남편)', category: '쇼핑/생활용품', subcategory: '온라인쇼핑', billingDay: 15 }],
      realEstates: [{ id: 101, name: '마포 자이 아파트 34평', value: 950000000, loanId: 1 }],
      assets: [
        { id: 1, type: 'ASSET', bankName: '신한', subType: '입출금', name: '주거래 생활비 통장', amount: 15000000, rate: 0.1, months: 12 },
        { id: 2, type: 'ASSET', bankName: '토스', subType: '파킹', name: '토스 비상금 파킹통장', amount: 20000000, rate: 2.0, months: 12 },
        { id: 3, type: 'ASSET', bankName: 'KB국민', subType: '예금', name: 'KB STAR 정기예금', amount: 10000000, rate: 3.5, months: 12 },
        { id: 4, type: 'ASSET', bankName: '카카오', subType: '적금', name: '26주 자유적금', amount: 500000, rate: 4.2, months: 12 }
      ],
      liabilities: [{ id: 1, type: 'LIABILITY', name: '마포 자이 주택담보대출', amount: 350000000, rate: 3.8, debtType: 'EQUAL_PAYMENT', months: 240, realEstateId: 101 }],
      investments: [{ id: 1, name: '삼성전자', cost: 10000000, value: 12500000 }, { id: 2, name: 'TIGER 미국S&P500', cost: 20000000, value: 26000000 }],
      budgets: { '식비': 600000, '교통/차량': 250000, '주거/통신': 850000, '쇼핑/생활용품': 300000, '취미/여가/문화': 300000, '건강/의료': 150000, '경조사/선물': 100000, '교육/자기계발': 100000, '금융/보험/세금': 200000, '기타지출': 100000 },
      cards: [
        { id: 1, name: 'KB국민 톡톡 M', owner: '남편', type: '신용카드', targetAmount: 300000, benefits: '대중교통 10%, 온라인 5%' },
        { id: 2, name: '신한 Deep Dream', owner: '아내', type: '신용카드', targetAmount: 500000, benefits: '전 가맹점 0.7% 기본 적립' }
      ]
    };
  }

  /* ---------- 정리(마이그레이션) : 어떤 버전의 데이터든 지금 구조로 맞춘다 ---------- */
  var arr = function (k) { if (!Array.isArray(App.db[k])) App.db[k] = []; };
  var obj = function (k) { var v = App.db[k]; if (!v || typeof v !== 'object' || Array.isArray(v)) App.db[k] = {}; };
  store.migrate = function () {
    var db = App.db;
    if (!db.settings || typeof db.settings !== 'object') db.settings = emptyData().settings;
    ['transactions', 'fixedExpenses', 'installments', 'realEstates', 'assets', 'liabilities', 'investments', 'cards', 'goals'].forEach(arr);
    ['budgets', 'budgetsByMonth', 'weeklyChecks', 'snapshots', 'ui', 'merchantRules'].forEach(obj);
    if (!Array.isArray(db.categories) || db.categories.length < 9) db.categories = store.defaultCategories();
    if (typeof db.ui.autoReclassify !== 'boolean') db.ui.autoReclassify = false;

    /* 거래 */
    db.transactions.forEach(function (t) {
      if (typeof t.lockCategory !== 'boolean') t.lockCategory = false;
      /* 투자 거래 연동분은 소비/급여가 아닌 자산 간 이동 */
      var m = String(t.memo || '');
      if (t.investmentId && (m.indexOf('[투자매수]') === 0 || m.indexOf('[투자매도]') === 0)) {
        t.type = 'TRANSFER'; t.category = '자산이동'; t.subcategory = m.indexOf('[투자매수]') === 0 ? '투자매수' : '투자매도';
      }
    });

    /* 고정 항목 (v30) : 구분(지출/수입) · 사용자 · 결제수단 · 매달 자동 반영. 예전 항목은 공동 지출 · 계좌이체 · 수동 */
    db.fixedExpenses.forEach(function (f) {
      if (f.type !== 'INCOME') f.type = 'EXPENSE';
      if (['J', 'H', 'W'].indexOf(f.owner) < 0) f.owner = f.type === 'INCOME' ? 'H' : 'J';
      if (!f.payment) f.payment = '계좌이체';
      if (typeof f.auto !== 'boolean') f.auto = false;
      f.day = Math.min(31, Math.max(1, parseInt(f.day, 10) || 1));
      f.amount = Math.max(0, u.num(f.amount));
    });
    if (!db.ui.instAuto || typeof db.ui.instAuto !== 'object') db.ui.instAuto = { on: false };

    /* 할부 (v14) */
    db.installments.forEach(function (i) {
      if (!i.startMonth) {
        var months = Math.max(1, parseInt(i.months, 10) || 1);
        var rem = typeof i.remains === 'number' ? Math.max(0, Math.min(months, i.remains)) : months;
        i.startMonth = u.addM(App.state.month, -Math.max(0, months - rem - 1));
      }
      if (typeof i.apr !== 'number' || isNaN(i.apr)) i.apr = 0;
      if (!Array.isArray(i.prepayments)) i.prepayments = [];
      if (i.prepayMode !== 'REDUCE') i.prepayMode = 'SHORTEN';
      if (!('closedMonth' in i)) i.closedMonth = null;
      if (!i.payment) i.payment = '계좌이체';
      if (!i.category) i.category = '기타지출';
      if (!i.subcategory) i.subcategory = '기타';
      if (typeof i.billingDay !== 'number') i.billingDay = 15;
      i.months = Math.max(1, parseInt(i.months, 10) || 1);
      i.total = Math.max(0, i.total || 0);
      delete i.remains;
    });

    /* 부채 · 부동산 연동 (v17) */
    db.liabilities.forEach(function (l) {
      if (!l.createdFrom) l.createdFrom = l.realEstateId ? 'REALESTATE' : 'MANUAL';
      if (l.amount == null) l.amount = 0;
      if (l.months == null) l.months = 120;
      if (!l.debtType) l.debtType = 'EQUAL_PAYMENT';
    });
    var seen = {};
    db.realEstates.forEach(function (re) {
      var ids = Array.isArray(re.loanIds) ? re.loanIds.slice() : (re.loanId ? [re.loanId] : []);
      re.loanIds = ids.filter(function (id, i, a) {
        if (a.indexOf(id) !== i || seen[id] || !db.liabilities.some(function (l) { return l.id === id; })) return false;
        seen[id] = true; return true;
      });
      re.loanId = re.loanIds[0] || null;
      if (!re.kind) re.kind = '아파트';
      if (re.acquiredPrice === undefined) re.acquiredPrice = null;
      if (re.acquiredDate === undefined) re.acquiredDate = null;
    });
    store.syncLoanRefs();

    /* 투자 (v17) */
    db.investments.forEach(function (inv) {
      if (!inv.assetClass) inv.assetClass = '기타';
      if (!inv.currency) inv.currency = 'KRW';
      if (inv.fxRate == null) inv.fxRate = 1;
      if (!inv.inputMode) inv.inputMode = u.num(inv.qty) > 0 ? 'QTY' : 'AMOUNT';
      ['dividend', 'realized', 'fee', 'monthly'].forEach(function (k) { if (inv[k] == null) inv[k] = 0; });
      if (inv.targetWeight === undefined) inv.targetWeight = null;
      if (inv.broker == null) inv.broker = '';
      if (inv.memo == null) inv.memo = '';
      if (inv.startDate === undefined) inv.startDate = null;
      if (!Array.isArray(inv.trades)) inv.trades = [];
      if (inv.inputMode === 'QTY') {
        if (!u.num(inv.curPrice)) inv.curPrice = u.num(inv.avgPrice);
        if (inv.priceUpdatedAt === undefined) inv.priceUpdatedAt = null;
      } else {
        if (inv.costCur == null) inv.costCur = u.num(inv.cost) || u.num(inv.value);
        if (inv.valueCur == null) inv.valueCur = inv.value == null ? u.num(inv.costCur) : u.num(inv.value);
      }
      if (inv.cumCost == null) inv.cumCost = inv.inputMode === 'QTY' ? u.num(inv.qty) * u.num(inv.avgPrice) : u.num(inv.costCur);
      if (App.invest) { var d = App.invest.detail(inv); inv.cost = d.cost; inv.value = d.value; }
    });
  };

  /* 부채 → 연동 부동산 역참조 (부채.realEstateId) */
  store.syncLoanRefs = function () {
    var db = App.db;
    (db.liabilities || []).forEach(function (l) {
      var own = (db.realEstates || []).filter(function (r) { return (r.loanIds || []).indexOf(l.id) >= 0; })[0];
      l.realEstateId = own ? own.id : null;
    });
  };

  /* ---------- 불러오기 · 저장 ---------- */
  store.load = function () {
    var db = null;
    try {
      var saved = localStorage.getItem(KEY), p = saved ? JSON.parse(saved) : null;
      if (p && typeof p === 'object' && !Array.isArray(p)) db = p;
    } catch (e) { console.warn('[가계부 데이터 읽기]', e); }
    App.db = db || emptyData();
    store.migrate();
  };
  /* 저장 + 알림. opt.quiet 이면 화면 다시 그리기·동기화 예약을 하지 않는다 (렌더 중 기록용) */
  store.save = function (opt) {
    opt = opt || {};
    var badge = u.$('data-status-badge');
    try {
      localStorage.setItem(KEY, JSON.stringify(App.db));
      if (badge) { badge.textContent = '로컬 저장 완료'; badge.className = 'text-emerald-400 font-semibold'; }
    } catch (e) {
      if (badge) { badge.textContent = '저장 공간 부족'; badge.className = 'text-red-400 font-semibold'; }
      u.toast('저장에 실패했습니다. JSON 백업 후 저장 공간을 확인해 주세요.', 'warning');
      console.error('[가계부 데이터 저장]', e);
      return;
    }
    if (!opt.quiet) App.emit('saved', opt);
  };
  /* 통째로 바꾸기 (백업 복원 · 동기화 불러오기) */
  store.replace = function (data, opt) {
    App.db = data;
    store.migrate();
    store.save(opt);
  };

  store.loadSample = function () {
    u.confirm('예시 데이터 넣기', '지금 데이터가 지워지고 예시 데이터로 바뀝니다.\n필요하면 먼저 [백업 파일 받기]를 하세요.', function () {
      store.replace(sampleData()); u.toast('예시 데이터를 넣었습니다.');
    }, '예시 데이터로 바꾸기');
  };
  store.clearAll = function () {
    u.confirm('모든 데이터 지우기', '이 기기의 내역 · 자산 · 설정이 모두 지워지고 되돌릴 수 없습니다.\n필요하면 먼저 [백업 파일 받기]를 하세요.', function () {
      store.replace(emptyData()); u.toast('모든 데이터를 지웠습니다.');
    }, '모두 지우기');
  };

  /* ---------- JSON 백업 · 복원 ---------- */
  store.exportBackup = function () {
    try {
      u.download('household-backup-' + u.today() + '.json', JSON.stringify(App.db, null, 2), 'application/json');
      try { localStorage.setItem('FC_LAST_BACKUP', String(Date.now())); } catch (e) {}
      u.toast('백업 파일이 저장되었습니다.');
    } catch (e) { u.toast('백업에 실패했습니다.', 'warning'); }
  };
  store.importBackup = function (input) {
    var file = input.files && input.files[0]; if (!file) return;
    var fr = new FileReader();
    fr.onload = function () {
      try {
        var parsed = JSON.parse(fr.result);
        if (!parsed || !Array.isArray(parsed.transactions)) throw new Error('형식 오류');
        u.confirm('백업 복원', '현재 데이터를 백업 파일로 완전히 덮어씁니다. 진행하시겠습니까?', function () {
          store.replace(parsed); u.toast('백업이 복원되었습니다.');
        });
      } catch (e) { u.toast('올바른 백업 파일이 아닙니다.', 'warning'); }
      input.value = '';
    };
    fr.readAsText(file);
  };

  /* ---------- 화면 상태 ---------- */
  App.state = { month: u.nowM(), view: 'dashboard' };
})(window.App);

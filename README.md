# 부부 가계부 (Financial Core v29 재구성판)

웹에 나가는 파일은 이 저장소 맨 위의 **`index.html`** 입니다 (GitHub Pages). 직접 올릴 필요 없이 `publish.ps1` 이 빌드·커밋·푸시를 한 번에 합니다.
(간편 로그인을 쓰면 `fc-login.json`도 같은 폴더에 올립니다.)

## 폴더 구조

```
app/
├─ build.ps1            src 를 합쳐 index.html 을 만든다 (바탕화면 가계부\index.html 도 갱신)
├─ publish.ps1          빌드 → 커밋 → GitHub 푸시 한 번에
├─ index.html           ← 웹(GitHub Pages)에 나가는 결과물
├─ src/
│  ├─ index.html        화면 뼈대 (사이드바 · 헤더 · 하단 바)
│  ├─ styles.css        모바일 모드 · 인쇄 등 공통 스타일
│  └─ js/               기능별 모듈 (파일 이름 순서대로 합쳐짐)
│     ├─ 00-util.js         포맷 · 날짜 · 토스트 · 확인창 · 모달
│     ├─ 01-store.js        저장 · 불러오기 · 데이터 정리(마이그레이션) · 백업
│     ├─ 02-calc.js         계산 엔진 (명의 · 자산 · 대출 상환 · 할부 · 월별 예산 · 순자산)
│     ├─ 03-ui.js           화면 등록 · 전환 · 다시 그리기 · 헤더 · 화면 모드
│     ├─ 10-categories.js   분류 추론 · 재분류 · 카테고리 관리
│     ├─ 11-transactions.js 내역 입력 · 목록 · 일괄 편집 · CSV
│     ├─ 12-paste.js        스마트 붙여넣기 (할부 인식 · 중복 방지)
│     ├─ 13-installments.js 카드 할부
│     ├─ 14-fixed.js        고정비 화면
│     ├─ 15-cards.js        보유 카드 · 혜택 최적화
│     ├─ 16-assets.js       자산 화면 · 예적금/연금/보증금
│     ├─ 17-realestate-loans.js 부동산 · 부채
│     ├─ 18-invest.js       투자
│     ├─ 19-budget.js       예산 · 예산 알림
│     ├─ 20-dashboard.js    대시보드
│     ├─ 21-goals.js        목표 · 선저축
│     ├─ 22-retire.js       부부 은퇴 시뮬레이터
│     ├─ 23-tax.js          연말정산 · 부부 공제 배분
│     ├─ 24-weekly.js       주간 빠른 점검
│     ├─ 25-report.js       월말 한 장 리포트
│     ├─ 26-loan-advisor.js 대출 상환 판단 도우미
│     ├─ 30-settings.js     설정
│     ├─ 31-sync.js         GitHub 동기화 · 설정 코드 · 간편 로그인
│     └─ 99-boot.js         시작
└─ tools/
   ├─ serve.ps1           로컬 확인용 웹 서버
   └─ fixtures/test-db.json  검증용 테스트 데이터
```

## 고치는 방법

1. `src/` 안의 해당 기능 파일만 고칩니다. (예: 예산 알림 → `19-budget.js`)
2. 빌드합니다.
   ```
   powershell -ExecutionPolicy Bypass -File build.ps1
   ```
3. 확인합니다. `powershell -ExecutionPolicy Bypass -File tools\serve.ps1` 를 실행한 뒤 브라우저에서 `http://localhost:8765/index.html` 을 엽니다.
4. 웹에 반영합니다. `powershell -ExecutionPolicy Bypass -File publish.ps1 -Message "무엇을 바꿨는지"`

## 구조 원칙

- **데이터는 `App.db` 하나**이고, 고친 뒤에는 반드시 `App.store.save()` 를 부릅니다. 저장하면 지금 보고 있는 화면만 다시 그려지고, GitHub 동기화가 예약됩니다.
- **화면은 `App.views.add({ id, title, nav, render })` 로 등록**합니다. 다른 모듈의 함수를 덮어써서(감싸서) 기능을 붙이지 않습니다.
- **계산은 `02-calc.js`** 에 모읍니다. 화면 코드에서 같은 계산을 다시 하지 않습니다. (대출 잔액은 `C.loanState`, 그 달 예산은 `C.budgetFor`)
- 저장 형식(`FINANCIAL_CORE_DB`)과 동기화 파일·로그인 파일 형식은 v14~v28 과 같습니다. 예전 버전의 데이터·백업·동기화를 그대로 씁니다.

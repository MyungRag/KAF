# KAF

KA_기획

## KAF-001 가격 기회 탐색 프로토타입

현재 저장소는 KAF-001의 로컬 프로토타입입니다. 화면의 운임과 가격 이력은 고정된 **예시 데이터이며 실시간 항공권 가격이 아닙니다.** 외부 항공권 API 연결, 자동 가격 수집, 예약은 포함하지 않습니다.

### 실행

Node.js 20 이상 또는 Python 3가 설치된 환경에서 저장소 루트에서 실행합니다.

```sh
python3 -m http.server 4173
```

브라우저에서 `http://localhost:4173`을 엽니다. 별도 API 키나 패키지 설치는 필요하지 않습니다.

### 검사

```sh
npm test
```

Node.js 내장 테스트 러너로 검색 필터와 가격 계산을 확인합니다.

### 기준 문서

- [KAF-001 기획서](docs/KAF-001_PLAN.md)
- [KAF-001 완료 기준](docs/KAF-001_ACCEPTANCE.md)
- [KAF-003 기획서](docs/KAF-003_PLAN.md)
- [KAF-003 완료 기준](docs/KAF-003_ACCEPTANCE.md)

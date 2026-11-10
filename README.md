# KAF

KA_기획

## KAF 가격 기회 탐색 프로토타입

현재 저장소는 KAF-001과 KAF-002의 로컬 프로토타입입니다. 화면의 운임, 가격 이력, 지도상의 노선은 고정된 **예시 데이터이며 실시간 항공권 가격이나 실제 운항 현황이 아닙니다.** 외부 항공권 API 연결, 자동 가격 수집, 예약은 포함하지 않습니다.

### 실행

Python 3가 설치된 환경에서 저장소 루트에서 실행합니다.

```sh
python3 -m http.server 4173
```

브라우저에서 `http://localhost:4173`을 엽니다. 별도 API 키나 패키지 설치는 필요하지 않습니다.

인터랙티브 지도는 저장소에 포함한 Leaflet 라이브러리와 OpenStreetMap 타일을 사용합니다. 타일을 불러오려면 인터넷 연결이 필요합니다. 지도 자료의 저작자 표시는 지도 오른쪽 아래에 표시됩니다. 목적지 표식은 [OurAirports](https://ourairports.com/data/)의 공항 기준점 좌표를 사용합니다. Leaflet 라이선스는 vendor/leaflet/LICENSE에 있습니다.

지도 위에 마우스를 둔 상태에서 `Ctrl` 키와 마우스 휠을 함께 사용하면 확대·축소할 수 있습니다. `Ctrl` 없이 휠을 움직이면 페이지가 스크롤됩니다.

### 검사

```sh
npm test
```

Node.js 내장 테스트 러너로 검색 필터와 가격 계산을 확인합니다.

### 기준 문서

- [KAF-001 기획서](docs/KAF-001_PLAN.md)
- [KAF-001 완료 기준](docs/KAF-001_ACCEPTANCE.md)
- [KAF-002 기획서](docs/KAF-002_PLAN.md)
- [KAF-002 완료 기준](docs/KAF-002_ACCEPTANCE.md)

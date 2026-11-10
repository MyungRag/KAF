# KAF-004 검색 조건표 생성기

이 도구는 인천 출발 대한항공 직항 운임 시험에 필요한 날짜·목적지 조합을 CSV로 만듭니다. **실제 항공권 가격을 조회하지 않습니다.** 운임 제공 경로가 확인되기 전까지 CSV는 검색 준비표로만 사용합니다.

기본 설정에는 짧은·중간·장거리 시험용 목적지 예시로 도쿄 나리타(NRT), 싱가포르(SIN), 로스앤젤레스(LAX)가 들어 있습니다. 실제 시험 날짜에 대한항공이 해당 공항까지 직항으로 운항하는지는 예약 검색에서 확인해야 합니다.

## 실행

저장소 루트에서 PowerShell 또는 터미널을 열어 실행합니다.

```powershell
py tools/kaf004/generate_search_grid.py
```

기본 결과는 사용자 홈의 `.kaf/fare-watch/search-grid.csv`에 저장됩니다. 출발 후보를 1주일로 제한해 시험하려면:

```powershell
py tools/kaf004/generate_search_grid.py --start-date 2026-11-10 --days 7 --output "$env:USERPROFILE\Documents\kaf-pilot-week.csv"
```

CSV는 Excel에서 열 수 있으며 UTF-8 BOM을 사용합니다. `fare_total_krw`, `result_status`, `observed_at`, `source_url`은 운임 조회 기능이 연결되기 전까지 비어 있거나 `not_searched`로 남습니다. 이 값을 추정 가격으로 채우지 않습니다.

## 설정 편집

`pilot_routes.json`을 복사해 개인 설정 파일을 만든 다음 `--config`으로 전달할 수 있습니다.

- `destinations`: 시험할 IATA 공항 코드와 표시 이름
- `holidays`: `YYYY-MM-DD` 형식의 대한민국 공휴일 목록. 입력된 날짜만 연차 평일 수에서 제외합니다.
- `special_cases`: 최대 5개의 `{ "label", "departure_date", "return_date" }` 항목

특수 연휴 출발일은 오늘부터 지정한 `--days` 출발 범위 안에 있어야 합니다. 귀국일은 출발 범위 뒤일 수 있습니다.

## 생성 규칙

- 매주 금요일과 토요일 출발
- 출발 주 다음 주 토요일 또는 일요일 귀국
- 출발일 후보를 7개 배치에 나눠 순환 처리할 수 있도록 `batch_day` 제공
- 여행 중 평일에서 설정 파일에 있는 공휴일만 뺀 `leave_weekdays` 계산
- 기본 조건: 성인 1명, 일반석, 대한항공(KE), 직항, KRW

공휴일 목록을 넣지 않으면 `leave_weekdays`는 공휴일 차감 전 평일 수입니다. CSV에는 개인 운임 기록이 추가될 수 있으므로 Git에 커밋하지 마세요.

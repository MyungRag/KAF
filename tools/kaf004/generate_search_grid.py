#!/usr/bin/env python3
"""Generate KAF-004 personal fare-search conditions as a local CSV."""

from __future__ import annotations

import argparse
import csv
import json
from datetime import date, timedelta
from pathlib import Path
from typing import Any


CSV_FIELDS = [
    "search_id",
    "batch_day",
    "search_type",
    "origin_code",
    "destination_code",
    "destination_name",
    "departure_date",
    "return_date",
    "leave_weekdays",
    "holiday_dates_configured",
    "passengers",
    "cabin",
    "airline_code",
    "nonstop_only",
    "currency",
    "fare_total_krw",
    "result_status",
    "observed_at",
    "source_url",
]


def parse_iso_date(value: str, label: str) -> date:
    try:
        return date.fromisoformat(value)
    except (TypeError, ValueError) as error:
        raise ValueError(f"{label}은 YYYY-MM-DD 형식이어야 합니다: {value!r}") from error


def next_weekend_dates(departure: date) -> tuple[date, date]:
    """Return Saturday and Sunday in the calendar week after departure."""
    days_until_next_monday = 7 - departure.weekday()
    next_monday = departure + timedelta(days=days_until_next_monday)
    return next_monday + timedelta(days=5), next_monday + timedelta(days=6)


def count_leave_weekdays(departure: date, returning: date, holidays: set[date]) -> int:
    days = 0
    current = departure
    while current <= returning:
        if current.weekday() < 5 and current not in holidays:
            days += 1
        current += timedelta(days=1)
    return days


def load_config(path: Path) -> dict[str, Any]:
    try:
        config = json.loads(path.read_text(encoding="utf-8"))
    except OSError as error:
        raise ValueError(f"설정 파일을 읽지 못했습니다: {path}") from error
    except json.JSONDecodeError as error:
        raise ValueError(f"설정 파일 JSON을 해석하지 못했습니다: {path}: {error}") from error

    if not isinstance(config.get("origin_code"), str) or not config["origin_code"].strip():
        raise ValueError("설정에 origin_code가 필요합니다.")
    destinations = config.get("destinations")
    if not isinstance(destinations, list) or not destinations:
        raise ValueError("설정에 목적지 하나 이상이 필요합니다.")
    seen_codes: set[str] = set()
    for destination in destinations:
        if not isinstance(destination, dict) or not destination.get("code") or not destination.get("name"):
            raise ValueError("각 목적지에는 code와 name이 필요합니다.")
        code = str(destination["code"]).upper()
        if code in seen_codes:
            raise ValueError(f"중복된 목적지 코드입니다: {code}")
        destination["code"] = code
        seen_codes.add(code)

    special_cases = config.get("special_cases", [])
    if not isinstance(special_cases, list) or len(special_cases) > 5:
        raise ValueError("special_cases는 목록이어야 하며 최대 5개까지 입력할 수 있습니다.")
    holidays = config.get("holidays", [])
    if not isinstance(holidays, list):
        raise ValueError("holidays는 날짜 목록이어야 합니다.")
    return config


def build_rows(config: dict[str, Any], start: date, days: int, batch_count: int) -> list[dict[str, str]]:
    if days < 1:
        raise ValueError("days는 1 이상이어야 합니다.")
    if batch_count < 1:
        raise ValueError("batch_count는 1 이상이어야 합니다.")

    # `days` limits departure dates. Return dates may fall in the following week.
    horizon_end = start + timedelta(days=days)
    first_week_monday = start - timedelta(days=start.weekday())
    holidays = {parse_iso_date(value, "공휴일") for value in config.get("holidays", [])}
    pairs: dict[tuple[date, date], str] = {}

    current = start
    while current <= horizon_end:
        if current.weekday() in (4, 5):
            saturday, sunday = next_weekend_dates(current)
            for returning in (saturday, sunday):
                pairs[(current, returning)] = "standard"
        current += timedelta(days=1)

    for index, item in enumerate(config.get("special_cases", []), start=1):
        if not isinstance(item, dict):
            raise ValueError("특수 연휴 항목은 객체여야 합니다.")
        label = str(item.get("label", f"special-{index}")).strip()
        departure = parse_iso_date(item.get("departure_date"), f"특수 연휴 {label} 출발일")
        returning = parse_iso_date(item.get("return_date"), f"특수 연휴 {label} 귀국일")
        if returning <= departure:
            raise ValueError(f"특수 연휴 {label}: 귀국일은 출발일보다 늦어야 합니다.")
        if departure < start or departure > horizon_end:
            raise ValueError(f"특수 연휴 {label}: 출발일이 검색 기간 {start}~{horizon_end} 밖입니다.")
        pairs[(departure, returning)] = f"special:{label}"

    rows: list[dict[str, str]] = []
    for (departure, returning), search_type in sorted(pairs.items()):
        week_offset = ((departure - first_week_monday).days // 7)
        batch_day = week_offset % batch_count + 1
        leave_weekdays = count_leave_weekdays(departure, returning, holidays)
        for destination in config["destinations"]:
            destination_code = destination["code"]
            search_id = f"ICN-{destination_code}-{departure:%Y%m%d}-{returning:%Y%m%d}"
            rows.append({
                "search_id": search_id,
                "batch_day": str(batch_day),
                "search_type": search_type,
                "origin_code": config["origin_code"].upper(),
                "destination_code": destination_code,
                "destination_name": str(destination["name"]),
                "departure_date": departure.isoformat(),
                "return_date": returning.isoformat(),
                "leave_weekdays": str(leave_weekdays),
                "holiday_dates_configured": str(len(holidays)),
                "passengers": "1",
                "cabin": "ECONOMY",
                "airline_code": "KE",
                "nonstop_only": "true",
                "currency": "KRW",
                "fare_total_krw": "",
                "result_status": "not_searched",
                "observed_at": "",
                "source_url": "",
            })
    return rows


def main() -> int:
    parser = argparse.ArgumentParser(description="KAF-004 개인용 대한항공 검색 조건 CSV 생성")
    parser.add_argument(
        "--config",
        type=Path,
        default=Path(__file__).with_name("pilot_routes.json"),
        help="목적지·공휴일·특수 연휴 설정 JSON",
    )
    parser.add_argument("--start-date", help="검색 시작일 YYYY-MM-DD (기본: 오늘)")
    parser.add_argument("--days", type=int, default=365, help="출발 날짜 검색 범위 일수 (기본: 365)")
    parser.add_argument("--batch-count", type=int, default=7, help="주기 분할 배치 수 (기본: 7)")
    parser.add_argument(
        "--output",
        type=Path,
        default=Path.home() / ".kaf" / "fare-watch" / "search-grid.csv",
        help="출력 CSV 경로 (기본: 사용자 홈의 .kaf/fare-watch)",
    )
    args = parser.parse_args()

    try:
        start = parse_iso_date(args.start_date, "검색 시작일") if args.start_date else date.today()
        config = load_config(args.config)
        rows = build_rows(config, start, args.days, args.batch_count)
        args.output.parent.mkdir(parents=True, exist_ok=True)
        with args.output.open("w", encoding="utf-8-sig", newline="") as output_file:
            writer = csv.DictWriter(output_file, fieldnames=CSV_FIELDS)
            writer.writeheader()
            writer.writerows(rows)
    except (ValueError, OSError) as error:
        parser.error(str(error))

    standard_count = sum(row["search_type"] == "standard" for row in rows)
    special_count = len(rows) - standard_count
    print(f"검색 조건 {len(rows)}개 생성: 기본 {standard_count}개, 특수 연휴 {special_count}개")
    print(f"목적지 {len(config['destinations'])}곳 · {args.batch_count}개 배치 · 출력: {args.output}")
    if not config.get("holidays"):
        print("공휴일 목록이 비어 있어 leave_weekdays는 공휴일 차감 전 평일 수입니다.")
    print("이 파일은 검색 조건표이며 실제 운임을 조회하지 않았습니다.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

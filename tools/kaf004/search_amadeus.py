#!/usr/bin/env python3
"""Probe KE-operated nonstop fares via Amadeus without persisting price data."""

from __future__ import annotations

import argparse
import csv
import json
import os
import sys
from decimal import Decimal, InvalidOperation
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


BASE_URLS = {
    "test": "https://test.api.amadeus.com",
    "production": "https://api.amadeus.com",
}
DEFAULT_MAX_REQUESTS = 12


class ProviderError(Exception):
    """A safe-to-display provider failure."""


def request_json(url: str, *, method: str = "GET", headers: dict[str, str] | None = None,
                 body: bytes | None = None) -> dict:
    request = Request(url, data=body, headers=headers or {}, method=method)
    try:
        with urlopen(request, timeout=30) as response:
            return json.loads(response.read().decode("utf-8"))
    except HTTPError as error:
        try:
            payload = json.loads(error.read().decode("utf-8"))
            errors = payload.get("errors", [])
            details = "; ".join(
                str(item.get("detail") or item.get("title") or item.get("code"))
                for item in errors if isinstance(item, dict)
            )
            if not details:
                details = f"HTTP {error.code}"
        except (UnicodeDecodeError, json.JSONDecodeError):
            details = f"HTTP {error.code}"
        raise ProviderError(details) from None
    except URLError as error:
        raise ProviderError(f"네트워크 연결 실패: {error.reason}") from None
    except (UnicodeDecodeError, json.JSONDecodeError):
        raise ProviderError("제공자가 JSON이 아닌 응답을 반환했습니다.") from None


def fetch_access_token(base_url: str, client_id: str, client_secret: str) -> str:
    body = urlencode({
        "grant_type": "client_credentials",
        "client_id": client_id,
        "client_secret": client_secret,
    }).encode("ascii")
    payload = request_json(
        f"{base_url}/v1/security/oauth2/token",
        method="POST",
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        body=body,
    )
    token = payload.get("access_token")
    if not isinstance(token, str) or not token:
        raise ProviderError("인증 응답에 access_token이 없습니다.")
    return token


def flight_segments(offer: dict) -> list[list[dict]] | None:
    itineraries = offer.get("itineraries")
    if not isinstance(itineraries, list) or len(itineraries) != 2:
        return None
    result: list[list[dict]] = []
    for itinerary in itineraries:
        segments = itinerary.get("segments") if isinstance(itinerary, dict) else None
        if not isinstance(segments, list) or len(segments) != 1:
            return None
        segment = segments[0]
        if not isinstance(segment, dict):
            return None
        if segment.get("numberOfStops", 0) != 0:
            return None
        result.append(segments)
    return result


def is_ke_operated_nonstop(offer: dict) -> bool:
    legs = flight_segments(offer)
    if legs is None:
        return False
    for leg in legs:
        for segment in leg:
            operating = segment.get("operating")
            if not isinstance(operating, dict) or operating.get("carrierCode") != "KE":
                return False
    return True


def parse_price(offer: dict) -> Decimal | None:
    price = offer.get("price")
    if not isinstance(price, dict) or price.get("currency") != "KRW":
        return None
    try:
        return Decimal(str(price["total"]))
    except (KeyError, InvalidOperation):
        return None


def search_offer_minimum(base_url: str, token: str, row: dict[str, str]) -> tuple[str, int, str]:
    parameters = {
        "originLocationCode": row["origin_code"],
        "destinationLocationCode": row["destination_code"],
        "departureDate": row["departure_date"],
        "returnDate": row["return_date"],
        "adults": row.get("passengers", "1"),
        "travelClass": row.get("cabin", "ECONOMY"),
        "includedAirlineCodes": row.get("airline_code", "KE"),
        "nonStop": "true",
        "currencyCode": row.get("currency", "KRW"),
        "max": "50",
    }
    url = f"{base_url}/v2/shopping/flight-offers?{urlencode(parameters)}"
    payload = request_json(url, headers={"Authorization": f"Bearer {token}"})
    offers = payload.get("data", [])
    if not isinstance(offers, list):
        return "invalid_provider_response", 0, ""

    prices = [
        price for offer in offers
        if isinstance(offer, dict) and is_ke_operated_nonstop(offer)
        if (price := parse_price(offer)) is not None
    ]
    if prices:
        return "ke_operated_direct_offer", len(prices), str(min(prices))
    if offers:
        return "no_verified_ke_operated_direct_offer", 0, ""
    return "no_offer", 0, ""


def read_search_rows(path: Path, batch_day: int | None, max_requests: int) -> list[dict[str, str]]:
    try:
        with path.open("r", encoding="utf-8-sig", newline="") as input_file:
            reader = csv.DictReader(input_file)
            required = {"origin_code", "destination_code", "departure_date", "return_date"}
            missing = required - set(reader.fieldnames or [])
            if missing:
                raise ValueError(f"CSV 열이 없습니다: {', '.join(sorted(missing))}")
            rows = [row for row in reader if row.get("result_status") == "not_searched"]
    except OSError as error:
        raise ValueError(f"검색표를 읽을 수 없습니다: {path}") from error

    if batch_day is not None:
        rows = [row for row in rows if row.get("batch_day") == str(batch_day)]
    if not rows:
        raise ValueError("조회할 not_searched 조건이 없습니다.")
    if len(rows) > max_requests:
        raise ValueError(
            f"선택된 조건이 {len(rows)}개지만 이번 실행 한도는 {max_requests}개입니다. "
            "더 작은 기간의 CSV를 만들거나 --max-requests 값을 조정하세요."
        )
    return rows


def main() -> int:
    parser = argparse.ArgumentParser(
        description="CSV 검색 조건을 Amadeus Flight Offers Search로 조회하고 결과를 화면에 표시합니다."
    )
    parser.add_argument("--input", required=True, type=Path, help="generate_search_grid.py로 만든 CSV")
    parser.add_argument("--environment", choices=BASE_URLS, default="test", help="test 또는 production")
    parser.add_argument("--batch-day", type=int, choices=range(1, 8), help="7개 배치 중 조회할 번호")
    parser.add_argument("--max-requests", type=int, default=DEFAULT_MAX_REQUESTS,
                        help=f"이번 실행의 최대 검색 수 (기본: {DEFAULT_MAX_REQUESTS})")
    parser.add_argument("--confirm-production", action="store_true",
                        help="프로덕션 API 호출을 명시적으로 확인합니다. 무료 한도 초과 시 과금될 수 있습니다.")
    args = parser.parse_args()

    if args.max_requests < 1:
        parser.error("--max-requests는 1 이상이어야 합니다.")
    if args.environment == "production" and not args.confirm_production:
        parser.error("프로덕션 호출은 과금될 수 있습니다. 비용·약관을 확인한 뒤 --confirm-production을 추가하세요.")

    client_id = os.environ.get("AMADEUS_CLIENT_ID")
    client_secret = os.environ.get("AMADEUS_CLIENT_SECRET")
    if not client_id or not client_secret:
        parser.error("AMADEUS_CLIENT_ID와 AMADEUS_CLIENT_SECRET 환경 변수를 설정해야 합니다.")

    try:
        rows = read_search_rows(args.input, args.batch_day, args.max_requests)
        base_url = BASE_URLS[args.environment]
        token = fetch_access_token(base_url, client_id, client_secret)
        print(f"Amadeus {args.environment} 환경 · 조회 조건 {len(rows)}개")
        if args.environment == "test":
            print("주의: test 환경은 일부 시험 데이터이며 실시간 운임을 보장하지 않습니다.")
        print("가격은 이 실행 화면에만 표시하며 CSV나 저장소에 기록하지 않습니다.")

        for index, row in enumerate(rows, start=1):
            label = (
                f"{index}/{len(rows)} {row['origin_code']}–{row['destination_code']} "
                f"{row['departure_date']} → {row['return_date']}"
            )
            try:
                status, offer_count, fare = search_offer_minimum(base_url, token, row)
            except ProviderError as error:
                print(f"{label}: 조회 실패 ({error})")
                if "429" in str(error) or "401" in str(error) or "403" in str(error):
                    print("호출 한도 또는 권한 오류로 나머지 조회를 중단합니다.")
                    break
                continue

            if status == "ke_operated_direct_offer":
                print(f"{label}: {fare} KRW · KE 운항 직항 오퍼 {offer_count}개")
            else:
                print(f"{label}: {status}")
        print("Amadeus 가격은 대한항공 예약 화면의 최종 가격과 다를 수 있습니다. 예약 전 대한항공에서 재확인하세요.")
    except ValueError as error:
        parser.error(str(error))
    except ProviderError as error:
        print(f"Amadeus 인증 실패: {error}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

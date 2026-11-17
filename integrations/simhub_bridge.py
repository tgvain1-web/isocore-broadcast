#!/usr/bin/env python3
"""Optional local SimHub -> Isocore Broadcast telemetry bridge.
Runs next to SimHub on Windows; no OBS, capture card or Twitch publishing dependency.
Uses only Python standard library. Does not store credentials in the repository.
"""
import json
import os
import sys
import time
import urllib.request

SIMHUB_URL = os.environ.get("ISOCORE_SIMHUB_URL", "http://127.0.0.1:8888/Api/GetGameData")
WORKER_URL = os.environ.get("ISOCORE_BROADCAST_URL", "").rstrip("/")
TOKEN = os.environ.get("ISOCORE_TELEMETRY_TOKEN", "")
INTERVAL_SECONDS = 2.0


def first(data, *fields):
    for field in fields:
        value = data.get(field)
        if value is not None and value != "":
            return value
    return None


def number(value):
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def telemetry_of(raw):
    # SimHub's GetGameData generally presents normalized properties under NewData.
    # Never infer or fabricate unavailable readings.
    if not isinstance(raw, dict):
        return {"live": False}
    data = raw.get("NewData") or {}
    if not isinstance(data, dict):
        data = {}
    live = bool(raw.get("GameRunning") and data)
    fuel = number(first(data, "Fuel", "FuelLevel"))
    max_fuel = number(first(data, "MaxFuel", "FuelCapacity"))
    pct = None if fuel is None or max_fuel is None or max_fuel <= 0 else max(0, min(100, fuel / max_fuel * 100))
    return {
        "live": live,
        "game": str(first(raw, "GameName") or "")[:48],
        "speedKmh": number(first(data, "SpeedKmh", "FilteredSpeedKmh")),
        "rpm": number(first(data, "Rpms", "FilteredRpms")),
        "gear": str(first(data, "Gear") or "")[:3],
        "lap": number(first(data, "CurrentLap", "CompletedLaps")),
        "position": number(first(data, "Position", "RacePosition")),
        "fuelPercent": pct,
        "throttle": number(first(data, "Throttle")),
        "brake": number(first(data, "Brake")),
    }


def get_json(url):
    with urllib.request.urlopen(url, timeout=4) as response:
        return json.load(response)


def send(data):
    payload = json.dumps(data, separators=(",", ":")).encode("utf-8")
    req = urllib.request.Request(
        WORKER_URL + "/api/telemetry",
        data=payload,
        headers={"Authorization": "Bearer " + TOKEN, "Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=7) as response:
        return response.status


def main():
    if not WORKER_URL.startswith("https://") or len(TOKEN) < 32:
        sys.exit("Set ISOCORE_BROADCAST_URL (https Worker hostname) and ISOCORE_TELEMETRY_TOKEN (32+ private characters).")
    print("ISOCORE // SimHub bridge started. No tokens will be printed.")
    last = None
    while True:
        try:
            raw = get_json(SIMHUB_URL)
            data = telemetry_of(raw)
            status = send(data)
            marker = (data.get("live"), data.get("game"))
            if marker != last:
                print("SimHub " + ("connected" if data["live"] else "waiting for an active race") + " · Worker HTTP " + str(status))
                last = marker
        except KeyboardInterrupt:
            print("Stopped.")
            break
        except Exception as exc:
            # Keep polling; SimHub may not be running or GT7 may be at a menu.
            print("Telemetry unavailable: " + str(exc)[:120])
        time.sleep(INTERVAL_SECONDS)


if __name__ == "__main__":
    main()

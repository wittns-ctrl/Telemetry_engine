"""
Telemetry host agent.

Run this on each machine you want to monitor. On first start it asks for your
account email and password, registers the machine with the API, and stores the
returned device key in a local config file. After that it collects a hardware
snapshot every few seconds and POSTs it to /api/v1/telemetry/ingest.

    uv sync --extra agent
    uv run python -m agent.telemetry_agent --api https://api.example.com

Your password is only used for the one-time registration and is never stored.
"""

from __future__ import annotations

import argparse
import asyncio
import getpass
import json
import logging
import os
import platform
import stat
import sys
import time
import uuid
from pathlib import Path

import httpx

from app.services.sensor_service import SensorService

logger = logging.getLogger("telemetry_agent")

DEFAULT_CONFIG = Path.home() / ".telemetry_agent.json"
EXIT_AUTH = 2


def load_config(path: Path) -> dict:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return {}
    except (OSError, json.JSONDecodeError) as e:
        logger.warning(f"Ignoring unreadable config {path}: {e}")
        return {}


def save_config(path: Path, config: dict) -> None:
    path.write_text(json.dumps(config, indent=2), encoding="utf-8")
    try:
        os.chmod(path, stat.S_IRUSR | stat.S_IWUSR)  # owner read/write only (no-op on Windows ACLs)
    except OSError:
        pass


def os_description() -> str:
    return f"{platform.system()} {platform.release()} ({platform.machine()})"


async def register(client: httpx.AsyncClient, api: str, config: dict, device_name: str) -> dict:
    """Sign in once, register this machine, and return the updated config."""
    print(f"Registering this machine with {api}")
    email = input("Account email: ").strip()
    password = getpass.getpass("Password: ")

    login = await client.post(
        f"{api}/api/v1/auth/login",
        data={"username": email, "password": password},
    )
    if login.status_code != 200:
        raise SystemExit(f"Sign-in failed ({login.status_code}): {login.text}")
    access_token = login.json()["access_token"]

    system_uuid = config.get("system_uuid") or str(uuid.uuid4())
    resp = await client.post(
        f"{api}/api/v1/devices/register",
        headers={"Authorization": f"Bearer {access_token}"},
        json={"device_name": device_name, "system_uuid": system_uuid, "os_info": os_description()},
    )
    if resp.status_code != 201:
        raise SystemExit(f"Device registration failed ({resp.status_code}): {resp.text}")

    data = resp.json()
    print(f"Registered '{data['device']['device_name']}' (device id {data['device']['id']})")
    return {
        **config,
        "api": api,
        "system_uuid": system_uuid,
        "device_id": data["device"]["id"],
        "device_name": data["device"]["device_name"],
        "device_key": data["device_key"],
    }


async def run(args: argparse.Namespace) -> int:
    api = args.api.rstrip("/")
    config_path = Path(args.config).expanduser()
    config = load_config(config_path)

    async with httpx.AsyncClient(timeout=15.0) as client:
        if args.reset or not config.get("device_key") or config.get("api") != api:
            config = await register(client, api, config, args.name)
            save_config(config_path, config)
            print(f"Saved device key to {config_path}")

        headers = {"X-Device-Key": config["device_key"]}
        sensor_id = f"agent-{config['system_uuid'][:8]}"
        backoff = args.interval
        print(f"Sending telemetry every {args.interval:g}s. Press Ctrl+C to stop.")

        while True:
            started = time.monotonic()
            try:
                snapshot = await SensorService.get_current_telemetry(sensor_id=sensor_id)
                resp = await client.post(
                    f"{api}/api/v1/telemetry/ingest",
                    headers=headers,
                    json=snapshot.model_dump(mode="json"),
                )
                if resp.status_code == 401:
                    print("The device key was rejected (device deleted or re-registered elsewhere). "
                          "Run again with --reset to register this machine.", file=sys.stderr)
                    return EXIT_AUTH
                resp.raise_for_status()
                result = resp.json()
                if result.get("alerts_triggered"):
                    logger.warning(f"{result['alerts_triggered']} alert(s) triggered")
                logger.debug(f"Sent snapshot {result.get('snapshot_id')}")
                backoff = args.interval
            except httpx.HTTPError as e:
                logger.warning(f"Upload failed: {e}. Retrying in {backoff:g}s")
                await asyncio.sleep(backoff)
                backoff = min(backoff * 2, 60.0)
                continue

            if args.once:
                return 0
            await asyncio.sleep(max(0.0, args.interval - (time.monotonic() - started)))


def main() -> None:
    parser = argparse.ArgumentParser(description="Send this machine's hardware telemetry to Telemetry Engine.")
    parser.add_argument("--api", default=os.environ.get("TELEMETRY_API", "http://localhost:8000"),
                        help="API base URL (env TELEMETRY_API)")
    parser.add_argument("--interval", type=float, default=2.0, help="Seconds between snapshots (min 1)")
    parser.add_argument("--name", default=platform.node() or "My computer", help="Device name shown in the dashboard")
    parser.add_argument("--config", default=str(DEFAULT_CONFIG), help="Where the device key is stored")
    parser.add_argument("--reset", action="store_true", help="Sign in again and re-register this machine")
    parser.add_argument("--once", action="store_true", help="Send a single snapshot and exit")
    parser.add_argument("-v", "--verbose", action="store_true")
    args = parser.parse_args()
    args.interval = max(1.0, args.interval)

    logging.basicConfig(level=logging.DEBUG if args.verbose else logging.INFO,
                        format="%(asctime)s %(levelname)s %(message)s")
    try:
        sys.exit(asyncio.run(run(args)))
    except KeyboardInterrupt:
        print("\nStopped.")


if __name__ == "__main__":
    main()

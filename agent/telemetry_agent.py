"""
Telemetry host agent.

Run this on each machine you want to monitor. On first start it asks for your
account email and password, registers the machine with the API, and stores the
returned device key in a local config file. After that it collects a hardware
snapshot every few seconds and POSTs it to /api/v1/telemetry/ingest.

It also checks in for fixes chosen on the website and carries them out
(agent/fix_worker.py). Big fixes ask for "Allow" on this PC first; run with
--no-fixes to turn fixes off on this machine entirely.

    uv sync --extra agent
    uv run python -m agent.telemetry_agent --api https://api.example.com

Your password is only used for the one-time registration and is never stored.

Testers get this as one file, lectio-agent.exe (built by agent/build_exe.py).
The packaged build sends to the API URL chosen at build time instead of
localhost, and keeps its device key in the same file in your home folder.
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

# True inside the packaged lectio-agent.exe (PyInstaller sets sys.frozen).
FROZEN = getattr(sys, "frozen", False)

if FROZEN:
    # The sensor models import the server's settings, which refuse to load
    # without these. The agent never uses them; testers have no server .env.
    for _name, _value in (("MONGODB_URI", "mongodb://unused"), ("MONGO_DB", "unused"),
                          ("SECRET_KEY", "unused-by-the-agent")):
        os.environ.setdefault(_name, _value)

from agent.fix_worker import EXIT_AUTH, FixWorker  # noqa: E402
from app.services.sensor_service import SensorService  # noqa: E402

logger = logging.getLogger("telemetry_agent")

DEFAULT_CONFIG = Path.home() / ".telemetry_agent.json"
DEV_API = "http://localhost:8000"


def default_api() -> str:
    """TELEMETRY_API if set, else the URL baked in at build time, else localhost."""
    if os.environ.get("TELEMETRY_API"):
        return os.environ["TELEMETRY_API"]
    if FROZEN:
        try:
            from lectio_build_config import API_URL  # written by agent/build_exe.py
            return API_URL
        except ImportError:
            pass
    return DEV_API


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


async def register(client: httpx.AsyncClient, api: str, config: dict, device_name: str,
                   country: str | None = None) -> dict:
    """Sign in once, register this machine, and return the updated config."""
    print(f"Sign in with your Lectio account to link this PC ({api}).")
    print("Your password is only used now and is never saved.\n")
    for attempt in range(3):
        email = input("Account email: ").strip()
        if sys.stdin.isatty():
            password = getpass.getpass("Password (hidden as you type): ")
        else:  # piped in, e.g. a scripted install; getpass would wait on the console
            password = input().rstrip("\n")
        login = await client.post(
            f"{api}/api/v1/auth/login",
            data={"username": email, "password": password},
        )
        if login.status_code == 200:
            break
        if login.status_code in (400, 401, 403) and attempt < 2:
            print("That email and password didn't work. Please try again.\n")
            continue
        raise SystemExit(f"Sign-in failed ({login.status_code}): {login.text}")
    access_token = login.json()["access_token"]

    if country is None:
        country = input("Country this PC is in, for the dashboard map "
                        "(optional, press Enter to skip): ").strip() or None

    system_uuid = config.get("system_uuid") or str(uuid.uuid4())
    resp = await client.post(
        f"{api}/api/v1/devices/register",
        headers={"Authorization": f"Bearer {access_token}"},
        json={"device_name": device_name, "system_uuid": system_uuid, "os_info": os_description(),
              "country": country},
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
            if not config.get("device_key"):
                print("Welcome to Lectio. This app reads your PC's temperatures, usage and "
                      "hardware health\nand sends them to your Lectio dashboard.\n")
            config = await register(client, api, config, args.name, args.country)
            save_config(config_path, config)
            print(f"Saved device key to {config_path}")

        headers = {"X-Device-Key": config["device_key"]}
        if args.once:
            return await send_telemetry(client, api, headers, config, args)

        tasks = [asyncio.create_task(send_telemetry(client, api, headers, config, args))]
        if args.no_fixes:
            print("Fixes are turned off on this PC (--no-fixes).")
        else:
            worker = FixWorker(client, api, headers, config, lambda c: save_config(config_path, c))
            tasks.append(asyncio.create_task(worker.run()))
            print("Checking for fixes from the website. Big fixes will ask for your OK on this PC.")
        done, pending = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
        for task in pending:
            task.cancel()
        code = next(iter(done)).result()
        if code == EXIT_AUTH:
            print("The device key was rejected (device deleted or re-registered elsewhere). "
                  "Run again with --reset to register this machine.", file=sys.stderr)
        return code


async def send_telemetry(client: httpx.AsyncClient, api: str, headers: dict, config: dict,
                         args: argparse.Namespace) -> int:
    """Upload a snapshot every interval until the key is rejected."""
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
    parser = argparse.ArgumentParser(description="Send this machine's hardware telemetry to Lectio.")
    parser.add_argument("--api", default=default_api(),
                        help=f"API base URL (env TELEMETRY_API; default {default_api()})")
    parser.add_argument("--interval", type=float, default=2.0, help="Seconds between snapshots (min 1)")
    parser.add_argument("--name", default=platform.node() or "My computer", help="Device name shown in the dashboard")
    parser.add_argument("--country", default=None,
                        help="Country this machine is in, e.g. Rwanda; places it on the dashboard map "
                             "(sent when registering, so use with --reset on a registered machine)")
    parser.add_argument("--config", default=str(DEFAULT_CONFIG), help="Where the device key is stored")
    parser.add_argument("--reset", action="store_true", help="Sign in again and re-register this machine")
    parser.add_argument("--once", action="store_true", help="Send a single snapshot and exit")
    parser.add_argument("--no-fixes", action="store_true", help="Don't take fixes from the website on this PC")
    parser.add_argument("-v", "--verbose", action="store_true")
    args = parser.parse_args()
    args.interval = max(1.0, args.interval)

    logging.basicConfig(level=logging.DEBUG if args.verbose else logging.INFO,
                        format="%(asctime)s %(levelname)s %(message)s")
    code: int | str | None = 0
    try:
        code = asyncio.run(run(args))
    except KeyboardInterrupt:
        print("\nStopped.")
    except SystemExit as e:
        code = e.code
    except EOFError:
        code = "Signing in needs a keyboard: run lectio-agent in a terminal window, not with input piped in."
    except Exception:
        logger.exception("The agent stopped because of an error")
        code = 1
    if code is not None and not isinstance(code, int):
        print(code, file=sys.stderr)  # a SystemExit message such as "Sign-in failed"
        code = 1
    if code and started_by_double_click():
        # The console window closes as soon as we exit; let people read why.
        input("\nPress Enter to close this window.")
    if FROZEN:
        # Everything is saved by now. Skipping interpreter teardown avoids
        # pywin32 printing "Win32 exception occurred releasing IUnknown" for
        # WMI objects freed after COM has shut down, which only the .exe does.
        sys.stdout.flush()
        sys.stderr.flush()
        os._exit(code or 0)
    sys.exit(code)


def started_by_double_click() -> bool:
    """True for the packaged .exe opened from Explorer, so it owns its console window.

    Run from a terminal, the shell shares the console too. The onefile build
    is a bootloader process plus this one, hence at most 2.
    """
    if not FROZEN or sys.platform != "win32":
        return False
    import ctypes
    processes = (ctypes.c_uint32 * 8)()
    try:
        count = ctypes.windll.kernel32.GetConsoleProcessList(processes, 8)
    except (AttributeError, OSError):
        return False
    return 0 < count <= 2


if __name__ == "__main__":
    main()

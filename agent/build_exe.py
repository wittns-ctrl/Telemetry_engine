"""
Build the Lectio agent as one double-clickable Windows program: dist/lectio-agent.exe

    uv sync --extra agent --group build
    uv run python agent/build_exe.py --api https://api.example.com

The API URL is baked into the .exe as its default --api (testers can still
override it with --api or TELEMETRY_API). It can also come from the
LECTIO_API_URL environment variable. Run this on Windows, from any folder.
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent.parent
BUILD = ROOT / "build" / "lectio-agent"

# Imported lazily or through COM, so PyInstaller can't see them by itself.
HIDDEN_IMPORTS = [
    "wmi", "pythoncom", "pywintypes", "win32com", "win32com.client",
    "win32evtlog", "win32con", "win32api", "psutil",
    "lectio_build_config",
]
# Server-only packages the agent never imports; keeps the .exe smaller.
EXCLUDES = ["tkinter", "openai", "fastapi", "uvicorn", "starlette", "pytest", "IPython"]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--api", default=os.environ.get("LECTIO_API_URL"),
                        help="API URL the .exe sends to by default (env LECTIO_API_URL)")
    args = parser.parse_args()

    if sys.platform != "win32":
        raise SystemExit("Build the agent on Windows: it uses WMI and pywin32.")
    if not args.api:
        raise SystemExit("Give the production API URL: --api https://... or set LECTIO_API_URL.")
    api = args.api.rstrip("/")
    url = urlparse(api)
    if url.scheme not in ("http", "https") or not url.netloc:
        raise SystemExit(f"Not an http(s) URL: {api}")
    if url.scheme == "http" and url.hostname not in ("localhost", "127.0.0.1"):
        print(f"Warning: {api} is not https; passwords would be sent unencrypted.")

    import PyInstaller.__main__  # from the 'build' dependency group

    BUILD.mkdir(parents=True, exist_ok=True)
    (BUILD / "lectio_build_config.py").write_text(
        f'"""Written by agent/build_exe.py."""\nAPI_URL = {api!r}\n', encoding="utf-8")

    pyi_args = [
        str(ROOT / "agent" / "telemetry_agent.py"),
        "--name", "lectio-agent",
        "--onefile",
        "--console",
        "--noconfirm",
        "--clean",
        "--paths", str(ROOT),
        "--paths", str(BUILD),
        "--distpath", str(ROOT / "dist"),
        "--workpath", str(BUILD / "work"),
        "--specpath", str(BUILD),
    ]
    for name in HIDDEN_IMPORTS:
        pyi_args += ["--hidden-import", name]
    for name in EXCLUDES:
        pyi_args += ["--exclude-module", name]

    print(f"Building dist/lectio-agent.exe (default API {api})")
    PyInstaller.__main__.run(pyi_args)
    exe = ROOT / "dist" / "lectio-agent.exe"
    print(f"Built {exe} ({exe.stat().st_size / 1_048_576:.1f} MB)")


if __name__ == "__main__":
    main()

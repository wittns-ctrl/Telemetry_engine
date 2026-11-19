"""
The agent's side of fixes: carrying out catalogue fixes on this PC.

Only the fixes in app.core.fix_catalogue exist here; anything else is refused.
Each runner returns (message, undo_data): a short, plain sentence for the
user, and whatever the matching undo needs to put things back (None when the
fix can't be undone). Problems raise FixError with a plain message.

Big fixes are confirmed on the PC first (ask_on_pc). Fixes that need
administrator rights go through Windows' own permission prompt (UAC) as well.
Everything here is Windows-only except clear_temp_files; on other systems the
rest fail with a clear message.
"""

from __future__ import annotations

import ctypes
import logging
import os
import re
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from typing import Any, Callable

from app.core.fix_catalogue import PROTECTED_PROCESSES, RESTARTABLE_SERVICES, get_fix

logger = logging.getLogger("telemetry_agent.fixes")

IS_WINDOWS = sys.platform == "win32"
BALANCED_PLAN = "381b4222-f694-41f0-9685-ff5bb260df2e"
RUN_KEY = r"Software\Microsoft\Windows\CurrentVersion\Run"
APPROVAL_TIMEOUT_S = 5 * 60


class FixError(Exception):
    """A fix couldn't be carried out. The message is shown to the user."""


# ------------------------------------------------------------------ helpers

def _require_windows() -> None:
    if not IS_WINDOWS:
        raise FixError("This fix only works on Windows.")


def _run(args: list[str], timeout: float = 60) -> str:
    """Run a program and return its output. Tests replace this."""
    flags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
    try:
        done = subprocess.run(args, capture_output=True, text=True, timeout=timeout, creationflags=flags)
    except (OSError, subprocess.TimeoutExpired) as e:
        raise FixError(f"Windows couldn't run {args[0]}: {e}")
    if done.returncode != 0:
        raise FixError((done.stderr or done.stdout or f"{args[0]} failed").strip()[:300])
    return done.stdout


def _run_elevated(program: str, arguments: str, timeout: float = 3600) -> tuple[int, str]:
    """Run a program as administrator via Windows' permission prompt (UAC).

    Returns (exit code, output). The output is captured through a temporary
    file because an elevated process can't write to this process's pipes.
    """
    _require_windows()
    from ctypes import wintypes

    out_file = Path(tempfile.gettempdir()) / f"lectio-fix-{os.getpid()}-{time.time_ns()}.txt"
    command = f'/c {program} {arguments} > "{out_file}" 2>&1'

    class SHELLEXECUTEINFOW(ctypes.Structure):
        _fields_ = [
            ("cbSize", wintypes.DWORD), ("fMask", ctypes.c_ulong), ("hwnd", wintypes.HWND),
            ("lpVerb", wintypes.LPCWSTR), ("lpFile", wintypes.LPCWSTR), ("lpParameters", wintypes.LPCWSTR),
            ("lpDirectory", wintypes.LPCWSTR), ("nShow", ctypes.c_int), ("hInstApp", wintypes.HINSTANCE),
            ("lpIDList", ctypes.c_void_p), ("lpClass", wintypes.LPCWSTR), ("hkeyClass", wintypes.HKEY),
            ("dwHotKey", wintypes.DWORD), ("hIconOrMonitor", wintypes.HANDLE), ("hProcess", wintypes.HANDLE),
        ]

    info = SHELLEXECUTEINFOW()
    info.cbSize = ctypes.sizeof(info)
    info.fMask = 0x00000040  # SEE_MASK_NOCLOSEPROCESS
    info.lpVerb = "runas"
    info.lpFile = "cmd.exe"
    info.lpParameters = command
    info.nShow = 0  # SW_HIDE
    if not ctypes.windll.shell32.ShellExecuteExW(ctypes.byref(info)):
        if ctypes.GetLastError() == 1223:  # ERROR_CANCELLED: "No" on the permission prompt
            raise FixError("Windows asked for permission and it wasn't given.")
        raise FixError("Windows couldn't start the repair.")
    try:
        kernel32 = ctypes.windll.kernel32
        if kernel32.WaitForSingleObject(info.hProcess, int(timeout * 1000)) != 0:
            raise FixError("The repair took too long and was stopped.")
        code = wintypes.DWORD()
        kernel32.GetExitCodeProcess(info.hProcess, ctypes.byref(code))
        kernel32.CloseHandle(info.hProcess)
        return code.value, _read_output(out_file)
    finally:
        try:
            out_file.unlink()
        except OSError:
            pass


def _read_output(path: Path) -> str:
    try:
        raw = path.read_bytes()
    except OSError:
        return ""
    # sfc writes UTF-16; most tools write the console code page.
    if raw[:2] in (b"\xff\xfe", b"\xfe\xff") or raw[1:2] == b"\x00":
        return raw.decode("utf-16", errors="ignore")
    return raw.decode(errors="ignore")


def ask_on_pc(title: str, summary: str) -> bool:
    """Ask whoever is at the PC to allow a fix. True only for a clear yes."""
    if not IS_WINDOWS:
        logger.warning("Can't ask for approval on this system; declining %s", title)
        return False
    text = f"{summary}\n\nLectio was asked to do this from your account on the website.\nAllow it now?"
    caption = f"Lectio: {title}"
    style = 0x4 | 0x20 | 0x40000 | 0x10000  # MB_YESNO | MB_ICONQUESTION | MB_TOPMOST | MB_SETFOREGROUND
    user32 = ctypes.windll.user32
    box = getattr(user32, "MessageBoxTimeoutW", None)  # closes itself (answer: no) if nobody responds
    answer = box(None, text, caption, style, 0, APPROVAL_TIMEOUT_S * 1000) if box else user32.MessageBoxW(None, text, caption, style)
    return answer == 6  # IDYES


# ------------------------------------------------------------------ cool down

_HEX = re.compile(r"Current (AC|DC) Power Setting Index:\s*0x([0-9a-fA-F]+)")


def _throttle_values() -> dict[str, int]:
    out = _run(["powercfg", "/query", "SCHEME_CURRENT", "SUB_PROCESSOR", "PROCTHROTTLEMAX"])
    values = {kind.lower(): int(value, 16) for kind, value in _HEX.findall(out)}
    if "ac" not in values:
        raise FixError("Couldn't read the processor's power setting.")
    values.setdefault("dc", values["ac"])
    return values


def _set_throttle(ac: int, dc: int) -> None:
    _run(["powercfg", "/setacvalueindex", "SCHEME_CURRENT", "SUB_PROCESSOR", "PROCTHROTTLEMAX", str(ac)])
    _run(["powercfg", "/setdcvalueindex", "SCHEME_CURRENT", "SUB_PROCESSOR", "PROCTHROTTLEMAX", str(dc)])
    _run(["powercfg", "/setactive", "SCHEME_CURRENT"])


def cool_down(params: dict) -> tuple[str, dict]:
    _require_windows()
    minutes, limit = params.get("minutes", 60), params.get("max_percent", 80)
    before = _throttle_values()
    try:
        _set_throttle(min(before["ac"], limit), min(before["dc"], limit))
    except FixError:
        # Half-applied (AC set, DC not, say): put back what was there, then fail.
        try:
            _set_throttle(before["ac"], before["dc"])
        except FixError as e:
            logger.warning(f"Couldn't restore the processor setting after a failed cool down: {e}")
        raise
    revert_at = time.time() + minutes * 60
    return (
        f"Done. The processor is limited to {limit}% for {minutes} minutes, then goes back to normal.",
        {"ac": before["ac"], "dc": before["dc"], "revert_at": revert_at},
    )


def undo_cool_down(undo: dict) -> str:
    _require_windows()
    ac, dc = int(undo["ac"]), int(undo["dc"])
    if not (5 <= ac <= 100 and 5 <= dc <= 100):
        raise FixError("The previous processor setting wasn't recorded properly.")
    _set_throttle(ac, dc)
    return "The processor is back to its normal speed."


# ------------------------------------------------------------------ power plan

_GUID = re.compile(r"([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})")


def _active_plan() -> str:
    match = _GUID.search(_run(["powercfg", "/getactivescheme"]))
    if not match:
        raise FixError("Couldn't read the current power plan.")
    return match.group(1).lower()


def balanced_power(params: dict) -> tuple[str, dict | None]:
    _require_windows()
    before = _active_plan()
    if before == BALANCED_PLAN:
        return "Your PC is already on the Balanced power plan.", None
    _run(["powercfg", "/setactive", BALANCED_PLAN])
    return "Done. Your PC is on the Balanced power plan.", {"plan": before}


def undo_balanced_power(undo: dict) -> str:
    _require_windows()
    plan = str(undo["plan"]).lower()
    if not _GUID.fullmatch(plan):
        raise FixError("The previous power plan wasn't recorded properly.")
    _run(["powercfg", "/setactive", plan])
    return "Your previous power plan is back."


# ------------------------------------------------------------------ temp files

def _size(n: float) -> str:
    for unit in ("bytes", "KB", "MB", "GB"):
        if n < 1024 or unit == "GB":
            return f"{n:.0f} {unit}" if unit == "bytes" else f"{n:.1f} {unit}"
        n /= 1024


def clear_temp_files(params: dict, folder: Path | None = None) -> tuple[str, None]:
    folder = Path(folder or tempfile.gettempdir())
    cutoff = time.time() - 24 * 3600
    freed = removed = skipped = 0
    for path in folder.rglob("*"):
        try:
            if path.is_symlink() or not path.is_file():
                continue
            info = path.stat()
            if info.st_mtime > cutoff:
                continue
            path.unlink()
            freed += info.st_size
            removed += 1
        except OSError:
            skipped += 1  # in use, or not ours to delete
    for path in sorted(folder.rglob("*"), key=lambda p: len(p.parts), reverse=True):
        try:
            if path.is_dir() and not path.is_symlink() and not any(path.iterdir()):
                path.rmdir()
        except OSError:
            pass
    if not removed:
        return "There were no old temporary files to clear.", None
    note = f" {skipped} in use were left alone." if skipped else ""
    return f"Done. Cleared {removed} temporary files and freed {_size(freed)}.{note}", None


# ------------------------------------------------------------------ close an app

def close_app(params: dict) -> tuple[str, None]:
    import psutil

    name = params["process"]
    if name.lower() in PROTECTED_PROCESSES:
        raise FixError(f"{name} is part of Windows and can't be closed.")
    me = os.getpid()
    procs = [
        p for p in psutil.process_iter(["name", "pid"])
        if (p.info["name"] or "").lower() == name.lower() and p.info["pid"] != me
    ]
    if not procs:
        return f"{name} wasn't running any more.", None
    for p in procs:
        try:
            p.terminate()
        except psutil.Error:
            pass
    _, alive = psutil.wait_procs(procs, timeout=8)
    for p in alive:
        try:
            p.kill()
        except psutil.Error:
            pass
    _, still = psutil.wait_procs(alive, timeout=4)
    if still:
        raise FixError(f"Windows wouldn't let Lectio close {name}.")
    return f"Done. Closed {name}.", None


# ------------------------------------------------------------------ startup apps

def _winreg():
    _require_windows()
    import winreg
    return winreg


def disable_startup_app(params: dict, winreg=None) -> tuple[str, dict]:
    winreg = winreg or _winreg()
    name = params["name"]
    try:
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, RUN_KEY, 0, winreg.KEY_READ | winreg.KEY_SET_VALUE) as key:
            value, kind = winreg.QueryValueEx(key, name)
            winreg.DeleteValue(key, name)
    except FileNotFoundError:
        raise FixError(f"Couldn't find {name} among the apps that start with Windows.")
    except OSError as e:
        raise FixError(f"Windows wouldn't change the startup apps: {e}")
    return f"Done. {name} won't start with Windows any more.", {"name": name, "value": value, "type": kind}


def undo_disable_startup_app(undo: dict, winreg=None) -> str:
    winreg = winreg or _winreg()
    try:
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, RUN_KEY, 0, winreg.KEY_SET_VALUE) as key:
            winreg.SetValueEx(key, undo["name"], 0, int(undo["type"]), undo["value"])
    except OSError as e:
        raise FixError(f"Windows wouldn't change the startup apps: {e}")
    return f"{undo['name']} will start with Windows again."


# ------------------------------------------------------------------ admin repairs

def restart_service(params: dict) -> tuple[str, None]:
    service = params["service"]
    if service not in RESTARTABLE_SERVICES:
        raise FixError("Lectio doesn't restart that service.")
    code, out = _run_elevated("powershell.exe", f"-NoProfile -Command Restart-Service -Name {service} -Force")
    if code != 0:
        raise FixError(f"Windows couldn't restart {RESTARTABLE_SERVICES[service]}.")
    return f"Done. {RESTARTABLE_SERVICES[service]} was restarted.", None


def repair_system_files(params: dict) -> tuple[str, None]:
    _, out = _run_elevated("sfc.exe", "/scannow")
    text = " ".join(out.split()).lower()
    if "did not find any integrity violations" in text:
        return "Windows checked its system files and found nothing wrong.", None
    if "successfully repaired" in text:
        return "Windows found damaged system files and repaired them. Restart your PC to finish.", None
    if "unable to fix" in text:
        raise FixError("Windows found damaged system files it couldn't repair. A technician may need to look at it.")
    raise FixError("The system file check didn't finish. Try again later.")


def check_disk(params: dict) -> tuple[str, None]:
    drive = os.environ.get("SystemDrive", "C:")
    _, out = _run_elevated("chkdsk.exe", f"{drive} /scan")
    text = " ".join(out.split()).lower()
    if "found no problems" in text:
        return f"Windows checked drive {drive} and found no problems.", None
    if "found problems" in text or "errors found" in text:
        return f"Windows found problems on drive {drive}. Back up your files, then restart to let Windows repair it.", None
    raise FixError("The drive check didn't finish. Try again later.")


# ------------------------------------------------------------------ dispatch

RUNNERS: dict[str, Callable[[dict], tuple[str, Any]]] = {
    "cool_down": cool_down,
    "balanced_power": balanced_power,
    "clear_temp_files": clear_temp_files,
    "close_app": close_app,
    "disable_startup_app": disable_startup_app,
    "restart_service": restart_service,
    "repair_system_files": repair_system_files,
    "check_disk": check_disk,
}
UNDOERS: dict[str, Callable[[dict], str]] = {
    "cool_down": undo_cool_down,
    "balanced_power": undo_balanced_power,
    "disable_startup_app": undo_disable_startup_app,
}


def _known(fix_id: str):
    fix = get_fix(fix_id)
    if fix is None or fix.manual or fix_id not in RUNNERS:
        raise FixError("This PC's Lectio doesn't know that fix.")
    return fix


def run_fix(fix_id: str, params: dict) -> tuple[str, Any]:
    fix = _known(fix_id)
    # Check again here: the agent never trusts the server's parameters.
    try:
        clean = fix.clean_params(params)
    except ValueError as e:
        raise FixError(str(e))
    return RUNNERS[fix_id](clean)


def undo_fix(fix_id: str, undo_data: dict | None) -> str:
    _known(fix_id)
    if fix_id not in UNDOERS or not undo_data:
        raise FixError("This fix can't be undone.")
    return UNDOERS[fix_id](undo_data)

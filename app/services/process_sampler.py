"""
The busiest programs right now, computed like Task Manager's Processes tab.

On Windows this uses the same source as Task Manager: one call to
NtQuerySystemInformation(SystemProcessInformation), which returns every
process at once with its CPU times, private working set and I/O byte counts.
Asking psutil about each of ~400 processes separately took several seconds on
a busy PC; this single call takes a few milliseconds.

- CPU: the CPU time a process used since the previous sample, divided by the
  elapsed time and the number of logical processors, so all processes
  together add up to the machine's total (at most 100%).
- Memory: the private working set, Task Manager's default "Memory" column.
- Disk: bytes read and written since the previous sample, per second. This
  counts all of the process's I/O (Task Manager's Disk column traces disk
  I/O only), so it can be a little higher for programs using the network.

Samples are compared by process id and start time, so the CPU and I/O figures
cover the interval between two agent snapshots. The first sample has no
interval yet, so its CPU and disk figures are 0.

Off Windows (and in tests) psutil does the same job, more slowly.
"""

from __future__ import annotations

import ctypes
import logging
import struct
import sys
import threading
import time
from dataclasses import dataclass
from typing import Optional

import psutil

logger = logging.getLogger(__name__)

TOP = 8
IGNORED_PIDS = {0}  # System Idle Process
IGNORED_NAMES = {"System Idle Process", "Idle", "Memory Compression", "Registry", "Secure System"}


@dataclass
class ProcessUsage:
    name: str
    pid: int
    cpu_percent: float
    memory_mb: Optional[float]
    disk_bytes_per_s: Optional[float]


@dataclass
class RawProcess:
    """Cumulative counters for one process at one moment."""
    pid: int
    name: str
    created: int          # 100 ns ticks; with pid, tells a reused pid apart
    cpu_ticks: int        # user + kernel time, 100 ns ticks
    private_bytes: Optional[int]
    io_bytes: Optional[int]


# ---------------------------------------------------------------- Windows source

_STATUS_INFO_LENGTH_MISMATCH = 0xC0000004
_SYSTEM_PROCESS_INFORMATION = 5
# Offsets in SYSTEM_PROCESS_INFORMATION on 64-bit Windows.
_OFF = {
    "next": 0, "private_ws": 8, "create": 32, "user": 40, "kernel": 48,
    "name_len": 56, "name_ptr": 64, "pid": 80, "read_bytes": 232, "write_bytes": 240,
}


def read_windows_processes() -> list[RawProcess]:
    """Every process in one NtQuerySystemInformation call (64-bit Windows)."""
    ntdll = ctypes.WinDLL("ntdll")
    size = ctypes.c_ulong(1 << 20)
    for _ in range(8):
        buffer = ctypes.create_string_buffer(size.value)
        status = ntdll.NtQuerySystemInformation(
            _SYSTEM_PROCESS_INFORMATION, buffer, size, ctypes.byref(size)
        ) & 0xFFFFFFFF
        if status == _STATUS_INFO_LENGTH_MISMATCH:
            size = ctypes.c_ulong(size.value + (1 << 16))  # processes started in between
            continue
        if status != 0:
            raise OSError(f"NtQuerySystemInformation failed: 0x{status:08X}")
        break
    else:
        raise OSError("NtQuerySystemInformation: buffer kept growing")

    data = buffer.raw
    base = ctypes.addressof(buffer)
    result, offset = [], 0
    while True:
        u64 = lambda key: struct.unpack_from("<Q", data, offset + _OFF[key])[0]  # noqa: E731
        name_len = struct.unpack_from("<H", data, offset + _OFF["name_len"])[0]
        name_ptr = u64("name_ptr")
        name = ctypes.wstring_at(name_ptr, name_len // 2) if name_ptr and name_len else "System Idle Process"
        result.append(RawProcess(
            pid=u64("pid"),
            name=name,
            created=u64("create"),
            cpu_ticks=u64("user") + u64("kernel"),
            private_bytes=u64("private_ws"),
            io_bytes=u64("read_bytes") + u64("write_bytes"),
        ))
        step = struct.unpack_from("<I", data, offset + _OFF["next"])[0]
        if not step:
            break
        offset += step
        assert base  # keeps the buffer alive while names are read from it
    return result


def read_psutil_processes() -> list[RawProcess]:
    """The same counters through psutil, for other systems and tests."""
    result = []
    for proc in psutil.process_iter(["name", "create_time"]):
        try:
            times = proc.cpu_times()
            try:
                io = proc.io_counters()
                io_bytes = io.read_bytes + io.write_bytes
            except (psutil.AccessDenied, AttributeError, OSError):
                io_bytes = None
            try:
                private = proc.memory_full_info().uss
            except (psutil.AccessDenied, AttributeError, OSError):
                private = None
            result.append(RawProcess(
                pid=proc.pid,
                name=proc.info["name"] or f"pid {proc.pid}",
                created=int((proc.info["create_time"] or 0) * 1e7),
                cpu_ticks=int((times.user + times.system) * 1e7),
                private_bytes=private,
                io_bytes=io_bytes,
            ))
        except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
            continue
    return result


def top_processes(before: dict, now: list[RawProcess], seconds: float, cpus: int, top: int = TOP) -> list[ProcessUsage]:
    """Task Manager's per-process figures from two readings `seconds` apart."""
    rows = []
    for p in now:
        if p.pid in IGNORED_PIDS or p.name in IGNORED_NAMES:
            continue
        prev = before.get((p.pid, p.created))
        if prev and seconds > 0:
            cpu = (p.cpu_ticks - prev.cpu_ticks) / (seconds * 1e7 * cpus) * 100
            io = (p.io_bytes - prev.io_bytes) / seconds if p.io_bytes is not None and prev.io_bytes is not None else None
        else:
            cpu, io = 0.0, (0.0 if p.io_bytes is not None else None)
        rows.append(ProcessUsage(
            name=p.name,
            pid=p.pid,
            cpu_percent=round(min(100.0, max(0.0, cpu)), 1),
            memory_mb=round(p.private_bytes / (1024 ** 2), 1) if p.private_bytes is not None else None,
            disk_bytes_per_s=max(0.0, io) if io is not None else None,
        ))
    rows.sort(key=lambda r: (r.cpu_percent, r.memory_mb or 0), reverse=True)
    return rows[:top]


class ProcessSampler:
    def __init__(self, top: int = TOP):
        self.top = top
        self._lock = threading.Lock()
        self._before: dict[tuple[int, int], RawProcess] = {}
        self._at: Optional[float] = None
        self._cpus = psutil.cpu_count() or 1
        self._windows = sys.platform == "win32" and struct.calcsize("P") == 8

    def _read(self) -> list[RawProcess]:
        if self._windows:
            try:
                return read_windows_processes()
            except Exception as e:
                logger.warning(f"Fast process list failed, using psutil: {e}")
                self._windows = False
        return read_psutil_processes()

    def sample(self) -> list[ProcessUsage]:
        """Top processes by CPU, then memory. Blocking; call it from a thread."""
        with self._lock:
            now = time.monotonic()
            current = self._read()
            seconds = now - self._at if self._at is not None else 0.0
            result = top_processes(self._before, current, seconds, self._cpus, self.top)
            self._before = {(p.pid, p.created): p for p in current}
            self._at = now
            return result


process_sampler = ProcessSampler()

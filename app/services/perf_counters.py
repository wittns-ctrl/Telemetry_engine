"""
Windows performance counters, read the way Task Manager reads them.

Task Manager doesn't sample the CPU for a split second; it keeps one PDH
(Performance Data Helper) query open and, on every refresh, reports the
average since the previous refresh. This module does the same: one query is
opened on first use and every call to `sample()` returns rates and
percentages averaged over the time since the last call (the agent calls it
every 2 seconds). The first call has nothing to compare with, so its rates
come back as None.

What each value means, matching Task Manager's Performance tab:

- CPU utilisation: `% Processor Utility` (what Task Manager shows since
  Windows 8), capped at 100. `% Processor Time` is the fallback.
- CPU speed: base frequency x `% Processor Performance` / 100.
- GPU utilisation: per physical engine, the sum over processes of `GPU
  Engine\\Utilization Percentage`; the GPU's figure is the busiest engine.
- GPU memory: `GPU Adapter Memory\\Dedicated Usage` and `Shared Usage`.
- Disk: active time = 100 - `% Idle Time`; read and write bytes per second.
- Network: bytes received and sent per second on the busiest adapter, with
  its link speed.
- Processes, threads, handles and up time from the `System` and `Process`
  objects; committed memory from `Memory`.

Everything here is Windows-only. On other systems (and in tests, which run on
Linux) `available()` is False and `sample()` returns an empty result, so the
caller falls back to psutil.
"""

from __future__ import annotations

import logging
import re
import threading
from dataclasses import dataclass, field
from typing import Optional

logger = logging.getLogger(__name__)

# Counters with a single _Total instance.
SINGLE = {
    "cpu_utility": r"\Processor Information(_Total)\% Processor Utility",
    "cpu_time": r"\Processor Information(_Total)\% Processor Time",
    "cpu_performance": r"\Processor Information(_Total)\% Processor Performance",
    "cpu_base_mhz": r"\Processor Information(_Total)\Processor Frequency",
    "disk_idle": r"\PhysicalDisk(_Total)\% Idle Time",
    "disk_read": r"\PhysicalDisk(_Total)\Disk Read Bytes/sec",
    "disk_write": r"\PhysicalDisk(_Total)\Disk Write Bytes/sec",
    "processes": r"\System\Processes",
    "threads": r"\System\Threads",
    "uptime": r"\System\System Up Time",
    "handles": r"\Process(_Total)\Handle Count",
    "committed": r"\Memory\Committed Bytes",
    "commit_limit": r"\Memory\Commit Limit",
    "pagefile": r"\Paging File(_Total)\% Usage",
}
# Counters with one instance per engine, adapter or network card.
MULTI = {
    "gpu_engine": r"\GPU Engine(*)\Utilization Percentage",
    "gpu_dedicated": r"\GPU Adapter Memory(*)\Dedicated Usage",
    "gpu_shared": r"\GPU Adapter Memory(*)\Shared Usage",
    "net_rx": r"\Network Interface(*)\Bytes Received/sec",
    "net_tx": r"\Network Interface(*)\Bytes Sent/sec",
    "net_bandwidth": r"\Network Interface(*)\Current Bandwidth",
}

# "pid_10616_luid_0x0_0x141CD_phys_0_eng_3_engtype_3D" -> the engine, without the process.
_ENGINE = re.compile(r"(luid_[0-9a-fx_]+?_phys_\d+_eng_\d+)", re.IGNORECASE)


@dataclass
class PerfSample:
    """One reading of the counters. Any value Windows can't give is None."""

    cpu_percent: Optional[float] = None
    cpu_speed_ghz: Optional[float] = None
    gpu_percent: Optional[float] = None
    gpu_dedicated_gb: Optional[float] = None
    gpu_shared_gb: Optional[float] = None
    disk_active_percent: Optional[float] = None
    disk_read_bytes_per_s: Optional[float] = None
    disk_write_bytes_per_s: Optional[float] = None
    net_receive_bytes_per_s: Optional[float] = None
    net_send_bytes_per_s: Optional[float] = None
    net_adapter: Optional[str] = None
    net_link_mbps: Optional[float] = None
    processes: Optional[int] = None
    threads: Optional[int] = None
    handles: Optional[int] = None
    uptime_seconds: Optional[int] = None
    committed_gb: Optional[float] = None
    commit_limit_gb: Optional[float] = None
    pagefile_percent: Optional[float] = None
    raw: dict = field(default_factory=dict, repr=False)


def gpu_busiest_engine(engines: dict[str, float]) -> Optional[float]:
    """
    Task Manager's GPU figure from per-process engine counters: add up each
    physical engine across processes, then take the busiest engine.
    """
    per_engine: dict[str, float] = {}
    for name, value in engines.items():
        match = _ENGINE.search(name)
        if match and value is not None:
            per_engine[match.group(1)] = per_engine.get(match.group(1), 0.0) + value
    if not per_engine:
        return None
    return round(min(100.0, max(per_engine.values())), 1)


def busiest_adapter(rx: dict[str, float], tx: dict[str, float], bandwidth: dict[str, float]):
    """The network card moving the most data, with its rates and link speed."""
    names = set(rx) | set(tx)
    names = {n for n in names if "isatap" not in n.lower() and "loopback" not in n.lower()}
    if not names:
        return None, None, None, None
    best = max(names, key=lambda n: (rx.get(n) or 0) + (tx.get(n) or 0))
    link = bandwidth.get(best)
    return best, rx.get(best), tx.get(best), (link / 1_000_000 if link else None)


class PerfCounterSampler:
    """Keeps one PDH query open; each sample() averages since the previous one."""

    def __init__(self):
        self._lock = threading.Lock()
        self._query = None
        self._single: dict[str, int] = {}
        self._multi: dict[str, int] = {}
        self._failed = False

    def available(self) -> bool:
        try:
            import win32pdh  # noqa: F401  (pywin32, Windows only)
        except ImportError:
            return False
        return not self._failed

    def _open(self) -> bool:
        import win32pdh

        try:
            self._query = win32pdh.OpenQuery()
        except Exception as e:  # pragma: no cover - Windows only
            logger.warning(f"Performance counters unavailable: {e}")
            self._failed = True
            return False
        for key, path in SINGLE.items():
            try:
                self._single[key] = win32pdh.AddEnglishCounter(self._query, path)
            except Exception:
                logger.debug(f"Counter not on this PC: {path}")
        for key, path in MULTI.items():
            try:
                self._multi[key] = win32pdh.AddEnglishCounter(self._query, path)
            except Exception:
                logger.debug(f"Counter not on this PC: {path}")
        return True

    def sample(self) -> PerfSample:
        """Read every counter. Blocking but quick (no sleep); call it from a thread."""
        if not self.available():
            return PerfSample()
        import win32pdh

        with self._lock:
            if self._query is None and not self._open():
                return PerfSample()
            try:
                win32pdh.CollectQueryData(self._query)
            except Exception as e:  # pragma: no cover - Windows only
                logger.warning(f"Reading performance counters failed: {e}")
                return PerfSample()

            def one(key: str) -> Optional[float]:
                handle = self._single.get(key)
                if handle is None:
                    return None
                try:
                    return win32pdh.GetFormattedCounterValue(handle, win32pdh.PDH_FMT_DOUBLE)[1]
                except Exception:
                    return None  # "data not valid" until the second reading, or not on this PC

            def many(key: str) -> dict[str, float]:
                handle = self._multi.get(key)
                if handle is None:
                    return {}
                try:
                    return win32pdh.GetFormattedCounterArray(handle, win32pdh.PDH_FMT_DOUBLE)
                except Exception:
                    return {}

            values = {k: one(k) for k in SINGLE}
            arrays = {k: many(k) for k in MULTI}

        return build_sample(values, arrays)


def build_sample(values: dict[str, Optional[float]], arrays: dict[str, dict[str, float]]) -> PerfSample:
    """Turn raw counter values into Task Manager figures (kept separate so tests can feed it)."""
    gib = 1024 ** 3
    cpu = values.get("cpu_utility")
    if cpu is None:
        cpu = values.get("cpu_time")
    base = values.get("cpu_base_mhz")
    performance = values.get("cpu_performance")
    idle = values.get("disk_idle")
    adapter, rx, tx, link = busiest_adapter(arrays.get("net_rx", {}), arrays.get("net_tx", {}), arrays.get("net_bandwidth", {}))
    dedicated = arrays.get("gpu_dedicated", {})
    shared = arrays.get("gpu_shared", {})

    def gb(v):
        return round(v / gib, 2) if v is not None else None

    def whole(v):
        return int(v) if v is not None else None

    return PerfSample(
        cpu_percent=round(min(100.0, max(0.0, cpu)), 1) if cpu is not None else None,
        cpu_speed_ghz=round(base * performance / 100 / 1000, 2) if base and performance else None,
        gpu_percent=gpu_busiest_engine(arrays.get("gpu_engine", {})),
        gpu_dedicated_gb=gb(sum(dedicated.values())) if dedicated else None,
        gpu_shared_gb=gb(sum(shared.values())) if shared else None,
        disk_active_percent=round(min(100.0, max(0.0, 100.0 - idle)), 1) if idle is not None else None,
        disk_read_bytes_per_s=values.get("disk_read"),
        disk_write_bytes_per_s=values.get("disk_write"),
        net_receive_bytes_per_s=rx,
        net_send_bytes_per_s=tx,
        net_adapter=adapter,
        net_link_mbps=link,
        processes=whole(values.get("processes")),
        threads=whole(values.get("threads")),
        handles=whole(values.get("handles")),
        uptime_seconds=whole(values.get("uptime")),
        committed_gb=gb(values.get("committed")),
        commit_limit_gb=gb(values.get("commit_limit")),
        pagefile_percent=round(values["pagefile"], 1) if values.get("pagefile") is not None else None,
    )


# One sampler per process, shared by every snapshot.
perf_sampler = PerfCounterSampler()

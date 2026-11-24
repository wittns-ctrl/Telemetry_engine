"""
Database performance monitoring, in this API process.

pymongo calls these listeners for every command and connection-pool event.
They keep rolling samples (no external service needed) that the admin stats
endpoint reports: per-command latency percentiles, read/write throughput,
slow commands, errors, and how much of the connection pool is in use.
"""

from __future__ import annotations

import logging
import threading
import time
from collections import defaultdict, deque

from pymongo import monitoring

logger = logging.getLogger(__name__)

SAMPLES_PER_COMMAND = 2000
READ_COMMANDS = {"find", "aggregate", "count", "distinct", "getMore", "listIndexes"}
WRITE_COMMANDS = {"insert", "update", "delete", "findAndModify", "createIndexes"}
IGNORED = {"hello", "isMaster", "ismaster", "ping", "saslStart", "saslContinue", "endSessions", "buildInfo"}


def percentile(sorted_values: list[float], p: float) -> float | None:
    if not sorted_values:
        return None
    k = min(len(sorted_values) - 1, max(0, round(p / 100 * (len(sorted_values) - 1))))
    return sorted_values[k]


class CommandStats(monitoring.CommandListener):
    """Latency per command name, plus counts, errors and slow commands."""

    def __init__(self, slow_ms: int):
        self.slow_ms = slow_ms
        self._lock = threading.Lock()
        self._started_at = time.monotonic()
        self._durations: dict[str, deque] = defaultdict(lambda: deque(maxlen=SAMPLES_PER_COMMAND))
        self._counts: dict[str, int] = defaultdict(int)
        self._failures: dict[str, int] = defaultdict(int)
        self.slow_commands = 0

    def started(self, event):  # durations come with the finished events
        pass

    def _record(self, event, failed: bool):
        name = event.command_name
        if name in IGNORED:
            return
        ms = event.duration_micros / 1000
        with self._lock:
            self._durations[name].append(ms)
            self._counts[name] += 1
            if failed:
                self._failures[name] += 1
            if ms >= self.slow_ms:
                self.slow_commands += 1
        if ms >= self.slow_ms:
            logger.warning("Slow database command: %s on %s took %.0f ms", name, event.database_name, ms)

    def succeeded(self, event):
        self._record(event, failed=False)

    def failed(self, event):
        self._record(event, failed=True)
        logger.warning("Database command %s failed after %.0f ms: %s", event.command_name, event.duration_micros / 1000, event.failure)

    def snapshot(self) -> dict:
        with self._lock:
            uptime = max(1e-9, time.monotonic() - self._started_at)
            commands = {}
            for name, values in self._durations.items():
                ordered = sorted(values)
                commands[name] = {
                    "count": self._counts[name],
                    "errors": self._failures[name],
                    "p50_ms": percentile(ordered, 50),
                    "p95_ms": percentile(ordered, 95),
                    "p99_ms": percentile(ordered, 99),
                    "max_ms": ordered[-1] if ordered else None,
                }
            reads = sum(c for n, c in self._counts.items() if n in READ_COMMANDS)
            writes = sum(c for n, c in self._counts.items() if n in WRITE_COMMANDS)
            return {
                "since_seconds": round(uptime),
                "reads": reads,
                "writes": writes,
                "reads_per_second": round(reads / uptime, 3),
                "writes_per_second": round(writes / uptime, 3),
                "slow_commands": self.slow_commands,
                "slow_threshold_ms": self.slow_ms,
                "commands": commands,
            }


class PoolStats(monitoring.ConnectionPoolListener):
    """How many connections are open and how many are lent out to requests."""

    def __init__(self):
        self._lock = threading.Lock()
        self.open = 0
        self.checked_out = 0
        self.peak_checked_out = 0
        self.checkout_failures = 0
        self.times_cleared = 0  # not "pool_cleared": that's the listener method below

    def pool_created(self, event): pass
    def pool_ready(self, event): pass
    def pool_closed(self, event): pass
    def connection_ready(self, event): pass
    def connection_check_out_started(self, event): pass

    def pool_cleared(self, event):
        with self._lock:
            self.times_cleared += 1
        logger.warning("Database connection pool for %s was cleared (connections reset)", event.address)

    def connection_created(self, event):
        with self._lock:
            self.open += 1

    def connection_closed(self, event):
        with self._lock:
            self.open = max(0, self.open - 1)

    def connection_checked_out(self, event):
        with self._lock:
            self.checked_out += 1
            self.peak_checked_out = max(self.peak_checked_out, self.checked_out)

    def connection_checked_in(self, event):
        with self._lock:
            self.checked_out = max(0, self.checked_out - 1)

    def connection_check_out_failed(self, event):
        with self._lock:
            self.checkout_failures += 1
        logger.warning("Could not get a database connection: %s", event.reason)

    def snapshot(self, max_pool_size: int) -> dict:
        with self._lock:
            return {
                "max_pool_size": max_pool_size,
                "open_connections": self.open,
                "in_use": self.checked_out,
                "peak_in_use": self.peak_checked_out,
                "utilization_percent": round(100 * self.checked_out / max_pool_size, 1) if max_pool_size else None,
                "checkout_failures": self.checkout_failures,
                "times_cleared": self.times_cleared,
            }

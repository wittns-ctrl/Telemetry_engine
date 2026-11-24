"""
Processing stored telemetry: alert checks and the live relay to dashboards.

Storing a reading is the only part an agent waits for. The rest runs here,
in background workers fed by bounded queues, so a slow alert check (several
database round trips) never holds up an upload. Each device always goes to
the same worker, so its readings are checked in order (the anomaly engine
keeps per-device state). When a queue is full the work runs in the request
instead, which slows that agent down rather than dropping alert checks.
Without started workers (tests, scripts) everything runs inline.

The queues live in this process's memory: readings are already stored when
they're queued, so a crash loses only the alert check and live update for
readings still waiting, never the readings themselves.
"""

from __future__ import annotations

import asyncio
import logging
import threading
import time
from collections import deque
from dataclasses import dataclass

from app.core.websocket_manager import manager
from app.models.telemetry import Device, TelemetrySnapshot
from app.services.anomaly_engine import anomaly_engine
from app.db.monitoring import percentile

logger = logging.getLogger(__name__)


@dataclass
class Job:
    user_id: str
    device_id: str
    device_name: str
    snapshots: list[TelemetrySnapshot]  # oldest first
    queued_at: float


class IngestProcessor:
    def __init__(self):
        self._queues: list[asyncio.Queue] = []
        self._tasks: list[asyncio.Task] = []
        self._lag_ms: deque = deque(maxlen=2000)
        self._lock = threading.Lock()
        self.processed = 0
        self.ran_inline = 0
        self.failures = 0

    @property
    def running(self) -> bool:
        return bool(self._tasks)

    def start(self, workers: int, queue_size: int) -> None:
        per_worker = max(1, queue_size // workers)
        self._queues = [asyncio.Queue(maxsize=per_worker) for _ in range(workers)]
        self._tasks = [asyncio.create_task(self._run(q), name=f"ingest-worker-{i}") for i, q in enumerate(self._queues)]
        logger.info("Started %d telemetry workers (queue of %d each)", workers, per_worker)

    async def stop(self, drain_seconds: float = 10.0) -> None:
        """Finish queued work (up to drain_seconds), then stop the workers."""
        if not self._tasks:
            return
        try:
            await asyncio.wait_for(asyncio.gather(*(q.join() for q in self._queues)), drain_seconds)
        except asyncio.TimeoutError:
            left = sum(q.qsize() for q in self._queues)
            logger.warning("Stopping telemetry workers with %d batches unprocessed", left)
        for task in self._tasks:
            task.cancel()
        await asyncio.gather(*self._tasks, return_exceptions=True)
        self._tasks, self._queues = [], []

    async def submit(self, device: Device, snapshots: list[TelemetrySnapshot]) -> None:
        """Queue stored readings for processing (or process now if there's no room)."""
        if not snapshots:
            return
        job = Job(str(device.user_id), str(device.id), device.device_name, snapshots, time.monotonic())
        if self._queues:
            queue = self._queues[hash(job.device_id) % len(self._queues)]
            try:
                queue.put_nowait(job)
                return
            except asyncio.QueueFull:
                with self._lock:
                    self.ran_inline += 1
        await self.process(job)

    async def _run(self, queue: asyncio.Queue) -> None:
        while True:
            job = await queue.get()
            try:
                with self._lock:
                    self._lag_ms.append((time.monotonic() - job.queued_at) * 1000)
                await self.process(job)
            except Exception:
                with self._lock:
                    self.failures += 1
                logger.exception("Processing telemetry for device %s failed", job.device_id)
            finally:
                queue.task_done()

    async def process(self, job: Job) -> list[dict]:
        """Check each reading for alerts, then send the newest one to live dashboards."""
        from app.api.v1.websocket import ALERT_FEED, serialize_alert

        alerts: list[dict] = []
        for snapshot in job.snapshots:
            try:
                triggered = await anomaly_engine.evaluate_snapshot(
                    user_id=job.user_id, device_id=job.device_id, snapshot=snapshot
                )
                alerts.extend(serialize_alert(a) for a in triggered)
            except Exception as e:  # detection failure must not drop the reading
                logger.error(f"Anomaly detection failed for device {job.device_id}: {e}")

        newest = job.snapshots[-1]
        await manager.broadcast_to_device(
            job.user_id,
            job.device_id,
            {
                "type": "telemetry",
                "device_id": job.device_id,
                "timestamp": newest.timestamp.isoformat(),
                "telemetry": newest.model_dump(mode="json"),
                "alerts": alerts,
            },
        )
        if alerts:
            # Copy to the user's alert feed so a pop-up can show on any page.
            await manager.broadcast_to_device(
                job.user_id,
                ALERT_FEED,
                {"type": "alerts", "device_id": job.device_id, "device_name": job.device_name, "alerts": alerts},
            )
        with self._lock:
            self.processed += len(job.snapshots)
        return alerts

    def info(self) -> dict:
        with self._lock:
            lags = sorted(self._lag_ms)
            return {
                "workers": len(self._tasks),
                "queued_batches": sum(q.qsize() for q in self._queues),
                "queue_capacity": sum(q.maxsize for q in self._queues),
                "readings_processed": self.processed,
                "ran_in_request_because_queue_full": self.ran_inline,
                "failures": self.failures,
                "lag_p50_ms": percentile(lags, 50),
                "lag_p95_ms": percentile(lags, 95),
                "lag_p99_ms": percentile(lags, 99),
            }


ingest_processor = IngestProcessor()

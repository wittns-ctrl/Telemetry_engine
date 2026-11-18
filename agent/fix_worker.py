"""
The agent's fix loop: check in with the API, carry out fixes, report back.

Every few seconds the agent asks GET /api/v1/agent/fixes/next (which also
records that the agent is running). For a fix it:

  1. asks on the PC first if the fix is a big one (ask_on_pc),
  2. runs it (agent/fixes.py) in a worker thread,
  3. keeps its own record of how to undo it in the local config file, and
  4. reports a plain result to POST /api/v1/agent/fixes/{id}/result.

Undos only ever use that local record, never data sent by the server. Timed
fixes (Cool it down) are undone here when their time is up.
"""

from __future__ import annotations

import asyncio
import logging
import time
from pathlib import Path
from typing import Callable

import httpx

from agent import fixes as fix_impl

logger = logging.getLogger("telemetry_agent.fix_worker")

AGENT_VERSION = "0.2.0"
EXIT_AUTH = 2


class FixWorker:
    def __init__(
        self,
        client: httpx.AsyncClient,
        api: str,
        headers: dict,
        config: dict,
        save: Callable[[dict], None],
        ask: Callable[[str, str], bool] = fix_impl.ask_on_pc,
    ):
        self.client = client
        self.api = api
        self.headers = headers
        self.config = config
        self.save = save
        self.ask = ask

    # local state, kept in the agent's config file
    @property
    def undo_records(self) -> dict:
        return self.config.setdefault("undo_records", {})

    @property
    def reverts(self) -> list:
        return self.config.setdefault("timed_reverts", [])

    async def run(self) -> int:
        """Poll until the device key is rejected (returns EXIT_AUTH)."""
        poll = 10
        while True:
            try:
                await self.revert_due()
                took = await self.check_once()
                if took is None:
                    return EXIT_AUTH
                poll = took
            except httpx.HTTPError as e:
                logger.debug(f"Fix check-in failed: {e}")
                poll = 30
            await asyncio.sleep(poll)

    async def check_once(self) -> int | None:
        """One check-in. Returns seconds to wait, 0 after a fix, None if the key was rejected."""
        resp = await self.client.get(
            f"{self.api}/api/v1/agent/fixes/next", headers=self.headers,
            params={"agent_version": AGENT_VERSION},
        )
        if resp.status_code == 401:
            return None
        resp.raise_for_status()
        data = resp.json()
        fix = data.get("fix")
        if fix:
            await self.handle(fix)
            return 0  # there may be another one waiting
        return max(5, min(int(data.get("poll_seconds") or 10), 120))

    async def handle(self, fix: dict) -> None:
        request_id, fix_id = fix["id"], fix["fix_id"]
        logger.info(f"Fix requested: {fix_id} ({'undo' if fix.get('undo') else 'run'})")

        if fix.get("needs_pc_approval"):
            title = ("Undo: " if fix.get("undo") else "") + fix.get("title", fix_id)
            allowed = await asyncio.to_thread(self.ask, title, fix.get("summary", ""))
            if not allowed:
                await self.report(request_id, "declined", "Someone at the PC chose not to allow this.")
                return

        try:
            if fix.get("undo"):
                message = await self._undo(fix)
                await self.report(request_id, "succeeded", message)
            else:
                message, undo_data = await asyncio.to_thread(fix_impl.run_fix, fix_id, fix.get("params") or {})
                if undo_data:
                    self._remember(request_id, fix_id, undo_data)
                # The server only learns that an undo is possible, not the details.
                await self.report(request_id, "succeeded", message, {"recorded": True} if undo_data else None)
        except fix_impl.FixError as e:
            await self.report(request_id, "failed", str(e))
        except Exception:
            logger.exception(f"Fix {fix_id} crashed")
            await self.report(request_id, "failed", "Something went wrong on the PC while doing this.")

    async def _undo(self, fix: dict) -> str:
        original = fix.get("undo_of")
        record = self.undo_records.get(original or "")
        if not record or record.get("fix_id") != fix["fix_id"]:
            raise fix_impl.FixError("This PC has no record of that fix, so it can't undo it.")
        message = await asyncio.to_thread(fix_impl.undo_fix, record["fix_id"], record["data"])
        self._forget(original)
        return message

    def _remember(self, request_id: str, fix_id: str, undo_data: dict) -> None:
        self.undo_records[request_id] = {"fix_id": fix_id, "data": undo_data}
        if "revert_at" in undo_data:
            self.reverts.append({"request_id": request_id, "at": float(undo_data["revert_at"])})
        self.save(self.config)

    def _forget(self, request_id: str) -> None:
        self.undo_records.pop(request_id, None)
        self.config["timed_reverts"] = [r for r in self.reverts if r["request_id"] != request_id]
        self.save(self.config)

    async def revert_due(self, now: float | None = None) -> None:
        """Undo timed fixes whose time is up, and tell the API."""
        now = time.time() if now is None else now
        for due in [r for r in self.reverts if r["at"] <= now]:
            request_id = due["request_id"]
            record = self.undo_records.get(request_id)
            if record:
                try:
                    await asyncio.to_thread(fix_impl.undo_fix, record["fix_id"], record["data"])
                    logger.info(f"Timed fix {record['fix_id']} ended; settings restored")
                except fix_impl.FixError as e:
                    logger.warning(f"Couldn't end timed fix {request_id}: {e}")
            self._forget(request_id)
            try:
                await self.client.post(f"{self.api}/api/v1/agent/fixes/{request_id}/reverted", headers=self.headers)
            except httpx.HTTPError as e:
                logger.debug(f"Couldn't report timed fix {request_id} ending: {e}")

    async def report(self, request_id: str, status: str, message: str, undo_data: dict | None = None) -> None:
        body = {"status": status, "message": message[:1000], "undo_data": undo_data}
        for attempt in range(3):
            try:
                resp = await self.client.post(
                    f"{self.api}/api/v1/agent/fixes/{request_id}/result", headers=self.headers, json=body,
                )
                if resp.status_code < 500:
                    return
            except httpx.HTTPError as e:
                logger.debug(f"Reporting fix result failed: {e}")
            await asyncio.sleep(2 * (attempt + 1))
        logger.warning(f"Couldn't report the result of fix {request_id}")

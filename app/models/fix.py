"""A fix (from app.core.fix_catalogue) requested for one device, and what became of it."""

from datetime import datetime, timezone
from enum import Enum
from typing import Any, Optional

from beanie import Document, Indexed, PydanticObjectId
from pydantic import Field
from pymongo import ASCENDING, DESCENDING, IndexModel


class FixStatus(str, Enum):
    QUEUED = "queued"        # waiting for the PC's agent to pick it up
    RUNNING = "running"      # the agent has it (and, for big fixes, is asking on the PC)
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    DECLINED = "declined"    # someone at the PC said "Not now"
    CANCELLED = "cancelled"  # the user cancelled it before the agent picked it up
    EXPIRED = "expired"      # the PC didn't pick it up in time


FINAL_STATUSES = {FixStatus.SUCCEEDED, FixStatus.FAILED, FixStatus.DECLINED, FixStatus.CANCELLED, FixStatus.EXPIRED}


class FixRequest(Document):
    user_id: Indexed(PydanticObjectId)
    device_id: Indexed(PydanticObjectId)
    fix_id: str = Field(..., max_length=64, description="Catalogue fix id")
    params: dict[str, Any] = Field(default_factory=dict)
    alert_id: Optional[PydanticObjectId] = None
    needs_pc_approval: bool = False

    # Set when this request undoes an earlier one.
    undo_of: Optional[PydanticObjectId] = None
    # Only whether the agent kept an undo record; the details stay on the PC.
    undo_data: Optional[dict[str, Any]] = Field(None, description="Set when the agent can undo this fix")

    status: FixStatus = FixStatus.QUEUED
    message: Optional[str] = Field(None, max_length=1000, description="Plain-language result from the agent")
    undone_by: Optional[PydanticObjectId] = Field(None, description="The request that undid this one")
    reverted_at: Optional[datetime] = Field(None, description="When the agent undid a timed fix by itself")

    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None

    class Settings:
        name = "fix_requests"
        indexes = [
            IndexModel([("device_id", ASCENDING), ("status", ASCENDING), ("created_at", ASCENDING)], name="device_status_created"),
            IndexModel([("user_id", ASCENDING), ("created_at", DESCENDING)], name="user_created"),
        ]

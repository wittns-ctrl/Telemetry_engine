"""
Download of the Windows agent (lectio-agent.exe) straight from this API.

The file is built on Windows with agent/build_exe.py, which also copies it to
downloads/lectio-agent.exe. The API hands out whatever file sits at
AGENT_DOWNLOAD_PATH, so publishing a new agent means replacing that one file;
no restart is needed. Both endpoints are public: the landing page links here
before anyone has an account.
"""

import hashlib
import threading
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, HTTPException, status
from fastapi.responses import FileResponse
from pydantic import BaseModel

from app.core.config import settings

router = APIRouter(tags=["Agent Download"])

FILENAME = "lectio-agent.exe"

# sha256 is worked out once per file version (path, size, modified time).
_digest_lock = threading.Lock()
_digest_cache: dict[tuple, str] = {}


class AgentDownloadInfo(BaseModel):
    available: bool
    filename: str = FILENAME
    size_mb: float | None = None
    updated_at: datetime | None = None
    sha256: str | None = None


def _agent_file() -> Path | None:
    path = Path(settings.AGENT_DOWNLOAD_PATH)
    return path if path.is_file() else None


def _sha256(path: Path) -> str:
    stat = path.stat()
    key = (str(path.resolve()), stat.st_size, stat.st_mtime_ns)
    with _digest_lock:
        if key not in _digest_cache:
            digest = hashlib.sha256()
            with path.open("rb") as f:
                for chunk in iter(lambda: f.read(1 << 20), b""):
                    digest.update(chunk)
            _digest_cache.clear()  # only the current file is ever asked about
            _digest_cache[key] = digest.hexdigest()
        return _digest_cache[key]


@router.get(
    "/agent/download/info",
    response_model=AgentDownloadInfo,
    summary="Is the Windows Agent Available",
)
def agent_download_info() -> AgentDownloadInfo:
    path = _agent_file()
    if path is None:
        return AgentDownloadInfo(available=False)
    stat = path.stat()
    return AgentDownloadInfo(
        available=True,
        size_mb=round(stat.st_size / 1_048_576, 1),
        updated_at=datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc),
        sha256=_sha256(path),
    )


@router.get(
    "/agent/download",
    summary="Download the Windows Agent",
    response_class=FileResponse,
    responses={404: {"description": "No agent has been published on this server yet"}},
)
def download_agent() -> FileResponse:
    path = _agent_file()
    if path is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="The Windows agent isn't available on this server yet.",
        )
    return FileResponse(
        path,
        media_type="application/vnd.microsoft.portable-executable",
        filename=FILENAME,  # sent as Content-Disposition: attachment
        headers={"Cache-Control": "no-cache", "X-Content-Type-Options": "nosniff"},
    )

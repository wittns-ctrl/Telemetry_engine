"""
Accept gzip-compressed request bodies (Content-Encoding: gzip).

The agent compresses its uploads (JSON readings shrink to about a fifth),
saving the PC's data and the API's bandwidth. The body is unpacked here before
FastAPI reads it, with a size cap so a tiny compressed body can't expand into
gigabytes (a "zip bomb"): over the cap is 413, a broken body 400.
"""

import json
import zlib

MAX_UNPACKED = 8 * 1024 * 1024  # a 100-reading batch is well under 1 MB


class GzipRequestMiddleware:
    def __init__(self, app, max_size: int = MAX_UNPACKED):
        self.app = app
        self.max_size = max_size

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        headers = dict(scope.get("headers") or [])
        if headers.get(b"content-encoding", b"").strip().lower() != b"gzip":
            await self.app(scope, receive, send)
            return

        packed = bytearray()
        while True:
            message = await receive()
            if message["type"] == "http.disconnect":
                return
            packed += message.get("body", b"")
            if len(packed) > self.max_size:
                await _reply(send, 413, "The request is too large.")
                return
            if not message.get("more_body"):
                break

        unpacker = zlib.decompressobj(16 + zlib.MAX_WBITS)  # gzip framing
        try:
            body = unpacker.decompress(bytes(packed), self.max_size + 1)
            if len(body) > self.max_size or unpacker.unconsumed_tail:
                await _reply(send, 413, "The request is too large.")
                return
            body += unpacker.flush()
        except zlib.error:
            await _reply(send, 400, "The request body isn't valid gzip.")
            return

        new_headers = [(k, v) for k, v in scope["headers"] if k not in (b"content-encoding", b"content-length")]
        new_headers.append((b"content-length", str(len(body)).encode()))
        scope = {**scope, "headers": new_headers}
        sent = False

        async def replay():
            nonlocal sent
            if not sent:
                sent = True
                return {"type": "http.request", "body": body, "more_body": False}
            return await receive()

        await self.app(scope, replay, send)


async def _reply(send, status: int, detail: str) -> None:
    payload = json.dumps({"detail": detail}).encode()
    await send({"type": "http.response.start", "status": status,
                "headers": [(b"content-type", b"application/json"), (b"content-length", str(len(payload)).encode())]})
    await send({"type": "http.response.body", "body": payload})

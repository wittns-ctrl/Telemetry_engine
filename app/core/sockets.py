from fastapi import WebSocket


class ConnectionManager:
    """Legacy /ws/alerts sockets, keyed by the user that opened them.

    Messages only go to the owning user's sockets so one account never sees
    another account's metrics or alerts.
    """

    def __init__(self):
        self._connections: dict[str, list[WebSocket]] = {}

    @property
    def active_connections(self) -> list[WebSocket]:
        return [ws for sockets in self._connections.values() for ws in sockets]

    async def connect(self, websocket: WebSocket, user_id: str):
        await websocket.accept()
        self._connections.setdefault(user_id, []).append(websocket)

    def disconnect(self, websocket: WebSocket, user_id: str):
        sockets = self._connections.get(user_id)
        if not sockets:
            return
        if websocket in sockets:
            sockets.remove(websocket)
        if not sockets:
            del self._connections[user_id]

    async def send_to_user(self, user_id: str, message: dict):
        for connection in list(self._connections.get(user_id, [])):
            try:
                await connection.send_json(message)
            except Exception:
                self.disconnect(connection, user_id)

    async def disconnect_user(self, user_id: str, reason: str = "Account deleted"):
        """Close and forget every socket belonging to one user."""
        for websocket in self._connections.pop(user_id, []):
            try:
                await websocket.close(code=1000, reason=reason)
            except Exception:
                pass


manager = ConnectionManager()

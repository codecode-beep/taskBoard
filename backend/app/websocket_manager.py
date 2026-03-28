import asyncio
import json
import uuid
from collections import defaultdict
from typing import Any

from fastapi import WebSocket


class WebSocketManager:
    """Board-scoped WebSocket fan-out and presence."""

    def __init__(self) -> None:
        self._board_connections: dict[str, dict[str, WebSocket]] = defaultdict(dict)
        self._conn_board: dict[str, str] = {}
        self._conn_user: dict[str, str] = {}
        self._lock = asyncio.Lock()

    async def connect(self, board_id: str, user_id: str, websocket: WebSocket) -> str:
        await websocket.accept()
        conn_id = str(uuid.uuid4())
        async with self._lock:
            self._board_connections[board_id][conn_id] = websocket
            self._conn_board[conn_id] = board_id
            self._conn_user[conn_id] = user_id
        await self._broadcast_presence(board_id)
        return conn_id

    async def disconnect(self, conn_id: str) -> None:
        board_id: str | None = None
        async with self._lock:
            board_id = self._conn_board.pop(conn_id, None)
            self._conn_user.pop(conn_id, None)
            if board_id and conn_id in self._board_connections.get(board_id, {}):
                del self._board_connections[board_id][conn_id]
                if not self._board_connections[board_id]:
                    del self._board_connections[board_id]
        if board_id:
            await self._broadcast_presence(board_id)

    def active_user_ids(self, board_id: str) -> set[str]:
        users: set[str] = set()
        for cid, bid in self._conn_board.items():
            if bid == board_id:
                uid = self._conn_user.get(cid)
                if uid:
                    users.add(uid)
        return users

    async def broadcast_board(self, board_id: str, message: dict[str, Any]) -> None:
        payload = json.dumps(message, default=str)
        conns = list(self._board_connections.get(board_id, {}).items())
        for _, ws in conns:
            try:
                await ws.send_text(payload)
            except Exception:
                pass

    async def _broadcast_presence(self, board_id: str) -> None:
        users = sorted(self.active_user_ids(board_id))
        await self.broadcast_board(board_id, {"type": "presence", "user_ids": users})


ws_manager = WebSocketManager()

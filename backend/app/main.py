from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import cors_origin_list
from app.core.exceptions import AppHTTPException
from app.db.connection import close_mongo, connect_mongo, get_database
from app.routers import activity, ai, auth, boards, columns, comments, labels, notifications, tasks, users
from app.core.security import decode_token
from app.services import board_service, user_service
from app.websocket_manager import ws_manager


@asynccontextmanager
async def lifespan(app: FastAPI):
    await connect_mongo()
    db = get_database()
    await db["users"].create_index("email", unique=True)
    await db["users"].create_index("username", unique=True)
    await db["columns"].create_index([("board_id", 1), ("order", 1)])
    await db["tasks"].create_index([("board_id", 1), ("column_id", 1), ("order", 1)])
    await db["tasks"].create_index([("board_id", 1)])
    await db["activity_logs"].create_index([("board_id", 1), ("created_at", -1)])
    await db["activity_logs"].create_index([("task_id", 1), ("created_at", -1)])
    await db["notifications"].create_index([("user_id", 1), ("created_at", -1)])
    yield
    await close_mongo()


app = FastAPI(title="Task Board API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origin_list(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(AppHTTPException)
async def app_http_handler(_, exc: AppHTTPException):
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})


app.include_router(auth.router, prefix="/api/v1")
app.include_router(users.router, prefix="/api/v1")
app.include_router(boards.router, prefix="/api/v1")
app.include_router(columns.router, prefix="/api/v1")
app.include_router(tasks.router, prefix="/api/v1")
app.include_router(labels.router, prefix="/api/v1")
app.include_router(comments.router, prefix="/api/v1")
app.include_router(activity.router, prefix="/api/v1")
app.include_router(notifications.router, prefix="/api/v1")
app.include_router(ai.router, prefix="/api/v1")


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.websocket("/ws/boards/{board_id}")
async def board_ws(websocket: WebSocket, board_id: str):
    token = websocket.query_params.get("token")
    if not token:
        await websocket.close(code=4401)
        return
    user_id = decode_token(token)
    if not user_id:
        await websocket.close(code=4401)
        return
    db = get_database()
    user = await user_service.get_user_by_id(db, user_id)
    if not user:
        await websocket.close(code=4401)
        return
    doc = await board_service.get_board_doc(db, board_id)
    if not doc:
        await websocket.close(code=4404)
        return
    try:
        board_service.require_board_member(doc, user_id)
    except AppHTTPException:
        await websocket.close(code=4403)
        return

    conn_id = await ws_manager.connect(board_id, user_id, websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        await ws_manager.disconnect(conn_id)

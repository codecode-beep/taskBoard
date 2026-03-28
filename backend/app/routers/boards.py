from fastapi import APIRouter
from fastapi.responses import JSONResponse

from app.dependencies import CurrentUser, Db
from app.models.board import BoardCreate, BoardOut, InviteMember, MemberRoleUpdate
from app.services import board_service

router = APIRouter(prefix="/boards", tags=["boards"])


@router.post("", response_model=BoardOut)
async def create_board(db: Db, user: CurrentUser, body: BoardCreate) -> BoardOut:
    return await board_service.create_board(db, user.id, body)


@router.get("", response_model=list[BoardOut])
async def list_boards(db: Db, user: CurrentUser) -> list[BoardOut]:
    return await board_service.list_boards_for_user(db, user.id)


@router.get("/{board_id}", response_model=BoardOut)
async def get_board(db: Db, user: CurrentUser, board_id: str) -> BoardOut:
    doc = await board_service.get_board_doc(db, board_id)
    if not doc:
        from app.core.exceptions import not_found

        raise not_found("Board")
    board_service.require_board_member(doc, user.id)
    return board_service.board_to_out(doc)


@router.post("/{board_id}/invite", response_model=BoardOut)
async def invite(db: Db, user: CurrentUser, board_id: str, body: InviteMember) -> BoardOut:
    return await board_service.invite_member(db, board_id, user.id, body)


@router.patch("/{board_id}/members", response_model=BoardOut)
async def update_member(
    db: Db, user: CurrentUser, board_id: str, body: MemberRoleUpdate
) -> BoardOut:
    return await board_service.update_member_role(db, board_id, user.id, body)


@router.delete("/{board_id}/members/{member_user_id}", response_model=BoardOut)
async def remove_member(
    db: Db, user: CurrentUser, board_id: str, member_user_id: str
) -> BoardOut:
    return await board_service.remove_member(db, board_id, user.id, member_user_id)


@router.get("/{board_id}/export")
async def export_board(db: Db, user: CurrentUser, board_id: str) -> JSONResponse:
    data = await board_service.export_board_json(db, board_id, user.id)
    return JSONResponse(content=data)


@router.get("/{board_id}/analytics")
async def analytics(db: Db, user: CurrentUser, board_id: str) -> dict:
    from bson import ObjectId

    from app.core.exceptions import not_found

    doc = await board_service.get_board_doc(db, board_id)
    if not doc:
        raise not_found("Board")
    board_service.require_board_member(doc, user.id)
    bid = ObjectId(board_id)
    pipeline = [
        {"$match": {"board_id": bid}},
        {"$group": {"_id": "$column_id", "count": {"$sum": 1}}},
    ]
    rows = await db["tasks"].aggregate(pipeline).to_list(100)
    cols = await db["columns"].find({"board_id": bid}).to_list(100)
    col_names = {str(c["_id"]): c["name"] for c in cols}
    return {
        "by_column": [
            {"column_id": str(r["_id"]), "name": col_names.get(str(r["_id"]), "?"), "count": r["count"]}
            for r in rows
        ]
    }

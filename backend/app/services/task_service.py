from datetime import date, datetime, timezone

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.exceptions import bad_request, not_found
from app.models.activity import ActivityAction
from app.models.task import Priority, TaskBatchReorder, TaskCreate, TaskOut, TaskUpdate
from app.services import activity_service, board_service, notification_service
from app.utils.mongo import oid_str

PRIORITY_RANK = {Priority.high.value: 0, Priority.medium.value: 1, Priority.low.value: 2}


def task_to_out(doc: dict) -> TaskOut:
    due = doc.get("due_date")
    if isinstance(due, datetime):
        due = due.date()
    return TaskOut(
        id=oid_str(doc["_id"]),
        board_id=oid_str(doc["board_id"]),
        column_id=oid_str(doc["column_id"]),
        title=doc["title"],
        description=doc.get("description") or "",
        priority=Priority(doc["priority"]),
        due_date=due,
        assignee_id=oid_str(doc["assignee_id"]) if doc.get("assignee_id") else None,
        label_ids=[oid_str(x) for x in doc.get("label_ids", [])],
        order=doc.get("order", 0),
        created_at=doc["created_at"],
        updated_at=doc.get("updated_at") or doc["created_at"],
    )


async def _next_task_order(db: AsyncIOMotorDatabase, board_id: str, column_id: str) -> int:
    bid = ObjectId(board_id)
    cid = ObjectId(column_id)
    last = await db["tasks"].find({"board_id": bid, "column_id": cid}).sort("order", -1).limit(1).to_list(1)
    return (last[0]["order"] + 1) if last else 0


async def create_task(db: AsyncIOMotorDatabase, board_id: str, user_id: str, data: TaskCreate) -> TaskOut:
    b = await board_service.get_board_doc(db, board_id)
    if not b:
        raise not_found("Board")
    board_service.require_board_member(b, user_id)

    bid = ObjectId(board_id)
    cid = ObjectId(data.column_id)
    col = await db["columns"].find_one({"_id": cid, "board_id": bid})
    if not col:
        raise bad_request("Invalid column")

    now = datetime.now(timezone.utc)
    order = await _next_task_order(db, board_id, data.column_id)
    due = data.due_date
    if due:
        due_store = datetime(due.year, due.month, due.day, tzinfo=timezone.utc)
    else:
        due_store = None

    label_oids = []
    for lid in data.label_ids:
        try:
            label_oids.append(ObjectId(lid))
        except Exception:
            continue
    if data.assignee_id:
        try:
            assignee_oid = ObjectId(data.assignee_id)
        except Exception:
            raise bad_request("Invalid assignee")
    else:
        assignee_oid = None

    doc = {
        "board_id": bid,
        "column_id": cid,
        "title": data.title.strip(),
        "description": data.description or "",
        "priority": data.priority.value,
        "due_date": due_store,
        "assignee_id": assignee_oid,
        "label_ids": label_oids,
        "order": order,
        "created_at": now,
        "updated_at": now,
    }
    res = await db["tasks"].insert_one(doc)
    inserted = await db["tasks"].find_one({"_id": res.inserted_id})
    await activity_service.log_activity(
        db,
        board_id=board_id,
        task_id=str(res.inserted_id),
        user_id=user_id,
        action=ActivityAction.task_created,
        details={"title": data.title},
    )
    if data.assignee_id and data.assignee_id != user_id:
        await notification_service.create_notification(
            db,
            user_id=data.assignee_id,
            type_="assignment",
            message=f"You were assigned: {data.title}",
            board_id=board_id,
            task_id=str(res.inserted_id),
        )
    return task_to_out(inserted)


async def get_task(db: AsyncIOMotorDatabase, task_id: str, user_id: str) -> TaskOut:
    try:
        tid = ObjectId(task_id)
    except Exception:
        raise not_found("Task")
    doc = await db["tasks"].find_one({"_id": tid})
    if not doc:
        raise not_found("Task")
    b = await board_service.get_board_doc(db, oid_str(doc["board_id"]))
    if not b:
        raise not_found("Task")
    board_service.require_board_member(b, user_id)
    return task_to_out(doc)


async def update_task(db: AsyncIOMotorDatabase, task_id: str, user_id: str, data: TaskUpdate) -> TaskOut:
    try:
        tid = ObjectId(task_id)
    except Exception:
        raise not_found("Task")
    doc = await db["tasks"].find_one({"_id": tid})
    if not doc:
        raise not_found("Task")
    b = await board_service.get_board_doc(db, oid_str(doc["board_id"]))
    if not b:
        raise not_found("Task")
    board_service.require_board_member(b, user_id)

    board_id = oid_str(doc["board_id"])
    patch: dict = {}
    details_changes: dict = {}

    if data.title is not None:
        patch["title"] = data.title.strip()
        details_changes["title"] = data.title
    if data.description is not None:
        patch["description"] = data.description
        details_changes["description"] = True
    if data.priority is not None:
        patch["priority"] = data.priority.value
        details_changes["priority"] = data.priority.value
    if data.due_date is not None:
        d = data.due_date
        patch["due_date"] = datetime(d.year, d.month, d.day, tzinfo=timezone.utc)
        details_changes["due_date"] = str(data.due_date)
    if data.assignee_id is not None:
        if data.assignee_id == "":
            patch["assignee_id"] = None
        else:
            try:
                patch["assignee_id"] = ObjectId(data.assignee_id)
            except Exception:
                raise bad_request("Invalid assignee")
        details_changes["assignee_id"] = data.assignee_id or None
    if data.label_ids is not None:
        patch["label_ids"] = []
        for lid in data.label_ids:
            try:
                patch["label_ids"].append(ObjectId(lid))
            except Exception:
                continue
        details_changes["label_ids"] = data.label_ids
    if data.column_id is not None:
        new_cid = ObjectId(data.column_id)
        col = await db["columns"].find_one({"_id": new_cid, "board_id": doc["board_id"]})
        if not col:
            raise bad_request("Invalid column")
        if oid_str(doc["column_id"]) != data.column_id:
            patch["column_id"] = new_cid
            if data.order is None:
                patch["order"] = await _next_task_order(db, board_id, data.column_id)
            details_changes["column_id"] = data.column_id
    if data.order is not None:
        patch["order"] = data.order

    if not patch:
        return task_to_out(doc)

    old_assignee = oid_str(doc["assignee_id"]) if doc.get("assignee_id") else None
    patch["updated_at"] = datetime.now(timezone.utc)
    await db["tasks"].update_one({"_id": tid}, {"$set": patch})
    updated = await db["tasks"].find_one({"_id": tid})

    if "column_id" in details_changes:
        await activity_service.log_activity(
            db,
            board_id=board_id,
            task_id=task_id,
            user_id=user_id,
            action=ActivityAction.status_changed,
            details={"to_column_id": details_changes["column_id"]},
        )
    elif details_changes:
        await activity_service.log_activity(
            db,
            board_id=board_id,
            task_id=task_id,
            user_id=user_id,
            action=ActivityAction.task_updated,
            details=details_changes,
        )

    new_assignee = oid_str(updated["assignee_id"]) if updated.get("assignee_id") else None
    if new_assignee and new_assignee != old_assignee and new_assignee != user_id:
        await notification_service.create_notification(
            db,
            user_id=new_assignee,
            type_="assignment",
            message=f"You were assigned: {updated['title']}",
            board_id=board_id,
            task_id=task_id,
        )
    elif old_assignee and new_assignee != old_assignee and old_assignee != user_id:
        await notification_service.create_notification(
            db,
            user_id=old_assignee,
            type_="task_update",
            message=f"Unassigned from: {updated['title']}",
            board_id=board_id,
            task_id=task_id,
        )

    return task_to_out(updated)


async def delete_task(db: AsyncIOMotorDatabase, task_id: str, user_id: str) -> None:
    try:
        tid = ObjectId(task_id)
    except Exception:
        raise not_found("Task")
    doc = await db["tasks"].find_one({"_id": tid})
    if not doc:
        raise not_found("Task")
    b = await board_service.get_board_doc(db, oid_str(doc["board_id"]))
    if not b:
        raise not_found("Task")
    board_service.require_board_member(b, user_id)
    board_id = oid_str(doc["board_id"])
    await db["comments"].delete_many({"task_id": tid})
    await db["activity_logs"].delete_many({"task_id": tid})
    await db["tasks"].delete_one({"_id": tid})
    await activity_service.log_activity(
        db,
        board_id=board_id,
        task_id=None,
        user_id=user_id,
        action=ActivityAction.task_deleted,
        details={"task_id": task_id, "title": doc.get("title")},
    )


async def list_tasks(
    db: AsyncIOMotorDatabase,
    board_id: str,
    user_id: str,
    *,
    q: str | None = None,
    priority: str | None = None,
    column_id: str | None = None,
    assignee_id: str | None = None,
    label_id: str | None = None,
    sort: str | None = None,
) -> list[TaskOut]:
    b = await board_service.get_board_doc(db, board_id)
    if not b:
        raise not_found("Board")
    board_service.require_board_member(b, user_id)

    filt: dict = {"board_id": ObjectId(board_id)}
    if priority:
        filt["priority"] = priority
    if column_id:
        filt["column_id"] = ObjectId(column_id)
    if assignee_id:
        filt["assignee_id"] = ObjectId(assignee_id)
    if label_id:
        filt["label_ids"] = ObjectId(label_id)

    cursor = db["tasks"].find(filt)
    tasks = [task_to_out(t) async for t in cursor]

    if q:
        ql = q.lower()
        tasks = [t for t in tasks if ql in t.title.lower() or ql in (t.description or "").lower()]

    col_docs = await db["columns"].find({"board_id": ObjectId(board_id)}).sort("order", 1).to_list(200)
    col_rank = {oid_str(c["_id"]): i for i, c in enumerate(col_docs)}

    if sort == "due_date_asc":
        tasks.sort(key=lambda t: (t.due_date or date.max, t.title.lower()))
    elif sort == "due_date_desc":
        tasks.sort(key=lambda t: (t.due_date or date.min, t.title.lower()), reverse=True)
    elif sort == "priority_asc":
        tasks.sort(key=lambda t: (PRIORITY_RANK[t.priority.value], t.title.lower()))
    elif sort == "priority_desc":
        tasks.sort(key=lambda t: (PRIORITY_RANK[t.priority.value], t.title.lower()), reverse=True)
    else:
        tasks.sort(key=lambda t: (col_rank.get(t.column_id, 999), t.order, t.title.lower()))

    return tasks


async def batch_reorder(db: AsyncIOMotorDatabase, board_id: str, user_id: str, body: TaskBatchReorder) -> list[TaskOut]:
    b = await board_service.get_board_doc(db, board_id)
    if not b:
        raise not_found("Board")
    board_service.require_board_member(b, user_id)
    bid = ObjectId(board_id)
    now = datetime.now(timezone.utc)

    for item in body.items:
        try:
            tid = ObjectId(item.task_id)
            cid = ObjectId(item.column_id)
        except Exception:
            raise bad_request("Invalid task or column id")
        t = await db["tasks"].find_one({"_id": tid, "board_id": bid})
        if not t:
            raise bad_request("Task not on board")
        col = await db["columns"].find_one({"_id": cid, "board_id": bid})
        if not col:
            raise bad_request("Column not on board")
        await db["tasks"].update_one(
            {"_id": tid},
            {"$set": {"column_id": cid, "order": item.order, "updated_at": now}},
        )

    return await list_tasks(db, board_id, user_id)

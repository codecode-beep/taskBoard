from bson import ObjectId


def oid_str(oid: ObjectId | str | None) -> str | None:
    if oid is None:
        return None
    return str(oid)


def to_oid(id_str: str) -> ObjectId:
    try:
        return ObjectId(id_str)
    except Exception as exc:
        raise ValueError("Invalid id") from exc

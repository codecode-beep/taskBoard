from fastapi import HTTPException, status


class AppHTTPException(HTTPException):
    def __init__(self, status_code: int, detail: str):
        super().__init__(status_code=status_code, detail=detail)


def not_found(resource: str = "Resource") -> AppHTTPException:
    return AppHTTPException(status.HTTP_404_NOT_FOUND, f"{resource} not found")


def forbidden(detail: str = "Not allowed") -> AppHTTPException:
    return AppHTTPException(status.HTTP_403_FORBIDDEN, detail)


def bad_request(detail: str) -> AppHTTPException:
    return AppHTTPException(status.HTTP_400_BAD_REQUEST, detail)


def unauthorized(detail: str = "Could not validate credentials") -> AppHTTPException:
    return AppHTTPException(status.HTTP_401_UNAUTHORIZED, detail)

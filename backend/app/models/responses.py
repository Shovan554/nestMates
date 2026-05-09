from typing import Generic, TypeVar

from pydantic import BaseModel

T = TypeVar("T")


class ApiResponse(BaseModel, Generic[T]):
    data: T | None = None
    error: str | None = None


def ok(data: T) -> ApiResponse[T]:
    return ApiResponse[T](data=data, error=None)


def err(message: str) -> ApiResponse:
    return ApiResponse(data=None, error=message)

from typing import Any, Literal

from delta import Delta
from pydantic import BaseModel, Field

from . import exceptions


class Change(BaseModel):
    version: int = Field(default=0, ge=0)
    ops: list[dict]


class Batch(BaseModel):
    changes: dict[str, Change]


class Metadata(BaseModel):
    version: int = Field(default=0, ge=0)


class Page(BaseModel):
    metadata: Metadata
    data: list

    def __contains__(self, item: str) -> bool:
        for op in self.data:
            if "insert" not in op:
                continue
            if not isinstance(op["insert"], str):
                continue
            if item.lower() in op["insert"].lower():
                return True
        return False

    def attachments(self) -> list[str]:
        images = []
        for op in self.data:
            if "insert" not in op:
                continue
            if not isinstance(op["insert"], dict):
                continue
            if "image" not in op["insert"]:
                continue
            url = op["insert"]["image"]
            file_name = url.split("/")[-1]
            images.append(file_name)
        return images

    def change(self, change: Change) -> None:
        if change.version <= self.metadata.version:
            raise exceptions.PageChangeConflictError(
                f"Change rejected: version {change.version} must be greater than current version {self.metadata.version}"
            )
        self.data = Delta(self.data).compose(Delta(change.ops)).ops
        self.metadata.version = change.version

    @classmethod
    def create(cls, title: str) -> "Page":
        data = [
            {"insert": title},
            {"insert": "\n", "attributes": {"header": 1}},
            {"insert": "\n\n"},
        ]
        return cls(metadata=Metadata(), data=data)


class Patch(BaseModel):
    type: Literal["move"]
    data: Any

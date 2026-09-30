from pydantic import BaseModel
from typing import List, Optional, Literal


class Element(BaseModel):
    id: str
    role: str
    label: Optional[str] = None
    text: Optional[str] = None
    value: Optional[str] = None
    sensitive: bool = False


class PageInfo(BaseModel):
    url: str
    title: str
    elements: List[Element]


class ReasonRequest(BaseModel):
    task_id: str
    goal: str
    step: int
    page: PageInfo


class Action(BaseModel):
    action: Literal[
        "click",
        "type",
        "select",
        "scroll",
        "wait",
        "finish",
        "ask_user"
    ]
    target_id: Optional[str] = None
    value: Optional[str] = None
    reason: str
    confidence: float
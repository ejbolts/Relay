from __future__ import annotations

from typing import Annotated, Any, Literal, get_args

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field, ValidationError, model_validator
from sqlalchemy.orm import Session

from .account_limits import limit_save_rate
from .auth import CurrentUser
from .database import get_db
from .training_metrics import get_setting, set_setting

HomeSection = Literal[
    "profile",
    "next-workout",
    "workouts",
    "cardio-sessions",
    "weekly-bodyweight",
    "consistency",
    "muscle-sets",
    "zone2",
    "bodyweight-trend",
    "combined-check-in",
    "bodyweight-check-in",
    "body-fat-check-in",
    "records",
    "friends",
]
SECTION_IDS = list(get_args(HomeSection))
OPTIONAL_CHECK_INS = ["bodyweight-check-in", "body-fat-check-in"]
LAYOUT_KEY = "home_layout"


class CardioGoalCardSettings(BaseModel):
    # None tracks every configured goal; a zone tracks that zone's goal only.
    zone: int | None = Field(default=None, ge=1, le=5)
    style: Literal["progress", "ring", "list"] = "progress"


class HomeSectionSettings(BaseModel):
    """Per-section display options. Add a field here when a section becomes configurable."""

    zone2: CardioGoalCardSettings = Field(default_factory=CardioGoalCardSettings)


class HomeLayout(BaseModel):
    order: list[HomeSection] = Field(
        default_factory=lambda: SECTION_IDS.copy(), max_length=len(SECTION_IDS)
    )
    hidden: list[HomeSection] = Field(
        default_factory=lambda: OPTIONAL_CHECK_INS.copy(), max_length=len(SECTION_IDS)
    )
    widths: dict[HomeSection, Literal["compact", "full", "third"]] = Field(
        default_factory=dict, max_length=len(SECTION_IDS)
    )
    settings: HomeSectionSettings = Field(default_factory=HomeSectionSettings)

    @model_validator(mode="before")
    @classmethod
    def migrate_check_in_sections(cls, value: Any) -> Any:
        if not isinstance(value, dict):
            return value
        result = dict(value)
        # Keep the old card's exact position, visibility and width. New alternatives
        # start in Add sections rather than appearing alongside the migrated card.
        for key in ("order", "hidden"):
            if isinstance(result.get(key), list):
                result[key] = [
                    "combined-check-in" if item == "daily-check-in" else item
                    for item in result[key]
                ]
        if isinstance(result.get("widths"), dict):
            result["widths"] = {
                "combined-check-in" if key == "daily-check-in" else key: width
                for key, width in result["widths"].items()
            }
        if isinstance(result.get("order"), list) and isinstance(result.get("hidden", []), list):
            missing = [section for section in OPTIONAL_CHECK_INS if section not in result["order"]]
            result["hidden"] = list(result.get("hidden", [])) + [
                section for section in missing if section not in result.get("hidden", [])
            ]
        return result

    @model_validator(mode="after")
    def validate_sections(self) -> HomeLayout:
        if len(self.order) != len(set(self.order)) or len(self.hidden) != len(set(self.hidden)):
            raise ValueError("Sections must not be repeated.")
        # The profile header leads layouts saved before it existed; other new sections are
        # appended. Neither changes the relative positions of saved sections.
        if "profile" not in self.order:
            self.order.insert(0, "profile")
        # Append newly introduced sections without changing existing saved positions.
        self.order.extend(section for section in SECTION_IDS if section not in self.order)
        return self


router = APIRouter(prefix="/api/home-layout", tags=["home layout"])
DbSession = Annotated[Session, Depends(get_db)]


@router.get("", response_model=HomeLayout)
def get_home_layout(db: DbSession, user: CurrentUser) -> HomeLayout:
    try:
        return HomeLayout.model_validate_json(get_setting(db, user.id, LAYOUT_KEY, "{}"))
    except ValidationError:
        return HomeLayout()


@router.put("", response_model=HomeLayout, dependencies=[Depends(limit_save_rate)])
def save_home_layout(payload: HomeLayout, db: DbSession, user: CurrentUser) -> HomeLayout:
    set_setting(db, user.id, LAYOUT_KEY, payload.model_dump_json())
    db.commit()
    return payload

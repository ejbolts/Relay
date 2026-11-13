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
    "training-block",
    "workouts",
    "cardio-sessions",
    "weekly-bodyweight",
    "weekly-review",
    "this-week",
    "consistency",
    "muscle-sets",
    "zone2",
    "bodyweight-trend",
    "combined-check-in",
    "records",
    "friends",
]
SECTION_IDS = list(get_args(HomeSection))
OPTIONAL_CHECK_INS: list[str] = []
LAYOUT_KEY = "home_layout"


class CardioGoalCardSettings(BaseModel):
    # None tracks every configured goal; a zone tracks that zone's goal only.
    zone: int | None = Field(default=None, ge=1, le=5)
    style: Literal["progress", "ring", "list"] = "progress"


class TrainingBlockCardSettings(BaseModel):
    style: Literal["progress", "timeline", "both"] = "both"


class BodyCheckInSettings(BaseModel):
    mode: Literal["weight", "fat", "combined", "combined-single"] = "combined"


class HomeSectionSettings(BaseModel):
    """Per-section display options. Add a field here when a section becomes configurable."""

    check_in: BodyCheckInSettings = Field(default_factory=BodyCheckInSettings)
    zone2: CardioGoalCardSettings = Field(default_factory=CardioGoalCardSettings)
    training_block: TrainingBlockCardSettings = Field(default_factory=TrainingBlockCardSettings)


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
        legacy_modes = {
            "daily-check-in": "combined",
            "combined-check-in": "combined",
            "bodyweight-check-in": "weight",
            "body-fat-check-in": "fat",
        }
        order = result.get("order", [])
        hidden = result.get("hidden", [])
        if not isinstance(order, list) or not isinstance(hidden, list):
            return result
        if any(not isinstance(item, str) for item in [*order, *hidden]):
            return result
        if len(order) != len(set(order)) or len(hidden) != len(set(hidden)):
            raise ValueError("Sections must not be repeated.")
        candidates = [item for item in order if item in legacy_modes]
        chosen = next((item for item in candidates if item not in hidden), None)
        chosen = chosen or next(iter(candidates), None)
        if chosen:
            # Keep the first visible check-in's position and width; all-hidden stays hidden.
            result["order"] = [
                "combined-check-in" if item == chosen else item
                for item in order
                if item not in legacy_modes or item == chosen
            ]
            result["hidden"] = [item for item in hidden if item not in legacy_modes]
            if all(item in hidden for item in candidates):
                result["hidden"].append("combined-check-in")
            settings = result.get("settings", {})
            if isinstance(settings, dict):
                result["settings"] = {"check_in": {"mode": legacy_modes[chosen]}, **settings}
        elif any(item in legacy_modes for item in hidden):
            result["hidden"] = [item for item in hidden if item not in legacy_modes]
            result["hidden"].append("combined-check-in")
        if isinstance(result.get("widths"), dict):
            widths = result["widths"]
            result["widths"] = {
                key: width for key, width in widths.items() if key not in legacy_modes
            }
            width_source = chosen or "combined-check-in"
            if width_source in widths:
                result["widths"]["combined-check-in"] = widths[width_source]
        return result

    @model_validator(mode="after")
    def validate_sections(self) -> HomeLayout:
        if len(self.order) != len(set(self.order)) or len(self.hidden) != len(set(self.hidden)):
            raise ValueError("Sections must not be repeated.")
        # The profile header leads layouts saved before it existed; other new sections are
        # appended unless placed below. Neither changes the relative positions of saved sections.
        if "profile" not in self.order:
            self.order.insert(0, "profile")
        # The block indicator belongs beside the next workout rather than at the end. It only
        # renders while a training block exists.
        if "training-block" not in self.order and "next-workout" in self.order:
            self.order.insert(self.order.index("next-workout") + 1, "training-block")
        # This week's strip used to lead the consistency calendar. Layouts saved before it became
        # its own section keep it in that place, hidden whenever the calendar was hidden.
        if "this-week" not in self.order and "consistency" in self.order:
            self.order.insert(self.order.index("consistency"), "this-week")
            if "consistency" in self.hidden and "this-week" not in self.hidden:
                self.hidden.append("this-week")
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

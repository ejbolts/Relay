"""Account-owned date boundaries. Workouts and lifetime records are never moved or reset."""

from __future__ import annotations

from bisect import bisect_right
from datetime import date
from typing import Annotated
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator, model_validator
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .account_limits import limit_save_rate
from .auth import CurrentUser, get_current_user
from .database import get_db
from .models import TrainingWorkout
from .training_metrics import get_setting, set_setting

KEY = "training_blocks"


class BlockInput(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    start_date: date
    # Optional inclusive target used for "days left"; it never ends the block by itself.
    planned_end_date: date | None = None

    @field_validator("name")
    @classmethod
    def clean_name(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Enter a block name.")
        return value.strip()

    @model_validator(mode="after")
    def planned_end_after_start(self) -> BlockInput:
        if self.planned_end_date and self.planned_end_date <= self.start_date:
            raise ValueError("The planned end must be after the start date.")
        return self


class TrainingBlock(BlockInput):
    id: str
    end_date: date | None = None  # Exclusive; the next block owns its start date.


class TrainingBlocks(BaseModel):
    blocks: list[TrainingBlock] = Field(default_factory=list)
    auto_yearly: bool = False


class TrainingBlockRead(TrainingBlock):
    workout_count: int = 0


class TrainingBlocksRead(BaseModel):
    """Response-only view: counts are derived on read and never saved with the boundaries."""

    blocks: list[TrainingBlockRead]
    auto_yearly: bool
    earlier_workout_count: int = 0
    history_start: date | None = None


class BlockPreferences(BaseModel):
    auto_yearly: bool


def training_blocks(db: Session, user_id: str, today: date | None = None) -> TrainingBlocks:
    saved = get_setting(db, user_id, KEY, "")
    config = TrainingBlocks.model_validate_json(saved) if saved else TrainingBlocks()
    today = today or date.today()
    blocks = sorted(config.blocks, key=lambda block: block.start_date)
    if config.auto_yearly and blocks:
        # Deterministic IDs make rollover stable across devices and backup/restore.
        for year in range(blocks[-1].start_date.year + 1, today.year + 1):
            blocks.append(
                TrainingBlock(id=f"year:{year}", name=str(year), start_date=date(year, 1, 1))
            )
    for index, block in enumerate(blocks):
        block.end_date = blocks[index + 1].start_date if index + 1 < len(blocks) else None
    return TrainingBlocks(blocks=blocks, auto_yearly=config.auto_yearly)


def block_on(config: TrainingBlocks, day: date) -> TrainingBlock | None:
    return next((block for block in reversed(config.blocks) if block.start_date <= day), None)


def with_counts(db: Session, user_id: str, config: TrainingBlocks) -> TrainingBlocksRead:
    rows = db.execute(
        select(TrainingWorkout.workout_date, func.count())
        .where(TrainingWorkout.user_id == user_id)
        .group_by(TrainingWorkout.workout_date)
    ).all()
    starts = [block.start_date for block in config.blocks]
    counts = [0] * (len(starts) + 1)  # Index 0 holds workouts before the first block.
    for day, count in rows:
        counts[bisect_right(starts, day)] += count
    return TrainingBlocksRead(
        blocks=[
            TrainingBlockRead(**block.model_dump(), workout_count=counts[index + 1])
            for index, block in enumerate(config.blocks)
        ],
        auto_yearly=config.auto_yearly,
        earlier_workout_count=counts[0],
        history_start=min((day for day, _ in rows), default=None),
    )


def save_blocks(db: Session, user_id: str, config: TrainingBlocks) -> TrainingBlocksRead:
    set_setting(db, user_id, KEY, config.model_dump_json())
    set_setting(db, user_id, "workout_cache_revision", str(uuid4()))
    db.commit()
    return with_counts(db, user_id, training_blocks(db, user_id))


router = APIRouter(
    prefix="/api/training-blocks",
    tags=["training blocks"],
    dependencies=[Depends(get_current_user), Depends(limit_save_rate)],
)
DbSession = Annotated[Session, Depends(get_db)]


@router.get("", response_model=TrainingBlocksRead)
def list_blocks(db: DbSession, user: CurrentUser) -> TrainingBlocksRead:
    return with_counts(db, user.id, training_blocks(db, user.id))


@router.post("", response_model=TrainingBlocksRead, status_code=201)
def create_block(payload: BlockInput, db: DbSession, user: CurrentUser) -> TrainingBlocksRead:
    config = training_blocks(db, user.id)
    if payload.start_date > date.today():
        raise HTTPException(422, "The start date cannot be in the future.")
    if len(config.blocks) >= 200:
        raise HTTPException(422, "You can save up to 200 training blocks.")
    if any(block.start_date == payload.start_date for block in config.blocks):
        raise HTTPException(422, "A training block already starts on that date.")
    config.blocks.append(TrainingBlock(id=str(uuid4()), **payload.model_dump()))
    return save_blocks(db, user.id, config)


@router.put("/{block_id}", response_model=TrainingBlocksRead)
def update_block(
    block_id: str, payload: BlockInput, db: DbSession, user: CurrentUser
) -> TrainingBlocksRead:
    config = training_blocks(db, user.id)
    block = next((block for block in config.blocks if block.id == block_id), None)
    if block is None:
        raise HTTPException(404, "Training block was not found.")
    if payload.start_date > date.today() or any(
        other.id != block_id and other.start_date == payload.start_date for other in config.blocks
    ):
        raise HTTPException(422, "Choose a unique start date that is not in the future.")
    block.name, block.start_date = payload.name, payload.start_date
    block.planned_end_date = payload.planned_end_date
    return save_blocks(db, user.id, config)


@router.delete("/{block_id}", response_model=TrainingBlocksRead)
def delete_block(block_id: str, db: DbSession, user: CurrentUser) -> TrainingBlocksRead:
    config = training_blocks(db, user.id)
    if not any(block.id == block_id for block in config.blocks):
        raise HTTPException(404, "Training block was not found.")
    config.blocks = [block for block in config.blocks if block.id != block_id]
    # Deleting an automatic boundary must not immediately recreate it.
    config.auto_yearly = False
    return save_blocks(db, user.id, config)


@router.patch("", response_model=TrainingBlocksRead)
def update_preferences(
    payload: BlockPreferences, db: DbSession, user: CurrentUser
) -> TrainingBlocksRead:
    config = training_blocks(db, user.id)
    if payload.auto_yearly and not config.blocks:
        raise HTTPException(422, "Start a training block before enabling yearly rollover.")
    config.auto_yearly = payload.auto_yearly
    return save_blocks(db, user.id, config)

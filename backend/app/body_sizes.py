"""Dated, private circumference logs stored with account settings/backups."""

from datetime import date
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, model_validator

Length = Annotated[float, Field(gt=0, le=300, allow_inf_nan=False)]
PREFIX = "body_sizes:"


class BodySizeLog(BaseModel):
    model_config = ConfigDict(extra="forbid")

    measurement_date: date
    neck_cm: Length | None = None
    shoulders_cm: Length | None = None
    chest_cm: Length | None = None
    waist_cm: Length | None = None
    hips_cm: Length | None = None
    left_arm_cm: Length | None = None
    right_arm_cm: Length | None = None
    left_thigh_cm: Length | None = None
    right_thigh_cm: Length | None = None
    left_calf_cm: Length | None = None
    right_calf_cm: Length | None = None
    wrist_cm: Length | None = None
    ankle_cm: Length | None = None

    @model_validator(mode="after")
    def has_measurement(self):
        if not any(
            value is not None
            for key, value in self.model_dump().items()
            if key != "measurement_date"
        ):
            raise ValueError("Enter at least one body measurement.")
        return self

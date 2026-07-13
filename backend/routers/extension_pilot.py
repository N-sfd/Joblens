"""Phase 5 M5 — pilot entitlement view + operator metrics."""

from __future__ import annotations

import os
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from auth import Owner
from database import get_db
from services import extension_auth as ext_auth
from services import extension_flags as flags
from services.extension_config import load_extension_config
from services.pilot_metrics import collect_pilot_metrics

router = APIRouter()


@router.get("/pilot/me")
def pilot_me(owner: Owner = Depends(ext_auth.owner_from_extension_token)):
    """What the connected extension user is allowed to do in this environment."""
    caps = flags.effective_capabilities(owner)
    cfg = load_extension_config()
    return {
        "pilot_user": caps["pilot_user"],
        "environment": os.getenv("ENV", "development"),
        "min_extension_version": cfg.min_extension_version,
        "capabilities": {
            "analyze_form": caps["analyze_form"],
            "save_diagnostic": caps["save_diagnostic"],
            "fill_form": caps["fill_form"],
            "upload_resume": caps["upload_resume"],
            "submit_application": False,
            "record_submission_confirmation": caps["record_submission_confirmation"],
        },
        "message": (
            "You are on the JobLens Greenhouse pilot."
            if caps["pilot_user"] and caps["fill_form"]
            else (
                "Connected, but assisted fill/upload is limited to pilot users in this environment."
                if caps["extension_enabled"] and not caps["fill_form"]
                else "Extension assistance is limited or disabled."
            )
        ),
        "automatic_submission_enabled": False,
    }


class OpsMetricsRequest(BaseModel):
    admin_token: str
    since_hours: Optional[int] = 168


@router.post("/ops/pilot-metrics")
def ops_pilot_metrics(body: OpsMetricsRequest, db: Session = Depends(get_db)):
    expected = os.getenv("EXTENSION_OPS_TOKEN", "").strip()
    if not expected or body.admin_token != expected:
        raise HTTPException(status_code=403, detail="Forbidden.")
    hours = body.since_hours if body.since_hours is not None else 168
    if hours < 1 or hours > 24 * 90:
        raise HTTPException(status_code=422, detail="since_hours must be between 1 and 2160.")
    return collect_pilot_metrics(db, since_hours=hours)


@router.get("/ops/pilot-metrics")
def ops_pilot_metrics_get(
    admin_token: str = Query(...),
    since_hours: int = Query(168, ge=1, le=2160),
    db: Session = Depends(get_db),
):
    expected = os.getenv("EXTENSION_OPS_TOKEN", "").strip()
    if not expected or admin_token != expected:
        raise HTTPException(status_code=403, detail="Forbidden.")
    return collect_pilot_metrics(db, since_hours=since_hours)

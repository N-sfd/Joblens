from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import List

from database import get_db
from models import AiActivity, AiActivityResponse
from auth import Owner, get_owner, owned

router = APIRouter()


@router.get("/", response_model=List[AiActivityResponse])
async def list_activity(
    owner: Owner = Depends(get_owner),
    db: Session = Depends(get_db),
):
    return (
        owned(db.query(AiActivity), AiActivity, owner)
        .order_by(AiActivity.created_at.desc())
        .limit(30)
        .all()
    )


@router.delete("/")
async def clear_activity(
    owner: Owner = Depends(get_owner),
    db: Session = Depends(get_db),
):
    count = owned(db.query(AiActivity), AiActivity, owner).delete(synchronize_session=False)
    db.commit()
    return {"message": f"Deleted {count} activity entries."}

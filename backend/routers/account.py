from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from database import get_db
from models import JobApplication, ResumeAnalysis, JobMatch, CoverLetter, AiActivity
from auth import Owner, get_owner, owned

router = APIRouter()


@router.delete("/data")
async def delete_my_data(
    owner: Owner = Depends(get_owner),
    db: Session = Depends(get_db),
):
    """Wipes every record (jobs, resume analyses, matches, cover letters, activity) owned by the
    current guest session or account, without deleting the account itself. Powers the
    Data Deletion Request page's self-service option for guests and signed-in users alike."""
    total = 0
    for model in (JobApplication, ResumeAnalysis, JobMatch, CoverLetter, AiActivity):
        total += owned(db.query(model), model, owner).delete(synchronize_session=False)
    db.commit()
    return {"message": f"Deleted {total} record(s) across all JobLens tools."}

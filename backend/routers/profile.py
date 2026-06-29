import json

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from database import get_db
from models import User, Profile, ProfileResponse, ProfileUpdate
from auth import get_current_user_required

router = APIRouter()


def _to_response(profile: Profile | None) -> ProfileResponse:
    if profile is None:
        return ProfileResponse(
            phone=None, location=None, headline=None, bio=None,
            skills=[], experience=[], education=[],
            linkedin_url=None, portfolio_url=None, updated_at=None,
        )
    return ProfileResponse(
        phone=profile.phone, location=profile.location,
        headline=profile.headline, bio=profile.bio,
        skills=json.loads(profile.skills) if profile.skills else [],
        experience=json.loads(profile.experience) if profile.experience else [],
        education=json.loads(profile.education) if profile.education else [],
        linkedin_url=profile.linkedin_url, portfolio_url=profile.portfolio_url,
        updated_at=profile.updated_at,
    )


@router.get("/", response_model=ProfileResponse)
async def get_profile(
    current_user: User = Depends(get_current_user_required),
    db: Session = Depends(get_db),
):
    profile = db.query(Profile).filter(Profile.user_id == current_user.id).first()
    return _to_response(profile)


@router.put("/", response_model=ProfileResponse)
async def update_profile(
    body: ProfileUpdate,
    current_user: User = Depends(get_current_user_required),
    db: Session = Depends(get_db),
):
    profile = db.query(Profile).filter(Profile.user_id == current_user.id).first()
    if profile is None:
        profile = Profile(user_id=current_user.id)
        db.add(profile)

    data = body.model_dump(exclude_unset=True)
    for field in ("skills", "experience", "education"):
        if field in data and data[field] is not None:
            value = data[field]
            data[field] = json.dumps([v.model_dump() if hasattr(v, "model_dump") else v for v in value])
    for key, value in data.items():
        setattr(profile, key, value)

    db.commit()
    db.refresh(profile)
    return _to_response(profile)

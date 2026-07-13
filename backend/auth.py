import os
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import Depends, Header, HTTPException, Request
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from database import get_db
from models import User

SECRET_KEY = os.getenv("SECRET_KEY", "dev-insecure-secret-change-me")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_DAYS = 7
COOKIE_NAME = "access_token"

_pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return _pwd_context.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    return _pwd_context.verify(password, password_hash)


def create_access_token(user_id: int) -> str:
    expire = datetime.now(timezone.utc) + timedelta(days=ACCESS_TOKEN_EXPIRE_DAYS)
    return jwt.encode({"sub": str(user_id), "exp": expire}, SECRET_KEY, algorithm=ALGORITHM)


def decode_access_token(token: str) -> Optional[int]:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return int(payload["sub"])
    except (JWTError, KeyError, ValueError):
        return None


def get_current_user_optional(
    request: Request,
    db: Session = Depends(get_db),
) -> Optional[User]:
    token = request.cookies.get(COOKIE_NAME)
    if not token:
        return None
    user_id = decode_access_token(token)
    if user_id is None:
        return None
    return db.query(User).filter(User.id == user_id).first()


def get_current_user_required(
    current_user: Optional[User] = Depends(get_current_user_optional),
) -> User:
    if not current_user:
        raise HTTPException(status_code=401, detail="Not authenticated.")
    return current_user


@dataclass
class Owner:
    user_id: Optional[int] = None
    guest_id: Optional[str] = None


def get_owner(
    x_guest_id: Optional[str] = Header(None, alias="X-Guest-Id"),
    current_user: Optional[User] = Depends(get_current_user_optional),
) -> Owner:
    if current_user:
        return Owner(user_id=current_user.id)
    guest_id = (x_guest_id or "").strip()
    if not guest_id:
        raise HTTPException(
            status_code=400,
            detail="X-Guest-Id header or authentication is required.",
        )
    return Owner(guest_id=guest_id)


def owned(query, model, owner: Owner):
    if owner.user_id is not None:
        return query.filter(model.user_id == owner.user_id)
    return query.filter(model.guest_id == owner.guest_id, model.user_id.is_(None))


def log_activity(db: Session, owner: Owner, activity_type: str, summary: str, detail: Optional[str] = None) -> None:
    from models import AiActivity

    db.add(AiActivity(
        activity_type=activity_type,
        summary=summary,
        detail=detail,
        guest_id=owner.guest_id,
        user_id=owner.user_id,
    ))
    db.commit()


def migrate_guest_data(db: Session, guest_id: Optional[str], user_id: int) -> None:
    """Re-own any rows created as a guest to the newly authenticated user."""
    guest_id = (guest_id or "").strip()
    if not guest_id:
        return
    from models import JobApplication, ResumeAnalysis, JobMatch, CoverLetter, AiActivity, ExtensionDiagnostic, ExtensionToken, ExtensionFillSession, SeekerDocument, ApplicationDocument, ExtensionUploadSession

    for model in (JobApplication, ResumeAnalysis, JobMatch, CoverLetter, AiActivity, ExtensionDiagnostic, ExtensionToken, ExtensionFillSession, SeekerDocument, ApplicationDocument, ExtensionUploadSession):
        db.query(model).filter(
            model.guest_id == guest_id, model.user_id.is_(None)
        ).update({"user_id": user_id, "guest_id": None}, synchronize_session=False)
    db.commit()

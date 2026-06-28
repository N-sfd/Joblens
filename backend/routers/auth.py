import os

from fastapi import APIRouter, Depends, HTTPException, Header, Response
from sqlalchemy.orm import Session
from typing import Optional

from database import get_db
from models import User, SignupRequest, LoginRequest, UserResponse
from auth import (
    hash_password,
    verify_password,
    create_access_token,
    get_current_user_required,
    migrate_guest_data,
    COOKIE_NAME,
)

router = APIRouter()

IS_PRODUCTION = os.getenv("ENV", "development") == "production"


def _set_auth_cookie(response: Response, user_id: int) -> None:
    token = create_access_token(user_id)
    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        httponly=True,
        secure=IS_PRODUCTION,
        samesite="none" if IS_PRODUCTION else "lax",
        max_age=60 * 60 * 24 * 7,
        path="/",
    )


@router.post("/signup", response_model=UserResponse, status_code=201)
async def signup(
    body: SignupRequest,
    response: Response,
    x_guest_id: Optional[str] = Header(None, alias="X-Guest-Id"),
    db: Session = Depends(get_db),
):
    if db.query(User).filter(User.email == body.email).first():
        raise HTTPException(status_code=409, detail="An account with this email already exists.")
    user = User(
        email=body.email,
        password_hash=hash_password(body.password),
        name=body.name,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    migrate_guest_data(db, x_guest_id, user.id)
    _set_auth_cookie(response, user.id)
    return user


@router.post("/login", response_model=UserResponse)
async def login(
    body: LoginRequest,
    response: Response,
    x_guest_id: Optional[str] = Header(None, alias="X-Guest-Id"),
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.email == body.email).first()
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password.")

    migrate_guest_data(db, x_guest_id, user.id)
    _set_auth_cookie(response, user.id)
    return user


@router.post("/logout")
async def logout(response: Response):
    response.delete_cookie(COOKIE_NAME, path="/")
    return {"message": "Logged out."}


@router.get("/me", response_model=UserResponse)
async def me(current_user: User = Depends(get_current_user_required)):
    return current_user


@router.delete("/me")
async def delete_account(
    response: Response,
    current_user: User = Depends(get_current_user_required),
    db: Session = Depends(get_db),
):
    """Permanently deletes the account and every record owned by it (jobs, resume
    analyses, matches, cover letters, activity log) — used by the Data Deletion page."""
    from models import JobApplication, ResumeAnalysis, JobMatch, CoverLetter, AiActivity

    for model in (JobApplication, ResumeAnalysis, JobMatch, CoverLetter, AiActivity):
        db.query(model).filter(model.user_id == current_user.id).delete(synchronize_session=False)
    db.delete(current_user)
    db.commit()

    response.delete_cookie(COOKIE_NAME, path="/")
    return {"message": "Your account and all associated data have been permanently deleted."}

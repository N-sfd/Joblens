"""JobLens job-seeker profile API — own-data only.

Never log work-authorization details, salary answers, sensitive answers,
full profile payloads, or resume contents.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models import (
    User,
    Profile,
    ProfileResponse,
    ProfileUpdate,
    ApplicationAnswer,
    ApplicationAnswerCreate,
    ApplicationAnswerUpdate,
    ApplicationAnswerResponse,
    ProfessionalLinks,
    WorkAuthorization,
    JobPreferences,
    ProjectEntry,
    CertificationEntry,
    ExperienceEntry,
    EducationEntry,
    ProfileDocumentItem,
    ResumeAnalysis,
    CoverLetter,
    ProfileCompletenessResponse,
    ApplicationReadinessResponse,
)
from auth import get_current_user_required
from services.profile_completeness import (
    calculate_completeness,
    calculate_readiness,
    parse_links,
    parse_work_auth,
    parse_job_prefs,
    is_sensitive_key,
    default_reuse_policy,
    REUSE_POLICIES,
)

router = APIRouter()
logger = logging.getLogger(__name__)


def _loads_list(raw) -> list:
    if not raw:
        return []
    try:
        data = json.loads(raw)
        return data if isinstance(data, list) else []
    except (json.JSONDecodeError, TypeError):
        return []


def _dump_models(value) -> str:
    return json.dumps([
        v.model_dump() if hasattr(v, "model_dump") else v for v in (value or [])
    ])


def _is_valid_http_url(value: str | None) -> bool:
    if value is None or not str(value).strip():
        return True  # empty allowed
    try:
        parsed = urlparse(str(value).strip())
        return parsed.scheme in ("http", "https") and bool(parsed.netloc)
    except Exception:
        return False


def _validate_links(links: ProfessionalLinks) -> None:
    for field in ("linkedin", "github", "portfolio", "personal_website", "other"):
        val = getattr(links, field, None)
        if val and not _is_valid_http_url(val):
            raise HTTPException(
                status_code=422,
                detail=f"Invalid URL for professional link: {field}",
            )


def _get_or_create_profile(db: Session, user_id: int) -> Profile:
    profile = db.query(Profile).filter(Profile.user_id == user_id).first()
    if profile is None:
        profile = Profile(user_id=user_id)
        db.add(profile)
        db.commit()
        db.refresh(profile)
    return profile


def _owned_documents(db: Session, user: User, profile: Profile | None) -> list[ProfileDocumentItem]:
    docs: list[ProfileDocumentItem] = []
    resumes = (
        db.query(ResumeAnalysis)
        .filter(ResumeAnalysis.user_id == user.id)
        .order_by(ResumeAnalysis.created_at.desc())
        .limit(50)
        .all()
    )
    for r in resumes:
        docs.append(ProfileDocumentItem(
            id=r.id,
            kind="resume",
            label=r.filename or f"Resume #{r.id}",
            created_at=r.created_at,
            is_default=bool(profile and profile.default_resume_id == r.id),
        ))
    letters = (
        db.query(CoverLetter)
        .filter(CoverLetter.user_id == user.id)
        .order_by(CoverLetter.created_at.desc())
        .limit(50)
        .all()
    )
    for c in letters:
        label = c.company_name or f"Cover letter #{c.id}"
        docs.append(ProfileDocumentItem(
            id=c.id,
            kind="cover_letter",
            label=label,
            created_at=c.created_at,
            is_default=bool(profile and profile.default_cover_letter_id == c.id),
        ))
    return docs


def _answers_for_user(db: Session, user_id: int) -> list[ApplicationAnswer]:
    return (
        db.query(ApplicationAnswer)
        .filter(ApplicationAnswer.user_id == user_id)
        .order_by(ApplicationAnswer.updated_at.desc())
        .all()
    )


def _to_response(
    db: Session,
    user: User,
    profile: Profile | None,
) -> ProfileResponse:
    answers = _answers_for_user(db, user.id)
    approved = sum(1 for a in answers if a.approval_status == "approved")
    has_resume = (
        db.query(ResumeAnalysis)
        .filter(ResumeAnalysis.user_id == user.id)
        .first()
        is not None
    )
    full_name = (profile.full_name if profile and profile.full_name else None) or user.name

    try:
        completeness = calculate_completeness(
            profile,
            full_name=full_name,
            has_resume=has_resume,
            approved_answer_count=approved,
        )
        readiness = calculate_readiness(
            profile,
            email=user.email,
            full_name=full_name,
            has_resume=has_resume,
            approved_answer_count=approved,
            completeness=completeness,
        )
    except Exception:
        logger.exception("Failed to calculate profile completeness for user_id=%s", user.id)
        completeness = ProfileCompletenessResponse(
            overall_percentage=0,
            completed_sections=[],
            incomplete_sections=list(
                ["personal", "summary", "skills", "experience", "education",
                 "links", "work_authorization", "job_preferences", "resume",
                 "application_answers"]
            ),
            missing_fields=["completeness_calculation_failed"],
            recommended_next_action="Retry loading your profile",
            sections=[],
        )
        readiness = ApplicationReadinessResponse(
            status="Not Ready",
            score=0,
            checks={},
            missing=["completeness_calculation_failed"],
        )

    links = parse_links(profile)
    return ProfileResponse(
        email=user.email,
        email_editable=False,
        full_name=full_name,
        preferred_name=profile.preferred_name if profile else None,
        phone=profile.phone if profile else None,
        address_line_1=profile.address_line_1 if profile else None,
        address_line_2=profile.address_line_2 if profile else None,
        city=profile.city if profile else None,
        state=profile.state if profile else None,
        postal_code=profile.postal_code if profile else None,
        country=profile.country if profile else None,
        location=profile.location if profile else None,
        current_location=profile.current_location if profile else None,
        headline=profile.headline if profile else None,
        bio=profile.bio if profile else None,
        skills=_loads_list(profile.skills if profile else None),
        experience=[ExperienceEntry(**e) for e in _loads_list(profile.experience if profile else None) if isinstance(e, dict) and e.get("title") and e.get("company")],
        education=[EducationEntry(**e) for e in _loads_list(profile.education if profile else None) if isinstance(e, dict) and e.get("school")],
        projects=[ProjectEntry(**e) for e in _loads_list(getattr(profile, "projects_json", None) if profile else None) if isinstance(e, dict) and e.get("name")],
        certifications=[CertificationEntry(**e) for e in _loads_list(getattr(profile, "certifications_json", None) if profile else None) if isinstance(e, dict) and e.get("name")],
        linkedin_url=links.linkedin or (profile.linkedin_url if profile else None),
        portfolio_url=links.portfolio or (profile.portfolio_url if profile else None),
        professional_links=links,
        work_authorization=parse_work_auth(profile),
        job_preferences=parse_job_prefs(profile),
        default_resume_id=profile.default_resume_id if profile else None,
        default_cover_letter_id=profile.default_cover_letter_id if profile else None,
        documents=_owned_documents(db, user, profile),
        application_answers=[ApplicationAnswerResponse.model_validate(a) for a in answers],
        completeness=completeness,
        readiness=readiness,
        profile_completion_percentage=completeness.overall_percentage,
        profile_completed_at=profile.profile_completed_at if profile else None,
        updated_at=profile.updated_at if profile else None,
    )


def _persist_completion(db: Session, profile: Profile, completeness: ProfileCompletenessResponse) -> None:
    profile.profile_completion_percentage = completeness.overall_percentage
    if completeness.overall_percentage >= 100:
        if not profile.profile_completed_at:
            profile.profile_completed_at = datetime.utcnow()
    else:
        profile.profile_completed_at = None


@router.get("/", response_model=ProfileResponse)
async def get_profile(
    current_user: User = Depends(get_current_user_required),
    db: Session = Depends(get_db),
):
    profile = db.query(Profile).filter(Profile.user_id == current_user.id).first()
    return _to_response(db, current_user, profile)


@router.get("/completeness", response_model=ProfileCompletenessResponse)
async def get_completeness(
    current_user: User = Depends(get_current_user_required),
    db: Session = Depends(get_db),
):
    return _to_response(
        db,
        current_user,
        db.query(Profile).filter(Profile.user_id == current_user.id).first(),
    ).completeness


@router.get("/readiness", response_model=ApplicationReadinessResponse)
async def get_readiness(
    current_user: User = Depends(get_current_user_required),
    db: Session = Depends(get_db),
):
    return _to_response(
        db,
        current_user,
        db.query(Profile).filter(Profile.user_id == current_user.id).first(),
    ).readiness


@router.put("/", response_model=ProfileResponse)
async def update_profile(
    body: ProfileUpdate,
    current_user: User = Depends(get_current_user_required),
    db: Session = Depends(get_db),
):
    profile = _get_or_create_profile(db, current_user.id)
    data = body.model_dump(exclude_unset=True)

    if "professional_links" in data and data["professional_links"] is not None:
        links = ProfessionalLinks(**data.pop("professional_links"))
        _validate_links(links)
        profile.professional_links_json = json.dumps(links.model_dump())
        if links.linkedin:
            profile.linkedin_url = links.linkedin
        if links.portfolio:
            profile.portfolio_url = links.portfolio

    if "linkedin_url" in data:
        url = data.pop("linkedin_url")
        if url and not _is_valid_http_url(url):
            raise HTTPException(status_code=422, detail="Invalid LinkedIn URL.")
        profile.linkedin_url = url
        links = parse_links(profile)
        links.linkedin = url
        profile.professional_links_json = json.dumps(links.model_dump())

    if "portfolio_url" in data:
        url = data.pop("portfolio_url")
        if url and not _is_valid_http_url(url):
            raise HTTPException(status_code=422, detail="Invalid portfolio URL.")
        profile.portfolio_url = url
        links = parse_links(profile)
        links.portfolio = url
        profile.professional_links_json = json.dumps(links.model_dump())

    if "work_authorization" in data and data["work_authorization"] is not None:
        auth = WorkAuthorization(**data.pop("work_authorization"))
        if auth.user_confirmed and not auth.confirmed_at:
            auth.confirmed_at = datetime.utcnow()
        profile.work_authorization_json = json.dumps(auth.model_dump(mode="json"))

    if "job_preferences" in data and data["job_preferences"] is not None:
        prefs = JobPreferences(**data.pop("job_preferences"))
        profile.job_preferences_json = json.dumps(prefs.model_dump())

    if "projects" in data:
        profile.projects_json = _dump_models(data.pop("projects"))
    if "certifications" in data:
        profile.certifications_json = _dump_models(data.pop("certifications"))

    for field in ("skills", "experience", "education"):
        if field in data and data[field] is not None:
            profile_attr = field
            setattr(profile, profile_attr, _dump_models(data.pop(field)))

    if "default_resume_id" in data:
        rid = data.pop("default_resume_id")
        if rid is not None:
            owned = (
                db.query(ResumeAnalysis)
                .filter(ResumeAnalysis.id == rid, ResumeAnalysis.user_id == current_user.id)
                .first()
            )
            if not owned:
                raise HTTPException(status_code=422, detail="Default resume unavailable.")
        profile.default_resume_id = rid

    if "default_cover_letter_id" in data:
        cid = data.pop("default_cover_letter_id")
        if cid is not None:
            owned = (
                db.query(CoverLetter)
                .filter(CoverLetter.id == cid, CoverLetter.user_id == current_user.id)
                .first()
            )
            if not owned:
                raise HTTPException(status_code=422, detail="Default cover letter unavailable.")
        profile.default_cover_letter_id = cid

    scalar_fields = (
        "full_name", "preferred_name", "phone", "address_line_1", "address_line_2",
        "city", "state", "postal_code", "country", "location", "current_location",
        "headline", "bio",
    )
    for key in scalar_fields:
        if key in data:
            setattr(profile, key, data[key])

    profile.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(profile)

    response = _to_response(db, current_user, profile)
    if response.completeness:
        _persist_completion(db, profile, response.completeness)
        db.commit()
        db.refresh(profile)
        response.profile_completion_percentage = profile.profile_completion_percentage
        response.profile_completed_at = profile.profile_completed_at
        response.updated_at = profile.updated_at

    logger.info("Profile updated for user_id=%s completion=%s", current_user.id, profile.profile_completion_percentage)
    return response


@router.get("/answers", response_model=list[ApplicationAnswerResponse])
async def list_answers(
    current_user: User = Depends(get_current_user_required),
    db: Session = Depends(get_db),
):
    return [ApplicationAnswerResponse.model_validate(a) for a in _answers_for_user(db, current_user.id)]


@router.post("/answers", response_model=ApplicationAnswerResponse, status_code=201)
async def create_answer(
    body: ApplicationAnswerCreate,
    current_user: User = Depends(get_current_user_required),
    db: Session = Depends(get_db),
):
    key = body.normalized_question_key.strip().lower().replace(" ", "_").replace("-", "_")
    sensitive = body.is_sensitive if body.is_sensitive is not None else is_sensitive_key(key)
    policy = body.reuse_policy or default_reuse_policy(is_sensitive=sensitive)
    if sensitive:
        policy = "always_ask"
    if policy not in REUSE_POLICIES:
        raise HTTPException(status_code=422, detail="Invalid reuse_policy.")
    if policy == "never_save":
        raise HTTPException(status_code=422, detail="This answer is marked never_save and was not stored.")

    row = ApplicationAnswer(
        user_id=current_user.id,
        normalized_question_key=key,
        display_question=body.display_question.strip(),
        answer=body.answer.strip(),
        answer_type=body.answer_type or "text",
        is_sensitive=sensitive,
        approval_status=body.approval_status or "approved",
        reuse_policy=policy,
        last_reviewed_at=datetime.utcnow(),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    logger.info("Application answer created id=%s user_id=%s key=%s", row.id, current_user.id, key)
    return ApplicationAnswerResponse.model_validate(row)


@router.put("/answers/{answer_id}", response_model=ApplicationAnswerResponse)
async def update_answer(
    answer_id: int,
    body: ApplicationAnswerUpdate,
    current_user: User = Depends(get_current_user_required),
    db: Session = Depends(get_db),
):
    row = (
        db.query(ApplicationAnswer)
        .filter(ApplicationAnswer.id == answer_id, ApplicationAnswer.user_id == current_user.id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Application answer not found.")
    data = body.model_dump(exclude_unset=True)
    if "reuse_policy" in data and data["reuse_policy"]:
        if data["reuse_policy"] not in REUSE_POLICIES:
            raise HTTPException(status_code=422, detail="Invalid reuse_policy.")
        if row.is_sensitive or data.get("is_sensitive"):
            data["reuse_policy"] = "always_ask"
    for key, value in data.items():
        setattr(row, key, value)
    row.last_reviewed_at = datetime.utcnow()
    row.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(row)
    return ApplicationAnswerResponse.model_validate(row)


@router.delete("/answers/{answer_id}")
async def delete_answer(
    answer_id: int,
    current_user: User = Depends(get_current_user_required),
    db: Session = Depends(get_db),
):
    row = (
        db.query(ApplicationAnswer)
        .filter(ApplicationAnswer.id == answer_id, ApplicationAnswer.user_id == current_user.id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Application answer not found.")
    db.delete(row)
    db.commit()
    return {"message": "Deleted."}

"""Profile completeness and application-readiness scoring.

Weights total 100%:
  personal 15, summary 10, skills 10, experience 15, education 10,
  links 5, work_auth 15, job_prefs 10, resume 5, application_answers 5.
"""

from __future__ import annotations

import json
from typing import Any, Optional

from models import (
    Profile,
    ProfileCompletenessResponse,
    ProfileCompletenessSection,
    ApplicationReadinessResponse,
    ProfessionalLinks,
    WorkAuthorization,
    JobPreferences,
)

WEIGHTS = {
    "personal": 15,
    "summary": 10,
    "skills": 10,
    "experience": 15,
    "education": 10,
    "links": 5,
    "work_authorization": 15,
    "job_preferences": 10,
    "resume": 5,
    "application_answers": 5,
}

SECTION_LABELS = {
    "personal": "Personal Information",
    "summary": "Professional Summary",
    "skills": "Skills",
    "experience": "Work Experience",
    "education": "Education",
    "links": "Professional Links",
    "work_authorization": "Work Authorization",
    "job_preferences": "Job Preferences",
    "resume": "Resume uploaded",
    "application_answers": "Application Answers",
}

# Question keys that must never auto-reuse.
SENSITIVE_QUESTION_KEYS = frozenset({
    "work_authorization",
    "sponsorship",
    "sponsorship_requirement",
    "salary",
    "salary_expectation",
    "hourly_rate",
    "hourly_rate_expectation",
    "security_clearance",
    "criminal_history",
    "disability",
    "veteran_status",
    "demographic",
    "legal_attestation",
})

REUSE_POLICIES = frozenset({
    "always_ask",
    "reuse_after_review",
    "reuse_automatically",
    "never_save",
})


def _loads(raw: Optional[str], default: Any = None) -> Any:
    if not raw:
        return default if default is not None else None
    try:
        return json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return default if default is not None else None


def _filled(value: Any) -> bool:
    if value is None:
        return False
    if isinstance(value, str):
        return bool(value.strip())
    if isinstance(value, (list, dict)):
        return len(value) > 0
    return True


def parse_links(profile: Optional[Profile]) -> ProfessionalLinks:
    data = _loads(getattr(profile, "professional_links_json", None) if profile else None, {}) or {}
    links = ProfessionalLinks(**{k: data.get(k) for k in ProfessionalLinks.model_fields})
    if profile:
        if not links.linkedin and profile.linkedin_url:
            links.linkedin = profile.linkedin_url
        if not links.portfolio and profile.portfolio_url:
            links.portfolio = profile.portfolio_url
    return links


def parse_work_auth(profile: Optional[Profile]) -> WorkAuthorization:
    data = _loads(getattr(profile, "work_authorization_json", None) if profile else None, {}) or {}
    return WorkAuthorization(**{k: data[k] for k in WorkAuthorization.model_fields if k in data})


def parse_job_prefs(profile: Optional[Profile]) -> JobPreferences:
    data = _loads(getattr(profile, "job_preferences_json", None) if profile else None, {}) or {}
    return JobPreferences(**{k: data[k] for k in JobPreferences.model_fields if k in data})


def _personal_missing(profile: Optional[Profile], full_name: Optional[str]) -> list[str]:
    missing = []
    name = (getattr(profile, "full_name", None) if profile else None) or full_name
    if not _filled(name):
        missing.append("full_name")
    if not profile or not _filled(profile.phone):
        missing.append("phone")
    if not profile or not _filled(profile.city):
        missing.append("city")
    if not profile or not _filled(profile.country):
        missing.append("country")
    if not profile or not (_filled(profile.current_location) or _filled(profile.location)):
        missing.append("current_location")
    return missing


def _summary_missing(profile: Optional[Profile]) -> list[str]:
    missing = []
    if not profile or not _filled(profile.headline):
        missing.append("headline")
    if not profile or not _filled(profile.bio):
        missing.append("bio")
    return missing


def _skills_missing(profile: Optional[Profile]) -> list[str]:
    skills = _loads(profile.skills if profile else None, []) or []
    return [] if isinstance(skills, list) and len(skills) > 0 else ["skills"]


def _experience_missing(profile: Optional[Profile]) -> list[str]:
    exp = _loads(profile.experience if profile else None, []) or []
    if not isinstance(exp, list) or len(exp) == 0:
        return ["experience"]
    first = exp[0] if isinstance(exp[0], dict) else {}
    if not _filled(first.get("title")) or not _filled(first.get("company")):
        return ["experience.title", "experience.company"]
    return []


def _education_missing(profile: Optional[Profile]) -> list[str]:
    edu = _loads(profile.education if profile else None, []) or []
    if not isinstance(edu, list) or len(edu) == 0:
        return ["education"]
    first = edu[0] if isinstance(edu[0], dict) else {}
    if not _filled(first.get("school")):
        return ["education.school"]
    return []


def _links_missing(profile: Optional[Profile]) -> list[str]:
    links = parse_links(profile)
    if _filled(links.linkedin) or _filled(links.portfolio) or _filled(links.github) or _filled(links.personal_website):
        return []
    return ["professional_links"]


def _work_auth_missing(profile: Optional[Profile]) -> list[str]:
    auth = parse_work_auth(profile)
    missing = []
    if not _filled(auth.applying_country):
        missing.append("work_authorization.applying_country")
    if not _filled(auth.current_authorization):
        missing.append("work_authorization.current_authorization")
    if auth.sponsorship_required_now is None:
        missing.append("work_authorization.sponsorship_required_now")
    if not auth.user_confirmed:
        missing.append("work_authorization.user_confirmed")
    return missing


def _job_prefs_missing(profile: Optional[Profile]) -> list[str]:
    prefs = parse_job_prefs(profile)
    missing = []
    if not prefs.preferred_titles:
        missing.append("job_preferences.preferred_titles")
    if not _filled(prefs.work_arrangement):
        missing.append("job_preferences.work_arrangement")
    if not prefs.employment_types:
        missing.append("job_preferences.employment_types")
    return missing


def calculate_completeness(
    profile: Optional[Profile],
    *,
    full_name: Optional[str] = None,
    has_resume: bool = False,
    approved_answer_count: int = 0,
) -> ProfileCompletenessResponse:
    checkers = {
        "personal": lambda: _personal_missing(profile, full_name),
        "summary": lambda: _summary_missing(profile),
        "skills": lambda: _skills_missing(profile),
        "experience": lambda: _experience_missing(profile),
        "education": lambda: _education_missing(profile),
        "links": lambda: _links_missing(profile),
        "work_authorization": lambda: _work_auth_missing(profile),
        "job_preferences": lambda: _job_prefs_missing(profile),
        "resume": lambda: [] if has_resume else ["resume"],
        "application_answers": lambda: [] if approved_answer_count > 0 else ["application_answers"],
    }

    sections: list[ProfileCompletenessSection] = []
    completed: list[str] = []
    incomplete: list[str] = []
    all_missing: list[str] = []
    score = 0

    for key, weight in WEIGHTS.items():
        missing = checkers[key]()
        complete = len(missing) == 0
        if complete:
            score += weight
            completed.append(key)
        else:
            incomplete.append(key)
            all_missing.extend(missing)
        sections.append(ProfileCompletenessSection(
            key=key,
            label=SECTION_LABELS[key],
            weight=weight,
            complete=complete,
            missing_fields=missing,
        ))

    recommended = None
    if incomplete:
        first = incomplete[0]
        recommended = f"Complete your {SECTION_LABELS[first]}"

    return ProfileCompletenessResponse(
        overall_percentage=min(100, score),
        completed_sections=completed,
        incomplete_sections=incomplete,
        missing_fields=all_missing,
        recommended_next_action=recommended,
        sections=sections,
    )


def calculate_readiness(
    profile: Optional[Profile],
    *,
    email: Optional[str] = None,
    full_name: Optional[str] = None,
    has_resume: bool = False,
    approved_answer_count: int = 0,
    completeness: Optional[ProfileCompletenessResponse] = None,
) -> ApplicationReadinessResponse:
    completeness = completeness or calculate_completeness(
        profile,
        full_name=full_name,
        has_resume=has_resume,
        approved_answer_count=approved_answer_count,
    )
    links = parse_links(profile)
    auth = parse_work_auth(profile)
    prefs = parse_job_prefs(profile)

    checks = {
        "profile_completeness_mostly": completeness.overall_percentage >= 70,
        "resume_available": has_resume,
        "email_available": _filled(email),
        "phone_available": bool(profile and _filled(profile.phone)),
        "linkedin_available": _filled(links.linkedin),
        "work_authorization_reviewed": bool(auth.user_confirmed and _filled(auth.current_authorization)),
        "sponsorship_answer_reviewed": bool(
            auth.user_confirmed and auth.sponsorship_required_now is not None
        ),
        "job_preferences_saved": len(_job_prefs_missing(profile)) == 0,
        "default_resume_selected": bool(profile and profile.default_resume_id),
        "application_answers_available": approved_answer_count > 0,
    }
    missing = [k for k, ok in checks.items() if not ok]
    passed = sum(1 for ok in checks.values() if ok)
    total = len(checks)
    score = int(round(100 * passed / total)) if total else 0

    if passed == total:
        status = "Ready"
    elif passed >= total - 2 and completeness.overall_percentage >= 70:
        status = "Mostly Ready"
    elif passed >= 4:
        status = "Needs Information"
    else:
        status = "Not Ready"

    return ApplicationReadinessResponse(
        status=status,
        score=score,
        checks=checks,
        missing=missing,
    )


def is_sensitive_key(normalized_key: str) -> bool:
    key = (normalized_key or "").strip().lower().replace(" ", "_").replace("-", "_")
    if key in SENSITIVE_QUESTION_KEYS:
        return True
    return any(s in key for s in (
        "salary", "sponsor", "clearance", "criminal", "disability",
        "veteran", "demographic", "authorization", "attestation",
    ))


def default_reuse_policy(*, is_sensitive: bool) -> str:
    return "always_ask" if is_sensitive else "reuse_after_review"

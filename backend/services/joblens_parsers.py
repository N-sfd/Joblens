"""Resume + JD parsers for JobLens Career Intelligence.

AI (when configured) extracts structured fields. Deterministic fallback always works.
"""

from __future__ import annotations

import json
import logging
import os
import re
from typing import Any

from services.joblens_skill_normalize import normalize_skill_list, normalize_skill

logger = logging.getLogger("joblens.parsers")

EMAIL_RE = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")
PHONE_RE = re.compile(r"(\+?\d[\d\-.\s()]{8,}\d)")
YEAR_RE = re.compile(r"(\d+)\+?\s*\+?\s*years?", re.I)

TECH_SEED = [
    "Python", "JavaScript", "TypeScript", "Java", "C#", "C++", "Go", "Rust", "SQL",
    "React", "Next.js", "Vue", "Angular", "Node", "FastAPI", "Django", "Flask", "Spring",
    "PostgreSQL", "MySQL", "MongoDB", "Redis", "Oracle", "AWS", "Azure", "GCP",
    "Docker", "Kubernetes", "Terraform", "CI/CD", "Git", "GraphQL", "REST APIs",
    "Linux", "HTML", "CSS", "Tailwind", "Kafka", "RabbitMQ",
]


def ai_enabled() -> bool:
    flag = (os.getenv("JOBLENS_AI_ENABLED") or "true").strip().lower()
    if flag in ("0", "false", "no"):
        return False
    return bool(
        (os.getenv("GROQ_API_KEY") or "").strip()
        or (os.getenv("OPENAI_API_KEY") or "").strip()
        or (os.getenv("ANTHROPIC_API_KEY") or "").strip()
    )


def _extract_years(text: str) -> float | None:
    years = [int(m.group(1)) for m in YEAR_RE.finditer(text or "")]
    if not years:
        return None
    return float(max(years))


def _find_tech_mentions(text: str) -> list[str]:
    found: list[str] = []
    lower = (text or "").lower()
    for tech in TECH_SEED:
        if tech.lower() in lower:
            found.append(normalize_skill(tech))
    return normalize_skill_list(found)


def parse_resume_deterministic(resume_text: str) -> dict[str, Any]:
    text = resume_text or ""
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    email_m = EMAIL_RE.search(text)
    email = email_m.group(0) if email_m else None
    phone_m = PHONE_RE.search(text)
    phone = phone_m.group(0) if phone_m else None
    name = lines[0] if lines and "@" not in lines[0] and len(lines[0]) < 80 else None
    skills = _find_tech_mentions(text)
    return {
        "name": name,
        "email": email,
        "phone": phone,
        "location": None,
        "summary": None,
        "skills": skills,
        "technical_skills": skills,
        "tools": [],
        "programming_languages": [s for s in skills if s in (
            "Python", "JavaScript", "TypeScript", "Java", "C#", "C++", "Go", "Rust", "SQL"
        )],
        "frameworks": [s for s in skills if s in (
            "React", "Next.js", "Vue", "Angular", "Django", "Flask", "FastAPI", "Spring", "Tailwind"
        )],
        "databases": [s for s in skills if s in (
            "PostgreSQL", "MySQL", "MongoDB", "Redis", "Oracle", "SQL"
        )],
        "cloud_platforms": [s for s in skills if s in ("AWS", "Azure", "GCP")],
        "work_experience": [],
        "job_titles": [],
        "companies": [],
        "dates": [],
        "years_of_experience": _extract_years(text),
        "projects": [],
        "education": [],
        "certifications": [],
        "domains": [],
        "achievements": [],
        "parser": "deterministic",
    }


def parse_job_deterministic(job_text: str, job_title: str | None = None, company: str | None = None) -> dict[str, Any]:
    text = job_text or ""
    lower = text.lower()
    required: list[str] = []
    preferred: list[str] = []
    # Split roughly by "preferred" / "nice to have"
    preferred_idx = -1
    for marker in ("preferred qualifications", "nice to have", "preferred skills", "bonus"):
        idx = lower.find(marker)
        if idx >= 0:
            preferred_idx = idx
            break
    required_blob = text if preferred_idx < 0 else text[:preferred_idx]
    preferred_blob = "" if preferred_idx < 0 else text[preferred_idx:]
    required = _find_tech_mentions(required_blob)
    preferred = [s for s in _find_tech_mentions(preferred_blob) if s not in required]

    requirements: list[dict] = []
    for s in required:
        requirements.append({"name": s, "category": "required_skill"})
    for s in preferred:
        requirements.append({"name": s, "category": "preferred_skill"})

    years = _extract_years(text)
    edu: list[str] = []
    if re.search(r"\b(bachelor|master|phd|degree)\b", lower):
        if "master" in lower or "ms " in lower:
            edu.append("Master's degree")
        elif "phd" in lower:
            edu.append("PhD")
        else:
            edu.append("Bachelor's degree")

    remote = "remote" if "remote" in lower else ("hybrid" if "hybrid" in lower else None)
    emp = "full-time" if "full-time" in lower or "full time" in lower else None

    return {
        "job_title": job_title,
        "company": company,
        "location": None,
        "work_arrangement": remote,
        "employment_type": emp,
        "required_skills": required,
        "preferred_skills": preferred,
        "required_experience_years": years,
        "education_requirements": edu,
        "certifications": [],
        "responsibilities": [],
        "tools": [],
        "technologies": normalize_skill_list(required + preferred),
        "domain": [],
        "seniority_level": (
            "senior" if "senior" in lower else ("junior" if "junior" in lower or "entry" in lower else "mid")
        ),
        "keywords": normalize_skill_list(required + preferred),
        "requirements": requirements,
        "parser": "deterministic",
    }


async def _chat_json(system: str, user: str) -> dict[str, Any] | None:
    if not ai_enabled():
        return None
    try:
        from services.claude_service import groq_chat

        resp = groq_chat(
            temperature=0.1,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            response_format={"type": "json_object"},
        )
        content = (resp.choices[0].message.content or "").strip()
        if content.startswith("```"):
            content = re.sub(r"^```(?:json)?\s*", "", content)
            content = re.sub(r"\s*```$", "", content)
        return json.loads(content)
    except Exception as e:
        logger.warning("joblens.ai_parse_failed error_code=%s", type(e).__name__)
        return None


RESUME_PARSE_SYSTEM = """You extract structured résumé fields for an evidence-based career matching system.
Return ONLY JSON. Do not invent employers, skills, or dates not present in the text.
Do not infer demographics, visa, citizenship, or work authorization unless explicitly stated.
JSON keys: name, email, phone, location, summary, skills (array), technical_skills, tools,
programming_languages, frameworks, databases, cloud_platforms, work_experience (array of
{title, company, dates, bullets}), job_titles, companies, years_of_experience (number|null),
projects (array of strings), education (array of strings), certifications, domains, achievements."""


JD_PARSE_SYSTEM = """You extract structured job requirements for an evidence-based matching system.
Return ONLY JSON. Separate required vs preferred skills carefully.
Do not invent requirements not present in the text.
JSON keys: job_title, company, location, work_arrangement, employment_type,
required_skills (array), preferred_skills (array), required_experience_years (number|null),
education_requirements (array), certifications, responsibilities (array), tools, technologies,
domain (array), seniority_level, keywords (array),
requirements (array of {name, category}) where category is one of:
required_skill, preferred_skill, experience_requirement, education_requirement,
certification, responsibility, domain_context, soft_skill, unknown."""


async def parse_resume(resume_text: str) -> tuple[dict[str, Any], bool]:
    """Returns (parsed, used_ai)."""
    base = parse_resume_deterministic(resume_text)
    ai = await _chat_json(
        RESUME_PARSE_SYSTEM,
        f"Résumé text:\n{(resume_text or '')[:12000]}",
    )
    if not ai:
        return base, False
    # Merge AI over base carefully — keep AI lists but normalize skills
    merged = {**base, **{k: v for k, v in ai.items() if v not in (None, "", [])}}
    for key in (
        "skills", "technical_skills", "tools", "programming_languages",
        "frameworks", "databases", "cloud_platforms",
    ):
        if key in ai and isinstance(ai[key], list):
            merged[key] = normalize_skill_list([str(x) for x in ai[key]])
    # Union skills
    all_skills = normalize_skill_list(
        list(merged.get("skills") or [])
        + list(merged.get("technical_skills") or [])
        + list(merged.get("programming_languages") or [])
        + list(merged.get("frameworks") or [])
        + list(merged.get("databases") or [])
        + list(merged.get("cloud_platforms") or [])
        + list(base.get("skills") or [])
    )
    merged["skills"] = all_skills
    merged["parser"] = "ai+deterministic"
    return merged, True


async def parse_job(
    job_text: str,
    job_title: str | None = None,
    company: str | None = None,
) -> tuple[dict[str, Any], bool]:
    base = parse_job_deterministic(job_text, job_title=job_title, company=company)
    ai = await _chat_json(
        JD_PARSE_SYSTEM,
        f"Job title hint: {job_title or ''}\nCompany hint: {company or ''}\n\nJob description:\n{(job_text or '')[:12000]}",
    )
    if not ai:
        return base, False
    merged = {**base, **{k: v for k, v in ai.items() if v not in (None, "", [])}}
    for key in ("required_skills", "preferred_skills", "keywords", "technologies", "tools"):
        if key in ai and isinstance(ai[key], list):
            merged[key] = normalize_skill_list([str(x) for x in ai[key]])
    reqs = ai.get("requirements") if isinstance(ai.get("requirements"), list) else None
    if reqs:
        cleaned = []
        for r in reqs:
            if not isinstance(r, dict):
                continue
            name = normalize_skill(str(r.get("name") or ""))
            if not name:
                continue
            cat = str(r.get("category") or "unknown")
            cleaned.append({"name": name, "category": cat})
        if cleaned:
            merged["requirements"] = cleaned
            merged["required_skills"] = normalize_skill_list(
                [r["name"] for r in cleaned if r["category"] == "required_skill"]
            ) or merged.get("required_skills") or []
            merged["preferred_skills"] = normalize_skill_list(
                [r["name"] for r in cleaned if r["category"] == "preferred_skill"]
            ) or merged.get("preferred_skills") or []
    else:
        # Rebuild requirements from skill lists
        requirements = [
            {"name": s, "category": "required_skill"} for s in (merged.get("required_skills") or [])
        ] + [
            {"name": s, "category": "preferred_skill"} for s in (merged.get("preferred_skills") or [])
        ]
        merged["requirements"] = requirements
    if job_title and not merged.get("job_title"):
        merged["job_title"] = job_title
    if company and not merged.get("company"):
        merged["company"] = company
    merged["parser"] = "ai+deterministic"
    return merged, True

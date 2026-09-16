"""End-to-end JobLens Career Intelligence analysis orchestration."""

from __future__ import annotations

import hashlib
import logging
from typing import Any

from services.joblens_matching import match_requirements
from services.joblens_parsers import parse_job, parse_resume, ai_enabled
from services.joblens_scoring import (
    apply_ai_cannot_override,
    build_category_scores,
    compute_overall,
)
from services.joblens_skill_normalize import normalize_skill_list

logger = logging.getLogger("joblens.analyze")


def content_hash(resume_text: str, job_text: str) -> str:
    raw = (resume_text or "").strip() + "\n---\n" + (job_text or "").strip()
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _build_gaps(matches: list[dict]) -> dict[str, Any]:
    missing = [m for m in matches if m["match_level"] == "missing"]
    not_demo = [m for m in matches if m["match_level"] == "not_demonstrated"]
    weak = [m for m in matches if m["match_level"] == "partial_match"]
    related = [m for m in matches if m["match_level"] == "related_evidence"]
    improvements: list[dict[str, str]] = []
    for m in not_demo + related:
        req = m["requirement"]
        improvements.append({
            "title": f"Clarify evidence for {req}",
            "detail": (
                f"{req} appears in the job description, but the résumé does not prove it clearly. "
                f"Do not add {req} unless you have real experience. Instead, strengthen related "
                f"bullets with concrete tools, outcomes, and deployment details you actually used."
            ),
            "why": m.get("explanation") or "",
        })
    for m in weak:
        improvements.append({
            "title": f"Strengthen {m['requirement']} with project context",
            "detail": (
                f"{m['requirement']} is listed but not backed by project or work-experience detail. "
                f"Move a concrete example into Experience or Projects."
            ),
            "why": "Skills listed without usage context score lower with evidence-based matching.",
        })
    for m in missing[:5]:
        improvements.append({
            "title": f"Learning priority: {m['requirement']}",
            "detail": (
                f"{m['requirement']} was not found on the résumé. Only pursue this if it matches "
                f"your real career direction — never invent experience."
            ),
            "why": "Missing required skills reduce the weighted required-skills score (35%).",
        })
    return {
        "missing_skills": [m["requirement"] for m in missing],
        "not_demonstrated_skills": [m["requirement"] for m in not_demo],
        "weak_evidence": [m["requirement"] for m in weak],
        "related_evidence": [m["requirement"] for m in related],
        "resume_improvement_opportunities": improvements,
    }


def _build_recommendations(matches: list[dict], parsed_resume: dict, parsed_job: dict) -> list[dict[str, str]]:
    strong = [m for m in matches if m["match_level"] == "strong_match"]
    recs: list[dict[str, str]] = []
    if strong:
        recs.append({
            "type": "emphasize",
            "title": "Emphasize proven strengths",
            "detail": (
                "Lead with "
                + ", ".join(m["requirement"] for m in strong[:5])
                + " — these have clear résumé evidence and support the required-skills score."
            ),
            "why": "Strong evidence items contribute the most to required and preferred skill scores.",
        })
    job_title = parsed_job.get("job_title") or "this role"
    if any(m["match_level"] in ("partial_match", "related_evidence") for m in matches):
        recs.append({
            "type": "bullets",
            "title": "Strengthen résumé bullets for API / backend impact",
            "detail": (
                f"For {job_title}, move your strongest project bullets higher and quantify outcomes "
                f"(latency, users, integrations) without adding skills you do not have."
            ),
            "why": "Evidence placement affects how clearly experience and domain relevance are perceived.",
        })
    missing = [m["requirement"] for m in matches if m["match_level"] == "missing"]
    if missing:
        recs.append({
            "type": "learning",
            "title": "Suggested learning priorities",
            "detail": "Focus on: " + ", ".join(missing[:6]) + ". Only list them after real practice.",
            "why": "Closing true skill gaps improves future required-skills coverage.",
        })
    recs.append({
        "type": "interview",
        "title": "Interview preparation topics",
        "detail": (
            "Prepare stories for: "
            + ", ".join(m["requirement"] for m in strong[:4] or matches[:4])
            + ". Be ready to explain related-but-not-identical tools honestly."
        ),
        "why": "Interviewers probe depth on claimed skills; honesty preserves trust.",
    })
    keywords = normalize_skill_list(
        list(parsed_job.get("required_skills") or []) + list(parsed_job.get("preferred_skills") or [])
    )
    truthful = [k for k in keywords if any(
        m["requirement"] == k and m["match_level"] in ("strong_match", "partial_match")
        for m in matches
    )]
    if truthful:
        recs.append({
            "type": "keywords",
            "title": "ATS keywords to consider (only if truthful)",
            "detail": "Consider emphasizing: " + ", ".join(truthful[:10]),
            "why": "These keywords already have résumé support — surfacing them helps ATS parsing.",
        })
    return recs


def _evidence_map(matches: list[dict]) -> dict[str, list[dict]]:
    buckets = {
        "strong_evidence": [],
        "partial_evidence": [],
        "related_evidence": [],
        "weak_or_missing_evidence": [],
        "not_demonstrated": [],
    }
    for m in matches:
        item = {
            "requirement": m["requirement"],
            "match_label": m["match_label"],
            "evidence": m.get("evidence"),
            "resume_section": m.get("resume_section"),
            "explanation": m.get("explanation"),
            "confidence": m.get("confidence"),
        }
        lvl = m["match_level"]
        if lvl == "strong_match":
            buckets["strong_evidence"].append(item)
        elif lvl == "partial_match":
            buckets["partial_evidence"].append(item)
            buckets["weak_or_missing_evidence"].append(item)
        elif lvl == "related_evidence":
            buckets["related_evidence"].append(item)
            buckets["weak_or_missing_evidence"].append(item)
        elif lvl == "not_demonstrated":
            buckets["not_demonstrated"].append(item)
            buckets["weak_or_missing_evidence"].append(item)
        else:
            buckets["weak_or_missing_evidence"].append(item)
    return buckets


async def run_analysis(
    *,
    resume_text: str,
    job_description: str,
    job_title: str | None = None,
    company_name: str | None = None,
    custom_weights: dict[str, float] | None = None,
    resume_filename: str | None = None,
) -> dict[str, Any]:
    warnings: list[str] = []
    if not ai_enabled():
        warnings.append(
            "Advanced AI explanation is unavailable. Showing deterministic analysis only."
        )

    parsed_resume, resume_ai = await parse_resume(resume_text)
    parsed_job, job_ai = await parse_job(job_description, job_title=job_title, company=company_name)
    if not resume_ai or not job_ai:
        if "Advanced AI explanation is unavailable" not in " ".join(warnings):
            warnings.append(
                "Advanced AI explanation is unavailable. Showing deterministic analysis only."
            )

    requirements = list(parsed_job.get("requirements") or [])
    if not requirements:
        requirements = [
            {"name": s, "category": "required_skill"}
            for s in (parsed_job.get("required_skills") or [])
        ] + [
            {"name": s, "category": "preferred_skill"}
            for s in (parsed_job.get("preferred_skills") or [])
        ]

    matches = match_requirements(
        requirements,
        resume_text=resume_text,
        resume_skills=list(parsed_resume.get("skills") or []),
    )
    match_dicts = [m.as_dict() for m in matches]

    required_levels = [
        m.match_level for m in matches if m.category in ("required_skill", "unknown")
        or m.category == "required_skill"
    ]
    # If categories mixed, treat non-preferred skill reqs as required for scoring
    if not required_levels:
        required_levels = [
            m.match_level for m in matches
            if m.category not in ("preferred_skill", "soft_skill", "responsibility")
        ]
    preferred_levels = [m.match_level for m in matches if m.category == "preferred_skill"]

    strong = sum(1 for m in matches if m.match_level == "strong_match")
    partial = sum(1 for m in matches if m.match_level == "partial_match")
    related = sum(1 for m in matches if m.match_level == "related_evidence")

    categories = build_category_scores(
        required_levels=required_levels,
        preferred_levels=preferred_levels,
        resume_years=parsed_resume.get("years_of_experience"),
        required_years=parsed_job.get("required_experience_years"),
        resume_education=list(parsed_resume.get("education") or []),
        required_education=list(parsed_job.get("education_requirements") or []),
        resume_domains=list(parsed_resume.get("domains") or []),
        job_domains=list(parsed_job.get("domain") or []),
        resume_text=resume_text,
        strong_count=strong,
        partial_count=partial,
        related_count=related,
        total_requirements=len(matches) or 1,
    )
    score = compute_overall(categories, custom_weights)
    score = apply_ai_cannot_override(score, None)

    gaps = _build_gaps(match_dicts)
    recommendations = _build_recommendations(match_dicts, parsed_resume, parsed_job)
    evidence = _evidence_map(match_dicts)

    logger.info(
        "joblens.analyze.complete resume_ai=%s job_ai=%s overall=%s reqs=%s",
        resume_ai, job_ai, score.overall, len(matches),
    )

    return {
        "overall_score": score.overall,
        "category_scores": score.categories.as_dict(),
        "weights": score.weights_used,
        "formula": score.formula,
        "parsed_resume": parsed_resume,
        "parsed_job": parsed_job,
        "normalized_skills": {
            "resume": normalize_skill_list(list(parsed_resume.get("skills") or [])),
            "required": normalize_skill_list(list(parsed_job.get("required_skills") or [])),
            "preferred": normalize_skill_list(list(parsed_job.get("preferred_skills") or [])),
        },
        "requirement_matches": match_dicts,
        "evidence_map": evidence,
        "gap_analysis": gaps,
        "recommendations": recommendations,
        "ats_keywords": normalize_skill_list(
            list(parsed_job.get("keywords") or [])
            + list(parsed_job.get("required_skills") or [])
        ),
        "warnings": warnings,
        "content_hash": content_hash(resume_text, job_description),
        "resume_filename": resume_filename,
        "job_title": parsed_job.get("job_title") or job_title,
        "company_name": parsed_job.get("company") or company_name,
        "ai_used": bool(resume_ai or job_ai),
    }

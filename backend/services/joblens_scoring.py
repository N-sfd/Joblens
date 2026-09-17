"""Deterministic weighted scoring for JobLens Career Intelligence.

AI may explain scores but must never override these numbers.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


DEFAULT_WEIGHTS = {
    "required_skills": 0.35,
    "experience": 0.25,
    "preferred_skills": 0.15,
    "education": 0.10,
    "domain_relevance": 0.10,
    "resume_evidence": 0.05,
}


@dataclass
class CategoryScores:
    required_skills: float = 0.0
    experience: float = 0.0
    preferred_skills: float = 0.0
    education: float = 0.0
    domain_relevance: float = 0.0
    resume_evidence: float = 0.0

    def as_dict(self) -> dict[str, int]:
        return {
            "required_skills": int(round(self.required_skills)),
            "relevant_experience": int(round(self.experience)),
            "preferred_skills": int(round(self.preferred_skills)),
            "education": int(round(self.education)),
            "domain_relevance": int(round(self.domain_relevance)),
            "resume_evidence": int(round(self.resume_evidence)),
        }


@dataclass
class ScoreResult:
    overall: int
    categories: CategoryScores
    weights_used: dict[str, float] = field(default_factory=dict)
    formula: str = ""


def _clamp(v: float, lo: float = 0.0, hi: float = 100.0) -> float:
    return max(lo, min(hi, v))


def normalize_weights(custom: dict[str, float] | None = None) -> dict[str, float]:
    base = dict(DEFAULT_WEIGHTS)
    if custom:
        for k, v in custom.items():
            key = {
                "required_skills_score": "required_skills",
                "experience_score": "experience",
                "preferred_skills_score": "preferred_skills",
                "education_score": "education",
                "domain_relevance_score": "domain_relevance",
                "resume_evidence_score": "resume_evidence",
                "relevant_experience": "experience",
            }.get(k, k)
            if key in base and isinstance(v, (int, float)):
                base[key] = float(v)
    total = sum(base.values()) or 1.0
    return {k: v / total for k, v in base.items()}


def compute_overall(categories: CategoryScores, weights: dict[str, float] | None = None) -> ScoreResult:
    w = normalize_weights(weights)
    overall = (
        categories.required_skills * w["required_skills"]
        + categories.experience * w["experience"]
        + categories.preferred_skills * w["preferred_skills"]
        + categories.education * w["education"]
        + categories.domain_relevance * w["domain_relevance"]
        + categories.resume_evidence * w["resume_evidence"]
    )
    rounded = int(round(_clamp(overall)))
    return ScoreResult(
        overall=rounded,
        categories=categories,
        weights_used=w,
        formula=(
            "overall = required*0.35 + experience*0.25 + preferred*0.15 "
            "+ education*0.10 + domain*0.10 + evidence*0.05"
        ),
    )


def score_skill_coverage(matched: int, total: int, *, empty_default: float = 100.0) -> float:
    """Coverage score for required/preferred skill lists."""
    if total <= 0:
        return empty_default
    return _clamp(100.0 * matched / total)


def score_from_match_levels(levels: list[str], *, empty_default: float = 100.0) -> float:
    """Map match levels to a 0–100 category score.

    Strong=1.0, Partial=0.7, Related=0.45, Not Demonstrated=0.2, Missing=0.0
    """
    if not levels:
        return empty_default
    weights = {
        "strong_match": 1.0,
        "partial_match": 0.7,
        "related_evidence": 0.45,
        "not_demonstrated": 0.2,
        "missing": 0.0,
    }
    total = 0.0
    for lvl in levels:
        key = (lvl or "").strip().lower().replace(" ", "_")
        total += weights.get(key, 0.0)
    return _clamp(100.0 * total / len(levels))


def score_experience(resume_years: float | None, required_years: float | None) -> float:
    if required_years is None or required_years <= 0:
        return 100.0 if (resume_years or 0) > 0 else 70.0
    if resume_years is None:
        return 40.0
    ratio = resume_years / required_years
    if ratio >= 1.0:
        return 100.0
    if ratio >= 0.75:
        return 85.0
    if ratio >= 0.5:
        return 65.0
    if ratio >= 0.25:
        return 40.0
    return 20.0


def score_education(resume_edu: list[str], required_edu: list[str]) -> float:
    if not required_edu:
        return 100.0
    resume_blob = " ".join(e.lower() for e in resume_edu)
    hits = 0
    for req in required_edu:
        r = req.lower()
        tokens = [t for t in ("phd", "master", "bachelor", "degree", "bs", "ba", "ms", "mba", "associate") if t in r]
        if any(t in resume_blob for t in tokens) or (req.lower() in resume_blob):
            hits += 1
        elif "degree" in r and any(x in resume_blob for x in ("bachelor", "master", "bs", "ba", "ms", "b.s", "m.s")):
            hits += 1
    if hits == 0 and resume_edu:
        return 50.0
    return score_skill_coverage(hits, len(required_edu), empty_default=100.0)


def score_domain(resume_domains: list[str], job_domains: list[str], resume_text: str) -> float:
    if not job_domains:
        return 75.0
    blob = (resume_text or "").lower() + " " + " ".join(d.lower() for d in resume_domains)
    hits = sum(1 for d in job_domains if d.lower() in blob)
    return score_skill_coverage(hits, len(job_domains), empty_default=75.0)


def score_resume_evidence(strong: int, partial: int, related: int, total_reqs: int) -> float:
    if total_reqs <= 0:
        return 80.0
    weighted = strong * 1.0 + partial * 0.6 + related * 0.35
    return _clamp(100.0 * weighted / total_reqs)


def build_category_scores(
    *,
    required_levels: list[str],
    preferred_levels: list[str],
    resume_years: float | None,
    required_years: float | None,
    resume_education: list[str],
    required_education: list[str],
    resume_domains: list[str],
    job_domains: list[str],
    resume_text: str,
    strong_count: int,
    partial_count: int,
    related_count: int,
    total_requirements: int,
) -> CategoryScores:
    return CategoryScores(
        required_skills=score_from_match_levels(required_levels, empty_default=100.0),
        experience=score_experience(resume_years, required_years),
        preferred_skills=score_from_match_levels(preferred_levels, empty_default=100.0),
        education=score_education(resume_education, required_education),
        domain_relevance=score_domain(resume_domains, job_domains, resume_text),
        resume_evidence=score_resume_evidence(
            strong_count, partial_count, related_count, total_requirements
        ),
    )


def apply_ai_cannot_override(result: ScoreResult, ai_payload: dict[str, Any] | None) -> ScoreResult:
    """Ensure any AI-suggested scores are discarded; return deterministic result unchanged."""
    _ = ai_payload  # intentionally ignored
    return result

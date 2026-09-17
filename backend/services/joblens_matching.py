"""Requirement-level matching with résumé evidence extraction.

Evidence excerpts must come from résumé text only — never fabricated.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, asdict
from typing import Literal

from services.joblens_skill_normalize import (
    normalize_skill,
    normalize_skill_key,
    related_skills,
)

MatchLevel = Literal[
    "strong_match",
    "partial_match",
    "related_evidence",
    "not_demonstrated",
    "missing",
]

MATCH_LABELS = {
    "strong_match": "Strong Match",
    "partial_match": "Partial Match",
    "related_evidence": "Related Evidence",
    "not_demonstrated": "Not Demonstrated",
    "missing": "Missing",
}


@dataclass
class RequirementMatch:
    requirement: str
    category: str
    match_level: MatchLevel
    match_label: str
    score_contribution: float
    evidence: str | None
    resume_section: str | None
    explanation: str
    confidence: str  # high | medium | low

    def as_dict(self) -> dict:
        return asdict(self)


SECTION_PATTERNS = [
    ("experience", re.compile(r"(?im)^(work\s+experience|professional\s+experience|experience|employment)\s*$")),
    ("projects", re.compile(r"(?im)^(projects?|personal\s+projects?|selected\s+projects?)\s*$")),
    ("skills", re.compile(r"(?im)^(skills|technical\s+skills|core\s+competencies|technologies)\s*$")),
    ("education", re.compile(r"(?im)^(education|academic)\s*$")),
    ("certifications", re.compile(r"(?im)^(certifications?|licenses?)\s*$")),
    ("summary", re.compile(r"(?im)^(summary|profile|objective|about)\s*$")),
]


def _split_sections(resume_text: str) -> dict[str, str]:
    lines = (resume_text or "").splitlines()
    sections: dict[str, list[str]] = {"general": []}
    current = "general"
    for line in lines:
        stripped = line.strip()
        matched = False
        for name, pat in SECTION_PATTERNS:
            if pat.match(stripped):
                current = name
                sections.setdefault(current, [])
                matched = True
                break
        if not matched:
            sections.setdefault(current, []).append(line)
    return {k: "\n".join(v).strip() for k, v in sections.items() if v}


def find_evidence_excerpt(resume_text: str, skill: str, max_len: int = 180) -> tuple[str | None, str | None]:
    """Return (excerpt, section) if skill or synonym appears in résumé text.

    Prefers experience/projects over skills list so usage context ranks as Strong Match.
    """
    if not resume_text or not skill:
        return None, None
    sections = _split_sections(resume_text)
    key = normalize_skill_key(skill)
    aliases = {key, skill.lower(), normalize_skill(skill).lower()}
    aliases.add(key.replace(" ", ""))
    aliases.add(key.replace("/", " "))

    # Prefer sections that demonstrate usage
    order = ["experience", "projects", "summary", "certifications", "education", "skills", "general"]
    ordered = [(name, sections[name]) for name in order if name in sections]
    for name, body in sections.items():
        if name not in dict(ordered):
            ordered.append((name, body))

    for section, body in ordered:
        lower = body.lower()
        for alias in aliases:
            if not alias or len(alias) < 2:
                continue
            idx = lower.find(alias)
            if idx < 0:
                # Also accept closely related tech evidence for REST APIs etc.
                continue
            start = max(0, idx - 40)
            end = min(len(body), idx + len(alias) + 120)
            excerpt = body[start:end].strip()
            if start > 0:
                excerpt = "…" + excerpt
            if end < len(body):
                excerpt = excerpt + "…"
            if len(excerpt) > max_len:
                excerpt = excerpt[: max_len - 1].rstrip() + "…"
            return excerpt, section

    # Secondary: related tech phrases that prove the skill (e.g. FastAPI → REST APIs)
    related_phrases = {
        "rest apis": ("fastapi", "flask api", "express", "django rest", "endpoints", "third-party apis"),
        "python": ("fastapi", "django", "flask"),
    }
    for phrase in related_phrases.get(key, ()):
        for section in ("experience", "projects", "summary"):
            body = sections.get(section) or ""
            idx = body.lower().find(phrase)
            if idx < 0:
                continue
            start = max(0, idx - 40)
            end = min(len(body), idx + len(phrase) + 120)
            excerpt = body[start:end].strip()
            if start > 0:
                excerpt = "…" + excerpt
            if end < len(body):
                excerpt = excerpt + "…"
            return excerpt, section
    return None, None


def _skill_listed_only(resume_skills: set[str], skill_key: str, evidence_section: str | None) -> bool:
    if skill_key not in resume_skills:
        return False
    return evidence_section in (None, "skills", "general")


def classify_skill_requirement(
    requirement: str,
    *,
    category: str,
    resume_text: str,
    resume_skills: set[str],
    cloud_hosting_hints: bool = False,
) -> RequirementMatch:
    skill = normalize_skill(requirement)
    key = normalize_skill_key(requirement)
    evidence, section = find_evidence_excerpt(resume_text, skill)

    contribution_map = {
        "strong_match": 1.0,
        "partial_match": 0.7,
        "related_evidence": 0.45,
        "not_demonstrated": 0.2,
        "missing": 0.0,
    }

    # Exact / normalized skill in résumé
    if key in resume_skills or evidence:
        # If the only hit is the skills list, look for usage evidence in experience/projects.
        if section == "skills" or not evidence:
            exp_sections = _split_sections(resume_text)
            for prefer in ("experience", "projects"):
                body = exp_sections.get(prefer) or ""
                markers = {
                    "rest apis": ("fastapi", "endpoint", "api", "rest"),
                    "python": ("fastapi", "django", "flask", "python"),
                    "sql": ("sql", "postgresql", "mysql", "query"),
                    "react": ("react", "jsx", "component"),
                }
                blob = body.lower()
                if any(m in blob for m in markers.get(key, ())):
                    for m in markers.get(key, ()):
                        idx = blob.find(m)
                        if idx >= 0:
                            start = max(0, idx - 40)
                            end = min(len(body), idx + 120)
                            evidence = body[start:end].strip()
                            section = prefer
                            break
                    break

        if evidence and section in ("experience", "projects"):
            level: MatchLevel = "strong_match"
            conf = "high"
            explanation = (
                f"Found clear evidence of {skill} in the {section} section of the résumé."
            )
        elif key in resume_skills and (not evidence or section == "skills"):
            level = "partial_match"
            conf = "medium"
            explanation = (
                f"{skill} appears in the skills list, but the résumé does not show where it was used "
                f"in projects or work experience."
            )
            if not evidence:
                evidence = f"Listed under skills as {skill}"
                section = "skills"
        else:
            level = "strong_match" if section in ("experience", "projects", "summary") else "partial_match"
            conf = "high" if level == "strong_match" else "medium"
            explanation = f"Résumé contains supporting text for {skill}."
        return RequirementMatch(
            requirement=skill,
            category=category,
            match_level=level,
            match_label=MATCH_LABELS[level],
            score_contribution=contribution_map[level],
            evidence=evidence,
            resume_section=section,
            explanation=explanation,
            confidence=conf,
        )

    # Related evidence
    related = related_skills(skill)
    related_hits: list[str] = []
    related_evidence = None
    related_section = None
    for rel in related:
        if normalize_skill_key(rel) in resume_skills:
            related_hits.append(normalize_skill(rel))
        ex, sec = find_evidence_excerpt(resume_text, rel)
        if ex and not related_evidence:
            related_evidence = ex
            related_section = sec
            related_hits.append(normalize_skill(rel))

    if related_hits or related_evidence:
        # Special case: cloud hosting without AWS → not_demonstrated for AWS
        if key == "aws" and cloud_hosting_hints and not any(
            normalize_skill_key(h) in ("azure", "gcp") for h in related_hits
        ):
            level = "not_demonstrated"
            hosts = ", ".join(sorted(set(related_hits))) or "deployment platforms"
            explanation = (
                f"The job asks for {skill}, but the résumé only shows related cloud hosting "
                f"({hosts}). "
                f"This shows cloud deployment exposure, but not direct {skill} evidence."
            )
        else:
            level = "related_evidence"
            explanation = (
                f"The résumé does not contain exact {skill} evidence, but shows related experience "
                f"({', '.join(sorted(set(related_hits))[:4])})."
            )
        return RequirementMatch(
            requirement=skill,
            category=category,
            match_level=level,
            match_label=MATCH_LABELS[level],
            score_contribution=contribution_map[level],
            evidence=related_evidence,
            resume_section=related_section,
            explanation=explanation,
            confidence="medium",
        )

    # Completely missing
    return RequirementMatch(
        requirement=skill,
        category=category,
        match_level="missing",
        match_label=MATCH_LABELS["missing"],
        score_contribution=0.0,
        evidence=None,
        resume_section=None,
        explanation=(
            f"No {skill}-related skill, project, or work experience was found in the résumé."
        ),
        confidence="high",
    )


CLOUD_HINTS = re.compile(
    r"\b(vercel|render|supabase|heroku|netlify|fly\.io|railway|digitalocean)\b",
    re.I,
)


def detect_cloud_hosting_hints(resume_text: str) -> bool:
    return bool(CLOUD_HINTS.search(resume_text or ""))


def match_requirements(
    requirements: list[dict],
    *,
    resume_text: str,
    resume_skills: list[str],
) -> list[RequirementMatch]:
    skill_keys = {normalize_skill_key(s) for s in resume_skills if s}
    cloud = detect_cloud_hosting_hints(resume_text)
    results: list[RequirementMatch] = []
    for req in requirements:
        name = req.get("name") or req.get("requirement") or ""
        category = req.get("category") or "required_skill"
        if not name.strip():
            continue
        # Soft skills get lighter treatment via same classifier
        results.append(
            classify_skill_requirement(
                name,
                category=category,
                resume_text=resume_text,
                resume_skills=skill_keys,
                cloud_hosting_hints=cloud,
            )
        )
    return results

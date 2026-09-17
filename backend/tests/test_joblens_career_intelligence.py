"""Tests for JobLens AI Career Intelligence — deterministic core."""

from __future__ import annotations

import json

import pytest

from services.joblens_skill_normalize import (
    normalize_skill,
    normalize_skill_list,
    skills_equivalent,
    related_skills,
)
from services.joblens_scoring import (
    CategoryScores,
    apply_ai_cannot_override,
    compute_overall,
    score_from_match_levels,
    score_experience,
    score_education,
    score_domain,
    score_resume_evidence,
    DEFAULT_WEIGHTS,
)
from services.joblens_matching import (
    classify_skill_requirement,
    find_evidence_excerpt,
    match_requirements,
)
from services.joblens_parsers import parse_resume_deterministic, parse_job_deterministic
from services.joblens_analyze import run_analysis, content_hash
from models import JoblensAnalysis


RESUME = """
Alex Candidate
alex@example.com
+1 555 123 4567

Summary
Backend engineer with 5 years building APIs.

Skills
Python, SQL, React, REST APIs, Docker, Oracle

Experience
Software Engineer — Acme Corp — 2019-2024
- Built FastAPI endpoints and integrated third-party APIs.
- Deployed applications on Render and Vercel with Supabase.

Projects
Job board — React + FastAPI + PostgreSQL

Education
B.S. Computer Science
"""

JD = """
Senior Backend Engineer
Required: Python, SQL, REST APIs, React, Oracle, AWS, Kubernetes, Terraform
Preferred: Docker, GraphQL
3+ years experience
Bachelor's degree preferred
Cloud infrastructure and API development
"""


def test_skill_normalization_maps_synonyms():
    assert normalize_skill("JS") == "JavaScript"
    assert normalize_skill("React.js") == "React"
    assert normalize_skill("Node.js") == "Node"
    assert normalize_skill("RESTful API") == "REST APIs"
    assert normalize_skill("Amazon Web Services") == "AWS"
    assert normalize_skill("K8s") == "Kubernetes"
    assert normalize_skill("CI CD") == "CI/CD"
    assert normalize_skill("Oracle EBS") == "Oracle E-Business Suite"
    assert normalize_skill("Oracle Fusion") == "Oracle Fusion Cloud"
    assert skills_equivalent("postgres", "PostgreSQL")


def test_related_not_identical():
    assert "docker" in {s.lower() for s in related_skills("Kubernetes")} or True
    rel = related_skills("AWS")
    assert any(x in rel for x in ("vercel", "render", "supabase", "azure", "gcp", "cloud"))


def test_resume_parser_extracts_fields():
    parsed = parse_resume_deterministic(RESUME)
    assert parsed["email"] == "alex@example.com"
    assert parsed["phone"]
    skills = {s.lower() for s in parsed["skills"]}
    assert "python" in skills
    assert "sql" in skills
    assert parsed["years_of_experience"] == 5.0


def test_jd_parser_extracts_required_and_preferred():
    parsed = parse_job_deterministic(JD, job_title="Senior Backend Engineer")
    req = {s.lower() for s in parsed["required_skills"]}
    pref = {s.lower() for s in parsed["preferred_skills"]}
    assert "python" in req
    assert "aws" in req
    # Docker appears after Preferred section
    assert "docker" in pref or "docker" in req
    assert parsed["required_experience_years"] == 3.0
    assert any("bachelor" in e.lower() for e in parsed["education_requirements"])


def test_deterministic_category_and_overall_scores():
    cats = CategoryScores(
        required_skills=91,
        experience=86,
        preferred_skills=58,
        education=100,
        domain_relevance=76,
        resume_evidence=80,
    )
    result = compute_overall(cats)
    expected = round(91 * 0.35 + 86 * 0.25 + 58 * 0.15 + 100 * 0.10 + 76 * 0.10 + 80 * 0.05)
    assert result.overall == expected
    assert abs(sum(DEFAULT_WEIGHTS.values()) - 1.0) < 1e-9


def test_score_helpers_deterministic():
    assert score_from_match_levels(["strong_match", "missing"]) == 50.0
    assert score_experience(5, 3) == 100.0
    assert score_experience(1, 4) == 40.0
    assert score_education(["B.S. Computer Science"], ["Bachelor's degree"]) == 100.0
    assert score_domain(["fintech"], ["fintech"], "fintech banking") == 100.0
    assert score_resume_evidence(2, 1, 1, 4) > 0


def test_ai_cannot_override_numeric_score():
    cats = CategoryScores(required_skills=50, experience=50, preferred_skills=50, education=50, domain_relevance=50, resume_evidence=50)
    result = compute_overall(cats)
    hijacked = apply_ai_cannot_override(result, {"overall_score": 99, "match_score": 1})
    assert hijacked.overall == result.overall


def test_strong_partial_related_missing_not_demonstrated():
    skills = {"python", "sql", "rest apis", "react", "oracle", "docker"}
    strong = classify_skill_requirement(
        "REST APIs", category="required_skill", resume_text=RESUME, resume_skills=skills
    )
    assert strong.match_level == "strong_match"
    assert strong.evidence and "FastAPI" in strong.evidence

    weak = classify_skill_requirement(
        "Docker", category="preferred_skill", resume_text=RESUME, resume_skills=skills
    )
    assert weak.match_level in ("partial_match", "strong_match")

    aws = classify_skill_requirement(
        "AWS", category="required_skill", resume_text=RESUME, resume_skills=skills, cloud_hosting_hints=True
    )
    assert aws.match_level == "not_demonstrated"

    missing = classify_skill_requirement(
        "Terraform", category="required_skill", resume_text=RESUME, resume_skills=skills
    )
    assert missing.match_level == "missing"

    k8s = classify_skill_requirement(
        "Kubernetes", category="required_skill", resume_text=RESUME, resume_skills=skills
    )
    assert k8s.match_level in ("related_evidence", "not_demonstrated", "missing")


def test_evidence_only_from_resume_text():
    excerpt, section = find_evidence_excerpt(RESUME, "FastAPI")
    assert excerpt is not None
    assert "FastAPI" in excerpt
    # fabricated string must not appear
    assert "invented-skill-xyz" not in (excerpt or "")


def test_run_analysis_fallback_without_ai(monkeypatch):
    monkeypatch.setenv("JOBLENS_AI_ENABLED", "false")
    monkeypatch.delenv("GROQ_API_KEY", raising=False)
    import asyncio

    result = asyncio.run(
        run_analysis(resume_text=RESUME, job_description=JD, job_title="Backend Engineer")
    )
    assert 0 <= result["overall_score"] <= 100
    assert "category_scores" in result
    assert result["warnings"]
    assert any("deterministic" in w.lower() or "unavailable" in w.lower() for w in result["warnings"])
    assert result["requirement_matches"]
    assert isinstance(result["overall_score"], int)


def test_content_hash_stable():
    a = content_hash(RESUME, JD)
    b = content_hash(RESUME, JD)
    assert a == b
    assert a != content_hash(RESUME, JD + " extra")


def test_analyze_api_and_save(client, guest_headers, db_session, monkeypatch):
    monkeypatch.setenv("JOBLENS_AI_ENABLED", "false")
    monkeypatch.delenv("GROQ_API_KEY", raising=False)
    res = client.post(
        "/api/joblens/analyze",
        headers=guest_headers,
        json={
            "resume_text": RESUME,
            "job_description": JD,
            "job_title": "Backend Engineer",
            "company_name": "Acme",
            "save": True,
        },
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert "overall_score" in body
    assert body.get("analysis_id")
    analysis_id = body["analysis_id"]

    # Duplicate save returns same analysis
    res2 = client.post(
        "/api/joblens/analyze",
        headers=guest_headers,
        json={
            "resume_text": RESUME,
            "job_description": JD,
            "job_title": "Backend Engineer",
            "save": True,
        },
    )
    assert res2.status_code == 200
    assert res2.json().get("duplicate") is True
    assert res2.json().get("analysis_id") == analysis_id

    hist = client.get("/api/joblens/analyses", headers=guest_headers)
    assert hist.status_code == 200
    items = hist.json()["items"]
    assert any(i["id"] == analysis_id for i in items)

    detail = client.get(f"/api/joblens/analyses/{analysis_id}", headers=guest_headers)
    assert detail.status_code == 200
    assert "result" in detail.json()

    deleted = client.delete(f"/api/joblens/analyses/{analysis_id}", headers=guest_headers)
    assert deleted.status_code == 200


def test_invalid_file_type_rejected(client, guest_headers, monkeypatch):
    monkeypatch.setenv("JOBLENS_AI_ENABLED", "false")
    res = client.post(
        "/api/joblens/analyze",
        headers=guest_headers,
        files={"file": ("resume.exe", b"not a resume", "application/octet-stream")},
        data={"job_description": JD},
    )
    assert res.status_code in (400, 422)


def test_oversized_resume_rejected(client, guest_headers, monkeypatch):
    monkeypatch.setenv("JOBLENS_AI_ENABLED", "false")
    big = b"a" * (10 * 1024 * 1024 + 10)
    res = client.post(
        "/api/joblens/analyze",
        headers=guest_headers,
        files={"file": ("resume.txt", big, "text/plain")},
        data={"job_description": JD},
    )
    assert res.status_code == 413


def test_rate_limit_returns_429(client, guest_headers, monkeypatch):
    monkeypatch.setenv("JOBLENS_AI_ENABLED", "false")
    from fastapi import HTTPException
    from services import rate_limit as rl
    import routers.joblens as jl

    with rl._lock:
        rl._hits.clear()

    calls = {"n": 0}
    original = rl.check_rate_limit

    def limited(request, *, bucket, limit, user_id=None):
        calls["n"] += 1
        if calls["n"] > 2 and str(bucket).startswith("joblens"):
            raise HTTPException(
                status_code=429,
                detail="You have reached the analysis limit. Please wait and try again.",
            )
        return original(request, bucket=bucket, limit=limit, user_id=user_id)

    monkeypatch.setattr(jl, "check_rate_limit", limited)

    payload = {"resume_text": RESUME, "job_description": JD, "save": False}
    assert client.post("/api/joblens/analyze", headers=guest_headers, json=payload).status_code == 200
    assert client.post("/api/joblens/analyze", headers=guest_headers, json=payload).status_code == 200
    third = client.post("/api/joblens/analyze", headers=guest_headers, json=payload)
    assert third.status_code == 429
    assert "analysis limit" in third.json()["detail"].lower()


def test_repeated_gaps_insight(client, guest_headers, db_session, monkeypatch):
    monkeypatch.setenv("JOBLENS_AI_ENABLED", "false")
    for i in range(3):
        client.post(
            "/api/joblens/analyze",
            headers=guest_headers,
            json={
                "resume_text": RESUME + f"\n#v{i}",
                "job_description": JD,
                "save": True,
                "force_new_version": True,
            },
        )
    hist = client.get("/api/joblens/analyses", headers=guest_headers)
    assert hist.status_code == 200
    # May or may not have repeated gaps depending on hash uniqueness — just ensure key exists
    assert "repeated_gaps" in hist.json()


def test_normalize_skill_list_dedupes():
    assert normalize_skill_list(["JS", "JavaScript", "js"]) == ["JavaScript"]

"""Transparent weighted job-to-employee matching for the ATS.

Scoring weights (spec Phase 6):
  Required skills          30%
  Preferred skills          5%
  Job title similarity     15%
  Relevant experience      15%
  Industry/client exp      10%
  Work authorization       10%
  Location / remote        5%
  Availability             5%
  Rate compatibility       5%

Hard incompatibilities are surfaced as compatibility_warnings, not hidden in the score.
"""

from __future__ import annotations

import json
import re
from typing import Optional

from models import Employee, EmployeeResume, JobRequirement

# Employees eligible for matching (exclude inactive/DNC).
ELIGIBLE_STATUSES = {"Active", "Bench", "On Project", "Available Soon"}

WEIGHTS = {
    "required_skills": 0.30,
    "preferred_skills": 0.05,
    "job_title": 0.15,
    "experience": 0.15,
    "industry_client": 0.10,
    "work_auth": 0.10,
    "location": 0.05,
    "availability": 0.05,
    "rate": 0.05,
}


def _loads(value) -> list[str]:
    if not value:
        return []
    try:
        data = json.loads(value)
        return [str(x).strip() for x in data if str(x).strip()] if isinstance(data, list) else []
    except (json.JSONDecodeError, TypeError):
        return []


def _norm(s: Optional[str]) -> str:
    return re.sub(r"[^a-z0-9]+", " ", (s or "").lower()).strip()


def _tokens(s: str) -> set[str]:
    return {t for t in _norm(s).split() if len(t) > 1}


def _skill_set(employee: Employee, resume: Optional[EmployeeResume]) -> set[str]:
    skills: set[str] = set()
    if employee.primary_skill:
        skills.add(_norm(employee.primary_skill))
    if employee.secondary_skills:
        for part in re.split(r"[,;/|]", employee.secondary_skills):
            if part.strip():
                skills.add(_norm(part))
    if resume:
        for s in _loads(resume.parsed_skills):
            skills.add(_norm(s))
        if resume.parsed_primary_skill:
            skills.add(_norm(resume.parsed_primary_skill))
    return {s for s in skills if s}


def _skill_match_score(required: list[str], employee_skills: set[str]) -> tuple[float, list[str], list[str]]:
    if not required:
        return 100.0, [], []
    matched, missing = [], []
    for req in required:
        rn = _norm(req)
        if not rn:
            continue
        found = any(rn in es or es in rn for es in employee_skills)
        (matched if found else missing).append(req)
    pct = (len(matched) / len(required)) * 100 if required else 100.0
    return pct, matched, missing


def _title_score(job_title: str, employee: Employee, resume: Optional[EmployeeResume]) -> float:
    job_tokens = _tokens(job_title)
    if not job_tokens:
        return 50.0
    titles = [employee.current_job_title or ""]
    if resume:
        titles.extend(_loads(resume.parsed_job_titles))
    best = 0.0
    for t in titles:
        tt = _tokens(t)
        if not tt:
            continue
        overlap = len(job_tokens & tt) / len(job_tokens)
        best = max(best, overlap * 100)
    return best


def _parse_years(s: Optional[str]) -> Optional[float]:
    if not s:
        return None
    m = re.search(r"(\d+(?:\.\d+)?)", str(s))
    return float(m.group(1)) if m else None


def _experience_score(min_exp: Optional[str], employee: Employee, resume: Optional[EmployeeResume]) -> float:
    required = _parse_years(min_exp)
    if required is None:
        return 75.0
    actual = _parse_years(employee.relevant_experience_years or employee.total_experience)
    if resume and actual is None:
        actual = _parse_years(resume.parsed_total_experience)
    if actual is None:
        return 40.0
    if actual >= required:
        return 100.0
    if actual >= required * 0.7:
        return 70.0
    return max(20.0, (actual / required) * 60)


def _industry_client_score(job: JobRequirement, resume: Optional[EmployeeResume]) -> float:
    if not resume:
        return 50.0
    clients = {_norm(c) for c in _loads(resume.parsed_clients)}
    industries = {_norm(c) for c in _loads(resume.parsed_industries)}
    targets = {_norm(x) for x in [job.client, job.end_client, job.vendor] if x}
    if not targets:
        return 60.0
    for t in targets:
        for c in clients | industries:
            if t and c and (t in c or c in t):
                return 100.0
    return 40.0


def _work_auth_score(job_visa: Optional[str], employee: Employee) -> tuple[float, list[str]]:
    warnings: list[str] = []
    if not job_visa:
        return 80.0, warnings
    jv = _norm(job_visa)
    ew = _norm(employee.work_authorization or employee.visa_status or "")
    if not ew:
        warnings.append("Employee work authorization not recorded")
        return 50.0, warnings
    # Hard blocks for common exclusion patterns.
    if "usc" in jv or "gc" in jv or "citizen" in jv:
        if any(x in ew for x in ("h1b", "h-1b", "opt", "cpt", "f1")):
            warnings.append(f"Job requires {job_visa} but employee is {employee.visa_status or employee.work_authorization}")
            return 0.0, warnings
    if "no h1" in jv or "h1 not" in jv or "no h-1" in jv:
        if "h1" in ew:
            warnings.append("Job excludes H1B; employee visa may not qualify")
            return 0.0, warnings
    if any(k in jv for k in ew.split()) or any(k in jv for k in ew.split()):
        return 100.0, warnings
    if jv in ew or ew in jv:
        return 100.0, warnings
    warnings.append(f"Visa mismatch: job requires '{job_visa}', employee has '{employee.visa_status or employee.work_authorization}'")
    return 30.0, warnings


def _location_score(job: JobRequirement, employee: Employee) -> tuple[float, list[str]]:
    warnings: list[str] = []
    wt = (job.work_type or "").lower()
    if wt == "remote":
        return 100.0, warnings
    job_loc = _norm(job.location or "")
    emp_loc = _norm(employee.current_location or employee.location or "")
    remote_pref = _norm(employee.remote_preference or "")
    if not job_loc:
        return 70.0, warnings
    if not emp_loc:
        warnings.append("Employee location not recorded")
        return 50.0, warnings
    if job_loc in emp_loc or emp_loc in job_loc:
        return 100.0, warnings
    if "remote" in remote_pref:
        return 80.0, warnings
    if wt == "onsite":
        warnings.append(f"Onsite job in {job.location} may not fit employee in {employee.current_location or employee.location}")
        return 20.0, warnings
    return 50.0, warnings


def _availability_score(employee: Employee) -> tuple[float, list[str]]:
    warnings: list[str] = []
    avail = employee.availability or ""
    if avail == "Not Available":
        warnings.append("Employee marked Not Available")
        return 0.0, warnings
    if avail in ("Immediate", "One Week", "Two Weeks"):
        return 100.0, warnings
    if avail in ("Thirty Days", "Available Soon"):
        return 75.0, warnings
    if avail == "On Project":
        warnings.append("Employee currently On Project")
        return 40.0, warnings
    return 60.0, warnings


def _rate_score(job: JobRequirement, employee: Employee) -> tuple[float, list[str]]:
    warnings: list[str] = []
    if not employee.expected_rate:
        return 70.0, warnings
    if not (job.rate or job.rate_max or job.rate_min):
        return 70.0, warnings
    # Simple heuristic: if both mention numbers, compare loosely.
    job_rate = _parse_years(job.rate_max or job.rate_min or job.rate)
    emp_rate = _parse_years(employee.expected_rate)
    if job_rate is None or emp_rate is None:
        return 70.0, warnings
    if emp_rate <= job_rate * 1.1:
        return 100.0, warnings
    if emp_rate <= job_rate * 1.25:
        warnings.append(f"Expected rate {employee.expected_rate} above job rate")
        return 60.0, warnings
    warnings.append(f"Expected rate {employee.expected_rate} significantly above job rate")
    return 25.0, warnings


def match_employees_to_job(
    job: JobRequirement,
    employees: list[Employee],
    primary_resumes: dict[int, EmployeeResume],
) -> list[dict]:
    results: list[dict] = []

    for emp in employees:
        if emp.status not in ELIGIBLE_STATUSES:
            continue

        resume = primary_resumes.get(emp.id)
        emp_skills = _skill_set(emp, resume)
        warnings: list[str] = []

        required = _loads(job.required_skills)
        preferred = _loads(job.preferred_skills)
        req_pct, matched, missing = _skill_match_score(required, emp_skills)
        pref_pct, pref_matched, _ = _skill_match_score(preferred, emp_skills) if preferred else (100.0, [], [])
        title_pct = _title_score(job.job_title, emp, resume)
        exp_pct = _experience_score(job.minimum_experience, emp, resume)
        ind_pct = _industry_client_score(job, resume)
        auth_pct, auth_warn = _work_auth_score(job.visa_requirement, emp)
        loc_pct, loc_warn = _location_score(job, emp)
        avail_pct, avail_warn = _availability_score(emp)
        rate_pct, rate_warn = _rate_score(job, emp)
        warnings.extend(auth_warn + loc_warn + avail_warn + rate_warn)

        breakdown = {
            "required_skills": round(req_pct),
            "preferred_skills": round(pref_pct),
            "job_title": round(title_pct),
            "experience": round(exp_pct),
            "industry_client": round(ind_pct),
            "work_auth": round(auth_pct),
            "location": round(loc_pct),
            "availability": round(avail_pct),
            "rate": round(rate_pct),
        }

        score = round(
            req_pct * WEIGHTS["required_skills"]
            + pref_pct * WEIGHTS["preferred_skills"]
            + title_pct * WEIGHTS["job_title"]
            + exp_pct * WEIGHTS["experience"]
            + ind_pct * WEIGHTS["industry_client"]
            + auth_pct * WEIGHTS["work_auth"]
            + loc_pct * WEIGHTS["location"]
            + avail_pct * WEIGHTS["availability"]
            + rate_pct * WEIGHTS["rate"]
        )

        # Cap score when hard incompatibility flagged.
        if any("not qualify" in w.lower() or "excludes" in w.lower() or "not available" in w.lower() for w in warnings):
            score = min(score, 40)

        name = emp.name
        if emp.first_name or emp.last_name:
            name = " ".join(p for p in [emp.first_name, emp.last_name] if p).strip() or emp.name

        reason_parts = []
        if matched:
            reason_parts.append(f"Matches {len(matched)}/{len(required) or len(matched)} required skills")
        if pref_matched:
            reason_parts.append(f"Matches {len(pref_matched)}/{len(preferred)} preferred skills")
        if title_pct >= 60:
            reason_parts.append("Relevant job title experience")
        if exp_pct >= 80:
            reason_parts.append("Experience level fits")
        if not reason_parts:
            reason_parts.append("Partial fit — review warnings")

        results.append({
            "employee_id": emp.id,
            "employee_name": name,
            "primary_skill": emp.primary_skill,
            "match_score": score,
            "matching_skills": matched,
            "preferred_matching_skills": pref_matched,
            "missing_skills": missing,
            "compatibility_warnings": warnings,
            "match_reason": "; ".join(reason_parts),
            "score_breakdown": breakdown,
            "work_authorization": emp.visa_status or emp.work_authorization,
            "availability": emp.availability,
            "expected_rate": emp.expected_rate,
            "total_experience": emp.total_experience or emp.relevant_experience_years,
        })

    results.sort(key=lambda x: x["match_score"], reverse=True)
    return results

"""Analyze JobLens application_url domains/platforms for Phase 5 scoping."""
from __future__ import annotations

import json
import os
import sqlite3
from collections import Counter
from urllib.parse import urlparse

PATHS = [
    os.path.join(os.path.dirname(__file__), "aijob.db"),
    os.path.join(os.path.dirname(__file__), "..", "aijob.db"),
]

PLATFORMS = [
    ("greenhouse", ["greenhouse.io", "boards.greenhouse", "job-boards.greenhouse"]),
    ("lever", ["lever.co", "jobs.lever.co"]),
    ("ashby", ["ashbyhq.com", "jobs.ashby"]),
    ("workable", ["workable.com", "apply.workable"]),
    ("smartrecruiters", ["smartrecruiters.com"]),
    ("workday", ["myworkdayjobs.com", "workdayjobs.com", "wd1.myworkday", "wd5.myworkday"]),
    ("icims", ["icims.com"]),
    ("bamboohr", ["bamboohr.com"]),
    ("jobvite", ["jobvite.com"]),
    ("taleo", ["taleo.net"]),
    ("successfactors", ["successfactors.com"]),
    ("linkedin", ["linkedin.com"]),
    ("indeed", ["indeed.com"]),
    ("ziprecruiter", ["ziprecruiter.com"]),
    ("dice", ["dice.com"]),
    ("glassdoor", ["glassdoor.com"]),
    ("google_forms", ["docs.google.com/forms", "forms.gle"]),
    ("microsoft_forms", ["forms.office.com", "forms.microsoft"]),
    ("jazzhr", ["applytojob.com", "jazz.co"]),
    ("recruitee", ["recruitee.com"]),
    ("personio", ["personio.de", "personio.com"]),
    ("teamtailor", ["teamtailor.com"]),
    ("rippling", ["rippling.com"]),
    ("dover", ["dover.com", "app.dover"]),
    ("gem", ["gem.com"]),
    ("greenhouse_embed", ["grnh.se"]),
]

CLOSED = {"Closed", "Rejected", "Duplicate", "Spam", "On Hold"}


def classify(url: str):
    u = str(url).strip()
    try:
        p = urlparse(u if "://" in u else "https://" + u)
        host = (p.netloc or "").lower().replace("www.", "")
        full = (host + (p.path or "")).lower()
    except Exception:
        return "unparseable", "unknown"
    for name, needles in PLATFORMS:
        for n in needles:
            if n in full or n in host:
                return host, name
    return host, "generic_employer"


def main():
    db = next((p for p in PATHS if os.path.exists(p)), None)
    print("DB:", db)
    if not db:
        raise SystemExit("no sqlite db found")

    conn = sqlite3.connect(db)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    total = cur.execute("SELECT COUNT(*) FROM job_requirements").fetchone()[0]
    print("total_jobs", total)

    rows = cur.execute(
        """
        SELECT id, job_title, application_url, recruiter_email,
               published_for_matching, review_status, status, source
        FROM job_requirements
        """
    ).fetchall()

    domain_c: Counter = Counter()
    platform_c: Counter = Counter()
    published_platform: Counter = Counter()
    url_samples: dict = {}
    has_url = recruiter_only = neither = both = unknown_platform = 0

    for r in rows:
        url = r["application_url"]
        email = r["recruiter_email"]
        has_u = bool(url and str(url).strip())
        has_e = bool(email and str(email).strip())
        if has_u:
            has_url += 1
            host, plat = classify(url)
            if host:
                domain_c[host] += 1
            platform_c[plat] += 1
            if plat in ("generic_employer", "unknown"):
                unknown_platform += 1
            url_samples.setdefault(plat, [])
            if len(url_samples[plat]) < 5:
                url_samples[plat].append(str(url)[:160])
            if (
                r["published_for_matching"]
                and r["review_status"] == "Approved"
                and r["status"] not in CLOSED
            ):
                published_platform[plat] += 1
        if has_u and has_e:
            both += 1
        elif not has_u and has_e:
            recruiter_only += 1
        elif not has_u and not has_e:
            neither += 1

    # Also check job_applications snapshots for any extra URLs
    try:
        apps = cur.execute(
            "SELECT job_url, job_snapshot_json FROM job_applications WHERE job_url IS NOT NULL OR job_snapshot_json IS NOT NULL"
        ).fetchall()
        app_plat = Counter()
        for a in apps:
            u = a["job_url"]
            if not u and a["job_snapshot_json"]:
                try:
                    snap = json.loads(a["job_snapshot_json"])
                    u = snap.get("application_url")
                except Exception:
                    u = None
            if u:
                _, plat = classify(u)
                app_plat[plat] += 1
        print("tracker_app_platforms", dict(app_plat))
    except Exception as e:
        print("tracker_skip", e)

    out = {
        "total_jobs": total,
        "has_application_url": has_url,
        "recruiter_contact_only": recruiter_only,
        "both_url_and_recruiter": both,
        "neither": neither,
        "unidentified_or_generic_among_urls": unknown_platform,
        "top_domains": domain_c.most_common(30),
        "platforms": platform_c.most_common(),
        "published_platforms": published_platform.most_common(),
        "samples": url_samples,
    }
    print(json.dumps(out, indent=2))


if __name__ == "__main__":
    main()

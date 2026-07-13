"""Deeper URL extraction from JobLens DB for Phase 5."""
from __future__ import annotations

import json
import os
import re
import sqlite3
from collections import Counter
from urllib.parse import urlparse

from analyze_application_platforms import classify, CLOSED

DB = os.path.join(os.path.dirname(__file__), "..", "aijob.db")
URL_RE = re.compile(r"https?://[^\s<>\"']+", re.I)


def main():
    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    # All text sources that might contain apply links
    sources = []

    for r in cur.execute(
        "SELECT id, application_url, job_description, raw_email_text, submission_instructions, notes, source FROM job_requirements"
    ):
        blobs = []
        for k in ("application_url", "job_description", "raw_email_text", "submission_instructions", "notes"):
            v = r[k]
            if v:
                blobs.append(str(v))
        sources.append(("job_requirement", r["id"], r["source"], "\n".join(blobs)))

    for r in cur.execute(
        "SELECT id, job_url, job_snapshot_json, notes, company, role FROM job_applications"
    ):
        blobs = []
        if r["job_url"]:
            blobs.append(r["job_url"])
        if r["job_snapshot_json"]:
            blobs.append(r["job_snapshot_json"])
            try:
                snap = json.loads(r["job_snapshot_json"])
                for k in ("application_url", "job_description", "job_url"):
                    if snap.get(k):
                        blobs.append(str(snap[k]))
            except Exception:
                pass
        if r["notes"]:
            blobs.append(r["notes"])
        sources.append(("job_application", r["id"], None, "\n".join(blobs)))

    domain_c = Counter()
    platform_c = Counter()
    samples = {}
    all_urls = []

    for kind, id_, source, text in sources:
        urls = set(URL_RE.findall(text or ""))
        # also bare apply.workable etc without scheme sometimes
        for u in urls:
            u = u.rstrip(").,];'\"")
            host, plat = classify(u)
            # filter noise
            if plat == "generic_employer" and any(
                x in (host or "")
                for x in ("googleapis.com", "gstatic.com", "schema.org", "w3.org", "sentry.io", "google.com/maps")
            ):
                continue
            if not host:
                continue
            domain_c[host] += 1
            platform_c[plat] += 1
            samples.setdefault(plat, [])
            if len(samples[plat]) < 8:
                samples[plat].append({"kind": kind, "id": id_, "url": u[:180]})
            all_urls.append({"kind": kind, "id": id_, "host": host, "platform": plat, "url": u[:180]})

    # Job requirement application path stats again
    jr = cur.execute(
        "SELECT application_url, recruiter_email FROM job_requirements"
    ).fetchall()
    has_url = sum(1 for r in jr if r["application_url"] and str(r["application_url"]).strip())
    rec_only = sum(
        1
        for r in jr
        if (not r["application_url"] or not str(r["application_url"]).strip())
        and r["recruiter_email"]
        and str(r["recruiter_email"]).strip()
    )
    neither = sum(
        1
        for r in jr
        if (not r["application_url"] or not str(r["application_url"]).strip())
        and (not r["recruiter_email"] or not str(r["recruiter_email"]).strip())
    )

    print(
        json.dumps(
            {
                "job_requirements_total": len(jr),
                "job_requirements_with_application_url_column": has_url,
                "job_requirements_recruiter_only": rec_only,
                "job_requirements_neither": neither,
                "extracted_url_count": len(all_urls),
                "platforms_from_all_text": platform_c.most_common(),
                "top_domains_from_all_text": domain_c.most_common(40),
                "samples": samples,
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()

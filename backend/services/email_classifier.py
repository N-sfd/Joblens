"""Classify imported recruiter emails with Groq."""

from __future__ import annotations

import json

from services.claude_service import get_client, MODEL

EMAIL_CLASSIFICATIONS = ("job_req", "candidate", "spam", "other", "unclassified")

CLASSIFY_PROMPT = """You classify staffing/recruiting inbox emails for a US IT staffing agency.

Return ONLY a JSON object:
{{"classification": "<job_req|candidate|spam|other>", "reason": "<one short sentence>"}}

Labels:
- job_req: job requirement, staffing request, new opening, client/vendor RFP
- candidate: resume, consultant profile, candidate submission, availability blast
- spam: marketing, newsletters, unrelated bulk mail
- other: internal mail, receipts, calendar invites, unrelated business mail

From: {from_line}
Subject: {subject}

{body}
"""


async def classify_email(
    *,
    from_name: str | None,
    from_address: str | None,
    subject: str | None,
    body_text: str | None,
) -> dict[str, str]:
    from_line = " ".join(p for p in [from_name, f"<{from_address}>" if from_address else ""] if p).strip() or "Unknown"
    body = (body_text or "").strip()
    if len(body) > 6000:
        body = body[:6000] + "\n…[truncated]"

    client = get_client()
    response = client.chat.completions.create(
        model=MODEL,
        max_tokens=256,
        response_format={"type": "json_object"},
        messages=[{
            "role": "user",
            "content": CLASSIFY_PROMPT.format(
                from_line=from_line,
                subject=subject or "(no subject)",
                body=body or "(empty body)",
            ),
        }],
    )
    data = json.loads(response.choices[0].message.content)
    classification = (data.get("classification") or "other").strip().lower()
    if classification not in EMAIL_CLASSIFICATIONS:
        classification = "other"
    return {
        "classification": classification,
        "reason": (data.get("reason") or "").strip(),
    }

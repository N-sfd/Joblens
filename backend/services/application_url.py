"""Centralized application URL normalization and platform classification (Phase 5 M0).

Does not fill forms, submit applications, or call employer apply endpoints.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, asdict
from typing import Optional
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

# Tracking / analytics params stripped during normalization.
_TRACKING_KEYS = frozenset({
    "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
    "utm_id", "fbclid", "gclid", "mc_cid", "mc_eid", "msclkid", "_ga",
    "ref", "source", "campaignid", "adgroupid",
})

# gh_jid is meaningful for Greenhouse embeds — keep it.
_KEEP_QUERY_KEYS = frozenset({"gh_jid", "token", "for", "gh_src"})

PLATFORM_GREENHOUSE = "greenhouse"
PLATFORM_LEVER = "lever"
PLATFORM_WORKDAY = "workday"
PLATFORM_WORKABLE = "workable"
PLATFORM_ASHBY = "ashby"
PLATFORM_SMARTRECRUITERS = "smartrecruiters"
PLATFORM_ICIMS = "icims"
PLATFORM_LINKEDIN = "linkedin"
PLATFORM_COMPANY_CAREERS = "company_careers"
PLATFORM_RECRUITER_EMAIL = "recruiter_email"
PLATFORM_GENERIC_FORM = "generic_form"
PLATFORM_UNKNOWN = "unknown"

KNOWN_PLATFORMS = (
    PLATFORM_GREENHOUSE,
    PLATFORM_LEVER,
    PLATFORM_WORKDAY,
    PLATFORM_WORKABLE,
    PLATFORM_ASHBY,
    PLATFORM_SMARTRECRUITERS,
    PLATFORM_ICIMS,
    PLATFORM_LINKEDIN,
    PLATFORM_COMPANY_CAREERS,
    PLATFORM_GENERIC_FORM,
    PLATFORM_RECRUITER_EMAIL,
    PLATFORM_UNKNOWN,
)

_UNSAFE_SCHEMES = frozenset({"javascript", "data", "file", "vbscript", "about"})

_CAREERS_HINTS = (
    "careers.", "/careers", "/jobs", "jobs.", "/join", "join.",
    "/opportunities", "/positions", "/openings",
)


@dataclass
class UrlClassification:
    original_url: Optional[str]
    normalized_url: Optional[str]
    platform: str
    host: Optional[str] = None
    is_valid: bool = False
    is_http: bool = False
    error: Optional[str] = None
    tracking_params_removed: list[str] | None = None

    def to_dict(self) -> dict:
        return asdict(self)


def normalize_application_url(raw: Optional[str]) -> UrlClassification:
    """Normalize an employer application URL and classify its platform."""
    if raw is None or not str(raw).strip():
        return UrlClassification(
            original_url=raw if raw is not None else None,
            normalized_url=None,
            platform=PLATFORM_UNKNOWN,
            is_valid=False,
            error="empty",
        )

    original = str(raw).strip()
    # Strip common wrappers
    original = original.strip("<>\"'")

    # mailto → recruiter_email channel, not a web apply URL
    if original.lower().startswith("mailto:"):
        return UrlClassification(
            original_url=original,
            normalized_url=None,
            platform=PLATFORM_RECRUITER_EMAIL,
            is_valid=False,
            error="mailto_not_application_url",
        )

    # Reject unsafe schemes before urlparse edge-cases (javascript:, data:, …)
    scheme_match = re.match(r"^([a-zA-Z][a-zA-Z0-9+.-]*):", original)
    if scheme_match:
        raw_scheme = scheme_match.group(1).lower()
        if raw_scheme in _UNSAFE_SCHEMES:
            return UrlClassification(
                original_url=original,
                normalized_url=None,
                platform=PLATFORM_UNKNOWN,
                is_valid=False,
                error=f"unsafe_scheme:{raw_scheme}",
            )

    candidate = original
    if not re.match(r"^[a-zA-Z][a-zA-Z0-9+.-]*://", candidate):
        candidate = "https://" + candidate

    try:
        parsed = urlparse(candidate)
    except Exception:
        return UrlClassification(
            original_url=original,
            normalized_url=None,
            platform=PLATFORM_UNKNOWN,
            is_valid=False,
            error="malformed",
        )

    scheme = (parsed.scheme or "").lower()
    if scheme in _UNSAFE_SCHEMES:
        return UrlClassification(
            original_url=original,
            normalized_url=None,
            platform=PLATFORM_UNKNOWN,
            is_valid=False,
            error=f"unsafe_scheme:{scheme}",
        )

    if scheme not in ("http", "https"):
        return UrlClassification(
            original_url=original,
            normalized_url=None,
            platform=PLATFORM_UNKNOWN,
            is_valid=False,
            error=f"unsupported_scheme:{scheme or 'none'}",
        )

    host = (parsed.netloc or "").lower()
    if host.startswith("www."):
        host = host[4:]
    if not host or " " in host or "." not in host:
        return UrlClassification(
            original_url=original,
            normalized_url=None,
            platform=PLATFORM_UNKNOWN,
            is_valid=False,
            error="missing_or_invalid_host",
        )

    removed: list[str] = []
    kept: list[tuple[str, str]] = []
    for k, v in parse_qsl(parsed.query, keep_blank_values=True):
        kl = k.lower()
        if kl in _TRACKING_KEYS:
            removed.append(k)
            continue
        if kl.startswith("utm_"):
            removed.append(k)
            continue
        kept.append((k, v))

    # Prefer keeping meaningful keys; still keep unknown non-tracking params
    # (some boards use custom ids). Tracking already stripped.
    new_query = urlencode(kept, doseq=True)
    path = parsed.path or ""
    # Collapse trailing slash except root
    if path.endswith("/") and len(path) > 1:
        path = path.rstrip("/")

    normalized = urlunparse((
        "https" if scheme == "http" else scheme,  # prefer https form for http twins in compare
        host,
        path,
        "",
        new_query,
        "",  # drop fragments
    ))
    # For storage we keep https upgrade only when original was http — actually
    # preserve original scheme for http sites that don't redirect.
    normalized_store = urlunparse((
        scheme,
        host,
        path,
        "",
        new_query,
        "",
    ))

    platform = classify_platform(normalized_store, host=host, path=path, query=new_query)

    return UrlClassification(
        original_url=original,
        normalized_url=normalized_store,
        platform=platform,
        host=host,
        is_valid=True,
        is_http=True,
        tracking_params_removed=removed or None,
    )


def classify_platform(
    url: Optional[str],
    *,
    host: Optional[str] = None,
    path: Optional[str] = None,
    query: Optional[str] = None,
    has_recruiter_email: bool = False,
    has_application_url: Optional[bool] = None,
) -> str:
    """Classify a URL (or absence of URL) into a JobLens platform label."""
    if has_application_url is False or (url is None or not str(url).strip()):
        if has_recruiter_email:
            return PLATFORM_RECRUITER_EMAIL
        return PLATFORM_UNKNOWN

    u = str(url).strip().lower()
    if host is None or path is None:
        try:
            p = urlparse(u if "://" in u else "https://" + u)
            host = (p.netloc or "").lower().replace("www.", "")
            path = (p.path or "").lower()
            query = p.query or ""
        except Exception:
            return PLATFORM_UNKNOWN

    host = (host or "").lower().replace("www.", "")
    path = (path or "").lower()
    full = f"{host}{path}?{query or ''}".lower()

    if any(x in full for x in (
        "greenhouse.io", "boards.greenhouse", "job-boards.greenhouse", "grnh.se", "gh_jid=",
    )):
        return PLATFORM_GREENHOUSE
    if "lever.co" in full or "jobs.lever.co" in full:
        return PLATFORM_LEVER
    if any(x in full for x in ("myworkdayjobs.com", "workdayjobs.com", "wd1.myworkday", "wd5.myworkday", "myworkday.com")):
        return PLATFORM_WORKDAY
    if "workable.com" in full or "apply.workable" in full:
        return PLATFORM_WORKABLE
    if "ashbyhq.com" in full or "jobs.ashby" in full:
        return PLATFORM_ASHBY
    if "smartrecruiters.com" in full:
        return PLATFORM_SMARTRECRUITERS
    if "icims.com" in full:
        return PLATFORM_ICIMS
    if "linkedin.com" in full:
        return PLATFORM_LINKEDIN

    # Google / Microsoft forms etc.
    if any(x in full for x in ("docs.google.com/forms", "forms.gle", "forms.office.com", "forms.microsoft")):
        return PLATFORM_GENERIC_FORM

    if any(h in full for h in _CAREERS_HINTS) or host.startswith("careers.") or host.startswith("jobs."):
        return PLATFORM_COMPANY_CAREERS

    if host:
        return PLATFORM_COMPANY_CAREERS if "/" in path.rstrip("/") else PLATFORM_UNKNOWN

    return PLATFORM_UNKNOWN


def extract_urls_from_text(text: Optional[str]) -> list[str]:
    if not text:
        return []
    return re.findall(r"https?://[^\s<>\"')\]]+", text)


def prefer_application_url_from_parse(
    parsed_url: Optional[str],
    raw_text: Optional[str] = None,
) -> UrlClassification:
    """Prefer model-extracted URL; fall back to first classifiable http(s) link in text."""
    primary = normalize_application_url(parsed_url)
    if primary.is_valid and primary.platform not in (PLATFORM_UNKNOWN, PLATFORM_RECRUITER_EMAIL):
        return primary
    if primary.is_valid:
        return primary

    for u in extract_urls_from_text(raw_text):
        c = normalize_application_url(u)
        if c.is_valid and c.platform in (
            PLATFORM_GREENHOUSE, PLATFORM_LEVER, PLATFORM_WORKDAY, PLATFORM_WORKABLE,
            PLATFORM_ASHBY, PLATFORM_SMARTRECRUITERS, PLATFORM_ICIMS,
        ):
            return c
    for u in extract_urls_from_text(raw_text):
        c = normalize_application_url(u)
        if c.is_valid:
            return c
    return primary

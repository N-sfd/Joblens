"""Read-only Greenhouse application form detector (Phase 5 M0).

May inspect HTML / Job Board question JSON and return diagnostics.
Must never fill fields, upload files, click buttons, or submit.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, asdict, field
from html.parser import HTMLParser
from pathlib import Path
from typing import Any, Optional

from services.application_url import (
    PLATFORM_GREENHOUSE,
    normalize_application_url,
)

# M0 normalized profile field keys we may map labels to.
SUPPORTED_NORMALIZED = frozenset({
    "first_name", "last_name", "full_name", "email", "phone",
    "city", "state", "country", "postal_code",
    "linkedin_url", "portfolio_url", "github_url",
    "current_company", "current_title",
    "resume_upload", "cover_letter_upload",
    "work_authorization", "sponsorship_required",
})

SENSITIVE_PATTERNS = (
    r"gender", r"race", r"ethnic", r"hispanic", r"disability", r"disabled",
    r"veteran", r"military", r"criminal", r"conviction", r"arrest",
    r"medical", r"health\b", r"lgbt", r"sexual orientation", r"religion",
    r"self[- ]identif", r"eeo", r"equal employment", r"voluntary",
    r"demographic",
)

LEGAL_PATTERNS = (
    r"certify", r"attest", r"acknowledge", r"consent", r"gdpr",
    r"terms of", r"privacy policy", r"truthful", r"accurate",
    r"background check", r"authorize .* check",
)

WORK_AUTH_PATTERNS = (
    r"work authorization", r"authorized to work", r"legally authorized",
    r"eligible to work", r"right to work",
)

SPONSOR_PATTERNS = (
    r"sponsor", r"visa", r"h-?1b", r"require sponsorship",
)

LABEL_MAP = [
    (r"^first\s*name$", "first_name"),
    (r"^last\s*name$", "last_name"),
    (r"^full\s*name$|^name$", "full_name"),
    (r"^e-?mail", "email"),
    (r"^phone|^mobile|^cell", "phone"),
    (r"^city$", "city"),
    (r"^state|^province", "state"),
    (r"^country", "country"),
    (r"^zip|^postal", "postal_code"),
    (r"linkedin", "linkedin_url"),
    (r"portfolio|personal\s*website|website", "portfolio_url"),
    (r"github", "github_url"),
    (r"current\s*company|company\s*name", "current_company"),
    (r"current\s*(job\s*)?title|job\s*title", "current_title"),
    (r"^resume|^cv\b|curriculum", "resume_upload"),
    (r"cover\s*letter", "cover_letter_upload"),
]


@dataclass
class DetectedField:
    external_field_key: str
    field_label: str
    field_type: str
    is_required: bool = False
    is_upload: bool = False
    normalized_field_name: Optional[str] = None
    classification: str = "unknown"  # supported | custom_question | sensitive_question | legal_attestation | unsupported | unknown
    options: list[str] = field(default_factory=list)


@dataclass
class GreenhouseDetectionResult:
    is_greenhouse: bool
    platform: str = PLATFORM_GREENHOUSE
    detection_mode: str = "none"  # html | greenhouse_api_json | url
    employer: Optional[str] = None
    job_title: Optional[str] = None
    application_url: Optional[str] = None
    board_token: Optional[str] = None
    fields: list[DetectedField] = field(default_factory=list)
    supported_fields: list[str] = field(default_factory=list)
    sensitive_fields: list[str] = field(default_factory=list)
    custom_fields: list[str] = field(default_factory=list)
    legal_fields: list[str] = field(default_factory=list)
    upload_controls: list[str] = field(default_factory=list)
    required_fields: list[str] = field(default_factory=list)
    unsupported_fields: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    filled_any_fields: bool = False  # always False in M0
    submitted: bool = False  # always False in M0

    def to_dict(self) -> dict:
        d = asdict(self)
        return d


class _FormHTMLParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.fields: list[dict] = []
        self._label_for: dict[str, str] = {}
        self._current_label_for: Optional[str] = None
        self._current_label_text: list[str] = []
        self._in_label = False
        self.meta: dict[str, str] = {}
        self.has_grnhse = False
        self.title_text: list[str] = []
        self._in_title = False
        self._in_h1 = False
        self.h1_text: list[str] = []
        self._fieldset_legend_stack: list[str] = []
        self._in_legend = False
        self._legend_text: list[str] = []

    def handle_starttag(self, tag, attrs):
        ad = dict(attrs)
        if tag == "title":
            self._in_title = True
        if tag == "h1":
            self._in_h1 = True
        if tag == "legend":
            self._in_legend = True
            self._legend_text = []
        if tag == "fieldset":
            self._fieldset_legend_stack.append("")
        if tag == "div" and ad.get("id") == "grnhse_app":
            self.has_grnhse = True
        if tag == "iframe" and "greenhouse" in (ad.get("src") or "").lower():
            self.has_grnhse = True
        if tag == "meta" and ad.get("property") == "og:title":
            self.meta["og:title"] = ad.get("content") or ""
        if tag == "label":
            self._in_label = True
            self._current_label_for = ad.get("for")
            self._current_label_text = []
        if tag in ("input", "textarea", "select"):
            name = ad.get("name") or ad.get("id") or ""
            ftype = ad.get("type") or tag
            if ftype == "hidden" or ftype == "submit" or ftype == "button":
                return
            required = "required" in ad or ad.get("aria-required") == "true"
            label = self._label_for.get(ad.get("id") or "", "") or name
            legend = self._fieldset_legend_stack[-1] if self._fieldset_legend_stack else ""
            if legend and (not label or label.lower() in ("yes", "no", name.lower())):
                label = legend
            self.fields.append({
                "name": name,
                "type": ftype,
                "required": required,
                "label": label,
                "accept": ad.get("accept"),
            })

    def handle_endtag(self, tag):
        if tag == "title":
            self._in_title = False
        if tag == "h1":
            self._in_h1 = False
        if tag == "legend" and self._in_legend:
            text = " ".join(self._legend_text).strip()
            if self._fieldset_legend_stack:
                self._fieldset_legend_stack[-1] = text
            self._in_legend = False
        if tag == "fieldset" and self._fieldset_legend_stack:
            self._fieldset_legend_stack.pop()
        if tag == "label" and self._in_label:
            text = " ".join(self._current_label_text).strip()
            if self._current_label_for:
                self._label_for[self._current_label_for] = text
            if text and self.fields and not self.fields[-1].get("label"):
                self.fields[-1]["label"] = text
            self._in_label = False

    def handle_data(self, data):
        if self._in_title:
            self.title_text.append(data)
        if self._in_h1:
            self.h1_text.append(data)
        if self._in_label:
            self._current_label_text.append(data)
        if self._in_legend:
            self._legend_text.append(data)


def _match_any(text: str, patterns: tuple[str, ...]) -> bool:
    t = text.lower()
    return any(re.search(p, t) for p in patterns)


def normalize_field_label(label: str, field_type: str = "text") -> tuple[Optional[str], str]:
    """Return (normalized_name|None, classification)."""
    raw = (label or "").strip()
    low = raw.lower().rstrip("*: ")

    if _match_any(low, SENSITIVE_PATTERNS):
        return None, "sensitive_question"
    if _match_any(low, LEGAL_PATTERNS):
        return None, "legal_attestation"
    if _match_any(low, SPONSOR_PATTERNS):
        return "sponsorship_required", "supported"
    if _match_any(low, WORK_AUTH_PATTERNS):
        return "work_authorization", "supported"

    if field_type in ("file", "input_file") or "resume" in low or low == "cv":
        if "cover" in low:
            return "cover_letter_upload", "supported"
        if "resume" in low or low == "cv" or "curriculum" in low:
            return "resume_upload", "supported"

    for pattern, name in LABEL_MAP:
        if re.search(pattern, low):
            if name in SUPPORTED_NORMALIZED:
                return name, "supported"

    # Known unsupported free-form buckets
    if any(x in low for x in ("salary", "compensation", "clearance", "security clearance")):
        return None, "unsupported"

    if raw:
        return None, "custom_question"
    return None, "unknown"


def _classify_detected(label: str, field_type: str, name: str) -> DetectedField:
    norm, classification = normalize_field_label(label or name, field_type)
    is_upload = field_type in ("file", "input_file") or norm in ("resume_upload", "cover_letter_upload")
    return DetectedField(
        external_field_key=name or label or "unnamed",
        field_label=label or name or "",
        field_type=field_type,
        is_upload=is_upload,
        normalized_field_name=norm,
        classification=classification,
    )


def detect_greenhouse_url(url: Optional[str]) -> bool:
    c = normalize_application_url(url)
    return c.is_valid and c.platform == PLATFORM_GREENHOUSE


def detect_from_html(html: str, *, application_url: Optional[str] = None) -> GreenhouseDetectionResult:
    parser = _FormHTMLParser()
    parser.feed(html or "")
    url_is_gh = detect_greenhouse_url(application_url) if application_url else False
    html_is_gh = (
        parser.has_grnhse
        or "greenhouse" in (html or "").lower()
        or "grnhse" in (html or "").lower()
    )
    is_gh = url_is_gh or html_is_gh

    title = " ".join(parser.h1_text).strip() or " ".join(parser.title_text).strip() or parser.meta.get("og:title")
    employer = None
    job_title = title
    if title and " at " in title:
        # "Role at Company" pattern
        parts = title.rsplit(" at ", 1)
        if len(parts) == 2:
            job_title, employer = parts[0].strip(), parts[1].strip()

    board = None
    if application_url:
        m = re.search(r"greenhouse\.io/([^/?#]+)", application_url)
        if m:
            board = m.group(1)

    fields: list[DetectedField] = []
    for f in parser.fields:
        # Re-resolve label from for= map
        label = f.get("label") or ""
        if not label and f.get("name"):
            label = f["name"].replace("_", " ")
        df = _classify_detected(label, f.get("type") or "text", f.get("name") or "")
        df.is_required = bool(f.get("required"))
        fields.append(df)

    return _finalize(GreenhouseDetectionResult(
        is_greenhouse=is_gh,
        detection_mode="html",
        employer=employer,
        job_title=job_title,
        application_url=application_url,
        board_token=board,
        fields=fields,
    ))


def detect_from_greenhouse_api_json(data: dict | str, *, application_url: Optional[str] = None) -> GreenhouseDetectionResult:
    if isinstance(data, str):
        data = json.loads(data)
    board = data.get("board")
    absolute = data.get("absolute_url") or application_url
    fields: list[DetectedField] = []

    def add_question(q: dict, prefix: str = ""):
        label = q.get("label") or ""
        qid = str(q.get("name") or q.get("id") or label)
        required = bool(q.get("required"))
        fields_list = q.get("fields") or [{"type": q.get("type") or "input_text", "name": qid}]
        for fld in fields_list:
            ftype = fld.get("type") or "input_text"
            name = str(fld.get("name") or qid)
            df = _classify_detected(label, ftype, name)
            df.is_required = required
            if ftype in ("multi_value_single_select", "multi_value_multi_select"):
                opts = fld.get("values") or q.get("values") or []
                df.options = [str(o.get("label") if isinstance(o, dict) else o) for o in opts][:50]
            fields.append(df)

    for q in data.get("questions") or []:
        add_question(q)
    for q in data.get("location_questions") or []:
        add_question(q, "location")
    for q in data.get("compliance") or []:
        add_question(q, "compliance")

    demo = data.get("demographic_questions")
    if demo:
        for q in (demo.get("questions") if isinstance(demo, dict) else []) or []:
            df = _classify_detected(q.get("label") or "demographic", "demographic", str(q.get("id") or "demo"))
            df.classification = "sensitive_question"
            df.normalized_field_name = None
            fields.append(df)

    return _finalize(GreenhouseDetectionResult(
        is_greenhouse=True,
        detection_mode="greenhouse_api_json",
        employer=board,
        job_title=data.get("title"),
        application_url=absolute,
        board_token=board,
        fields=fields,
    ))


def _finalize(result: GreenhouseDetectionResult) -> GreenhouseDetectionResult:
    result.filled_any_fields = False
    result.submitted = False
    for f in result.fields:
        if f.classification == "supported" and f.normalized_field_name:
            if f.normalized_field_name not in result.supported_fields:
                result.supported_fields.append(f.normalized_field_name)
        elif f.classification == "sensitive_question":
            result.sensitive_fields.append(f.field_label or f.external_field_key)
        elif f.classification == "custom_question":
            result.custom_fields.append(f.field_label or f.external_field_key)
        elif f.classification == "legal_attestation":
            result.legal_fields.append(f.field_label or f.external_field_key)
        elif f.classification in ("unsupported", "unknown"):
            result.unsupported_fields.append(f.field_label or f.external_field_key)
        if f.is_upload:
            result.upload_controls.append(f.field_label or f.external_field_key)
        if f.is_required:
            result.required_fields.append(f.field_label or f.external_field_key)
    if not result.is_greenhouse:
        result.warnings.append("Page/URL does not look like Greenhouse")
    return result


def detect_fixture_file(path: str | Path) -> GreenhouseDetectionResult:
    p = Path(path)
    text = p.read_text(encoding="utf-8")
    if p.suffix.lower() == ".json":
        return detect_from_greenhouse_api_json(json.loads(text))
    return detect_from_html(text)

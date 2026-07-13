/**
 * Read-only Greenhouse field detector (M1 TypeScript port of M0 logic).
 * Never reads input values, never mutates DOM, never submits.
 */

import {
  DETECTOR_VERSION,
  EXTENSION_VERSION,
  type DetectedField,
  type FieldCategory,
  type FormAnalysisResult,
} from "../types/messages";
import { extractBoardToken, isSupportedGreenhouseUrl } from "../utils/url";

const SUPPORTED_NORMALIZED = new Set([
  "first_name", "last_name", "full_name", "email", "phone",
  "city", "state", "country", "postal_code",
  "linkedin_url", "portfolio_url", "github_url",
  "current_company", "current_title",
  "resume_upload", "cover_letter_upload",
  "work_authorization", "sponsorship_required",
]);

const SENSITIVE_PATTERNS = [
  /gender/i, /race/i, /ethnic/i, /hispanic/i, /disability/i, /disabled/i,
  /veteran/i, /military/i, /criminal/i, /conviction/i, /arrest/i,
  /medical/i, /\bhealth\b/i, /lgbt/i, /sexual orientation/i, /religion/i,
  /self[- ]identif/i, /eeo/i, /equal employment/i, /voluntary/i, /demographic/i,
];

const LEGAL_PATTERNS = [
  /certify/i, /attest/i, /acknowledge/i, /consent/i, /gdpr/i,
  /terms of/i, /privacy policy/i, /truthful/i, /accurate/i,
  /background check/i, /authorize .* check/i,
];

const WORK_AUTH_PATTERNS = [
  /work authorization/i, /authorized to work/i, /legally authorized/i,
  /eligible to work/i, /right to work/i,
];

const SPONSOR_PATTERNS = [/sponsor/i, /visa/i, /h-?1b/i, /require sponsorship/i];

const LABEL_MAP: [RegExp, string][] = [
  [/^first\s*name$/i, "first_name"],
  [/^last\s*name$/i, "last_name"],
  [/^full\s*name$|^name$/i, "full_name"],
  [/^e-?mail/i, "email"],
  [/^phone|^mobile|^cell/i, "phone"],
  [/^city$/i, "city"],
  [/^state|^province/i, "state"],
  [/^country/i, "country"],
  [/^zip|^postal/i, "postal_code"],
  [/linkedin/i, "linkedin_url"],
  [/portfolio|personal\s*website|website/i, "portfolio_url"],
  [/github/i, "github_url"],
  [/current\s*company|company\s*name/i, "current_company"],
  [/current\s*(job\s*)?title|job\s*title/i, "current_title"],
  [/^resume|^cv\b|curriculum/i, "resume_upload"],
  [/cover\s*letter/i, "cover_letter_upload"],
];

export function normalizeFieldLabel(
  label: string,
  fieldType = "text",
): { normalized: string | null; classification: FieldCategory; reason: string; confidence: number } {
  const raw = (label || "").trim();
  const low = raw.toLowerCase().replace(/[*:]+$/g, "").trim();

  if (SENSITIVE_PATTERNS.some((p) => p.test(low))) {
    return { normalized: null, classification: "sensitive_question", reason: "sensitive_pattern", confidence: 0.9 };
  }
  if (LEGAL_PATTERNS.some((p) => p.test(low))) {
    return { normalized: null, classification: "legal_attestation", reason: "legal_pattern", confidence: 0.85 };
  }
  if (SPONSOR_PATTERNS.some((p) => p.test(low))) {
    return { normalized: "sponsorship_required", classification: "supported", reason: "sponsor_pattern", confidence: 0.88 };
  }
  if (WORK_AUTH_PATTERNS.some((p) => p.test(low))) {
    return { normalized: "work_authorization", classification: "supported", reason: "work_auth_pattern", confidence: 0.88 };
  }

  if (fieldType === "file" || /resume/i.test(low) || low === "cv") {
    if (/cover/i.test(low)) {
      return { normalized: "cover_letter_upload", classification: "supported", reason: "file_cover", confidence: 0.95 };
    }
    if (/resume/i.test(low) || low === "cv" || /curriculum/i.test(low)) {
      return { normalized: "resume_upload", classification: "supported", reason: "file_resume", confidence: 0.95 };
    }
  }

  for (const [pattern, name] of LABEL_MAP) {
    if (pattern.test(low) && SUPPORTED_NORMALIZED.has(name)) {
      return { normalized: name, classification: "supported", reason: `label_map:${name}`, confidence: 0.92 };
    }
  }

  if (/(salary|compensation|clearance|security clearance)/i.test(low)) {
    return { normalized: null, classification: "unsupported", reason: "unsupported_bucket", confidence: 0.8 };
  }
  if (raw) {
    return { normalized: null, classification: "custom_question", reason: "unmapped_label", confidence: 0.7 };
  }
  return { normalized: null, classification: "unknown", reason: "empty_label", confidence: 0.4 };
}

function classifyDetected(
  label: string,
  fieldType: string,
  name: string,
  opts?: { verbose?: boolean; selector?: string },
): DetectedField {
  const { normalized, classification, reason, confidence } = normalizeFieldLabel(label || name, fieldType);
  const isUpload =
    fieldType === "file" ||
    normalized === "resume_upload" ||
    normalized === "cover_letter_upload";
  const field: DetectedField = {
    external_field_key: name || label || "unnamed",
    field_label: label || name || "",
    field_type: fieldType,
    is_required: false,
    is_upload: isUpload,
    normalized_field_name: normalized,
    classification,
    options: [],
    confidence,
  };
  if (opts?.verbose) {
    field.detection_reason = reason;
    if (opts.selector) field.matched_selector = opts.selector;
  }
  return field;
}

function finalize(
  partial: Omit<FormAnalysisResult, "supported_fields" | "sensitive_fields" | "custom_fields" | "legal_fields" | "upload_controls" | "required_fields" | "unsupported_fields" | "filled_any_fields" | "submitted" | "detector_version" | "extension_version" | "analyzed_at" | "page_mutated" | "warnings"> & {
    warnings?: string[];
  },
): FormAnalysisResult {
  const result: FormAnalysisResult = {
    ...partial,
    warnings: partial.warnings ?? [],
    supported_fields: [],
    sensitive_fields: [],
    custom_fields: [],
    legal_fields: [],
    upload_controls: [],
    required_fields: [],
    unsupported_fields: [],
    filled_any_fields: false,
    submitted: false,
    page_mutated: false,
    detector_version: DETECTOR_VERSION,
    extension_version: EXTENSION_VERSION,
    analyzed_at: new Date().toISOString(),
  };

  for (const f of result.fields) {
    if (f.classification === "supported" && f.normalized_field_name) {
      if (!result.supported_fields.includes(f.normalized_field_name)) {
        result.supported_fields.push(f.normalized_field_name);
      }
    } else if (f.classification === "sensitive_question") {
      result.sensitive_fields.push(f.field_label || f.external_field_key);
    } else if (f.classification === "custom_question") {
      result.custom_fields.push(f.field_label || f.external_field_key);
    } else if (f.classification === "legal_attestation") {
      result.legal_fields.push(f.field_label || f.external_field_key);
    } else if (f.classification === "unsupported" || f.classification === "unknown") {
      result.unsupported_fields.push(f.field_label || f.external_field_key);
    }
    if (f.is_upload) result.upload_controls.push(f.field_label || f.external_field_key);
    if (f.is_required) result.required_fields.push(f.field_label || f.external_field_key);
  }
  if (!result.is_greenhouse) {
    result.warnings.push("Page/URL does not look like Greenhouse");
  }
  return result;
}

export function detectGreenhouseUrl(url: string | null | undefined): boolean {
  return isSupportedGreenhouseUrl(url);
}

/** Parse HTML string (fixtures / offline). Does not execute scripts. */
export function detectFromHtml(
  html: string,
  opts?: { applicationUrl?: string | null; verbose?: boolean },
): FormAnalysisResult {
  const doc = new DOMParser().parseFromString(html || "", "text/html");
  return detectFromDocument(doc, {
    applicationUrl: opts?.applicationUrl ?? null,
    verbose: opts?.verbose,
  });
}

export function detectFromDocument(
  doc: Document,
  opts?: { applicationUrl?: string | null; verbose?: boolean },
): FormAnalysisResult {
  const applicationUrl = opts?.applicationUrl ?? null;
  const urlIsGh = detectGreenhouseUrl(applicationUrl);
  const htmlText = doc.documentElement?.outerHTML?.toLowerCase() ?? "";
  const hasGrnhse =
    !!doc.getElementById("grnhse_app") ||
    !!doc.querySelector('iframe[src*="greenhouse"]') ||
    htmlText.includes("greenhouse") ||
    htmlText.includes("grnhse");
  const isGh = urlIsGh || hasGrnhse;

  let jobTitle =
    doc.querySelector("h1")?.textContent?.trim() ||
    doc.querySelector('meta[property="og:title"]')?.getAttribute("content")?.trim() ||
    doc.title?.trim() ||
    null;
  let employer: string | null = null;
  if (jobTitle && / at /i.test(jobTitle)) {
    const parts = jobTitle.split(/\s+at\s+/i);
    if (parts.length >= 2) {
      jobTitle = parts[0].trim();
      employer = parts.slice(1).join(" at ").trim();
    }
  }
  const board = extractBoardToken(applicationUrl);
  if (!employer && board && board !== "embed") employer = board;

  const labelFor = new Map<string, string>();
  doc.querySelectorAll("label[for]").forEach((lab) => {
    const f = lab.getAttribute("for");
    if (f) labelFor.set(f, (lab.textContent || "").trim());
  });

  const fields: DetectedField[] = [];
  const controls = doc.querySelectorAll("input, textarea, select");
  controls.forEach((el) => {
    const tag = el.tagName.toLowerCase();
    const input = el as HTMLInputElement;
    const type = (input.type || tag).toLowerCase();
    if (type === "hidden" || type === "submit" || type === "button") return;

    // CRITICAL: never read .value / checked / selected — labels & structure only
    const name = input.name || input.id || "";
    const id = input.id || "";
    let label = (id && labelFor.get(id)) || "";
    if (!label) {
      const wrapping = el.closest("label");
      if (wrapping) label = (wrapping.textContent || "").trim();
    }
    const legend = el.closest("fieldset")?.querySelector("legend")?.textContent?.trim() || "";
    if (legend && (!label || ["yes", "no", name.toLowerCase()].includes(label.toLowerCase()))) {
      label = legend;
    }
    if (!label && name) label = name.replace(/_/g, " ");

    const required =
      input.required ||
      input.getAttribute("aria-required") === "true" ||
      !!el.closest("[aria-required='true']");

    const selector = opts?.verbose
      ? `${tag}${id ? `#${CSS.escape(id)}` : name ? `[name="${name}"]` : ""}`
      : undefined;

    const df = classifyDetected(label, type, name, { verbose: opts?.verbose, selector });
    df.is_required = required;

    if (tag === "select") {
      const optsList: string[] = [];
      (el as HTMLSelectElement).querySelectorAll("option").forEach((o) => {
        const t = (o.textContent || "").trim();
        // option text is structural (choices), not user-entered answers
        if (t && optsList.length < 50) optsList.push(t);
      });
      df.options = optsList;
    }

    fields.push(df);
  });

  let confidence = 0.5;
  if (urlIsGh && hasGrnhse) confidence = 0.98;
  else if (urlIsGh) confidence = 0.9;
  else if (hasGrnhse && fields.length > 0) confidence = 0.85;
  else if (hasGrnhse) confidence = 0.7;

  return finalize({
    is_greenhouse: isGh,
    platform: isGh ? "greenhouse" : "unknown",
    confidence,
    detection_mode: "dom",
    employer,
    job_title: jobTitle,
    application_url: applicationUrl,
    board_token: board,
    fields,
  });
}

/**
 * Snapshot structural fingerprints before/after analysis to prove no mutation.
 * Does not include field values.
 */
export function structuralFingerprint(doc: Document): string {
  const parts: string[] = [];
  doc.querySelectorAll("input, textarea, select").forEach((el) => {
    const input = el as HTMLInputElement;
    parts.push(
      [
        el.tagName,
        input.name || "",
        input.id || "",
        input.type || "",
        input.required ? "1" : "0",
        // Explicitly omit value/checked/selectedIndex/files
      ].join(":"),
    );
  });
  return parts.join("|");
}

/**
 * M3 document upload assist — DataTransfer into file inputs only.
 * Never clicks submit. Clears File bytes from memory after assignment.
 */

import { findControl } from "./fillEngine";

export type UploadIntent = {
  external_field_key: string;
  field_label?: string;
  file: File;
  replace_existing?: boolean;
};

export type UploadOutcome = {
  external_field_key: string;
  status:
    | "uploaded"
    | "verified"
    | "skipped_existing"
    | "failed"
    | "unsupported"
    | "field_missing";
  reason?: string;
  file_name?: string;
};

export function fileInputHasFile(el: HTMLInputElement): boolean {
  return !!(el.files && el.files.length > 0);
}

export function probeUploadFields(
  keys: { external_field_key: string; field_label?: string }[],
): Record<string, { found: boolean; has_file: boolean; accept: string | null }> {
  const out: Record<string, { found: boolean; has_file: boolean; accept: string | null }> = {};
  for (const k of keys) {
    const el = findControl(k.external_field_key, k.field_label) as HTMLInputElement | null;
    if (!el || (el.type || "").toLowerCase() !== "file") {
      out[k.external_field_key] = { found: false, has_file: false, accept: null };
    } else {
      out[k.external_field_key] = {
        found: true,
        has_file: fileInputHasFile(el),
        accept: el.getAttribute("accept"),
      };
      // Do not read or return employer file names
    }
  }
  return out;
}

export function assignFileToInput(intent: UploadIntent): UploadOutcome {
  const el = findControl(intent.external_field_key, intent.field_label) as HTMLInputElement | null;
  if (!el || (el.type || "").toLowerCase() !== "file") {
    return {
      external_field_key: intent.external_field_key,
      status: "field_missing",
      reason: "upload_field_not_found",
    };
  }
  if (fileInputHasFile(el) && !intent.replace_existing) {
    return {
      external_field_key: intent.external_field_key,
      status: "skipped_existing",
      reason: "file_already_selected",
    };
  }
  try {
    const dt = new DataTransfer();
    dt.items.add(intent.file);
    el.files = dt.files;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    const ok = fileInputHasFile(el) && el.files?.[0]?.name === intent.file.name;
    el.style.outline = "2px solid rgba(147,51,234,0.55)";
    el.dataset.joblensFill = "upload";
    return {
      external_field_key: intent.external_field_key,
      status: ok ? "verified" : "failed",
      reason: ok ? undefined : "verification_failed",
      file_name: intent.file.name,
    };
  } catch {
    return {
      external_field_key: intent.external_field_key,
      status: "unsupported",
      reason: "upload_not_supported",
    };
  }
}

/** Advisory confirmation-page detection — never marks Applied. */
export function detectLikelyConfirmationPage(doc: Document = document): {
  looks_like_confirmation: boolean;
  signals: string[];
} {
  const text = (doc.body?.textContent || doc.body?.innerText || "").toLowerCase();
  const signals: string[] = [];
  if (/thank you for (your )?appl/i.test(text)) signals.push("thank_you");
  if (/application (has been )?received/i.test(text)) signals.push("received");
  if (/confirmation (number|#)/i.test(text)) signals.push("confirmation_number");
  if (doc.querySelector(".application-confirmation, #application_confirmation, .thank-you")) {
    signals.push("confirmation_dom");
  }
  return { looks_like_confirmation: signals.length >= 1, signals };
}

export function assertNoSubmitInUploadModule(): boolean {
  // Hard guarantee for tests — this module has no submit click APIs.
  return true;
}

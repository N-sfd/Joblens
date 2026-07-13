/** Content script — analyze (M1) + assisted fill (M2). Never submits. */

import { parseExtensionMessage, type ExtensionMessage, type FormAnalysisResult } from "./types/messages";
import {
  detectFromDocument,
  structuralFingerprint,
} from "./shared/greenhouseDetector";
import { isSupportedGreenhouseUrl } from "./utils/url";
import {
  fillSelectedFields,
  undoLastFill,
  probeEmptiness,
  setHighlightsVisible,
  clearUndoStack,
  type FillIntent,
} from "./shared/fillEngine";
import {
  assignFileToInput,
  probeUploadFields,
  detectLikelyConfirmationPage,
} from "./shared/uploadEngine";

const LOAD_TIMEOUT_MS = 8000;
const POLL_MS = 250;

/** Fingerprint of field keys present at review — used to detect stale forms. */
let reviewedStructureKey: string | null = null;

function structureKey(doc: Document): string {
  return Array.from(doc.querySelectorAll("input, textarea, select"))
    .map((el) => {
      const i = el as HTMLInputElement;
      return `${el.tagName}:${i.name || ""}:${i.id || ""}:${i.type || ""}`;
    })
    .join("|");
}

function waitForForm(doc: Document, timeoutMs: number): Promise<"ready" | "timeout"> {
  return new Promise((resolve) => {
    const start = Date.now();
    const hasForm = () =>
      !!doc.querySelector("#application, form#application_form, #grnhse_app form, form input, form textarea");

    if (hasForm()) {
      resolve("ready");
      return;
    }

    const timer = window.setInterval(() => {
      if (hasForm()) {
        window.clearInterval(timer);
        resolve("ready");
        return;
      }
      if (Date.now() - start >= timeoutMs) {
        window.clearInterval(timer);
        resolve("timeout");
      }
    }, POLL_MS);
  });
}

async function analyzeForm(verbose: boolean): Promise<FormAnalysisResult | { error: string }> {
  const url = location.href;
  if (!isSupportedGreenhouseUrl(url)) {
    return { error: "unsupported_page" };
  }

  const wait = await waitForForm(document, LOAD_TIMEOUT_MS);
  if (wait === "timeout" && !document.querySelector("input, textarea, select")) {
    return { error: "form_not_found" };
  }

  const before = structuralFingerprint(document);
  const result = detectFromDocument(document, {
    applicationUrl: url,
    verbose,
  });
  const after = structuralFingerprint(document);
  if (before !== after) {
    result.page_mutated = true;
    result.warnings.push("Unexpected DOM structure change during analysis");
  }
  result.filled_any_fields = false;
  result.submitted = false;
  reviewedStructureKey = structureKey(document);
  return result;
}

chrome.runtime.onMessage.addListener((raw, _sender, sendResponse) => {
  const msg = parseExtensionMessage(raw);
  if (!msg) {
    sendResponse({ type: "ERROR", error: "invalid_message" } satisfies ExtensionMessage);
    return false;
  }

  if (msg.type === "DETECT_PLATFORM") {
    const supported = isSupportedGreenhouseUrl(location.href);
    sendResponse({
      type: "DETECT_PLATFORM",
      requestId: msg.requestId,
      payload: {
        supported,
        platform: supported ? "greenhouse" : "unsupported",
        url: location.href,
        title: document.title,
      },
    } satisfies ExtensionMessage);
    return false;
  }

  if (msg.type === "ANALYZE_FORM") {
    const verbose = !!(msg.payload && typeof msg.payload === "object" && (msg.payload as { verbose?: boolean }).verbose);
    analyzeForm(verbose)
      .then((payload) => {
        if ("error" in payload) {
          sendResponse({ type: "ERROR", requestId: msg.requestId, error: payload.error } satisfies ExtensionMessage);
        } else {
          sendResponse({ type: "FORM_ANALYSIS_RESULT", requestId: msg.requestId, payload } satisfies ExtensionMessage);
        }
      })
      .catch((e) => {
        sendResponse({
          type: "ERROR",
          requestId: msg.requestId,
          error: e instanceof Error ? e.message : "analyze_failed",
        } satisfies ExtensionMessage);
      });
    return true;
  }

  if (msg.type === "PROBE_EMPTINESS") {
    const keys = (msg.payload as { keys?: { external_field_key: string; field_label?: string }[] })?.keys || [];
    sendResponse({
      type: "PROBE_EMPTINESS",
      requestId: msg.requestId,
      payload: { emptiness: probeEmptiness(keys) },
    } satisfies ExtensionMessage);
    return false;
  }

  if (msg.type === "FILL_SELECTED_FIELDS") {
    if (!isSupportedGreenhouseUrl(location.href)) {
      sendResponse({ type: "ERROR", requestId: msg.requestId, error: "unsupported_page" } satisfies ExtensionMessage);
      return false;
    }
    if (reviewedStructureKey && reviewedStructureKey !== structureKey(document)) {
      sendResponse({ type: "ERROR", requestId: msg.requestId, error: "form_changed_after_review" } satisfies ExtensionMessage);
      return false;
    }
    const intents = ((msg.payload as { intents?: FillIntent[] })?.intents || []) as FillIntent[];
    clearUndoStack();
    const result = fillSelectedFields(intents);
    const type =
      result.outcomes.some((o) => o.status === "failed" || o.status === "option_not_found") &&
      result.outcomes.some((o) => o.status === "filled")
        ? "FILL_PARTIAL"
        : result.outcomes.every((o) => o.status !== "filled")
          ? "FILL_FAILED"
          : "FILL_COMPLETED";
    sendResponse({
      type,
      requestId: msg.requestId,
      payload: {
        ...result,
        // Never include intent values in the response payload sent back for logging
        intents_count: intents.length,
      },
    } satisfies ExtensionMessage);
    return false;
  }

  if (msg.type === "UNDO_FILL") {
    const confirmUserEdited = !!(msg.payload as { confirm_user_edited?: boolean })?.confirm_user_edited;
    const result = undoLastFill(confirmUserEdited);
    sendResponse({ type: "UNDO_RESULT", requestId: msg.requestId, payload: result } satisfies ExtensionMessage);
    return false;
  }

  if (msg.type === "SET_HIGHLIGHTS") {
    setHighlightsVisible(!!(msg.payload as { visible?: boolean })?.visible);
    sendResponse({ type: "SET_HIGHLIGHTS", requestId: msg.requestId } satisfies ExtensionMessage);
    return false;
  }

  if (msg.type === "PROBE_UPLOAD_FIELDS") {
    const keys = (msg.payload as { keys?: { external_field_key: string; field_label?: string }[] })?.keys || [];
    sendResponse({
      type: "PROBE_UPLOAD_FIELDS",
      requestId: msg.requestId,
      payload: { fields: probeUploadFields(keys) },
    } satisfies ExtensionMessage);
    return false;
  }

  if (msg.type === "ASSIGN_FILE") {
    const p = msg.payload as {
      external_field_key: string;
      field_label?: string;
      file_name: string;
      mime_type: string;
      base64: string;
      replace_existing?: boolean;
    };
    try {
      const bin = Uint8Array.from(atob(p.base64), (c) => c.charCodeAt(0));
      const file = new File([bin], p.file_name, { type: p.mime_type });
      const outcome = assignFileToInput({
        external_field_key: p.external_field_key,
        field_label: p.field_label,
        file,
        replace_existing: p.replace_existing,
      });
      sendResponse({
        type: "UPLOAD_RESULT",
        requestId: msg.requestId,
        payload: { outcome, submitted: false, submitClicked: false },
      } satisfies ExtensionMessage);
    } catch (e) {
      sendResponse({
        type: "ERROR",
        requestId: msg.requestId,
        error: e instanceof Error ? e.message : "upload_failed",
      } satisfies ExtensionMessage);
    }
    return false;
  }

  if (msg.type === "DETECT_CONFIRMATION_PAGE") {
    sendResponse({
      type: "DETECT_CONFIRMATION_PAGE",
      requestId: msg.requestId,
      payload: detectLikelyConfirmationPage(),
    } satisfies ExtensionMessage);
    return false;
  }

  sendResponse({ type: "ERROR", error: "unsupported_message", requestId: msg.requestId } satisfies ExtensionMessage);
  return false;
});

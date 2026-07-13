/** Shared message contract — M1 + M2. Validate at runtime. */

export const DETECTOR_VERSION = "1.0.0-m3";
export const EXTENSION_VERSION = "0.4.0";
export const FILL_ENGINE_VERSION = "1.0.0-m2";
export const DOCUMENT_UPLOAD_VERSION = "1.0.0-m3";
export const API_CONTRACT_VERSION = "4.0.0-m4";
export const MESSAGE_VERSION = 4;

export const MESSAGE_TYPES = [
  "DETECT_PLATFORM",
  "ANALYZE_FORM",
  "FORM_ANALYSIS_RESULT",
  "OPEN_JOBLENS",
  "AUTH_START",
  "AUTH_SUCCESS",
  "AUTH_EXPIRED",
  "SAVE_DIAGNOSTIC",
  "GET_STATUS",
  "ERROR",
  "PROBE_EMPTINESS",
  "REQUEST_PROFILE_MAPPING",
  "PROFILE_MAPPING_RESULT",
  "REVIEW_FILL_FIELDS",
  "FILL_SELECTED_FIELDS",
  "FIELD_FILL_RESULT",
  "FILL_COMPLETED",
  "FILL_PARTIAL",
  "FILL_FAILED",
  "UNDO_FILL",
  "UNDO_RESULT",
  "OPEN_PROFILE",
  "SESSION_EXPIRED",
  "SET_HIGHLIGHTS",
  // M3
  "PROBE_UPLOAD_FIELDS",
  "ASSIGN_FILE",
  "UPLOAD_RESULT",
  "DETECT_CONFIRMATION_PAGE",
] as const;

export type MessageType = (typeof MESSAGE_TYPES)[number];

export type FieldCategory =
  | "supported"
  | "custom_question"
  | "sensitive_question"
  | "legal_attestation"
  | "unsupported"
  | "unknown";

export interface DetectedField {
  external_field_key: string;
  field_label: string;
  field_type: string;
  is_required: boolean;
  is_upload: boolean;
  normalized_field_name: string | null;
  classification: FieldCategory;
  options: string[];
  confidence: number;
  detection_reason?: string;
  matched_selector?: string;
}

export interface FormAnalysisResult {
  is_greenhouse: boolean;
  platform: string;
  confidence: number;
  detection_mode: string;
  employer: string | null;
  job_title: string | null;
  application_url: string | null;
  board_token: string | null;
  fields: DetectedField[];
  supported_fields: string[];
  sensitive_fields: string[];
  custom_fields: string[];
  legal_fields: string[];
  upload_controls: string[];
  required_fields: string[];
  unsupported_fields: string[];
  warnings: string[];
  filled_any_fields: boolean;
  submitted: boolean;
  detector_version: string;
  extension_version: string;
  analyzed_at: string;
  page_mutated: boolean;
}

export interface ExtensionMessage {
  type: MessageType;
  version?: number;
  requestId?: string;
  payload?: unknown;
  error?: string;
  tabContext?: { url?: string; tabId?: number };
}

export function isMessageType(v: unknown): v is MessageType {
  return typeof v === "string" && (MESSAGE_TYPES as readonly string[]).includes(v);
}

export function parseExtensionMessage(raw: unknown): ExtensionMessage | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (!isMessageType(o.type)) return null;
  const msg: ExtensionMessage = { type: o.type, version: MESSAGE_VERSION };
  if (typeof o.requestId === "string") msg.requestId = o.requestId;
  if (typeof o.error === "string") msg.error = o.error;
  if (typeof o.version === "number") msg.version = o.version;
  if ("payload" in o) msg.payload = o.payload;
  if (o.tabContext && typeof o.tabContext === "object") {
    msg.tabContext = o.tabContext as ExtensionMessage["tabContext"];
  }
  return msg;
}

export function assertNoValuesInAnalysis(result: FormAnalysisResult): void {
  if (result.filled_any_fields || result.submitted || result.page_mutated) {
    throw new Error("Invariant violated: analysis must be read-only");
  }
  for (const f of result.fields) {
    const anyVal = f as DetectedField & { value?: unknown };
    if (anyVal.value !== undefined) {
      throw new Error("Invariant violated: field values must not be collected");
    }
  }
}

import type { FormAnalysisResult } from "../types/messages";
import { EXTENSION_VERSION } from "../types/messages";
import { normalizeJobLensOrigin } from "../utils/url";

declare const __JOBLENS_API_ORIGIN__: string | undefined;
declare const __JOBLENS_WEB_ORIGIN__: string | undefined;

const DEFAULT_JOBLENS =
  typeof __JOBLENS_WEB_ORIGIN__ !== "undefined" ? __JOBLENS_WEB_ORIGIN__ : "http://localhost:3000";
const DEFAULT_API =
  typeof __JOBLENS_API_ORIGIN__ !== "undefined" ? __JOBLENS_API_ORIGIN__ : "http://localhost:8000";

export interface ExtensionAuthState {
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: number | null;
  connected: boolean;
  joblensOrigin: string;
  apiOrigin: string;
  challenge: string | null;
}

const DEFAULT_AUTH: ExtensionAuthState = {
  accessToken: null,
  refreshToken: null,
  expiresAt: null,
  connected: false,
  joblensOrigin: DEFAULT_JOBLENS,
  apiOrigin: DEFAULT_API,
  challenge: null,
};

/** Session-scoped consent: tabId → expiresAt ms */
export type ConsentMap = Record<string, number>;

export async function getAuth(): Promise<ExtensionAuthState> {
  const data = await chrome.storage.local.get(["auth"]);
  return { ...DEFAULT_AUTH, ...(data.auth as Partial<ExtensionAuthState> | undefined) };
}

export async function setAuth(patch: Partial<ExtensionAuthState>): Promise<ExtensionAuthState> {
  const cur = await getAuth();
  const next = { ...cur, ...patch };
  await chrome.storage.local.set({ auth: next });
  return next;
}

export async function clearAuth(): Promise<void> {
  await chrome.storage.local.set({ auth: { ...DEFAULT_AUTH } });
}

export async function getConsentMap(): Promise<ConsentMap> {
  const data = await chrome.storage.session.get(["consent"]);
  return (data.consent as ConsentMap) || {};
}

export async function setTabConsent(tabId: number, ttlMs = 30 * 60 * 1000): Promise<void> {
  const map = await getConsentMap();
  map[String(tabId)] = Date.now() + ttlMs;
  await chrome.storage.session.set({ consent: map });
}

export async function hasTabConsent(tabId: number): Promise<boolean> {
  const map = await getConsentMap();
  const exp = map[String(tabId)];
  return typeof exp === "number" && exp > Date.now();
}

export async function clearTabConsent(tabId: number): Promise<void> {
  const map = await getConsentMap();
  delete map[String(tabId)];
  await chrome.storage.session.set({ consent: map });
}

async function apiFetch(path: string, init?: RequestInit & { token?: string | null }): Promise<Response> {
  const auth = await getAuth();
  const base = normalizeJobLensOrigin(auth.apiOrigin);
  const headers = new Headers(init?.headers);
  headers.set("Content-Type", "application/json");
  const token = init?.token !== undefined ? init.token : auth.accessToken;
  if (token) headers.set("Authorization", `Bearer ${token}`);
  headers.set("X-JobLens-Extension-Version", EXTENSION_VERSION);
  return fetch(`${base}${path}`, { ...init, headers });
}

export async function startAuthChallenge(): Promise<{ challenge: string; connect_url: string; expires_at: string }> {
  const auth = await getAuth();
  const challenge = crypto.randomUUID();
  const res = await apiFetch("/api/extension/auth/start", {
    method: "POST",
    body: JSON.stringify({ challenge, extension_version: EXTENSION_VERSION }),
    token: null,
  });
  if (!res.ok) throw new Error(await res.text() || "auth_start_failed");
  const body = await res.json();
  const connectUrl = `${normalizeJobLensOrigin(auth.joblensOrigin)}/extension/connect?challenge=${encodeURIComponent(challenge)}`;
  await setAuth({ challenge });
  return { challenge, connect_url: connectUrl, expires_at: body.expires_at };
}

export async function pollAuthExchange(challenge: string): Promise<{
  access_token: string;
  refresh_token: string;
  expires_in: number;
} | null> {
  const res = await apiFetch("/api/extension/auth/exchange", {
    method: "POST",
    body: JSON.stringify({ challenge }),
    token: null,
  });
  if (res.status === 204 || res.status === 202) return null;
  if (!res.ok) {
    if (res.status === 404) return null;
    throw new Error(await res.text() || "auth_exchange_failed");
  }
  return res.json();
}

export async function refreshAccessToken(): Promise<boolean> {
  const auth = await getAuth();
  if (!auth.refreshToken) return false;
  const res = await apiFetch("/api/extension/auth/refresh", {
    method: "POST",
    body: JSON.stringify({ refresh_token: auth.refreshToken }),
    token: null,
  });
  if (!res.ok) {
    await setAuth({ accessToken: null, connected: false, expiresAt: null });
    return false;
  }
  const body = await res.json();
  await setAuth({
    accessToken: body.access_token,
    refreshToken: body.refresh_token ?? auth.refreshToken,
    expiresAt: Date.now() + (body.expires_in ?? 900) * 1000,
    connected: true,
  });
  return true;
}

export async function revokeAuth(): Promise<void> {
  const auth = await getAuth();
  try {
    if (auth.accessToken || auth.refreshToken) {
      await apiFetch("/api/extension/auth/revoke", {
        method: "POST",
        body: JSON.stringify({ refresh_token: auth.refreshToken }),
      });
    }
  } catch {
    /* still clear locally */
  }
  await clearAuth();
}

export async function fetchStatus(): Promise<{
  connected: boolean;
  extension_version_supported: boolean;
  min_extension_version: string;
  capabilities?: {
    analyze_form?: boolean;
    save_diagnostic?: boolean;
    fill_form?: boolean;
    fill_uploads?: boolean;
    upload_resume?: boolean;
    submit_application?: boolean;
    record_submission_confirmation?: boolean;
  };
  flags?: {
    extension_enabled?: boolean;
    greenhouse_enabled?: boolean;
    pilot_user?: boolean;
    automatic_submission_enabled?: boolean;
  };
}> {
  const auth = await getAuth();
  if (!auth.accessToken) {
    return { connected: false, extension_version_supported: true, min_extension_version: "0.1.0" };
  }
  let res = await apiFetch("/api/extension/status");
  if (res.status === 401) {
    const ok = await refreshAccessToken();
    if (!ok) return { connected: false, extension_version_supported: true, min_extension_version: "0.1.0" };
    res = await apiFetch("/api/extension/status");
  }
  if (res.status === 426) {
    const detail = await res.text();
    throw new Error(detail || "update_required");
  }
  if (!res.ok) throw new Error("status_failed");
  return res.json();
}

export async function fetchPilotMe(): Promise<{
  pilot_user: boolean;
  message: string;
  capabilities: Record<string, boolean>;
}> {
  const res = await apiFetch("/api/extension/pilot/me");
  if (!res.ok) throw new Error(await res.text() || "pilot_me_failed");
  return res.json();
}

export async function saveDiagnostic(analysis: FormAnalysisResult, jobId?: number | null): Promise<{ id: number }> {
  const auth = await getAuth();
  if (!auth.accessToken) throw new Error("not_connected");
  if (auth.expiresAt && auth.expiresAt < Date.now()) {
    const ok = await refreshAccessToken();
    if (!ok) throw new Error("session_expired");
  }

  // Strip optional verbose fields and ensure no values
  const fields = analysis.fields.map(({ detection_reason: _d, matched_selector: _m, ...rest }) => rest);

  const body = {
    job_id: jobId ?? null,
    application_url: analysis.application_url,
    platform: analysis.platform,
    employer: analysis.employer,
    job_title: analysis.job_title,
    detected_fields: fields,
    supported_count: analysis.supported_fields.length,
    sensitive_count: analysis.sensitive_fields.length,
    unsupported_count: analysis.unsupported_fields.length,
    detector_version: analysis.detector_version,
    extension_version: analysis.extension_version,
    analyzed_at: analysis.analyzed_at,
  };

  let res = await apiFetch("/api/extension/diagnostics", {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (res.status === 401) {
    const ok = await refreshAccessToken();
    if (!ok) throw new Error("session_expired");
    res = await apiFetch("/api/extension/diagnostics", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }
  if (!res.ok) throw new Error(await res.text() || "save_failed");
  return res.json();
}

export interface FieldMapping {
  external_field_key: string;
  field_label: string;
  field_type: string;
  normalized_field_name: string | null;
  is_required: boolean;
  is_upload: boolean;
  classification: string;
  options: string[];
  detection_confidence: number;
  approved_value: string | null;
  sensitivity_category: string;
  requires_individual_confirmation: boolean;
  mapping_confidence: number;
  mapping_status: string;
  profile_source_timestamp: string | null;
  selectable: boolean;
  // local UI state
  selected?: boolean;
  replace_existing?: boolean;
  confirmed_sensitive?: boolean;
  already_filled?: boolean;
}

async function authedPost(path: string, body: unknown): Promise<Response> {
  const auth = await getAuth();
  if (!auth.accessToken) throw new Error("not_connected");
  if (auth.expiresAt && auth.expiresAt < Date.now()) {
    const ok = await refreshAccessToken();
    if (!ok) throw new Error("session_expired");
  }
  let res = await apiFetch(path, { method: "POST", body: JSON.stringify(body) });
  if (res.status === 401) {
    const ok = await refreshAccessToken();
    if (!ok) throw new Error("session_expired");
    res = await apiFetch(path, { method: "POST", body: JSON.stringify(body) });
  }
  return res;
}

export async function startFillSession(analysis: FormAnalysisResult, jobId?: number | null) {
  const fields = analysis.fields.map(({ detection_reason: _d, matched_selector: _m, ...rest }) => rest);
  const res = await authedPost("/api/extension/fill-session/start", {
    job_id: jobId ?? null,
    application_url: analysis.application_url,
    platform: analysis.platform || "greenhouse",
    detected_fields: fields,
    detector_version: analysis.detector_version,
    extension_version: analysis.extension_version,
  });
  if (!res.ok) throw new Error(await res.text() || "fill_session_start_failed");
  return res.json() as Promise<{
    fill_session_id: number;
    profile_readiness: { status: string; checks: Record<string, boolean> };
    permitted_normalized_fields: string[];
    expires_at: string;
  }>;
}

export async function mapFillSession(fillSessionId: number, analysis: FormAnalysisResult) {
  const fields = analysis.fields.map(({ detection_reason: _d, matched_selector: _m, ...rest }) => rest);
  const res = await authedPost("/api/extension/fill-session/map", {
    fill_session_id: fillSessionId,
    detected_fields: fields,
  });
  if (res.status === 410) throw new Error("fill_session_expired");
  if (!res.ok) throw new Error(await res.text() || "fill_session_map_failed");
  return res.json() as Promise<{
    fill_session_id: number;
    profile_readiness: { status: string; checks: Record<string, boolean> };
    mappings: FieldMapping[];
  }>;
}

export async function reportFillResult(
  fillSessionId: number,
  result: {
    successful_fields: string[];
    skipped_fields: string[];
    failed_fields: string[];
    unsupported_fields: string[];
    missing_fields: string[];
    user_reviewed_sensitive_fields: string[];
  },
) {
  const res = await authedPost("/api/extension/fill-session/result", {
    fill_session_id: fillSessionId,
    ...result,
    completed_at: new Date().toISOString(),
  });
  if (res.status === 410) throw new Error("fill_session_expired");
  if (!res.ok) throw new Error(await res.text() || "fill_session_result_failed");
  return res.json();
}

export async function listExtensionDocuments() {
  const auth = await getAuth();
  if (!auth.accessToken) throw new Error("not_connected");
  let res = await apiFetch("/api/extension/documents");
  if (res.status === 401) {
    const ok = await refreshAccessToken();
    if (!ok) throw new Error("session_expired");
    res = await apiFetch("/api/extension/documents");
  }
  if (!res.ok) throw new Error("documents_list_failed");
  return res.json() as Promise<{
    documents: Array<{
      id: number;
      document_type: string;
      file_name: string;
      mime_type: string;
      file_size: number;
      version_number: number;
      updated_at: string | null;
      suggested: boolean;
      upload_eligible: boolean;
    }>;
    cover_letters: Array<{ cover_letter_id: number; company_name: string | null; suggested: boolean }>;
    suggested_resume_id: number | null;
  }>;
}

export async function snapshotCoverLetter(coverLetterId: number) {
  const res = await authedPost("/api/extension/documents/snapshot-cover-letter", {
    cover_letter_id: coverLetterId,
  });
  if (!res.ok) throw new Error(await res.text() || "snapshot_failed");
  return res.json() as Promise<{ id: number; file_name: string; version_number: number }>;
}

export async function startUploadSession(body: {
  fill_session_id?: number | null;
  job_application_id?: number | null;
  document_type: "resume" | "cover_letter";
  source_document_id: number;
  employer_field: {
    external_field_key: string;
    field_label?: string;
    accept?: string | null;
  };
}) {
  const res = await authedPost("/api/extension/upload-session/start", body);
  if (!res.ok) throw new Error(await res.text() || "upload_session_start_failed");
  return res.json() as Promise<{
    upload_session_id: number;
    retrieval_token: string;
    expires_at: string;
    document: { id: number; file_name: string; mime_type: string; file_size: number; version_number: number };
  }>;
}

export async function retrieveUploadBytes(uploadSessionId: number, retrievalToken: string): Promise<ArrayBuffer> {
  const auth = await getAuth();
  const base = normalizeJobLensOrigin(auth.apiOrigin);
  const url = `${base}/api/extension/upload-session/${uploadSessionId}/file?retrieval_token=${encodeURIComponent(retrievalToken)}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${auth.accessToken}`,
      "X-JobLens-Extension-Version": EXTENSION_VERSION,
    },
  });
  if (!res.ok) throw new Error(await res.text() || "retrieval_failed");
  return res.arrayBuffer();
}

export async function reportUploadResult(body: {
  upload_session_id: number;
  upload_status: string;
  employer_field_label?: string;
  verification_status?: string;
  error_code?: string;
}) {
  const res = await authedPost("/api/extension/upload-session/result", body);
  if (!res.ok) throw new Error(await res.text() || "upload_result_failed");
  return res.json();
}

export async function confirmSubmission(body: {
  job_application_id: number;
  fill_session_id?: number | null;
  confirmed: boolean;
  confirmation_number?: string;
  confirmation_url?: string;
  submission_notes?: string;
  resume_document_id?: number | null;
  cover_letter_document_id?: number | null;
  save_as_in_progress?: boolean;
}) {
  const res = await authedPost("/api/extension/submission/confirm", body);
  if (!res.ok) throw new Error(await res.text() || "confirm_failed");
  return res.json();
}

export async function submitExtensionFeedback(body: {
  category: string;
  message?: string;
  platform?: string;
  detector_version?: string;
  extension_version?: string;
  error_code?: string;
  feature_stage?: string;
}) {
  const res = await authedPost("/api/extension/feedback", body);
  if (!res.ok) throw new Error((await res.text()) || "feedback_failed");
  return res.json();
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export async function fetchAndAssignDocument(opts: {
  uploadSessionId: number;
  retrievalToken: string;
  tabId: number;
  external_field_key: string;
  field_label?: string;
  file_name: string;
  mime_type: string;
  replace_existing?: boolean;
}): Promise<{ status: string; reason?: string }> {
  const buf = await retrieveUploadBytes(opts.uploadSessionId, opts.retrievalToken);
  const base64 = arrayBufferToBase64(buf);
  const resp = await chrome.tabs.sendMessage(opts.tabId, {
    type: "ASSIGN_FILE",
    payload: {
      external_field_key: opts.external_field_key,
      field_label: opts.field_label,
      file_name: opts.file_name,
      mime_type: opts.mime_type,
      base64,
      replace_existing: opts.replace_existing,
    },
  });
  // base64 dropped after send — GC
  const outcome = resp?.payload?.outcome;
  return { status: outcome?.status || "failed", reason: outcome?.reason };
}

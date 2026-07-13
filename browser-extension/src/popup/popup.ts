import type { FormAnalysisResult } from "../types/messages";
import { EXTENSION_VERSION } from "../types/messages";
import { isSupportedGreenhouseUrl } from "../utils/url";
import {
  clearTabConsent,
  fetchStatus,
  fetchPilotMe,
  getAuth,
  hasTabConsent,
  mapFillSession,
  reportFillResult,
  revokeAuth,
  saveDiagnostic,
  setTabConsent,
  startFillSession,
  listExtensionDocuments,
  snapshotCoverLetter,
  startUploadSession,
  reportUploadResult,
  fetchAndAssignDocument,
  confirmSubmission,
  type FieldMapping,
  submitExtensionFeedback,
} from "../shared/api";
import type { FieldFillOutcome, FillIntent } from "../shared/fillEngine";
import { DETECTOR_VERSION } from "../types/messages";

type View =
  | "onboarding"
  | "home"
  | "consent"
  | "fill_consent"
  | "loading"
  | "result"
  | "fields"
  | "readiness"
  | "mapping"
  | "fill_progress"
  | "fill_result"
  | "documents"
  | "upload_consent"
  | "upload_progress"
  | "upload_result"
  | "employer_review"
  | "submission_confirm"
  | "application_recorded"
  | "manual_next"
  | "privacy"
  | "feedback"
  | "supported"
  | "unsupported"
  | "error";

let view: View = "home";
let onboardingStep = 0;
let onboardingAck = false;
let analysis: FormAnalysisResult | null = null;
let mappings: FieldMapping[] = [];
let fillSessionId: number | null = null;
let readiness: { status: string; checks: Record<string, boolean> } | null = null;
let fillOutcomes: FieldFillOutcome[] = [];
let errorMessage = "";
let activeTabId: number | null = null;
let activeUrl: string | null = null;
let connected = false;
let pageSupported = false;
let notice = "JobLens will not submit this application.";
let pilotUser: boolean | null = null;
let fillEnabled = true;
let uploadEnabled = true;
let docList: Awaited<ReturnType<typeof listExtensionDocuments>> | null = null;
let selectedResumeId: number | null = null;
let selectedCoverId: number | null = null;
let pendingUpload: {
  document_type: "resume" | "cover_letter";
  source_document_id: number;
  field_key: string;
  field_label: string;
  accept?: string | null;
  replace_existing?: boolean;
  meta?: { file_name: string; file_size: number; version_number: number };
} | null = null;
let uploadOutcomeMsg = "";
let jobApplicationId: number | null = null;
let confirmChecked = false;
let confirmNumber = "";
let confirmUrl = "";
let advisoryConfirmation = false;

const main = () => document.getElementById("main")!;
const pill = () => document.getElementById("conn-pill")!;

function setPill() {
  const el = pill();
  el.textContent = connected ? "Connected" : "Not connected";
  el.className = connected ? "pill pill-on" : "pill pill-off";
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function maskValue(m: FieldMapping): string {
  const v = m.approved_value;
  if (!v) return "—";
  if (m.normalized_field_name === "email") return v;
  if (m.normalized_field_name === "phone") {
    return v.length > 4 ? "•••" + v.slice(-4) : "••••";
  }
  if (m.requires_individual_confirmation) return `[Review] ${v}`;
  if (v.length > 28) return v.slice(0, 26) + "…";
  return v;
}

async function ensureContentScript(tabId: number): Promise<void> {
  try {
    await chrome.tabs.sendMessage(tabId, { type: "DETECT_PLATFORM" });
  } catch {
    await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
  }
}

async function sendToTab<T>(tabId: number, message: object): Promise<T> {
  await ensureContentScript(tabId);
  return chrome.tabs.sendMessage(tabId, message) as Promise<T>;
}

function bindNav() {
  main().querySelectorAll("[data-nav]").forEach((btn) => {
    btn.addEventListener("click", () => {
      view = (btn.getAttribute("data-nav") as View) || "home";
      render();
    });
  });
}

function openJobLens(path: string) {
  chrome.runtime.sendMessage({ type: "OPEN_JOBLENS", payload: { path } });
}

function mapError(code: string): string {
  const map: Record<string, string> = {
    unsupported_page: "This page is not currently supported by JobLens.",
    form_not_found: "Greenhouse form not found.",
    form_changed_after_review: "The form changed after review. Please re-analyze.",
    not_connected: "JobLens is not connected.",
    session_expired: "Session expired — reconnect to JobLens.",
    fill_session_expired: "Fill session expired. Start again.",
    profile_unavailable: "Profile unavailable. Sign in to JobLens and complete your profile.",
  };
  return map[code] || code;
}

function render(): void {
  setPill();
  const el = main();

  const banner = `<p class="muted" style="margin-bottom:8px">${escapeHtml(notice)}</p>`;

  if (view === "loading" || view === "fill_progress" || view === "upload_progress") {
    el.innerHTML = `${banner}<div class="card"><h2>${view === "upload_progress" ? "Uploading document…" : view === "fill_progress" ? "Filling selected fields…" : "Working…"}</h2><p class="muted">Bounded timeout — never submits.</p></div>`;
    return;
  }

  if (view === "error") {
    el.innerHTML = `${banner}<div class="error">${escapeHtml(errorMessage || "Something went wrong.")}</div>
      <div class="actions"><button class="btn btn-secondary" data-nav="home">Back</button></div>`;
    bindNav();
    return;
  }

  if (view === "privacy") {
    el.innerHTML = `${banner}<div class="card"><h2>Privacy</h2>
      <p><strong>Inspected:</strong> labels, types, required flags, select options, upload purpose.</p>
      <p style="margin-top:8px"><strong>Filled:</strong> only selected supported non-upload fields you approve.</p>
      <p style="margin-top:8px"><strong>Not done:</strong> auto-submit, CAPTCHA, login, sensitive/legal without approval.</p>
      <p style="margin-top:8px"><strong>Not sent to JobLens:</strong> employer-page values, passwords, cookies, HTML.</p>
      <p style="margin-top:8px"><a href="#" id="btn-privacy-full">Open full extension privacy page</a></p>
    </div>
    <div class="actions"><button class="btn btn-secondary" data-nav="home">Back</button>
    <button class="btn btn-danger" id="btn-disconnect">Disconnect</button></div>`;
    bindNav();
    document.getElementById("btn-disconnect")?.addEventListener("click", onDisconnect);
    document.getElementById("btn-privacy-full")?.addEventListener("click", (e) => {
      e.preventDefault();
      openJobLens("/privacy/extension");
    });
    return;
  }

  if (view === "feedback") {
    el.innerHTML = `${banner}<div class="card"><h2>Report an issue</h2>
      <p class="muted">Only version and error codes are attached — never filled values or documents.</p>
      <label class="muted">Category</label>
      <select id="fb-cat" class="input">
        <option value="form_not_detected">Form not detected</option>
        <option value="wrong_field_mapping">Wrong field mapping</option>
        <option value="field_not_filled">Field not filled</option>
        <option value="incorrect_highlight">Incorrect field highlighted</option>
        <option value="document_upload_failed">Document upload failed</option>
        <option value="undo_failed">Undo failed</option>
        <option value="connection_failed">JobLens connection failed</option>
        <option value="privacy_concern">Privacy concern</option>
        <option value="other">Other</option>
      </select>
      <label class="muted" style="margin-top:8px;display:block">Optional note (no passwords or answers)</label>
      <textarea id="fb-msg" class="input" rows="3" maxlength="500"></textarea>
    </div>
    <div class="actions">
      <button class="btn btn-primary" id="btn-fb-send" ${connected ? "" : "disabled"}>Send report</button>
      <button class="btn btn-ghost" data-nav="home">Cancel</button>
    </div>`;
    bindNav();
    document.getElementById("btn-fb-send")?.addEventListener("click", async () => {
      try {
        const category = (document.getElementById("fb-cat") as HTMLSelectElement).value;
        const message = (document.getElementById("fb-msg") as HTMLTextAreaElement).value;
        await submitExtensionFeedback({
          category,
          message,
          platform: "greenhouse",
          detector_version: DETECTOR_VERSION,
          extension_version: EXTENSION_VERSION,
          feature_stage: view,
        });
        notice = "Issue report sent. Thank you.";
        view = "home";
        render();
      } catch (e) {
        errorMessage = e instanceof Error ? e.message : "feedback_failed";
        view = "error";
        render();
      }
    });
    return;
  }

  if (view === "onboarding") {
    const steps = [
      { t: "Welcome to JobLens Assistant", b: "Helps you prepare Greenhouse applications using your JobLens profile — you stay in control." },
      { t: "Supported platform: Greenhouse", b: "Only boards.greenhouse.io and job-boards.greenhouse.io in this pilot." },
      { t: "What JobLens can do", b: "Analyze forms, map fields, fill approved profile values, optionally upload a resume/cover letter you select." },
      { t: "What JobLens cannot do", b: "It cannot click Submit, solve CAPTCHAs, log in for you, or fill sensitive/legal questions without your review." },
      { t: "Privacy and permissions", b: "We inspect field labels and types — not your existing answers, passwords, cookies, or page HTML." },
      { t: "Connect account", b: "Connect to JobLens so the extension can use your approved profile and documents." },
      { t: "Open a supported job", b: "Open a Greenhouse apply page, analyze, review, fill, then you click Submit and confirm with I Submitted." },
    ];
    const s = steps[Math.min(onboardingStep, steps.length - 1)];
    const last = onboardingStep >= steps.length - 1;
    el.innerHTML = `${banner}<div class="card"><h2>${escapeHtml(s.t)}</h2>
      <p style="margin-top:8px">${escapeHtml(s.b)}</p>
      ${last ? `<div class="consent-box" style="margin-top:12px">
        <label><input type="checkbox" id="ob-ack1" /> JobLens does not submit applications.</label><br/>
        <label><input type="checkbox" id="ob-ack2" /> I will review all information before submitting.</label><br/>
        <label><input type="checkbox" id="ob-ack3" /> I am responsible for accuracy.</label><br/>
        <label><input type="checkbox" id="ob-ack4" /> JobLens will not bypass security controls.</label>
      </div>` : `<p class="muted" style="margin-top:8px">Step ${onboardingStep + 1} of ${steps.length}</p>`}
    </div>
    <div class="actions">
      ${onboardingStep > 0 ? '<button class="btn btn-ghost" id="btn-ob-back">Back</button>' : ""}
      <button class="btn btn-primary" id="btn-ob-next">${last ? "Continue" : "Next"}</button>
    </div>`;
    document.getElementById("btn-ob-back")?.addEventListener("click", () => {
      onboardingStep = Math.max(0, onboardingStep - 1);
      render();
    });
    document.getElementById("btn-ob-next")?.addEventListener("click", async () => {
      if (!last) {
        onboardingStep += 1;
        render();
        return;
      }
      const ids = ["ob-ack1", "ob-ack2", "ob-ack3", "ob-ack4"];
      const all = ids.every((id) => (document.getElementById(id) as HTMLInputElement)?.checked);
      if (!all) {
        errorMessage = "Please acknowledge all statements to continue.";
        view = "error";
        render();
        return;
      }
      await chrome.storage.local.set({ onboarding_ack_v4: true });
      onboardingAck = true;
      view = "home";
      render();
    });
    return;
  }

  if (view === "supported") {
    el.innerHTML = `${banner}<div class="card"><h2>Supported sites</h2>
      <p>• boards.greenhouse.io</p><p>• job-boards.greenhouse.io</p></div>
      <div class="actions"><button class="btn btn-secondary" data-nav="home">Back</button></div>`;
    bindNav();
    return;
  }

  if (view === "unsupported") {
    el.innerHTML = `${banner}<div class="card"><h2>This page is not currently supported by JobLens.</h2>
      <p class="muted" style="margin-top:6px">M2 supports Greenhouse boards only.</p></div>
      <div class="actions">
        <button class="btn btn-primary" id="btn-return">Return to JobLens</button>
        <button class="btn btn-secondary" data-nav="supported">View Supported Sites</button>
        <button class="btn btn-secondary" id="btn-report">Report This Site</button>
      </div>`;
    bindNav();
    document.getElementById("btn-return")?.addEventListener("click", () => openJobLens("/jobs/discover"));
    document.getElementById("btn-report")?.addEventListener("click", () => {
      openJobLens(`/extension/report-site?url=${encodeURIComponent(activeUrl || "")}`);
    });
    return;
  }

  if (view === "consent") {
    el.innerHTML = `${banner}<div class="card"><h2>Analyze this form?</h2>
      <div class="consent-box">JobLens can inspect the visible structure of this application form to identify supported and missing fields.
      It will not read your entered answers, fill the form or submit the application.</div>
      <p class="muted">Consent applies to this tab session only.</p></div>
      <div class="actions">
        <button class="btn btn-primary" id="btn-analyze-confirm">Analyze This Form</button>
        <button class="btn btn-ghost" data-nav="home">Cancel</button>
      </div>`;
    bindNav();
    document.getElementById("btn-analyze-confirm")?.addEventListener("click", onAnalyzeConfirmed);
    return;
  }

  if (view === "fill_consent") {
    el.innerHTML = `${banner}<div class="card"><h2>Prepare profile values?</h2>
      <div class="consent-box">JobLens can prepare approved profile information for supported fields on this Greenhouse application.
      You will review the proposed values before anything is filled. JobLens will not upload documents or submit the application.</div></div>
      <div class="actions">
        <button class="btn btn-primary" id="btn-review-fields">Review Fields</button>
        <button class="btn btn-ghost" data-nav="result">Cancel</button>
      </div>`;
    bindNav();
    document.getElementById("btn-review-fields")?.addEventListener("click", onStartMapping);
    return;
  }

  if (view === "fields" && analysis) {
    const rows = analysis.fields.map((f) => {
      const norm = f.normalized_field_name || "—";
      return `<div class="field"><div class="top"><span>${escapeHtml(f.field_label || f.external_field_key)}</span>
        <span class="badge ${escapeHtml(f.classification)}">${escapeHtml(f.classification)}</span></div>
        <div class="muted">${escapeHtml(norm)} · ${escapeHtml(f.field_type)} · ${f.is_required ? "required" : "optional"}</div></div>`;
    }).join("");
    el.innerHTML = `${banner}<div class="card"><h2>Field details</h2></div>
      <div class="field-list">${rows}</div>
      <div class="actions" style="margin-top:10px"><button class="btn btn-secondary" data-nav="result">Back</button></div>`;
    bindNav();
    return;
  }

  if (view === "readiness" && readiness) {
    const checks = Object.entries(readiness.checks).map(([k, v]) =>
      `<div class="meta"><div class="item"><div class="label">${escapeHtml(k.replace(/_/g, " "))}</div>
        <div class="value">${v ? "Yes" : "No"}</div></div></div>`).join("");
    el.innerHTML = `${banner}<div class="card"><h2>Profile readiness</h2>
      <p><strong>${escapeHtml(readiness.status)}</strong></p>
      <p class="muted">Missing info does not block filling available fields.</p>${checks}</div>
      <div class="actions">
        <button class="btn btn-primary" data-nav="mapping">Continue to mapping</button>
        <button class="btn btn-secondary" id="btn-open-profile">Open JobLens Profile</button>
      </div>`;
    bindNav();
    document.getElementById("btn-open-profile")?.addEventListener("click", () => openJobLens("/profile"));
    return;
  }

  if (view === "mapping") {
    const rows = mappings.map((m, idx) => {
      const status = m.already_filled ? "Already Filled" : m.mapping_status;
      const canSelect = m.selectable && status === "Ready" && (!m.requires_individual_confirmation || m.confirmed_sensitive);
      const disabled = !m.selectable || status === "Manual Upload Required" || status.startsWith("Sensitive") || status === "Unsupported" || status === "Missing in Profile";
      return `<div class="field">
        <div class="top">
          <label><input type="checkbox" data-idx="${idx}" ${m.selected && canSelect ? "checked" : ""} ${disabled && !m.already_filled ? "disabled" : ""} ${m.already_filled && !m.replace_existing ? "" : ""}/>
          ${escapeHtml(m.field_label)}</label>
          <span class="badge">${escapeHtml(status)}</span>
        </div>
        <div class="muted">${escapeHtml(m.normalized_field_name || "—")} · ${m.is_required ? "required" : "optional"} · ${Math.round((m.mapping_confidence || 0) * 100)}%</div>
        <div class="muted">Proposed: ${escapeHtml(maskValue(m))}</div>
        ${m.already_filled ? `<label class="muted"><input type="checkbox" data-replace="${idx}" ${m.replace_existing ? "checked" : ""}/> Replace existing value</label>` : ""}
        ${m.requires_individual_confirmation && m.approved_value ? `<div class="consent-box">This answer affects employment eligibility. Confirm that it is accurate for this application.
          <label><input type="checkbox" data-confirm="${idx}" ${m.confirmed_sensitive ? "checked" : ""}/> I confirm</label></div>` : ""}
        ${status === "Manual Upload Required" ? `<p class="muted">Manual upload required</p>` : ""}
      </div>`;
    }).join("");

    el.innerHTML = `${banner}<div class="card"><h2>Field mapping review</h2>
      <p class="muted">Select fields to fill. Existing values are preserved unless you opt in per field.</p></div>
      <div class="field-list">${rows || '<p class="muted">No fields.</p>'}</div>
      <div class="actions" style="margin-top:10px">
        <button class="btn btn-primary" id="btn-fill-selected">Fill Selected Fields</button>
        <button class="btn btn-secondary" data-nav="readiness">Back</button>
      </div>`;
    bindNav();
    main().querySelectorAll("input[data-idx]").forEach((box) => {
      box.addEventListener("change", (e) => {
        const i = Number((e.target as HTMLInputElement).dataset.idx);
        mappings[i].selected = (e.target as HTMLInputElement).checked;
      });
    });
    main().querySelectorAll("input[data-replace]").forEach((box) => {
      box.addEventListener("change", (e) => {
        const i = Number((e.target as HTMLInputElement).dataset.replace);
        mappings[i].replace_existing = (e.target as HTMLInputElement).checked;
        if (mappings[i].replace_existing && mappings[i].selectable) mappings[i].selected = true;
        render();
      });
    });
    main().querySelectorAll("input[data-confirm]").forEach((box) => {
      box.addEventListener("change", (e) => {
        const i = Number((e.target as HTMLInputElement).dataset.confirm);
        mappings[i].confirmed_sensitive = (e.target as HTMLInputElement).checked;
        if (mappings[i].confirmed_sensitive) mappings[i].selected = true;
        render();
      });
    });
    document.getElementById("btn-fill-selected")?.addEventListener("click", onFillSelected);
    return;
  }

  if (view === "fill_result") {
    const filled = fillOutcomes.filter((o) => o.status === "filled").length;
    const skipped = fillOutcomes.filter((o) => o.status === "skipped_existing").length;
    const failed = fillOutcomes.filter((o) => o.status === "failed" || o.status === "option_not_found").length;
    const uploads = mappings.filter((m) => m.mapping_status === "Manual Upload Required").length;
    const sensitive = mappings.filter((m) => m.mapping_status.startsWith("Sensitive")).length;
    const missing = mappings.filter((m) => m.mapping_status === "Missing in Profile").length;
    el.innerHTML = `${banner}<div class="card"><h2>Fill result</h2>
      <div class="stats">
        <div class="stat"><div class="n">${filled}</div><div class="l">Filled</div></div>
        <div class="stat"><div class="n">${skipped}</div><div class="l">Skipped</div></div>
        <div class="stat danger"><div class="n">${failed}</div><div class="l">Failed</div></div>
        <div class="stat"><div class="n">${uploads}</div><div class="l">Uploads</div></div>
      </div>
      <p class="muted">Missing in profile: ${missing} · Sensitive manual: ${sensitive}</p>
    </div>
    <div class="actions">
      <button class="btn btn-primary" data-nav="documents">Prepare Documents</button>
      <button class="btn btn-primary" data-nav="employer_review">Review Employer Form</button>
      <button class="btn btn-secondary" id="btn-retry">Retry Failed Fields</button>
      <button class="btn btn-secondary" id="btn-undo">Undo This Fill</button>
      <button class="btn btn-secondary" id="btn-open-profile">Open JobLens Profile</button>
      <button class="btn btn-ghost" data-nav="home">Close Extension</button>
    </div>`;
    bindNav();
    document.getElementById("btn-undo")?.addEventListener("click", onUndo);
    document.getElementById("btn-retry")?.addEventListener("click", () => {
      for (const o of fillOutcomes) {
        if (o.status === "failed" || o.status === "option_not_found") {
          const m = mappings.find((x) => x.external_field_key === o.external_field_key);
          if (m) m.selected = true;
        }
      }
      view = "mapping";
      render();
    });
    document.getElementById("btn-open-profile")?.addEventListener("click", () => openJobLens("/profile"));
    return;
  }

  if (view === "documents") {
    el.innerHTML = `${banner}<div class="card"><h2>Document preparation</h2>
      <p class="muted">${escapeHtml(analysis?.job_title || "—")} · ${escapeHtml(analysis?.employer || "—")} · greenhouse</p>
      <p class="muted">Resume field: ${mappings.some((m) => m.normalized_field_name === "resume_upload" || m.is_upload && /resume/i.test(m.field_label)) ? "detected" : "not detected"}</p>
      <p class="muted">Cover letter field: ${mappings.some((m) => m.normalized_field_name === "cover_letter_upload" || /cover/i.test(m.field_label)) ? "detected" : "not detected"}</p>
      <div id="doc-list" class="muted" style="margin-top:8px">Loading documents…</div>
    </div>
    <div class="actions">
      <button class="btn btn-secondary" id="btn-load-docs">Refresh Documents</button>
      <button class="btn btn-primary" id="btn-upload-resume" ${selectedResumeId ? "" : "disabled"}>Upload Resume (consent)</button>
      <button class="btn btn-secondary" id="btn-upload-cover" ${selectedCoverId ? "" : "disabled"}>Upload Cover Letter (consent)</button>
      <button class="btn btn-secondary" id="btn-skip-cover">Continue Without Cover Letter</button>
      <button class="btn btn-secondary" id="btn-open-docs">Open Documents in JobLens</button>
      <button class="btn btn-primary" data-nav="employer_review">Continue to Review</button>
    </div>`;
    bindNav();
    const load = async () => {
      try {
        docList = await listExtensionDocuments();
        selectedResumeId = selectedResumeId || docList.suggested_resume_id;
        const box = document.getElementById("doc-list");
        if (!box) return;
        const resumes = docList.documents.filter((d) => d.document_type === "resume");
        box.innerHTML = resumes.map((d) =>
          `<label style="display:block;margin:4px 0"><input type="radio" name="resume" value="${d.id}" ${selectedResumeId === d.id ? "checked" : ""}/>
           ${escapeHtml(d.file_name)} · v${d.version_number} · ${d.file_size} bytes ${d.suggested ? "(suggested)" : ""}</label>`
        ).join("") || "<p>No saved resume files. Analyze a resume in JobLens first.</p>";
        box.querySelectorAll("input[name=resume]").forEach((r) => {
          r.addEventListener("change", (e) => {
            selectedResumeId = Number((e.target as HTMLInputElement).value);
            render();
          });
        });
      } catch (e) {
        errorMessage = mapError(e instanceof Error ? e.message : "documents_list_failed");
        view = "error";
        render();
      }
    };
    document.getElementById("btn-load-docs")?.addEventListener("click", () => void load());
    document.getElementById("btn-open-docs")?.addEventListener("click", () => openJobLens("/resume"));
    document.getElementById("btn-skip-cover")?.addEventListener("click", () => {
      selectedCoverId = null;
      view = "employer_review";
      render();
    });
    document.getElementById("btn-upload-resume")?.addEventListener("click", () => {
      const field = mappings.find((m) => m.normalized_field_name === "resume_upload" || (m.is_upload && /resume|cv/i.test(m.field_label)));
      const doc = docList?.documents.find((d) => d.id === selectedResumeId);
      if (!field || !doc || !selectedResumeId) {
        errorMessage = "No saved resume or upload field.";
        view = "error";
        render();
        return;
      }
      pendingUpload = {
        document_type: "resume",
        source_document_id: selectedResumeId,
        field_key: field.external_field_key,
        field_label: field.field_label,
        accept: null,
        meta: { file_name: doc.file_name, file_size: doc.file_size, version_number: doc.version_number },
      };
      view = "upload_consent";
      render();
    });
    document.getElementById("btn-upload-cover")?.addEventListener("click", async () => {
      // Prefer snapshotted cover letter documents
      const covers = docList?.documents.filter((d) => d.document_type === "cover_letter") || [];
      let coverId = selectedCoverId || covers[0]?.id || null;
      if (!coverId && docList?.cover_letters?.[0]) {
        try {
          const snap = await snapshotCoverLetter(docList.cover_letters[0].cover_letter_id);
          coverId = snap.id;
          docList = await listExtensionDocuments();
        } catch (e) {
          errorMessage = mapError(e instanceof Error ? e.message : "snapshot_failed");
          view = "error";
          render();
          return;
        }
      }
      selectedCoverId = coverId;
      const field = mappings.find((m) => m.normalized_field_name === "cover_letter_upload" || (m.is_upload && /cover/i.test(m.field_label)));
      const doc = docList?.documents.find((d) => d.id === coverId);
      if (!field || !doc || !coverId) {
        errorMessage = "Cover letter unavailable or field not found.";
        view = "error";
        render();
        return;
      }
      pendingUpload = {
        document_type: "cover_letter",
        source_document_id: coverId,
        field_key: field.external_field_key,
        field_label: field.field_label,
        meta: { file_name: doc.file_name, file_size: doc.file_size, version_number: doc.version_number },
      };
      view = "upload_consent";
      render();
    });
    void load();
    return;
  }

  if (view === "upload_consent" && pendingUpload) {
    const p = pendingUpload;
    el.innerHTML = `${banner}<div class="card"><h2>Upload consent</h2>
      <div class="consent-box">JobLens can place the selected document into this application’s upload field. It will not submit the application.</div>
      <p>Type: ${escapeHtml(p.document_type)}</p>
      <p>File: ${escapeHtml(p.meta?.file_name || "")} · ${p.meta?.file_size || 0} bytes · v${p.meta?.version_number || "?"}</p>
      <p>Field: ${escapeHtml(p.field_label)}</p>
      <p>Employer: ${escapeHtml(analysis?.employer || "—")} · ${escapeHtml(analysis?.job_title || "—")}</p>
      ${p.replace_existing ? "" : `<label class="muted"><input type="checkbox" id="chk-replace"/> Replace Existing File</label>`}
    </div>
    <div class="actions">
      <button class="btn btn-primary" id="btn-do-upload">Upload This Document</button>
      <button class="btn btn-ghost" data-nav="documents">Cancel</button>
    </div>`;
    bindNav();
    document.getElementById("chk-replace")?.addEventListener("change", (e) => {
      if (pendingUpload) pendingUpload.replace_existing = (e.target as HTMLInputElement).checked;
    });
    document.getElementById("btn-do-upload")?.addEventListener("click", onDoUpload);
    return;
  }

  if (view === "upload_result") {
    el.innerHTML = `${banner}<div class="card"><h2>Upload result</h2><p>${escapeHtml(uploadOutcomeMsg)}</p>
      <p class="muted">JobLens will not click Submit.</p></div>
      <div class="actions">
        <button class="btn btn-primary" data-nav="documents">Back to Documents</button>
        <button class="btn btn-secondary" data-nav="employer_review">Continue</button>
        <button class="btn btn-secondary" id="btn-open-resume">Download / open in JobLens</button>
      </div>`;
    bindNav();
    document.getElementById("btn-open-resume")?.addEventListener("click", () => openJobLens("/resume"));
    return;
  }

  if (view === "employer_review") {
    el.innerHTML = `${banner}<div class="card"><h2>Employer review required</h2>
      <p>Review the employer application and click Submit on the employer website.</p>
      <p class="muted" style="margin-top:8px"><strong>JobLens will not click Submit.</strong></p>
      ${advisoryConfirmation ? '<p class="muted">This page appears to confirm submission. Please verify before marking the application Applied.</p>' : ""}
    </div>
    <div class="actions">
      <button class="btn btn-primary" id="btn-i-submitted">I Submitted</button>
      <button class="btn btn-secondary" id="btn-not-submitted">I Have Not Submitted</button>
      <button class="btn btn-secondary" id="btn-save-progress">Save as In Progress</button>
      <button class="btn btn-ghost" id="btn-check-confirm">Check confirmation page</button>
    </div>`;
    bindNav();
    document.getElementById("btn-i-submitted")?.addEventListener("click", () => {
      confirmChecked = false;
      view = "submission_confirm";
      render();
    });
    document.getElementById("btn-not-submitted")?.addEventListener("click", () => {
      view = "documents";
      render();
    });
    document.getElementById("btn-save-progress")?.addEventListener("click", () => void onSaveInProgress());
    document.getElementById("btn-check-confirm")?.addEventListener("click", async () => {
      if (activeTabId == null) return;
      const resp = await sendToTab<{ payload?: { looks_like_confirmation?: boolean } }>(activeTabId, {
        type: "DETECT_CONFIRMATION_PAGE",
      });
      advisoryConfirmation = !!resp.payload?.looks_like_confirmation;
      render();
    });
    return;
  }

  if (view === "submission_confirm") {
    el.innerHTML = `${banner}<div class="card"><h2>Confirm application submission</h2>
      <p>Confirm that you submitted this application on the employer’s website.</p>
      <p class="muted">${escapeHtml(analysis?.job_title || "")} · ${escapeHtml(analysis?.employer || "")}</p>
      <p class="muted" style="word-break:break-all">${escapeHtml(activeUrl || "")}</p>
      <p class="muted">Resume: ${selectedResumeId ?? "—"} · Cover: ${selectedCoverId ?? "—"}</p>
      <input class="input" id="conf-num" placeholder="Confirmation number (optional)" value="${escapeHtml(confirmNumber)}" style="width:100%;margin:6px 0;padding:8px"/>
      <input class="input" id="conf-url" placeholder="Confirmation URL (optional)" value="${escapeHtml(confirmUrl)}" style="width:100%;margin:6px 0;padding:8px"/>
      <label><input type="checkbox" id="conf-check" ${confirmChecked ? "checked" : ""}/> I confirm that I submitted this application.</label>
    </div>
    <div class="actions">
      <button class="btn btn-primary" id="btn-mark-applied" ${confirmChecked ? "" : "disabled"}>Mark as Applied</button>
      <button class="btn btn-secondary" data-nav="employer_review">Cancel</button>
      <button class="btn btn-secondary" id="btn-save-progress2">Save as In Progress</button>
    </div>`;
    bindNav();
    document.getElementById("conf-check")?.addEventListener("change", (e) => {
      confirmChecked = (e.target as HTMLInputElement).checked;
      render();
    });
    document.getElementById("conf-num")?.addEventListener("change", (e) => {
      confirmNumber = (e.target as HTMLInputElement).value;
    });
    document.getElementById("conf-url")?.addEventListener("change", (e) => {
      confirmUrl = (e.target as HTMLInputElement).value;
    });
    document.getElementById("btn-mark-applied")?.addEventListener("click", () => void onMarkApplied());
    document.getElementById("btn-save-progress2")?.addEventListener("click", () => void onSaveInProgress());
    return;
  }

  if (view === "application_recorded") {
    el.innerHTML = `${banner}<div class="card"><h2>Application recorded</h2>
      <p>Application marked as Applied and added to your Job Tracker.</p></div>
      <div class="actions">
        <button class="btn btn-primary" id="btn-status">View Application Status</button>
        <button class="btn btn-secondary" id="btn-tracker">View Job Tracker</button>
        <button class="btn btn-ghost" data-nav="home">Close</button>
      </div>`;
    bindNav();
    document.getElementById("btn-status")?.addEventListener("click", () => openJobLens("/applications/status"));
    document.getElementById("btn-tracker")?.addEventListener("click", () => openJobLens("/jobs"));
    return;
  }

  if (view === "manual_next") {
    el.innerHTML = `${banner}<div class="card"><h2>Manual next steps</h2>
      <p>Review the employer form carefully, upload required documents manually and submit the application yourself.</p>
      <p class="muted" style="margin-top:8px">JobLens will not submit this application.</p></div>
      <div class="actions">
        <button class="btn btn-secondary" id="btn-hide-hl">Hide highlights</button>
        <button class="btn btn-primary" data-nav="home">Done</button>
      </div>`;
    bindNav();
    document.getElementById("btn-hide-hl")?.addEventListener("click", async () => {
      if (activeTabId != null) await sendToTab(activeTabId, { type: "SET_HIGHLIGHTS", payload: { visible: false } });
    });
    return;
  }

  if (view === "result" && analysis) {
    el.innerHTML = `${banner}<div class="card"><h2>Form analysis</h2>
      <div class="meta">
        <div class="item"><div class="label">Platform</div><div class="value">${escapeHtml(analysis.platform)}</div></div>
        <div class="item"><div class="label">Employer</div><div class="value">${escapeHtml(analysis.employer || "—")}</div></div>
        <div class="item"><div class="label">Job title</div><div class="value">${escapeHtml(analysis.job_title || "—")}</div></div>
        <div class="item"><div class="label">Fields</div><div class="value">${analysis.fields.length}</div></div>
      </div></div>
      <div class="actions">
        <button class="btn btn-primary" id="btn-assist" ${connected ? "" : "disabled"}>Review Fields to Fill</button>
        <button class="btn btn-secondary" data-nav="fields">View Field Details</button>
        <button class="btn btn-secondary" id="btn-save" ${connected ? "" : "disabled"}>Save diagnostic</button>
        <button class="btn btn-ghost" data-nav="home">Done</button>
      </div>`;
    bindNav();
    document.getElementById("btn-assist")?.addEventListener("click", () => {
      if (!fillEnabled) {
        errorMessage = "Assisted fill is not enabled for your account in this environment (pilot entitlement required).";
        view = "error";
        render();
        return;
      }
      view = "fill_consent";
      render();
    });
    document.getElementById("btn-save")?.addEventListener("click", onSaveDiagnostic);
    return;
  }

  // home
  const pilotNote =
    connected && pilotUser === false
      ? `<p class="muted" style="margin-top:8px">Connected, but assisted fill/upload is limited to pilot users. Diagnostics may still work.</p>`
      : connected && pilotUser
        ? `<p class="muted" style="margin-top:8px">Pilot access enabled · Greenhouse only · you click Submit</p>`
        : "";
  el.innerHTML = `${banner}<div class="card"><h2>Current page</h2>
    <p>${pageSupported ? "Supported Greenhouse page" : activeUrl ? "Unsupported page" : "No active tab"}</p>
    <p class="muted" style="margin-top:6px;word-break:break-all">${escapeHtml(activeUrl || "—")}</p>
    ${pilotNote}
    <div class="meta" style="margin-top:10px">
      <div class="item"><div class="label">Platform</div><div class="value">${pageSupported ? "greenhouse" : "—"}</div></div>
      <div class="item"><div class="label">Extension</div><div class="value">v${EXTENSION_VERSION}</div></div>
    </div></div>
    <div class="actions">
      <button class="btn btn-primary" id="btn-analyze" ${pageSupported ? "" : "disabled"}>Analyze Application Form</button>
      <button class="btn btn-secondary" id="btn-connect">${connected ? "Reconnect" : "Connect to JobLens"}</button>
      <button class="btn btn-secondary" id="btn-open">Open in JobLens</button>
      <button class="btn btn-ghost" id="btn-feedback">Report an issue</button>
      ${connected ? '<button class="btn btn-danger" id="btn-disconnect">Disconnect</button>' : ""}
    </div>`;
  bindNav();
  document.getElementById("btn-analyze")?.addEventListener("click", onAnalyzeClick);
  document.getElementById("btn-connect")?.addEventListener("click", onConnect);
  document.getElementById("btn-open")?.addEventListener("click", () => openJobLens("/jobs/discover"));
  document.getElementById("btn-feedback")?.addEventListener("click", () => {
    view = "feedback";
    render();
  });
  document.getElementById("btn-disconnect")?.addEventListener("click", onDisconnect);
}

async function onAnalyzeClick() {
  if (!pageSupported || activeTabId == null) {
    view = "unsupported";
    render();
    return;
  }
  if (!(await hasTabConsent(activeTabId))) {
    view = "consent";
    render();
    return;
  }
  await runAnalysis();
}

async function onAnalyzeConfirmed() {
  if (activeTabId == null) return;
  await setTabConsent(activeTabId);
  await runAnalysis();
}

async function runAnalysis() {
  if (activeTabId == null) return;
  view = "loading";
  render();
  try {
    const resp = await sendToTab<{ type: string; payload?: FormAnalysisResult; error?: string }>(activeTabId, {
      type: "ANALYZE_FORM",
      payload: {},
    });
    if (resp.type === "ERROR" || resp.error) {
      errorMessage = mapError(resp.error || "analyze_failed");
      view = "error";
      render();
      return;
    }
    analysis = resp.payload ?? null;
    if (!analysis?.is_greenhouse) {
      errorMessage = "This Greenhouse form structure is not yet supported.";
      view = "error";
      render();
      return;
    }
    view = "result";
    render();
  } catch (e) {
    errorMessage = mapError(e instanceof Error ? e.message : "analyze_failed");
    view = "error";
    render();
  }
}

async function onStartMapping() {
  if (!analysis || !connected) {
    errorMessage = mapError("not_connected");
    view = "error";
    render();
    return;
  }
  view = "loading";
  render();
  try {
    const started = await startFillSession(analysis);
    fillSessionId = started.fill_session_id;
    readiness = started.profile_readiness;
    const mapped = await mapFillSession(fillSessionId, analysis);
    readiness = mapped.profile_readiness;
    mappings = mapped.mappings.map((m) => ({
      ...m,
      selected: m.selectable && m.mapping_status === "Ready" && !m.requires_individual_confirmation,
      replace_existing: false,
      confirmed_sensitive: false,
      already_filled: false,
    }));

    if (activeTabId != null) {
      const probe = await sendToTab<{ payload?: { emptiness: Record<string, boolean> } }>(activeTabId, {
        type: "PROBE_EMPTINESS",
        payload: {
          keys: mappings.map((m) => ({
            external_field_key: m.external_field_key,
            field_label: m.field_label,
          })),
        },
      });
      const emptiness = probe.payload?.emptiness || {};
      for (const m of mappings) {
        const empty = emptiness[m.external_field_key];
        if (empty === false) {
          m.already_filled = true;
          m.selected = false;
          if (m.mapping_status === "Ready") m.mapping_status = "Already Filled";
        }
      }
    }
    view = "readiness";
    render();
  } catch (e) {
    errorMessage = mapError(e instanceof Error ? e.message : "mapping_failed");
    view = "error";
    render();
  }
}

async function onFillSelected() {
  if (activeTabId == null || !fillSessionId) return;
  const intents: FillIntent[] = [];
  const reviewedSensitive: string[] = [];
  for (const m of mappings) {
    if (!m.selected || !m.approved_value || !m.normalized_field_name) continue;
    if (m.requires_individual_confirmation && !m.confirmed_sensitive) continue;
    if (m.already_filled && !m.replace_existing) continue;
    if (m.requires_individual_confirmation) reviewedSensitive.push(m.normalized_field_name);
    intents.push({
      external_field_key: m.external_field_key,
      field_label: m.field_label,
      field_type: m.field_type,
      normalized_field_name: m.normalized_field_name,
      value: m.approved_value,
      replace_existing: !!m.replace_existing,
      options: m.options,
    });
  }
  if (!intents.length) {
    errorMessage = "No fields selected to fill.";
    view = "error";
    render();
    return;
  }

  view = "fill_progress";
  render();
  try {
    const resp = await sendToTab<{
      type: string;
      error?: string;
      payload?: { outcomes: FieldFillOutcome[]; submitted: boolean; submitClicked: boolean };
    }>(activeTabId, { type: "FILL_SELECTED_FIELDS", payload: { intents } });

    if (resp.error) {
      errorMessage = mapError(resp.error);
      view = "error";
      render();
      return;
    }
    fillOutcomes = resp.payload?.outcomes || [];
    if (resp.payload?.submitted || resp.payload?.submitClicked) {
      errorMessage = "Safety violation: submit was triggered. Please report this.";
      view = "error";
      render();
      return;
    }

    const successful = fillOutcomes.filter((o) => o.status === "filled").map((o) => o.normalized_field_name);
    const skipped = fillOutcomes.filter((o) => o.status === "skipped_existing").map((o) => o.normalized_field_name);
    const failed = fillOutcomes
      .filter((o) => o.status === "failed" || o.status === "option_not_found")
      .map((o) => o.normalized_field_name);
    await reportFillResult(fillSessionId, {
      successful_fields: successful,
      skipped_fields: skipped,
      failed_fields: failed,
      unsupported_fields: mappings.filter((m) => m.mapping_status === "Unsupported").map((m) => m.normalized_field_name || m.external_field_key),
      missing_fields: mappings.filter((m) => m.mapping_status === "Missing in Profile").map((m) => m.normalized_field_name || m.external_field_key),
      user_reviewed_sensitive_fields: reviewedSensitive,
    }).then((r) => {
      if (r?.job_application_id) jobApplicationId = r.job_application_id;
    });

    // Clear in-memory profile values from mappings after fill
    for (const m of mappings) m.approved_value = m.approved_value ? "[cleared]" : null;

    view = "fill_result";
    render();
  } catch (e) {
    errorMessage = mapError(e instanceof Error ? e.message : "fill_failed");
    view = "error";
    render();
  }
}

async function onDoUpload() {
  if (!pendingUpload || activeTabId == null) return;
  view = "upload_progress";
  render();
  try {
    // Probe accept attribute
    const probe = await sendToTab<{ payload?: { fields: Record<string, { accept: string | null; has_file: boolean }> } }>(
      activeTabId,
      {
        type: "PROBE_UPLOAD_FIELDS",
        payload: { keys: [{ external_field_key: pendingUpload.field_key, field_label: pendingUpload.field_label }] },
      },
    );
    const info = probe.payload?.fields?.[pendingUpload.field_key];
    const started = await startUploadSession({
      fill_session_id: fillSessionId,
      job_application_id: jobApplicationId,
      document_type: pendingUpload.document_type,
      source_document_id: pendingUpload.source_document_id,
      employer_field: {
        external_field_key: pendingUpload.field_key,
        field_label: pendingUpload.field_label,
        accept: info?.accept,
      },
    });
    const result = await fetchAndAssignDocument({
      uploadSessionId: started.upload_session_id,
      retrievalToken: started.retrieval_token,
      tabId: activeTabId,
      external_field_key: pendingUpload.field_key,
      field_label: pendingUpload.field_label,
      file_name: started.document.file_name,
      mime_type: started.document.mime_type,
      replace_existing: pendingUpload.replace_existing || (info?.has_file ? pendingUpload.replace_existing : false),
    });
    await reportUploadResult({
      upload_session_id: started.upload_session_id,
      upload_status: result.status === "verified" || result.status === "uploaded" ? "verified" : result.status === "skipped_existing" ? "cancelled" : "failed",
      employer_field_label: pendingUpload.field_label,
      verification_status: result.status,
      error_code: result.reason,
    });
    if (result.status === "verified" || result.status === "uploaded") {
      uploadOutcomeMsg = `Uploaded ${started.document.file_name} successfully.`;
      if (pendingUpload.document_type === "resume") selectedResumeId = started.document.id;
      if (pendingUpload.document_type === "cover_letter") selectedCoverId = started.document.id;
    } else if (result.status === "skipped_existing") {
      uploadOutcomeMsg = "File already selected. Enable Replace Existing File to overwrite.";
    } else {
      uploadOutcomeMsg = `JobLens could not place this document into the employer form. (${result.reason || result.status}) Use Download File / Choose File Manually.`;
    }
    pendingUpload = null;
    view = "upload_result";
    render();
  } catch (e) {
    errorMessage = mapError(e instanceof Error ? e.message : "upload_failed");
    view = "error";
    render();
  }
}

async function onSaveInProgress() {
  if (!jobApplicationId) {
    errorMessage = "No tracker application linked yet. Save the job from JobLens first.";
    view = "error";
    render();
    return;
  }
  view = "loading";
  render();
  try {
    await confirmSubmission({
      job_application_id: jobApplicationId,
      fill_session_id: fillSessionId,
      confirmed: false,
      save_as_in_progress: true,
      resume_document_id: selectedResumeId,
      cover_letter_document_id: selectedCoverId,
    });
    uploadOutcomeMsg = "Application saved as in progress.";
    view = "upload_result";
    render();
  } catch (e) {
    errorMessage = mapError(e instanceof Error ? e.message : "save_failed");
    view = "error";
    render();
  }
}

async function onMarkApplied() {
  if (!confirmChecked || !jobApplicationId) return;
  view = "loading";
  render();
  try {
    const r = await confirmSubmission({
      job_application_id: jobApplicationId,
      fill_session_id: fillSessionId,
      confirmed: true,
      confirmation_number: confirmNumber || undefined,
      confirmation_url: confirmUrl || undefined,
      resume_document_id: selectedResumeId,
      cover_letter_document_id: selectedCoverId,
    });
    if (r.warning) {
      errorMessage = r.warning;
      view = "error";
      render();
      return;
    }
    view = "application_recorded";
    render();
  } catch (e) {
    errorMessage = mapError(e instanceof Error ? e.message : "confirm_failed");
    view = "error";
    render();
  }
}

async function onUndo() {
  if (activeTabId == null) return;
  view = "loading";
  render();
  try {
    await sendToTab(activeTabId, { type: "UNDO_FILL", payload: { confirm_user_edited: false } });
    view = "manual_next";
    render();
  } catch {
    errorMessage = "Undo unavailable";
    view = "error";
    render();
  }
}

async function onSaveDiagnostic() {
  if (!analysis) return;
  view = "loading";
  render();
  try {
    const saved = await saveDiagnostic(analysis);
    view = "result";
    render();
    main().insertAdjacentHTML("afterbegin", `<div class="card"><p>Diagnostic saved (#${saved.id}).</p></div>`);
  } catch (e) {
    errorMessage = mapError(e instanceof Error ? e.message : "save_failed");
    view = "error";
    render();
  }
}

async function onConnect() {
  view = "loading";
  render();
  chrome.runtime.sendMessage({ type: "AUTH_START" }, async (resp) => {
    if (chrome.runtime.lastError) {
      errorMessage = chrome.runtime.lastError.message || "auth_failed";
      view = "error";
      render();
      return;
    }
    if (resp?.type === "AUTH_SUCCESS") {
      connected = true;
      view = "home";
      await refreshStatus();
      render();
      return;
    }
    errorMessage = mapError(resp?.error || "auth_failed");
    view = "error";
    render();
  });
}

async function onDisconnect() {
  await revokeAuth();
  if (activeTabId != null) await clearTabConsent(activeTabId);
  connected = false;
  fillSessionId = null;
  mappings = [];
  view = "home";
  render();
}

async function refreshStatus() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  activeTabId = tab?.id ?? null;
  activeUrl = tab?.url ?? null;
  pageSupported = isSupportedGreenhouseUrl(activeUrl);
  const auth = await getAuth();
  connected = !!(auth.connected && auth.accessToken);
  pilotUser = null;
  fillEnabled = true;
  uploadEnabled = true;
  try {
    const st = await fetchStatus();
    connected = st.connected;
    pilotUser = st.flags?.pilot_user ?? null;
    fillEnabled = st.capabilities?.fill_form !== false;
    uploadEnabled = st.capabilities?.upload_resume !== false;
    if (st.flags?.pilot_user === false && st.capabilities?.fill_form === false) {
      notice = "Pilot entitlement required for fill/upload in this environment.";
    } else {
      notice = "JobLens will not submit this application.";
    }
    try {
      if (connected) {
        const me = await fetchPilotMe();
        pilotUser = me.pilot_user;
        if (me.message) notice = me.message;
      }
    } catch {
      /* optional */
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (/update required|minimum supported|426/i.test(msg)) {
      notice = "Update required: please install the latest JobLens Assistant.";
    }
  }
}

document.getElementById("btn-privacy")?.addEventListener("click", () => {
  view = "privacy";
  render();
});
document.getElementById("btn-supported")?.addEventListener("click", () => {
  view = "supported";
  render();
});

refreshStatus()
  .then(async () => {
    const stored = await chrome.storage.local.get(["onboarding_ack_v4"]);
    onboardingAck = !!stored.onboarding_ack_v4;
    if (!onboardingAck) {
      view = "onboarding";
      onboardingStep = 0;
    }
    render();
  })
  .catch(() => {
    errorMessage = "Failed to read active tab.";
    view = "error";
    render();
  });

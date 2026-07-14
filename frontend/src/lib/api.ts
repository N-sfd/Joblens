import { getGuestId } from "./guestId";
import { getClerkToken, waitForClerkToken } from "./clerkToken";

/** Origin only (no /api). Avoids https://host/api + /api/jobs → /api/api/jobs (404). */
function normalizeOrigin(url: string): string {
  return url.trim().replace(/\/$/, "").replace(/\/api\/?$/i, "");
}

/** Base URL for FastAPI (no trailing slash). See README / .env.example for Vercel + Render. */
function getApiBase(): string {
  // Browser on deployed hosts: always same-origin `/api` → Vercel proxy (`BACKEND_URL`).
  // A baked-in NEXT_PUBLIC_API_URL often points at a sleeping Render host or an origin
  // missing from ALLOWED_ORIGINS (e.g. staging-rc), which surfaces as "Failed to fetch".
  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    if (host === "localhost" || host === "127.0.0.1") {
      const nextPublic = process.env.NEXT_PUBLIC_API_URL?.trim();
      return nextPublic ? normalizeOrigin(nextPublic) : "http://localhost:8000";
    }
    return "";
  }
  const serverBackend =
    process.env.BACKEND_URL?.trim() ||
    process.env.NEXT_PUBLIC_API_URL?.trim() ||
    "http://localhost:8000";
  return normalizeOrigin(serverBackend);
}

const OWNED_PREFIXES = ["/api/jobs", "/api/applications", "/api/resume", "/api/match", "/api/cover-letter", "/api/activity", "/api/auth", "/api/account","/api/profile", "/api/integrations/joblens/jobs"];

/** Build a query string (with leading `?`) from defined params; empty → "". */
export class ApiError extends Error {
  status: number;
  detail: unknown;
  submissionId?: number;

  constructor(message: string, status: number, detail?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
    if (detail && typeof detail === "object" && "submission_id" in detail) {
      const id = Number((detail as { submission_id: unknown }).submission_id);
      if (Number.isFinite(id)) this.submissionId = id;
    }
  }
}

function formatApiErrorDetail(detail: unknown, fallback: string): string {
  if (typeof detail === "string" && detail.trim()) return detail;
  if (Array.isArray(detail)) {
    const msgs = detail
      .map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object" && "msg" in item) return String((item as { msg: unknown }).msg);
        return null;
      })
      .filter(Boolean);
    if (msgs.length) return msgs.join("; ");
  }
  if (detail && typeof detail === "object") {
    if ("message" in detail && typeof (detail as { message: unknown }).message === "string") {
      return String((detail as { message: string }).message);
    }
    if ("msg" in detail) {
      return String((detail as { msg: unknown }).msg);
    }
  }
  return fallback;
}

function qs(params?: Record<string, string | number | boolean | undefined | null>): string {
  if (!params) return "";
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

// Private ATS/CRM endpoints — these carry the Clerk session JWT for backend
// verification (see ats_auth.py). Public job-seeker endpoints do not.
const ATS_PREFIXES = ["/api/candidates", "/api/employees", "/api/job-requirements", "/api/job-sends", "/api/submissions", "/api/pipeline", "/api/interviews", "/api/offers", "/api/crm", "/api/contacts", "/api/companies", "/api/ats", "/api/zoho", "/api/dashboard", "/api/reports"];

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const base = getApiBase();
  const headers = new Headers(init?.headers);
  if (typeof window !== "undefined" && OWNED_PREFIXES.some((p) => path.startsWith(p))) {
    headers.set("X-Guest-Id", getGuestId());
  }
  if (typeof window !== "undefined" && ATS_PREFIXES.some((p) => path.startsWith(p))) {
    // Wait for AtsAuthBridge + Clerk getToken (avoids infinite "Checking ATS permissions…").
    const token = (await getClerkToken(2000)) || (await waitForClerkToken({ attempts: 15, delayMs: 100, timeoutMs: 2000 }));
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    } else {
      throw new Error("Your session has expired. Please sign in again.");
    }
  }
  let res: Response;
  try {
    res = await fetch(`${base}${path}`, { ...init, headers, credentials: "include" });
  } catch (e) {
    const hint =
      typeof window !== "undefined" &&
      window.location.hostname !== "localhost" &&
      !process.env.NEXT_PUBLIC_API_URL
        ? " Configure BACKEND_URL on Vercel (same-origin proxy) or NEXT_PUBLIC_API_URL to your API URL."
        : " Is the backend running and reachable? Check NEXT_PUBLIC_API_URL / CORS.";
    const msg = e instanceof Error ? e.message : "Network error";
    throw new Error(`${msg}.${hint}`);
  }
  if (!res.ok) {
    const body = await res.text();
    let detail: unknown = body;
    try { detail = JSON.parse(body)?.detail ?? body; } catch {}
    throw new ApiError(
      formatApiErrorDetail(detail, body || `Request failed: ${res.status}`),
      res.status,
      detail,
    );
  }
  return res.json();
}

function normalizeSubmissionList(
  data: import("@/types").SubmissionListResponse | import("@/types").Submission[],
): import("@/types").SubmissionListResponse {
  if (Array.isArray(data)) {
    return { items: data, total: data.length, page: 1, page_size: data.length || 20, total_pages: 1 };
  }
  return {
    items: data.items ?? [],
    total: data.total ?? 0,
    page: data.page ?? 1,
    page_size: data.page_size ?? 20,
    total_pages: data.total_pages ?? 1,
  };
}

export const api = {
  // Auth
  signup: (email: string, password: string, name?: string) =>
    request<import("@/types").User>("/api/auth/signup", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, name }),
    }),
  login: (email: string, password: string) =>
    request<import("@/types").User>("/api/auth/login", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    }),
  logout: () => request<{ message: string }>("/api/auth/logout", { method: "POST" }),
  me: () => request<import("@/types").User>("/api/auth/me"),
  deleteAccount: () => request<{ message: string }>("/api/auth/me", { method: "DELETE" }),

  // Profile
  getProfile: () => request<import("@/types").Profile>("/api/profile/"),
  updateProfile: (data: import("@/types").ProfileUpdate) =>
    request<import("@/types").Profile>("/api/profile/", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),
  getProfileCompleteness: () =>
    request<import("@/types").ProfileCompleteness>("/api/profile/completeness"),
  getApplicationReadiness: () =>
    request<import("@/types").ApplicationReadiness>("/api/profile/readiness"),
  listApplicationAnswers: () =>
    request<import("@/types").ApplicationAnswer[]>("/api/profile/answers"),
  createApplicationAnswer: (data: {
    normalized_question_key: string;
    display_question: string;
    answer: string;
    answer_type?: string;
    is_sensitive?: boolean;
    approval_status?: string;
    reuse_policy?: string;
  }) =>
    request<import("@/types").ApplicationAnswer>("/api/profile/answers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),
  updateApplicationAnswer: (id: number, data: Partial<import("@/types").ApplicationAnswer>) =>
    request<import("@/types").ApplicationAnswer>(`/api/profile/answers/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),
  deleteApplicationAnswer: (id: number) =>
    request<{ message: string }>(`/api/profile/answers/${id}`, { method: "DELETE" }),
  deleteMyData: () => request<{ message: string }>("/api/account/data", { method: "DELETE" }),

  // Activity
  getActivity: () => request<import("@/types").ActivityEntry[]>("/api/activity/"),
  clearActivity: () => request<{ message: string }>("/api/activity/", { method: "DELETE" }),

  // Reminders
  getReminders: () => request<import("@/types").JobApplication[]>("/api/jobs/reminders"),

  // History
  getResumeHistory: () => request<import("@/types").ResumeHistoryEntry[]>("/api/resume/history"),
  getMatchHistory: () => request<import("@/types").MatchHistoryEntry[]>("/api/match/history"),
  getCoverLetterHistory: () => request<import("@/types").CoverLetterHistoryEntry[]>("/api/cover-letter/history"),

  // Resume
  analyzeResumeFile: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<{ filename: string; resume_text: string; analysis: import("@/types").ResumeAnalysis }>(
      "/api/resume/analyze", { method: "POST", body: form }
    );
  },
  generateResumeOnlyBullets: (resume_text: string) =>
    request<{ bullets: string[] }>("/api/resume/bullets", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resume_text }),
    }),
  generateResumeOnlyInterviewQuestions: (resume_text: string) =>
    request<{ questions: { question: string; type: string; suggested_answer: string }[] }>(
      "/api/resume/interview-questions", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resume_text }),
      }
    ),

  // Jobs
  getStats: () => request<import("@/types").JobStats>("/api/jobs/stats/summary"),
  listJobs: (status?: string) => {
    const qs = status ? `?status=${encodeURIComponent(status)}` : "";
    return request<import("@/types").JobApplication[]>(`/api/jobs${qs}`);
  },
  createJob: (data: Omit<import("@/types").JobApplication, "id" | "created_at">) =>
    request<import("@/types").JobApplication>("/api/jobs/", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
    }),
  updateJob: (id: number, data: Partial<import("@/types").JobApplication>) =>
    request<import("@/types").JobApplication>(`/api/jobs/${id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
    }),
  deleteJob: (id: number) => request<{ message: string }>(`/api/jobs/${id}`, { method: "DELETE" }),
  generateFollowUpEmail: (id: number) =>
    request<{ subject: string; body: string }>(`/api/jobs/${id}/follow-up-email`, { method: "POST" }),
  parseJobPosting: (rawText: string) =>
    request<import("@/types").JobPostingParseResult>("/api/jobs/parse", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ raw_text: rawText }),
    }),
  generateNegotiationAdvice: (id: number) =>
    request<import("@/types").NegotiationAdvice>(`/api/jobs/${id}/negotiate`, { method: "POST" }),
  // Save Job / Add to Tracker / Mark as Contacted from a published CRM/ATS
  // job — idempotent, updates the existing tracker row if already saved.
  saveExternalJob: (jobRequirementId: number, status?: string, applicationMethod?: string) =>
    request<import("@/types").JobApplication>("/api/jobs/from-external", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        job_requirement_id: jobRequirementId,
        status: status || "Saved",
        application_method: applicationMethod,
      }),
    }),
  markApplied: (jobApplicationId: number) =>
    request<import("@/types").JobApplication>(`/api/jobs/${jobApplicationId}/mark-applied`, { method: "POST" }),
  loadDemoJobs: () => request<{ message: string; companies: string[] }>("/api/jobs/demo", { method: "POST" }),

  // Application Status
  listApplicationStatus: (params?: Record<string, string | number | boolean | undefined | null>) =>
    request<import("@/types").ApplicationStatusListResponse>(
      `/api/applications/status${qs(params)}`,
    ),
  getApplicationDetail: (id: number) =>
    request<import("@/types").ApplicationStatusDetail>(`/api/applications/${id}`),
  changeApplicationStatus: (
    id: number,
    data: { status: string; note?: string; effective_date?: string; confirmed?: boolean },
  ) =>
    request<import("@/types").ApplicationStatusDetail>(`/api/applications/${id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),
  archiveApplication: (id: number) =>
    request<{ message: string; id: number }>(`/api/applications/${id}/archive`, { method: "POST" }),
  createApplicationNote: (id: number, content: string) =>
    request<import("@/types").ApplicationNote>(`/api/applications/${id}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    }),
  updateApplicationNote: (id: number, noteId: number, content: string) =>
    request<import("@/types").ApplicationNote>(`/api/applications/${id}/notes/${noteId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    }),
  deleteApplicationNote: (id: number, noteId: number) =>
    request<{ message: string }>(`/api/applications/${id}/notes/${noteId}`, { method: "DELETE" }),
  updateApplicationReminder: (
    id: number,
    data: {
      follow_up_date?: string | null;
      reminder_type?: string | null;
      completed?: boolean;
      snooze_days?: number;
    },
  ) =>
    request<import("@/types").JobApplication>(`/api/applications/${id}/reminder`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),
  clearAllJobs: () => request<{ message: string }>("/api/jobs/all", { method: "DELETE" }),
  bulkDeleteJobs: (ids: number[]) =>
    request<{ message: string }>("/api/jobs/bulk", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    }),

  // Match
  matchJob: (
    resume_text: string,
    job_description: string,
    opts?: { company_name?: string; job_requirement_id?: number }
  ) =>
    request<import("@/types").MatchResult>("/api/match/", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resume_text, job_description, ...opts }),
    }),
  // CRM/ATS → JobLens job publishing surface — no Clerk token, same
  // guest/user auth as the rest of the public app.
  listPublicJobs: (params?: import("@/types").PublicJobListParams) =>
    request<import("@/types").PublicJobListResponse>(
      `/api/integrations/joblens/jobs/${qs(params as Record<string, string | number | boolean | undefined> | undefined)}`
    ),
  getPublicJob: (id: number) =>
    request<import("@/types").JobRequirement>(`/api/integrations/joblens/jobs/${id}`),
  generateResumeBullets: (resume_text: string, job_description: string) =>
    request<{ bullets: string[] }>("/api/match/resume-bullets", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resume_text, job_description }),
    }),
  createInterviewQuestions: (resume_text: string, job_description: string) =>
    request<{ questions: { question: string; type: string; suggested_answer: string }[] }>(
      "/api/match/interview-questions", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resume_text, job_description }),
      }
    ),

  // Cover Letter
  generateCoverLetter: (resume_text: string, job_description: string, company_name?: string, tone?: string) =>
    request<{ cover_letter: string }>("/api/cover-letter/", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resume_text, job_description, company_name, tone }),
    }),

  // Candidates (ATS — Employee entity; /api/candidates aliases /api/employees)
  getCandidates: (params?: import("@/types").EmployeeListParams) =>
    request<import("@/types").EmployeeListResponse>(
      `/api/candidates/${qs(params as Record<string, string | number | boolean | undefined> | undefined)}`
    ),
  getCandidate: (id: number) => request<import("@/types").Employee>(`/api/candidates/${id}`),
  createCandidate: (data: import("@/types").EmployeeCreate, opts?: { forceNew?: boolean }) =>
    request<import("@/types").Employee>(`/api/candidates/${opts?.forceNew ? "?force_new=true" : ""}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
    }),
  updateCandidate: (id: number, data: import("@/types").EmployeeUpdate) =>
    request<import("@/types").Employee>(`/api/candidates/${id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
    }),
  updateCandidateStatus: (id: number, status: string) =>
    request<import("@/types").Employee>(`/api/candidates/${id}/status`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }),
    }),
  deleteCandidate: (id: number) => request<{ message: string }>(`/api/candidates/${id}`, { method: "DELETE" }),
  checkCandidateDuplicates: (body: { email?: string | null; phone?: string | null; name?: string | null; exclude_id?: number }) =>
    request<import("@/types").CandidateDuplicateCheckResponse>("/api/candidates/check-duplicates", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }),
  getCandidateCounts: (id: number) =>
    request<import("@/types").CandidateCounts>(`/api/candidates/${id}/counts`),
  getCandidateMatches: (id: number) =>
    request<Record<string, unknown>[]>(`/api/candidates/${id}/matches`),
  runCandidateMatches: (id: number, body?: { job_ids?: number[]; save?: boolean; min_score?: number }) =>
    request<Record<string, unknown>[]>(`/api/candidates/${id}/matches`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}),
    }),
  getCandidateSubmissions: (id: number) =>
    request<Record<string, unknown>[]>(`/api/candidates/${id}/submissions`),
  getCandidateInterviews: (id: number) =>
    request<Record<string, unknown>[]>(`/api/candidates/${id}/interviews`),
  getCandidateOffers: (id: number) =>
    request<Record<string, unknown>[]>(`/api/candidates/${id}/offers`),
  getCandidateActivities: (id: number) =>
    request<Record<string, unknown>[]>(`/api/candidates/${id}/activities`),
  parseCandidateResume: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<import("@/types").EmployeeResumeParsed>(`/api/candidates/parse-resume`, { method: "POST", body: form });
  },
  uploadCandidateResume: (candidateId: number, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<import("@/types").ResumeUploadResult>(`/api/candidates/${candidateId}/resumes`, {
      method: "POST", body: form,
    });
  },
  getCandidateResumes: (candidateId: number) =>
    request<import("@/types").EmployeeResume[]>(`/api/candidates/${candidateId}/resumes`),
  reparseCandidateResume: (candidateId: number, resumeId: number) =>
    request<import("@/types").ResumeUploadResult>(`/api/candidates/${candidateId}/resumes/${resumeId}/reparse`, { method: "POST" }),

  // Employees (ATS — backward-compatible aliases)
  getEmployees: (params?: import("@/types").EmployeeListParams) =>
    request<import("@/types").EmployeeListResponse>(
      `/api/employees/${qs(params as Record<string, string | number | boolean | undefined> | undefined)}`
    ),
  getEmployee: (id: number) => request<import("@/types").Employee>(`/api/employees/${id}`),
  createEmployee: (data: import("@/types").EmployeeCreate) =>
    request<import("@/types").Employee>("/api/employees/", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
    }),
  updateEmployee: (id: number, data: import("@/types").EmployeeUpdate) =>
    request<import("@/types").Employee>(`/api/employees/${id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
    }),
  updateEmployeeStatus: (id: number, status: string) =>
    request<import("@/types").Employee>(`/api/employees/${id}/status`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }),
    }),
  deleteEmployee: (id: number) => request<{ message: string }>(`/api/employees/${id}`, { method: "DELETE" }),
  parseEmployeeResume: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<import("@/types").EmployeeResumeParsed>(`/api/employees/parse-resume`, { method: "POST", body: form });
  },

  // Employee Resumes (ATS — private)
  uploadEmployeeResume: (employeeId: number, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<import("@/types").ResumeUploadResult>(`/api/employees/${employeeId}/resumes`, {
      method: "POST", body: form,
    });
  },
  getEmployeeResumes: (employeeId: number) =>
    request<import("@/types").EmployeeResume[]>(`/api/employees/${employeeId}/resumes`),
  getLatestEmployeeResume: (employeeId: number) =>
    request<import("@/types").EmployeeResume>(`/api/employees/${employeeId}/resume/latest`),
  deleteEmployeeResume: (employeeId: number, resumeId: number) =>
    request<{ message: string }>(`/api/employees/${employeeId}/resumes/${resumeId}`, { method: "DELETE" }),
  setPrimaryEmployeeResume: (employeeId: number, resumeId: number) =>
    request<import("@/types").EmployeeResume>(`/api/employees/${employeeId}/resumes/${resumeId}/primary`, { method: "POST" }),
  reparseEmployeeResume: (employeeId: number, resumeId: number) =>
    request<import("@/types").ResumeUploadResult>(`/api/employees/${employeeId}/resumes/${resumeId}/reparse`, { method: "POST" }),
  applyResumeSuggestions: (employeeId: number, resumeId: number, fields: Record<string, string>) =>
    request<import("@/types").Employee>(`/api/employees/${employeeId}/resumes/${resumeId}/apply-suggestions`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fields }),
    }),
  // Authenticated download: fetch as blob (Authorization header required), then
  // trigger a browser download so resume files are never publicly linkable.
  downloadEmployeeResume: async (employeeId: number, resumeId: number, filename: string) => {
    const base =
      process.env.NEXT_PUBLIC_API_URL?.trim().replace(/\/$/, "").replace(/\/api\/?$/i, "") ||
      (typeof window !== "undefined" && window.location.hostname === "localhost" ? "http://localhost:8000" : "");
    const token = await getClerkToken();
    const res = await fetch(`${base}/api/employees/${employeeId}/resumes/${resumeId}/download`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      credentials: "include",
    });
    if (!res.ok) throw new Error("Failed to download resume.");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },

  // Job Requirements (ATS — private)
  getJobRequirements: (params?: import("@/types").JobRequirementListParams) =>
    request<import("@/types").JobRequirementListResponse>(
      `/api/job-requirements/${qs(params as Record<string, string | number | boolean | undefined> | undefined)}`
    ),
  getJobRequirement: (id: number) => request<import("@/types").JobRequirement>(`/api/job-requirements/${id}`),
  getJobEmployeeMatches: (jobId: number, minScore?: number) =>
    request<import("@/types").JobEmployeeMatch[]>(
      `/api/job-requirements/${jobId}/matches${minScore != null ? `?min_score=${minScore}` : ""}`
    ),
  getJobCandidates: (jobId: number) =>
    request<import("@/types").JobCandidateItem[]>(`/api/job-requirements/${jobId}/candidates`),
  updateJobStatus: (jobId: number, status: string) =>
    request<import("@/types").JobRequirement>(`/api/job-requirements/${jobId}/status`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }),
    }),
  getJobSends: (params?: { job_requirement_id?: number; employee_id?: number; employee_response?: string; delivery_status?: string }) =>
    request<import("@/types").JobSend[]>(`/api/job-sends/${qs(params)}`),
  getJobSendDraft: (jobRequirementId: number, employeeId: number) =>
    request<import("@/types").JobSendDraft>(
      `/api/job-sends/draft${qs({ job_requirement_id: jobRequirementId, employee_id: employeeId })}`,
      { method: "POST" },
    ),
  createJobSend: (jobRequirementId: number, data: { employee_id: number; message_subject?: string; message_body?: string; mark_sent?: boolean; notes?: string }) =>
    request<import("@/types").JobSend>(`/api/job-sends/${qs({ job_requirement_id: jobRequirementId })}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),
  updateJobSend: (id: number, data: { message_subject?: string; message_body?: string; delivery_status?: string; employee_response?: string; notes?: string }) =>
    request<import("@/types").JobSend>(`/api/job-sends/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),

  getPipeline: async (params?: import("@/types").PipelineListParams) => {
    const data = await request<import("@/types").SubmissionListResponse | import("@/types").Submission[]>(
      `/api/pipeline/${qs(params as Record<string, string | number | boolean | undefined | null> | undefined)}`,
    );
    return normalizeSubmissionList(data);
  },
  getPipelineSummary: () =>
    request<import("@/types").PipelineSummaryCounts>("/api/pipeline/summary"),
  getPipelineRecord: (id: number) =>
    request<import("@/types").Submission>(`/api/pipeline/${id}`),
  createPipeline: (data: import("@/types").SubmissionCreate) =>
    request<import("@/types").Submission>("/api/pipeline/", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
    }),
  updatePipeline: (id: number, data: import("@/types").SubmissionUpdate) =>
    request<import("@/types").Submission>(`/api/pipeline/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
    }),
  changePipelineStage: (id: number, data: import("@/types").PipelineStageUpdate) =>
    request<import("@/types").Submission>(`/api/pipeline/${id}/stage`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
    }),
  placePipeline: (id: number, data?: {
    confirmed?: boolean;
    start_date?: string | null;
    final_rate?: string | null;
    fill_job?: boolean;
    offer_id?: number | null;
    override_reason?: string | null;
  }) =>
    request<import("@/types").Submission>(`/api/pipeline/${id}/place`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data ?? { confirmed: true }),
    }),
  rejectPipeline: (id: number, data: { reason: string; notes?: string | null; stage?: string }) =>
    request<import("@/types").Submission>(`/api/pipeline/${id}/reject`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
    }),
  withdrawPipeline: (id: number, data: { reason: string; notes?: string | null; effective_date?: string | null }) =>
    request<import("@/types").Submission>(`/api/pipeline/${id}/withdraw`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
    }),
  getPipelineActivities: (id: number) =>
    request<import("@/types").CRMActivity[]>(`/api/pipeline/${id}/activities`),
  createPipelineFollowUp: (id: number, data: import("@/types").CRMActivityCreate) =>
    request<import("@/types").CRMActivity>(`/api/pipeline/${id}/follow-ups`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
    }),
  getPipelineInterviews: (id: number) =>
    request<import("@/types").Interview[]>(`/api/pipeline/${id}/interviews`),
  createPipelineInterview: (id: number, data: Omit<import("@/types").InterviewCreate, "submission_id">) =>
    request<import("@/types").Interview>(`/api/pipeline/${id}/interviews`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
    }),
  getPipelineOffer: (id: number) =>
    request<import("@/types").Offer | null>(`/api/pipeline/${id}/offer`),
  createPipelineOffer: (id: number, data: Omit<import("@/types").OfferCreate, "submission_id">) =>
    request<import("@/types").Offer>(`/api/pipeline/${id}/offer`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
    }),

  /** @deprecated Prefer getPipeline — returns items array for backward compatibility. */
  getSubmissions: async (params?: {
    job_requirement_id?: number;
    employee_id?: number;
    status?: string;
    active_only?: boolean;
  }) => {
    const res = await api.getPipeline(params);
    return res.items;
  },
  getSubmission: (id: number) => request<import("@/types").Submission>(`/api/pipeline/${id}`),
  createSubmission: (data: import("@/types").SubmissionCreate) =>
    request<import("@/types").Submission>("/api/pipeline/", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
    }),
  createSubmissionFromJobSend: (sendId: number) =>
    request<import("@/types").Submission>(`/api/pipeline/from-job-send/${sendId}`, { method: "POST" }),
  updateSubmission: (id: number, data: import("@/types").SubmissionUpdate) =>
    request<import("@/types").Submission>(`/api/pipeline/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
    }),

  getInterviews: (params?: { submission_id?: number; job_requirement_id?: number; status?: string }) =>
    request<import("@/types").Interview[]>(`/api/interviews/${qs(params)}`),
  createInterview: (data: import("@/types").InterviewCreate) =>
    request<import("@/types").Interview>("/api/interviews/", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
    }),
  updateInterview: (id: number, data: import("@/types").InterviewUpdate) =>
    request<import("@/types").Interview>(`/api/interviews/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
    }),

  getOffers: (params?: { submission_id?: number; job_requirement_id?: number; status?: string }) =>
    request<import("@/types").Offer[]>(`/api/offers/${qs(params)}`),
  createOffer: (data: import("@/types").OfferCreate) =>
    request<import("@/types").Offer>("/api/offers/", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
    }),
  updateOffer: (id: number, data: import("@/types").OfferUpdate) =>
    request<import("@/types").Offer>(`/api/offers/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
    }),

  createJobRequirement: (data: import("@/types").JobRequirementCreate) =>
    request<import("@/types").JobRequirement>("/api/job-requirements/", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
    }),
  updateJobRequirement: (id: number, data: import("@/types").JobRequirementUpdate) =>
    request<import("@/types").JobRequirement>(`/api/job-requirements/${id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
    }),
  deleteJobRequirement: (id: number, confirm: boolean) =>
    request<{ message: string }>(`/api/job-requirements/${id}${qs({ confirm })}`, { method: "DELETE" }),
  parseJobRequirement: (rawText: string) =>
    request<import("@/types").JobRequirementParseResult>("/api/job-requirements/parse", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ raw_text: rawText }),
    }),

  getAtsDashboardStats: () =>
    request<import("@/types").AtsDashboardStats>("/api/ats/dashboard"),

  // Unified Recruitment CRM + ATS dashboard
  getDashboardSummary: () =>
    request<import("@/types").DashboardSummaryResponse>("/api/dashboard/summary"),

  // ATS staff access / role management
  getAtsMe: () =>
    request<{
      user_id: string | null;
      email: string | null;
      display_name: string | null;
      role: "admin" | "recruiter" | "manager" | "read_only";
      role_source: string;
      organization_name: string | null;
      can_write: boolean;
      is_admin: boolean;
      has_ats_access: boolean;
    }>("/api/ats/me"),
  listAtsStaffUsers: () =>
    request<
      Array<{
        id: number;
        clerk_user_id: string;
        email: string | null;
        display_name: string | null;
        role: string;
        organization_name: string | null;
        role_updated_at: string | null;
        role_updated_by: string | null;
        last_seen_at: string | null;
        created_at: string | null;
      }>
    >("/api/ats/users"),
  createAtsStaffUser: (data: {
    clerk_user_id: string;
    role: "admin" | "recruiter" | "manager" | "read_only";
    email?: string;
    display_name?: string;
    organization_name?: string;
  }) =>
    request("/api/ats/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),
  updateAtsStaffRole: (
    clerkUserId: string,
    data: {
      role: "admin" | "recruiter" | "manager" | "read_only";
      email?: string;
      display_name?: string;
      organization_name?: string;
    },
  ) =>
    request(`/api/ats/users/${encodeURIComponent(clerkUserId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),

  // Zoho Mail (ATS — private)
  getZohoConnection: () =>
    request<import("@/types").ZohoConnectionStatus>("/api/zoho/connection"),
  getZohoAuthorizeUrl: () =>
    request<{ authorize_url: string }>("/api/zoho/oauth/authorize"),
  completeZohoOAuth: (code: string, state: string) =>
    request<import("@/types").ZohoConnectionStatus>("/api/zoho/oauth/callback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, state }),
    }),
  disconnectZoho: () =>
    request<import("@/types").ZohoConnectionStatus>("/api/zoho/connection", { method: "DELETE" }),
  syncZohoMail: () =>
    request<import("@/types").ZohoSyncResponse>("/api/zoho/sync", { method: "POST" }),
  getImportedEmails: (params?: { classification?: string; needs_review?: boolean; import_status?: string; q?: string; limit?: number }) =>
    request<import("@/types").ImportedEmail[]>(`/api/zoho/emails${qs(params)}`),
  getImportedEmail: (id: number) =>
    request<import("@/types").ImportedEmailDetail>(`/api/zoho/emails/${id}`),
  classifyImportedEmail: (id: number) =>
    request<import("@/types").EmailClassificationResult>(`/api/zoho/emails/${id}/classify`, { method: "POST" }),
  classifyUnclassifiedEmails: (limit?: number) =>
    request<import("@/types").EmailClassifyBatchResult>(
      `/api/zoho/emails/classify-unclassified${qs({ limit })}`,
      { method: "POST" },
    ),
  parseImportedEmail: (id: number) =>
    request<import("@/types").JobRequirementParseResult>(`/api/zoho/emails/${id}/parse`, { method: "POST" }),
  createJobFromEmail: (id: number, data: import("@/types").JobRequirementCreate) =>
    request<import("@/types").CreateJobFromEmailResult>(`/api/zoho/emails/${id}/create-job`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),
  updateImportedEmail: (id: number, data: { classification?: string; needs_review?: boolean }) =>
    request<import("@/types").ImportedEmail>(`/api/zoho/emails/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),
  linkEmailToJob: (id: number, jobRequirementId: number) =>
    request<import("@/types").CreateJobFromEmailResult>(`/api/zoho/emails/${id}/link-job`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ job_requirement_id: jobRequirementId }),
    }),
  ignoreImportedEmail: (id: number) =>
    request<import("@/types").ImportedEmail>(`/api/zoho/emails/${id}/ignore`, { method: "POST" }),
  archiveImportedEmail: (id: number) =>
    request<import("@/types").ImportedEmail>(`/api/zoho/emails/${id}/archive`, { method: "POST" }),

  // Companies / Organizations (ATS — Unified Contacts; /api/companies aliases /api/crm/organizations)
  getCompanies: (params?: import("@/types").CRMOrganizationListParams) =>
    request<import("@/types").CRMOrganizationListResponse>(
      `/api/companies/${qs(params as Record<string, string | number | boolean | undefined> | undefined)}`
    ),
  getCompany: (id: number) =>
    request<import("@/types").CRMOrganization>(`/api/companies/${id}`),
  createCompany: (data: import("@/types").CRMOrganizationCreate, opts?: { forceNew?: boolean }) =>
    request<import("@/types").CRMOrganization>(`/api/companies/${opts?.forceNew ? "?force_new=true" : ""}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
    }),
  updateCompany: (id: number, data: import("@/types").CRMOrganizationUpdate) =>
    request<import("@/types").CRMOrganization>(`/api/companies/${id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
    }),
  updateCompanyStatus: (id: number, status: string) =>
    request<import("@/types").CRMOrganization>(`/api/companies/${id}/status`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }),
    }),
  deleteCompany: (id: number) =>
    request<{ message: string }>(`/api/companies/${id}`, { method: "DELETE" }),
  checkCompanyDuplicates: (body: {
    organization_name?: string | null;
    website?: string | null;
    email_domain?: string | null;
    exclude_id?: number;
  }) =>
    request<import("@/types").CompanyDuplicateCheckResponse>("/api/companies/check-duplicates", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }),
  getCompanyContacts: (id: number) =>
    request<import("@/types").CRMContact[]>(`/api/companies/${id}/contacts`),
  linkCompanyContact: (companyId: number, contactId: number) =>
    request<import("@/types").CRMContact>(`/api/companies/${companyId}/contacts`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contact_id: contactId }),
    }),
  unlinkCompanyContact: (companyId: number, contactId: number) =>
    request<{ message: string }>(`/api/companies/${companyId}/contacts/${contactId}`, { method: "DELETE" }),
  getCompanyJobs: (id: number) =>
    request<import("@/types").JobRequirement[]>(`/api/companies/${id}/jobs`),
  getCompanyPipeline: (id: number) =>
    request<import("@/types").Submission[]>(`/api/companies/${id}/pipeline`),
  getCompanyActivities: (id: number) =>
    request<import("@/types").CRMActivity[]>(`/api/companies/${id}/activities`),

  // Legacy aliases
  getOrganizations: (params?: import("@/types").CRMOrganizationListParams) =>
    request<import("@/types").CRMOrganizationListResponse>(
      `/api/companies/${qs(params as Record<string, string | number | boolean | undefined> | undefined)}`
    ),
  getOrganization: (id: number) =>
    request<import("@/types").CRMOrganization>(`/api/companies/${id}`),
  createOrganization: (data: import("@/types").CRMOrganizationCreate, opts?: { forceNew?: boolean }) =>
    request<import("@/types").CRMOrganization>(`/api/companies/${opts?.forceNew ? "?force_new=true" : ""}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
    }),
  updateOrganization: (id: number, data: import("@/types").CRMOrganizationUpdate) =>
    request<import("@/types").CRMOrganization>(`/api/companies/${id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
    }),
  deleteOrganization: (id: number) =>
    request<{ message: string }>(`/api/companies/${id}`, { method: "DELETE" }),
  getCrmOrganizations: (params?: import("@/types").CRMOrganizationListParams) =>
    request<import("@/types").CRMOrganizationListResponse>(
      `/api/companies/${qs(params as Record<string, string | number | boolean | undefined> | undefined)}`
    ),

  // Contacts / People (ATS — Unified Contacts; /api/contacts aliases /api/crm/contacts)
  getContacts: (params?: import("@/types").CRMContactListParams) =>
    request<import("@/types").CRMContactListResponse>(
      `/api/contacts/${qs(params as Record<string, string | number | boolean | undefined> | undefined)}`
    ),
  getContact: (id: number) => request<import("@/types").CRMContact>(`/api/contacts/${id}`),
  createContact: (data: import("@/types").CRMContactCreate, opts?: { forceNew?: boolean }) =>
    request<import("@/types").CRMContact>(`/api/contacts/${opts?.forceNew ? "?force_new=true" : ""}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
    }),
  updateContact: (id: number, data: import("@/types").CRMContactUpdate) =>
    request<import("@/types").CRMContact>(`/api/contacts/${id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
    }),
  updateContactStatus: (id: number, status: string) =>
    request<import("@/types").CRMContact>(`/api/contacts/${id}/status`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }),
    }),
  deleteContact: (id: number) => request<{ message: string }>(`/api/contacts/${id}`, { method: "DELETE" }),
  checkContactDuplicates: (body: {
    email?: string | null;
    phone?: string | null;
    exclude_id?: number;
  }) =>
    request<import("@/types").ContactDuplicateCheckResponse>("/api/contacts/check-duplicates", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }),
  markContacted: (id: number, data: import("@/types").MarkContactedPayload) =>
    request<import("@/types").CRMContact>(`/api/contacts/${id}/mark-contacted`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
    }),
  getContactJobs: (id: number) =>
    request<import("@/types").JobRequirement[]>(`/api/contacts/${id}/jobs`),
  getContactPipeline: (id: number) =>
    request<import("@/types").Submission[]>(`/api/contacts/${id}/pipeline`),
  getContactActivities: (id: number) =>
    request<import("@/types").CRMActivity[]>(`/api/contacts/${id}/activities`),
  getCrmContacts: (params?: import("@/types").CRMContactListParams) =>
    request<import("@/types").CRMContactListResponse>(
      `/api/contacts/${qs(params as Record<string, string | number | boolean | undefined> | undefined)}`
    ),

  // CRM Activities (ATS — private)
  getActivities: (params?: { organization_id?: number | null; contact_id?: number | null; employee_id?: number | null; job_requirement_id?: number | null; activity_type?: string }) =>
    request<import("@/types").CRMActivity[]>(`/api/crm/activities/${qs(params)}`),
  createActivity: (data: import("@/types").CRMActivityCreate) =>
    request<import("@/types").CRMActivity>("/api/crm/activities/", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
    }),
  updateActivity: (id: number, data: Partial<import("@/types").CRMActivityCreate>) =>
    request<import("@/types").CRMActivity>(`/api/crm/activities/${id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
    }),
  deleteActivity: (id: number) => request<{ message: string }>(`/api/crm/activities/${id}`, { method: "DELETE" }),

  // Reports (Phase 7)
  getReportsOverview: (params?: import("@/types").ReportFilterParams) =>
    request<import("@/types").ReportEnvelope>(
      `/api/reports/overview${qs(params as Record<string, string | number | boolean | undefined> | undefined)}`,
    ),
  getReportsJobs: (params?: import("@/types").ReportFilterParams) =>
    request<import("@/types").ReportEnvelope>(
      `/api/reports/jobs${qs(params as Record<string, string | number | boolean | undefined> | undefined)}`,
    ),
  getReportsCandidates: (params?: import("@/types").ReportFilterParams) =>
    request<import("@/types").ReportEnvelope>(
      `/api/reports/candidates${qs(params as Record<string, string | number | boolean | undefined> | undefined)}`,
    ),
  getReportsPipeline: (params?: import("@/types").ReportFilterParams) =>
    request<import("@/types").ReportEnvelope>(
      `/api/reports/pipeline${qs(params as Record<string, string | number | boolean | undefined> | undefined)}`,
    ),
  getReportsContacts: (params?: import("@/types").ReportFilterParams) =>
    request<import("@/types").ReportEnvelope>(
      `/api/reports/contacts${qs(params as Record<string, string | number | boolean | undefined> | undefined)}`,
    ),
  getReportsActivity: (params?: import("@/types").ReportFilterParams) =>
    request<import("@/types").ReportEnvelope>(
      `/api/reports/activity${qs(params as Record<string, string | number | boolean | undefined> | undefined)}`,
    ),
  getReportsFollowUps: (params?: import("@/types").ReportFilterParams) =>
    request<import("@/types").ReportEnvelope>(
      `/api/reports/follow-ups${qs(params as Record<string, string | number | boolean | undefined> | undefined)}`,
    ),
  exportReport: async (
    reportType: import("@/types").ReportTab | string,
    params?: import("@/types").ReportFilterParams,
  ) => {
    const base = getApiBase();
    const token = (await getClerkToken(2000)) || (await waitForClerkToken({ attempts: 15, delayMs: 100, timeoutMs: 2000 }));
    if (!token) throw new Error("Your session has expired. Please sign in again.");
    const query = qs({
      ...(params as Record<string, string | number | boolean | undefined> | undefined),
      report_type: reportType,
      format: "csv",
    });
    const res = await fetch(`${base}/api/reports/export${query}`, {
      headers: { Authorization: `Bearer ${token}` },
      credentials: "include",
    });
    if (!res.ok) {
      const body = await res.text();
      let detail: unknown = body;
      try { detail = JSON.parse(body)?.detail ?? body; } catch { /* keep text */ }
      throw new ApiError(formatApiErrorDetail(detail, body || `Export failed: ${res.status}`), res.status, detail);
    }
    const blob = await res.blob();
    const cd = res.headers.get("Content-Disposition") || "";
    const match = /filename\*?=(?:UTF-8''|")?([^\";]+)/i.exec(cd);
    const filename = match
      ? decodeURIComponent(match[1].replace(/["']/g, ""))
      : `joblens_${String(reportType).replace(/-/g, "_")}_export.csv`;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
};

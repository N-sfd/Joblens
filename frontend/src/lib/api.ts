import { getGuestId } from "./guestId";
import { getClerkToken } from "./clerkToken";

/** Origin only (no /api). Avoids https://host/api + /api/jobs → /api/api/jobs (404). */
function normalizeOrigin(url: string): string {
  return url.trim().replace(/\/$/, "").replace(/\/api\/?$/i, "");
}

/** Base URL for FastAPI (no trailing slash). See README / .env.example for Vercel + Render. */
function getApiBase(): string {
  const nextPublic = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (nextPublic) return normalizeOrigin(nextPublic);
  if (typeof window !== "undefined") {
    if (window.location.hostname === "localhost") return "http://localhost:8000";
    return "";
  }
  const serverBackend = process.env.BACKEND_URL?.trim() || "http://localhost:8000";
  return normalizeOrigin(serverBackend);
}

const OWNED_PREFIXES = ["/api/jobs", "/api/resume", "/api/match", "/api/cover-letter", "/api/activity", "/api/auth", "/api/account","/api/profile"];

/** Build a query string (with leading `?`) from defined params; empty → "". */
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
  if (detail && typeof detail === "object" && "msg" in detail) {
    return String((detail as { msg: unknown }).msg);
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
const ATS_PREFIXES = ["/api/employees", "/api/job-requirements", "/api/crm", "/api/ats", "/api/zoho"];

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const base = getApiBase();
  const headers = new Headers(init?.headers);
  if (typeof window !== "undefined" && OWNED_PREFIXES.some((p) => path.startsWith(p))) {
    headers.set("X-Guest-Id", getGuestId());
  }
  if (typeof window !== "undefined" && ATS_PREFIXES.some((p) => path.startsWith(p))) {
    const token = await getClerkToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
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
    throw new Error(formatApiErrorDetail(detail, body || `Request failed: ${res.status}`));
  }
  return res.json();
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
  loadDemoJobs: () => request<{ message: string; companies: string[] }>("/api/jobs/demo", { method: "POST" }),
  clearAllJobs: () => request<{ message: string }>("/api/jobs/all", { method: "DELETE" }),
  bulkDeleteJobs: (ids: number[]) =>
    request<{ message: string }>("/api/jobs/bulk", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    }),

  // Match
  matchJob: (resume_text: string, job_description: string) =>
    request<import("@/types").MatchResult>("/api/match/", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resume_text, job_description }),
    }),
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

  // Employees (ATS — private, behind Clerk-protected /ats routes)
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
  createJobRequirement: (data: import("@/types").JobRequirementCreate) =>
    request<import("@/types").JobRequirement>("/api/job-requirements/", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
    }),
  updateJobRequirement: (id: number, data: import("@/types").JobRequirementUpdate) =>
    request<import("@/types").JobRequirement>(`/api/job-requirements/${id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
    }),
  deleteJobRequirement: (id: number) => request<{ message: string }>(`/api/job-requirements/${id}`, { method: "DELETE" }),
  parseJobRequirement: (rawText: string) =>
    request<import("@/types").JobRequirementParseResult>("/api/job-requirements/parse", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ raw_text: rawText }),
    }),

  getAtsDashboardStats: () =>
    request<import("@/types").AtsDashboardStats>("/api/ats/dashboard"),

  // CRM Organizations (ATS — private)
  getOrganizations: (params?: { type?: string; status?: string; q?: string; needs_review?: boolean }) =>
    request<import("@/types").CRMOrganization[]>(`/api/crm/organizations/${qs(params)}`),
  getOrganization: (id: number) =>
    request<import("@/types").CRMOrganization>(`/api/crm/organizations/${id}`),
  createOrganization: (data: import("@/types").CRMOrganizationCreate) =>
    request<import("@/types").CRMOrganization>("/api/crm/organizations/", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
    }),
  updateOrganization: (id: number, data: import("@/types").CRMOrganizationUpdate) =>
    request<import("@/types").CRMOrganization>(`/api/crm/organizations/${id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
    }),
  deleteOrganization: (id: number) =>
    request<{ message: string }>(`/api/crm/organizations/${id}`, { method: "DELETE" }),

  // CRM Contacts (ATS — private)
  getContacts: (params?: { organization_id?: number; contact_type?: string; status?: string; q?: string; needs_review?: boolean }) =>
    request<import("@/types").CRMContact[]>(`/api/crm/contacts/${qs(params)}`),
  getContact: (id: number) => request<import("@/types").CRMContact>(`/api/crm/contacts/${id}`),
  createContact: (data: import("@/types").CRMContactCreate) =>
    request<import("@/types").CRMContact>("/api/crm/contacts/", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
    }),
  updateContact: (id: number, data: import("@/types").CRMContactUpdate) =>
    request<import("@/types").CRMContact>(`/api/crm/contacts/${id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
    }),
  deleteContact: (id: number) => request<{ message: string }>(`/api/crm/contacts/${id}`, { method: "DELETE" }),

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
};

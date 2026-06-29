import { getGuestId } from "./guestId";

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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const base = getApiBase();
  const headers = new Headers(init?.headers);
  if (typeof window !== "undefined" && OWNED_PREFIXES.some((p) => path.startsWith(p))) {
    headers.set("X-Guest-Id", getGuestId());
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
    let detail = body;
    try { detail = JSON.parse(body)?.detail ?? body; } catch {}
    throw new Error(detail || `Request failed: ${res.status}`);
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

  // Employees (ATS — private, behind Clerk-protected /employees routes)
  getEmployees: () => request<import("@/types").Employee[]>("/api/employees/"),
  getEmployee: (id: number) => request<import("@/types").Employee>(`/api/employees/${id}`),
  createEmployee: (data: import("@/types").EmployeeCreate) =>
    request<import("@/types").Employee>("/api/employees/", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
    }),
  updateEmployee: (id: number, data: import("@/types").EmployeeUpdate) =>
    request<import("@/types").Employee>(`/api/employees/${id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
    }),
  deleteEmployee: (id: number) => request<{ message: string }>(`/api/employees/${id}`, { method: "DELETE" }),

  // Employee Resumes (ATS — private)
  uploadEmployeeResume: (employeeId: number, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<import("@/types").EmployeeResume>(`/api/employees/${employeeId}/resume`, {
      method: "POST", body: form,
    });
  },
  getEmployeeResumes: (employeeId: number) =>
    request<import("@/types").EmployeeResume[]>(`/api/employees/${employeeId}/resumes`),
  getLatestEmployeeResume: (employeeId: number) =>
    request<import("@/types").EmployeeResume>(`/api/employees/${employeeId}/resume/latest`),
  deleteEmployeeResume: (employeeId: number, resumeId: number) =>
    request<{ message: string }>(`/api/employees/${employeeId}/resumes/${resumeId}`, { method: "DELETE" }),

  // Job Requirements (ATS — private)
  getJobRequirements: () => request<import("@/types").JobRequirement[]>("/api/job-requirements/"),
  getJobRequirement: (id: number) => request<import("@/types").JobRequirement>(`/api/job-requirements/${id}`),
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
};

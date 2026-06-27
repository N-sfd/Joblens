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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const base = getApiBase();
  const headers = new Headers(init?.headers);
  if (path.startsWith("/api/jobs") && typeof window !== "undefined") {
    headers.set("X-Guest-Id", getGuestId());
  }
  let res: Response;
  try {
    res = await fetch(`${base}${path}`, { ...init, headers });
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
  // Resume
  analyzeResumeFile: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<{ filename: string; resume_text: string; analysis: import("@/types").ResumeAnalysis }>(
      "/api/resume/analyze", { method: "POST", body: form }
    );
  },

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
};

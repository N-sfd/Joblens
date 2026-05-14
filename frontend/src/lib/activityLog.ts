const KEY = "applypilot_activity_log";
const MAX = 30;

export type ActivityType =
  | "resume_analyzed"
  | "job_matched"
  | "job_saved"
  | "bullets_generated"
  | "questions_generated"
  | "cover_letter_generated"
  | "job_added"
  | "status_changed"
  | "job_deleted";

export interface ActivityEntry {
  id: string;
  timestamp: string;
  type: ActivityType;
  summary: string;
  detail?: string;
}

export function logActivity(entry: Omit<ActivityEntry, "id" | "timestamp">) {
  if (typeof window === "undefined") return;
  const existing = getLog();
  const newEntry: ActivityEntry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
    ...entry,
  };
  localStorage.setItem(KEY, JSON.stringify([newEntry, ...existing].slice(0, MAX)));
}

export function getLog(): ActivityEntry[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function clearLog() {
  if (typeof window !== "undefined") localStorage.removeItem(KEY);
}

/** Seeds realistic sample activity the first time the dashboard loads */
export function seedSampleActivity() {
  if (typeof window === "undefined" || getLog().length > 0) return;

  const H = 3_600_000;
  const D = 86_400_000;
  const now = Date.now();

  const samples: ActivityEntry[] = [
    {
      id: "seed-1",
      timestamp: new Date(now - 3 * D - 2 * H).toISOString(),
      type: "resume_analyzed",
      summary: "Analyzed resume — ATS Score: 78%",
      detail: "resume.pdf · Formatting: 82% · Content: 74%",
    },
    {
      id: "seed-2",
      timestamp: new Date(now - 2 * D - 5 * H).toISOString(),
      type: "job_matched",
      summary: "Matched against Meta — Senior Frontend Engineer — Score: 82%",
      detail: "Likelihood: high · Missing skills: GraphQL, Jest",
    },
    {
      id: "seed-3",
      timestamp: new Date(now - 2 * D - 4 * H).toISOString(),
      type: "bullets_generated",
      summary: "Generated 6 improved resume bullets for Meta role",
      detail: "Optimized for React, TypeScript, and performance keywords",
    },
    {
      id: "seed-4",
      timestamp: new Date(now - 2 * D - 3 * H).toISOString(),
      type: "job_saved",
      summary: "Saved Meta — Senior Frontend Engineer to Job Tracker",
      detail: "AI Match Score: 82% · Status: Interviewing",
    },
    {
      id: "seed-5",
      timestamp: new Date(now - D - 6 * H).toISOString(),
      type: "job_matched",
      summary: "Matched against Google — Software Engineer — Score: 75%",
      detail: "Likelihood: medium · Missing skills: Kubernetes, Go",
    },
    {
      id: "seed-6",
      timestamp: new Date(now - D - 4 * H).toISOString(),
      type: "cover_letter_generated",
      summary: "Generated cover letter for Google Software Engineer",
      detail: "Tone: professional",
    },
    {
      id: "seed-7",
      timestamp: new Date(now - D - 2 * H).toISOString(),
      type: "job_saved",
      summary: "Saved Google — Software Engineer to Job Tracker",
      detail: "AI Match Score: 75% · Status: Applied",
    },
    {
      id: "seed-8",
      timestamp: new Date(now - 5 * H).toISOString(),
      type: "questions_generated",
      summary: "Generated 8 interview questions for Stripe Senior Engineer",
      detail: "Types: behavioral, technical, situational",
    },
  ];

  localStorage.setItem(KEY, JSON.stringify(samples));
}

import type { ActivityEntry, ActivityType, JobApplication, JobStats } from "@/types";

export const STATUS_CHART_COLORS: Record<string, string> = {
  Applied: "#3b82f6",
  Interviewing: "#a855f7",
  Offer: "#22c55e",
  Rejected: "#ef4444",
  Saved: "#94a3b8",
};

const STATUS_ORDER = ["Applied", "Interviewing", "Offer", "Rejected", "Saved"];

export interface StatusSlice {
  name: string;
  value: number;
  color: string;
}

export function getStatusBreakdown(stats: JobStats | null): StatusSlice[] {
  if (!stats) return [];
  return STATUS_ORDER
    .map((name) => ({ name, value: stats.by_status[name] ?? 0, color: STATUS_CHART_COLORS[name] }))
    .filter((s) => s.value > 0);
}

export interface WeekBucket {
  label: string;
  count: number;
}

/** Buckets jobs into the last `weeks` calendar weeks (Mon–Sun) by date_applied (falls back to created_at). */
export function getWeeklyApplications(jobs: JobApplication[], weeks = 8): WeekBucket[] {
  const now = new Date();
  const startOfWeek = (d: Date) => {
    const day = d.getDay();
    const diff = (day === 0 ? -6 : 1) - day; // shift to Monday
    const monday = new Date(d);
    monday.setHours(0, 0, 0, 0);
    monday.setDate(monday.getDate() + diff);
    return monday;
  };

  const thisWeekStart = startOfWeek(now);
  const buckets: { start: Date; label: string; count: number }[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const start = new Date(thisWeekStart);
    start.setDate(start.getDate() - i * 7);
    buckets.push({
      start,
      label: start.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      count: 0,
    });
  }

  for (const job of jobs) {
    const raw = job.date_applied ?? job.created_at;
    if (!raw) continue;
    const d = new Date(raw);
    for (let i = buckets.length - 1; i >= 0; i--) {
      if (d >= buckets[i].start) {
        buckets[i].count += 1;
        break;
      }
    }
  }

  return buckets.map((b) => ({ label: b.label, count: b.count }));
}

export interface PipelineRates {
  totalApplied: number;
  interviewRate: number;
  offerRate: number;
  rejectionRate: number;
}

/** Rates are computed against jobs that have actually been applied to (excludes "Saved"). */
export function getPipelineRates(stats: JobStats | null): PipelineRates {
  if (!stats) return { totalApplied: 0, interviewRate: 0, offerRate: 0, rejectionRate: 0 };
  const saved = stats.by_status["Saved"] ?? 0;
  const totalApplied = stats.total - saved;
  if (totalApplied <= 0) return { totalApplied: 0, interviewRate: 0, offerRate: 0, rejectionRate: 0 };

  const interviewing = stats.by_status["Interviewing"] ?? 0;
  const offer = stats.by_status["Offer"] ?? 0;
  const rejected = stats.by_status["Rejected"] ?? 0;

  return {
    totalApplied,
    interviewRate: Math.round(((interviewing + offer) / totalApplied) * 100),
    offerRate: Math.round((offer / totalApplied) * 100),
    rejectionRate: Math.round((rejected / totalApplied) * 100),
  };
}

export const ACTIVITY_LABELS: Record<ActivityType, string> = {
  resume_analyzed: "Resume Analyzed",
  job_matched: "Job Matched",
  job_saved: "Job Saved",
  bullets_generated: "Bullets Generated",
  questions_generated: "Interview Questions",
  cover_letter_generated: "Cover Letters",
  job_added: "Jobs Added",
  status_changed: "Status Updates",
  job_deleted: "Jobs Deleted",
  negotiation_advice: "Negotiation Advice",
  job_imported: "ATS Jobs Imported",
  application_opened: "Applications Opened",
};

export const ACTIVITY_COLORS: Record<ActivityType, string> = {
  resume_analyzed: "#6366f1",
  job_matched: "#a855f7",
  job_saved: "#3b82f6",
  bullets_generated: "#10b981",
  questions_generated: "#f59e0b",
  cover_letter_generated: "#ec4899",
  job_added: "#22c55e",
  status_changed: "#64748b",
  job_deleted: "#ef4444",
  negotiation_advice: "#14b8a6",
  job_imported: "#6366f1",
  application_opened: "#3b82f6",
};

export interface ActivitySlice {
  type: ActivityType;
  label: string;
  count: number;
  color: string;
}

export function getActivityBreakdown(activity: ActivityEntry[]): ActivitySlice[] {
  const counts = new Map<ActivityType, number>();
  for (const entry of activity) {
    counts.set(entry.activity_type, (counts.get(entry.activity_type) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([type, count]) => ({ type, count, label: ACTIVITY_LABELS[type] ?? type, color: ACTIVITY_COLORS[type] ?? "#94a3b8" }))
    .sort((a, b) => b.count - a.count);
}

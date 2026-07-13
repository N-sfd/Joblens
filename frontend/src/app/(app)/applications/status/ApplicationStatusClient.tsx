"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import clsx from "clsx";
import {
  AlertCircle,
  Archive,
  Bell,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  ExternalLink,
  Filter,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  StickyNote,
  Trash2,
  X,
} from "lucide-react";
import { api } from "@/lib/api";
import type {
  ApplicationNote,
  ApplicationReadiness,
  ApplicationStatusDetail,
  ApplicationStatusListItem,
  ApplicationStatusListResponse,
  ApplicationStatusSummary,
  ProfileCompleteness,
} from "@/types";
import ErrorBanner from "@/components/ErrorBanner";
import { REMINDER_TYPES } from "@/lib/reminderTypes";

const STATUSES = [
  "Saved",
  "Application Opened",
  "Application In Progress",
  "Recruiter Contacted",
  "Applied",
  "Interviewing",
  "Offer",
  "Rejected",
  "Withdrawn",
] as const;

const STATUS_COLORS: Record<string, string> = {
  Saved: "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 ring-1 ring-slate-200 dark:ring-slate-700",
  "Application Opened": "bg-cyan-50 dark:bg-cyan-950/40 text-cyan-700 dark:text-cyan-400 ring-1 ring-cyan-200 dark:ring-cyan-900",
  "Application In Progress": "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 ring-1 ring-amber-200 dark:ring-amber-900",
  "Recruiter Contacted": "bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-400 ring-1 ring-teal-200 dark:ring-teal-900",
  Applied: "bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 ring-1 ring-blue-200 dark:ring-blue-900",
  Interviewing: "bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-400 ring-1 ring-purple-200 dark:ring-purple-900",
  Offer: "bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-400 ring-1 ring-green-200 dark:ring-green-900",
  Rejected: "bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-400 ring-1 ring-red-200 dark:ring-red-900",
  Withdrawn: "bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 ring-1 ring-slate-300 dark:ring-slate-600",
};

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  Saved: ["Application Opened", "Recruiter Contacted", "Applied", "Withdrawn"],
  "Application Opened": ["Application In Progress", "Applied", "Withdrawn"],
  "Application In Progress": ["Applied", "Withdrawn"],
  "Recruiter Contacted": ["Applied", "Interviewing", "Rejected", "Withdrawn"],
  Applied: ["Interviewing", "Offer", "Rejected", "Withdrawn"],
  Interviewing: ["Offer", "Rejected", "Withdrawn"],
  Offer: ["Rejected", "Withdrawn"],
  Rejected: [],
  Withdrawn: ["Saved"],
};

const DESTRUCTIVE_STATUSES = new Set(["Withdrawn", "Rejected"]);

const APPLICATION_METHODS = [
  { value: "employer_website", label: "Employer Website" },
  { value: "recruiter_email", label: "Recruiter Email" },
  { value: "manual", label: "Manual Entry" },
] as const;

const SORT_OPTIONS = [
  { value: "last_activity", label: "Last activity" },
  { value: "newest", label: "Newest application" },
  { value: "oldest", label: "Oldest application" },
  { value: "follow_up", label: "Follow-up date" },
  { value: "company", label: "Company" },
  { value: "role", label: "Job title" },
  { value: "status", label: "Status" },
] as const;

const FOLLOW_UP_OPTIONS = [
  { value: "", label: "Any follow-up" },
  { value: "upcoming", label: "Upcoming" },
  { value: "due_today", label: "Due today" },
  { value: "missed", label: "Missed" },
  { value: "completed", label: "Completed" },
  { value: "none", label: "None" },
] as const;

const PAGE_SIZE = 20;

function fmtDate(iso: string | null | undefined) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function fmtDateTime(iso: string | null | undefined) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function StatusPill({ status }: { status: string }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap",
        STATUS_COLORS[status] ?? "bg-slate-100 text-slate-600 ring-1 ring-slate-200",
      )}
    >
      {status}
    </span>
  );
}

function FieldRow({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-sm">
      <span className="text-slate-500 shrink-0">{label}</span>
      <span className="text-slate-800 dark:text-slate-200 font-medium min-w-0 break-words">{value}</span>
    </div>
  );
}

type MenuAction = {
  label: string;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
};

function OverflowMenu({ actions }: { actions: MenuAction[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  if (!actions.length) return null;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        aria-label="More actions"
        className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 dark:hover:text-slate-200 transition-colors"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        <MoreHorizontal size={16} />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-30 w-52 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg py-1">
          {actions.map((a) => (
            <button
              key={a.label}
              type="button"
              disabled={a.disabled}
              className={clsx(
                "w-full text-left px-3 py-2 text-sm transition-colors disabled:opacity-40",
                a.danger
                  ? "text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                  : "text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800",
              )}
              onClick={(e) => {
                e.stopPropagation();
                setOpen(false);
                a.onClick();
              }}
            >
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ApplicationStatusPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [data, setData] = useState<ApplicationStatusListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const [q, setQ] = useState("");
  const [qDraft, setQDraft] = useState("");
  const [status, setStatus] = useState(searchParams.get("status") || "");
  const [applicationMethod, setApplicationMethod] = useState("");
  const [sort, setSort] = useState("last_activity");
  const [actionNeeded, setActionNeeded] = useState(searchParams.get("action_needed") === "true");
  const [hasReminder, setHasReminder] = useState(false);
  const [followUpStatus, setFollowUpStatus] = useState(searchParams.get("follow_up_status") || "");
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [readiness, setReadiness] = useState<ApplicationReadiness | null>(null);
  const [completeness, setCompleteness] = useState<ProfileCompleteness | null>(null);

  const [detailId, setDetailId] = useState<number | null>(null);
  const [detail, setDetail] = useState<ApplicationStatusDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const [noteDraft, setNoteDraft] = useState("");
  const [noteSaving, setNoteSaving] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState<number | null>(null);
  const [editingNoteContent, setEditingNoteContent] = useState("");

  const [reminderDate, setReminderDate] = useState("");
  const [reminderType, setReminderType] = useState("follow_up_email");
  const [reminderBusy, setReminderBusy] = useState(false);

  const [actionBusy, setActionBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Sync deep-link params when URL changes (e.g. dashboard links)
  useEffect(() => {
    const s = searchParams.get("status") || "";
    const an = searchParams.get("action_needed") === "true";
    const fu = searchParams.get("follow_up_status") || "";
    setStatus(s);
    setActionNeeded(an);
    setFollowUpStatus(fu);
    setPage(1);
  }, [searchParams]);

  const showToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 3200);
  };

  const loadList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.listApplicationStatus({
        q: q || undefined,
        status: status || undefined,
        application_method: applicationMethod || undefined,
        sort,
        order: sort === "oldest" ? "asc" : "desc",
        action_needed: actionNeeded ? true : undefined,
        has_reminder: hasReminder ? true : undefined,
        follow_up_status: followUpStatus || undefined,
        page,
        page_size: PAGE_SIZE,
      });
      setData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load applications.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [q, status, applicationMethod, sort, actionNeeded, hasReminder, followUpStatus, page]);

  const loadReadiness = useCallback(async () => {
    try {
      const [r, c] = await Promise.all([
        api.getApplicationReadiness(),
        api.getProfileCompleteness(),
      ]);
      setReadiness(r);
      setCompleteness(c);
    } catch {
      // Non-blocking — tracking still works without readiness
    }
  }, []);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    void loadReadiness();
  }, [loadReadiness]);

  // Debounce search draft
  useEffect(() => {
    const t = window.setTimeout(() => {
      setQ(qDraft.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(t);
  }, [qDraft]);

  const openDetail = async (id: number) => {
    setDetailId(id);
    setDetail(null);
    setDetailError(null);
    setDetailLoading(true);
    setNoteDraft("");
    setEditingNoteId(null);
    setReminderDate("");
    setReminderType("follow_up_email");
    try {
      const d = await api.getApplicationDetail(id);
      setDetail(d);
      if (d.application.follow_up_date) {
        const iso = d.application.follow_up_date.slice(0, 10);
        setReminderDate(iso);
      }
      if (d.application.reminder_type) {
        setReminderType(d.application.reminder_type);
      }
    } catch (e) {
      setDetailError(e instanceof Error ? e.message : "Application not found.");
    } finally {
      setDetailLoading(false);
    }
  };

  const closeDetail = () => {
    setDetailId(null);
    setDetail(null);
    setDetailError(null);
  };

  const refreshDetail = async (id: number) => {
    try {
      const d = await api.getApplicationDetail(id);
      setDetail(d);
    } catch {
      /* keep existing detail */
    }
  };

  const changeStatus = async (
    id: number,
    newStatus: string,
    opts?: { note?: string },
  ) => {
    const needsConfirm =
      DESTRUCTIVE_STATUSES.has(newStatus) ||
      ((data?.items.find((i) => i.id === id)?.status === "Withdrawn" ||
        detail?.application.status === "Withdrawn") &&
        newStatus === "Saved");

    let confirmed = false;
    if (needsConfirm) {
      const ok = window.confirm(
        newStatus === "Saved"
          ? "Restore this withdrawn application to Saved?"
          : `Mark this application as ${newStatus}? This requires confirmation.`,
      );
      if (!ok) return;
      confirmed = true;
    }

    setActionBusy(true);
    try {
      await api.changeApplicationStatus(id, {
        status: newStatus,
        note: opts?.note,
        confirmed: confirmed || undefined,
      });
      showToast(`Status updated to ${newStatus}`);
      await loadList();
      if (detailId === id) await refreshDetail(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Status update failed.");
    } finally {
      setActionBusy(false);
    }
  };

  const archiveApp = async (id: number) => {
    if (!window.confirm("Archive this application? It will leave the active list.")) return;
    setActionBusy(true);
    try {
      await api.archiveApplication(id);
      showToast("Application archived");
      if (detailId === id) closeDetail();
      await loadList();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to archive.");
    } finally {
      setActionBusy(false);
    }
  };

  const saveNote = async () => {
    if (!detailId || !noteDraft.trim()) return;
    setNoteSaving(true);
    try {
      await api.createApplicationNote(detailId, noteDraft.trim());
      setNoteDraft("");
      showToast("Note added");
      await refreshDetail(detailId);
      await loadList();
    } catch (e) {
      setDetailError(e instanceof Error ? e.message : "Note save failed.");
    } finally {
      setNoteSaving(false);
    }
  };

  const saveEditedNote = async (note: ApplicationNote) => {
    if (!detailId || !editingNoteContent.trim()) return;
    setNoteSaving(true);
    try {
      await api.updateApplicationNote(detailId, note.id, editingNoteContent.trim());
      setEditingNoteId(null);
      setEditingNoteContent("");
      showToast("Note updated");
      await refreshDetail(detailId);
    } catch (e) {
      setDetailError(e instanceof Error ? e.message : "Note save failed.");
    } finally {
      setNoteSaving(false);
    }
  };

  const removeNote = async (noteId: number) => {
    if (!detailId) return;
    if (!window.confirm("Delete this note?")) return;
    try {
      await api.deleteApplicationNote(detailId, noteId);
      showToast("Note deleted");
      await refreshDetail(detailId);
    } catch (e) {
      setDetailError(e instanceof Error ? e.message : "Failed to delete note.");
    }
  };

  const updateReminder = async (payload: {
    follow_up_date?: string | null;
    reminder_type?: string | null;
    completed?: boolean;
    snooze_days?: number;
  }) => {
    if (!detailId) return;
    setReminderBusy(true);
    try {
      await api.updateApplicationReminder(detailId, payload);
      showToast(
        payload.completed
          ? "Reminder completed"
          : payload.snooze_days
            ? `Snoozed ${payload.snooze_days} days`
            : "Reminder updated",
      );
      await refreshDetail(detailId);
      await loadList();
    } catch (e) {
      setDetailError(e instanceof Error ? e.message : "Reminder update failed.");
    } finally {
      setReminderBusy(false);
    }
  };

  const summary: ApplicationStatusSummary | null = data?.summary ?? null;
  const items = data?.items ?? [];
  const totalPages = data?.total_pages ?? 1;
  const hasActiveFilters =
    Boolean(q || status || applicationMethod || followUpStatus || actionNeeded || hasReminder);

  const headerCounts = useMemo(() => {
    if (!summary) return [];
    return [
      { label: "Tracked", value: summary.total },
      { label: "Opened", value: summary.applications_opened },
      { label: "In progress", value: summary.applications_in_progress },
      { label: "Applied", value: summary.applied },
      { label: "Recruiter", value: summary.recruiter_contacts },
      { label: "Interviews", value: summary.interviews },
      { label: "Offers", value: summary.offers },
      { label: "Follow-ups due", value: summary.follow_ups_due },
    ];
  }, [summary]);

  const setStatusFilter = (next: string) => {
    setStatus((prev) => (prev === next ? "" : next));
    setPage(1);
  };

  const buildActions = (item: ApplicationStatusListItem): MenuAction[] => {
    const actions: MenuAction[] = [];
    const jobHref = item.source_job_requirement_id
      ? `/jobs/${item.source_job_requirement_id}`
      : item.job_url || null;

    const viewJob = () => {
      if (item.source_job_requirement_id) router.push(`/jobs/${item.source_job_requirement_id}`);
      else if (item.job_url) window.open(item.job_url, "_blank", "noopener,noreferrer");
    };

    switch (item.status) {
      case "Saved":
        if (jobHref) actions.push({ label: "View Job", onClick: viewJob });
        if (item.source_job_requirement_id) {
          actions.push({
            label: "Analyze Match",
            onClick: () => router.push(`/match?atsJob=${item.source_job_requirement_id}`),
          });
          actions.push({
            label: "Apply Now",
            onClick: () => router.push(`/jobs/${item.source_job_requirement_id}`),
            disabled: item.source_job_closed || !item.has_application_url,
          });
          actions.push({
            label: "Contact Recruiter",
            onClick: () => router.push(`/jobs/${item.source_job_requirement_id}`),
          });
        }
        actions.push({
          label: "Remove from Tracker",
          onClick: () => void archiveApp(item.id),
          danger: true,
        });
        break;
      case "Application Opened":
        if (item.job_url || item.has_application_url) {
          actions.push({
            label: "Open Application",
            onClick: () => item.job_url && window.open(item.job_url, "_blank", "noopener,noreferrer"),
            disabled: !item.job_url,
          });
        }
        actions.push({
          label: "Mark In Progress",
          onClick: () => void changeStatus(item.id, "Application In Progress"),
        });
        actions.push({
          label: "Mark as Applied",
          onClick: () => void changeStatus(item.id, "Applied"),
        });
        actions.push({
          label: "Set Reminder",
          onClick: () => void openDetail(item.id),
        });
        if (jobHref) actions.push({ label: "View Job", onClick: viewJob });
        break;
      case "Application In Progress":
        if (item.job_url) {
          actions.push({
            label: "Continue Application",
            onClick: () => window.open(item.job_url!, "_blank", "noopener,noreferrer"),
          });
        }
        actions.push({
          label: "Mark as Applied",
          onClick: () => void changeStatus(item.id, "Applied"),
        });
        actions.push({
          label: "Set Reminder",
          onClick: () => void openDetail(item.id),
        });
        actions.push({
          label: "Add Note",
          onClick: () => void openDetail(item.id),
        });
        if (jobHref) actions.push({ label: "View Job", onClick: viewJob });
        break;
      case "Recruiter Contacted":
        if (item.recruiter_email) {
          actions.push({
            label: "Create Follow-Up Email",
            onClick: () => {
              window.location.href = `mailto:${item.recruiter_email}?subject=${encodeURIComponent(`Follow-up: ${item.role} at ${item.company}`)}`;
            },
          });
          actions.push({
            label: "Copy Recruiter Email",
            onClick: () => {
              void navigator.clipboard.writeText(item.recruiter_email || "");
              showToast("Email copied");
            },
          });
        }
        actions.push({
          label: "Mark as Applied",
          onClick: () => void changeStatus(item.id, "Applied"),
        });
        actions.push({
          label: "Mark Interviewing",
          onClick: () => void changeStatus(item.id, "Interviewing"),
        });
        actions.push({
          label: "Set Reminder",
          onClick: () => void openDetail(item.id),
        });
        break;
      case "Applied":
        actions.push({
          label: "Add Follow-Up",
          onClick: () => void openDetail(item.id),
        });
        actions.push({
          label: "Mark Interviewing",
          onClick: () => void changeStatus(item.id, "Interviewing"),
        });
        actions.push({
          label: "Withdraw",
          onClick: () => void changeStatus(item.id, "Withdrawn"),
          danger: true,
        });
        actions.push({
          label: "Add Note",
          onClick: () => void openDetail(item.id),
        });
        if (jobHref) actions.push({ label: "View Job", onClick: viewJob });
        break;
      case "Interviewing":
        actions.push({
          label: "Add Interview",
          onClick: () => void openDetail(item.id),
        });
        actions.push({
          label: "Mark Offer",
          onClick: () => void changeStatus(item.id, "Offer"),
        });
        actions.push({
          label: "Mark Rejected",
          onClick: () => void changeStatus(item.id, "Rejected"),
          danger: true,
        });
        actions.push({
          label: "Withdraw",
          onClick: () => void changeStatus(item.id, "Withdrawn"),
          danger: true,
        });
        actions.push({
          label: "Add Note",
          onClick: () => void openDetail(item.id),
        });
        break;
      case "Offer":
        actions.push({
          label: "View Offer Notes",
          onClick: () => void openDetail(item.id),
        });
        actions.push({
          label: "Add Note",
          onClick: () => void openDetail(item.id),
        });
        break;
      case "Rejected":
        actions.push({
          label: "Archive",
          onClick: () => void archiveApp(item.id),
          danger: true,
        });
        actions.push({
          label: "Add Reflection Note",
          onClick: () => void openDetail(item.id),
        });
        actions.push({
          label: "Find Similar Jobs",
          onClick: () => router.push("/jobs/discover"),
        });
        break;
      case "Withdrawn":
        actions.push({
          label: "Archive",
          onClick: () => void archiveApp(item.id),
          danger: true,
        });
        actions.push({
          label: "Restore to Saved",
          onClick: () => void changeStatus(item.id, "Saved"),
        });
        break;
      default:
        break;
    }

    return actions;
  };

  const companyLine = (item: ApplicationStatusListItem) => {
    const parts = [item.company, item.client, item.end_client].filter(Boolean);
    const unique = [...new Set(parts)];
    return unique.join(" · ") || null;
  };

  return (
    <div className="p-4 sm:p-8 max-w-6xl mx-auto pb-24">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between mb-6">
        <div>
          <p className="page-kicker">Applications</p>
          <h1 className="page-title">Application Status</h1>
          <p className="page-subtitle">
            Detailed progress, reminders, and history for every application you track.
          </p>
          {summary && (
            <div className="flex flex-wrap gap-x-3 gap-y-1 mt-3 text-xs sm:text-sm text-slate-500">
              {headerCounts.map((c) => (
                <span key={c.label}>
                  <span className="font-semibold text-slate-700 dark:text-slate-200">{c.value}</span>{" "}
                  {c.label}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          <Link href="/jobs/discover" className="btn-secondary text-sm inline-flex items-center gap-1.5">
            <Search size={14} /> Discover Jobs
          </Link>
          <Link href="/jobs" className="btn-primary text-sm inline-flex items-center gap-1.5">
            <Plus size={14} /> Add Job Manually
          </Link>
          <Link href="/jobs" className="btn-secondary text-sm inline-flex items-center gap-1.5">
            <ClipboardList size={14} /> View Job Tracker
          </Link>
          <button
            type="button"
            onClick={() => {
              void loadList();
              void loadReadiness();
            }}
            className="btn-secondary text-sm inline-flex items-center gap-1.5"
            disabled={loading}
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : undefined} /> Refresh
          </button>
        </div>
      </div>

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white text-sm px-4 py-2.5 rounded-xl shadow-lg">
          {toast}
        </div>
      )}

      {/* Profile readiness */}
      {(readiness || completeness) && (
        <div className="card p-4 sm:p-5 mb-5 bg-gradient-to-br from-indigo-50/80 via-white to-white dark:from-indigo-950/30 dark:via-slate-900 dark:to-slate-900">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Profile readiness</p>
              <p className="text-sm text-slate-500 mt-0.5">
                {readiness && (
                  <>
                    Readiness:{" "}
                    <span
                      className={clsx(
                        "font-semibold",
                        readiness.status === "Ready" && "text-emerald-600",
                        readiness.status === "Mostly Ready" && "text-indigo-600",
                        readiness.status === "Needs Information" && "text-amber-600",
                        readiness.status === "Not Ready" && "text-slate-500",
                      )}
                    >
                      {readiness.status}
                    </span>
                    {typeof readiness.score === "number" && (
                      <span className="text-slate-400"> · score {readiness.score}</span>
                    )}
                  </>
                )}
                {completeness && (
                  <span className="block sm:inline sm:ml-2">
                    Completeness:{" "}
                    <span className="font-semibold text-slate-700 dark:text-slate-200">
                      {completeness.overall_percentage}%
                    </span>
                  </span>
                )}
              </p>
              {readiness && (
                <div className="flex flex-wrap gap-2 mt-2 text-xs">
                  <span
                    className={clsx(
                      "px-2 py-0.5 rounded-full ring-1",
                      readiness.checks?.resume_available
                        ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                        : "bg-slate-100 text-slate-500 ring-slate-200",
                    )}
                  >
                    Resume {readiness.checks?.resume_available ? "ready" : "needed"}
                  </span>
                  <span
                    className={clsx(
                      "px-2 py-0.5 rounded-full ring-1",
                      readiness.checks?.work_authorization_reviewed
                        ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                        : "bg-slate-100 text-slate-500 ring-slate-200",
                    )}
                  >
                    Work auth {readiness.checks?.work_authorization_reviewed ? "reviewed" : "needed"}
                  </span>
                  <span
                    className={clsx(
                      "px-2 py-0.5 rounded-full ring-1",
                      readiness.checks?.application_answers_available
                        ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                        : "bg-slate-100 text-slate-500 ring-slate-200",
                    )}
                  >
                    Answers {readiness.checks?.application_answers_available ? "reviewed" : "needed"}
                  </span>
                </div>
              )}
            </div>
            <Link href="/profile" className="btn-secondary text-sm shrink-0 self-start sm:self-center">
              Complete Profile
            </Link>
          </div>
        </div>
      )}

      {/* Summary status cards */}
      <div className="flex gap-3 overflow-x-auto pb-2 mb-5 -mx-1 px-1 snap-x">
        {STATUSES.map((s) => {
          const count = summary?.by_status?.[s] ?? 0;
          const pct = summary?.percentages?.[s] ?? 0;
          const active = status === s;
          return (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              className={clsx(
                "card snap-start shrink-0 w-[148px] p-3 text-left transition-all",
                active
                  ? "ring-2 ring-indigo-500 shadow-md"
                  : "hover:border-indigo-200 dark:hover:border-indigo-800",
              )}
            >
              <p className="text-[11px] font-medium text-slate-500 leading-tight line-clamp-2 min-h-[2rem]">{s}</p>
              <p className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1">{count}</p>
              <p className="text-xs text-slate-400 mt-0.5">{pct}% of tracked</p>
            </button>
          );
        })}
        {summary && summary.action_needed > 0 && (
          <button
            type="button"
            onClick={() => {
              setActionNeeded(true);
              setPage(1);
            }}
            className={clsx(
              "card snap-start shrink-0 w-[148px] p-3 text-left transition-all border-amber-200 dark:border-amber-900",
              actionNeeded ? "ring-2 ring-amber-500 shadow-md" : "",
            )}
          >
            <p className="text-[11px] font-medium text-amber-700 leading-tight min-h-[2rem]">Action Needed</p>
            <p className="text-2xl font-bold text-amber-700 mt-1">{summary.action_needed}</p>
            <p className="text-xs text-amber-600/70 mt-0.5">Needs attention</p>
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="card p-3 sm:p-4 mb-5">
        <button
          type="button"
          className="sm:hidden flex w-full items-center justify-between text-sm font-semibold text-slate-700 dark:text-slate-200"
          onClick={() => setFiltersOpen((v) => !v)}
        >
          <span className="inline-flex items-center gap-2">
            <Filter size={14} /> Filters
          </span>
          <ChevronDown size={16} className={clsx("transition-transform", filtersOpen && "rotate-180")} />
        </button>

        <div className={clsx("mt-3 sm:mt-0 space-y-3", !filtersOpen && "hidden sm:block")}>
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              className="input pl-9 w-full"
              placeholder="Search job title, company, client, or recruiter…"
              value={qDraft}
              onChange={(e) => setQDraft(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <select
              className="input"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All statuses</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <select
              className="input"
              value={applicationMethod}
              onChange={(e) => {
                setApplicationMethod(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All methods</option>
              {APPLICATION_METHODS.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
            <select
              className="input"
              value={sort}
              onChange={(e) => {
                setSort(e.target.value);
                setPage(1);
              }}
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <select
              className="input"
              value={followUpStatus}
              onChange={(e) => {
                setFollowUpStatus(e.target.value);
                setPage(1);
              }}
            >
              {FOLLOW_UP_OPTIONS.map((o) => (
                <option key={o.value || "any"} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <label className="inline-flex items-center gap-2 cursor-pointer text-slate-600 dark:text-slate-300">
              <input
                type="checkbox"
                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                checked={actionNeeded}
                onChange={(e) => {
                  setActionNeeded(e.target.checked);
                  setPage(1);
                }}
              />
              Action needed
            </label>
            <label className="inline-flex items-center gap-2 cursor-pointer text-slate-600 dark:text-slate-300">
              <input
                type="checkbox"
                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                checked={hasReminder}
                onChange={(e) => {
                  setHasReminder(e.target.checked);
                  setPage(1);
                }}
              />
              Has reminder
            </label>
            {hasActiveFilters && (
              <button
                type="button"
                className="text-indigo-600 hover:text-indigo-800 text-sm font-medium"
                onClick={() => {
                  setQDraft("");
                  setQ("");
                  setStatus("");
                  setApplicationMethod("");
                  setSort("last_activity");
                  setActionNeeded(false);
                  setHasReminder(false);
                  setFollowUpStatus("");
                  setPage(1);
                  router.replace("/applications/status");
                }}
              >
                Clear filters
              </button>
            )}
          </div>
        </div>
      </div>

      {error && (
        <ErrorBanner
          message={error}
          className="mb-5"
          onDismiss={() => setError(null)}
          onRetry={() => void loadList()}
        />
      )}

      {/* List states */}
      {loading && !data ? (
        <div className="flex items-center justify-center gap-2 text-slate-500 py-24 text-sm">
          <Loader2 size={16} className="animate-spin" /> Loading applications…
        </div>
      ) : !loading && items.length === 0 && !hasActiveFilters ? (
        <div className="card p-10 text-center">
          <p className="text-slate-700 dark:text-slate-200 font-medium">
            No applications are being tracked yet.
          </p>
          <p className="text-slate-400 text-sm mt-1">
            Discover open roles or add a job manually to start tracking.
          </p>
          <div className="flex flex-wrap justify-center gap-2 mt-5">
            <Link href="/jobs/discover" className="btn-primary text-sm inline-flex items-center gap-1.5">
              <Search size={14} /> Discover Jobs
            </Link>
            <Link href="/jobs" className="btn-secondary text-sm inline-flex items-center gap-1.5">
              <Plus size={14} /> Add Job Manually
            </Link>
          </div>
        </div>
      ) : !loading && items.length === 0 ? (
        <div className="card p-10 text-center">
          <p className="text-slate-700 dark:text-slate-200 font-medium">No applications match these filters.</p>
          <p className="text-slate-400 text-sm mt-1">Try clearing filters or adjusting your search.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {loading && (
            <div className="flex items-center gap-2 text-slate-400 text-xs px-1">
              <Loader2 size={12} className="animate-spin" /> Updating…
            </div>
          )}
          {items.map((item) => (
            <div
              key={item.id}
              role="button"
              tabIndex={0}
              onClick={() => void openDetail(item.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  void openDetail(item.id);
                }
              }}
              className="card p-4 sm:p-5 hover:border-indigo-200 dark:hover:border-indigo-800 transition-colors cursor-pointer text-left w-full"
            >
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold text-slate-900 dark:text-slate-100 text-base leading-snug">
                      {item.role}
                    </h3>
                    <StatusPill status={item.status} />
                    {item.action_required && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-800 ring-1 ring-amber-200">
                        <AlertCircle size={11} /> Action Needed
                      </span>
                    )}
                    {(item.source_job_closed || (!item.source_job_available && Boolean(item.source_job_requirement_id))) && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-600 ring-1 ring-slate-200">
                        No Longer Available
                      </span>
                    )}
                  </div>
                  {companyLine(item) && (
                    <p className="text-sm text-slate-600 dark:text-slate-300">{companyLine(item)}</p>
                  )}
                  {item.action_required_reason && (
                    <p className="text-xs text-amber-700 dark:text-amber-400">{item.action_required_reason}</p>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
                    <FieldRow label="Ref:" value={item.job_reference_number} />
                    <FieldRow label="Method:" value={item.application_method_label} />
                    <FieldRow label="Source:" value={item.application_source} />
                    <FieldRow label="Location:" value={item.location} />
                    <FieldRow label="Work type:" value={item.work_type} />
                    <FieldRow label="Opened:" value={fmtDate(item.application_opened_at)} />
                    <FieldRow label="Recruiter contacted:" value={fmtDate(item.recruiter_contacted_at)} />
                    <FieldRow label="Applied:" value={fmtDate(item.applied_at)} />
                    <FieldRow label="Last activity:" value={fmtDate(item.last_activity_at)} />
                    <FieldRow label="Follow-up:" value={fmtDate(item.follow_up_date)} />
                    <FieldRow label="Recruiter:" value={item.recruiter_name || item.recruiter_email} />
                    <FieldRow
                      label="Application URL:"
                      value={item.has_application_url ? "Available" : item.job_url ? "Linked" : null}
                    />
                    {item.match_score != null && (
                      <FieldRow label="Match:" value={`${Math.round(item.match_score)}%`} />
                    )}
                    {item.reminder_status && item.reminder_status !== "none" && (
                      <FieldRow label="Reminder:" value={item.reminder_status.replace("_", " ")} />
                    )}
                  </div>
                </div>
                <div onClick={(e) => e.stopPropagation()}>
                  <OverflowMenu actions={buildActions(item)} />
                </div>
              </div>
            </div>
          ))}

          {/* Pagination */}
          {data && data.total > 0 && (
            <div className="flex items-center justify-between pt-2 text-sm text-slate-500">
              <span>
                Page {data.page} of {totalPages} · {data.total} total
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="btn-secondary text-sm inline-flex items-center gap-1 disabled:opacity-40"
                  disabled={page <= 1 || loading}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft size={14} /> Previous
                </button>
                <button
                  type="button"
                  className="btn-secondary text-sm inline-flex items-center gap-1 disabled:opacity-40"
                  disabled={page >= totalPages || loading}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Detail drawer */}
      {detailId !== null && (
        <div className="fixed inset-0 z-40 flex justify-end">
          <button
            type="button"
            aria-label="Close detail"
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-[1px]"
            onClick={closeDetail}
          />
          <aside
            className={clsx(
              "relative z-10 flex flex-col bg-white dark:bg-slate-950 shadow-2xl",
              "w-full h-full sm:w-[440px] lg:w-[480px] sm:h-full sm:border-l border-slate-200 dark:border-slate-800",
            )}
          >
            <div className="flex items-center justify-between gap-3 px-4 sm:px-5 py-4 border-b border-slate-100 dark:border-slate-800 shrink-0">
              <div className="min-w-0">
                <p className="text-xs font-medium text-indigo-600 uppercase tracking-wide">Application</p>
                <h2 className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                  {detail?.application.role || (detailLoading ? "Loading…" : "Application")}
                </h2>
              </div>
              <button
                type="button"
                onClick={closeDetail}
                className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 sm:px-5 py-4 space-y-6">
              {detailLoading && (
                <div className="flex items-center justify-center gap-2 text-slate-500 py-16 text-sm">
                  <Loader2 size={16} className="animate-spin" /> Loading detail…
                </div>
              )}

              {detailError && (
                <ErrorBanner
                  message={detailError}
                  onDismiss={() => setDetailError(null)}
                  onRetry={() => detailId && void openDetail(detailId)}
                />
              )}

              {detail && !detailLoading && (
                <>
                  {/* Overview */}
                  <section className="space-y-3">
                    <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Overview</h3>
                    <div className="flex flex-wrap gap-2">
                      <StatusPill status={detail.application.status} />
                      {detail.action_required && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-800 ring-1 ring-amber-200">
                          <AlertCircle size={11} /> Action Needed
                        </span>
                      )}
                      {detail.source_job_closed && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-600 ring-1 ring-slate-200">
                          No Longer Available
                        </span>
                      )}
                    </div>
                    {detail.action_required_reason && (
                      <p className="text-xs text-amber-700">{detail.action_required_reason}</p>
                    )}
                    <div className="space-y-1.5">
                      <FieldRow label="Company:" value={detail.application.company} />
                      <FieldRow label="Role:" value={detail.application.role} />
                      <FieldRow label="Method:" value={detail.application_method_label} />
                      <FieldRow label="Source:" value={detail.application.application_source} />
                      <FieldRow label="Location:" value={detail.application.location} />
                      <FieldRow label="Work type:" value={detail.application.work_type} />
                      <FieldRow label="Salary:" value={detail.application.salary_range} />
                      <FieldRow
                        label="Recruiter:"
                        value={
                          detail.application.recruiter_name || detail.application.recruiter_email
                            ? [detail.application.recruiter_name, detail.application.recruiter_email]
                                .filter(Boolean)
                                .join(" · ")
                            : null
                        }
                      />
                      {detail.match_score != null && (
                        <FieldRow label="Match score:" value={`${Math.round(detail.match_score)}%`} />
                      )}
                      <FieldRow label="Match summary:" value={detail.match_summary} />
                      <FieldRow label="Opened:" value={fmtDateTime(detail.application.application_opened_at)} />
                      <FieldRow label="Recruiter contacted:" value={fmtDateTime(detail.application.recruiter_contacted_at)} />
                      <FieldRow label="Applied:" value={fmtDateTime(detail.application.applied_at)} />
                      <FieldRow label="Last activity:" value={fmtDateTime(detail.application.last_activity_at)} />
                      <FieldRow label="Follow-up:" value={fmtDateTime(detail.application.follow_up_date)} />
                      {detail.application.job_url && (
                        <a
                          href={detail.application.job_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-sm text-indigo-600 hover:text-indigo-800 font-medium mt-1"
                        >
                          <ExternalLink size={14} /> Open application URL
                        </a>
                      )}
                      {detail.application.source_job_requirement_id && detail.source_job_available && (
                        <Link
                          href={`/jobs/${detail.application.source_job_requirement_id}`}
                          className="inline-flex items-center gap-1.5 text-sm text-indigo-600 hover:text-indigo-800 font-medium"
                        >
                          View live job
                        </Link>
                      )}
                    </div>

                    {detail.job_snapshot && (
                      <div className="rounded-xl bg-slate-50 dark:bg-slate-900/60 p-3 mt-2">
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
                          Job snapshot
                        </p>
                        <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap line-clamp-8">
                          {String(
                            (detail.job_snapshot as Record<string, unknown>).job_description ||
                              (detail.job_snapshot as Record<string, unknown>).description ||
                              (detail.job_snapshot as Record<string, unknown>).title ||
                              JSON.stringify(detail.job_snapshot, null, 2),
                          )}
                        </p>
                      </div>
                    )}

                    {/* Status transitions */}
                    <div className="pt-2">
                      <p className="text-xs font-semibold text-slate-500 mb-2">Change status</p>
                      <div className="flex flex-wrap gap-2">
                        {(ALLOWED_TRANSITIONS[detail.application.status] || []).map((s) => (
                          <button
                            key={s}
                            type="button"
                            disabled={actionBusy}
                            className={clsx(
                              "text-xs font-semibold px-2.5 py-1.5 rounded-lg ring-1 transition-colors",
                              DESTRUCTIVE_STATUSES.has(s)
                                ? "text-red-700 bg-red-50 ring-red-200 hover:bg-red-100"
                                : "text-indigo-700 bg-indigo-50 ring-indigo-200 hover:bg-indigo-100",
                            )}
                            onClick={() => void changeStatus(detail.application.id, s)}
                          >
                            {s}
                          </button>
                        ))}
                        {(detail.application.status === "Rejected" ||
                          detail.application.status === "Withdrawn") && (
                          <button
                            type="button"
                            disabled={actionBusy}
                            className="btn-danger text-xs inline-flex items-center gap-1"
                            onClick={() => void archiveApp(detail.application.id)}
                          >
                            <Archive size={12} /> Archive
                          </button>
                        )}
                      </div>
                    </div>
                  </section>

                  {/* Reminders */}
                  <section className="space-y-3">
                    <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100 inline-flex items-center gap-2">
                      <Bell size={14} /> Reminders
                    </h3>
                    <div className="rounded-xl border border-slate-100 dark:border-slate-800 p-3 space-y-2">
                      <FieldRow
                        label="Status:"
                        value={
                          detail.reminder_status
                            ? detail.reminder_status.replace(/_/g, " ")
                            : "none"
                        }
                      />
                      <FieldRow label="Due:" value={fmtDate(detail.application.follow_up_date)} />
                      <FieldRow label="Type:" value={detail.application.reminder_type} />
                      <FieldRow
                        label="Completed:"
                        value={fmtDateTime(detail.application.reminder_completed_at)}
                      />
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                        <input
                          type="date"
                          className="input text-sm"
                          value={reminderDate}
                          onChange={(e) => setReminderDate(e.target.value)}
                        />
                        <select
                          className="input text-sm"
                          value={reminderType}
                          onChange={(e) => setReminderType(e.target.value)}
                        >
                          {REMINDER_TYPES.map((t) => (
                            <option key={t.value} value={t.value}>{t.label}</option>
                          ))}
                        </select>
                      </div>
                      <div className="flex flex-wrap gap-2 pt-1">
                        <button
                          type="button"
                          disabled={reminderBusy || !reminderDate}
                          className="btn-primary text-xs"
                          onClick={() =>
                            void updateReminder({
                              follow_up_date: reminderDate,
                              reminder_type: reminderType,
                            })
                          }
                        >
                          {detail.application.follow_up_date ? "Update reminder" : "Add reminder"}
                        </button>
                        {detail.application.follow_up_date && !detail.application.reminder_completed_at && (
                          <>
                            <button
                              type="button"
                              disabled={reminderBusy}
                              className="btn-secondary text-xs inline-flex items-center gap-1"
                              onClick={() => void updateReminder({ completed: true })}
                            >
                              <CheckCircle2 size={12} /> Complete
                            </button>
                            <button
                              type="button"
                              disabled={reminderBusy}
                              className="btn-secondary text-xs"
                              onClick={() => void updateReminder({ snooze_days: 3 })}
                            >
                              Snooze 3d
                            </button>
                            <button
                              type="button"
                              disabled={reminderBusy}
                              className="btn-secondary text-xs text-red-600"
                              onClick={() =>
                                void updateReminder({
                                  follow_up_date: null,
                                  reminder_type: null,
                                })
                              }
                            >
                              Clear
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </section>

                  {/* Timeline */}
                  <section className="space-y-3">
                    <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Timeline</h3>
                    {detail.timeline.length === 0 ? (
                      <p className="text-sm text-slate-400">No timeline events yet.</p>
                    ) : (
                      <ol className="relative border-l border-slate-200 dark:border-slate-700 ml-2 space-y-4">
                        {detail.timeline
                          .slice()
                          .reverse()
                          .map((ev, idx) => (
                            <li key={`${ev.event_type}-${ev.occurred_at}-${idx}`} className="ml-4">
                              <span className="absolute -left-1.5 mt-1.5 w-3 h-3 rounded-full bg-indigo-500 ring-2 ring-white dark:ring-slate-950" />
                              <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
                                {ev.summary}
                              </p>
                              {ev.detail && (
                                <p className="text-xs text-slate-500 mt-0.5">{ev.detail}</p>
                              )}
                              <p className="text-[11px] text-slate-400 mt-0.5">
                                {fmtDateTime(ev.occurred_at)} · {ev.source}
                              </p>
                            </li>
                          ))}
                      </ol>
                    )}
                  </section>

                  {/* Notes */}
                  <section className="space-y-3">
                    <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100 inline-flex items-center gap-2">
                      <StickyNote size={14} /> Notes
                    </h3>
                    <textarea
                      className="textarea w-full text-sm min-h-[80px]"
                      placeholder="Add a note…"
                      value={noteDraft}
                      onChange={(e) => setNoteDraft(e.target.value)}
                    />
                    <button
                      type="button"
                      disabled={noteSaving || !noteDraft.trim()}
                      className="btn-primary text-sm inline-flex items-center gap-1.5"
                      onClick={() => void saveNote()}
                    >
                      {noteSaving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                      Add note
                    </button>

                    <div className="space-y-2">
                      {detail.notes.length === 0 && (
                        <p className="text-sm text-slate-400">No notes yet.</p>
                      )}
                      {detail.notes.map((note) => (
                        <div
                          key={note.id}
                          className="rounded-xl border border-slate-100 dark:border-slate-800 p-3"
                        >
                          {editingNoteId === note.id ? (
                            <div className="space-y-2">
                              <textarea
                                className="textarea w-full text-sm min-h-[72px]"
                                value={editingNoteContent}
                                onChange={(e) => setEditingNoteContent(e.target.value)}
                              />
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  className="btn-primary text-xs"
                                  disabled={noteSaving}
                                  onClick={() => void saveEditedNote(note)}
                                >
                                  Save
                                </button>
                                <button
                                  type="button"
                                  className="btn-secondary text-xs"
                                  onClick={() => {
                                    setEditingNoteId(null);
                                    setEditingNoteContent("");
                                  }}
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <p className="text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap">
                                {note.content}
                              </p>
                              <div className="flex items-center justify-between mt-2 gap-2">
                                <p className="text-[11px] text-slate-400">
                                  {fmtDateTime(note.created_at)}
                                  {note.updated_at && note.updated_at !== note.created_at
                                    ? ` · edited ${fmtDateTime(note.updated_at)}`
                                    : ""}
                                </p>
                                <div className="flex gap-1">
                                  <button
                                    type="button"
                                    className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50"
                                    aria-label="Edit note"
                                    onClick={() => {
                                      setEditingNoteId(note.id);
                                      setEditingNoteContent(note.content);
                                    }}
                                  >
                                    <Pencil size={13} />
                                  </button>
                                  <button
                                    type="button"
                                    className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50"
                                    aria-label="Delete note"
                                    onClick={() => void removeNote(note.id)}
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  </section>
                </>
              )}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

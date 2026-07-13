"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import type { JobApplication, JobApplicationStatus, ReminderType, NegotiationAdvice } from "@/types";
import {
  Plus, Pencil, Trash2, ExternalLink, Loader2,
  X, Sparkles, Target, PenTool, RefreshCw, MessageSquare, Mail,
  Copy, CheckCircle, ChevronDown, ChevronUp, FileDown, Wand2, HandCoins,
} from "lucide-react";
import clsx from "clsx";
import { EmptyJobsIllustration } from "@/components/illustrations/EmptyState";
import ErrorBanner from "@/components/ErrorBanner";
import { REMINDER_TYPES } from "@/lib/reminderTypes";
import UpcomingReminders from "@/components/UpcomingReminders";
import { downloadJobsCsv } from "@/lib/export";

const STATUSES = [
  "Saved", "Application Opened", "Application In Progress", "Recruiter Contacted",
  "Applied", "Interviewing", "Offer", "Rejected", "Withdrawn",
] as const;
const FILTERS = ["All", ...STATUSES] as const;
const WORK_TYPES = ["Remote", "Hybrid", "Onsite"] as const;
const RESUME_KEY = "aijob_resume_text";

const STATUS_COLORS: Record<string, string> = {
  Applied: "bg-blue-100 text-blue-700",
  Interviewing: "bg-purple-100 text-purple-700",
  Offer: "bg-green-100 text-green-700",
  Rejected: "bg-red-100 text-red-700",
  Withdrawn: "bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300",
  Saved: "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400",
  "Recruiter Contacted": "bg-teal-100 dark:bg-teal-950/40 text-teal-700 dark:text-teal-400",
  "Application Opened": "bg-cyan-100 dark:bg-cyan-950/40 text-cyan-700 dark:text-cyan-400",
  "Application In Progress": "bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400",
};

const WORK_TYPE_COLORS: Record<string, string> = {
  Remote: "bg-blue-50 text-blue-600",
  Hybrid: "bg-purple-50 text-purple-600",
  Onsite: "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400",
};

const TYPE_COLOR: Record<string, string> = {
  behavioral: "bg-blue-100 text-blue-700",
  technical: "bg-purple-100 text-purple-700",
  situational: "bg-amber-100 text-amber-700",
};

const emptyForm = {
  company: "", role: "", status: "Applied" as JobApplicationStatus, location: "",
  job_url: "", salary_range: "", work_type: "", recruiter_name: "", recruiter_email: "",
  notes: "", date_applied: "", follow_up_date: "", reminder_type: "",
};

interface InterviewQuestion {
  question: string;
  type: string;
  suggested_answer: string;
}

function fmtDate(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function JobsPage() {
  const router = useRouter();
  const [jobs, setJobs] = useState<JobApplication[]>([]);
  const [filter, setFilter] = useState<string>("All");
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<JobApplication | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [loadingDemo, setLoadingDemo] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [deletingSelected, setDeletingSelected] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Prepare Interview modal
  const [interviewJob, setInterviewJob] = useState<JobApplication | null>(null);
  const [interviewLoading, setInterviewLoading] = useState(false);
  const [interviewError, setInterviewError] = useState<string | null>(null);
  const [interviewQuestions, setInterviewQuestions] = useState<InterviewQuestion[] | null>(null);
  const [openQuestion, setOpenQuestion] = useState<number | null>(null);

  // Follow-up email modal
  const [emailJob, setEmailJob] = useState<JobApplication | null>(null);
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailDraft, setEmailDraft] = useState<{ subject: string; body: string } | null>(null);
  const [emailCopied, setEmailCopied] = useState(false);

  // Paste-a-job auto-fill (Add modal only)
  const [parseText, setParseText] = useState("");
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);

  // Negotiation assistant modal
  const [negotiationJob, setNegotiationJob] = useState<JobApplication | null>(null);
  const [negotiationLoading, setNegotiationLoading] = useState(false);
  const [negotiationError, setNegotiationError] = useState<string | null>(null);
  const [negotiationAdvice, setNegotiationAdvice] = useState<NegotiationAdvice | null>(null);
  const [negotiationCopied, setNegotiationCopied] = useState(false);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const load = async () => {
    setLoading(true);
    try {
      setJobs(await api.listJobs());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openAdd = () => {
    setEditing(null); setForm(emptyForm); setShowModal(true);
    setParseText(""); setParseError(null);
  };
  const openEdit = (job: JobApplication) => {
    setEditing(job);
    setForm({
      company: job.company, role: job.role, status: job.status,
      location: job.location ?? "", job_url: job.job_url ?? "",
      salary_range: job.salary_range ?? "", work_type: job.work_type ?? "",
      recruiter_name: job.recruiter_name ?? "", recruiter_email: job.recruiter_email ?? "",
      notes: job.notes ?? "",
      date_applied: job.date_applied ? job.date_applied.split("T")[0] : "",
      follow_up_date: job.follow_up_date ? job.follow_up_date.split("T")[0] : "",
      reminder_type: job.reminder_type ?? "",
    });
    setShowModal(true);
  };

  const save = async () => {
    if (!form.company || !form.role) return;
    setSaving(true);
    try {
      const payload = {
        company: form.company, role: form.role,
        status: form.status as JobApplicationStatus,
        location: form.location || null, job_url: form.job_url || null,
        salary_range: form.salary_range || null,
        work_type: form.work_type || null,
        recruiter_name: form.recruiter_name || null,
        recruiter_email: form.recruiter_email || null,
        notes: form.notes || null,
        date_applied: form.date_applied || null,
        follow_up_date: form.follow_up_date || null,
        reminder_type: (form.follow_up_date ? (form.reminder_type || null) : null) as ReminderType | null,
      };
      if (editing) await api.updateJob(editing.id, payload);
      else await api.createJob(payload as Parameters<typeof api.createJob>[0]);
      setShowModal(false);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async (id: number) => {
    try {
      await api.deleteJob(id);
      setDeleteId(null);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed.");
    }
  };

  const handleLoadDemo = async () => {
    setLoadingDemo(true);
    try {
      const res = await api.loadDemoJobs();
      showToast(res.message);
      load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to load demo jobs.";
      if (msg.includes("already loaded")) showToast("Demo jobs already loaded.");
      else setError(msg);
    } finally {
      setLoadingDemo(false);
    }
  };

  const handleClearAll = async () => {
    setClearing(true);
    try {
      const res = await api.clearAllJobs();
      showToast(res.message);
      setShowClearConfirm(false);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Clear failed.");
    } finally {
      setClearing(false);
    }
  };

  const visible = filter === "All" ? jobs : jobs.filter((j) => j.status === filter);

  const handleExportCsv = () => {
    const toExport = selected.size > 0 ? visible.filter((j) => selected.has(j.id)) : visible;
    downloadJobsCsv(toExport);
    showToast(`Exported ${toExport.length} application(s) to CSV.`);
  };

  const toggleSelect = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === visible.length) setSelected(new Set());
    else setSelected(new Set(visible.map((j) => j.id)));
  };

  const handleDeleteSelected = async () => {
    if (selected.size === 0) return;
    setDeletingSelected(true);
    try {
      const res = await api.bulkDeleteJobs(Array.from(selected));
      showToast(res.message);
      setSelected(new Set());
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed.");
    } finally {
      setDeletingSelected(false);
    }
  };

  const handleStatusChange = async (job: JobApplication, newStatus: JobApplicationStatus) => {
    setUpdatingStatus(job.id);
    try {
      await api.updateJob(job.id, { status: newStatus });
      setJobs((prev) => prev.map((j) => (j.id === job.id ? { ...j, status: newStatus } : j)));
      showToast(`Status updated to ${newStatus}`);
    } catch {
      setError("Failed to update status.");
    } finally {
      setUpdatingStatus(null);
    }
  };

  const handleAnalyzeMatch = (job: JobApplication) => {
    localStorage.setItem("aijob_match_context", JSON.stringify({ company: job.company, role: job.role }));
    router.push("/match");
  };

  const handleCoverLetter = (job: JobApplication) => {
    router.push(`/cover-letter?company=${encodeURIComponent(job.company)}&role=${encodeURIComponent(job.role)}`);
  };

  const handlePrepareInterview = async (job: JobApplication) => {
    setInterviewJob(job);
    setInterviewQuestions(null);
    setInterviewError(null);
    setOpenQuestion(null);
    setInterviewLoading(true);
    try {
      const resumeText = localStorage.getItem(RESUME_KEY) ?? "";
      if (resumeText.trim().length < 50) {
        throw new Error("Analyze your resume first on the Resume Analyzer page — interview prep is tailored to it.");
      }
      const contextLines = [
        `Position: ${job.role}`,
        `Company: ${job.company}`,
        job.work_type ? `Work type: ${job.work_type}` : "",
        job.location ? `Location: ${job.location}` : "",
        job.notes ? `Notes: ${job.notes}` : "",
      ].filter(Boolean).join("\n");
      const data = await api.createInterviewQuestions(resumeText, contextLines);
      setInterviewQuestions(data.questions);
    } catch (e) {
      setInterviewError(e instanceof Error ? e.message : "Failed to generate interview prep.");
    } finally {
      setInterviewLoading(false);
    }
  };

  const handleFollowUpEmail = async (job: JobApplication) => {
    setEmailJob(job);
    setEmailDraft(null);
    setEmailError(null);
    setEmailCopied(false);
    setEmailLoading(true);
    try {
      const data = await api.generateFollowUpEmail(job.id);
      setEmailDraft(data);
    } catch (e) {
      setEmailError(e instanceof Error ? e.message : "Failed to generate follow-up email.");
    } finally {
      setEmailLoading(false);
    }
  };

  const copyEmail = async () => {
    if (!emailDraft) return;
    await navigator.clipboard.writeText(`Subject: ${emailDraft.subject}\n\n${emailDraft.body}`);
    setEmailCopied(true);
    setTimeout(() => setEmailCopied(false), 2500);
  };

  const mailtoHref = () => {
    if (!emailDraft || !emailJob) return "#";
    const to = emailJob.recruiter_email ?? "";
    return `mailto:${to}?subject=${encodeURIComponent(emailDraft.subject)}&body=${encodeURIComponent(emailDraft.body)}`;
  };

  const handleAutofill = async () => {
    if (parseText.trim().length < 30) {
      setParseError("Paste a bit more of the job posting to auto-fill from it.");
      return;
    }
    setParsing(true);
    setParseError(null);
    try {
      const parsed = await api.parseJobPosting(parseText);
      setForm((f) => ({
        ...f,
        company: parsed.company || f.company,
        role: parsed.role || f.role,
        location: parsed.location || f.location,
        work_type: parsed.work_type || f.work_type,
        salary_range: parsed.salary_range || f.salary_range,
        notes: parsed.notes || f.notes,
      }));
    } catch (e) {
      setParseError(e instanceof Error ? e.message : "Failed to parse job posting.");
    } finally {
      setParsing(false);
    }
  };

  const handleNegotiate = async (job: JobApplication) => {
    setNegotiationJob(job);
    setNegotiationAdvice(null);
    setNegotiationError(null);
    setNegotiationCopied(false);
    setNegotiationLoading(true);
    try {
      const data = await api.generateNegotiationAdvice(job.id);
      setNegotiationAdvice(data);
    } catch (e) {
      setNegotiationError(e instanceof Error ? e.message : "Failed to generate negotiation advice.");
    } finally {
      setNegotiationLoading(false);
    }
  };

  const copyNegotiationEmail = async () => {
    if (!negotiationAdvice) return;
    await navigator.clipboard.writeText(
      `Subject: ${negotiationAdvice.counter_offer_email.subject}\n\n${negotiationAdvice.counter_offer_email.body}`
    );
    setNegotiationCopied(true);
    setTimeout(() => setNegotiationCopied(false), 2500);
  };

  const negotiationMailtoHref = () => {
    if (!negotiationAdvice || !negotiationJob) return "#";
    const to = negotiationJob.recruiter_email ?? "";
    return `mailto:${to}?subject=${encodeURIComponent(negotiationAdvice.counter_offer_email.subject)}&body=${encodeURIComponent(negotiationAdvice.counter_offer_email.body)}`;
  };

  return (
    <div className="p-4 sm:p-8 max-w-6xl mx-auto">
      {/* Toast */}
      {toast && (
        <div className="fixed top-5 right-5 z-50 bg-slate-900 text-white px-4 py-2.5 rounded-xl shadow-lg text-sm font-medium animate-slide-up">
          {toast}
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-6">
        <div>
          <p className="page-kicker">Applications</p>
          <h1 className="page-title">Job Tracker</h1>
          <p className="page-subtitle">Manage and track all your job applications.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap sm:shrink-0">
          {selected.size > 0 && (
            <button
              type="button"
              onClick={handleDeleteSelected}
              disabled={deletingSelected}
              className="flex items-center gap-1.5 text-xs font-semibold text-white bg-red-500 hover:bg-red-600 px-3 py-2 rounded-lg transition-colors"
            >
              {deletingSelected ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
              Delete Selected ({selected.size})
            </button>
          )}
          {jobs.length > 0 && selected.size === 0 && (
            <button
              type="button"
              onClick={() => setShowClearConfirm(true)}
              className="text-xs text-red-500 hover:text-red-700 hover:bg-red-50 px-3 py-2 rounded-lg transition-colors font-medium"
            >
              Clear All
            </button>
          )}
          {jobs.length > 0 && (
            <button
              type="button"
              onClick={handleExportCsv}
              className="btn-secondary flex items-center gap-2 text-sm"
              title={selected.size > 0 ? `Export ${selected.size} selected job(s)` : "Export all visible jobs"}
            >
              <FileDown size={14} /> Export CSV{selected.size > 0 ? ` (${selected.size})` : ""}
            </button>
          )}
          <button
            type="button"
            onClick={handleLoadDemo}
            disabled={loadingDemo}
            className="btn-secondary flex items-center gap-2 text-sm"
          >
            {loadingDemo ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            Demo Jobs
          </button>
          <button type="button" onClick={openAdd} className="btn-primary flex items-center gap-2">
            <Plus size={16} /> Add Job
          </button>
        </div>
      </div>

      {error && (
        <ErrorBanner message={error} onDismiss={() => setError(null)} onRetry={load} className="mb-4" />
      )}

      <div className="mb-6">
        <UpcomingReminders limit={3} />
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-1 mb-5 bg-slate-100 dark:bg-slate-800 rounded-xl p-1 w-fit flex-wrap">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`px-3.5 py-1.5 rounded-lg text-sm font-medium transition-all duration-150 ${
              filter === f ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm" : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
            }`}
          >
            {f}
            <span className={`ml-1.5 text-xs font-bold ${filter === f ? "text-indigo-600" : "text-slate-400"}`}>
              {f === "All" ? jobs.length : jobs.filter((j) => j.status === f).length}
            </span>
          </button>
        ))}
      </div>

      {/* Job List */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={24} className="animate-spin text-indigo-500" />
          </div>
        ) : visible.length === 0 ? (
          <div className="py-12 text-center">
            <EmptyJobsIllustration className="mx-auto mb-3" />
            <p className="text-slate-500 dark:text-slate-400 font-medium">No applications found.</p>
            <p className="text-slate-400 text-sm mt-1">Add a job or load demo data to get started.</p>
          </div>
        ) : (
          <>
            {/* Mobile card list */}
            <div className="md:hidden divide-y divide-slate-100 dark:divide-slate-800">
              {visible.map((job) => (
                <div key={job.id} className={clsx("p-4 transition-colors", selected.has(job.id) && "bg-indigo-50 dark:bg-indigo-950/30")}>
                  <div className="flex items-start gap-3 mb-2">
                    <input
                      type="checkbox"
                      aria-label={`Select ${job.company}`}
                      checked={selected.has(job.id)}
                      onChange={() => toggleSelect(job.id)}
                      className="mt-1 accent-indigo-600 shrink-0"
                    />
                    <div className="flex-1 flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-slate-800 dark:text-slate-100 text-sm">{job.company}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{job.role}</p>
                      <div className="flex items-center gap-1.5 flex-wrap mt-1">
                        {job.location && <span className="text-xs text-slate-400">{job.location}</span>}
                        {job.work_type && (
                          <span className={clsx("text-[11px] font-medium px-1.5 py-0.5 rounded-full", WORK_TYPE_COLORS[job.work_type] ?? "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400")}>
                            {job.work_type}
                          </span>
                        )}
                      </div>
                    </div>
                    {updatingStatus === job.id ? (
                      <Loader2 size={14} className="animate-spin text-indigo-500 shrink-0" />
                    ) : (
                      <select
                        value={job.status}
                        onChange={(e) => handleStatusChange(job, e.target.value as JobApplicationStatus)}
                        aria-label={`Status for ${job.company}`}
                        className={clsx(
                          "text-xs font-semibold px-2 py-1 rounded-full border-0 cursor-pointer appearance-none shrink-0",
                          STATUS_COLORS[job.status] ?? "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
                        )}
                      >
                        {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    )}
                  </div>
                  <div className="mt-2 space-y-1.5">
                    {(job.date_applied || job.follow_up_date) && (
                      <p className="text-xs text-slate-400">
                        {job.date_applied && <>Applied {fmtDate(job.date_applied)}</>}
                        {job.date_applied && job.follow_up_date && " · "}
                        {job.follow_up_date && <>Follow-up {fmtDate(job.follow_up_date)}</>}
                      </p>
                    )}
                    {job.salary_range && (
                      <p className="text-xs text-slate-400">{job.salary_range}</p>
                    )}
                    {job.notes && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 italic truncate">{job.notes}</p>
                    )}
                    <div className="flex items-center gap-0.5 flex-wrap -ml-1.5">
                      <button type="button" onClick={() => handleAnalyzeMatch(job)} title="Analyze Match"
                        className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 rounded-lg transition-colors">
                        <Target size={14} />
                      </button>
                      <button type="button" onClick={() => handleCoverLetter(job)} title="Generate Cover Letter"
                        className="p-1.5 text-slate-400 hover:text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-950/30 rounded-lg transition-colors">
                        <PenTool size={14} />
                      </button>
                      <button type="button" onClick={() => handlePrepareInterview(job)} title="Prepare Interview"
                        className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/30 rounded-lg transition-colors">
                        <MessageSquare size={14} />
                      </button>
                      <button type="button" onClick={() => handleFollowUpEmail(job)} title="Send Follow-up Email"
                        className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 rounded-lg transition-colors">
                        <Mail size={14} />
                      </button>
                      {job.status === "Offer" && (
                        <button type="button" onClick={() => handleNegotiate(job)} title="Negotiation Assistant"
                          className="p-1.5 text-slate-400 hover:text-teal-600 hover:bg-teal-50 dark:hover:bg-teal-950/30 rounded-lg transition-colors">
                          <HandCoins size={14} />
                        </button>
                      )}
                      {job.job_url && (
                        <a href={job.job_url} target="_blank" rel="noreferrer" title="Open job listing"
                          className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/30 rounded-lg transition-colors">
                          <ExternalLink size={14} />
                        </a>
                      )}
                      <button type="button" onClick={() => openEdit(job)} title="Edit"
                        className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
                        <Pencil size={14} />
                      </button>
                      <button type="button" onClick={() => setDeleteId(job.id)} title="Delete"
                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition-colors">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
                </div>
              ))}
            </div>

            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60">
                    <th className="px-4 py-3 w-10">
                      <input
                        type="checkbox"
                        aria-label="Select all"
                        checked={visible.length > 0 && selected.size === visible.length}
                        onChange={toggleSelectAll}
                        className="accent-indigo-600"
                      />
                    </th>
                    {["Company", "Job Title", "Status", "Location", "Work Type", "Applied", "Follow-up", "Salary", "Actions"].map((h) => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {visible.map((job) => (
                    <tr key={job.id} className={clsx("transition-colors", selected.has(job.id) ? "bg-indigo-50 dark:bg-indigo-950/30" : "hover:bg-slate-50 dark:hover:bg-slate-800/60")}>
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          aria-label={`Select ${job.company}`}
                          checked={selected.has(job.id)}
                          onChange={() => toggleSelect(job.id)}
                          className="accent-indigo-600"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-semibold text-slate-800 dark:text-slate-100">{job.company}</span>
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{job.role}</td>
                      <td className="px-4 py-3">
                        {updatingStatus === job.id ? (
                          <Loader2 size={14} className="animate-spin text-indigo-500" />
                        ) : (
                          <select
                            value={job.status}
                            onChange={(e) => handleStatusChange(job, e.target.value as JobApplicationStatus)}
                            aria-label={`Status for ${job.company} — ${job.role}`}
                            className={clsx(
                              "text-xs font-semibold px-2.5 py-1 rounded-full border-0 cursor-pointer appearance-none",
                              STATUS_COLORS[job.status] ?? "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
                            )}
                          >
                            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                          </select>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                        {[job.location, job.work_type].filter(Boolean).join(" · ") || "—"}
                      </td>
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                        {job.date_applied
                          ? new Date(job.date_applied).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                          : "—"}
                      </td>
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{job.salary_range ?? "—"}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button type="button" onClick={() => handleAnalyzeMatch(job)} title="Analyze Match"
                            className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 rounded-lg transition-colors">
                            <Target size={14} />
                          </button>
                          <button type="button" onClick={() => handleCoverLetter(job)} title="Generate Cover Letter"
                            className="p-1.5 text-slate-400 hover:text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-950/30 rounded-lg transition-colors">
                            <PenTool size={14} />
                          </button>
                          <button type="button" onClick={() => handlePrepareInterview(job)} title="Prepare Interview"
                            className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/30 rounded-lg transition-colors">
                            <MessageSquare size={14} />
                          </button>
                          <button type="button" onClick={() => handleFollowUpEmail(job)} title="Send Follow-up Email"
                            className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 rounded-lg transition-colors">
                            <Mail size={14} />
                          </button>
                          {job.status === "Offer" && (
                            <button type="button" onClick={() => handleNegotiate(job)} title="Negotiation Assistant"
                              className="p-1.5 text-slate-400 hover:text-teal-600 hover:bg-teal-50 dark:hover:bg-teal-950/30 rounded-lg transition-colors">
                              <HandCoins size={14} />
                            </button>
                          )}
                          {job.job_url && (
                            <a href={job.job_url} target="_blank" rel="noreferrer" title="Open listing"
                              className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/30 rounded-lg transition-colors">
                              <ExternalLink size={14} />
                            </a>
                          )}
                          <button type="button" onClick={() => openEdit(job)} title="Edit"
                            className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
                            <Pencil size={14} />
                          </button>
                          <button type="button" onClick={() => setDeleteId(job.id)} title="Delete"
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition-colors">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Action Legend — desktop only */}
      <div className="hidden md:flex mt-3 items-center gap-4 text-xs text-slate-400 px-1 flex-wrap">
        <span className="flex items-center gap-1"><Target size={11} /> Analyze Match</span>
        <span className="flex items-center gap-1"><PenTool size={11} /> Cover Letter</span>
        <span className="flex items-center gap-1"><MessageSquare size={11} /> Prepare Interview</span>
        <span className="flex items-center gap-1"><Mail size={11} /> Follow-up Email</span>
        <span className="flex items-center gap-1"><HandCoins size={11} /> Negotiation Assistant (Offer status)</span>
        <span className="flex items-center gap-1"><RefreshCw size={11} /> Click status to update</span>
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto animate-slide-up">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
              <h3 className="font-bold text-slate-800 dark:text-slate-100">{editing ? "Edit Application" : "Add Application"}</h3>
              <button type="button" aria-label="Close modal" onClick={() => setShowModal(false)}
                className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-400">
                <X size={18} />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {!editing && (
                <div className="bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/50 rounded-xl p-4 space-y-2.5">
                  <label htmlFor="modal-paste" className="text-sm font-semibold text-indigo-700 flex items-center gap-1.5">
                    <Wand2 size={14} /> Paste a job posting to auto-fill
                  </label>
                  <textarea
                    id="modal-paste"
                    className="textarea bg-white dark:bg-slate-900"
                    rows={3}
                    value={parseText}
                    onChange={(e) => setParseText(e.target.value)}
                    placeholder="Paste the job description here…"
                  />
                  {parseError && <p className="text-xs text-red-600">{parseError}</p>}
                  <button
                    type="button"
                    onClick={handleAutofill}
                    disabled={parsing || parseText.trim().length < 30}
                    className="flex items-center gap-1.5 text-sm font-semibold text-indigo-700 hover:text-indigo-800 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {parsing ? <><Loader2 size={14} className="animate-spin" /> Auto-filling…</> : <><Wand2 size={14} /> Auto-fill fields below</>}
                  </button>
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="modal-company" className="label">Company *</label>
                  <input id="modal-company" className="input" value={form.company}
                    onChange={(e) => setForm({ ...form, company: e.target.value })} placeholder="Google" />
                </div>
                <div>
                  <label htmlFor="modal-role" className="label">Job Title *</label>
                  <input id="modal-role" className="input" value={form.role}
                    onChange={(e) => setForm({ ...form, role: e.target.value })} placeholder="Software Engineer" />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="modal-status" className="label">Status</label>
                  <select id="modal-status" className="input" value={form.status}
                    onChange={(e) => setForm({ ...form, status: e.target.value as JobApplicationStatus })}>
                    {STATUSES.map((s) => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="modal-worktype" className="label">Work Type</label>
                  <select id="modal-worktype" className="input" value={form.work_type}
                    onChange={(e) => setForm({ ...form, work_type: e.target.value })}>
                    <option value="">— Select —</option>
                    {WORK_TYPES.map((w) => <option key={w}>{w}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="modal-location" className="label">Location</label>
                  <input id="modal-location" className="input" value={form.location}
                    onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Remote" />
                </div>
                <div>
                  <label htmlFor="modal-salary" className="label">Salary Range</label>
                  <input id="modal-salary" className="input" value={form.salary_range}
                    onChange={(e) => setForm({ ...form, salary_range: e.target.value })} placeholder="$80k – $100k" />
                </div>
              </div>
              <div>
                <label htmlFor="modal-url" className="label">Job Link</label>
                <input id="modal-url" className="input" value={form.job_url}
                  onChange={(e) => setForm({ ...form, job_url: e.target.value })} placeholder="https://..." />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="modal-recruiter-name" className="label">Recruiter Name</label>
                  <input id="modal-recruiter-name" className="input" value={form.recruiter_name}
                    onChange={(e) => setForm({ ...form, recruiter_name: e.target.value })} placeholder="Jane Smith" />
                </div>
                <div>
                  <label htmlFor="modal-recruiter-email" className="label">Recruiter Email</label>
                  <input id="modal-recruiter-email" type="email" className="input" value={form.recruiter_email}
                    onChange={(e) => setForm({ ...form, recruiter_email: e.target.value })} placeholder="jane@company.com" />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="modal-date" className="label">Application Date</label>
                  <input id="modal-date" type="date" className="input" value={form.date_applied}
                    onChange={(e) => setForm({ ...form, date_applied: e.target.value })} />
                </div>
                <div>
                  <label htmlFor="modal-followup" className="label">Follow-up Date</label>
                  <input id="modal-followup" type="date" className="input" value={form.follow_up_date}
                    onChange={(e) => setForm({ ...form, follow_up_date: e.target.value })} />
                </div>
              </div>
              {form.follow_up_date && (
                <div>
                  <label htmlFor="modal-reminder-type" className="label">Reminder Type</label>
                  <select id="modal-reminder-type" className="input" value={form.reminder_type}
                    onChange={(e) => setForm({ ...form, reminder_type: e.target.value })}>
                    <option value="">— Select —</option>
                    {REMINDER_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label htmlFor="modal-notes" className="label">Notes</label>
                <textarea id="modal-notes" className="textarea" rows={3} value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Add any notes..." />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 flex gap-3 justify-end">
              <button type="button" onClick={() => setShowModal(false)} className="btn-secondary">Cancel</button>
              <button type="button" onClick={save} disabled={saving || !form.company || !form.role}
                className="btn-primary flex items-center gap-2">
                {saving ? <><Loader2 size={14} className="animate-spin" /> Saving...</> : (editing ? "Save Changes" : "Add Application")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clear All Confirm */}
      {showClearConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-sm p-6 animate-slide-up">
            <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-2">Clear All Jobs?</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-5">This will permanently delete all {jobs.length} applications. Cannot be undone.</p>
            <div className="flex gap-3 justify-end">
              <button type="button" onClick={() => setShowClearConfirm(false)} className="btn-secondary">Cancel</button>
              <button type="button" onClick={handleClearAll} disabled={clearing}
                className="bg-red-600 hover:bg-red-700 text-white font-semibold px-5 py-2.5 rounded-lg transition-colors flex items-center gap-2">
                {clearing ? <><Loader2 size={14} className="animate-spin" /> Clearing...</> : "Clear All"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm */}
      {deleteId !== null && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-sm p-6 animate-slide-up">
            <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-2">Delete Application?</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-5">This action cannot be undone.</p>
            <div className="flex gap-3 justify-end">
              <button type="button" onClick={() => setDeleteId(null)} className="btn-secondary">Cancel</button>
              <button type="button" onClick={() => confirmDelete(deleteId)}
                className="bg-red-600 hover:bg-red-700 text-white font-semibold px-5 py-2.5 rounded-lg transition-colors">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Prepare Interview Modal */}
      {interviewJob && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto animate-slide-up">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h3 className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                  <MessageSquare size={16} className="text-amber-500" /> Interview Prep
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">{interviewJob.company} — {interviewJob.role}</p>
              </div>
              <button type="button" aria-label="Close" onClick={() => setInterviewJob(null)} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-400">
                <X size={18} />
              </button>
            </div>
            <div className="px-6 py-5">
              {interviewLoading && (
                <div className="flex items-center justify-center gap-2 text-slate-500 dark:text-slate-400 py-10">
                  <Loader2 size={18} className="animate-spin" /> Generating interview prep…
                </div>
              )}
              {interviewError && (
                <ErrorBanner message={interviewError} onDismiss={() => setInterviewError(null)} onRetry={() => handlePrepareInterview(interviewJob)} />
              )}
              {interviewQuestions && (
                <div className="space-y-2">
                  {interviewQuestions.map((q, i) => (
                    <div key={i} className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
                      <button
                        type="button"
                        onClick={() => setOpenQuestion(openQuestion === i ? null : i)}
                        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span className={clsx("text-xs font-semibold px-2 py-0.5 rounded-full shrink-0", TYPE_COLOR[q.type] ?? "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400")}>
                            {q.type}
                          </span>
                          <span className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">{q.question}</span>
                        </div>
                        {openQuestion === i ? <ChevronUp size={15} className="text-slate-400 shrink-0" /> : <ChevronDown size={15} className="text-slate-400 shrink-0" />}
                      </button>
                      {openQuestion === i && (
                        <div className="px-4 pb-4 bg-amber-50 dark:bg-amber-950/20 border-t border-slate-100 dark:border-slate-800">
                          <p className="text-xs font-semibold text-amber-700 mt-3 mb-1.5">Suggested Answer</p>
                          <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{q.suggested_answer}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Follow-up Email Modal */}
      {emailJob && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto animate-slide-up">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h3 className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                  <Mail size={16} className="text-emerald-500" /> Follow-up Email
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">{emailJob.company} — {emailJob.role}</p>
              </div>
              <button type="button" aria-label="Close" onClick={() => setEmailJob(null)} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-400">
                <X size={18} />
              </button>
            </div>
            <div className="px-6 py-5">
              {emailLoading && (
                <div className="flex items-center justify-center gap-2 text-slate-500 dark:text-slate-400 py-10">
                  <Loader2 size={18} className="animate-spin" /> Drafting follow-up email…
                </div>
              )}
              {emailError && (
                <ErrorBanner message={emailError} onDismiss={() => setEmailError(null)} onRetry={() => handleFollowUpEmail(emailJob)} />
              )}
              {emailDraft && (
                <div className="space-y-3">
                  <div>
                    <p className="label">Subject</p>
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-100 bg-slate-50 dark:bg-slate-800/60 rounded-lg px-3 py-2">{emailDraft.subject}</p>
                  </div>
                  <div>
                    <p className="label">Body</p>
                    <p className="text-sm text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/60 rounded-lg px-3 py-3 whitespace-pre-wrap leading-relaxed">{emailDraft.body}</p>
                  </div>
                  <div className="flex gap-2 pt-2">
                    <button type="button" onClick={copyEmail}
                      className={clsx("flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-lg transition-all", emailCopied ? "bg-green-100 text-green-700" : "btn-secondary")}>
                      {emailCopied ? <><CheckCircle size={14} /> Copied!</> : <><Copy size={14} /> Copy</>}
                    </button>
                    <a href={mailtoHref()} className="btn-primary flex items-center gap-1.5 text-sm">
                      <Mail size={14} /> Open in Email Client
                    </a>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Negotiation Assistant Modal */}
      {negotiationJob && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto animate-slide-up">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h3 className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                  <HandCoins size={16} className="text-teal-500" /> Negotiation Assistant
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">{negotiationJob.company} — {negotiationJob.role}</p>
              </div>
              <button type="button" aria-label="Close" onClick={() => setNegotiationJob(null)} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-400">
                <X size={18} />
              </button>
            </div>
            <div className="px-6 py-5">
              {negotiationLoading && (
                <div className="flex items-center justify-center gap-2 text-slate-500 dark:text-slate-400 py-10">
                  <Loader2 size={18} className="animate-spin" /> Preparing negotiation advice…
                </div>
              )}
              {negotiationError && (
                <ErrorBanner message={negotiationError} onDismiss={() => setNegotiationError(null)} onRetry={() => handleNegotiate(negotiationJob)} />
              )}
              {negotiationAdvice && (
                <div className="space-y-4">
                  <p className="text-sm text-slate-600 dark:text-slate-400 bg-teal-50 dark:bg-teal-950/20 rounded-lg px-3 py-2.5">{negotiationAdvice.market_context}</p>
                  <div>
                    <p className="label">Talking Points</p>
                    <ul className="space-y-2">
                      {negotiationAdvice.talking_points.map((t, i) => (
                        <li key={i} className="text-sm text-slate-600 dark:text-slate-400 flex items-start gap-2">
                          <span className="text-teal-500 font-bold shrink-0">→</span> {t}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="label">Counter-offer Email</p>
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-100 bg-slate-50 dark:bg-slate-800/60 rounded-lg px-3 py-2 mb-2">{negotiationAdvice.counter_offer_email.subject}</p>
                    <p className="text-sm text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/60 rounded-lg px-3 py-3 whitespace-pre-wrap leading-relaxed">{negotiationAdvice.counter_offer_email.body}</p>
                  </div>
                  <div className="flex gap-2 pt-2">
                    <button type="button" onClick={copyNegotiationEmail}
                      className={clsx("flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-lg transition-all", negotiationCopied ? "bg-green-100 text-green-700" : "btn-secondary")}>
                      {negotiationCopied ? <><CheckCircle size={14} /> Copied!</> : <><Copy size={14} /> Copy</>}
                    </button>
                    <a href={negotiationMailtoHref()} className="btn-primary flex items-center gap-1.5 text-sm">
                      <Mail size={14} /> Open in Email Client
                    </a>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

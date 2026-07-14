"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, Loader2, Pencil, Trash2, GitCompareArrows, UserPlus, Send, Mail,
  StickyNote, BellPlus, XCircle, ChevronDown,
} from "lucide-react";
import clsx from "clsx";
import { api } from "@/lib/api";
import type {
  Interview, JobCandidateItem, JobRequirement, Offer, Submission,
} from "@/types";
import { JOB_STATUS_GROUPS } from "@/types";
import ErrorBanner from "@/components/ErrorBanner";
import ActivityTimeline from "@/components/crm/ActivityTimeline";
import { useAtsRole } from "@/lib/atsRole";

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{label}</p>
      <p className="text-sm text-slate-800 mt-0.5 break-words">{value || "—"}</p>
    </div>
  );
}

function LinkedField({ label, value, href }: { label: string; value: string | null; href: string | null }) {
  return (
    <div>
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{label}</p>
      {href && value ? (
        <Link href={href} className="text-sm font-medium text-indigo-600 hover:text-indigo-800 mt-0.5 inline-block">{value}</Link>
      ) : (
        <p className="text-sm text-slate-800 mt-0.5">{value || "—"}</p>
      )}
    </div>
  );
}

function TagList({ items }: { items: string[] }) {
  if (!items.length) return <span className="text-sm text-slate-400">—</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item, i) => (
        <span key={i} className="text-xs font-medium px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700">{item}</span>
      ))}
    </div>
  );
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatDateTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

const STATUS_DISPLAY_COLORS: Record<string, string> = {
  Draft: "bg-slate-100 text-slate-600 ring-1 ring-slate-200",
  Open: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  "On Hold": "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
  Filled: "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200",
  Closed: "bg-slate-100 text-slate-500 ring-1 ring-slate-200",
};

const TABS = ["Overview", "Candidates", "Submissions", "Interviews", "Activity"] as const;
type Tab = typeof TABS[number];

export default function JobRequirementDetailPage() {
  const params = useParams<{ id: string }>();
  const jobId = Number(params.id);
  const router = useRouter();
  const { isAdmin, canWrite } = useAtsRole();

  const [job, setJob] = useState<JobRequirement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [tab, setTab] = useState<Tab>("Overview");
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const [statusSaving, setStatusSaving] = useState(false);
  const [followUpOpen, setFollowUpOpen] = useState(false);

  const loadJob = useCallback(async () => {
    setLoading(true);
    try {
      setJob(await api.getJobRequirement(jobId));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load job.");
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => { void loadJob(); }, [loadJob]);

  const remove = async () => {
    if (!confirm("Permanently delete this job? This cannot be undone.")) return;
    setDeleting(true);
    try {
      await api.deleteJobRequirement(jobId, true);
      router.push("/ats/jobs");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete job. Jobs with candidates, submissions, or activity must be closed instead of deleted.");
      setDeleting(false);
    }
  };

  const changeStatus = async (status: string) => {
    setStatusSaving(true);
    setStatusMenuOpen(false);
    try {
      setJob(await api.updateJobStatus(jobId, status));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update status.");
    } finally {
      setStatusSaving(false);
    }
  };

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 size={24} className="animate-spin text-indigo-500" /></div>;
  if (error && !job) return <div className="p-8 max-w-4xl mx-auto"><ErrorBanner message={error} onRetry={loadJob} /></div>;
  if (!job) return <div className="p-8 max-w-4xl mx-auto"><ErrorBanner message="Job not found." /></div>;

  const rateDisplay = job.rate || (job.rate_min && job.rate_max ? `${job.rate_min}–${job.rate_max}` : job.rate_min || job.rate_max);

  return (
    <div className="p-4 sm:p-8 max-w-5xl mx-auto">
      <Link href="/ats/jobs" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 mb-4">
        <ArrowLeft size={14} /> Back to Jobs
      </Link>

      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
        <div className="min-w-0">
          <p className="page-kicker">Job</p>
          <h1 className="page-title break-words">{job.job_title}</h1>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <div className="relative">
              <button
                type="button"
                disabled={!canWrite || statusSaving}
                onClick={() => setStatusMenuOpen((o) => !o)}
                className={clsx(
                  "inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold disabled:cursor-default",
                  STATUS_DISPLAY_COLORS[job.status_display] ?? "bg-slate-100 text-slate-600 ring-1 ring-slate-200",
                )}
              >
                {statusSaving ? <Loader2 size={11} className="animate-spin" /> : null}
                {job.status_display}
                {canWrite && <ChevronDown size={12} />}
              </button>
              {statusMenuOpen && canWrite && (
                <div className="absolute z-10 mt-1 w-36 rounded-lg border border-slate-200 bg-white shadow-lg py-1">
                  {JOB_STATUS_GROUPS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => changeStatus(s)}
                      className="w-full text-left px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <span className="text-xs text-slate-500">{job.source_label} · {job.priority} priority</span>
            {job.job_reference_number && <span className="text-xs text-slate-400">Ref: {job.job_reference_number}</span>}
            {job.recruiter_link_status === "incomplete" && (
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 ring-1 ring-amber-200">
                Recruiter information incomplete
              </span>
            )}
          </div>
        </div>
        {canWrite && (
          <div className="flex gap-2 shrink-0 flex-wrap">
            <Link href={`/ats/jobs/${jobId}/edit`} className="btn-secondary flex items-center gap-2">
              <Pencil size={14} /> Edit Job
            </Link>
            {isAdmin && (
              <button type="button" onClick={remove} disabled={deleting} className="btn-danger flex items-center gap-2">
                {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />} Delete
              </button>
            )}
          </div>
        )}
      </div>

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} className="mb-4" />}

      {canWrite && (
        <div className="flex flex-wrap gap-2 mb-5">
          <Link href={`/ats/jobs/${jobId}/matches`} className="btn-primary flex items-center gap-2 text-sm">
            <GitCompareArrows size={14} /> Match Candidates
          </Link>
          <Link href="/ats/candidates/new" className="btn-secondary flex items-center gap-2 text-sm">
            <UserPlus size={14} /> Add Candidate
          </Link>
          <Link href={`/ats/submissions?job_requirement_id=${jobId}`} className="btn-secondary flex items-center gap-2 text-sm">
            <Send size={14} /> Create Submission
          </Link>
          {job.recruiter_email && (
            <a href={`mailto:${job.recruiter_email}`} className="btn-secondary flex items-center gap-2 text-sm">
              <Mail size={14} /> Contact Recruiter
            </a>
          )}
          <button type="button" onClick={() => setTab("Activity")} className="btn-secondary flex items-center gap-2 text-sm">
            <StickyNote size={14} /> Add Note
          </button>
          <button type="button" onClick={() => setFollowUpOpen(true)} className="btn-secondary flex items-center gap-2 text-sm">
            <BellPlus size={14} /> Set Follow-Up
          </button>
          {job.status_display !== "Closed" && (
            <button type="button" onClick={() => changeStatus("Closed")} disabled={statusSaving} className="btn-secondary flex items-center gap-2 text-sm">
              <XCircle size={14} /> Close Job
            </button>
          )}
        </div>
      )}

      {followUpOpen && (
        <FollowUpModal jobId={jobId} onClose={() => setFollowUpOpen(false)} onSaved={() => { setFollowUpOpen(false); setTab("Activity"); }} />
      )}

      <div className="flex gap-1 border-b border-slate-200 mb-5 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={clsx(
              "px-3.5 py-2 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors",
              tab === t ? "border-indigo-600 text-indigo-700" : "border-transparent text-slate-500 hover:text-slate-800",
            )}
          >
            {t}
            {t === "Candidates" && job.candidate_count > 0 ? ` (${job.candidate_count})` : ""}
            {t === "Submissions" && job.submission_count > 0 ? ` (${job.submission_count})` : ""}
            {t === "Interviews" && job.interview_count > 0 ? ` (${job.interview_count})` : ""}
          </button>
        ))}
      </div>

      {tab === "Overview" && <OverviewTab job={job} rateDisplay={rateDisplay ?? null} />}
      {tab === "Candidates" && <CandidatesTab jobId={jobId} canWrite={canWrite} />}
      {tab === "Submissions" && <SubmissionsTab jobId={jobId} />}
      {tab === "Interviews" && <InterviewsTab jobId={jobId} />}
      {tab === "Activity" && (
        <div className="card p-5">
          <ActivityTimeline scope={{ job_requirement_id: jobId }} />
        </div>
      )}
    </div>
  );
}

function OverviewTab({ job, rateDisplay }: { job: JobRequirement; rateDisplay: string | null }) {
  return (
    <div className="space-y-5">
      <div className="card p-6 space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <LinkedField label="Client" value={job.client_name || job.client} href={job.client_id ? `/ats/contacts/${job.client_id}` : null} />
          <LinkedField label="Vendor" value={job.vendor_name || job.vendor} href={job.vendor_id ? `/ats/contacts/${job.vendor_id}` : null} />
          <LinkedField label="End Client" value={job.end_client_name || job.end_client} href={job.end_client_id ? `/ats/contacts/${job.end_client_id}` : null} />
          <LinkedField
            label="Recruiter"
            value={job.recruiter_contact_name || ([job.recruiter_name, job.recruiter_email, job.recruiter_phone].filter(Boolean).join(" · ") || null)}
            href={job.recruiter_contact_id ? `/ats/contacts/${job.recruiter_contact_id}` : null}
          />
          <Field label="Location" value={job.location} />
          <Field label="Work Arrangement" value={job.work_type} />
          <Field label="Employment Type" value={job.employment_type} />
          <Field label="Rate / Salary" value={rateDisplay} />
          <Field label="Contract Duration" value={job.duration} />
          <Field label="Work Authorization" value={job.visa_requirement} />
          <Field label="Clearance" value={job.clearance_requirement} />
          <Field label="Minimum Experience" value={job.minimum_experience} />
          <Field label="Source" value={job.source_label} />
          <Field label="Received" value={formatDate(job.received_at)} />
          <Field label="Created By" value={job.created_by} />
          <Field label="Last Updated" value={formatDateTime(job.updated_at)} />
        </div>
        <div><p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Required Skills</p><TagList items={job.required_skills} /></div>
        <div><p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Preferred Skills</p><TagList items={job.preferred_skills} /></div>
        <div><p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Job Description</p><p className="text-sm text-slate-800 mt-0.5 whitespace-pre-wrap">{job.job_description || "—"}</p></div>
        {job.notes && <div><p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Notes</p><p className="text-sm text-slate-800 mt-0.5 whitespace-pre-wrap">{job.notes}</p></div>}
      </div>
    </div>
  );
}

function CandidatesTab({ jobId, canWrite }: { jobId: number; canWrite: boolean }) {
  const [items, setItems] = useState<JobCandidateItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await api.getJobCandidates(jobId));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load candidates.");
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => { void load(); }, [load]);

  if (loading) return <div className="flex justify-center py-10"><Loader2 size={20} className="animate-spin text-indigo-500" /></div>;
  if (error) return <ErrorBanner message={error} onRetry={load} />;
  if (items.length === 0) {
    return (
      <div className="card p-10 text-center">
        <p className="text-slate-500 font-medium">No candidates matched yet.</p>
        <Link href={`/ats/jobs/${jobId}/matches`} className="text-sm text-indigo-600 hover:underline mt-1 inline-block">Match Candidates</Link>
      </div>
    );
  }

  return (
    <div className="card overflow-hidden overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 border-b border-slate-100">
          <tr>
            <th className="text-left px-4 py-3 font-semibold text-slate-600">Candidate</th>
            <th className="text-left px-4 py-3 font-semibold text-slate-600 hidden sm:table-cell">Title</th>
            <th className="text-left px-4 py-3 font-semibold text-slate-600 hidden md:table-cell">Skills</th>
            <th className="text-left px-4 py-3 font-semibold text-slate-600 hidden md:table-cell">Work Auth</th>
            <th className="text-left px-4 py-3 font-semibold text-slate-600">Match</th>
            <th className="text-left px-4 py-3 font-semibold text-slate-600">Submission</th>
            <th className="text-right px-4 py-3 font-semibold text-slate-600">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {items.map((c) => (
            <tr key={c.employee_id} className="hover:bg-slate-50/50">
              <td className="px-4 py-3">
                <Link href={`/ats/candidates/${c.employee_id}`} className="font-medium text-indigo-600 hover:text-indigo-800">{c.employee_name}</Link>
              </td>
              <td className="px-4 py-3 text-slate-600 hidden sm:table-cell">{c.current_title || "—"}</td>
              <td className="px-4 py-3 hidden md:table-cell max-w-xs"><TagList items={c.skills.slice(0, 4)} /></td>
              <td className="px-4 py-3 text-slate-600 hidden md:table-cell">{c.work_authorization || "—"}</td>
              <td className="px-4 py-3">
                {c.match_score != null ? (
                  <div>
                    <span className="font-semibold text-slate-800">{c.match_score}%</span>
                    <p className="text-xs text-slate-400">{c.match_recommendation}</p>
                  </div>
                ) : "—"}
              </td>
              <td className="px-4 py-3 text-slate-600">{c.submission_status || "—"}</td>
              <td className="px-4 py-3">
                <div className="flex items-center justify-end gap-2 flex-wrap">
                  <Link href={`/ats/candidates/${c.employee_id}`} className="text-xs text-indigo-600 hover:underline">View</Link>
                  {canWrite && !c.submission_id && (
                    <Link
                      href={`/ats/submissions?job_requirement_id=${jobId}&employee_id=${c.employee_id}`}
                      className="text-xs text-indigo-600 hover:underline"
                    >
                      Submit
                    </Link>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SubmissionsTab({ jobId }: { jobId: number }) {
  const [items, setItems] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await api.getSubmissions({ job_requirement_id: jobId }));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load submissions.");
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => { void load(); }, [load]);

  if (loading) return <div className="flex justify-center py-10"><Loader2 size={20} className="animate-spin text-indigo-500" /></div>;
  if (error) return <ErrorBanner message={error} onRetry={load} />;
  if (items.length === 0) {
    return (
      <div className="card p-10 text-center">
        <p className="text-slate-500 font-medium">No submissions yet.</p>
        <Link href={`/ats/submissions?job_requirement_id=${jobId}`} className="text-sm text-indigo-600 hover:underline mt-1 inline-block">Create Submission</Link>
      </div>
    );
  }

  return (
    <div className="card overflow-hidden overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 border-b border-slate-100">
          <tr>
            <th className="text-left px-4 py-3 font-semibold text-slate-600">Candidate</th>
            <th className="text-left px-4 py-3 font-semibold text-slate-600 hidden sm:table-cell">Submitted</th>
            <th className="text-left px-4 py-3 font-semibold text-slate-600">Stage</th>
            <th className="text-left px-4 py-3 font-semibold text-slate-600 hidden md:table-cell">Rate</th>
            <th className="text-right px-4 py-3 font-semibold text-slate-600">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {items.map((s) => (
            <tr key={s.id} className="hover:bg-slate-50/50">
              <td className="px-4 py-3">
                <Link href={`/ats/candidates/${s.employee_id}`} className="font-medium text-indigo-600 hover:text-indigo-800">
                  {s.employee_name ?? `Employee #${s.employee_id}`}
                </Link>
              </td>
              <td className="px-4 py-3 text-slate-600 hidden sm:table-cell">{formatDate(s.submission_date)}</td>
              <td className="px-4 py-3 text-slate-700">{s.status}</td>
              <td className="px-4 py-3 text-slate-600 hidden md:table-cell">{s.submitted_rate || "—"}</td>
              <td className="px-4 py-3 text-right">
                <Link href="/ats/submissions" className="text-xs text-indigo-600 hover:underline">View</Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function InterviewsTab({ jobId }: { jobId: number }) {
  const [items, setItems] = useState<Interview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await api.getInterviews({ job_requirement_id: jobId }));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load interviews.");
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => { void load(); }, [load]);

  if (loading) return <div className="flex justify-center py-10"><Loader2 size={20} className="animate-spin text-indigo-500" /></div>;
  if (error) return <ErrorBanner message={error} onRetry={load} />;
  if (items.length === 0) {
    return <div className="card p-10 text-center"><p className="text-slate-500 font-medium">No interviews scheduled.</p></div>;
  }

  return (
    <div className="card overflow-hidden overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 border-b border-slate-100">
          <tr>
            <th className="text-left px-4 py-3 font-semibold text-slate-600">Candidate</th>
            <th className="text-left px-4 py-3 font-semibold text-slate-600 hidden sm:table-cell">Date</th>
            <th className="text-left px-4 py-3 font-semibold text-slate-600 hidden md:table-cell">Type</th>
            <th className="text-left px-4 py-3 font-semibold text-slate-600">Status</th>
            <th className="text-left px-4 py-3 font-semibold text-slate-600 hidden md:table-cell">Interviewer</th>
            <th className="text-right px-4 py-3 font-semibold text-slate-600">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {items.map((iv) => (
            <tr key={iv.id} className="hover:bg-slate-50/50">
              <td className="px-4 py-3 text-slate-800">{iv.employee_name ?? "—"}</td>
              <td className="px-4 py-3 text-slate-600 hidden sm:table-cell">{formatDateTime(iv.scheduled_at)}</td>
              <td className="px-4 py-3 text-slate-600 hidden md:table-cell">{iv.interview_type || "—"}</td>
              <td className="px-4 py-3 text-slate-700">{iv.status}</td>
              <td className="px-4 py-3 text-slate-600 hidden md:table-cell">{iv.interviewer_name || "—"}</td>
              <td className="px-4 py-3 text-right">
                <Link href="/ats/interviews" className="text-xs text-indigo-600 hover:underline">View</Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FollowUpModal({ jobId, onClose, onSaved }: { jobId: number; onClose: () => void; onSaved: () => void }) {
  const [subject, setSubject] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!subject.trim() || !dueDate) {
      setError("Subject and due date are required.");
      return;
    }
    setSaving(true);
    try {
      await api.createActivity({
        job_requirement_id: jobId,
        activity_type: "Follow-Up",
        subject: subject.trim(),
        due_date: new Date(dueDate).toISOString(),
        status: "Open",
      });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create follow-up.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 p-4 pt-24">
      <div className="card w-full max-w-sm p-5">
        <h3 className="font-semibold text-slate-900 mb-3">Set Follow-Up</h3>
        {error && <p className="text-sm text-red-600 mb-2">{error}</p>}
        <label className="text-xs font-medium text-slate-600">Subject</label>
        <input className="input w-full mt-1 mb-3" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Check in with recruiter" />
        <label className="text-xs font-medium text-slate-600">Due date</label>
        <input type="date" className="input w-full mt-1 mb-4" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-secondary text-sm">Cancel</button>
          <button type="button" onClick={save} disabled={saving} className="btn-primary text-sm flex items-center gap-2">
            {saving ? <Loader2 size={14} className="animate-spin" /> : null} Save
          </button>
        </div>
      </div>
    </div>
  );
}

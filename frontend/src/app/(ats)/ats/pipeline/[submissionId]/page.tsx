"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Loader2, Plus } from "lucide-react";
import clsx from "clsx";
import { api } from "@/lib/api";
import type { CRMActivity, Interview, Offer, Submission } from "@/types";
import {
  INTERVIEW_OUTCOMES,
  INTERVIEW_STATUSES,
  OFFER_STATUSES,
  ONBOARDING_STATUSES,
  PIPELINE_STAGES,
} from "@/types";
import ErrorBanner from "@/components/ErrorBanner";
import { useAtsRole } from "@/lib/atsRole";

const TABS = ["Overview", "Activity", "Interviews", "Offer", "Documents"] as const;
type Tab = typeof TABS[number];

function formatDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatDateTime(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function stageClass(stage: string) {
  switch (stage) {
    case "Placed": return "bg-green-100 text-green-700";
    case "Rejected": case "Withdrawn": return "bg-red-100 text-red-700";
    case "Interview Scheduled": case "Interview Completed": case "Offer": return "bg-teal-100 text-teal-700";
    case "Submitted": case "Client Review": return "bg-cyan-100 text-cyan-700";
    default: return "bg-slate-100 text-slate-600";
  }
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{label}</p>
      <p className="text-sm text-slate-800 mt-0.5">{value ?? "—"}</p>
    </div>
  );
}

export default function PipelineDetailPage() {
  const params = useParams();
  const submissionId = Number(params.submissionId);
  const { canWrite } = useAtsRole();

  const [record, setRecord] = useState<Submission | null>(null);
  const [tab, setTab] = useState<Tab>("Overview");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stageBusy, setStageBusy] = useState(false);

  const [activities, setActivities] = useState<CRMActivity[]>([]);
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [offer, setOffer] = useState<Offer | null>(null);
  const [tabLoading, setTabLoading] = useState(false);
  const [tabError, setTabError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!Number.isFinite(submissionId)) return;
    setLoading(true);
    try {
      setRecord(await api.getPipelineRecord(submissionId));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load pipeline record.");
      setRecord(null);
    } finally {
      setLoading(false);
    }
  }, [submissionId]);

  useEffect(() => { void load(); }, [load]);

  const loadTab = useCallback(async (t: Tab) => {
    if (!Number.isFinite(submissionId)) return;
    if (t === "Overview" || t === "Documents") return;
    setTabLoading(true);
    setTabError(null);
    try {
      if (t === "Activity") setActivities(await api.getPipelineActivities(submissionId));
      if (t === "Interviews") setInterviews(await api.getPipelineInterviews(submissionId));
      if (t === "Offer") setOffer(await api.getPipelineOffer(submissionId));
    } catch (e) {
      setTabError(e instanceof Error ? e.message : "Failed to load tab data.");
    } finally {
      setTabLoading(false);
    }
  }, [submissionId]);

  useEffect(() => { void loadTab(tab); }, [tab, loadTab]);

  const changeStage = async (stage: string) => {
    setStageBusy(true);
    try {
      setRecord(await api.changePipelineStage(submissionId, { stage, confirmed: true }));
      if (tab === "Activity") await loadTab("Activity");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to change stage.");
    } finally {
      setStageBusy(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-20"><Loader2 size={24} className="animate-spin text-indigo-500" /></div>;
  }

  if (!record) {
    return (
      <div className="p-4 sm:p-8 max-w-4xl mx-auto">
        <ErrorBanner message={error || "Pipeline record not found."} onRetry={load} />
        <Link href="/ats/pipeline" className="text-sm text-indigo-600 hover:underline mt-4 inline-block">Back to Pipeline</Link>
      </div>
    );
  }

  const stage = record.status_display || record.status;

  return (
    <div className="p-4 sm:p-8 max-w-4xl mx-auto">
      <Link href="/ats/pipeline" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-indigo-600 mb-4">
        <ArrowLeft size={14} /> Pipeline
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
        <div>
          <p className="page-kicker">Pipeline #{record.id}</p>
          <h1 className="page-title">
            <Link href={`/ats/candidates/${record.employee_id}`} className="hover:text-indigo-700">
              {record.employee_name ?? `Candidate #${record.employee_id}`}
            </Link>
          </h1>
          <p className="page-subtitle">
            <Link href={`/ats/jobs/${record.job_requirement_id}`} className="text-indigo-600 hover:underline">
              {record.job_title ?? `Job #${record.job_requirement_id}`}
            </Link>
            {record.client_name ? ` · ${record.client_name}` : ""}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className={clsx("text-xs font-medium px-2 py-0.5 rounded-full", stageClass(stage))}>{stage}</span>
            {record.match_score != null && <span className="text-xs text-slate-500">Match {record.match_score}%</span>}
            {record.follow_up_overdue && <span className="text-xs font-medium text-red-600">Follow-up overdue</span>}
          </div>
        </div>
        {canWrite && (
          <label className="block">
            <span className="text-xs font-medium text-slate-500">Stage</span>
            <select
              className="input mt-1 text-sm py-1.5 w-auto min-w-[11rem]"
              value={stage}
              disabled={stageBusy}
              aria-label="Change stage"
              onChange={(e) => changeStage(e.target.value)}
            >
              {PIPELINE_STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
        )}
      </div>

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} onRetry={load} className="mb-4" />}

      <div className="overflow-x-auto mb-4 -mx-1 px-1">
        <div className="flex gap-1 min-w-max border-b border-slate-200">
          {TABS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={clsx(
                "px-3 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors",
                tab === t ? "border-indigo-600 text-indigo-700" : "border-transparent text-slate-500 hover:text-slate-800",
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {tabError && <ErrorBanner message={tabError} onDismiss={() => setTabError(null)} className="mb-4" />}

      {tab === "Overview" && (
        <div className="card p-6 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <Field
              label="Candidate"
              value={<Link href={`/ats/candidates/${record.employee_id}`} className="text-indigo-600 hover:underline">{record.employee_name ?? `#${record.employee_id}`}</Link>}
            />
            <Field
              label="Job"
              value={<Link href={`/ats/jobs/${record.job_requirement_id}`} className="text-indigo-600 hover:underline">{record.job_title ?? `#${record.job_requirement_id}`}</Link>}
            />
            <Field label="Client" value={record.client_name || "—"} />
            <Field label="Vendor" value={record.vendor_name || "—"} />
            <Field label="Recruiter" value={record.recruiter_name || "—"} />
            <Field label="Submitted rate" value={record.submitted_rate || "—"} />
            <Field label="Submission date" value={formatDate(record.submission_date)} />
            <Field label="Next interview" value={formatDateTime(record.next_interview_at)} />
            <Field label="Offer status" value={record.offer_status || "—"} />
            <Field
              label="Next follow-up"
              value={
                <span className={record.follow_up_overdue ? "text-red-600 font-medium" : undefined}>
                  {formatDateTime(record.next_follow_up_at)}
                </span>
              }
            />
            <Field label="Last activity" value={formatDateTime(record.last_activity_at)} />
            <Field label="Resume" value={record.resume_filename || "—"} />
            <Field label="Vendor reference" value={record.vendor_reference || "—"} />
            <Field label="Created by" value={record.created_by || "—"} />
          </div>
          {record.notes && (
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Notes</p>
              <p className="text-sm text-slate-800 mt-0.5 whitespace-pre-wrap">{record.notes}</p>
            </div>
          )}
        </div>
      )}

      {tab === "Documents" && (
        <div className="card p-6">
          <h2 className="font-semibold text-slate-900 mb-3">Documents</h2>
          {record.resume_filename ? (
            <div className="rounded-lg border border-slate-100 bg-slate-50 px-4 py-3">
              <p className="text-sm font-medium text-slate-800">Resume</p>
              <p className="text-sm text-slate-600 mt-0.5">{record.resume_filename}</p>
              <Link href={`/ats/candidates/${record.employee_id}`} className="text-xs text-indigo-600 hover:underline mt-2 inline-block">
                Manage resumes on candidate profile
              </Link>
            </div>
          ) : (
            <p className="text-sm text-slate-500">No resume on file for this candidate.</p>
          )}
        </div>
      )}

      {tab === "Activity" && (
        <ActivityTab
          submissionId={submissionId}
          activities={activities}
          loading={tabLoading}
          canWrite={canWrite}
          onRefresh={() => loadTab("Activity")}
        />
      )}

      {tab === "Interviews" && (
        <InterviewsTab
          submissionId={submissionId}
          interviews={interviews}
          loading={tabLoading}
          canWrite={canWrite}
          onRefresh={() => loadTab("Interviews")}
        />
      )}

      {tab === "Offer" && (
        <OfferTab
          submissionId={submissionId}
          offer={offer}
          loading={tabLoading}
          canWrite={canWrite}
          onRefresh={() => loadTab("Offer")}
        />
      )}
    </div>
  );
}

function ActivityTab({
  submissionId,
  activities,
  loading,
  canWrite,
  onRefresh,
}: {
  submissionId: number;
  activities: CRMActivity[];
  loading: boolean;
  canWrite: boolean;
  onRefresh: () => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [subject, setSubject] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.createPipelineFollowUp(submissionId, {
        subject: subject.trim() || "Follow-up",
        activity_type: "Follow-Up",
        due_date: dueDate || null,
        status: "Open",
      });
      setShowForm(false);
      setSubject("");
      setDueDate("");
      setError(null);
      onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create follow-up.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="flex justify-center py-10"><Loader2 size={20} className="animate-spin text-indigo-500" /></div>;

  return (
    <div className="space-y-4">
      {canWrite && (
        <div className="flex justify-end">
          <button type="button" className="btn-secondary flex items-center gap-1.5 text-sm" onClick={() => setShowForm((v) => !v)}>
            <Plus size={14} /> Add Follow-up
          </button>
        </div>
      )}
      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
      {showForm && (
        <form onSubmit={save} className="card p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Subject</span>
            <input className="input mt-1 w-full" value={subject} onChange={(e) => setSubject(e.target.value)} required />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Due date</span>
            <input className="input mt-1 w-full" type="datetime-local" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </label>
          <div className="sm:col-span-2 flex gap-2">
            <button type="submit" className="btn-primary" disabled={saving}>{saving ? "Saving…" : "Save"}</button>
            <button type="button" className="btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </form>
      )}
      <div className="card p-4">
        {activities.length === 0 ? (
          <p className="py-8 text-center text-slate-500 text-sm">No activity yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {activities.map((a) => (
              <li key={a.id} className="py-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-slate-800">{a.subject || a.activity_type}</p>
                    {a.description && <p className="text-xs text-slate-500 mt-0.5 whitespace-pre-wrap">{a.description}</p>}
                    <p className="text-[11px] text-slate-400 mt-1">
                      {a.activity_type} · {a.status}
                      {a.due_date ? ` · Due ${formatDateTime(a.due_date)}` : ""}
                      {" · "}{formatDateTime(a.activity_date)}
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function InterviewsTab({
  submissionId,
  interviews,
  loading,
  canWrite,
  onRefresh,
}: {
  submissionId: number;
  interviews: Interview[];
  loading: boolean;
  canWrite: boolean;
  onRefresh: () => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    scheduled_at: "",
    interview_type: "Phone Screen",
    interviewer_name: "",
    location_or_link: "",
    status: "Scheduled",
    outcome: "Pending",
  });

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.createPipelineInterview(submissionId, {
        scheduled_at: form.scheduled_at || null,
        interview_type: form.interview_type || null,
        interviewer_name: form.interviewer_name || null,
        location_or_link: form.location_or_link || null,
        status: form.status,
        outcome: form.outcome,
      });
      setShowForm(false);
      setError(null);
      onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create interview.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="flex justify-center py-10"><Loader2 size={20} className="animate-spin text-indigo-500" /></div>;

  return (
    <div className="space-y-4">
      {canWrite && (
        <div className="flex justify-end">
          <button type="button" className="btn-secondary flex items-center gap-1.5 text-sm" onClick={() => setShowForm((v) => !v)}>
            <Plus size={14} /> Schedule Interview
          </button>
        </div>
      )}
      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
      {showForm && (
        <form onSubmit={save} className="card p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Scheduled at</span>
            <input className="input mt-1 w-full" type="datetime-local" value={form.scheduled_at} onChange={(e) => setForm({ ...form, scheduled_at: e.target.value })} />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Type</span>
            <input className="input mt-1 w-full" value={form.interview_type} onChange={(e) => setForm({ ...form, interview_type: e.target.value })} />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Interviewer</span>
            <input className="input mt-1 w-full" value={form.interviewer_name} onChange={(e) => setForm({ ...form, interviewer_name: e.target.value })} />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Location / link</span>
            <input className="input mt-1 w-full" value={form.location_or_link} onChange={(e) => setForm({ ...form, location_or_link: e.target.value })} />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Status</span>
            <select className="input mt-1 w-full" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              {INTERVIEW_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Outcome</span>
            <select className="input mt-1 w-full" value={form.outcome} onChange={(e) => setForm({ ...form, outcome: e.target.value })}>
              {INTERVIEW_OUTCOMES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <div className="sm:col-span-2 flex gap-2">
            <button type="submit" className="btn-primary" disabled={saving}>{saving ? "Saving…" : "Save"}</button>
            <button type="button" className="btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </form>
      )}
      <div className="card overflow-hidden">
        {interviews.length === 0 ? (
          <p className="py-8 text-center text-slate-500 text-sm">No interviews scheduled.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                {["When", "Type", "Status", "Outcome", "Interviewer"].map((h) => (
                  <th key={h} className="text-left px-4 py-2.5 font-semibold text-slate-600">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {interviews.map((iv) => (
                <tr key={iv.id}>
                  <td className="px-4 py-2.5 text-slate-700">{formatDateTime(iv.scheduled_at)}</td>
                  <td className="px-4 py-2.5 text-slate-600">{iv.interview_type || "—"}</td>
                  <td className="px-4 py-2.5">{iv.status}</td>
                  <td className="px-4 py-2.5">{iv.outcome}</td>
                  <td className="px-4 py-2.5 text-slate-600">{iv.interviewer_name || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function OfferTab({
  submissionId,
  offer,
  loading,
  canWrite,
  onRefresh,
}: {
  submissionId: number;
  offer: Offer | null;
  loading: boolean;
  canWrite: boolean;
  onRefresh: () => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    offered_rate: "",
    rate_type: "Hourly",
    start_date: "",
    offer_date: "",
    status: "Draft",
    onboarding_status: "Not Started",
    notes: "",
  });

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.createPipelineOffer(submissionId, {
        offered_rate: form.offered_rate || null,
        rate_type: form.rate_type || null,
        start_date: form.start_date || null,
        offer_date: form.offer_date || null,
        status: form.status,
        onboarding_status: form.onboarding_status,
        notes: form.notes || null,
      });
      setShowForm(false);
      setError(null);
      onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create offer.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="flex justify-center py-10"><Loader2 size={20} className="animate-spin text-indigo-500" /></div>;

  return (
    <div className="space-y-4">
      {canWrite && !offer && (
        <div className="flex justify-end">
          <button type="button" className="btn-secondary flex items-center gap-1.5 text-sm" onClick={() => setShowForm((v) => !v)}>
            <Plus size={14} /> Create Offer
          </button>
        </div>
      )}
      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
      {showForm && (
        <form onSubmit={save} className="card p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Offered rate</span>
            <input className="input mt-1 w-full" value={form.offered_rate} onChange={(e) => setForm({ ...form, offered_rate: e.target.value })} />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Rate type</span>
            <input className="input mt-1 w-full" value={form.rate_type} onChange={(e) => setForm({ ...form, rate_type: e.target.value })} />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Start date</span>
            <input className="input mt-1 w-full" type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Offer date</span>
            <input className="input mt-1 w-full" type="date" value={form.offer_date} onChange={(e) => setForm({ ...form, offer_date: e.target.value })} />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Status</span>
            <select className="input mt-1 w-full" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              {OFFER_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Onboarding</span>
            <select className="input mt-1 w-full" value={form.onboarding_status} onChange={(e) => setForm({ ...form, onboarding_status: e.target.value })}>
              {ONBOARDING_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <label className="block sm:col-span-2">
            <span className="text-sm font-medium text-slate-700">Notes</span>
            <textarea className="textarea mt-1 w-full" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </label>
          <div className="sm:col-span-2 flex gap-2">
            <button type="submit" className="btn-primary" disabled={saving}>{saving ? "Saving…" : "Save"}</button>
            <button type="button" className="btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </form>
      )}
      {!offer ? (
        <div className="card p-8 text-center text-sm text-slate-500">No offer yet.</div>
      ) : (
        <div className="card p-6 grid grid-cols-1 sm:grid-cols-2 gap-5">
          <Field label="Offered rate" value={offer.offered_rate || "—"} />
          <Field label="Rate type" value={offer.rate_type || "—"} />
          <Field label="Start date" value={formatDate(offer.start_date)} />
          <Field label="Offer date" value={formatDate(offer.offer_date)} />
          <Field label="Expiry" value={formatDate(offer.expiry_date)} />
          <Field label="Status" value={offer.status} />
          <Field label="Onboarding" value={offer.onboarding_status} />
          <Field label="Updated" value={formatDateTime(offer.updated_at)} />
          {offer.notes && (
            <div className="sm:col-span-2">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Notes</p>
              <p className="text-sm text-slate-800 mt-0.5 whitespace-pre-wrap">{offer.notes}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

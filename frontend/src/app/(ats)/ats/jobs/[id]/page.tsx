"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2, Pencil, GitCompareArrows, AlertTriangle } from "lucide-react";
import clsx from "clsx";
import { api } from "@/lib/api";
import type { JobRequirement, JobEmployeeMatch } from "@/types";
import ErrorBanner from "@/components/ErrorBanner";

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{label}</p>
      <p className="text-sm text-slate-800 mt-0.5">{value || "—"}</p>
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

const STATUS_COLORS: Record<string, string> = {
  New: "bg-slate-100 text-slate-600 ring-1 ring-slate-200",
  Parsed: "bg-blue-50 text-blue-700 ring-1 ring-blue-200",
  "Ready for Match": "bg-purple-50 text-purple-700 ring-1 ring-purple-200",
};

export default function JobRequirementDetailPage() {
  const params = useParams<{ id: string }>();
  const jobId = Number(params.id);

  const [job, setJob] = useState<JobRequirement | null>(null);
  const [topMatches, setTopMatches] = useState<JobEmployeeMatch[]>([]);
  const [sends, setSends] = useState<import("@/types").JobSend[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [j, matches, jobSends] = await Promise.all([
        api.getJobRequirement(jobId),
        api.getJobEmployeeMatches(jobId, 50),
        api.getJobSends({ job_requirement_id: jobId }),
      ]);
      setJob(j);
      setTopMatches(matches.slice(0, 5));
      setSends(jobSends);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load job requirement.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [jobId]);

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 size={24} className="animate-spin text-indigo-500" /></div>;
  if (error && !job) return <div className="p-8 max-w-3xl mx-auto"><ErrorBanner message={error} onRetry={load} /></div>;
  if (!job) return null;

  const rateDisplay = job.rate || (job.rate_min && job.rate_max ? `${job.rate_min}–${job.rate_max}` : job.rate_min || job.rate_max);

  return (
    <div className="p-4 sm:p-8 max-w-4xl mx-auto">
      <Link href="/ats/jobs" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 mb-4">
        <ArrowLeft size={14} /> Back to Job Requirements
      </Link>

      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-6">
        <div>
          <p className="page-kicker">Job Requirement</p>
          <h1 className="page-title">{job.job_title}</h1>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <span className={clsx("inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold", STATUS_COLORS[job.status] ?? "bg-slate-100 text-slate-600 ring-1 ring-slate-200")}>{job.status}</span>
            <span className="text-xs text-slate-500">{job.source} · {job.priority} priority</span>
            {job.job_reference_number && <span className="text-xs text-slate-400">Ref: {job.job_reference_number}</span>}
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          <Link href={`/ats/jobs/${jobId}/matches`} className="btn-primary flex items-center gap-2">
            <GitCompareArrows size={14} /> View Matches
          </Link>
          <Link href={`/ats/jobs/${jobId}/edit`} className="btn-secondary flex items-center gap-2">
            <Pencil size={14} /> Edit
          </Link>
        </div>
      </div>

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} className="mb-4" />}

      <div className="card p-6 space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <LinkedField label="Vendor" value={job.vendor_name || job.vendor} href={job.vendor_id ? `/ats/vendors/${job.vendor_id}` : null} />
          <LinkedField
            label="Recruiter"
            value={job.recruiter_contact_name || ([job.recruiter_name, job.recruiter_email, job.recruiter_phone].filter(Boolean).join(" · ") || null)}
            href={job.recruiter_contact_id ? `/ats/recruiters/${job.recruiter_contact_id}` : null}
          />
          <LinkedField label="Client" value={job.client_name || job.client} href={job.client_id ? `/ats/clients/${job.client_id}` : null} />
          <LinkedField label="End Client" value={job.end_client_name || job.end_client} href={job.end_client_id ? `/ats/clients/${job.end_client_id}` : null} />
          <Field label="Location" value={job.location} />
          <Field label="Work Type" value={job.work_type} />
          <Field label="Employment Type" value={job.employment_type} />
          <Field label="Rate" value={rateDisplay ?? null} />
          <Field label="Duration" value={job.duration} />
          <Field label="Visa Requirement" value={job.visa_requirement} />
          <Field label="Clearance" value={job.clearance_requirement} />
          <Field label="Minimum Experience" value={job.minimum_experience} />
          <Field label="Submission Deadline" value={job.submission_deadline} />
          <Field label="Openings" value={job.number_of_openings != null ? String(job.number_of_openings) : null} />
        </div>
        <div><p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Required Skills</p><TagList items={job.required_skills} /></div>
        <div><p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Preferred Skills</p><TagList items={job.preferred_skills} /></div>
        <div><p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Job Description</p><p className="text-sm text-slate-800 mt-0.5 whitespace-pre-wrap">{job.job_description || "—"}</p></div>
        {job.submission_instructions && (
          <div><p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Submission Instructions</p><p className="text-sm text-slate-800 mt-0.5 whitespace-pre-wrap">{job.submission_instructions}</p></div>
        )}
        {job.raw_email_text && (
          <div><p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Raw Email Text</p><p className="text-sm text-slate-600 mt-0.5 whitespace-pre-wrap bg-slate-50 rounded-lg px-3 py-2.5">{job.raw_email_text}</p></div>
        )}
        {job.notes && <div><p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Notes</p><p className="text-sm text-slate-800 mt-0.5 whitespace-pre-wrap">{job.notes}</p></div>}
      </div>

      <div className="card p-6 mt-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-slate-800">Top Employee Matches</h2>
          <Link href={`/ats/jobs/${jobId}/matches`} className="text-sm font-semibold text-indigo-600 hover:text-indigo-800">View all</Link>
        </div>
        {topMatches.length === 0 ? (
          <p className="text-sm text-slate-500">No eligible employees found. Add employees with resumes first.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {topMatches.map((m) => (
              <div key={m.employee_id} className="py-3 flex items-start justify-between gap-3">
                <div>
                  <Link href={`/ats/employees/${m.employee_id}`} className="font-semibold text-indigo-600 hover:text-indigo-800">{m.employee_name}</Link>
                  <p className="text-xs text-slate-500 mt-0.5">{m.primary_skill ?? "—"} · {m.match_reason}</p>
                  {m.compatibility_warnings.length > 0 && (
                    <p className="text-xs text-amber-700 flex items-center gap-1 mt-1"><AlertTriangle size={12} /> {m.compatibility_warnings[0]}</p>
                  )}
                </div>
                <span className="text-lg font-bold text-indigo-600 shrink-0">{m.match_score}%</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card p-6 mt-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-slate-800">Sent to Employees</h2>
          <Link href="/ats/submissions" className="text-sm font-semibold text-indigo-600 hover:text-indigo-800">All sends</Link>
        </div>
        {sends.length === 0 ? (
          <p className="text-sm text-slate-500">No employees contacted yet. Use Send Job on the matches page.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {sends.map((s) => (
              <div key={s.id} className="py-3 flex items-center justify-between gap-3">
                <div>
                  <Link href={`/ats/employees/${s.employee_id}`} className="font-semibold text-indigo-600 hover:text-indigo-800">
                    {s.employee_name ?? `Employee #${s.employee_id}`}
                  </Link>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {s.delivery_status} · {s.employee_response}
                    {s.sent_at && ` · ${new Date(s.sent_at).toLocaleDateString()}`}
                  </p>
                </div>
                {s.match_score_at_send != null && (
                  <span className="text-sm font-bold text-indigo-600">{s.match_score_at_send}%</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

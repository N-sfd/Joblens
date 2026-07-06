"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import ErrorBanner from "@/components/ErrorBanner";
import JobRequirementForm, { jobToForm, formToPayload, type JobFormState } from "@/components/JobRequirementForm";

export default function EditJobRequirementPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const jobId = Number(params.id);

  const [form, setForm] = useState<JobFormState | null>(null);
  const [rawEmail, setRawEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const job = await api.getJobRequirement(jobId);
        setForm(jobToForm(job));
        setRawEmail(job.raw_email_text);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load job.");
      } finally {
        setLoading(false);
      }
    })();
  }, [jobId]);

  const save = async () => {
    if (!form || !form.job_title.trim()) {
      setError("Job title is required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.updateJobRequirement(jobId, formToPayload(form, rawEmail));
      router.push(`/ats/jobs/${jobId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save changes.");
      setSaving(false);
    }
  };

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 size={24} className="animate-spin text-indigo-500" /></div>;
  if (!form) return <div className="p-8 max-w-3xl mx-auto">{error && <ErrorBanner message={error} />}</div>;

  return (
    <div className="p-4 sm:p-8 max-w-4xl mx-auto">
      <Link href={`/ats/jobs/${jobId}`} className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 mb-4">
        <ArrowLeft size={14} /> Back to Job
      </Link>
      <div className="mb-6">
        <p className="page-kicker">ATS</p>
        <h1 className="page-title">Edit Job Requirement</h1>
      </div>
      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} className="mb-4" />}
      <div className="card p-6">
        <JobRequirementForm form={form} onChange={(field, value) => setForm((f) => f ? { ...f, [field]: value } : f)} />
      </div>
      <div className="flex gap-3 justify-end mt-5">
        <button type="button" className="btn-secondary" onClick={() => router.push(`/ats/jobs/${jobId}`)}>Cancel</button>
        <button type="button" className="btn-primary flex items-center gap-2" disabled={saving} onClick={save}>
          {saving ? <><Loader2 size={14} className="animate-spin" /> Saving…</> : "Save Changes"}
        </button>
      </div>
    </div>
  );
}

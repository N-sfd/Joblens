"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Loader2, Sparkles, ArrowLeft, Inbox, PenLine } from "lucide-react";
import clsx from "clsx";
import { api, ApiError } from "@/lib/api";
import ErrorBanner from "@/components/ErrorBanner";
import JobRequirementForm, {
  emptyJobForm, applyParsedToForm, formToPayload, type JobFormState,
} from "@/components/JobRequirementForm";
import type { AlreadyImportedDetail } from "@/types";

type Mode = "paste" | "manual";

function NewJobRequirementPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const emailIdParam = searchParams.get("emailId");
  const emailId = emailIdParam ? Number(emailIdParam) : null;

  const [mode, setMode] = useState<Mode>("paste");
  // Two-option Add Job workflow: "Import from Zoho" (navigates away) or "Add
  // Manually" (reveals the reusable JobRequirementForm below). Skipped when
  // arriving from Zoho Inbox's Parse Job action (emailId already chosen).
  const [chooserStep, setChooserStep] = useState(!emailId);
  const [rawText, setRawText] = useState("");
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [form, setForm] = useState<JobFormState>(() => ({
    ...emptyJobForm(),
    source: emailId ? "Zoho Email" : "Email Copy/Paste",
  }));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [alreadyImported, setAlreadyImported] = useState<AlreadyImportedDetail | null>(null);
  const [loadingEmail, setLoadingEmail] = useState(!!emailId);

  const update = (field: keyof JobFormState, value: string | boolean) =>
    setForm((f) => ({ ...f, [field]: value }));

  useEffect(() => {
    if (!emailId || Number.isNaN(emailId)) return;
    let active = true;
    (async () => {
      setLoadingEmail(true);
      setParseError(null);
      try {
        const [detail, parsed] = await Promise.all([
          api.getImportedEmail(emailId),
          api.parseImportedEmail(emailId),
        ]);
        if (!active) return;
        const raw = [
          detail.subject ? `Subject: ${detail.subject}` : "",
          detail.from_address ? `From: ${detail.from_name || ""} <${detail.from_address}>`.trim() : "",
          detail.body_text || "",
        ].filter(Boolean).join("\n\n");
        setRawText(raw);
        setForm((f) => ({
          ...applyParsedToForm(f, parsed),
          job_description: parsed.summary
            ? `${parsed.summary}\n\n${raw}`
            : (f.job_description || raw),
          source: "Zoho Email",
          status: "Parsed",
        }));
      } catch (e) {
        if (active) setParseError(e instanceof Error ? e.message : "Failed to load email for parsing.");
      } finally {
        if (active) setLoadingEmail(false);
      }
    })();
    return () => { active = false; };
  }, [emailId]);

  const handleParse = async () => {
    if (emailId) {
      setParsing(true);
      setParseError(null);
      try {
        const parsed = await api.parseImportedEmail(emailId);
        setForm((f) => ({
          ...applyParsedToForm(f, parsed),
          job_description: parsed.summary
            ? `${parsed.summary}\n\n${rawText}`
            : (f.job_description || rawText),
          source: "Zoho Email",
        }));
      } catch (e) {
        setParseError(e instanceof Error ? e.message : "Failed to parse job details.");
      } finally {
        setParsing(false);
      }
      return;
    }
    if (rawText.trim().length < 20) {
      setParseError("Paste more of the job email or description to parse.");
      return;
    }
    setParsing(true);
    setParseError(null);
    try {
      const parsed = await api.parseJobRequirement(rawText);
      setForm((f) => ({
        ...applyParsedToForm(f, parsed),
        job_description: parsed.summary
          ? `${parsed.summary}\n\n${rawText}`
          : (f.job_description || rawText),
      }));
    } catch (e) {
      setParseError(e instanceof Error ? e.message : "Failed to parse job details.");
    } finally {
      setParsing(false);
    }
  };

  const handleSave = async () => {
    if (!form.job_title.trim()) {
      setSaveError("Job title is required.");
      return;
    }
    setSaving(true);
    setSaveError(null);
    setAlreadyImported(null);
    try {
      const payload = formToPayload(form, mode === "paste" ? rawText : null);
      if (mode === "manual") payload.source = "Manual";
      if (emailId) payload.source = "Zoho Email";
      payload.status = "Ready for Match";

      const created = emailId
        ? (await api.createJobFromEmail(emailId, payload)).job
        : await api.createJobRequirement(payload);

      router.push(`/ats/jobs/${created.id}`);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409 && e.detail && typeof e.detail === "object") {
        const d = e.detail as AlreadyImportedDetail;
        if (d.code === "already_imported" || d.job_id) {
          setAlreadyImported({
            code: d.code || "already_imported",
            message: d.message || "Already imported",
            job_id: Number(d.job_id),
            recruiter_contact_id: d.recruiter_contact_id ?? null,
            vendor_id: d.vendor_id ?? null,
            client_id: d.client_id ?? null,
          });
          setSaveError("Already imported");
          setSaving(false);
          return;
        }
      }
      setSaveError(e instanceof Error ? e.message : "Failed to save job requirement.");
      setSaving(false);
    }
  };

  if (loadingEmail) {
    return <div className="flex items-center justify-center py-32"><Loader2 size={24} className="animate-spin text-indigo-500" /></div>;
  }

  return (
    <div className="p-4 sm:p-8 max-w-4xl mx-auto">
      <Link href={emailId ? `/ats/zoho-inbox/${emailId}` : "/ats/jobs"} className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 mb-4">
        <ArrowLeft size={14} /> {emailId ? "Back to Email" : "Back to Jobs"}
      </Link>

      <div className="mb-6">
        <p className="page-kicker">ATS</p>
        <h1 className="page-title">{emailId ? "Create Job from Email" : "Add Job"}</h1>
        <p className="page-subtitle">
          {emailId
            ? "Review parsed fields from the Zoho email, then save. Jobs are not created until you confirm."
            : chooserStep
              ? "Import a job from Zoho Inbox, or add one manually."
              : "Paste a job email/description to parse, or enter details manually below."}
        </p>
        {alreadyImported && (
          <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 space-y-2">
            <p className="font-medium">Already imported</p>
            <p className="text-amber-800 text-xs">This Zoho message is already linked. A second job was not created.</p>
            <div className="flex flex-wrap gap-3 text-sm">
              <Link href={`/ats/jobs/${alreadyImported.job_id}`} className="text-indigo-700 font-medium hover:underline">
                Open Job
              </Link>
              {alreadyImported.recruiter_contact_id != null && (
                <Link href={`/ats/contacts/${alreadyImported.recruiter_contact_id}`} className="text-indigo-700 font-medium hover:underline">
                  Open Recruiter
                </Link>
              )}
              {alreadyImported.vendor_id != null && (
                <Link href={`/ats/contacts/companies/${alreadyImported.vendor_id}`} className="text-indigo-700 font-medium hover:underline">
                  Open Company
                </Link>
              )}
            </div>
          </div>
        )}
      </div>

      {!emailId && chooserStep && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
          <Link href="/ats/zoho-inbox" className="card p-6 hover:shadow-md transition-shadow text-left">
            <Inbox size={20} className="text-indigo-600 mb-2" />
            <h2 className="font-bold text-slate-800">Import from Zoho</h2>
            <p className="text-sm text-slate-500 mt-1">Review recruiter emails in the Zoho Inbox and parse a job from one.</p>
          </Link>
          <button type="button" onClick={() => setChooserStep(false)} className="card p-6 hover:shadow-md transition-shadow text-left">
            <PenLine size={20} className="text-indigo-600 mb-2" />
            <h2 className="font-bold text-slate-800">Add Manually</h2>
            <p className="text-sm text-slate-500 mt-1">Paste a job description to parse, or enter job details by hand.</p>
          </button>
        </div>
      )}

      {!emailId && !chooserStep && (
        <div className="flex items-center gap-2 mb-5">
          <button type="button" onClick={() => setChooserStep(true)} className="text-xs text-slate-500 hover:text-slate-800 mr-2">
            ← Choose a different method
          </button>
          {(["paste", "manual"] as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMode(m);
                if (m === "manual") setForm((f) => ({ ...f, source: "Manual", status: f.status === "Parsed" ? "New" : f.status }));
              }}
              className={clsx(
                "px-4 py-2 rounded-lg text-sm font-semibold transition-colors",
                mode === m ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              )}
            >
              {m === "paste" ? "Paste & Parse" : "Manual Entry"}
            </button>
          ))}
        </div>
      )}

      {(emailId || !chooserStep) && mode === "paste" && (
        <div className="card p-6 mb-5">
          <h2 className="font-bold text-slate-800 mb-1">
            {emailId ? "Source Email" : "Paste Job Email / Job Description"}
          </h2>
          <p className="text-sm text-slate-500 mb-3">
            {emailId ? "Re-parse if you need to refresh extracted fields." : "Parse the text, then review and edit before saving."}
          </p>
          {parseError && <ErrorBanner message={parseError} onDismiss={() => setParseError(null)} className="mb-3" />}
          <textarea
            className="textarea"
            rows={8}
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            readOnly={!!emailId}
            placeholder="Paste the job email or description here..."
          />
          <div className="flex justify-end mt-3">
            <button type="button" onClick={handleParse} disabled={parsing} className="btn-primary flex items-center gap-2">
              {parsing ? <><Loader2 size={14} className="animate-spin" /> Parsing…</> : <><Sparkles size={14} /> Parse Job Details</>}
            </button>
          </div>
        </div>
      )}

      {(emailId || !chooserStep) && (
        <>
          <div className="card p-6">
            <h2 className="font-bold text-slate-800 mb-4">Job Details</h2>
            {saveError && <ErrorBanner message={saveError} onDismiss={() => setSaveError(null)} className="mb-4" />}
            <JobRequirementForm form={form} onChange={update} />
          </div>

          <div className="flex gap-3 justify-end mt-5">
            <button type="button" onClick={() => router.push(emailId ? `/ats/zoho-inbox/${emailId}` : "/ats/jobs")} className="btn-secondary">Cancel</button>
            <button type="button" onClick={handleSave} disabled={saving || !form.job_title.trim()} className="btn-primary flex items-center gap-2">
              {saving ? <><Loader2 size={14} className="animate-spin" /> Saving…</> : "Save Job"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default function NewJobRequirementPage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-20"><Loader2 size={24} className="animate-spin text-indigo-500" /></div>}>
      <NewJobRequirementPageInner />
    </Suspense>
  );
}

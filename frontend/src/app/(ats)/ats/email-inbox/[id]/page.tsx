"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Briefcase, Loader2, Sparkles, XCircle } from "lucide-react";
import clsx from "clsx";
import { api } from "@/lib/api";
import type { ImportedEmailDetail } from "@/types";
import ErrorBanner from "@/components/ErrorBanner";

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    weekday: "short", month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

function classificationClass(c: string) {
  switch (c) {
    case "job_req": return "bg-indigo-100 text-indigo-700";
    case "candidate": return "bg-emerald-100 text-emerald-700";
    case "spam": return "bg-red-100 text-red-700";
    case "other": return "bg-slate-100 text-slate-600";
    default: return "bg-amber-100 text-amber-800";
  }
}

export default function EmailDetailPage() {
  const params = useParams();
  const router = useRouter();
  const emailId = Number(params.id);

  const [email, setEmail] = useState<ImportedEmailDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [classifyReason, setClassifyReason] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!emailId || Number.isNaN(emailId)) return;
    setLoading(true);
    try {
      setEmail(await api.getImportedEmail(emailId));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load email.");
    } finally {
      setLoading(false);
    }
  }, [emailId]);

  useEffect(() => { load(); }, [load]);

  const classify = async () => {
    setBusy(true);
    setClassifyReason(null);
    try {
      const res = await api.classifyImportedEmail(emailId);
      setClassifyReason(res.reason);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Classification failed.");
    } finally {
      setBusy(false);
    }
  };

  const dismiss = async () => {
    setBusy(true);
    try {
      await api.updateImportedEmail(emailId, { classification: "other", needs_review: false });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to dismiss email.");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-32"><Loader2 size={24} className="animate-spin text-indigo-500" /></div>;
  }

  if (!email) {
    return (
      <div className="p-8 max-w-3xl mx-auto">
        <ErrorBanner message={error || "Email not found."} className="mb-4" />
        <Link href="/ats/email-inbox" className="text-sm text-indigo-600 hover:text-indigo-800">Back to inbox</Link>
      </div>
    );
  }

  const body = email.body_text || "(No plain-text body — HTML only or empty.)";

  return (
    <div className="p-4 sm:p-8 max-w-4xl mx-auto">
      <Link href="/ats/email-inbox" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 mb-4">
        <ArrowLeft size={14} /> Back to Inbox
      </Link>

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} className="mb-4" />}

      <div className="mb-6">
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <span className={clsx("text-xs font-medium px-2 py-0.5 rounded-full", classificationClass(email.classification))}>
            {email.classification}
          </span>
          {email.needs_review && (
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">Needs review</span>
          )}
        </div>
        <h1 className="page-title text-xl sm:text-2xl">{email.subject || "(no subject)"}</h1>
        <p className="text-sm text-slate-500 mt-1">
          {email.from_name ? `${email.from_name} ` : ""}
          {email.from_address && <span className="text-slate-400">&lt;{email.from_address}&gt;</span>}
          {" · "}{formatDate(email.received_at)}
        </p>
        {classifyReason && (
          <p className="text-sm text-slate-600 mt-2 italic">AI: {classifyReason}</p>
        )}
      </div>

      <div className="flex flex-wrap gap-2 mb-6">
        <button type="button" className="btn-secondary flex items-center gap-2" disabled={busy} onClick={classify}>
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
          Classify
        </button>
        {!email.job_requirement_id ? (
          <button
            type="button"
            className="btn-primary flex items-center gap-2"
            disabled={busy}
            onClick={() => router.push(`/ats/jobs/new?emailId=${email.id}`)}
          >
            <Briefcase size={14} /> Create Job
          </button>
        ) : (
          <Link href={`/ats/jobs/${email.job_requirement_id}`} className="btn-primary flex items-center gap-2">
            <Briefcase size={14} /> View Job #{email.job_requirement_id}
          </Link>
        )}
        <button type="button" className="btn-secondary flex items-center gap-2" disabled={busy} onClick={dismiss}>
          <XCircle size={14} /> Dismiss
        </button>
      </div>

      <div className="card p-6">
        <h2 className="font-semibold text-slate-800 text-sm mb-3">Message</h2>
        <pre className="text-sm text-slate-700 whitespace-pre-wrap font-sans leading-relaxed max-h-[60vh] overflow-y-auto">
          {body}
        </pre>
      </div>
    </div>
  );
}

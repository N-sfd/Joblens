"use client";

import { useEffect, useState } from "react";
import { Copy, Loader2, Send, X } from "lucide-react";
import { api } from "@/lib/api";
import type { JobEmployeeMatch } from "@/types";
import ErrorBanner from "@/components/ErrorBanner";

interface Props {
  jobId: number;
  jobTitle: string;
  match: JobEmployeeMatch;
  onClose: () => void;
  onSent: () => void;
}

export default function SendJobModal({ jobId, jobTitle, match, onClose, onSent }: Props) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [employeeEmail, setEmployeeEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const draft = await api.getJobSendDraft(jobId, match.employee_id);
        if (!active) return;
        setSubject(draft.subject);
        setBody(draft.body);
        setEmployeeEmail(draft.employee_email);
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : "Failed to load email draft.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [jobId, match.employee_id]);

  const copyToClipboard = async () => {
    const text = `To: ${employeeEmail || "(add employee email)"}\nSubject: ${subject}\n\n${body}`;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const markSent = async () => {
    setSaving(true);
    setError(null);
    try {
      await api.createJobSend(jobId, {
        employee_id: match.employee_id,
        message_subject: subject,
        message_body: body,
        mark_sent: true,
      });
      onSent();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to record send.");
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-6 py-4 border-b border-slate-100">
          <div>
            <h2 className="font-bold text-slate-900">Send Job to Candidate</h2>
            <p className="text-sm text-slate-500 mt-0.5">
              {match.employee_name} · {jobTitle} · {match.match_score}% match
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Close">
            <X size={20} />
          </button>
        </div>

        <div className="px-6 py-4 overflow-y-auto flex-1 space-y-4">
          {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 size={24} className="animate-spin text-indigo-500" /></div>
          ) : (
            <>
              <p className="text-xs text-slate-500 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                Review the email below. Copy it to your mail client, send manually, then click <strong>Mark as Sent</strong> to track the outreach.
                {employeeEmail ? ` Candidate email: ${employeeEmail}` : " (No candidate email on file.)"}
              </p>
              <label className="block">
                <span className="label">Subject</span>
                <input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} />
              </label>
              <label className="block">
                <span className="label">Message</span>
                <textarea className="textarea" rows={12} value={body} onChange={(e) => setBody(e.target.value)} />
              </label>
            </>
          )}
        </div>

        {!loading && (
          <div className="flex flex-wrap justify-end gap-2 px-6 py-4 border-t border-slate-100 bg-slate-50/50">
            <button type="button" className="btn-secondary flex items-center gap-2" onClick={copyToClipboard}>
              <Copy size={14} /> {copied ? "Copied!" : "Copy Email"}
            </button>
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="button" className="btn-primary flex items-center gap-2" disabled={saving} onClick={markSent}>
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              Mark as Sent
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

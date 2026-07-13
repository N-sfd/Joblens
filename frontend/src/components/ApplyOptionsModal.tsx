"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { JobRequirement } from "@/types";
import ErrorBanner from "@/components/ErrorBanner";
import {
  X, ExternalLink, Mail, Loader2, CheckCircle, Copy, AlertCircle,
  Sparkles, ArrowLeft, Bookmark, Phone,
} from "lucide-react";
import clsx from "clsx";

interface Props {
  jobId: number;
  /** Skip the choice screen and jump straight to one flow — used by a
   * dedicated "Contact Recruiter" button that doesn't need the chooser. */
  initialView?: "choose" | "employer" | "recruiter";
  onClose: () => void;
  /** Called after any tracker-affecting action succeeds, so the page behind
   * the modal (Discover Jobs / Job Details) can refresh its saved/status state. */
  onUpdated?: () => void;
}

type View = "choose" | "employer" | "recruiter";

function isValidUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export default function ApplyOptionsModal({ jobId, initialView = "choose", onClose, onUpdated }: Props) {
  const [job, setJob] = useState<JobRequirement | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [view, setView] = useState<View>(initialView);
  const [actionError, setActionError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Employer-website flow
  const [appId, setAppId] = useState<number | null>(null);
  const [opening, setOpening] = useState(false);
  const [opened, setOpened] = useState(false);
  const [statusSaving, setStatusSaving] = useState<string | null>(null);
  const [confirmApply, setConfirmApply] = useState(false);

  // Recruiter flow
  const [emailDraft, setEmailDraft] = useState<{ subject: string; body: string } | null>(null);
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailCopied, setEmailCopied] = useState(false);
  const [contacting, setContacting] = useState(false);
  const [contacted, setContacted] = useState(false);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    setLoading(true);
    setLoadError(null);
    api.getPublicJob(jobId)
      .then((j) => {
        setJob(j);
        // Auto-skip the chooser when only one path is actually available.
        if (initialView === "choose") {
          const hasUrl = !!j.application_url;
          const hasRecruiter = !!j.recruiter_email;
          if (hasUrl && !hasRecruiter) setView("employer");
          else if (!hasUrl && hasRecruiter) setView("recruiter");
        }
      })
      .catch((e) => setLoadError(e instanceof Error ? e.message : "This job is no longer available."))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  const openEmployerSite = async () => {
    if (!job?.application_url) {
      setActionError("This job doesn't have an application link yet.");
      return;
    }
    if (!isValidUrl(job.application_url)) {
      setActionError("This application URL doesn't look valid.");
      return;
    }
    setOpening(true);
    setActionError(null);
    const win = window.open(job.application_url, "_blank", "noopener,noreferrer");
    if (!win) {
      setActionError("Your browser blocked the popup. Allow popups for this site, or copy the link below.");
      setOpening(false);
      return;
    }
    try {
      const application = await api.saveExternalJob(jobId, "Application Opened", "employer_website");
      setAppId(application.id);
      setOpened(true);
      showToast("Application opened and added to your Job Tracker.");
      onUpdated?.();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Failed to update your Job Tracker.");
    } finally {
      setOpening(false);
    }
  };

  const setFollowUpStatus = async (status: string) => {
    setStatusSaving(status);
    setActionError(null);
    try {
      await api.saveExternalJob(jobId, status);
      showToast(status === "Applied" ? "Marked as Applied." : `Kept as ${status}.`);
      onUpdated?.();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Failed to update your Job Tracker.");
    } finally {
      setStatusSaving(null);
      setConfirmApply(false);
    }
  };

  const confirmMarkApplied = async () => {
    setStatusSaving("Applied");
    setActionError(null);
    try {
      let id = appId;
      if (!id) {
        const application = await api.saveExternalJob(jobId, "Application Opened", "employer_website");
        id = application.id;
        setAppId(id);
      }
      await api.markApplied(id);
      showToast("Marked as Applied.");
      onUpdated?.();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Failed to update your Job Tracker.");
    } finally {
      setStatusSaving(null);
      setConfirmApply(false);
    }
  };

  const generateRecruiterEmail = async () => {
    setEmailLoading(true);
    setEmailError(null);
    try {
      const application = await api.saveExternalJob(jobId, "Saved", "recruiter_email");
      setAppId(application.id);
      const draft = await api.generateFollowUpEmail(application.id);
      setEmailDraft(draft);
      onUpdated?.();
    } catch (e) {
      setEmailError(e instanceof Error ? e.message : "Failed to generate recruiter email.");
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
    if (!emailDraft || !job?.recruiter_email) return "#";
    return `mailto:${job.recruiter_email}?subject=${encodeURIComponent(emailDraft.subject)}&body=${encodeURIComponent(emailDraft.body)}`;
  };

  const markContacted = async () => {
    setContacting(true);
    setActionError(null);
    try {
      const application = await api.saveExternalJob(jobId, "Recruiter Contacted");
      setAppId(application.id);
      setContacted(true);
      showToast("Marked as contacted — follow-up reminder added.");
      onUpdated?.();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Failed to update your Job Tracker.");
    } finally {
      setContacting(false);
    }
  };

  const addToTracker = async () => {
    setContacting(true);
    setActionError(null);
    try {
      const application = await api.saveExternalJob(jobId, "Saved");
      setAppId(application.id);
      showToast("Added to Job Tracker.");
      onUpdated?.();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Failed to update your Job Tracker.");
    } finally {
      setContacting(false);
    }
  };

  const hasUrl = !!job?.application_url;
  const hasRecruiter = !!job?.recruiter_email;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 sm:p-4">
      <div className="bg-white dark:bg-slate-900 rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-lg max-h-[92vh] sm:max-h-[85vh] overflow-y-auto animate-slide-up flex flex-col">
        {toast && (
          <div className="fixed top-5 right-5 z-[60] bg-slate-900 text-white px-4 py-2.5 rounded-xl shadow-lg text-sm font-medium animate-slide-up flex items-center gap-2">
            <CheckCircle size={14} className="text-emerald-400" /> {toast}
          </div>
        )}

        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 sticky top-0 bg-white dark:bg-slate-900 z-10">
          <div className="min-w-0">
            <h3 className="font-bold text-slate-800 dark:text-slate-100">
              {view === "choose" ? "How would you like to apply?" : view === "employer" ? "Apply on Employer Website" : "Contact Recruiter"}
            </h3>
            {view === "choose" && <p className="text-xs text-slate-400 mt-0.5">Open the employer application page or contact the recruiter for this opportunity.</p>}
            {job && view !== "choose" && <p className="text-xs text-slate-400 mt-0.5 truncate">{job.job_title}{job.client ? ` — ${job.client}` : ""}</p>}
          </div>
          <button type="button" aria-label="Close" onClick={onClose} className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-400 shrink-0">
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-5 flex-1">
          {loading && (
            <div className="flex items-center justify-center gap-2 text-slate-500 py-10">
              <Loader2 size={18} className="animate-spin" /> Loading job…
            </div>
          )}
          {loadError && <ErrorBanner message={loadError} onRetry={() => window.location.reload()} />}

          {job && !loading && !loadError && (
            <>
              {actionError && (
                <ErrorBanner message={actionError} onDismiss={() => setActionError(null)} className="mb-4" />
              )}

              {/* Choice screen */}
              {view === "choose" && (
                <div className="space-y-3">
                  {hasUrl && (
                    <button type="button" onClick={() => setView("employer")}
                      className="w-full text-left border border-slate-200 dark:border-slate-700 hover:border-indigo-400 dark:hover:border-indigo-500 rounded-xl p-4 transition-colors flex items-start gap-3">
                      <span className="w-9 h-9 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 flex items-center justify-center shrink-0">
                        <ExternalLink size={16} className="text-indigo-600 dark:text-indigo-400" />
                      </span>
                      <span>
                        <span className="block font-semibold text-slate-800 dark:text-slate-100 text-sm">Apply on Employer Website</span>
                        <span className="block text-xs text-slate-500 dark:text-slate-400 mt-0.5">Open the employer's application page in a new tab.</span>
                      </span>
                    </button>
                  )}
                  {hasRecruiter && (
                    <button type="button" onClick={() => setView("recruiter")}
                      className="w-full text-left border border-slate-200 dark:border-slate-700 hover:border-emerald-400 dark:hover:border-emerald-500 rounded-xl p-4 transition-colors flex items-start gap-3">
                      <span className="w-9 h-9 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 flex items-center justify-center shrink-0">
                        <Mail size={16} className="text-emerald-600 dark:text-emerald-400" />
                      </span>
                      <span>
                        <span className="block font-semibold text-slate-800 dark:text-slate-100 text-sm">Contact Recruiter</span>
                        <span className="block text-xs text-slate-500 dark:text-slate-400 mt-0.5">Use your saved profile and resume to reach out directly.</span>
                      </span>
                    </button>
                  )}
                  {!hasUrl && !hasRecruiter && (
                    <div className="text-center py-6">
                      <AlertCircle size={24} className="mx-auto mb-2 text-slate-300" />
                      <p className="text-sm text-slate-500 dark:text-slate-400">No application link or recruiter contact is available for this job yet.</p>
                    </div>
                  )}

                  <div className="pt-2 flex items-center gap-2 text-xs text-slate-400">
                    <Sparkles size={12} />
                    <span>Assisted applications are coming in a future release.</span>
                  </div>
                </div>
              )}

              {/* Employer website flow */}
              {view === "employer" && (
                <div className="space-y-4">
                  {initialView === "choose" && (
                    <button type="button" onClick={() => setView("choose")} className="text-xs text-slate-400 hover:text-indigo-600 flex items-center gap-1">
                      <ArrowLeft size={11} /> Back
                    </button>
                  )}
                  {!hasUrl ? (
                    <div className="text-center py-6">
                      <AlertCircle size={24} className="mx-auto mb-2 text-slate-300" />
                      <p className="text-sm text-slate-500 dark:text-slate-400">Application URL unavailable for this job.</p>
                    </div>
                  ) : !opened ? (
                    <>
                      <p className="text-sm text-slate-600 dark:text-slate-400">Opens {job.application_url} in a new tab and adds this job to your Job Tracker as <strong>Application Opened</strong>.</p>
                      <button type="button" onClick={openEmployerSite} disabled={opening}
                        className="btn-primary w-full flex items-center justify-center gap-2">
                        {opening ? <Loader2 size={14} className="animate-spin" /> : <ExternalLink size={14} />}
                        Open Employer Application Page
                      </button>
                    </>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 rounded-lg px-3 py-2.5">
                        <CheckCircle size={14} /> Application opened and added to your Job Tracker.
                      </div>
                      <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">What's the status now?</p>
                      {confirmApply ? (
                        <div className="border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/20 rounded-lg p-3 space-y-2">
                          <p className="text-xs text-slate-600 dark:text-slate-400">Confirm you actually submitted the application on the employer's site?</p>
                          <div className="flex gap-2">
                            <button type="button" onClick={() => setConfirmApply(false)} className="btn-secondary text-xs px-3 py-1.5">Cancel</button>
                            <button type="button" onClick={confirmMarkApplied} disabled={statusSaving === "Applied"}
                              className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1">
                              {statusSaving === "Applied" ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle size={12} />}
                              Yes, Mark as Applied
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 gap-2">
                          <button type="button" onClick={() => setConfirmApply(true)}
                            className="flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-semibold transition-colors">
                            <CheckCircle size={14} /> Mark as Applied
                          </button>
                          <button type="button" disabled={!!statusSaving} onClick={() => setFollowUpStatus("Application Opened")}
                            className="btn-secondary text-sm flex items-center justify-center gap-2">
                            Keep as Application Opened
                          </button>
                          <button type="button" disabled={!!statusSaving} onClick={() => setFollowUpStatus("Application In Progress")}
                            className="btn-secondary text-sm flex items-center justify-center gap-2">
                            {statusSaving === "Application In Progress" ? <Loader2 size={12} className="animate-spin" /> : null}
                            Save as Application In Progress
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Contact recruiter flow */}
              {view === "recruiter" && (
                <div className="space-y-4">
                  {initialView === "choose" && (
                    <button type="button" onClick={() => setView("choose")} className="text-xs text-slate-400 hover:text-indigo-600 flex items-center gap-1">
                      <ArrowLeft size={11} /> Back
                    </button>
                  )}
                  {!hasRecruiter ? (
                    <div className="text-center py-6">
                      <AlertCircle size={24} className="mx-auto mb-2 text-slate-300" />
                      <p className="text-sm text-slate-500 dark:text-slate-400">Recruiter information unavailable for this job.</p>
                    </div>
                  ) : (
                    <>
                      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs bg-slate-50 dark:bg-slate-800/60 rounded-lg p-3">
                        <span className="text-slate-400">Name</span><span className="text-slate-700 dark:text-slate-300">{job.recruiter_name || "—"}</span>
                        <span className="text-slate-400">Company</span><span className="text-slate-700 dark:text-slate-300">{job.vendor || "—"}</span>
                        <span className="text-slate-400 flex items-center gap-1"><Mail size={11} /> Email</span><span className="text-slate-700 dark:text-slate-300 truncate">{job.recruiter_email || "—"}</span>
                        <span className="text-slate-400 flex items-center gap-1"><Phone size={11} /> Phone</span><span className="text-slate-700 dark:text-slate-300">{job.recruiter_phone || "—"}</span>
                        <span className="text-slate-400">Job Title</span><span className="text-slate-700 dark:text-slate-300">{job.job_title}</span>
                        {job.job_reference_number && <><span className="text-slate-400">Reference #</span><span className="text-slate-700 dark:text-slate-300">{job.job_reference_number}</span></>}
                      </div>

                      {!emailDraft && !emailLoading && (
                        <button type="button" onClick={generateRecruiterEmail} className="btn-primary w-full flex items-center justify-center gap-2 text-sm">
                          <Sparkles size={14} /> Generate Recruiter Email
                        </button>
                      )}
                      {emailLoading && (
                        <div className="flex items-center justify-center gap-2 text-slate-500 py-6">
                          <Loader2 size={16} className="animate-spin" /> Drafting recruiter email…
                        </div>
                      )}
                      {emailError && <ErrorBanner message={emailError} onDismiss={() => setEmailError(null)} onRetry={generateRecruiterEmail} />}
                      {emailDraft && (
                        <div className="space-y-2">
                          <p className="text-sm font-medium text-slate-800 dark:text-slate-100 bg-slate-50 dark:bg-slate-800/60 rounded-lg px-3 py-2">{emailDraft.subject}</p>
                          <p className="text-sm text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/60 rounded-lg px-3 py-3 whitespace-pre-wrap leading-relaxed max-h-40 overflow-y-auto">{emailDraft.body}</p>
                          <div className="flex flex-wrap gap-2">
                            <button type="button" onClick={copyEmail}
                              className={clsx("flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg transition-all", emailCopied ? "bg-green-100 text-green-700" : "btn-secondary")}>
                              {emailCopied ? <><CheckCircle size={12} /> Copied!</> : <><Copy size={12} /> Copy Email</>}
                            </button>
                            <a href={mailtoHref()} className="btn-primary flex items-center gap-1.5 text-xs px-3 py-2">
                              <Mail size={12} /> Create Email Draft
                            </a>
                          </div>
                        </div>
                      )}

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                        <button type="button" onClick={markContacted} disabled={contacting || contacted}
                          className={clsx("text-sm font-semibold px-4 py-2.5 rounded-lg transition-colors flex items-center justify-center gap-1.5",
                            contacted ? "bg-teal-50 dark:bg-teal-950/30 text-teal-700 dark:text-teal-400" : "bg-teal-600 hover:bg-teal-700 text-white")}>
                          {contacting ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle size={13} />}
                          {contacted ? "Marked as Contacted" : "Mark as Contacted"}
                        </button>
                        <button type="button" onClick={addToTracker} disabled={contacting}
                          className="btn-secondary text-sm flex items-center justify-center gap-1.5">
                          <Bookmark size={13} /> Add to Tracker
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import type { JobRequirement, MatchResult, MatchHistoryEntry } from "@/types";
import ApplyOptionsModal from "@/components/ApplyOptionsModal";
import ScoreCircle from "@/components/ScoreCircle";
import {
  ArrowLeft, MapPin, Briefcase, Building2, Mail, Phone, CalendarDays,
  Target, Bookmark, CheckCircle, Loader2, Send,
  Tag, AlertCircle, Lightbulb, BookOpen, Info, Inbox, Archive,
} from "lucide-react";

export default function JobDetailsPage() {
  const params = useParams<{ jobId: string }>();
  const router = useRouter();
  const jobId = Number(params.jobId);

  const [job, setJob] = useState<JobRequirement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // True when the live job is gone (closed/unpublished/removed) and we're
  // rendering from this user's own saved snapshot instead. Never shown to a
  // user who never saved or tracked the job — see the load effect below.
  const [isClosed, setIsClosed] = useState(false);

  const [match, setMatch] = useState<MatchResult | null>(null);

  const [tracked, setTracked] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [applyView, setApplyView] = useState<"choose" | "employer" | "recruiter" | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const refreshTrackedState = () => {
    api.listJobs().then((rows) => {
      setTracked(rows.some((r) => r.source_job_requirement_id === jobId));
    }).catch(() => {});
  };

  useEffect(() => {
    if (!Number.isFinite(jobId)) return;
    setLoading(true);
    setError(null);
    setIsClosed(false);

    api.getPublicJob(jobId)
      .then(setJob)
      .catch(async () => {
        // Live job unavailable (closed/unpublished/removed). Only fall back
        // to a historical snapshot if THIS user actually saved or tracked
        // it — never expose it to someone who never had access.
        try {
          const rows = await api.listJobs();
          const entry = rows.find((r) => r.source_job_requirement_id === jobId && r.job_snapshot_json);
          if (entry?.job_snapshot_json) {
            setJob(JSON.parse(entry.job_snapshot_json) as JobRequirement);
            setIsClosed(true);
          } else {
            setError("This job is no longer available.");
          }
        } catch {
          setError("This job is no longer available.");
        }
      })
      .finally(() => setLoading(false));

    // Show existing match info if one was already run — never generate a new one here.
    api.getMatchHistory().then((rows: MatchHistoryEntry[]) => {
      const entry = rows.find((r) => (r as unknown as { job_requirement_id?: number | null }).job_requirement_id === jobId);
      if (entry) setMatch(entry.match);
    }).catch(() => {});

    refreshTrackedState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  const saveJob = async (status: string, label: string) => {
    setSaving(status);
    try {
      await api.saveExternalJob(jobId, status);
      setTracked(true);
      showToast(label);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save this job.");
    } finally {
      setSaving(null);
    }
  };

  if (loading) {
    return (
      <div className="p-4 sm:p-8 max-w-5xl mx-auto flex items-center justify-center gap-2 text-slate-400 text-sm py-24">
        <Loader2 size={18} className="animate-spin" /> Loading job…
      </div>
    );
  }

  if (error || !job) {
    return (
      <div className="p-4 sm:p-8 max-w-3xl mx-auto">
        <Link href="/jobs/discover" className="text-sm text-indigo-600 hover:underline flex items-center gap-1 mb-6">
          <ArrowLeft size={14} /> Back to Discover Jobs
        </Link>
        <div className="card p-10 text-center">
          <Inbox size={32} className="mx-auto mb-3 text-slate-300" />
          <p className="font-semibold text-slate-700 dark:text-slate-300 mb-1">This job is no longer available.</p>
          <p className="text-sm text-slate-400 mb-4">{error || "It may have closed, been unpublished, or removed."}</p>
          <Link href="/jobs/discover" className="btn-primary text-sm">Browse Discover Jobs</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-8 max-w-5xl mx-auto pb-28">
      {toast && (
        <div className="fixed top-5 right-5 z-50 bg-slate-900 text-white px-4 py-2.5 rounded-xl shadow-lg text-sm font-medium animate-slide-up flex items-center gap-2">
          <CheckCircle size={14} className="text-emerald-400" /> {toast}
        </div>
      )}

      <Link href="/jobs/discover" className="text-sm text-indigo-600 hover:underline flex items-center gap-1 mb-5">
        <ArrowLeft size={14} /> Back to Discover Jobs
      </Link>

      {isClosed && (
        <div className="flex items-center gap-2.5 bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 mb-5">
          <Archive size={16} className="text-slate-400 shrink-0" />
          <p className="text-sm text-slate-600 dark:text-slate-300">
            <strong>No longer available.</strong> This job has closed or been unpublished — you're viewing the details as saved when you tracked it.
          </p>
        </div>
      )}

      {/* Header */}
      <div className="card p-6 mb-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <p className="text-sm text-slate-400 flex items-center gap-1.5 mb-1">
              <Building2 size={13} /> {job.client || job.vendor || "Unknown company"}
              {job.job_reference_number && <span>· Ref #{job.job_reference_number}</span>}
            </p>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{job.job_title}</h1>
          </div>
          {isClosed ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-2.5 py-1 rounded-full shrink-0">
              <Archive size={11} /> Closed
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-700 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900/50 px-2.5 py-1 rounded-full shrink-0">
              <Info size={11} /> {job.status}
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-3 text-sm text-slate-500 dark:text-slate-400">
          {job.location && <span className="flex items-center gap-1"><MapPin size={13} /> {job.location}</span>}
          {job.work_type && <span>{job.work_type}</span>}
          {job.employment_type && <span>{job.employment_type}</span>}
          {job.duration && <span>{job.duration}</span>}
          {job.rate && <span className="font-semibold text-slate-700 dark:text-slate-300">{job.rate}</span>}
          {job.received_at && <span className="flex items-center gap-1"><CalendarDays size={13} /> Received {new Date(job.received_at).toLocaleDateString()}</span>}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          {/* Description */}
          <div className="card p-5">
            <h3 className="font-semibold text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2">
              <Briefcase size={15} className="text-indigo-500" /> Job Description
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 whitespace-pre-wrap leading-relaxed">
              {job.job_description || "No description provided."}
            </p>
            {job.visa_requirement && (
              <p className="text-xs text-slate-400 mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                <strong className="text-slate-500 dark:text-slate-400">Work authorization:</strong> {job.visa_requirement}
              </p>
            )}
          </div>

          {/* Skills */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="card p-5">
              <h3 className="font-semibold text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2">
                <Tag size={15} className="text-indigo-500" /> Required Skills
              </h3>
              <div className="flex flex-wrap gap-2">
                {job.required_skills.length === 0 && <p className="text-sm text-slate-400">Not specified.</p>}
                {job.required_skills.map((s, i) => (
                  <span key={i} className="px-2.5 py-1 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 rounded-full text-xs font-medium">{s}</span>
                ))}
              </div>
            </div>
            <div className="card p-5">
              <h3 className="font-semibold text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2">
                <Tag size={15} className="text-blue-500" /> Preferred Skills
              </h3>
              <div className="flex flex-wrap gap-2">
                {job.preferred_skills.length === 0 && <p className="text-sm text-slate-400">Not specified.</p>}
                {job.preferred_skills.map((s, i) => (
                  <span key={i} className="px-2.5 py-1 bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400 rounded-full text-xs font-medium">{s}</span>
                ))}
              </div>
            </div>
          </div>

          {/* Existing match info, if any */}
          {match ? (
            <div className="card p-6 animate-slide-up">
              <div className="flex flex-col sm:flex-row items-center gap-5 mb-5">
                <ScoreCircle score={match.match_score} label="Match Score" size={110} />
                <div className="flex-1 text-center sm:text-left">
                  <p className="font-semibold text-slate-800 dark:text-slate-100 mb-1">Why You Match</p>
                  <p className="text-sm text-slate-600 dark:text-slate-400">{match.summary}</p>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">Matching Skills</p>
                  <div className="flex flex-wrap gap-1.5">
                    {match.matching_skills.map((s, i) => <span key={i} className="px-2 py-0.5 bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400 rounded-full text-[11px] font-medium">{s}</span>)}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">Missing Skills</p>
                  <div className="flex flex-wrap gap-1.5">
                    {match.missing_skills.map((s, i) => <span key={i} className="px-2 py-0.5 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 rounded-full text-[11px] font-medium">{s}</span>)}
                  </div>
                </div>
              </div>
              {match.tailoring_suggestions.length > 0 && (
                <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                  <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2 flex items-center gap-1"><Lightbulb size={12} /> Resume Recommendations</p>
                  <ul className="space-y-1.5">
                    {match.tailoring_suggestions.slice(0, 3).map((s, i) => (
                      <li key={i} className="text-sm text-slate-600 dark:text-slate-400 flex items-start gap-2">
                        <span className="text-amber-400 font-bold shrink-0">→</span> {s.suggestion}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {match.interview_preparation.length > 0 && (
                <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                  <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2 flex items-center gap-1"><BookOpen size={12} /> Interview Preparation</p>
                  <ul className="space-y-1.5">
                    {match.interview_preparation.slice(0, 3).map((t, i) => (
                      <li key={i} className="text-sm text-slate-600 dark:text-slate-400 flex items-start gap-2">
                        <span className="text-purple-400 font-bold shrink-0">→</span> {t}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : !isClosed ? (
            <div className="card p-5 flex items-center justify-between gap-3 flex-wrap">
              <p className="text-sm text-slate-500 dark:text-slate-400 flex items-center gap-2"><AlertCircle size={14} className="text-amber-500" /> No match analysis yet for this job.</p>
              <button type="button" onClick={() => router.push(`/match?atsJob=${jobId}`)} className="btn-primary text-sm flex items-center gap-1.5">
                <Target size={13} /> Analyze Match
              </button>
            </div>
          ) : null}
        </div>

        {/* Right column: recruiter + actions */}
        <div className="space-y-5">
          <div className="card p-5">
            <h3 className="font-semibold text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2">
              <Briefcase size={15} className="text-indigo-500" /> Recruiter
            </h3>
            <div className="space-y-2 text-sm">
              <p className="flex items-center gap-2 text-slate-700 dark:text-slate-300"><span className="text-slate-400 w-16 shrink-0 text-xs">Name</span> {job.recruiter_name || "—"}</p>
              <p className="flex items-center gap-2 text-slate-700 dark:text-slate-300"><span className="text-slate-400 w-16 shrink-0 text-xs">Company</span> {job.vendor || "—"}</p>
              <p className="flex items-center gap-2 text-slate-700 dark:text-slate-300 truncate"><Mail size={12} className="text-slate-400 shrink-0" /> {job.recruiter_email || "—"}</p>
              <p className="flex items-center gap-2 text-slate-700 dark:text-slate-300"><Phone size={12} className="text-slate-400 shrink-0" /> {job.recruiter_phone || "—"}</p>
            </div>
            {job.recruiter_email && (
              <button type="button" onClick={() => setApplyView("recruiter")} className="btn-secondary text-sm w-full mt-4 flex items-center justify-center gap-1.5">
                <Mail size={13} /> Contact Recruiter
              </button>
            )}
          </div>

          {!isClosed && (
            <div className="card p-5 space-y-2">
              <button type="button" onClick={() => setApplyView("choose")}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-semibold transition-colors">
                <Send size={14} /> Apply Now
              </button>
              <button type="button" onClick={() => router.push(`/match?atsJob=${jobId}`)}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-semibold transition-colors">
                <Target size={14} /> Analyze Match
              </button>
              <button type="button" disabled={saving === "Saved"} onClick={() => saveJob("Saved", "Saved to Job Tracker")}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg text-sm font-semibold transition-colors disabled:opacity-60">
                {saving === "Saved" ? <Loader2 size={14} className="animate-spin" /> : <Bookmark size={14} />}
                {tracked ? "Saved to Tracker" : "Save Job"}
              </button>
              <button type="button" onClick={async () => { await saveJob("Saved", "Added to Job Tracker"); router.push("/jobs"); }}
                className="w-full btn-secondary text-sm flex items-center justify-center gap-1.5">
                <ArrowLeft size={13} /> Add to Tracker
              </button>
            </div>
          )}
        </div>
      </div>

      {applyView && (
        <ApplyOptionsModal
          jobId={jobId}
          initialView={applyView}
          onClose={() => setApplyView(null)}
          onUpdated={refreshTrackedState}
        />
      )}

      {/* Sticky action bar for long descriptions */}
      {!isClosed && (
        <div className="fixed bottom-0 left-0 right-0 md:left-64 bg-white/90 dark:bg-slate-900/90 backdrop-blur-sm border-t border-slate-200 dark:border-slate-800 px-4 py-3 flex items-center justify-center gap-2 z-30">
          <button type="button" onClick={() => setApplyView("choose")} className="btn-primary text-sm flex items-center gap-1.5">
            <Send size={14} /> Apply Now
          </button>
          <button type="button" onClick={() => router.push(`/match?atsJob=${jobId}`)} className="btn-secondary text-sm flex items-center gap-1.5">
            <Target size={14} /> Analyze Match
          </button>
          <button type="button" disabled={saving === "Saved"} onClick={() => saveJob("Saved", "Saved to Job Tracker")} className="btn-secondary text-sm flex items-center gap-1.5">
            <Bookmark size={14} /> {tracked ? "Saved" : "Save Job"}
          </button>
        </div>
      )}
    </div>
  );
}

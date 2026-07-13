"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/AuthContext";
import type { PublicJobListing, MatchHistoryEntry, JobApplication } from "@/types";
import ErrorBanner from "@/components/ErrorBanner";
import ApplyOptionsModal from "@/components/ApplyOptionsModal";
import {
  Compass, RefreshCw, Search, MapPin, Building2, Mail, Bookmark,
  Loader2, Target, ArrowRight, Inbox, WifiOff, BarChart3, Sparkles,
  CheckCircle, Send,
} from "lucide-react";
import clsx from "clsx";

function matchQuality(score: number): { label: string; color: string } {
  if (score >= 85) return { label: "Excellent Match", color: "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400" };
  if (score >= 70) return { label: "Strong Match", color: "bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400" };
  if (score >= 50) return { label: "Fair Match", color: "bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400" };
  return { label: "Low Match", color: "bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-400" };
}

function timeAgo(iso: string | null) {
  if (!iso) return null;
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86400000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function DiscoverJobsPage() {
  const router = useRouter();
  const { user } = useAuth();

  const [jobs, setJobs] = useState<PublicJobListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const [search, setSearch] = useState("");
  const [location, setLocation] = useState("");
  const [workType, setWorkType] = useState("");
  const [employmentType, setEmploymentType] = useState("");
  const [client, setClient] = useState("");
  const [skills, setSkills] = useState("");
  const [sourceFilter, setSourceFilter] = useState<"all" | "published" | "email">("all");
  const [sort, setSort] = useState<"newest" | "best_match">("newest");

  const [matchScores, setMatchScores] = useState<Record<number, number>>({});
  const [trackedJobIds, setTrackedJobIds] = useState<Set<number>>(new Set());
  const [savingId, setSavingId] = useState<number | null>(null);
  const [applyJobId, setApplyJobId] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.listPublicJobs({
        q: search || undefined,
        location: location || undefined,
        work_type: workType || undefined,
        employment_type: employmentType || undefined,
        client: client || undefined,
        skills: skills || undefined,
        page_size: 50,
      });
      setJobs(res.items);
      setLastUpdated(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't reach the job source.");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    api.getMatchHistory().then((rows: MatchHistoryEntry[]) => {
      const scores: Record<number, number> = {};
      for (const r of rows) {
        const jrId = (r as unknown as { job_requirement_id?: number | null }).job_requirement_id;
        if (jrId != null && !(jrId in scores)) scores[jrId] = r.match.match_score;
      }
      setMatchScores(scores);
    }).catch(() => {});
    api.listJobs().then((rows: JobApplication[]) => {
      const ids = new Set<number>();
      for (const r of rows) {
        const srcId = (r as unknown as { source_job_requirement_id?: number | null }).source_job_requirement_id;
        if (srcId != null) ids.add(srcId);
      }
      setTrackedJobIds(ids);
    }).catch(() => {});
  }, []);

  const saveJob = async (jobId: number, status: string, label: string) => {
    setSavingId(jobId);
    try {
      await api.saveExternalJob(jobId, status);
      setTrackedJobIds((prev) => new Set(prev).add(jobId));
      showToast(label);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save this job.");
    } finally {
      setSavingId(null);
    }
  };

  const refreshTrackedState = () => {
    api.listJobs().then((rows) => {
      setTrackedJobIds(new Set(rows.map((r) => r.source_job_requirement_id).filter((id): id is number => id != null)));
    }).catch(() => {});
  };

  const publishedCount = jobs.filter((j) => j.source !== "Zoho Mail").length;
  const emailCount = jobs.filter((j) => j.source === "Zoho Mail").length;

  let visible = jobs.filter((j) => {
    if (sourceFilter === "published") return j.source !== "Zoho Mail";
    if (sourceFilter === "email") return j.source === "Zoho Mail";
    return true;
  });
  if (sort === "best_match") {
    visible = [...visible].sort((a, b) => (matchScores[b.id] ?? -1) - (matchScores[a.id] ?? -1));
  }

  const activeFilters = search || location || workType || employmentType || client || skills;

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto">
      {toast && (
        <div className="fixed top-5 right-5 z-50 bg-slate-900 text-white px-4 py-2.5 rounded-xl shadow-lg text-sm font-medium animate-slide-up flex items-center gap-2">
          <CheckCircle size={14} className="text-emerald-400" /> {toast}
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-6">
        <div>
          <p className="page-kicker">Discover</p>
          <h1 className="page-title">Welcome back{user?.name ? `, ${user.name.split(" ")[0]}` : ""}</h1>
          <p className="page-subtitle">
            {loading ? "Loading jobs…" : `${visible.length} matching job${visible.length === 1 ? "" : "s"}`}
            {lastUpdated && <> · Updated {lastUpdated.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={load} disabled={loading} className="btn-secondary flex items-center gap-2 text-sm">
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Refresh Jobs
          </button>
          <Link href="/dashboard" className="btn-secondary flex items-center gap-2 text-sm">
            <BarChart3 size={14} /> View Analytics
          </Link>
        </div>
      </div>

      {/* Job source cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <button type="button" onClick={() => setSourceFilter("all")}
          className={clsx("card p-4 text-left transition-all", sourceFilter === "all" && "ring-2 ring-indigo-500")}>
          <Compass size={16} className="text-indigo-500 mb-2" />
          <p className="text-xl font-bold text-slate-900 dark:text-white">{jobs.length}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">All Jobs</p>
        </button>
        <button type="button" onClick={() => setSourceFilter("published")}
          className={clsx("card p-4 text-left transition-all", sourceFilter === "published" && "ring-2 ring-indigo-500")}>
          <Sparkles size={16} className="text-emerald-500 mb-2" />
          <p className="text-xl font-bold text-slate-900 dark:text-white">{publishedCount}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">Published Jobs</p>
        </button>
        <button type="button" onClick={() => setSourceFilter("email")}
          className={clsx("card p-4 text-left transition-all", sourceFilter === "email" && "ring-2 ring-indigo-500")}>
          <Mail size={16} className="text-blue-500 mb-2" />
          <p className="text-xl font-bold text-slate-900 dark:text-white">{emailCount}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">Email-Imported Jobs</p>
        </button>
        <Link href="/jobs" className="card p-4 text-left transition-all hover:ring-2 hover:ring-indigo-500">
          <Bookmark size={16} className="text-purple-500 mb-2" />
          <p className="text-xl font-bold text-slate-900 dark:text-white">{trackedJobIds.size}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">Saved / Manual Jobs — open Tracker</p>
        </Link>
      </div>

      {/* Filters */}
      <div className="card p-4 mb-5 space-y-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className="input pl-8" placeholder="Search title, client, vendor, skills…" value={search}
              onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === "Enter" && load()} />
          </div>
          <select className="input w-auto text-sm" aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value as "newest" | "best_match")}>
            <option value="newest">Newest</option>
            <option value="best_match">Best Match</option>
          </select>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <input className="input text-sm" placeholder="Location" value={location}
            onChange={(e) => setLocation(e.target.value)} onBlur={load} onKeyDown={(e) => e.key === "Enter" && load()} />
          <select className="input text-sm" aria-label="Work arrangement" value={workType}
            onChange={(e) => { setWorkType(e.target.value); load(); }}>
            <option value="">All work arrangements</option>
            <option value="Remote">Remote</option>
            <option value="Hybrid">Hybrid</option>
            <option value="Onsite">Onsite</option>
          </select>
          <input className="input text-sm" placeholder="Employment type" value={employmentType}
            onChange={(e) => setEmploymentType(e.target.value)} onBlur={load} onKeyDown={(e) => e.key === "Enter" && load()} />
          <input className="input text-sm" placeholder="Client" value={client}
            onChange={(e) => setClient(e.target.value)} onBlur={load} onKeyDown={(e) => e.key === "Enter" && load()} />
        </div>
        <input className="input text-sm" placeholder="Skills (comma-separated)" value={skills}
          onChange={(e) => setSkills(e.target.value)} onBlur={load} onKeyDown={(e) => e.key === "Enter" && load()} />
        {activeFilters && (
          <button type="button" onClick={() => { setSearch(""); setLocation(""); setWorkType(""); setEmploymentType(""); setClient(""); setSkills(""); load(); }}
            className="text-xs text-slate-500 dark:text-slate-400 hover:text-indigo-600 transition-colors">
            Clear Filters
          </button>
        )}
      </div>

      {/* Job grid */}
      {loading ? (
        <div className="flex items-center justify-center gap-2 text-slate-400 text-sm py-16">
          <Loader2 size={18} className="animate-spin" /> Loading jobs…
        </div>
      ) : error ? (
        <div className="card p-10 text-center">
          <WifiOff size={32} className="mx-auto mb-3 text-slate-300" />
          <p className="font-semibold text-slate-700 dark:text-slate-300 mb-1">External job source unavailable.</p>
          <p className="text-sm text-slate-400 mb-4">{error}</p>
          <div className="flex items-center justify-center gap-2">
            <button type="button" onClick={load} className="btn-secondary text-sm">Retry</button>
            <Link href="/match" className="btn-primary text-sm">Paste Job Manually</Link>
          </div>
        </div>
      ) : visible.length === 0 ? (
        <div className="card p-10 text-center">
          <Inbox size={32} className="mx-auto mb-3 text-slate-300" />
          <p className="font-semibold text-slate-700 dark:text-slate-300 mb-1">No approved open jobs are currently available.</p>
          <p className="text-sm text-slate-400 mb-4">Recruiters publish new jobs regularly — check back soon.</p>
          <div className="flex items-center justify-center gap-2">
            <button type="button" onClick={load} className="btn-secondary text-sm flex items-center gap-1.5"><RefreshCw size={13} /> Refresh Jobs</button>
            <Link href="/match" className="btn-primary text-sm">Paste Job Manually</Link>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {visible.map((job) => {
            const score = matchScores[job.id];
            const quality = score != null ? matchQuality(score) : null;
            const isSaved = trackedJobIds.has(job.id);
            const extraSkills = Math.max(0, job.required_skills.length - 4);
            return (
              <div key={job.id} className="card p-5 flex flex-col">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="min-w-0">
                    <p className="text-xs text-slate-400 flex items-center gap-1">
                      <Building2 size={11} /> {job.client || job.vendor || "Unknown company"}
                      {job.job_reference_number && <span className="text-slate-300 dark:text-slate-600">· Ref #{job.job_reference_number}</span>}
                    </p>
                    <Link href={`/jobs/${job.id}`} className="font-semibold text-slate-900 dark:text-white hover:text-indigo-600 transition-colors">
                      {job.job_title}
                    </Link>
                  </div>
                  <span className={clsx("text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0", job.source === "Zoho Mail" ? "bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400" : "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400")}>
                    {job.source === "Zoho Mail" ? "Email-Imported" : "Published"}
                  </span>
                </div>

                {quality && (
                  <div className="mb-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className={clsx("text-xs font-semibold px-2 py-0.5 rounded-full", quality.color)}>{quality.label}</span>
                      <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">{score}%</span>
                    </div>
                    <div className="h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                      <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${Math.min(100, Math.max(0, score))}%` }} />
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400 mb-3">
                  {job.location && <span className="flex items-center gap-1"><MapPin size={11} /> {job.location}</span>}
                  {job.work_type && <span>{job.work_type}</span>}
                  {job.employment_type && <span>{job.employment_type}</span>}
                  {job.rate && <span className="font-medium text-slate-700 dark:text-slate-300">{job.rate}</span>}
                  {job.received_at && <span>{timeAgo(job.received_at)}</span>}
                </div>

                {job.required_skills.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-4">
                    {job.required_skills.slice(0, 4).map((s, i) => (
                      <span key={i} className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-full text-[11px] font-medium">{s}</span>
                    ))}
                    {extraSkills > 0 && <span className="px-2 py-0.5 text-slate-400 text-[11px]">+{extraSkills} more</span>}
                  </div>
                )}

                <div className="mt-auto flex flex-wrap items-center gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                  <button type="button" onClick={() => setApplyJobId(job.id)}
                    className="text-xs px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white transition-colors flex items-center gap-1 font-semibold">
                    <Send size={11} /> Apply Now
                  </button>
                  <Link href={`/jobs/${job.id}`} className="btn-secondary text-xs px-3 py-1.5 flex items-center gap-1">
                    View Details <ArrowRight size={11} />
                  </Link>
                  <button type="button" onClick={() => router.push(`/match?atsJob=${job.id}`)}
                    className="text-xs px-3 py-1.5 rounded-lg bg-purple-50 dark:bg-purple-950/30 text-purple-700 dark:text-purple-400 hover:bg-purple-100 dark:hover:bg-purple-950/50 transition-colors flex items-center gap-1 font-semibold">
                    <Target size={11} /> Analyze Match
                  </button>
                  <button type="button" disabled={savingId === job.id}
                    onClick={() => saveJob(job.id, "Saved", isSaved ? "Already saved" : "Saved to Job Tracker")}
                    className={clsx("text-xs px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1 font-semibold",
                      isSaved ? "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400" : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700")}>
                    {savingId === job.id ? <Loader2 size={11} className="animate-spin" /> : <Bookmark size={11} />}
                    {isSaved ? "Saved" : "Save Job"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {applyJobId != null && (
        <ApplyOptionsModal
          jobId={applyJobId}
          onClose={() => setApplyJobId(null)}
          onUpdated={refreshTrackedState}
        />
      )}
    </div>
  );
}

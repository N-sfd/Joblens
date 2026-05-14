"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { getLog, clearLog, seedSampleActivity, type ActivityEntry } from "@/lib/activityLog";
import type { JobApplication, JobStats } from "@/types";
import StatusBadge from "@/components/StatusBadge";
import {
  Briefcase, FileText, Target, PenTool, TrendingUp, ArrowRight,
  CheckCircle, Clock, Trophy, XCircle, Plus, Bot, Trash2,
} from "lucide-react";

const statCards = [
  { key: "total",        label: "Total",        icon: Briefcase,   color: "bg-indigo-50 text-indigo-600" },
  { key: "Applied",      label: "Applied",      icon: Clock,       color: "bg-blue-50 text-blue-600" },
  { key: "Interviewing", label: "Interviewing", icon: TrendingUp,  color: "bg-purple-50 text-purple-600" },
  { key: "Offer",        label: "Offers",        icon: Trophy,      color: "bg-green-50 text-green-600" },
  { key: "Rejected",     label: "Rejected",     icon: XCircle,     color: "bg-red-50 text-red-600" },
];

const quickActions = [
  { href: "/resume",       label: "Analyze Resume",  desc: "Get ATS score & feedback",  icon: FileText, color: "bg-indigo-600" },
  { href: "/jobs",         label: "Add Application", desc: "Track a new job",           icon: Plus,     color: "bg-blue-600" },
  { href: "/match",        label: "Match to Job",    desc: "Check fit score",           icon: Target,   color: "bg-purple-600" },
  { href: "/cover-letter", label: "Cover Letter",    desc: "AI-generated letter",       icon: PenTool,  color: "bg-emerald-600" },
];

const activityIcons: Record<string, React.ReactNode> = {
  resume_analyzed:         <FileText size={13} className="text-indigo-500" />,
  job_matched:             <Target size={13} className="text-purple-500" />,
  job_saved:               <Briefcase size={13} className="text-blue-500" />,
  bullets_generated:       <CheckCircle size={13} className="text-emerald-500" />,
  questions_generated:     <Bot size={13} className="text-amber-500" />,
  cover_letter_generated:  <PenTool size={13} className="text-pink-500" />,
  job_added:               <Plus size={13} className="text-green-500" />,
  status_changed:          <TrendingUp size={13} className="text-slate-500" />,
  job_deleted:             <XCircle size={13} className="text-red-400" />,
};

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<JobStats | null>(null);
  const [recent, setRecent] = useState<JobApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [s, j] = await Promise.all([api.getStats(), api.listJobs()]);
      setStats(s);
      setRecent(j.slice(0, 5));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
    setActivity(getLog());
  }, []);

  useEffect(() => {
    seedSampleActivity(); // fills the log with demo entries if empty
    loadData();
    const onFocus = () => loadData();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [loadData]);

  const getCount = (key: string) => {
    if (!stats) return 0;
    return key === "total" ? stats.total : (stats.by_status[key] ?? 0);
  };

  return (
    <div className="p-4 sm:p-8 max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
        <p className="text-slate-500 mt-1">Track your job search progress and use AI tools to stand out.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-8">
        {statCards.map(({ key, label, icon: Icon, color }) => (
          <div key={key} className="card p-4">
            <div className={`w-9 h-9 rounded-lg ${color} flex items-center justify-center mb-3`}>
              <Icon size={18} />
            </div>
            <p className="text-2xl font-bold text-slate-900">
              {loading
                ? <span className="inline-block w-8 h-7 bg-slate-100 rounded animate-pulse" />
                : getCount(key)}
            </p>
            <p className="text-xs text-slate-500 mt-0.5 font-medium">{label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Applications */}
        <div className="lg:col-span-2 space-y-6">
          <div className="card">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h2 className="font-semibold text-slate-800">Recent Applications</h2>
              <Link href="/jobs" className="text-indigo-600 text-sm font-medium hover:text-indigo-700 flex items-center gap-1">
                View all <ArrowRight size={14} />
              </Link>
            </div>
            <div className="divide-y divide-slate-100">
              {loading
                ? Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="px-5 py-3.5 flex items-center justify-between">
                      <div className="space-y-1.5">
                        <div className="h-4 w-32 bg-slate-100 rounded animate-pulse" />
                        <div className="h-3 w-24 bg-slate-100 rounded animate-pulse" />
                      </div>
                      <div className="h-5 w-20 bg-slate-100 rounded-full animate-pulse" />
                    </div>
                  ))
                : recent.length === 0
                  ? (
                    <div className="px-5 py-10 text-center">
                      <Briefcase className="mx-auto text-slate-300 mb-2" size={28} />
                      <p className="text-slate-500 text-sm">No applications yet.</p>
                      <Link href="/jobs" className="text-indigo-600 text-sm font-medium hover:underline mt-1 inline-block">
                        Add your first job
                      </Link>
                    </div>
                  )
                  : recent.map((job) => (
                    <div key={job.id} className="px-5 py-3.5 flex items-center justify-between hover:bg-slate-50 transition-colors">
                      <div>
                        <p className="text-sm font-semibold text-slate-800">{job.company}</p>
                        <p className="text-xs text-slate-500">{job.role}{job.location ? ` · ${job.location}` : ""}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        {job.date_applied && (
                          <span className="text-xs text-slate-400 hidden sm:block">
                            {new Date(job.date_applied).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                          </span>
                        )}
                        <StatusBadge status={job.status} />
                      </div>
                    </div>
                  ))
              }
            </div>
          </div>

          {/* AI Activity History */}
          <div className="card">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Bot size={15} className="text-indigo-500" />
                <h2 className="font-semibold text-slate-800">AI Activity</h2>
              </div>
              {activity.length > 0 && (
                <button
                  type="button"
                  onClick={() => { clearLog(); setActivity([]); }}
                  className="text-xs text-slate-400 hover:text-red-500 flex items-center gap-1 transition-colors"
                >
                  <Trash2 size={11} /> Clear
                </button>
              )}
            </div>
            {activity.length === 0 ? (
              <div className="px-5 py-8 text-center">
                <Bot className="mx-auto text-slate-200 mb-2" size={28} />
                <p className="text-slate-400 text-sm">No AI activity yet.</p>
                <p className="text-slate-400 text-xs mt-1">Analyze a resume or match a job to see history here.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {activity.slice(0, 8).map((entry) => (
                  <div key={entry.id} className="px-5 py-3 flex items-start gap-3 hover:bg-slate-50 transition-colors">
                    <div className="w-6 h-6 rounded-lg bg-slate-100 flex items-center justify-center shrink-0 mt-0.5">
                      {activityIcons[entry.type] ?? <Bot size={13} className="text-slate-400" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-700">{entry.summary}</p>
                      {entry.detail && <p className="text-xs text-slate-400 mt-0.5 truncate">{entry.detail}</p>}
                    </div>
                    <span className="text-xs text-slate-400 shrink-0">{timeAgo(entry.timestamp)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="space-y-3">
          <h2 className="font-semibold text-slate-800 px-1">Quick Actions</h2>
          {quickActions.map(({ href, label, desc, icon: Icon, color }) => (
            <Link key={href} href={href}
              className="card p-4 flex items-center gap-4 hover:shadow-md hover:-translate-y-0.5 transition-all duration-150 group block">
              <div className={`${color} w-10 h-10 rounded-xl flex items-center justify-center shrink-0`}>
                <Icon size={18} className="text-white" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-800 group-hover:text-indigo-600 transition-colors">{label}</p>
                <p className="text-xs text-slate-500">{desc}</p>
              </div>
              <ArrowRight size={14} className="text-slate-300 group-hover:text-indigo-500 ml-auto shrink-0 transition-colors" />
            </Link>
          ))}

          <div className="card p-4 bg-gradient-to-br from-indigo-50 to-purple-50 border-indigo-100">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle size={14} className="text-indigo-600" />
              <p className="text-xs font-semibold text-indigo-700">Pro Tip</p>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Tailor your resume for each application. Run the Job Matcher to see your fit score before applying.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

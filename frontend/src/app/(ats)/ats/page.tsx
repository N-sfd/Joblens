"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Loader2, Users, Armchair, Briefcase, Inbox, GitCompareArrows, Send, Mail,
  CalendarCheck, BadgeCheck, UserCheck, Sparkles,
} from "lucide-react";
import { api } from "@/lib/api";
import type { AtsDashboardStats } from "@/types";
import ErrorBanner from "@/components/ErrorBanner";

function Card({ label, value, href, icon: Icon, tone }: {
  label: string; value: number; href: string; icon: React.ElementType; tone: string;
}) {
  return (
    <Link href={href} className="card p-5 hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-2xl font-bold text-slate-900">{value}</p>
          <p className="text-sm text-slate-500 mt-0.5">{label}</p>
        </div>
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${tone}`}>
          <Icon size={18} />
        </div>
      </div>
    </Link>
  );
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function AtsDashboardPage() {
  const [stats, setStats] = useState<AtsDashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      setStats(await api.getAtsDashboardStats());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load dashboard.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  if (loading) {
    return <div className="flex items-center justify-center py-32"><Loader2 size={24} className="animate-spin text-indigo-500" /></div>;
  }

  if (!stats) {
    return (
      <div className="p-8 max-w-6xl mx-auto">
        {error && <ErrorBanner message={error} onRetry={load} />}
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-8 max-w-6xl mx-auto">
      <div className="mb-6">
        <p className="page-kicker">Consult America</p>
        <h1 className="page-title">ATS Dashboard</h1>
        <p className="page-subtitle">Overview of your staffing pipeline.</p>
      </div>

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} onRetry={load} className="mb-4" />}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <Card label="Total Employees" value={stats.total_employees ?? stats.active_employees + stats.bench_employees} href="/ats/employees" icon={Users} tone="bg-slate-100 text-slate-600" />
        <Card label="Active Employees" value={stats.active_employees} href="/ats/employees" icon={Users} tone="bg-green-50 text-green-600" />
        <Card label="Bench Employees" value={stats.bench_employees} href="/ats/employees" icon={Armchair} tone="bg-amber-50 text-amber-600" />
        <Card label="Available Now" value={stats.available_now ?? 0} href="/ats/employees" icon={UserCheck} tone="bg-emerald-50 text-emerald-600" />
        <Card label="Open Jobs" value={stats.open_jobs} href="/ats/jobs" icon={Briefcase} tone="bg-indigo-50 text-indigo-600" />
        <Card label="New Jobs Today" value={stats.new_jobs_today ?? 0} href="/ats/jobs" icon={Sparkles} tone="bg-violet-50 text-violet-600" />
        <Card label="Zoho Awaiting Review" value={stats.zoho_emails_awaiting_review ?? 0} href="/ats/email-inbox?needs_review=true" icon={Inbox} tone="bg-blue-50 text-blue-600" />
        <Card label="Ready for Match" value={stats.pending_matches} href="/ats/jobs" icon={GitCompareArrows} tone="bg-purple-50 text-purple-600" />
        <Card label="Pending Responses" value={stats.pending_employee_responses} href="/ats/job-sends?filter=pending" icon={Mail} tone="bg-orange-50 text-orange-600" />
        <Card label="Active Submissions" value={stats.submissions} href="/ats/submissions" icon={Send} tone="bg-cyan-50 text-cyan-600" />
        <Card label="Interviews" value={stats.interviews} href="/ats/interviews" icon={CalendarCheck} tone="bg-teal-50 text-teal-600" />
        <Card label="Offers" value={stats.offers} href="/ats/offers" icon={BadgeCheck} tone="bg-rose-50 text-rose-600" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
        <div className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-slate-900">Recently Imported Zoho Job Emails</h3>
            <Link href="/ats/email-inbox" className="text-xs text-indigo-600 hover:underline">View inbox</Link>
          </div>
          {(stats.recent_zoho_emails?.length ?? 0) > 0 ? (
            <ul className="divide-y divide-slate-100">
              {stats.recent_zoho_emails!.map((e) => (
                <li key={e.id} className="py-2">
                  <Link href={`/ats/email-inbox/${e.id}`} className="text-sm font-medium text-indigo-600 hover:text-indigo-800 line-clamp-1">
                    {e.subject || "(no subject)"}
                  </Link>
                  <p className="text-xs text-slate-400">{e.from_name ?? "Unknown"} · {formatDate(e.imported_at)}</p>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-slate-400">No recent Zoho emails.</p>}
        </div>

        <div className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-slate-900">Jobs Needing Review</h3>
            <Link href="/ats/jobs" className="text-xs text-indigo-600 hover:underline">All jobs</Link>
          </div>
          {(stats.jobs_needing_review?.length ?? 0) > 0 ? (
            <ul className="divide-y divide-slate-100">
              {stats.jobs_needing_review!.map((j) => (
                <li key={j.id} className="py-2 flex justify-between gap-3">
                  <Link href={`/ats/jobs/${j.id}`} className="text-sm font-medium text-indigo-600 hover:text-indigo-800">{j.job_title}</Link>
                  <span className="text-xs text-slate-400 shrink-0">{j.status}</span>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-slate-400">No jobs awaiting review.</p>}
        </div>

        <div className="card p-5">
          <h3 className="font-semibold text-slate-900 mb-3">Top New Job Matches</h3>
          {(stats.top_matches?.length ?? 0) > 0 ? (
            <ul className="divide-y divide-slate-100">
              {stats.top_matches!.map((m) => (
                <li key={`${m.job_requirement_id}-${m.employee_id}`} className="py-2 flex justify-between gap-3">
                  <div>
                    <Link href={`/ats/jobs/${m.job_requirement_id}/matches`} className="text-sm font-medium text-indigo-600 hover:text-indigo-800">
                      {m.job_title ?? `Job #${m.job_requirement_id}`}
                    </Link>
                    <p className="text-xs text-slate-400">{m.employee_name ?? `Employee #${m.employee_id}`}</p>
                  </div>
                  <span className="text-sm font-semibold text-slate-700 shrink-0">{m.match_score != null ? `${m.match_score}%` : "—"}</span>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-slate-400">Send jobs to employees to see scored matches here.</p>}
        </div>

        <div className="card p-5">
          <h3 className="font-semibold text-slate-900 mb-3">Recently Added Employees</h3>
          {stats.recent_employees.length > 0 ? (
            <ul className="divide-y divide-slate-100">
              {stats.recent_employees.map((e) => (
                <li key={e.id} className="py-2">
                  <Link href={`/ats/employees/${e.id}`} className="text-sm font-medium text-indigo-600 hover:text-indigo-800">{e.name}</Link>
                  <span className="text-xs text-slate-400 ml-2">{e.primary_skill ?? ""}</span>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-slate-400">No employees yet.</p>}
        </div>

        <div className="card p-5">
          <h3 className="font-semibold text-slate-900 mb-3">Upcoming Submission Deadlines</h3>
          {(stats.upcoming_deadlines?.length ?? 0) > 0 ? (
            <ul className="divide-y divide-slate-100">
              {stats.upcoming_deadlines!.map((d) => (
                <li key={d.id} className="py-2 flex justify-between gap-4">
                  <Link href={`/ats/jobs/${d.id}`} className="text-sm font-medium text-indigo-600 hover:text-indigo-800">{d.job_title}</Link>
                  <span className="text-xs text-slate-500 shrink-0">{d.submission_deadline}{d.vendor ? ` · ${d.vendor}` : ""}</span>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-slate-400">No upcoming deadlines.</p>}
        </div>

        <div className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-slate-900">Recent CRM Activity</h3>
            <Link href="/ats/activities" className="text-xs text-indigo-600 hover:underline">All activity</Link>
          </div>
          {(stats.recent_activities?.length ?? 0) > 0 ? (
            <ul className="divide-y divide-slate-100">
              {stats.recent_activities!.map((a) => (
                <li key={a.id} className="py-2">
                  <p className="text-sm font-medium text-slate-800">{a.subject || a.activity_type}</p>
                  <p className="text-xs text-slate-400">{a.activity_type} · {formatDate(a.activity_date)} · {a.status}</p>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-slate-400">No CRM activity yet.</p>}
        </div>
      </div>

      <p className="text-xs text-slate-400 mt-2">
        {stats.organizations} organizations · {stats.contacts} contacts in CRM
        {stats.new_email_jobs > 0 ? ` · ${stats.new_email_jobs} email-sourced jobs` : ""}
      </p>
    </div>
  );
}

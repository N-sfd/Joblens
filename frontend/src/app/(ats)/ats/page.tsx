"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Loader2, Users, Armchair, Briefcase, Inbox, GitCompareArrows, Send, CalendarCheck, BadgeCheck,
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
        <Card label="Active Employees" value={stats.active_employees} href="/ats/employees" icon={Users} tone="bg-green-50 text-green-600" />
        <Card label="Bench Employees" value={stats.bench_employees} href="/ats/employees" icon={Armchair} tone="bg-amber-50 text-amber-600" />
        <Card label="Open Jobs" value={stats.open_jobs} href="/ats/jobs" icon={Briefcase} tone="bg-indigo-50 text-indigo-600" />
        <Card label="New Email Jobs" value={stats.new_email_jobs} href="/ats/email-inbox" icon={Inbox} tone="bg-blue-50 text-blue-600" />
        <Card label="Pending Matches" value={stats.pending_matches} href="/ats/jobs" icon={GitCompareArrows} tone="bg-purple-50 text-purple-600" />
        <Card label="Submissions" value={stats.submissions} href="/ats/submissions" icon={Send} tone="bg-cyan-50 text-cyan-600" />
        <Card label="Interviews" value={stats.interviews} href="/ats/interviews" icon={CalendarCheck} tone="bg-teal-50 text-teal-600" />
        <Card label="Offers" value={stats.offers} href="/ats/offers" icon={BadgeCheck} tone="bg-rose-50 text-rose-600" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="card p-5">
          <h3 className="font-semibold text-slate-900 mb-3">Recently Added Jobs</h3>
          {stats.recent_jobs.length > 0 ? (
            <ul className="divide-y divide-slate-100">
              {stats.recent_jobs.map((j) => (
                <li key={j.id} className="py-2">
                  <Link href={`/ats/jobs/${j.id}`} className="text-sm font-medium text-indigo-600 hover:text-indigo-800">{j.job_title}</Link>
                  <span className="text-xs text-slate-400 ml-2">{j.vendor ?? ""}</span>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-slate-400">No jobs yet.</p>}
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
      </div>

      <p className="text-xs text-slate-400 mt-6">
        {stats.organizations} organizations · {stats.contacts} contacts in CRM
      </p>
    </div>
  );
}

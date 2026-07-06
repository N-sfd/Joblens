"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Loader2, Users, Armchair, Briefcase, Inbox, GitCompareArrows, Send, CalendarCheck, BadgeCheck,
} from "lucide-react";
import { api } from "@/lib/api";
import type { Employee, JobRequirement, CRMOrganization, CRMContact } from "@/types";
import ErrorBanner from "@/components/ErrorBanner";

const OPEN_JOB_STATUSES = new Set([
  "New", "Needs Review", "Parsed", "Ready for Match", "Matched",
  "Sent to Employee", "Employee Interested", "Interested", "On Hold",
]);

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
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [jobs, setJobs] = useState<JobRequirement[]>([]);
  const [orgs, setOrgs] = useState<CRMOrganization[]>([]);
  const [contacts, setContacts] = useState<CRMContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [e, j, o, c] = await Promise.all([
        api.getEmployees({ page_size: 100 }),
        api.getJobRequirements({ page_size: 100 }),
        api.getOrganizations(),
        api.getContacts(),
      ]);
      setEmployees(e.items ?? []);
      setJobs(j.items ?? []);
      setOrgs(o ?? []);
      setContacts(c ?? []);
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

  const activeEmployees = employees.filter((e) => e.status === "Active").length;
  const benchEmployees = employees.filter((e) => e.status === "Bench").length;
  const openJobs = jobs.filter((j) => OPEN_JOB_STATUSES.has(j.status)).length;
  const emailJobs = jobs.filter((j) => (j.source ?? "").toLowerCase().includes("zoho") || (j.source ?? "").toLowerCase().includes("email")).length;
  const pendingMatches = jobs.filter((j) => ["Ready for Match", "Parsed", "New"].includes(j.status)).length;
  const submissions = jobs.filter((j) => j.status === "Submitted").length;
  const interviews = jobs.filter((j) => j.status === "Interview").length;
  const offers = jobs.filter((j) => j.status === "Selected").length;

  return (
    <div className="p-4 sm:p-8 max-w-6xl mx-auto">
      <div className="mb-6">
        <p className="page-kicker">Consult America</p>
        <h1 className="page-title">ATS Dashboard</h1>
        <p className="page-subtitle">Overview of your staffing pipeline.</p>
      </div>

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} onRetry={load} className="mb-4" />}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <Card label="Active Employees" value={activeEmployees} href="/ats/employees" icon={Users} tone="bg-green-50 text-green-600" />
        <Card label="Bench Employees" value={benchEmployees} href="/ats/employees" icon={Armchair} tone="bg-amber-50 text-amber-600" />
        <Card label="Open Jobs" value={openJobs} href="/ats/jobs" icon={Briefcase} tone="bg-indigo-50 text-indigo-600" />
        <Card label="New Email Jobs" value={emailJobs} href="/ats/email-inbox" icon={Inbox} tone="bg-blue-50 text-blue-600" />
        <Card label="Pending Matches" value={pendingMatches} href="/ats/jobs" icon={GitCompareArrows} tone="bg-purple-50 text-purple-600" />
        <Card label="Submissions" value={submissions} href="/ats/submissions" icon={Send} tone="bg-cyan-50 text-cyan-600" />
        <Card label="Interviews" value={interviews} href="/ats/interviews" icon={CalendarCheck} tone="bg-teal-50 text-teal-600" />
        <Card label="Offers" value={offers} href="/ats/offers" icon={BadgeCheck} tone="bg-rose-50 text-rose-600" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="card p-5">
          <h3 className="font-semibold text-slate-900 mb-3">Recently Added Jobs</h3>
          {jobs.length > 0 ? (
            <ul className="divide-y divide-slate-100">
              {jobs.slice(0, 6).map((j) => (
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
          {employees.length > 0 ? (
            <ul className="divide-y divide-slate-100">
              {employees.slice(0, 6).map((e) => (
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
        {orgs.length} organizations · {contacts.length} contacts in CRM
      </p>
    </div>
  );
}

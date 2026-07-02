"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Users, Briefcase, Building2, UserRound } from "lucide-react";
import { api } from "@/lib/api";
import type { Employee, JobRequirement, CRMOrganization, CRMContact } from "@/types";
import ErrorBanner from "@/components/ErrorBanner";

interface Metrics {
  employees: Employee[];
  jobs: JobRequirement[];
  orgs: CRMOrganization[];
  contacts: CRMContact[];
}

function Card({ label, value, href, icon: Icon }: { label: string; value: number; href: string; icon: React.ElementType }) {
  return (
    <Link href={href} className="card p-5 hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-2xl font-bold text-slate-900">{value}</p>
          <p className="text-sm text-slate-500 mt-0.5">{label}</p>
        </div>
        <div className="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center">
          <Icon size={18} className="text-indigo-600" />
        </div>
      </div>
    </Link>
  );
}

export default function AtsDashboardPage() {
  const [data, setData] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [employees, jobs, orgs, contacts] = await Promise.all([
        api.getEmployees(),
        api.getJobRequirements(),
        api.getOrganizations(),
        api.getContacts(),
      ]);
      setData({ employees, jobs, orgs, contacts });
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load dashboard.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  if (loading) {
    return <div className="flex items-center justify-center py-32"><Loader2 size={24} className="animate-spin text-indigo-500" /></div>;
  }

  const activeEmployees = data?.employees.filter((e) => e.status === "Active").length ?? 0;
  const benchEmployees = data?.employees.filter((e) => e.status === "Bench").length ?? 0;
  const openJobs = data?.jobs.filter((j) => !["Closed", "Rejected", "Duplicate", "Spam"].includes(j.status)).length ?? 0;
  const urgentJobs = data?.jobs.filter((j) => j.priority === "Urgent").length ?? 0;
  const activeVendors = data?.orgs.filter((o) => o.status === "Active" && o.organization_type === "Staffing Vendor").length ?? 0;
  const recruiters = data?.contacts.filter((c) => c.contact_type === "Recruiter" && c.status === "Active").length ?? 0;

  return (
    <div className="p-4 sm:p-8 max-w-6xl mx-auto">
      <div className="mb-6">
        <p className="page-kicker">Consult America</p>
        <h1 className="page-title">ATS Dashboard</h1>
        <p className="page-subtitle">Overview of your staffing pipeline.</p>
      </div>

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} onRetry={load} className="mb-4" />}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card label="Active Employees" value={activeEmployees} href="/employees" icon={Users} />
        <Card label="Bench Employees" value={benchEmployees} href="/employees" icon={Users} />
        <Card label="Open Job Requirements" value={openJobs} href="/job-requirements" icon={Briefcase} />
        <Card label="Urgent Requirements" value={urgentJobs} href="/job-requirements" icon={Briefcase} />
        <Card label="Active Vendors" value={activeVendors} href="/crm/vendors" icon={Building2} />
        <Card label="Active Recruiters" value={recruiters} href="/crm/recruiters" icon={UserRound} />
        <Card label="Total Employees" value={data?.employees.length ?? 0} href="/employees" icon={Users} />
        <Card label="Total Jobs" value={data?.jobs.length ?? 0} href="/job-requirements" icon={Briefcase} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="card p-5">
          <h3 className="font-semibold text-slate-900 mb-3">Recently Added Jobs</h3>
          {data && data.jobs.length > 0 ? (
            <ul className="divide-y divide-slate-100">
              {data.jobs.slice(0, 6).map((j) => (
                <li key={j.id} className="py-2">
                  <Link href={`/job-requirements/${j.id}`} className="text-sm font-medium text-indigo-600 hover:text-indigo-800">{j.job_title}</Link>
                  <span className="text-xs text-slate-400 ml-2">{j.vendor ?? ""}</span>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-slate-400">No jobs yet.</p>}
        </div>
        <div className="card p-5">
          <h3 className="font-semibold text-slate-900 mb-3">Recently Added Employees</h3>
          {data && data.employees.length > 0 ? (
            <ul className="divide-y divide-slate-100">
              {data.employees.slice(0, 6).map((e) => (
                <li key={e.id} className="py-2">
                  <Link href={`/employees/${e.id}`} className="text-sm font-medium text-indigo-600 hover:text-indigo-800">{e.name}</Link>
                  <span className="text-xs text-slate-400 ml-2">{e.primary_skill ?? ""}</span>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-slate-400">No employees yet.</p>}
        </div>
      </div>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Briefcase, Inbox, Users, Send, CalendarCheck, BadgeCheck, Award, BellRing,
  Plus, FileUp, GitCompareArrows, UserPlus, Loader2, CheckCircle2, ExternalLink,
} from "lucide-react";
import clsx from "clsx";
import { api } from "@/lib/api";
import type { DashboardSummaryResponse } from "@/types";
import ErrorBanner from "@/components/ErrorBanner";
import { useAtsRole } from "@/lib/atsRole";

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatDateTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function relatedLink(item: {
  job_requirement_id: number | null;
  contact_id: number | null;
  organization_id: number | null;
  employee_id: number | null;
}): { href: string; label: string } | null {
  if (item.job_requirement_id) return { href: `/ats/jobs/${item.job_requirement_id}`, label: "job" };
  if (item.employee_id) return { href: `/ats/candidates/${item.employee_id}`, label: "candidate" };
  if (item.contact_id) return { href: `/ats/contacts/${item.contact_id}`, label: "contact" };
  if (item.organization_id) return { href: `/ats/contacts/companies/${item.organization_id}`, label: "company" };
  return null;
}

function relatedName(item: {
  job_title: string | null;
  employee_name: string | null;
  contact_name: string | null;
  organization_name: string | null;
}): string | null {
  return item.job_title || item.employee_name || item.contact_name || item.organization_name || null;
}

type CardDef = {
  key: keyof DashboardSummaryResponse["counts"];
  label: string;
  subtitle: string;
  href: string;
  icon: React.ElementType;
  tone: string;
};

const CARDS: CardDef[] = [
  { key: "open_jobs", label: "Open Jobs", subtitle: "Currently open requirements", href: "/ats/jobs?status_group=open", icon: Briefcase, tone: "bg-indigo-50 text-indigo-600" },
  { key: "new_zoho_jobs", label: "New Zoho Jobs", subtitle: "Imported in the last 7 days", href: "/ats/jobs?source=zoho&created_within_days=7", icon: Inbox, tone: "bg-blue-50 text-blue-600" },
  { key: "active_candidates", label: "Active Candidates", subtitle: "Available for placement", href: "/ats/candidates?status_group=active", icon: Users, tone: "bg-emerald-50 text-emerald-600" },
  { key: "candidates_submitted", label: "Candidates Submitted", subtitle: "Currently with a client", href: "/ats/pipeline?stage_group=submitted", icon: Send, tone: "bg-cyan-50 text-cyan-600" },
  { key: "interviews_scheduled", label: "Interviews Scheduled", subtitle: "Upcoming interviews", href: "/ats/pipeline?stage=interview_scheduled", icon: CalendarCheck, tone: "bg-teal-50 text-teal-600" },
  { key: "offers", label: "Offers", subtitle: "Open offers in play", href: "/ats/pipeline?stage_group=offer", icon: BadgeCheck, tone: "bg-rose-50 text-rose-600" },
  { key: "placements", label: "Placements", subtitle: "Candidates placed", href: "/ats/pipeline?stage_group=placed", icon: Award, tone: "bg-amber-50 text-amber-600" },
  { key: "follow_ups_due", label: "Follow-Ups Due", subtitle: "Open tasks with a due date", href: "/ats/pipeline?follow_up=due", icon: BellRing, tone: "bg-orange-50 text-orange-600" },
];

const QUICK_ACTIONS = [
  { label: "Import Job from Zoho", href: "/ats/email-inbox", icon: Inbox },
  { label: "Add Job", href: "/ats/jobs/new", icon: Briefcase },
  { label: "Add Candidate", href: "/ats/candidates/new", icon: UserPlus },
  { label: "Add Contact", href: "/ats/contacts/new", icon: UserPlus },
  { label: "Parse Resume", href: "/ats/candidates/new?mode=resume", icon: FileUp },
  { label: "Match Candidate", href: "/ats/candidates", icon: GitCompareArrows },
  { label: "Create Submission", href: "/ats/pipeline", icon: Send },
];

export default function AtsDashboardPage() {
  const { loading: roleLoading, hasAtsAccess, canWrite, error: roleError } = useAtsRole();
  const [data, setData] = useState<DashboardSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [completingId, setCompletingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await api.getDashboardSummary());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Dashboard failed to load.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (roleLoading || !hasAtsAccess) return;
    void load();
  }, [roleLoading, hasAtsAccess, load]);

  const markComplete = async (id: number) => {
    setCompletingId(id);
    try {
      await api.updateActivity(id, { status: "Done" });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update follow-up.");
    } finally {
      setCompletingId(null);
    }
  };

  if (roleLoading || (loading && !data)) {
    return <div className="flex items-center justify-center py-32"><Loader2 size={24} className="animate-spin text-indigo-500" /></div>;
  }

  if (!data) {
    return (
      <div className="p-4 sm:p-8 max-w-6xl mx-auto">
        <ErrorBanner message={error || roleError || "Dashboard failed to load."} onRetry={load} />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-8 max-w-6xl mx-auto">
      <div className="mb-6">
        <p className="page-kicker">Recruitment CRM + ATS</p>
        <h1 className="page-title">Dashboard</h1>
        <p className="page-subtitle">
          {data.scope === "own" ? "Your jobs, candidates, and follow-ups." : "Organization-wide overview."}
        </p>
      </div>

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} onRetry={load} className="mb-4" />}

      {!data.zoho_connected && (
        <div className="mb-6 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-blue-800">Zoho Mail is not connected — recruiter job emails won&apos;t import automatically.</p>
          <Link href="/ats/settings/zoho" className="btn-primary text-xs !py-1.5 shrink-0">Connect Zoho</Link>
        </div>
      )}

      {/* Quick actions */}
      <div className="flex flex-wrap gap-2 mb-6">
        {QUICK_ACTIONS.map(({ label, href, icon: Icon }) => (
          <Link
            key={label}
            href={href}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-colors"
          >
            <Icon size={14} className="text-indigo-600" /> {label}
          </Link>
        ))}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-6">
        {CARDS.map(({ key, label, subtitle, href, icon: Icon, tone }) => (
          <Link key={key} href={href} className="card p-4 sm:p-5 hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-2xl font-bold text-slate-900">{data.counts[key] ?? 0}</p>
                <p className="text-xs sm:text-sm font-medium text-slate-700 mt-0.5 truncate">{label}</p>
                <p className="text-[11px] text-slate-400 mt-0.5 truncate">{subtitle}</p>
              </div>
              <div className={clsx("w-9 h-9 rounded-lg flex items-center justify-center shrink-0", tone)}>
                <Icon size={16} />
              </div>
            </div>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Main column */}
        <div className="lg:col-span-2 space-y-5">
          {/* Pipeline overview */}
          <div className="card p-5">
            <h3 className="font-semibold text-slate-900 mb-4">Pipeline Overview</h3>
            <div className="flex overflow-x-auto gap-2 pb-1 -mx-1 px-1">
              {data.pipeline.map((stage) => (
                <Link
                  key={stage.stage}
                  href={`/ats/pipeline?stage=${encodeURIComponent(stage.stage.toLowerCase().replace(/ /g, "_"))}`}
                  className="shrink-0 min-w-[104px] rounded-lg border border-slate-100 bg-slate-50 hover:bg-slate-100 transition-colors px-3 py-2.5 text-center"
                >
                  <p className="text-lg font-bold text-slate-900">{stage.count}</p>
                  <p className="text-[11px] text-slate-500 leading-tight mt-0.5">{stage.stage}</p>
                </Link>
              ))}
            </div>
          </div>

          {/* Recent activity */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-slate-900">Recent Activity</h3>
              <Link href="/ats/reports?tab=activity" className="text-xs text-indigo-600 hover:underline">View report</Link>
            </div>
            {data.recent_activities.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-8">No recent activity yet.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {data.recent_activities.map((a) => {
                  const link = relatedLink(a);
                  const name = relatedName(a);
                  return (
                    <li key={a.id} className="py-2.5 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-800 truncate">{a.subject || a.activity_type}</p>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {a.activity_type}
                          {name ? ` · ${name}` : ""}
                          {a.created_by ? ` · ${a.created_by}` : ""}
                          {" · "}{formatDateTime(a.activity_date)}
                        </p>
                      </div>
                      {link && (
                        <Link href={link.href} className="text-xs text-indigo-600 hover:underline shrink-0 flex items-center gap-1">
                          Open <ExternalLink size={11} />
                        </Link>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        {/* Secondary column */}
        <div className="space-y-5">
          {/* Follow-ups due */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-slate-900">Follow-Ups Due</h3>
              <Link href="/ats/pipeline?follow_up=due" className="text-xs text-indigo-600 hover:underline">View due</Link>
            </div>
            {data.follow_ups_due.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-6">No follow-ups due.</p>
            ) : (
              <ul className="space-y-2.5">
                {data.follow_ups_due.map((f) => {
                  const link = relatedLink(f);
                  const name = relatedName(f);
                  return (
                    <li key={f.id} className="rounded-lg border border-slate-100 p-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-800 truncate">{f.subject || "Follow-up"}</p>
                          {name && <p className="text-xs text-slate-400 truncate">{name}</p>}
                        </div>
                        <span className={clsx(
                          "text-[11px] font-medium px-2 py-0.5 rounded-full shrink-0",
                          f.overdue ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-600",
                        )}>
                          {f.overdue ? "Overdue" : formatDate(f.due_date)}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-2">
                        {canWrite && (
                          <button
                            type="button"
                            disabled={completingId === f.id}
                            onClick={() => markComplete(f.id)}
                            className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:text-emerald-800 disabled:opacity-50"
                          >
                            {completingId === f.id ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
                            Mark Complete
                          </button>
                        )}
                        {link && (
                          <Link href={link.href} className="text-xs font-medium text-indigo-600 hover:underline">
                            Open Record
                          </Link>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* New jobs from Zoho */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-slate-900">New Jobs from Zoho</h3>
              <Link href="/ats/email-inbox" className="text-xs text-indigo-600 hover:underline">Zoho Inbox</Link>
            </div>
            {data.recent_zoho_jobs.length === 0 ? (
              <div className="text-center py-6">
                <p className="text-sm text-slate-400">No jobs imported from Zoho yet.</p>
                <Link href="/ats/email-inbox" className="text-xs text-indigo-600 hover:underline mt-1 inline-block">
                  {data.zoho_connected ? "Import First Job" : "Connect Zoho"}
                </Link>
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {data.recent_zoho_jobs.map((j) => (
                  <li key={j.id} className="py-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <Link href={`/ats/jobs/${j.id}`} className="text-sm font-medium text-indigo-600 hover:text-indigo-800 truncate">
                        {j.job_title}
                      </Link>
                      <span className="text-[11px] text-slate-400 shrink-0">{formatDate(j.received_at)}</span>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5 truncate">
                      {[j.recruiter_name, j.company].filter(Boolean).join(" · ") || "—"} · {j.review_status}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

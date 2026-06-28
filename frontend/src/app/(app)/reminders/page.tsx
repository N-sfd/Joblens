"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import type { JobApplication } from "@/types";
import StatusBadge from "@/components/StatusBadge";
import { BellRing, CheckCircle2, Loader2 } from "lucide-react";
import { REMINDER_TYPE_LABEL, REMINDER_TYPE_ICON, REMINDER_TYPE_COLOR } from "@/lib/reminderTypes";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function RemindersPage() {
  const [reminders, setReminders] = useState<JobApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [resolvingId, setResolvingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setReminders(await api.getReminders());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const markDone = async (id: number) => {
    setResolvingId(id);
    try {
      await api.updateJob(id, { follow_up_date: null });
      setReminders((prev) => prev.filter((r) => r.id !== id));
    } catch (e) {
      console.error(e);
    } finally {
      setResolvingId(null);
    }
  };

  const now = Date.now();
  const overdue = reminders.filter((r) => r.follow_up_date && new Date(r.follow_up_date).getTime() < now);
  const upcoming = reminders.filter((r) => !r.follow_up_date || new Date(r.follow_up_date).getTime() >= now);

  const renderGroup = (title: string, items: JobApplication[], tone: "overdue" | "upcoming") => (
    <div className="card">
      <div className="px-5 py-4 border-b border-slate-100">
        <h2 className={`font-semibold ${tone === "overdue" ? "text-red-600" : "text-slate-800"}`}>{title}</h2>
      </div>
      <div className="divide-y divide-slate-100">
        {items.map((job) => (
          <div key={job.id} className="px-5 py-3.5 flex items-center justify-between gap-3 hover:bg-slate-50 transition-colors">
            <div className="flex items-center gap-3 min-w-0">
              {job.reminder_type && (() => {
                const Icon = REMINDER_TYPE_ICON[job.reminder_type];
                return (
                  <span className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${REMINDER_TYPE_COLOR[job.reminder_type]}`}>
                    <Icon size={13} />
                  </span>
                );
              })()}
              <div className="min-w-0">
                <Link href="/jobs" className="text-sm font-semibold text-slate-800 hover:text-indigo-600 transition-colors">
                  {job.company}
                </Link>
                <p className="text-xs text-slate-500">
                  {job.role}
                  {job.reminder_type && <span className="text-slate-400"> · {REMINDER_TYPE_LABEL[job.reminder_type]}</span>}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <span className={`text-xs font-medium ${tone === "overdue" ? "text-red-500" : "text-slate-400"}`}>
                {job.follow_up_date ? formatDate(job.follow_up_date) : ""}
              </span>
              <StatusBadge status={job.status} />
              <button
                type="button"
                onClick={() => markDone(job.id)}
                disabled={resolvingId === job.id}
                className="text-slate-400 hover:text-emerald-600 transition-colors"
                aria-label="Mark reminder done"
              >
                {resolvingId === job.id ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="p-4 sm:p-8 max-w-4xl mx-auto">
      <div className="mb-6">
        <p className="page-kicker">Follow-ups</p>
        <h1 className="page-title">Reminders</h1>
        <p className="page-subtitle">Upcoming and overdue follow-ups based on your job applications.</p>
      </div>

      {loading ? (
        <div className="card p-8 text-center text-slate-400 text-sm">Loading reminders...</div>
      ) : reminders.length === 0 ? (
        <div className="card p-10 text-center">
          <BellRing size={36} className="mx-auto mb-3 text-slate-300" />
          <p className="text-slate-500 text-sm">No reminders set.</p>
          <p className="text-slate-400 text-xs mt-1">
            Set a follow-up date on a job in the{" "}
            <Link href="/jobs" className="text-indigo-600 hover:underline">Job Tracker</Link> to see it here.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {overdue.length > 0 && renderGroup("Overdue", overdue, "overdue")}
          {upcoming.length > 0 && renderGroup("Upcoming", upcoming, "upcoming")}
        </div>
      )}
    </div>
  );
}

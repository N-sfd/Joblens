"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import type { JobApplication } from "@/types";
import { BellRing, ArrowRight } from "lucide-react";
import { REMINDER_TYPE_LABEL, REMINDER_TYPE_ICON, REMINDER_TYPE_COLOR } from "@/lib/reminderTypes";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

interface Props {
  limit?: number;
}

export default function UpcomingReminders({ limit = 5 }: Props) {
  const [reminders, setReminders] = useState<JobApplication[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setReminders(await api.getReminders());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const items = reminders.slice(0, limit);

  return (
    <div className="card">
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <BellRing size={15} className="text-indigo-500" />
          <h2 className="font-semibold text-slate-800 dark:text-slate-100">Upcoming Reminders</h2>
        </div>
        <Link href="/reminders" className="text-indigo-600 text-sm font-medium hover:text-indigo-700 flex items-center gap-1">
          View all <ArrowRight size={14} />
        </Link>
      </div>
      {loading ? (
        <div className="px-5 py-8 text-center text-slate-400 text-sm">Loading...</div>
      ) : items.length === 0 ? (
        <div className="px-5 py-8 text-center">
          <p className="text-slate-400 text-sm">No upcoming reminders.</p>
        </div>
      ) : (
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {items.map((job) => {
            const now = Date.now();
            const overdue = job.follow_up_date && new Date(job.follow_up_date).getTime() < now;
            const Icon = job.reminder_type ? REMINDER_TYPE_ICON[job.reminder_type] : BellRing;
            return (
              <div key={job.id} className="px-5 py-3 flex items-center gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors">
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${job.reminder_type ? REMINDER_TYPE_COLOR[job.reminder_type] : "bg-slate-100 dark:bg-slate-800 text-slate-500"}`}>
                  <Icon size={13} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300 truncate">{job.company} — {job.role}</p>
                  <p className="text-xs text-slate-400">{job.reminder_type ? REMINDER_TYPE_LABEL[job.reminder_type] : "Follow-up"}</p>
                </div>
                <span className={`text-xs font-medium shrink-0 ${overdue ? "text-red-500 dark:text-red-400" : "text-slate-400"}`}>
                  {job.follow_up_date ? formatDate(job.follow_up_date) : ""}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

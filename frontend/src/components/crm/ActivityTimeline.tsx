"use client";

import { useEffect, useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { api } from "@/lib/api";
import type { CRMActivity, CRMActivityCreate } from "@/types";
import { ACTIVITY_TYPES } from "@/types";

type LinkScope = Pick<CRMActivityCreate, "organization_id" | "contact_id" | "employee_id" | "job_requirement_id">;

export default function ActivityTimeline({ scope }: { scope: LinkScope }) {
  const [activities, setActivities] = useState<CRMActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [type, setType] = useState<string>("Note");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      setActivities(await api.getActivities(scope));
    } catch {
      /* non-fatal on detail pages */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [JSON.stringify(scope)]);

  const add = async () => {
    if (!subject.trim() && !description.trim()) return;
    setSaving(true);
    try {
      await api.createActivity({ ...scope, activity_type: type, subject: subject || null, description: description || null });
      setSubject(""); setDescription("");
      await load();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card p-5">
      <h3 className="font-semibold text-slate-900 mb-4">Activity Timeline</h3>

      <div className="space-y-2 mb-5">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <select className="input" value={type} onChange={(e) => setType(e.target.value)}>
            {ACTIVITY_TYPES.map((t) => <option key={t}>{t}</option>)}
          </select>
          <input className="input sm:col-span-2" placeholder="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
        </div>
        <textarea className="textarea" rows={2} placeholder="Add a note or log an interaction..." value={description} onChange={(e) => setDescription(e.target.value)} />
        <div className="flex justify-end">
          <button className="btn-primary flex items-center gap-2 text-sm !py-2" disabled={saving} onClick={add}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Add Activity
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 size={18} className="animate-spin text-indigo-500" />
        </div>
      ) : activities.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-6">No activity logged yet.</p>
      ) : (
        <ul className="space-y-3">
          {activities.map((a) => (
            <li key={a.id} className="flex gap-3">
              <div className="w-2 h-2 rounded-full bg-indigo-400 mt-1.5 shrink-0" />
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-semibold text-indigo-600">{a.activity_type}</span>
                  <span className="text-xs text-slate-400">{new Date(a.activity_date).toLocaleString()}</span>
                </div>
                {a.subject && <p className="text-sm font-medium text-slate-800">{a.subject}</p>}
                {a.description && <p className="text-sm text-slate-600 whitespace-pre-wrap">{a.description}</p>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

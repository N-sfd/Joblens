"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import type { JobRequirement, JobRequirementListParams } from "@/types";

/**
 * Lists job requirements linked to a CRM record. Pass one of:
 *  - organizationId: matches vendor/client/end-client links
 *  - recruiterContactId: matches the recruiter contact link
 */
export default function RelatedJobs({
  organizationId,
  recruiterContactId,
}: {
  organizationId?: number;
  recruiterContactId?: number;
}) {
  const [jobs, setJobs] = useState<JobRequirement[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      try {
        const params: JobRequirementListParams = { page_size: 100 };
        if (organizationId != null) params.organization_id = organizationId;
        if (recruiterContactId != null) params.recruiter_contact_id = recruiterContactId;
        const res = await api.getJobRequirements(params);
        if (active) setJobs(res.items ?? []);
      } catch {
        if (active) setJobs([]);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [organizationId, recruiterContactId]);

  return (
    <div className="card p-5">
      <h3 className="font-semibold text-slate-900 mb-3">Related Jobs</h3>
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-slate-400"><Loader2 size={14} className="animate-spin" /> Loading…</div>
      ) : jobs.length === 0 ? (
        <p className="text-sm text-slate-400">No job requirements linked yet.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {jobs.map((j) => (
            <li key={j.id} className="py-2 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <Link href={`/ats/jobs/${j.id}`} className="font-medium text-indigo-600 hover:text-indigo-800 text-sm truncate">
                  {j.job_title}
                </Link>
                <p className="text-xs text-slate-400 truncate">
                  {[j.location, j.work_type].filter(Boolean).join(" · ") || "—"}
                </p>
              </div>
              <span className="text-xs font-medium text-slate-500 shrink-0">{j.status}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

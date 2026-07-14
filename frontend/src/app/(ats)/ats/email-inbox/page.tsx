"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, Briefcase, Eye, Link2, Loader2, RefreshCw, Sparkles, XCircle } from "lucide-react";
import clsx from "clsx";
import { api } from "@/lib/api";
import type { ImportedEmail, JobRequirement, ZohoConnectionStatus } from "@/types";
import ErrorBanner from "@/components/ErrorBanner";
import LinkJobPicker from "@/components/LinkJobPicker";
import { useAtsRole } from "@/lib/atsRole";

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function classificationLabel(c: string) {
  const map: Record<string, string> = {
    unclassified: "Unclassified",
    job_req: "Job Req",
    candidate: "Candidate",
    spam: "Spam",
    other: "Other",
  };
  return map[c] ?? c;
}

function classificationClass(c: string) {
  switch (c) {
    case "job_req": return "bg-indigo-100 text-indigo-700";
    case "candidate": return "bg-emerald-100 text-emerald-700";
    case "spam": return "bg-red-100 text-red-700";
    case "other": return "bg-slate-100 text-slate-600";
    default: return "bg-amber-100 text-amber-800";
  }
}

function importStatusLabel(s: string) {
  const map: Record<string, string> = {
    pending: "Pending",
    imported: "Imported",
    linked: "Linked",
    ignored: "Ignored",
    archived: "Archived",
    failed: "Failed",
  };
  return map[s] ?? s;
}

function importStatusClass(s: string) {
  switch (s) {
    case "imported":
    case "linked": return "bg-emerald-100 text-emerald-700";
    case "ignored":
    case "archived": return "bg-slate-100 text-slate-500";
    case "failed": return "bg-red-100 text-red-700";
    default: return "bg-amber-100 text-amber-800";
  }
}

type Filter = "all" | "needs_review" | "job_req" | "unclassified";

export default function EmailInboxPage() {
  const router = useRouter();
  const { canWrite } = useAtsRole();
  const [conn, setConn] = useState<ZohoConnectionStatus | null>(null);
  const [emails, setEmails] = useState<ImportedEmail[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [classifying, setClassifying] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [linkingEmailId, setLinkingEmailId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: { limit: number; classification?: string; needs_review?: boolean; q?: string } = { limit: 100 };
      if (filter === "needs_review") params.needs_review = true;
      if (filter === "job_req") params.classification = "job_req";
      if (filter === "unclassified") params.classification = "unclassified";
      if (search.trim()) params.q = search.trim();

      const [c, list] = await Promise.all([
        api.getZohoConnection(),
        api.getImportedEmails(params),
      ]);
      setConn(c);
      setEmails(list);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load inbox.");
    } finally {
      setLoading(false);
    }
  }, [filter, search]);

  useEffect(() => {
    const t = setTimeout(load, search ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, search]);

  const ignore = async (id: number) => {
    setBusyId(id);
    try {
      await api.ignoreImportedEmail(id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to ignore email.");
    } finally {
      setBusyId(null);
    }
  };

  const archive = async (id: number) => {
    setBusyId(id);
    try {
      await api.archiveImportedEmail(id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to archive email.");
    } finally {
      setBusyId(null);
    }
  };

  const linkToJob = async (job: JobRequirement) => {
    if (linkingEmailId == null) return;
    await api.linkEmailToJob(linkingEmailId, job.id);
    setLinkingEmailId(null);
    setMessage(`Linked to job: ${job.job_title}`);
    await load();
  };

  const sync = async () => {
    setSyncing(true);
    setMessage(null);
    try {
      const res = await api.syncZohoMail();
      setMessage(`Sync complete: ${res.total_fetched} retrieved, ${res.imported} new, ${res.skipped} skipped.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sync failed.");
    } finally {
      setSyncing(false);
    }
  };

  const classifyAll = async () => {
    setClassifying(true);
    setMessage(null);
    try {
      const res = await api.classifyUnclassifiedEmails(50);
      setMessage(`Classified ${res.classified} emails.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Classification failed.");
    } finally {
      setClassifying(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-32"><Loader2 size={24} className="animate-spin text-indigo-500" /></div>;
  }

  const connected = conn?.connected ?? false;

  return (
    <div className="p-4 sm:p-8 max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-6">
        <div>
          <p className="page-kicker">ATS</p>
          <h1 className="page-title">Zoho Inbox</h1>
          <p className="page-subtitle">Sync recruiter emails, parse jobs, and save into the unified Jobs module after review.</p>
        </div>
        {connected && canWrite && (
          <div className="flex flex-wrap gap-2 shrink-0">
            <button type="button" className="btn-secondary flex items-center gap-2" disabled={classifying} onClick={classifyAll}>
              {classifying ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
              Classify All
            </button>
            <button type="button" className="btn-primary flex items-center gap-2" disabled={syncing} onClick={sync}>
              {syncing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              Sync Now
            </button>
          </div>
        )}
      </div>

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} onRetry={load} className="mb-4" />}
      {message && (
        <div className="mb-4 rounded-xl bg-green-50 border border-green-100 px-4 py-3 text-sm text-green-800">{message}</div>
      )}

      {!connected ? (
        <div className="card p-10 text-center">
          <p className="text-slate-500 font-medium">Zoho Mail is not connected yet.</p>
          <p className="text-slate-400 text-sm mt-1">
            Connect a mailbox under{" "}
            <Link href="/ats/settings/zoho" className="text-indigo-600 hover:text-indigo-800 font-medium">
              Settings → Zoho Mail
            </Link>
            .
          </p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 mb-4">
            {([
              ["all", "All"],
              ["needs_review", "Needs Review"],
              ["job_req", "Job Req"],
              ["unclassified", "Unclassified"],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                className={clsx(
                  "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
                  filter === key ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200",
                )}
              >
                {label}
              </button>
            ))}
            <input
              className="input ml-auto w-full sm:w-64"
              placeholder="Search sender, subject…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {emails.length === 0 ? (
            <div className="card p-10 text-center">
              <p className="text-slate-500 font-medium">No emails in this view.</p>
              <p className="text-slate-400 text-sm mt-1">Try another filter or click Sync Now.</p>
            </div>
          ) : (
            <div className="card overflow-hidden overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-100">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold text-slate-600">Sender</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-600 hidden md:table-cell">Sender Email</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-600">Subject</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-600 hidden lg:table-cell">Preview</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-600 hidden sm:table-cell">Received</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-600">Status</th>
                    <th className="text-right px-4 py-3 font-semibold text-slate-600">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {emails.map((e) => {
                    const locked = e.import_status === "imported" || e.import_status === "linked";
                    return (
                      <tr key={e.id} className="hover:bg-slate-50/50">
                        <td className="px-4 py-3 text-slate-800">
                          <Link href={`/ats/email-inbox/${e.id}`} className="hover:text-indigo-600">
                            {e.from_name || e.from_address || "—"}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-slate-500 hidden md:table-cell">{e.from_address || "—"}</td>
                        <td className="px-4 py-3 text-slate-700 max-w-xs truncate">
                          <Link href={`/ats/email-inbox/${e.id}`} className="hover:text-indigo-600">
                            {e.subject || "(no subject)"}
                          </Link>
                          {e.job_requirement_id && (
                            <Link href={`/ats/jobs/${e.job_requirement_id}`} className="ml-2 text-xs text-indigo-600 hover:underline">
                              Job #{e.job_requirement_id}
                            </Link>
                          )}
                          <div className="mt-0.5">
                            <span className={clsx("text-xs font-medium px-2 py-0.5 rounded-full", classificationClass(e.classification))}>
                              {classificationLabel(e.classification)}
                            </span>
                            {e.needs_review && (
                              <span className="ml-1.5 text-xs font-medium px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">
                                Review
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-500 max-w-xs truncate hidden lg:table-cell">{e.preview || "—"}</td>
                        <td className="px-4 py-3 text-slate-500 hidden sm:table-cell">{formatDate(e.received_at)}</td>
                        <td className="px-4 py-3">
                          <span className={clsx("text-xs font-medium px-2 py-0.5 rounded-full", importStatusClass(e.import_status))}>
                            {e.job_requirement_id ? "Already imported" : importStatusLabel(e.import_status)}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1.5 flex-wrap">
                            <Link href={`/ats/email-inbox/${e.id}`} title="View Email" className="text-slate-400 hover:text-indigo-600">
                              <Eye size={15} />
                            </Link>
                            {e.job_requirement_id ? (
                              <Link
                                href={`/ats/jobs/${e.job_requirement_id}`}
                                title="Open Job"
                                className="text-xs text-indigo-600 hover:underline"
                              >
                                Open Job
                              </Link>
                            ) : canWrite ? (
                              <>
                                <button
                                  type="button"
                                  title="Parse Job"
                                  className="text-slate-400 hover:text-indigo-600"
                                  onClick={() => router.push(`/ats/jobs/new?emailId=${e.id}`)}
                                >
                                  <Briefcase size={15} />
                                </button>
                                <button
                                  type="button"
                                  title="Link to Existing Job"
                                  className="text-slate-400 hover:text-indigo-600"
                                  onClick={() => setLinkingEmailId(e.id)}
                                >
                                  <Link2 size={15} />
                                </button>
                              </>
                            ) : null}
                            {canWrite && !locked && (
                              <button
                                type="button"
                                title="Ignore"
                                disabled={busyId === e.id}
                                className="text-slate-400 hover:text-amber-600"
                                onClick={() => ignore(e.id)}
                              >
                                <XCircle size={15} />
                              </button>
                            )}
                            {canWrite && !locked && (
                              <button
                                type="button"
                                title="Archive"
                                disabled={busyId === e.id}
                                className="text-slate-400 hover:text-slate-700"
                                onClick={() => archive(e.id)}
                              >
                                <Archive size={15} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {linkingEmailId !== null && (
        <LinkJobPicker onClose={() => setLinkingEmailId(null)} onLink={linkToJob} />
      )}
    </div>
  );
}

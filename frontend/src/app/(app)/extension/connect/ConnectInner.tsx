"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getGuestId } from "@/lib/guestId";

function apiBase(): string {
  const nextPublic = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (nextPublic) return nextPublic.replace(/\/$/, "").replace(/\/api\/?$/i, "");
  if (typeof window !== "undefined" && window.location.hostname === "localhost") {
    return "http://localhost:8000";
  }
  return "";
}

export default function ExtensionConnectInner() {
  const searchParams = useSearchParams();
  const challenge = (searchParams.get("challenge") || "").trim();
  const [status, setStatus] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!challenge) {
      setStatus("error");
      setMessage("Missing challenge from the JobLens extension.");
    }
  }, [challenge]);

  const confirm = useCallback(async () => {
    if (!challenge) return;
    setStatus("loading");
    try {
      const res = await fetch(`${apiBase()}/api/extension/auth/confirm`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-Guest-Id": getGuestId(),
        },
        body: JSON.stringify({ challenge }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus("error");
        setMessage(typeof body.detail === "string" ? body.detail : "Could not confirm connection.");
        return;
      }
      setStatus("ok");
      setMessage(body.message || "Connected. You can return to the extension.");
    } catch {
      setStatus("error");
      setMessage("Backend unavailable. Is the JobLens API running?");
    }
  }, [challenge]);

  return (
    <div className="mx-auto max-w-lg px-4 py-16">
      <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">Browser extension</p>
        <h1 className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">Connect JobLens</h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
          Allow the JobLens extension to save read-only Greenhouse form diagnostics to your account.
          It will not fill forms, upload documents, or submit applications.
        </p>
        <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-slate-600 dark:text-slate-400">
          <li>Short-lived, revocable extension token</li>
          <li>Diagnostics only (labels &amp; structure — no answers)</li>
          <li>Disconnect anytime from the extension</li>
        </ul>
        {status === "error" && (
          <p className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950 dark:text-rose-200">
            {message}
          </p>
        )}
        {status === "ok" && (
          <p className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-950 dark:text-emerald-200">
            {message}
          </p>
        )}
        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            className="btn-primary"
            disabled={!challenge || status === "loading" || status === "ok"}
            onClick={confirm}
          >
            {status === "loading" ? "Connecting…" : "Confirm extension connection"}
          </button>
          <a href="/jobs/discover" className="btn-secondary">
            Cancel
          </a>
        </div>
      </div>
    </div>
  );
}

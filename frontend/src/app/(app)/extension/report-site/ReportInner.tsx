"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

export default function ReportSiteInner() {
  const searchParams = useSearchParams();
  const url = searchParams.get("url") || "";

  return (
    <div className="mx-auto max-w-lg px-4 py-16">
      <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Report this site</h1>
        <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
          Thanks for the signal. M1 only supports Greenhouse boards (
          <code className="text-xs">boards.greenhouse.io</code> /{" "}
          <code className="text-xs">job-boards.greenhouse.io</code>).
        </p>
        {url && (
          <p className="mt-4 break-all rounded-lg bg-slate-50 p-3 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            {url}
          </p>
        )}
        <p className="mt-4 text-sm text-slate-500">
          Multi-platform support is intentionally out of scope until after Greenhouse assist ships.
        </p>
        <Link href="/jobs/discover" className="btn-primary mt-6 inline-flex">
          Return to Discover Jobs
        </Link>
      </div>
    </div>
  );
}

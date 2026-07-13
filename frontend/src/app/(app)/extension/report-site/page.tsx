"use client";

import { Suspense } from "react";
import ReportSiteInner from "./ReportInner";

export default function ReportSitePage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-slate-500">Loading…</div>}>
      <ReportSiteInner />
    </Suspense>
  );
}

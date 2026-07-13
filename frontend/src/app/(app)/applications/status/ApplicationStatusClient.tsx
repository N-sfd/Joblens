"use client";

import { Suspense } from "react";
import ApplicationStatusPage from "./ApplicationStatusClient";

export default function Page() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center gap-2 text-slate-500 py-24 text-sm">
        Loading applications…
      </div>
    }>
      <ApplicationStatusPage />
    </Suspense>
  );
}

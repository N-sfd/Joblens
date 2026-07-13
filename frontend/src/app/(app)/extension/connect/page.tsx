"use client";

import { Suspense } from "react";
import ExtensionConnectInner from "./ConnectInner";

export default function ExtensionConnectPage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-slate-500">Loading…</div>}>
      <ExtensionConnectInner />
    </Suspense>
  );
}

"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";

/** Map legacy submission list query params onto unified pipeline filters. */
function mapQuery(sp: URLSearchParams): string {
  const next = new URLSearchParams();
  for (const [key, value] of sp.entries()) {
    if (key === "status") {
      const normalized = value.trim().toLowerCase();
      if (normalized === "submitted" || normalized === "client review") {
        next.set("stage_group", "submitted");
      } else if (normalized === "interview") {
        next.set("stage_group", "interview");
      } else if (normalized === "offer") {
        next.set("stage_group", "offer");
      } else if (normalized === "selected" || normalized === "placed") {
        next.set("stage_group", "placed");
      } else if (normalized === "rejected" || normalized === "withdrawn" || normalized === "closed") {
        next.set("stage_group", "closed");
      } else {
        next.set("stage", value);
      }
      continue;
    }
    next.set(key, value);
  }
  const s = next.toString();
  return s ? `?${s}` : "";
}

function SubmissionsRedirectInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    router.replace(`/ats/pipeline${mapQuery(searchParams)}`);
  }, [router, searchParams]);

  return (
    <div className="flex justify-center py-20">
      <Loader2 size={24} className="animate-spin text-indigo-500" />
    </div>
  );
}

export default function SubmissionsRedirectPage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-20"><Loader2 size={24} className="animate-spin text-indigo-500" /></div>}>
      <SubmissionsRedirectInner />
    </Suspense>
  );
}

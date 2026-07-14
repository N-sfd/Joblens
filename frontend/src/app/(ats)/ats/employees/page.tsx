"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Loader2 } from "lucide-react";

function RedirectInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  useEffect(() => {
    const sp = new URLSearchParams(searchParams.toString());
    if (sp.get("status") === "Active" && !sp.get("status_group")) {
      sp.delete("status");
      sp.set("status_group", "active");
    }
    const qs = sp.toString();
    router.replace(qs ? `/ats/candidates?${qs}` : "/ats/candidates");
  }, [router, searchParams]);
  return <div className="flex justify-center py-20"><Loader2 className="animate-spin text-indigo-500" /></div>;
}

export default function EmployeesRedirectPage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-20"><Loader2 className="animate-spin text-indigo-500" /></div>}>
      <RedirectInner />
    </Suspense>
  );
}

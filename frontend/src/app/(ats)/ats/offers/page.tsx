"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

export default function OffersRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/ats/pipeline?stage_group=offer");
  }, [router]);
  return (
    <div className="flex justify-center py-20">
      <Loader2 size={24} className="animate-spin text-indigo-500" />
    </div>
  );
}

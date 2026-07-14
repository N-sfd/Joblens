"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

/**
 * Legacy organizations list — redirects to Unified Contacts companies view.
 */
export default function OrganizationsView({
  detailBasePath,
  defaultType,
}: {
  title?: string;
  subtitle?: string;
  detailBasePath: string;
  types?: readonly string[];
  defaultType?: string;
}) {
  const router = useRouter();

  useEffect(() => {
    const type = defaultType
      ? defaultType.toLowerCase().includes("vendor")
        ? "vendor"
        : defaultType.toLowerCase().includes("client")
          ? "client"
          : ""
      : "";
    const qs = type ? `view=companies&type=${encodeURIComponent(type)}` : "view=companies";
    // Preserve old detailBasePath context if needed
    void detailBasePath;
    router.replace(`/ats/contacts?${qs}`);
  }, [router, defaultType, detailBasePath]);

  return (
    <div className="flex items-center justify-center py-32">
      <Loader2 size={24} className="animate-spin text-indigo-500" />
    </div>
  );
}

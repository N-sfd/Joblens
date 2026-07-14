"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

/**
 * Legacy contacts list — redirects to Unified Contacts.
 */
export default function ContactsView({
  fixedType,
}: {
  title?: string;
  subtitle?: string;
  detailBasePath?: string;
  fixedType?: string;
}) {
  const router = useRouter();

  useEffect(() => {
    const type = fixedType ? fixedType.toLowerCase() : "";
    router.replace(type ? `/ats/contacts?type=${encodeURIComponent(type)}` : "/ats/contacts");
  }, [router, fixedType]);

  return (
    <div className="flex items-center justify-center py-32">
      <Loader2 size={24} className="animate-spin text-indigo-500" />
    </div>
  );
}

"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";

export default function VendorDetailRedirect() {
  const params = useParams();
  const router = useRouter();
  const id = params.id;

  useEffect(() => {
    if (id) router.replace(`/ats/contacts/companies/${id}`);
  }, [id, router]);

  return (
    <div className="flex items-center justify-center py-32">
      <Loader2 size={24} className="animate-spin text-indigo-500" />
    </div>
  );
}

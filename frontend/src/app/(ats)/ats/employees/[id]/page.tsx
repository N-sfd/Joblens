"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

export default function EmployeeDetailRedirect() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  useEffect(() => {
    router.replace(`/ats/candidates/${params.id}`);
  }, [router, params.id]);
  return <div className="flex justify-center py-20"><Loader2 className="animate-spin text-indigo-500" /></div>;
}

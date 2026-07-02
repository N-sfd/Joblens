"use client";

import { useParams } from "next/navigation";
import ContactDetail from "@/components/crm/ContactDetail";

export default function RecruiterDetailPage() {
  const params = useParams();
  const id = Number(params.id);
  return <ContactDetail id={id} backPath="/ats/recruiters" />;
}

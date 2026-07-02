"use client";

import { useParams } from "next/navigation";
import OrganizationDetail from "@/components/crm/OrganizationDetail";

export default function ClientDetailPage() {
  const params = useParams();
  const id = Number(params.id);
  return <OrganizationDetail id={id} backPath="/ats/clients" />;
}

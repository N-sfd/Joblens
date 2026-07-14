"use client";

import { useParams } from "next/navigation";
import OrganizationDetail from "@/components/crm/OrganizationDetail";

export default function CompanyDetailPage() {
  const params = useParams();
  const id = Number(params.companyId);
  return <OrganizationDetail id={id} backPath="/ats/contacts?view=companies" />;
}

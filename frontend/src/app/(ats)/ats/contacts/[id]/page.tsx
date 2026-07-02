"use client";

import { useParams } from "next/navigation";
import ContactDetail from "@/components/crm/ContactDetail";

export default function ContactDetailPage() {
  const params = useParams();
  const id = Number(params.id);
  return <ContactDetail id={id} backPath="/ats/contacts" />;
}

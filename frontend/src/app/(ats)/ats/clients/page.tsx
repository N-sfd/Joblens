import { redirect } from "next/navigation";

export default function ClientsPage() {
  redirect("/ats/contacts?view=companies&type=client");
}

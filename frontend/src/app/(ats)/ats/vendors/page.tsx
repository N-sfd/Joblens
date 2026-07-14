import { redirect } from "next/navigation";

export default function VendorsPage() {
  redirect("/ats/contacts?view=companies&type=vendor");
}

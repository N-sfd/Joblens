import { redirect } from "next/navigation";

export default function NewEmployeeRedirect() {
  redirect("/ats/candidates/new");
}

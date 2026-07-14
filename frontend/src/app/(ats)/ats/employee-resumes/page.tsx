import { redirect } from "next/navigation";

export default function EmployeeResumesRedirect() {
  redirect("/ats/candidates?has_resume=true");
}

import { redirect } from "next/navigation";

export default function RecruitersPage() {
  redirect("/ats/contacts?type=recruiter");
}

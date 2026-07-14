import { redirect } from "next/navigation";

export default function NewFromResumeRedirect() {
  redirect("/ats/candidates/new?mode=resume");
}

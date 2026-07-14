import Link from "next/link";
import { isClerkConfigured } from "@/lib/clerkConfigured";

export default async function SignUpPage() {
  if (!isClerkConfigured()) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
        <div className="max-w-md w-full rounded-2xl border border-slate-200 bg-white p-8 shadow-sm space-y-4">
          <h1 className="text-xl font-bold text-slate-900">ATS sign-up is not configured</h1>
          <p className="text-sm text-slate-600">
            Add Clerk keys on Vercel, then redeploy. Staffing users sign in via ATS after Clerk is configured.
          </p>
          <Link href="/ats" className="text-sm text-indigo-600 font-medium hover:underline">
            Open ATS
          </Link>
        </div>
      </div>
    );
  }
  const { SignUp } = await import("@clerk/nextjs");
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <SignUp />
    </div>
  );
}

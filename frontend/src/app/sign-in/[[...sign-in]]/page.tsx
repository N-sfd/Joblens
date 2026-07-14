import Link from "next/link";
import { isClerkConfigured } from "@/lib/clerkConfigured";

function ClerkMissingCard({ title }: { title: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="max-w-md w-full rounded-2xl border border-slate-200 bg-white p-8 shadow-sm space-y-4">
        <h1 className="text-xl font-bold text-slate-900">{title}</h1>
        <p className="text-sm text-slate-600 leading-relaxed">
          Set <code className="text-xs bg-slate-100 px-1 rounded">NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY</code> and{" "}
          <code className="text-xs bg-slate-100 px-1 rounded">CLERK_SECRET_KEY</code> on Vercel (Preview + Production),
          then redeploy. Zoho email → job import is under{" "}
          <Link href="/ats/email-inbox" className="text-indigo-600 hover:underline">
            ATS Zoho Inbox
          </Link>
          .
        </p>
        <div className="flex flex-wrap gap-3 text-sm">
          <Link href="/ats/email-inbox" className="text-indigo-600 font-medium hover:underline">
            Open Zoho Inbox
          </Link>
          <Link href="/ats" className="text-slate-500 hover:underline">
            ATS Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}

export default async function SignInPage() {
  if (!isClerkConfigured()) {
    return <ClerkMissingCard title="ATS sign-in is not configured" />;
  }
  const { SignIn } = await import("@clerk/nextjs");
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <SignIn />
    </div>
  );
}

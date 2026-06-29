import { SignUp } from "@clerk/nextjs";

// Public route — anyone can view the sign-up form. Used only to gate the
// ATS/admin routes listed in middleware.ts; job-seeker tools never link here.
export default function SignUpPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <SignUp />
    </div>
  );
}

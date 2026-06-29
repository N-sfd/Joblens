import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";
import { AuthProvider } from "@/lib/AuthContext";

export const metadata: Metadata = {
  title: "JobLens",
  description: "JobLens helps job seekers analyze resumes, match jobs, track applications, and generate tailored cover letters — all in one place.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // ClerkProvider wraps the whole app, but it only *requires* sign-in on the
  // ATS/admin routes matched in middleware.ts — every public job-seeker page
  // (/, /resume, /match, /cover-letter, /jobs, /dashboard, /reminders) renders
  // for signed-out visitors exactly as before. AuthProvider (email/password +
  // guestId) is the unrelated, pre-existing auth system for those public tools.
  return (
    <ClerkProvider>
      <html lang="en">
        <body>
          <AuthProvider>{children}</AuthProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}

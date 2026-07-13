import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";
import { AuthProvider } from "@/lib/AuthContext";
import { ThemeProvider } from "@/lib/ThemeContext";

export const metadata: Metadata = {
  title: "JobLens",
  description: "JobLens helps job seekers analyze resumes, match jobs, track applications, and generate tailored cover letters — all in one place.",
};

// Applies the persisted theme before React hydrates, so there's no
// flash of the wrong theme on load.
const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem('aijob_theme');if(t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme: dark)').matches)){document.documentElement.classList.add('dark');}}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // ClerkProvider wraps the whole app, but it only *requires* sign-in on the
  // ATS/admin routes matched in middleware.ts — every public job-seeker page
  // (/, /resume, /match, /cover-letter, /jobs, /dashboard, /reminders) renders
  // for signed-out visitors exactly as before. AuthProvider (email/password +
  // guestId) is the unrelated, pre-existing auth system for those public tools.
  // Skip ClerkProvider when the publishable key is missing so Vercel builds
  // do not fail before env vars are configured.
  const body = (
    <html lang="en">
      <body>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <ThemeProvider>
          <AuthProvider>{children}</AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );

  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim()) {
    return body;
  }

  return <ClerkProvider>{body}</ClerkProvider>;
}

import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "JobLens",
  description: "JobLens helps job seekers analyze resumes, match jobs, track applications, and generate tailored cover letters — all in one place.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

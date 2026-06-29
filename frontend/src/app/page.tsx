import Link from "next/link";
import LogoMark from "@/components/Logo";
import ScoreCircle from "@/components/ScoreCircle";
import StatusBadge from "@/components/StatusBadge";
import UserMenu from "@/components/UserMenu";
import CtaButtons from "@/components/CtaButtons";
import { LEGAL_LINKS } from "@/components/legal/LegalPageShell";
import {
  FileText, Target, PenTool, Briefcase, ShieldCheck, Lock, Sparkles,
  CheckCircle2, Upload, ClipboardList, BarChart3, Eye, BellRing, LayoutDashboard,
} from "lucide-react";

const FEATURES = [
  {
    icon: FileText,
    color: "bg-indigo-50 text-indigo-600",
    title: "Resume Analyzer",
    desc: "Upload your resume and get an instant ATS score, skill breakdown, and concrete improvement tips.",
  },
  {
    icon: Target,
    color: "bg-purple-50 text-purple-600",
    title: "Job Matcher",
    desc: "Paste any job description to see your real fit score — exact keyword coverage, skills gaps, and formatting checks.",
  },
  {
    icon: Briefcase,
    color: "bg-blue-50 text-blue-600",
    title: "Job Tracker",
    desc: "Keep every application organized by status, with notes, links, and follow-up dates in one dashboard.",
  },
  {
    icon: PenTool,
    color: "bg-emerald-50 text-emerald-600",
    title: "Cover Letter Generator",
    desc: "Generate a tailored, well-written cover letter in your tone of choice — ready to copy or download.",
  },
  {
    icon: BellRing,
    color: "bg-amber-50 text-amber-600",
    title: "Application Reminders",
    desc: "Never miss a follow-up, interview, or deadline — see every upcoming reminder in one place.",
  },
  {
    icon: LayoutDashboard,
    color: "bg-rose-50 text-rose-600",
    title: "Dashboard Insights",
    desc: "Track interview and offer rates, weekly application volume, and AI activity at a glance.",
  },
];

const STEPS = [
  {
    icon: Upload,
    title: "Upload your resume",
    desc: "Drop in a PDF or DOCX and get an ATS score with skill and formatting analysis in seconds.",
  },
  {
    icon: ClipboardList,
    title: "Paste a job description",
    desc: "JobLens scans for exact keyword matches and scores your fit like a real ATS would.",
  },
  {
    icon: Sparkles,
    title: "Get tailored guidance",
    desc: "Receive specific suggestions, missing keywords, and an AI-written cover letter for the role.",
  },
  {
    icon: BarChart3,
    title: "Track every application",
    desc: "Save roles to your dashboard and follow their progress from Applied to Offer.",
  },
];

const TRUST_POINTS = [
  {
    icon: Lock,
    title: "No account required",
    desc: "Start immediately with a private guest session — no sign-up, no password.",
  },
  {
    icon: ShieldCheck,
    title: "Your data stays yours",
    desc: "Resumes and job descriptions are processed to generate your results and are never sold or shared.",
  },
  {
    icon: Eye,
    title: "Transparent scoring",
    desc: "Every score is explainable — see exactly which keywords matched and why, not just a black-box number.",
  },
];

export default function LandingPage() {
  return (
    <div className="bg-white text-slate-900">
      {/* Nav */}
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-sm border-b border-slate-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-indigo-700 rounded-lg flex items-center justify-center shadow-sm">
              <LogoMark size={16} className="text-white" />
            </div>
            <span className="font-bold text-slate-900">JobLens</span>
          </div>
          <nav className="hidden sm:flex items-center gap-7 text-sm font-medium text-slate-500">
            <a href="#features" className="hover:text-slate-900 transition-colors">Features</a>
            <a href="#how-it-works" className="hover:text-slate-900 transition-colors">How it Works</a>
            <a href="#demo" className="hover:text-slate-900 transition-colors">Demo</a>
            <a href="#privacy" className="hover:text-slate-900 transition-colors">Privacy</a>
          </nav>
          <div className="flex items-center gap-4">
            <UserMenu />
            <Link href="/dashboard" className="btn-primary text-sm py-2 px-4">
              Get Started
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-indigo-50/70 via-white to-white pointer-events-none" />
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 pt-16 sm:pt-24 pb-16 grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <div>
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-700 bg-indigo-50 border border-indigo-100 px-3 py-1 rounded-full mb-5">
              <Sparkles size={12} /> AI-powered job search toolkit
            </span>
            <h1 className="text-3xl sm:text-5xl font-bold tracking-tight leading-[1.1] mb-5">
              Land your next role,<br /> backed by <span className="text-indigo-600">AI</span> that explains itself
            </h1>
            <p className="text-slate-500 text-base sm:text-lg leading-relaxed mb-8 max-w-lg">
              JobLens helps job seekers analyze resumes, match jobs, track applications, and generate tailored cover letters — all in one place.
            </p>
            <CtaButtons className="mb-8" />
            <div className="flex flex-wrap items-center gap-5 text-sm text-slate-500">
              <span className="flex items-center gap-1.5"><CheckCircle2 size={15} className="text-green-500" /> No sign-up</span>
              <span className="flex items-center gap-1.5"><CheckCircle2 size={15} className="text-green-500" /> Free to use</span>
              <span className="flex items-center gap-1.5"><CheckCircle2 size={15} className="text-green-500" /> Your data stays private</span>
            </div>
          </div>

          {/* Hero visual */}
          <div className="relative">
            <div className="card p-5 rotate-1">
              <div className="flex items-center justify-between mb-4">
                <p className="font-semibold text-slate-800 text-sm">Job Matcher</p>
                <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-semibold">High likelihood</span>
              </div>
              <div className="flex items-center gap-5">
                <ScoreCircle score={87} label="ATS Match Score" size={110} />
                <div className="flex-1 space-y-2">
                  <div className="flex flex-wrap gap-1.5">
                    {["Python", "FastAPI", "Docker"].map((s) => (
                      <span key={s} className="px-2 py-0.5 bg-green-50 text-green-700 rounded-full text-xs font-medium">{s}</span>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {["Kubernetes"].map((s) => (
                      <span key={s} className="px-2 py-0.5 bg-red-50 text-red-700 rounded-full text-xs font-medium">{s}</span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <div className="card p-4 absolute -bottom-28 -left-10 w-56 hidden sm:block animate-slide-up">
              <p className="text-xs font-semibold text-slate-500 mb-2">Recent Application</p>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-800">Stripe</p>
                  <p className="text-xs text-slate-400">Senior Engineer</p>
                </div>
                <StatusBadge status="Interviewing" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
        <div className="text-center max-w-xl mx-auto mb-12">
          <p className="page-kicker">Everything you need</p>
          <h2 className="text-2xl sm:text-3xl font-bold mb-3">One toolkit for the entire job search</h2>
          <p className="text-slate-500">From your first resume upload to the offer letter — JobLens covers every step.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {FEATURES.map(({ icon: Icon, color, title, desc }) => (
            <div key={title} className="card p-5">
              <div className={`w-10 h-10 rounded-xl ${color} flex items-center justify-center mb-4`}>
                <Icon size={18} />
              </div>
              <h3 className="font-semibold text-slate-800 mb-1.5">{title}</h3>
              <p className="text-sm text-slate-500 leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="bg-slate-50 py-16 sm:py-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center max-w-xl mx-auto mb-12">
            <p className="page-kicker">Simple process</p>
            <h2 className="text-2xl sm:text-3xl font-bold mb-3">How it works</h2>
            <p className="text-slate-500">Four steps from blank resume to a tracked, tailored application.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {STEPS.map(({ icon: Icon, title, desc }, i) => (
              <div key={title} className="relative">
                <div className="card p-5 h-full">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-9 h-9 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold text-sm shrink-0">
                      {i + 1}
                    </div>
                    <Icon size={18} className="text-indigo-500" />
                  </div>
                  <h3 className="font-semibold text-slate-800 mb-1.5">{title}</h3>
                  <p className="text-sm text-slate-500 leading-relaxed">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Demo preview */}
      <section id="demo" className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
        <div className="text-center max-w-xl mx-auto mb-12">
          <p className="page-kicker">See it in action</p>
          <h2 className="text-2xl sm:text-3xl font-bold mb-3">A dashboard built for momentum</h2>
          <p className="text-slate-500">Every tool feeds into one place — your applications, scores, and AI activity.</p>
        </div>

        <div className="rounded-2xl border border-slate-200 shadow-xl overflow-hidden max-w-4xl mx-auto">
          {/* fake browser chrome */}
          <div className="bg-slate-100 border-b border-slate-200 px-4 py-2.5 flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-red-400" />
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
            <span className="w-2.5 h-2.5 rounded-full bg-green-400" />
            <span className="ml-3 text-xs text-slate-400 bg-white rounded-full px-3 py-1 border border-slate-200">joblens.app/dashboard</span>
          </div>
          <div className="bg-slate-50 p-5 sm:p-6">
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
              {[
                { label: "Total", value: 12, color: "text-indigo-600" },
                { label: "Applied", value: 6, color: "text-blue-600" },
                { label: "Interviewing", value: 3, color: "text-purple-600" },
                { label: "Offers", value: 1, color: "text-green-600" },
                { label: "Rejected", value: 2, color: "text-red-600" },
              ].map((s) => (
                <div key={s.label} className="card p-3">
                  <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
                  <p className="text-[11px] text-slate-500 font-medium">{s.label}</p>
                </div>
              ))}
            </div>
            <div className="card divide-y divide-slate-100">
              {[
                { company: "Stripe", role: "Senior Engineer", status: "Interviewing" as const },
                { company: "Vercel", role: "Developer Advocate", status: "Offer" as const },
                { company: "Shopify", role: "Full Stack Developer", status: "Applied" as const },
              ].map((j) => (
                <div key={j.company} className="px-4 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{j.company}</p>
                    <p className="text-xs text-slate-400">{j.role}</p>
                  </div>
                  <StatusBadge status={j.status} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Privacy / trust */}
      <section id="privacy" className="bg-slate-900 text-white py-16 sm:py-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center max-w-xl mx-auto mb-12">
            <p className="text-xs font-semibold uppercase tracking-wider text-indigo-400 mb-2">Built with trust in mind</p>
            <h2 className="text-2xl sm:text-3xl font-bold mb-3">Your career data, handled responsibly</h2>
            <p className="text-slate-400">No accounts, no resale of your data, and scores you can actually audit.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {TRUST_POINTS.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="bg-white/5 border border-white/10 rounded-xl p-5">
                <div className="w-9 h-9 rounded-lg bg-indigo-500/20 flex items-center justify-center mb-3">
                  <Icon size={16} className="text-indigo-300" />
                </div>
                <h3 className="font-semibold mb-1.5">{title}</h3>
                <p className="text-sm text-slate-400 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 py-16 sm:py-20 text-center">
        <h2 className="text-2xl sm:text-3xl font-bold mb-3">Ready to put your job search on autopilot?</h2>
        <p className="text-slate-500 mb-8 max-w-md mx-auto">Jump straight into the dashboard — no account needed.</p>
        <CtaButtons className="justify-center" />
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-100 py-8">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-indigo-600 rounded-md flex items-center justify-center">
              <LogoMark size={13} className="text-white" />
            </div>
            <span className="font-bold text-slate-900 text-sm">JobLens</span>
          </div>
          <p className="text-xs text-slate-400">AI-powered resume analyzer, job matcher, and application tracker.</p>
          <nav className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-400">
            {LEGAL_LINKS.map((l) => (
              <Link key={l.href} href={l.href} className="hover:text-slate-700 transition-colors">{l.label}</Link>
            ))}
          </nav>
        </div>
      </footer>
    </div>
  );
}

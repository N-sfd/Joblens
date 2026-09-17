import Link from "next/link";
import LogoMark from "@/components/Logo";
import UserMenu from "@/components/UserMenu";
import CtaButtons from "@/components/CtaButtons";
import { LEGAL_LINKS } from "@/components/legal/LegalPageShell";
import {
  FileText, Target, PenTool, Briefcase, ShieldCheck, Lock, Sparkles,
  CheckCircle2, Upload, ClipboardList, BarChart3, Eye, BellRing, LayoutDashboard,
} from "lucide-react";

const PRIMARY_FEATURES = [
  {
    icon: Target,
    color: "bg-indigo-50 text-indigo-600",
    title: "AI Career Intelligence",
    desc: "See which job requirements your résumé clearly demonstrates, where evidence is weak, and what you can improve — with structured requirement analysis and evidence-based matching.",
  },
  {
    icon: FileText,
    color: "bg-violet-50 text-violet-600",
    title: "Transparent Scoring",
    desc: "Six weighted categories — required skills, experience, preferred skills, education, domain, and evidence — explained with résumé citations, not a black-box number.",
  },
];

const SECONDARY_FEATURES = [
  {
    icon: Briefcase,
    color: "bg-slate-100 text-slate-600",
    title: "Job Tracker",
    desc: "Keep applications organized by status with notes and follow-ups.",
  },
  {
    icon: PenTool,
    color: "bg-slate-100 text-slate-600",
    title: "Cover Letter Generator",
    desc: "Draft a tailored letter grounded in your real experience.",
  },
  {
    icon: BellRing,
    color: "bg-slate-100 text-slate-600",
    title: "Reminders",
    desc: "Follow-ups, interviews, and deadlines in one place.",
  },
  {
    icon: LayoutDashboard,
    color: "bg-slate-100 text-slate-600",
    title: "Dashboard",
    desc: "A lightweight view of application volume and recent activity.",
  },
];

const STEPS = [
  {
    icon: Upload,
    title: "Upload your résumé",
    desc: "PDF, DOCX, or paste text — JobLens structures your experience for evidence mapping.",
  },
  {
    icon: ClipboardList,
    title: "Paste a job description",
    desc: "Required and preferred skills are separated so scoring stays honest and explainable.",
  },
  {
    icon: Sparkles,
    title: "Get evidence-based alignment",
    desc: "See strong matches, related evidence, not-demonstrated skills, and gaps — never invented experience.",
  },
  {
    icon: BarChart3,
    title: "Act on the next three steps",
    desc: "Improve bullets you already have, then optionally track the application.",
  },
];

const TRUST_POINTS = [
  {
    icon: Lock,
    title: "No account required",
    desc: "Analyze immediately with a private guest session — sign in only if you want to save.",
  },
  {
    icon: ShieldCheck,
    title: "Your data stays yours",
    desc: "Résumés and job descriptions are processed to generate your results and are never sold or shared.",
  },
  {
    icon: Eye,
    title: "Explainable decisions",
    desc: "Every major claim links back to résumé evidence — decision support, not a hiring prediction.",
  },
];

export default function LandingPage() {
  return (
    <div className="bg-white text-slate-900">
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-sm border-b border-slate-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-indigo-700 rounded-lg flex items-center justify-center shadow-sm">
              <LogoMark size={16} className="text-white" />
            </div>
            <span className="font-bold text-slate-900 tracking-tight">JobLens</span>
          </div>
          <nav className="hidden sm:flex items-center gap-7 text-sm font-medium text-slate-500">
            <a href="#features" className="hover:text-slate-900 transition-colors">Features</a>
            <a href="#how-it-works" className="hover:text-slate-900 transition-colors">How it Works</a>
            <a href="#demo" className="hover:text-slate-900 transition-colors">Demo</a>
            <a href="#privacy" className="hover:text-slate-900 transition-colors">Privacy</a>
          </nav>
          <div className="flex items-center gap-4">
            <UserMenu />
            <Link href="/match" className="btn-primary text-sm py-2 px-4">
              Analyze Alignment
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
              <Sparkles size={12} /> JobLens — AI Career Intelligence
            </span>
            <h1 className="text-3xl sm:text-5xl font-bold tracking-tight leading-[1.1] mb-5">
              Know why you match — <span className="text-indigo-600">not just the score.</span>
            </h1>
            <p className="text-slate-500 text-base sm:text-lg leading-relaxed mb-8 max-w-lg">
              JobLens analyzes your résumé against a job description and shows the skills, experience, evidence, and gaps behind every score.
            </p>
            <CtaButtons className="mb-8" />
            <div className="flex flex-wrap items-center gap-5 text-sm text-slate-500">
              <span className="flex items-center gap-1.5"><CheckCircle2 size={15} className="text-green-500" /> No sign-up required</span>
              <span className="flex items-center gap-1.5"><CheckCircle2 size={15} className="text-green-500" /> Evidence-based</span>
              <span className="flex items-center gap-1.5"><CheckCircle2 size={15} className="text-green-500" /> Not a hiring prediction</span>
            </div>
          </div>

          {/* Hero visual — explainability demo */}
          <div className="relative">
            <div className="card p-5">
              <div className="flex items-center justify-between mb-4">
                <p className="font-semibold text-slate-800 text-sm">Overall Alignment</p>
                <span className="text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full font-semibold">Strong alignment</span>
              </div>
              <p className="text-4xl font-bold text-slate-900 tabular-nums mb-4">87%</p>
              <div className="space-y-2.5 mb-4">
                {[
                  { label: "Required Skills", value: 93 },
                  { label: "Experience", value: 86 },
                  { label: "Preferred Skills", value: 69 },
                ].map((row) => (
                  <div key={row.label}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-slate-600">{row.label}</span>
                      <span className="font-semibold text-slate-800 tabular-nums">{row.value}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                      <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${row.value}%` }} />
                    </div>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <p className="font-semibold text-emerald-700 mb-1.5">Strong evidence</p>
                  <ul className="space-y-1 text-slate-600">
                    {["Python", "FastAPI", "SQL"].map((s) => (
                      <li key={s} className="flex items-center gap-1.5">
                        <CheckCircle2 size={12} className="text-emerald-600" /> {s}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="font-semibold text-amber-700 mb-1.5">Needs stronger evidence</p>
                  <ul className="space-y-1 text-slate-600">
                    {["AWS", "Kubernetes"].map((s) => (
                      <li key={s} className="flex items-center gap-1.5">
                        <span className="text-amber-600 font-bold">△</span> {s}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
              <p className="text-[11px] text-slate-400 mt-4 leading-relaxed">
                This score reflects résumé evidence against the job — not a hiring prediction.
              </p>
            </div>
            <div className="card p-4 absolute -bottom-6 -left-6 w-52 hidden sm:block">
              <p className="text-xs font-semibold text-slate-500 mb-2">Flow</p>
              <p className="text-sm font-semibold text-slate-800 leading-snug">
                Resume + Job → Explainable AI Match
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <p className="page-kicker">Primary product</p>
          <h2 className="text-2xl sm:text-3xl font-bold mb-3">Evidence-based career intelligence</h2>
          <p className="text-slate-500">
            See which job requirements your résumé clearly demonstrates, where evidence is weak, and what you can improve.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-10">
          {PRIMARY_FEATURES.map(({ icon: Icon, color, title, desc }) => (
            <div key={title} className="card p-6">
              <div className={`w-10 h-10 rounded-xl ${color} flex items-center justify-center mb-4`}>
                <Icon size={18} />
              </div>
              <h3 className="font-semibold text-slate-800 mb-1.5 text-lg">{title}</h3>
              <p className="text-sm text-slate-500 leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
        <div className="text-center mb-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Also available</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {SECONDARY_FEATURES.map(({ icon: Icon, color, title, desc }) => (
            <div key={title} className="rounded-xl border border-slate-100 bg-slate-50/60 p-4">
              <div className={`w-8 h-8 rounded-lg ${color} flex items-center justify-center mb-3`}>
                <Icon size={15} />
              </div>
              <h3 className="font-semibold text-slate-700 text-sm mb-1">{title}</h3>
              <p className="text-xs text-slate-500 leading-relaxed">{desc}</p>
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
            <p className="text-slate-500">Upload résumé + paste job → explainable alignment.</p>
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
          <h2 className="text-2xl sm:text-3xl font-bold mb-3">Explainability, not keyword theater</h2>
          <p className="text-slate-500">
            Structured requirement analysis and evidence-based matching — so you know why a score landed where it did.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 shadow-xl overflow-hidden max-w-3xl mx-auto">
          <div className="bg-slate-100 border-b border-slate-200 px-4 py-2.5 flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-red-400" />
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
            <span className="w-2.5 h-2.5 rounded-full bg-green-400" />
            <span className="ml-3 text-xs text-slate-400 bg-white rounded-full px-3 py-1 border border-slate-200">joblens.app/match</span>
          </div>
          <div className="bg-white p-5 sm:p-7 space-y-5">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600 mb-1">Your Alignment</p>
                <p className="text-4xl font-bold text-slate-900">87% <span className="text-lg font-semibold text-slate-600">Strong alignment</span></p>
              </div>
              <p className="text-xs text-slate-400 max-w-xs">Not a hiring prediction — evidence vs this job only.</p>
            </div>
            <div className="space-y-2">
              {[
                { label: "Required Skills", value: 93 },
                { label: "Experience", value: 86 },
                { label: "Preferred Skills", value: 69 },
              ].map((row) => (
                <div key={row.label}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-slate-600">{row.label}</span>
                    <span className="font-semibold tabular-nums">{row.value}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${row.value}%` }} />
                  </div>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-3">
                <p className="font-semibold text-emerald-800 mb-2">Strong evidence</p>
                <ul className="space-y-1 text-slate-700">
                  <li>✓ Python</li>
                  <li>✓ FastAPI</li>
                  <li>✓ SQL</li>
                </ul>
              </div>
              <div className="rounded-xl border border-amber-100 bg-amber-50/50 p-3">
                <p className="font-semibold text-amber-800 mb-2">Needs stronger evidence</p>
                <ul className="space-y-1 text-slate-700">
                  <li>△ AWS — related cloud tools present</li>
                  <li>△ Kubernetes — Docker is related, not identical</li>
                </ul>
              </div>
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
            <p className="text-slate-400">No pressure to invent keywords — scores you can audit.</p>
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
        <h2 className="text-2xl sm:text-3xl font-bold mb-3">Ready to make your next application more informed?</h2>
        <p className="text-slate-500 mb-8 max-w-md mx-auto">
          Upload a résumé, paste a job, and see the evidence behind your alignment score.
        </p>
        <CtaButtons className="justify-center" />
      </section>

      <footer className="border-t border-slate-100 py-8">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-indigo-600 rounded-md flex items-center justify-center">
              <LogoMark size={13} className="text-white" />
            </div>
            <span className="font-bold text-slate-900 text-sm">JobLens</span>
          </div>
          <p className="text-xs text-slate-400">AI Career Intelligence — evidence-based résumé ↔ job alignment.</p>
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

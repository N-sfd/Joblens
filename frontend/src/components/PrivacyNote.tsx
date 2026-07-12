import Link from "next/link";
import { ShieldCheck } from "lucide-react";

interface Props {
  children: React.ReactNode;
  className?: string;
}

export default function PrivacyNote({ children, className }: Props) {
  return (
    <div className={`flex items-start gap-2 text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 rounded-lg px-3 py-2.5 ${className ?? ""}`}>
      <ShieldCheck size={14} className="text-indigo-400 shrink-0 mt-0.5" />
      <p className="leading-relaxed">
        {children}{" "}
        <Link href="/privacy" className="text-indigo-600 hover:underline font-medium">Privacy Policy</Link>.
      </p>
    </div>
  );
}

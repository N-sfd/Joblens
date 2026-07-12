import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

interface Props {
  title: string;
  icon: LucideIcon;
  iconColor?: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
}

export default function ChartCard({ title, icon: Icon, iconColor = "text-indigo-500", subtitle, children, className }: Props) {
  return (
    <div className={`card ${className ?? ""}`}>
      <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <Icon size={15} className={iconColor} />
          <h2 className="font-semibold text-slate-800 dark:text-slate-100 text-sm">{title}</h2>
        </div>
        {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

import type { ReactNode } from "react";

interface Props {
  title: string;
  children: ReactNode;
}

export default function LegalSection({ title, children }: Props) {
  return (
    <section>
      <h2 className="text-lg font-semibold text-slate-800 mb-2.5">{title}</h2>
      <div className="text-sm text-slate-600 leading-relaxed space-y-3 [&_ul]:space-y-1.5 [&_ul]:list-disc [&_ul]:pl-5 [&_li]:text-slate-600 [&_strong]:text-slate-800 [&_strong]:font-semibold [&_a:not([class])]:text-indigo-600 [&_a:not([class])]:hover:underline">
        {children}
      </div>
    </section>
  );
}

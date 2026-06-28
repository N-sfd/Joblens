"use client";

import { RadialBarChart, RadialBar, PolarAngleAxis, ResponsiveContainer } from "recharts";
import type { LucideIcon } from "lucide-react";

interface Props {
  label: string;
  rate: number;
  icon: LucideIcon;
  color: string;
  track?: string;
  sublabel: string;
  loading?: boolean;
}

export default function RateGaugeCard({ label, rate, icon: Icon, color, track = "#f1f5f9", sublabel, loading }: Props) {
  const data = [{ value: rate, fill: color }];

  return (
    <div className="card p-4 flex items-center gap-4">
      <div className="w-20 h-20 shrink-0 relative">
        {loading ? (
          <div className="w-full h-full rounded-full bg-slate-100 animate-pulse" />
        ) : (
          <>
            <ResponsiveContainer width="100%" height="100%">
              <RadialBarChart data={data} startAngle={90} endAngle={-270} innerRadius="72%" outerRadius="100%" barSize={8}>
                <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
                <RadialBar dataKey="value" cornerRadius={6} background={{ fill: track }} />
              </RadialBarChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-sm font-bold text-slate-800">{rate}%</span>
            </div>
          </>
        )}
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <Icon size={13} style={{ color }} />
          <p className="text-sm font-semibold text-slate-800">{label}</p>
        </div>
        <p className="text-xs text-slate-400">{sublabel}</p>
      </div>
    </div>
  );
}

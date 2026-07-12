"use client";

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { PieChart as PieChartIcon } from "lucide-react";
import ChartCard from "./ChartCard";
import type { StatusSlice } from "@/lib/chartData";
import { useTheme } from "@/lib/ThemeContext";

interface Props {
  data: StatusSlice[];
  loading?: boolean;
}

export default function StatusBreakdownChart({ data, loading }: Props) {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  const { theme } = useTheme();
  const isDark = theme === "dark";

  return (
    <ChartCard title="Applications by Status" icon={PieChartIcon} iconColor="text-indigo-500">
      {loading ? (
        <div className="h-52 flex items-center justify-center text-slate-400 text-sm">Loading...</div>
      ) : total === 0 ? (
        <div className="h-52 flex flex-col items-center justify-center text-center">
          <p className="text-slate-400 text-sm">No applications yet.</p>
          <p className="text-slate-400 text-xs mt-1">Add a job to see your status breakdown.</p>
        </div>
      ) : (
        <div className="flex items-center gap-4">
          <div className="w-36 h-36 shrink-0 relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={data} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="100%" paddingAngle={2} strokeWidth={0}>
                  {data.map((slice) => (
                    <Cell key={slice.name} fill={slice.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value, name) => [`${value} (${Math.round((Number(value) / total) * 100)}%)`, name]}
                  contentStyle={{
                    borderRadius: 10,
                    border: `1px solid ${isDark ? "#334155" : "#e2e8f0"}`,
                    background: isDark ? "#0f172a" : "#fff",
                    color: isDark ? "#f1f5f9" : "#0f172a",
                    fontSize: 12,
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-xl font-bold text-slate-800 dark:text-slate-100">{total}</span>
              <span className="text-[10px] text-slate-400 font-medium">Total</span>
            </div>
          </div>
          <div className="flex-1 space-y-2 min-w-0">
            {data.map((slice) => (
              <div key={slice.name} className="flex items-center justify-between gap-2 text-sm">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: slice.color }} />
                  <span className="text-slate-600 dark:text-slate-400 truncate">{slice.name}</span>
                </div>
                <span className="font-semibold text-slate-800 dark:text-slate-100 shrink-0">{slice.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </ChartCard>
  );
}

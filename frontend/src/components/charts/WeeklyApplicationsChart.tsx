"use client";

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { BarChart3 } from "lucide-react";
import ChartCard from "./ChartCard";
import type { WeekBucket } from "@/lib/chartData";
import { useTheme } from "@/lib/ThemeContext";

interface Props {
  data: WeekBucket[];
  loading?: boolean;
}

export default function WeeklyApplicationsChart({ data, loading }: Props) {
  const total = data.reduce((sum, d) => sum + d.count, 0);
  const { theme } = useTheme();
  const isDark = theme === "dark";

  return (
    <ChartCard title="Weekly Applications" icon={BarChart3} iconColor="text-blue-500" subtitle="Applications submitted per week, last 8 weeks">
      {loading ? (
        <div className="h-52 flex items-center justify-center text-slate-400 text-sm">Loading...</div>
      ) : total === 0 ? (
        <div className="h-52 flex flex-col items-center justify-center text-center">
          <p className="text-slate-400 text-sm">No applications yet.</p>
          <p className="text-slate-400 text-xs mt-1">Your weekly application volume will show up here.</p>
        </div>
      ) : (
        <div className="h-52">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={isDark ? "#1e293b" : "#f1f5f9"} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={28} />
              <Tooltip
                cursor={{ fill: isDark ? "#1e1b4b" : "#eef2ff" }}
                contentStyle={{
                  borderRadius: 10,
                  border: `1px solid ${isDark ? "#334155" : "#e2e8f0"}`,
                  background: isDark ? "#0f172a" : "#fff",
                  color: isDark ? "#f1f5f9" : "#0f172a",
                  fontSize: 12,
                }}
                formatter={(value) => [value, "Applications"]}
              />
              <Bar dataKey="count" fill="#6366f1" radius={[6, 6, 0, 0]} maxBarSize={36} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </ChartCard>
  );
}

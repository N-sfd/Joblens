"use client";

import Link from "next/link";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, ResponsiveContainer } from "recharts";
import { Bot } from "lucide-react";
import ChartCard from "./ChartCard";
import type { ActivitySlice } from "@/lib/chartData";

interface Props {
  data: ActivitySlice[];
  loading?: boolean;
}

export default function AiActivityChart({ data, loading }: Props) {
  const total = data.reduce((sum, d) => sum + d.count, 0);

  return (
    <ChartCard title="AI Activity" icon={Bot} iconColor="text-purple-500" subtitle="What you've used AI for, all-time">
      {loading ? (
        <div className="h-52 flex items-center justify-center text-slate-400 text-sm">Loading...</div>
      ) : total === 0 ? (
        <div className="h-52 flex flex-col items-center justify-center text-center">
          <p className="text-slate-400 text-sm">No AI activity yet.</p>
          <p className="text-slate-400 text-xs mt-1">
            Try the <Link href="/resume" className="text-indigo-600 hover:underline">Resume Analyzer</Link> or{" "}
            <Link href="/match" className="text-indigo-600 hover:underline">Job Matcher</Link> to see this chart fill in.
          </p>
        </div>
      ) : (
        <div className="h-52">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
              <YAxis
                type="category"
                dataKey="label"
                width={110}
                tick={{ fontSize: 11, fill: "#475569" }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                cursor={{ fill: "#f8fafc" }}
                contentStyle={{ borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 12 }}
                formatter={(value) => [value, "Times used"]}
              />
              <Bar dataKey="count" radius={[0, 6, 6, 0]} maxBarSize={18}>
                {data.map((slice) => (
                  <Cell key={slice.type} fill={slice.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </ChartCard>
  );
}

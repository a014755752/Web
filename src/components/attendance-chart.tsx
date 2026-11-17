"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ReportGroup } from "@/lib/attendance";

export default function AttendanceChart({ groups, metric, evidence }: {
  groups: ReportGroup[];
  metric: "count" | "rate";
  evidence: (group: ReportGroup) => void;
}) {
  const data = groups.map((group) => ({
    label: group.label,
    registered: group.registered,
    attended: group.tracked > 0 ? group.attended : null,
    rate: group.rate === null ? null : Math.round(group.rate * 1000) / 10,
  }));

  function openBar(_: unknown, index: number) {
    const group = groups[index];
    if (group) evidence(group);
  }

  return (
    <div className="chart-canvas" role="img" aria-label={metric === "count" ? "各组报名与已知到场人数柱状图" : "各组到场率柱状图"}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 12, right: 8, left: 0, bottom: 3 }} barGap={5} barCategoryGap="27%">
          <CartesianGrid vertical={false} stroke="var(--soft-border)" strokeDasharray="3 4" />
          <XAxis
            dataKey="label" tickLine={false} axisLine={false} tickMargin={12}
            tick={{ fontSize: 12, fill: "var(--muted)" }}
            tickFormatter={(label: string) => label.length > 8 ? `${label.slice(0, 7)}…` : label}
          />
          <YAxis
            width={42} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "var(--muted)" }}
            domain={metric === "rate" ? [0, 100] : [0, "auto"]}
            tickFormatter={metric === "rate" ? (value) => `${value}%` : undefined}
            allowDecimals={false}
          />
          <Tooltip
            cursor={{ fill: "var(--surface-muted)" }}
            contentStyle={{ backgroundColor: "var(--surface)", border: "1px solid var(--border)", borderRadius: 6 }}
            labelStyle={{ color: "var(--text)" }}
            itemStyle={{ color: "var(--text)" }}
            formatter={(value) => metric === "rate" ? `${value}%` : value}
          />
          {metric === "count" ? (
            <>
              <Bar dataKey="registered" name="报名人数" fill="var(--chart-registered)" radius={[2, 2, 0, 0]} maxBarSize={54} isAnimationActive={false} onClick={openBar} />
              <Bar dataKey="attended" name="已记录到场" fill="var(--chart-attended)" radius={[2, 2, 0, 0]} maxBarSize={54} isAnimationActive={false} onClick={openBar} />
            </>
          ) : (
            <Bar dataKey="rate" name="到场率" fill="var(--chart-attended)" radius={[2, 2, 0, 0]} maxBarSize={68} isAnimationActive={false} onClick={openBar} />
          )}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

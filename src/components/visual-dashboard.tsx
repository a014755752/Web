"use client";

import dynamic from "next/dynamic";
import { useMemo, useState, type ReactNode } from "react";
import { ArrowUpRight, CalendarDays } from "lucide-react";
import { groupLabels, numberLabel, percent, scopeLabel, type Report, type ReportGroup } from "@/lib/attendance";
import { makeVisualReport, sampleColors } from "@/lib/visual-data";
import { ChartPlaceholder } from "./chart-placeholder";
import type { HeatmapMetric } from "./visual-charts";
import "./visual-dashboard.css";

const FlowChart = dynamic(() => import("./visual-charts").then((module) => module.FlowChart), {
  ssr: false,
  loading: () => <ChartPlaceholder label="正在加载报名与签到流向" />,
});
const SampleChart = dynamic(() => import("./visual-charts").then((module) => module.SampleChart), {
  ssr: false,
  loading: () => <ChartPlaceholder label="正在加载样本与到场率" />,
});
const TimelineChart = dynamic(() => import("./visual-charts").then((module) => module.TimelineChart), {
  ssr: false,
  loading: () => <ChartPlaceholder label="正在加载渠道时段热力图" />,
});

export function preloadVisualCharts() {
  void import("./visual-charts").catch(() => {});
}

function ChartEmpty({ children }: { children: ReactNode }) {
  return <div className="viz-empty">{children}</div>;
}

export default function VisualDashboard({ report, evidence, children }: {
  report: Report;
  evidence: (group: ReportGroup) => void;
  children: ReactNode;
}) {
  const [metric, setMetric] = useState<HeatmapMetric>("rate");
  const visual = useMemo(() => makeVisualReport(report), [report]);
  const { flow, groups, heatmap, priorities, channelCount } = visual;
  const incomplete = groups.find(({ status }) => status === "incomplete");
  const priority = priorities[0];
  const emphasis = priority ?? incomplete;
  const chartHeight = 235 + Math.max(0, flow.nodes.length - 8) * 14;
  const tiles = [
    { name: "报名人次", value: numberLabel(report.totals.registered), tail: `${report.totals.events} 场活动` },
    { name: "已记录到场", value: numberLabel(report.totals.attended), tail: `${report.totals.rowCount - report.totals.missing} 条签到记录` },
    { name: "到场率", value: percent(report.totals.rate), tail: `有效报名 ${numberLabel(report.totals.tracked)} 人次` },
    { name: "签到覆盖率", value: percent(report.totals.coverage), tail: report.totals.missing ? `${report.totals.missing} 条记录待补录` : null },
  ];

  return (
    <div className="visual-workspace">
      <header className="viz-hero">
        <div className="viz-hero-heading">
          <h1>可视化大屏</h1>
          <p><CalendarDays size={15} />{scopeLabel(report.scope)}<span aria-hidden="true">·</span>{channelCount} 个宣传渠道</p>
        </div>
        <div className="viz-criteria" aria-label="当前分析口径">
          <div><span>有效样本门槛</span><strong>{numberLabel(report.criteria.minSamples)}<small>人</small></strong></div>
          <div><span>最低签到覆盖率</span><strong>{percent(report.criteria.minCoverage)}</strong></div>
        </div>
      </header>

      <div className="viz-controls">{children}</div>

      <div className="viz-stats">
        {tiles.map(({ name, value, tail }) => (
          <section className="viz-stat" key={name} aria-label={name}>
            <h2>{name}</h2>
            <strong>{value}</strong>
            {tail && <p>{tail}</p>}
          </section>
        ))}
      </div>

      <div className="viz-chart-grid">
        <section className="viz-panel viz-flow" aria-labelledby="flow-title">
          <div className="viz-panel-heading">
            <h2 id="flow-title">报名与签到流向</h2>
            <p>全部报名 <span>→</span> 宣传渠道 <span>→</span> 签到结果</p>
          </div>
          <div className="viz-chart-frame" style={{ height: chartHeight }}>
            {flow.links.length > 0 ? <FlowChart flow={flow} evidence={evidence} /> : <ChartEmpty>当前范围无报名数据</ChartEmpty>}
          </div>
          <div className="viz-flow-totals">
            {flow.outlets.map(({ id, label, amount, color }) => (
              <div key={id}><span><i style={{ background: color }} />{label}</span><strong>{numberLabel(amount)}<small>人</small></strong></div>
            ))}
          </div>
        </section>

        <section className="viz-panel viz-scatter" aria-labelledby="scatter-title">
          <div className="viz-panel-heading">
            <h2 id="scatter-title">样本与到场率</h2>
            <p>横轴为有效样本人数，虚线为当前门槛</p>
          </div>
          <div className="viz-chart-frame" style={{ height: chartHeight }}>
            {groups.some(({ rate }) => rate !== null)
              ? <SampleChart groups={groups} criteria={report.criteria} evidence={evidence} />
              : <ChartEmpty>补录签到后可比较到场率</ChartEmpty>}
          </div>
          <div className="viz-legend">
            {(["ready", "incomplete", "small"] as const).map((status) => (
              <span key={status}><i style={{ background: sampleColors[status] }} />{groupLabels[status]}</span>
            ))}
            {channelCount > groups.length && <span>显示报名最多的 {groups.length} 个渠道</span>}
          </div>
        </section>
      </div>

      {emphasis && (
        <div className="viz-insight">
          <p>{priority
            ? <><strong>{priorities.length > 1 ? "并列优先复盘" : "优先复盘"}</strong> {priorities.map(({ label }) => label).join("、")} · 到场率 {percent(priority.rate)}</>
            : <><strong>签到覆盖不足</strong> {incomplete?.label}当前覆盖率为 {percent(incomplete?.coverage ?? null)}，可查看待补录记录。</>}</p>
          <button type="button" className="viz-text-button" onClick={() => evidence(emphasis)}>查看依据<ArrowUpRight size={15} /></button>
        </div>
      )}

      <section className="viz-panel viz-timeline" aria-labelledby="timeline-title">
        <div className="viz-panel-heading viz-heading-split">
          <div><h2 id="timeline-title">渠道时段热力图</h2>
            <p>{heatmap.interval === "段" ? "按时段汇总" : `按${heatmap.interval}汇总`} · {heatmap.periods.length} 个时段 · 点击单元格查看原始记录</p>
          </div>
          <div className="viz-switch" role="group" aria-label="热力图指标">
            <button type="button" aria-pressed={metric === "rate"} onClick={() => setMetric("rate")}>到场率</button>
            <button type="button" aria-pressed={metric === "coverage"} onClick={() => setMetric("coverage")}>签到覆盖率</button>
          </div>
        </div>
        <div className="viz-chart-frame" style={{ height: Math.max(175, 36 * heatmap.labels.length + 48) }}>
          {heatmap.cells.length > 0 ? <TimelineChart heatmap={heatmap} metric={metric} evidence={evidence} /> : <ChartEmpty>当前范围无活动记录</ChartEmpty>}
        </div>
        <div className="viz-legend viz-heat-legend">
          <span>0%<i className="viz-scale" />100%</span>
          <span><i className="viz-legend-square viz-no-data" />无记录</span>
          {metric === "rate" && <span><i className="viz-legend-square viz-missing" />待补录</span>}
        </div>
        {groups.length > 0 && <div className="viz-channel-links" aria-label="按渠道查看原始记录">
          {groups.map((group) => (
            <button type="button" className="viz-text-button" key={group.label} onClick={() => evidence(group)} title={group.label}>
              <span>{group.label}</span><ArrowUpRight size={13} />
            </button>
          ))}
        </div>}
      </section>
    </div>
  );
}

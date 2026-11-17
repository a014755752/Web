"use client";

import { useEffect, useMemo, useRef } from "react";
import { HeatmapChart, SankeyChart, ScatterChart, type HeatmapSeriesOption, type SankeySeriesOption, type ScatterSeriesOption } from "echarts/charts";
import { GridComponent, MarkLineComponent, TooltipComponent, VisualMapPiecewiseComponent, type GridComponentOption, type TooltipComponentOption, type VisualMapComponentOption } from "echarts/components";
import { init, use, type ComposeOption, type ECElementEvent, type EChartsType } from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";
import { groupLabels, numberLabel, percent, type Criteria, type ReportGroup } from "@/lib/attendance";
import type { VisualReport } from "@/lib/visual-data";
import type { VisualPalette } from "@/lib/visual-palette";

use([SankeyChart, ScatterChart, HeatmapChart, GridComponent, MarkLineComponent, TooltipComponent, VisualMapPiecewiseComponent, CanvasRenderer]);

type ChartOption = ComposeOption<SankeySeriesOption | ScatterSeriesOption | HeatmapSeriesOption | GridComponentOption | TooltipComponentOption | VisualMapComponentOption>;
type Evidence = (group: ReportGroup) => void;

const chartFont = '"Microsoft YaHei", "PingFang SC", sans-serif';
const shortNumber = new Intl.NumberFormat("zh-CN", { notation: "compact", maximumFractionDigits: 1 });

function chartTooltip(palette: VisualPalette): TooltipComponentOption {
  return {
    trigger: "item",
    renderMode: "richText",
    confine: true,
    backgroundColor: palette.surface,
    borderColor: palette.border,
    padding: 10,
    textStyle: { color: palette.text, fontSize: 12 },
  };
}

function brief(label: string, max = 8) {
  const letters = Array.from(label);
  return letters.length > max ? letters.slice(0, max - 1).join("") + "…" : label;
}

function groupTooltip(group: ReportGroup) {
  return [
    group.label,
    `报名 ${numberLabel(group.registered)} 人 · 有效样本 ${numberLabel(group.tracked)} 人`,
    `到场 ${numberLabel(group.attended)} 人 · 到场率 ${percent(group.rate)}`,
    `覆盖率 ${percent(group.coverage)} · ${groupLabels[group.status]}`,
  ].join("\n");
}

function ChartCanvas({ option, label, onSelect }: {
  option: ChartOption;
  label: string;
  onSelect: (event: ECElementEvent) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const chart = useRef<EChartsType | null>(null);

  useEffect(() => {
    const node = host.current;
    if (!node) return;
    const instance = init(node, undefined, { renderer: "canvas" });
    chart.current = instance;
    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (!instance.isDisposed()) instance.resize();
      });
    });
    observer.observe(node);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      chart.current = null;
      instance.dispose();
    };
  }, []);

  useEffect(() => {
    chart.current?.setOption({
      ...option,
      animation: !window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    }, { notMerge: true });
  }, [option]);

  useEffect(() => {
    const instance = chart.current;
    instance?.on("click", onSelect);
    return () => {
      if (instance && !instance.isDisposed()) instance.off("click", onSelect);
    };
  }, [onSelect]);

  return <div className="viz-chart-canvas" ref={host} role="img" aria-label={label} />;
}

export function FlowChart({ flow, palette, evidence }: { flow: VisualReport["flow"]; palette: VisualPalette; evidence: Evidence }) {
  const { nodes, links } = flow;
  const option = useMemo<ChartOption>(() => ({
    textStyle: { fontFamily: chartFont },
    animationDuration: 260,
    tooltip: {
      ...chartTooltip(palette),
      formatter: (params) => {
        const point = Array.isArray(params) ? params[0] : params;
        if (point?.dataType === "edge") {
          const link = links[point.dataIndex];
          return link ? `${link.source.label} → ${link.target.label}\n${numberLabel(link.amount)} 人` : "";
        }
        const node = point ? nodes[point.dataIndex] : undefined;
        return node ? `${node.label}\n${numberLabel(node.amount)} 人` : "";
      },
    },
    series: [{
      type: "sankey",
      layout: "none",
      nodeAlign: "justify",
      draggable: false,
      left: 12,
      right: 88,
      top: 19,
      bottom: 14,
      nodeWidth: 12,
      nodeGap: 19,
      emphasis: { focus: "adjacency" },
      label: {
        color: palette.text, fontSize: 11, distance: 8,
        formatter: (params) => {
          const node = nodes[params.dataIndex];
          return node ? `${brief(node.label, 7)}  {total|${shortNumber.format(node.amount)}}` : "";
        },
        rich: { total: { color: palette.muted, fontFamily: "monospace", fontSize: 11 } },
      },
      data: nodes.map((node) => ({
        name: node.id,
        depth: node.depth,
        value: node.amount,
        itemStyle: { color: node.color, borderWidth: 0 },
        label: node.depth === 0 ? { show: false } : undefined,
      })),
      links: links.map((link) => ({
        source: link.source.id, target: link.target.id, value: link.amount, lineStyle: { color: link.color },
      })),
      lineStyle: { opacity: 0.41, curveness: 0.53 },
    }],
  }), [links, nodes, palette]);

  return <ChartCanvas option={option} label="全部报名按宣传渠道流向已到场、未到场和待补录三种状态" onSelect={(event) => {
    const group = event.dataType === "edge" ? links[event.dataIndex]?.group : nodes[event.dataIndex]?.group;
    if (group) evidence(group);
  }} />;
}

export function SampleChart({ groups, criteria, palette, evidence }: { groups: ReportGroup[]; criteria: Criteria; palette: VisualPalette; evidence: Evidence }) {
  const points = useMemo(() => groups.filter(({ rate }) => rate !== null), [groups]);
  const option = useMemo<ChartOption>(() => ({
    textStyle: { fontFamily: chartFont },
    grid: { left: 43, right: 21, top: 30, bottom: 34 },
    tooltip: { ...chartTooltip(palette), formatter: (params) => {
      const point = Array.isArray(params) ? params[0] : params;
      const group = point ? points[point.dataIndex] : undefined;
      return group ? groupTooltip(group) : "";
    } },
    xAxis: {
      type: "value", min: 0, max: Math.ceil(Math.max(4, criteria.minSamples, ...points.map(({ tracked }) => tracked)) * 1.2),
      minInterval: 1, splitNumber: 4,
      axisLabel: { color: palette.muted, fontSize: 10, formatter: (value: number) => shortNumber.format(value) },
      axisLine: { show: true, lineStyle: { color: palette.border } },
      splitLine: { lineStyle: { color: palette.grid, type: "dashed", opacity: 0.65 } },
    },
    yAxis: {
      type: "value", min: 0, max: 100, interval: 25,
      axisLabel: { color: palette.muted, fontSize: 10, formatter: "{value}%" },
      splitLine: { lineStyle: { color: palette.grid, type: "dashed" } },
    },
    animationDuration: 220,
    series: [{
      type: "scatter",
      symbolSize: 15,
      label: {
        show: points.length <= 6, position: "top", distance: 6, color: palette.text, fontSize: 11,
        formatter: (params) => brief(points[params.dataIndex]?.label ?? "", 7),
      },
      data: points.map((group) => ({
        value: [group.tracked, (group.rate ?? 0) * 100],
        itemStyle: { color: palette.samples[group.status], borderColor: palette.surface, borderWidth: 2 },
      })),
      markLine: criteria.minSamples > 0 ? {
        silent: true, symbol: "none",
        label: { position: "end", color: palette.warning, fontSize: 10, formatter: `门槛 ${shortNumber.format(criteria.minSamples)}` },
        lineStyle: { color: palette.warning, type: "dashed", opacity: 0.75 },
        data: [{ xAxis: criteria.minSamples }],
      } : undefined,
    }],
  }), [criteria.minSamples, palette, points]);

  return <ChartCanvas option={option} label="有效报名人数与到场率散点图，标注当前样本门槛" onSelect={(event) => {
    const group = points[event.dataIndex];
    if (group && event.componentType === "series") evidence(group);
  }} />;
}

export type HeatmapMetric = "rate" | "coverage";

export function TimelineChart({ heatmap, metric, palette, evidence }: { heatmap: VisualReport["heatmap"]; metric: HeatmapMetric; palette: VisualPalette; evidence: Evidence }) {
  const { periods, cells, labels } = heatmap;
  const option = useMemo<ChartOption>(() => ({
    textStyle: { fontFamily: chartFont },
    grid: { left: 86, right: 15, top: 7, bottom: 29 },
    tooltip: { ...chartTooltip(palette), formatter: (params) => {
      const point = Array.isArray(params) ? params[0] : params;
      const cell = point ? cells[point.dataIndex] : undefined;
      return cell?.group ? groupTooltip(cell.group) : "本时段无活动记录";
    } },
    animationDuration: 180,
    xAxis: {
      type: "category", data: periods.map(({ from }) => from), axisTick: { show: false }, axisLine: { show: false },
      axisLabel: { color: palette.muted, fontSize: 11, formatter: (_value: string, index: number) => periods[index]?.label ?? "" },
    },
    yAxis: {
      type: "category", data: labels.map((_, index) => "channel-" + index), inverse: true, axisTick: { show: false }, axisLine: { show: false },
      axisLabel: { color: palette.text, fontSize: 11, formatter: (_value: string, index: number) => brief(labels[index] ?? "", 7) },
    },
    visualMap: {
      type: "piecewise", show: false, dimension: 2,
      pieces: [
        { value: -3, color: palette.heatmap.empty },
        { value: -2, color: palette.heatmap.noRecord },
        { value: -1, color: palette.heatmap.pending },
        { gte: 0, lt: 35, color: palette.heatmap.levels[0] },
        { gte: 35, lt: 60, color: palette.heatmap.levels[1] },
        { gte: 60, lt: 80, color: palette.heatmap.levels[2] },
        { gte: 80, lte: 100, color: palette.heatmap.levels[3] },
      ],
    },
    series: [{
      type: "heatmap",
      data: cells.map(({ row, column, group }) => {
        const value = group?.[metric];
        const score = value !== null && value !== undefined ? Math.round(value * 1000) / 10
          : !group ? -2 : group.registered === 0 ? -3 : -1;
        return [column, row, score];
      }),
      itemStyle: { borderColor: palette.surface, borderWidth: 4, borderRadius: 6 },
      label: {
        show: periods.length <= 9, color: palette.heatmap.text, fontSize: 10,
        formatter: (params) => {
          const cell = cells[params.dataIndex];
          return cell?.group ? (cell.group[metric] === null && cell.group.registered > 0 ? "待补录" : percent(cell.group[metric])) : "";
        },
      },
      emphasis: { itemStyle: { borderColor: palette.accent, borderWidth: 2 } },
    }],
  }), [cells, labels, metric, palette, periods]);

  return <ChartCanvas option={option} label={metric === "rate" ? "各渠道各时段的到场率热力图" : "各渠道各时段的签到覆盖率热力图"} onSelect={(event) => {
    const group = cells[event.dataIndex]?.group;
    if (group && event.componentType === "series") evidence(group);
  }} />;
}

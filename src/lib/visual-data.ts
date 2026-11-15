import { makeReport, makeReportGroup, type Criteria, type Report, type ReportGroup } from "./attendance";

const maxChannels = 8;
const channelColors = ["#65cfff", "#53e0b5", "#ad9dff", "#8bd8f7", "#85dca6", "#e6a4f3", "#c6de76", "#8b9fba"];

type FlowNode = {
  id: string;
  label: string;
  amount: number;
  depth: 0 | 1 | 2;
  color: string;
  group?: ReportGroup;
};

type FlowLink = { source: FlowNode; target: FlowNode; amount: number; color: string; group: ReportGroup };

function attendanceOutcomes(group: Pick<ReportGroup, "attended" | "tracked" | "registered">) {
  return [group.attended, group.tracked - group.attended, group.registered - group.tracked];
}

function buildFlow(report: Report, groups: ReportGroup[]) {
  const start: FlowNode = { id: "registered", label: "全部报名", amount: report.totals.registered, depth: 0, color: "#58c6fa" };
  const outlets: FlowNode[] = [
    { id: "attended", label: "已到场", amount: report.totals.attended, depth: 2, color: "#50e2af" },
    { id: "absent", label: "未到场", amount: report.totals.tracked - report.totals.attended, depth: 2, color: "#7b9cc9" },
    { id: "pending", label: "待补录", amount: report.totals.registered - report.totals.tracked, depth: 2, color: "#f4b66b" },
  ];
  const middle = groups.filter(({ registered }) => registered > 0).map((group, index): FlowNode => ({
    id: "channel-" + index, label: group.label, amount: group.registered, depth: 1, color: channelColors[index], group,
  }));

  const links: FlowLink[] = [];
  for (const node of middle) {
    const group = node.group;
    if (!group) continue;
    links.push({ source: start, target: node, amount: node.amount, color: node.color, group });
    const outcomes = attendanceOutcomes(group);
    outlets.forEach((target, index) => {
      if (outcomes[index] > 0) links.push({ source: node, target, amount: outcomes[index], color: target.color, group });
    });
  }

  const nodes = [start, ...middle, ...outlets.filter(({ amount }) => amount > 0)];
  return { nodes, links, outlets };
}

function groupDates(dates: string[], key: (date: string) => string) {
  const groups = new Map<string, string[]>();
  for (const date of dates) {
    const id = key(date);
    const group = groups.get(id) ?? [];
    group.push(date);
    groups.set(id, group);
  }
  return [...groups.values()];
}

function mondayOf(date: string) {
  const time = new Date(date + "T00:00:00Z");
  time.setUTCDate(time.getUTCDate() - (time.getUTCDay() + 6) % 7);
  return time.toISOString();
}

function timeBuckets(dates: string[]) {
  if (dates.length <= 8) return { interval: "日", buckets: dates.map((date) => [date]) };
  const weeks = groupDates(dates, mondayOf);
  if (weeks.length <= 12) return { interval: "周", buckets: weeks };
  const months = groupDates(dates, (date) => date.slice(0, 7));
  if (months.length <= 12) return { interval: "月", buckets: months };

  const step = Math.ceil(months.length / 12);
  return {
    interval: "段",
    buckets: Array.from({ length: Math.ceil(months.length / step) }, (_, index) => months.slice(index * step, (index + 1) * step).flat()),
  };
}

function buildHeatmap(groups: ReportGroup[], dates: string[], criteria: Criteria) {
  const { interval, buckets } = timeBuckets(dates);
  const columns = new Map<string, number>();
  const sameYear = dates[0]?.slice(0, 4) === dates.at(-1)?.slice(0, 4);
  const periods = buckets.map((bucket, index) => {
    bucket.forEach((date) => columns.set(date, index));
    const from = bucket[0];
    const to = bucket.at(-1) ?? from;
    const label = interval === "月" || interval === "段" ? from.slice(0, 7).replace("-", "/")
      : sameYear ? from.slice(5).replace("-", "/") : from;
    return { from, to, label };
  });

  const cells = groups.flatMap((group, row) => {
    const records = periods.map((): ReportGroup["rows"] => []);
    for (const entry of group.rows) {
      const column = columns.get(entry.date);
      if (column !== undefined) records[column].push(entry);
    }
    return records.map((matching, column) => {
      const { from, to } = periods[column];
      const period = from === to ? from : `${from} 至 ${to}`;
      const detail = matching.length ? makeReportGroup(`${group.label} · ${period}`, matching, criteria) : null;
      return { row, column, group: detail };
    });
  });
  return {
    interval, periods, cells,
    labels: groups.map(({ label }) => label),
  };
}

export function makeVisualReport(report: Report) {
  const byChannel = report.scope.groupBy === "channel"
    ? report
    : makeReport(report.rows, { ...report.scope, groupBy: "channel" }, report.criteria);
  const groups = byChannel.groups.slice(0, maxChannels);
  const remaining = byChannel.groups.length - maxChannels + 1;
  const chartGroups = remaining > 1 ? [
    ...groups.slice(0, maxChannels - 1),
    makeReportGroup(`其余 ${remaining} 个渠道`, byChannel.groups.slice(maxChannels - 1).flatMap(({ rows }) => rows), report.criteria),
  ] : groups;
  const dates = [...new Set(byChannel.rows.map(({ date }) => date))].sort();

  return {
    flow: buildFlow(byChannel, chartGroups),
    heatmap: buildHeatmap(chartGroups, dates, report.criteria),
    groups,
    channelCount: byChannel.groups.length,
    priorities: byChannel.priorities,
  };
}

export type VisualReport = ReturnType<typeof makeVisualReport>;

import { z } from "zod";

export const MAX_ROWS = 1000;
const name = z.string().trim().min(1).max(80);
const count = z.number().int().min(0).max(1_000_000);

export const recordSchema = z.object({
  eventId: name,
  eventName: name,
  date: z.iso.date(),
  category: name,
  channel: name,
  registered: count,
  attended: count.nullable(),
}).refine((row) => row.attended === null || row.attended <= row.registered, {
  path: ["attended"],
  message: "到场数不能超过报名数",
});

export type AttendanceRecord = z.infer<typeof recordSchema>;

export function recordKey(row: Pick<AttendanceRecord, "eventId" | "channel">) {
  return JSON.stringify([row.eventId, row.channel]);
}

export const recordsSchema = z.array(recordSchema).min(1).max(MAX_ROWS).superRefine((rows, ctx) => {
  const keys = new Set<string>();
  const events = new Map<string, AttendanceRecord>();

  for (const [index, row] of rows.entries()) {
    const key = recordKey(row);
    if (keys.has(key)) {
      ctx.addIssue({ code: "custom", path: [index], message: "活动编号和渠道重复" });
    }
    keys.add(key);

    const event = events.get(row.eventId);
    if (event && (event.eventName !== row.eventName || event.category !== row.category || event.date !== row.date)) {
      ctx.addIssue({ code: "custom", path: [index], message: "相同活动编号的名称、日期或类型不一致" });
    }
    events.set(row.eventId, row);
  }
});

export const scopeSchema = z.object({
  from: z.iso.date().nullable(),
  to: z.iso.date().nullable(),
  category: name.nullable(),
  channel: name.nullable(),
  groupBy: z.enum(["channel", "category"]),
}).refine((scope) => !scope.from || !scope.to || scope.from <= scope.to, {
  message: "起始日期须早于或等于结束日期",
});

export type AnalysisScope = z.infer<typeof scopeSchema>;

export const criteriaSchema = z.object({
  minSamples: count,
  minCoverage: z.number().min(0).max(1),
});

export type Criteria = z.infer<typeof criteriaSchema>;

export const defaultCriteria: Criteria = { minSamples: 20, minCoverage: 0.8 };

export function defaultScope(rows: AttendanceRecord[]): AnalysisScope {
  const dates = rows.map((row) => row.date).sort();
  return { from: dates[0] ?? null, to: dates.at(-1) ?? null, category: null, channel: null, groupBy: "channel" };
}

export function filterRows(rows: AttendanceRecord[], scope: AnalysisScope) {
  return rows.filter((row) => (
    (!scope.from || row.date >= scope.from) &&
    (!scope.to || row.date <= scope.to) &&
    (!scope.category || row.category === scope.category) &&
    (!scope.channel || row.channel === scope.channel)
  ));
}

function summarize(rows: AttendanceRecord[]) {
  let registered = 0;
  let tracked = 0;
  let attended = 0;
  let missing = 0;
  const eventIds = new Set<string>();

  for (const row of rows) {
    registered += row.registered;
    eventIds.add(row.eventId);
    if (row.attended === null) {
      missing += 1;
    } else {
      tracked += row.registered;
      attended += row.attended;
    }
  }

  return {
    registered, tracked, attended, missing, events: eventIds.size, rowCount: rows.length,
    rate: tracked > 0 ? attended / tracked : null,
    coverage: registered > 0 ? tracked / registered : null,
  };
}

export type GroupStatus = "ready" | "incomplete" | "small" | "empty";

export function makeReport(records: AttendanceRecord[], scope: AnalysisScope, criteria: Criteria) {
  const rows = filterRows(records, scope);
  const buckets = new Map<string, AttendanceRecord[]>();
  for (const row of rows) {
    const key = row[scope.groupBy];
    const existing = buckets.get(key) ?? [];
    existing.push(row);
    buckets.set(key, existing);
  }

  const groups = [...buckets.entries()].map(([label, matching]) => {
    const summary = summarize(matching);
    let status: GroupStatus = "ready";
    if (summary.registered === 0) status = "empty";
    else if (summary.rate === null || (summary.coverage ?? 0) < criteria.minCoverage) status = "incomplete";
    else if (summary.tracked < criteria.minSamples) status = "small";
    return { label, ...summary, status, rows: matching };
  }).sort((a, b) => b.registered - a.registered || a.label.localeCompare(b.label, "zh-CN"));

  const ranked = groups.filter((group) => group.status === "ready" && group.rate !== null)
    .sort((a, b) => (a.rate ?? 0) - (b.rate ?? 0) || a.label.localeCompare(b.label, "zh-CN"));
  const priorities = ranked.length >= 2 ? ranked.filter((group) => group.rate === ranked[0].rate) : [];

  return { scope, criteria, rows, groups, totals: summarize(rows), ranked, priorities };
}

export type Report = ReturnType<typeof makeReport>;
export type ReportGroup = Report["groups"][number];

export const groupLabels: Record<GroupStatus, string> = {
  ready: "可比较",
  incomplete: "待补录",
  small: "样本偏小",
  empty: "无报名",
};

const percentFormatter = new Intl.NumberFormat("zh-CN", { style: "percent", maximumFractionDigits: 1 });
const numberFormatter = new Intl.NumberFormat("zh-CN");

export function percent(value: number | null) {
  return value === null ? "—" : percentFormatter.format(value);
}

export function numberLabel(value: number) {
  return numberFormatter.format(value);
}

export function scopeLabel(scope: AnalysisScope) {
  if (scope.from && scope.to) return scope.from === scope.to ? scope.from : `${scope.from} 至 ${scope.to}`;
  if (scope.from) return `${scope.from} 起`;
  if (scope.to) return `截至 ${scope.to}`;
  return "全部日期";
}

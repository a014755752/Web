import {
  MAX_ROWS, defaultCriteria, makeReport, recordKey, recordsSchema,
  type AnalysisScope, type AttendanceRecord, type Report,
} from "./attendance";
import { applicableRule } from "./rules";

export type ActivityFields = Pick<AttendanceRecord, "eventId" | "eventName" | "date" | "category">;
export type LedgerActivity = ActivityFields & { rows: AttendanceRecord[] };

export function listActivities(rows: AttendanceRecord[]) {
  const activities = new Map<string, LedgerActivity>();
  for (const row of rows) {
    const { eventId, eventName, date, category } = row;
    const activity = activities.get(eventId);
    if (activity) activity.rows.push(row);
    else activities.set(eventId, { eventId, eventName, date, category, rows: [row] });
  }
  return [...activities.values()].sort((a, b) => b.date.localeCompare(a.date) || a.eventId.localeCompare(b.eventId, "zh-CN", { numeric: true }));
}

export function activityScope({ eventId, date, category }: ActivityFields): AnalysisScope {
  return { eventId, from: date, to: date, category, channel: null, groupBy: "channel" };
}

export function reportActivity(activity: LedgerActivity, useRules: boolean) {
  const scope = activityScope(activity);
  const rule = useRules ? applicableRule(scope) : null;
  return { rule, report: makeReport(activity.rows, scope, rule?.criteria ?? defaultCriteria) };
}

function rateDelta(before: number | null, after: number | null) {
  return before === null || after === null ? null : (after - before) * 100;
}

function comparable({ totals, criteria }: Report) {
  return totals.rate !== null && totals.tracked >= criteria.minSamples && (totals.coverage ?? 0) >= criteria.minCoverage;
}

export function compareActivityReports(baseline: LedgerActivity, target: LedgerActivity, useRules: boolean) {
  const base = { activity: baseline, ...reportActivity(baseline, useRules) };
  const comparison = { activity: target, ...reportActivity(target, useRules) };
  const before = base.report.totals;
  const after = comparison.report.totals;
  const baseChannels = new Map(base.report.groups.map((group) => [group.label, group]));
  const targetChannels = new Map(comparison.report.groups.map((group) => [group.label, group]));
  const labels = new Set([...baseChannels.keys(), ...targetChannels.keys()]);
  return {
    base, comparison,
    rateDelta: comparable(base.report) && comparable(comparison.report) ? rateDelta(before.rate, after.rate) : null,
    coverageDelta: rateDelta(before.coverage, after.coverage),
    channels: [...labels].map((label) => {
      const before = baseChannels.get(label);
      const after = targetChannels.get(label);
      const delta = before?.status === "ready" && after?.status === "ready" ? rateDelta(before.rate, after.rate) : null;
      return { label, before, after, delta };
    }),
  };
}

export type ActivityComparisonReport = ReturnType<typeof compareActivityReports>;

const pointFormatter = new Intl.NumberFormat("zh-CN", { signDisplay: "exceptZero", maximumFractionDigits: 1 });

export function formatPointChange(delta: number | null) {
  return delta === null ? "—" : `${pointFormatter.format(delta)} 个百分点`;
}

export function nextActivityId(rows: AttendanceRecord[]) {
  const used = new Set(rows.map(({ eventId }) => eventId));
  let sequence = 1;
  const id = () => "A" + String(sequence).padStart(2, "0");
  while (used.has(id())) sequence += 1;
  return id();
}

export function validateLedgerRows(rows: AttendanceRecord[]) {
  if (rows.length > MAX_ROWS) throw new Error(`台账最多保存 ${MAX_ROWS} 条渠道记录。`);
  const result = recordsSchema.safeParse(rows);
  if (result.success) return result.data;
  const issue = result.error.issues[0];
  const row = typeof issue?.path[0] === "number" ? rows[issue.path[0]] : undefined;
  const reason = issue?.code === "custom" ? issue.message : "请核对活动编号、日期和人数。";
  throw new Error(row ? `${row.eventId} · ${row.channel}，${reason}` : reason);
}

export function appendLedgerRows(current: AttendanceRecord[], incoming: AttendanceRecord[]) {
  const byKey = new Map(current.map((row) => [recordKey(row), row]));
  const additions: AttendanceRecord[] = [];
  for (const row of incoming) {
    const existing = byKey.get(recordKey(row));
    if (!existing) {
      additions.push(row);
      continue;
    }
    if (existing.eventName !== row.eventName || existing.date !== row.date || existing.category !== row.category ||
        existing.registered !== row.registered || existing.attended !== row.attended) {
      throw new Error(`${row.eventId} · ${row.channel} 与现有记录有冲突，请核对后导入。`);
    }
  }
  return {
    rows: validateLedgerRows([...current, ...additions]),
    added: additions.length,
    duplicates: incoming.length - additions.length,
  };
}

import {
  MAX_ROWS, defaultCriteria, makeReport, recordKey, recordsSchema,
  type AnalysisScope, type AttendanceRecord,
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

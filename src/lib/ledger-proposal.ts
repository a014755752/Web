import { z } from "zod";
import { recordKey, recordSchema, type AttendanceRecord } from "./attendance";
import { nextActivityId, validateLedgerRows } from "./ledger-activities";

const name = z.string().trim().min(1).max(80);
const count = z.number().int().min(0).max(1_000_000);
const channelSchema = z.object({ channel: name, registered: count, attended: count.nullable() });
export const createActivitiesSchema = z.object({ activities: z.array(z.object({
  eventId: name.optional(), eventName: name, date: z.iso.date(), category: name,
  channels: z.array(channelSchema).min(1).max(50),
})).min(1).max(20) });
export const updateActivitiesSchema = z.object({ activities: z.array(z.object({
  eventId: name, eventName: name.optional(), date: z.iso.date().optional(), category: name.optional(),
  channels: z.array(z.object({ channel: name, registered: count.optional(), attended: count.nullable().optional() })).max(50).optional(),
})).min(1).max(20) });

export const ledgerProposalSchema = z.object({
  id: z.string().min(1).max(80), title: z.string().min(1).max(160),
  status: z.enum(["pending", "applied", "cancelled"]),
  changes: z.array(z.object({ before: recordSchema.nullable(), after: recordSchema })).min(1).max(200),
});
export type LedgerProposal = z.infer<typeof ledgerProposalSchema>;

function sameRow(a: AttendanceRecord, b: AttendanceRecord) {
  return (Object.keys(a) as (keyof AttendanceRecord)[]).every((key) => a[key] === b[key]);
}

export function applyLedgerProposal(rows: AttendanceRecord[], raw: LedgerProposal) {
  const proposal = ledgerProposalSchema.parse(raw);
  if (proposal.status !== "pending") throw new Error("这项变更已处理。");
  const byKey = new Map(rows.map((row) => [recordKey(row), row]));
  const touched = new Set<string>();
  for (const { before, after } of proposal.changes) {
    const key = recordKey(after);
    if (touched.has(key)) throw new Error("变更中有重复的活动渠道，请重新生成。");
    touched.add(key);
    const existing = byKey.get(key);
    if (before ? !existing || recordKey(before) !== key || !sameRow(existing, before) : !!existing) {
      throw new Error("台账已变化，请重新读取活动后生成变更。");
    }
    byKey.set(key, after);
  }
  return validateLedgerRows([...byKey.values()]);
}

function proposalFor(rows: AttendanceRecord[], next: AttendanceRecord[], title: string): LedgerProposal {
  const original = new Map(rows.map((row) => [recordKey(row), row]));
  validateLedgerRows(next);
  const changes = next.flatMap((after) => {
    const before = original.get(recordKey(after)) ?? null;
    return before && sameRow(before, after) ? [] : [{ before, after }];
  });
  if (!changes.length) throw new Error("这些字段与台账相同，没有需要修改的内容。");
  return ledgerProposalSchema.parse({ id: crypto.randomUUID(), title, status: "pending", changes });
}

export function proposeCreateActivities(rows: AttendanceRecord[], raw: z.infer<typeof createActivitiesSchema>) {
  const { activities } = createActivitiesSchema.parse(raw);
  const next = [...rows];
  for (const activity of activities) {
    const eventId = activity.eventId ?? nextActivityId(next);
    if (next.some((row) => row.eventId === eventId)) throw new Error(`${eventId} 已存在，请使用修改活动工具。`);
    const { eventName, date, category } = activity;
    for (const channel of activity.channels) next.push({ eventId, eventName, date, category, ...channel });
  }
  return proposalFor(rows, next, `新增 ${activities.length} 场活动`);
}

export function proposeUpdateActivities(rows: AttendanceRecord[], raw: z.infer<typeof updateActivitiesSchema>) {
  const { activities } = updateActivitiesSchema.parse(raw);
  let next = [...rows];
  const changedIds = new Set<string>();
  for (const patch of activities) {
    if (changedIds.has(patch.eventId)) throw new Error("请把同一活动的修改合并到一起。");
    changedIds.add(patch.eventId);
    const activity = next.find((row) => row.eventId === patch.eventId);
    if (!activity) throw new Error(`没有找到 ${patch.eventId}，请先读取活动列表。`);
    const metadata = { eventId: activity.eventId, eventName: patch.eventName ?? activity.eventName,
      date: patch.date ?? activity.date, category: patch.category ?? activity.category };
    next = next.map((row) => row.eventId === patch.eventId ? { ...row, ...metadata } : row);
    const channels = new Set<string>();
    for (const channel of patch.channels ?? []) {
      if (channels.has(channel.channel)) throw new Error("同一渠道不能重复修改。");
      channels.add(channel.channel);
      const key = recordKey({ eventId: patch.eventId, channel: channel.channel });
      const index = next.findIndex((row) => recordKey(row) === key);
      if (index < 0) {
        if (channel.registered === undefined) throw new Error(`新增${channel.channel}渠道需要明确报名人数。`);
        next.push({ ...metadata, channel: channel.channel, registered: channel.registered, attended: channel.attended ?? null });
      } else {
        next[index] = { ...next[index], ...(channel.registered === undefined ? {} : { registered: channel.registered }),
          ...(channel.attended === undefined ? {} : { attended: channel.attended }) };
      }
    }
  }
  return proposalFor(rows, next, `修改 ${activities.length} 场活动`);
}

import { type AttendanceRecord } from "./attendance";
import { compareActivityReports, listActivities, type ActivityComparisonReport } from "./ledger-activities";

export type ComparisonInput = {
  kind: "compare";
  question: string;
  rows: AttendanceRecord[];
  baselineId: string;
  targetId: string;
  useRules: boolean;
};

export type ComparisonAction = {
  id: string;
  title: string;
  detail: string;
  channel?: string;
  record?: AttendanceRecord;
};

export type ComparisonRun = { kind: "compare"; mode: "agent" | "local"; actionId: string };

export function comparisonReport({ rows, baselineId, targetId, useRules }: ComparisonInput) {
  const activities = listActivities(rows);
  const baseline = activities.find(({ eventId }) => eventId === baselineId);
  const target = activities.find(({ eventId }) => eventId === targetId);
  if (!baseline || !target || baselineId === targetId) throw new Error("请选择两场不同的活动。");
  return compareActivityReports(baseline, target, useRules);
}

export function comparisonActions({ base, comparison, channels }: ActivityComparisonReport, question: string): ComparisonAction[] {
  const actions: ComparisonAction[] = [];
  for (const activity of [comparison.activity, base.activity]) {
    const record = activity.rows.filter(({ attended }) => attended === null).sort((a, b) => b.registered - a.registered)[0];
    if (record) actions.push({
      id: `checkin-${actions.length}`,
      title: `核对「${record.channel}」签到`,
      detail: `补齐${activity.eventName}的到场记录。下一场按渠道在活动结束当天核对报名和实到。`,
      record,
    });
  }

  const comparable = channels.filter(({ delta }) => delta !== null)
    .sort((a, b) => Number(question.includes(b.label)) - Number(question.includes(a.label)) || (a.delta ?? 0) - (b.delta ?? 0)).slice(0, 5);
  for (const { label, delta } of comparable) {
    const index = actions.length;
    if ((delta ?? 0) < -0.05) actions.push({
      id: `remind-${index}`, channel: label,
      title: `试行「${label}」报名提醒`,
      detail: "下一场在活动前一天提醒该渠道的已报名同学确认到场，活动后按相同口径复测到场率。",
    });
    actions.push({
      id: `verify-${index}`, channel: label,
      title: `检查「${label}」报名归属`,
      detail: "下一场为该渠道保留独立报名入口，结束后核对重复报名和签到归属，再比较有效样本与到场率。",
    });
  }

  if (!actions.length) actions.push({
    id: "sample",
    title: "积累同类型活动的渠道样本",
    detail: "下一场沿用同一组渠道和签到口径，达到有效样本与签到覆盖门槛后再比较到场率。",
  });
  return actions;
}

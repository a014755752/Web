import type { AnalysisStep } from "../analysis-run";

type ToolEvent = { callId: string; toolCall: { toolName: string; toolCallId: string; input: unknown } };
type FinishedToolEvent = ToolEvent & {
  toolOutput: { type: "tool-result"; output: unknown } | { type: "tool-error" };
  toolExecutionMs: number;
};

const toolLabels: Record<string, string> = {
  search_club_rules: "检索社团规则",
  summarize_attendance: "汇总报名与到场",
  list_attendance_records: "查询原始活动记录",
  select_follow_up: "选择后续操作",
  compare_activities: "对比活动记录",
  choose_next_action: "选定下一场改进动作",
};

function fields(value: unknown) {
  return value !== null && typeof value === "object" ? value as Record<string, unknown> : {};
}

function preview(value: unknown) {
  const text = JSON.stringify(value ?? {}, null, 2);
  return text.length <= 12_000 ? text : `${text.slice(0, 12_000)}\n… 输出过长，已截取预览`;
}

function label(key: string, input: unknown) {
  return key === "list_attendance_records" && fields(input).onlyMissing === true ? "查找待补录记录" : toolLabels[key] ?? key;
}

function summary(key: string, output: Record<string, unknown>) {
  if (typeof output.error === "string") return output.error;
  if (key === "summarize_attendance") {
    const { rowCount, missing } = fields(output.totals);
    return `${rowCount ?? 0} 条记录 · ${missing ?? 0} 条待补录`;
  }
  if (key === "list_attendance_records") {
    const first = Array.isArray(output.records) ? fields(output.records[0]) : {};
    const example = first.eventId && first.channel ? ` · ${first.eventId} / ${first.channel}` : "";
    return `${output.count ?? 0} 条匹配记录${example}`;
  }
  if (key === "search_club_rules" && Array.isArray(output.sources)) {
    return output.sources.map((source) => fields(source).title).filter(Boolean).join("、") || "当前范围无匹配规则";
  }
  if (key === "compare_activities") return `${output.comparableChannels ?? 0} 个渠道可比较`;
  return String(output.title ?? output.label ?? output.key ?? "已返回执行结果");
}

export function observeAgentTools(emit: (step: AnalysisStep) => void) {
  function onToolExecutionStart({ callId, toolCall }: ToolEvent) {
    const { toolName, toolCallId, input } = toolCall;
    emit({ name: label(toolName, input), detail: "正在执行", tool: {
      key: toolName, id: `${callId}:${toolCallId}`, status: "running", input: preview(input),
    } });
  }

  function onToolExecutionEnd({ callId, toolCall, toolOutput, toolExecutionMs }: FinishedToolEvent) {
    const { toolName, toolCallId, input } = toolCall;
    const output = toolOutput.type === "tool-result" ? fields(toolOutput.output) : { error: "工具执行失败" };
    emit({ name: label(toolName, input), detail: summary(toolName, output), tool: {
      key: toolName, id: `${callId}:${toolCallId}`, status: output.error ? "failed" : "completed",
      input: preview(input), output: preview(output), durationMs: Math.round(toolExecutionMs),
    } });
  }

  return { onToolExecutionStart, onToolExecutionEnd };
}

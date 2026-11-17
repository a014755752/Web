"use client";

import { useEffect, useRef, useState } from "react";
import { makeReport, recordKey, type AttendanceRecord, type Report } from "@/lib/attendance";
import type { ScanSource } from "@/lib/attendance-scan";
import { requestAnalysis } from "@/lib/analysis-client";
import { runLocalAnalysis, type AnalysisRun, type AnalysisStep, type TaskInput } from "@/lib/analysis-run";
import { comparisonActions, comparisonReport, type ComparisonAction, type ComparisonRun } from "@/lib/comparison-run";
import type { ActivityComparisonReport } from "@/lib/ledger-activities";
import type { WorkspaceLedger } from "@/lib/workspace-store";

type ReviewResult = { kind: "review"; run: AnalysisRun; report: Report; pending: AttendanceRecord | undefined };
type CompareResult = { kind: "compare"; mode: ComparisonRun["mode"]; report: ActivityComparisonReport; action: ComparisonAction };
type TurnResult = ReviewResult | CompareResult;

export type AiTurn = {
  id: number;
  question: string;
  useRules: boolean;
  revision: number;
  status: "running" | "completed" | "stopped";
  steps: AnalysisStep[];
  result?: TurnResult;
  before?: ReviewResult;
  warning?: string;
};

function resultFor(input: TaskInput, response?: AnalysisRun | ComparisonRun): TurnResult {
  if (input.kind === "compare") {
    const report = comparisonReport(input);
    const actions = comparisonActions(report, input.question);
    if (response && !("kind" in response)) throw new Error("模型未返回活动对比。");
    const action = response ? actions.find(({ id }) => id === response.actionId) : actions[0];
    if (!action) throw new Error("模型提出的动作缺少台账依据。");
    return { kind: "compare", mode: response?.mode ?? "local", report, action };
  }

  if (response && "kind" in response) throw new Error("模型未返回复盘结果。");
  const run = response ?? runLocalAnalysis(input);
  const report = makeReport(input.rows, run.scope, run.criteria);
  const missing = report.rows.filter(({ attended }) => attended === null).sort((a, b) => b.registered - a.registered);
  const followUp = run.followUp;
  const selected = followUp?.action === "fill_checkin" ? missing.find((row) => recordKey(row) === followUp.key) : undefined;
  return { kind: "review", run, report, pending: selected ?? missing[0] };
}

function localStep(result: TurnResult): AnalysisStep {
  return result.kind === "review"
    ? { name: "本地统计", detail: `${result.report.totals.rowCount} 条签到记录，${result.report.totals.missing} 条待补录。` }
    : { name: "本地对比", detail: `${result.report.channels.filter(({ delta }) => delta !== null).length} 个渠道可比较。` };
}

export function useAiConversation(modelConfigured: boolean) {
  const [turns, setTurns] = useState<AiTurn[]>([]);
  const active = useRef<{ id: number; controller: AbortController } | null>(null);
  const sequence = useRef(0);

  useEffect(() => () => {
    active.current?.controller.abort();
    active.current = null;
  }, []);

  function update(id: number, change: (turn: AiTurn) => AiTurn) {
    setTurns((current) => current.map((turn) => turn.id === id ? change(turn) : turn));
  }

  function stop() {
    const request = active.current;
    if (!request) return;
    active.current = null;
    request.controller.abort();
    update(request.id, (turn) => ({ ...turn, status: "stopped" }));
  }

  async function execute(input: TaskInput, revision: number, continued?: { turn: AiTurn; steps: AnalysisStep[]; previous?: ReviewResult }) {
    if (active.current) return;
    const id = continued?.turn.id ?? ++sequence.current;
    const request = { id, controller: new AbortController() };
    active.current = request;
    if (continued) {
      update(id, (turn) => ({
        ...turn,
        status: "running",
        warning: undefined,
        before: turn.before ?? continued.previous,
        steps: [...turn.steps, ...continued.steps],
      }));
    } else {
      const turn: AiTurn = { id, question: input.question, useRules: input.useRules, revision, status: "running", steps: [] };
      setTurns((current) => [...current.slice(-11), turn]);
    }

    function finish(result: TurnResult, warning?: string) {
      if (active.current !== request) return;
      const local = (result.kind === "review" ? result.run.mode : result.mode) === "local";
      update(id, (turn) => ({
        ...turn, result, revision, warning, status: "completed",
        steps: local ? [...turn.steps, localStep(result)] : turn.steps,
      }));
    }

    try {
      const response = modelConfigured ? await requestAnalysis(input, request.controller.signal, (step) => {
        if (active.current === request) update(id, (turn) => ({ ...turn, steps: [...turn.steps, step] }));
      }) : undefined;
      if (active.current === request) finish(resultFor(input, response));
    } catch (error) {
      if (active.current !== request) return;
      try {
        const warning = error instanceof Error ? error.message : "模型暂时不可用。";
        finish(resultFor(input), `${warning} 已使用本地统计。`);
      } catch (fallbackError) {
        const warning = fallbackError instanceof Error ? fallbackError.message : "无法完成分析。";
        update(id, (turn) => ({ ...turn, status: "completed", warning }));
      }
    } finally {
      if (active.current === request) active.current = null;
    }
  }

  function resume(turn: AiTurn, ledger: WorkspaceLedger, row: AttendanceRecord, source?: ScanSource) {
    const previous = turn.result;
    if (!previous) return;
    const common = { question: turn.question, rows: ledger.rows, useRules: turn.useRules };
    const input: TaskInput = previous.kind === "review"
      ? { ...common, scope: previous.run.scope, fixedScope: true, workflow: true }
      : { ...common, kind: "compare", baselineId: previous.report.base.activity.eventId, targetId: previous.report.comparison.activity.eventId };
    const steps: AnalysisStep[] = [];
    if (source) steps.push({ name: "识别签到截图", detail: `${source} · ${row.eventId} · ${row.channel}。` });
    steps.push({ name: "确认签到并继续分析", detail: `${row.eventId} · ${row.channel} · 实到 ${row.attended} 人。` });
    void execute(input, ledger.revision, { turn, previous: previous.kind === "review" ? previous : undefined, steps });
  }

  function reset() {
    stop();
    setTurns([]);
  }

  return { turns, execute, resume, stop, reset };
}

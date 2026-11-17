"use client";

import { useEffect, useRef, useState } from "react";
import { makeReport, recordKey, type AttendanceRecord, type Report } from "@/lib/attendance";
import type { ScanSource } from "@/lib/attendance-scan";
import { requestAnalysis } from "@/lib/analysis-client";
import { runLocalAnalysis, type AnalysisResponse, type AnalysisRun, type AnalysisStep, type TaskInput } from "@/lib/analysis-run";
import { greetingReply, type ChatInput, type ChatRun, type ConversationMessage } from "@/lib/conversation";
import { comparisonActions, comparisonReport, type ComparisonAction, type ComparisonRun } from "@/lib/comparison-run";
import type { ActivityComparisonReport } from "@/lib/ledger-activities";
import { deleteConversation, readConversations, writeConversation, type WorkspaceLedger } from "@/lib/workspace-store";
import type { AgentDocument } from "@/lib/agent-documents";
import { ledgerProposalSchema } from "@/lib/ledger-proposal";

type ReviewResult = { kind: "review"; run: AnalysisRun; report: Report; pending: AttendanceRecord | undefined };
type CompareResult = { kind: "compare"; mode: ComparisonRun["mode"]; report: ActivityComparisonReport; action: ComparisonAction; note?: string };
type TurnResult = ReviewResult | CompareResult | ChatRun;

export type AiTurn = {
  id: string;
  startedAt?: number;
  updatedAt?: number;
  request: { kind: "review"; scope: AnalysisRun["scope"]; fixedScope?: boolean } | { kind: "compare"; baselineId: string; targetId: string } | Pick<ChatInput, "kind" | "eventId" | "pair" | "allowWeb">;
  question: string;
  useRules: boolean;
  revision: number;
  status: "running" | "completed" | "stopped";
  steps: AnalysisStep[];
  text?: string;
  documents?: AgentDocument[];
  questionAnswers?: string[];
  result?: TurnResult;
  before?: ReviewResult;
  warning?: string;
};

export type AiConversation = { id: string; updatedAt: number; turns: AiTurn[] };
const selectedKey = "campus-review:conversation";

export function conversationTitle(thread: AiConversation) {
  return thread.turns[0]?.question.replace(/\s+/g, " ") || "新对话";
}

function resultFor(input: TaskInput, response?: AnalysisResponse): TurnResult {
  if (response && "kind" in response && response.kind === "chat") return {
    ...response, proposal: response.proposal ? ledgerProposalSchema.parse(response.proposal) : undefined,
  };
  if (!response && input.kind === "chat") return { kind: "chat", mode: "local",
    text: greetingReply(input.question) ?? "当前无法连接模型，请稍后重试。" };
  if ((response && "kind" in response && response.kind === "compare") || (!response && input.kind === "compare")) {
    const pair = response && "kind" in response && response.kind === "compare" ? response : input.kind === "compare" ? input : null;
    if (!pair) throw new Error("缺少对比活动。");
    const report = comparisonReport({ ...input, ...pair, kind: "compare" });
    const actions = comparisonActions(report, input.question);
    if (response && !("kind" in response)) throw new Error("模型未返回活动对比。");
    const action = response ? actions.find(({ id }) => id === response.actionId) : actions[0];
    if (!action) throw new Error("模型提出的动作缺少台账依据。");
    return { kind: "compare", mode: response?.mode ?? "local", report, action, note: response?.note };
  }

  if (response && "kind" in response) throw new Error("模型未返回复盘结果。");
  const run = response ?? (input.kind !== "chat" && input.kind !== "compare" ? runLocalAnalysis(input) : null);
  if (!run) throw new Error("未返回复盘结果。");
  const report = makeReport(input.rows, run.scope, run.criteria);
  const missing = report.rows.filter(({ attended }) => attended === null).sort((a, b) => b.registered - a.registered);
  const followUp = run.followUp;
  const selected = followUp?.action === "fill_checkin" ? missing.find((row) => recordKey(row) === followUp.key) : undefined;
  return { kind: "review", run, report, pending: selected ?? missing[0] };
}

function localStep(result: ReviewResult | CompareResult): AnalysisStep {
  return result.kind === "review"
    ? { name: "本地统计", detail: `${result.report.totals.rowCount} 条签到记录，${result.report.totals.missing} 条待补录。` }
    : { name: "本地对比", detail: `${result.report.channels.filter(({ delta }) => delta !== null).length} 个渠道可比较。` };
}

function saveStep(steps: AnalysisStep[], step: AnalysisStep) {
  const id = step.tool?.id;
  const index = id ? steps.findIndex(({ tool }) => tool?.id === id) : -1;
  if (index < 0) return [...steps, step];
  return steps.map((old, i) => i === index ? step : old);
}

function settleSteps(steps: AnalysisStep[], status: "stopped" | "failed") {
  return steps.map((step) => step.tool?.status === "running" ? {
    ...step, detail: status === "stopped" ? "已停止" : "执行中断", tool: { ...step.tool, status },
  } : step);
}

function toSavedThread(thread: AiConversation): AiConversation {
  return { ...thread, turns: thread.turns.map((turn) => turn.status === "running"
    ? { ...turn, status: "stopped", steps: settleSteps(turn.steps, "stopped") } : turn) };
}

function messageId() {
  return crypto.randomUUID?.() ?? Array.from(crypto.getRandomValues(new Uint32Array(4)), (part) => part.toString(16)).join("-");
}

function makeThread(): AiConversation {
  return { id: messageId(), updatedAt: Date.now(), turns: [] };
}

function promptContext(turns: AiTurn[], revision: number) {
  const history: ConversationMessage[] = [];
  let size = 0;
  for (const turn of [...turns].reverse()) {
    const result = turn.result;
    if (turn.status !== "completed" || !result) continue;
    const content = result.kind === "chat" ? [result.text.slice(0, 6000),
      result.pendingQuestions?.map((question, index) => `${index + 1}. ${question}`).join("\n"),
      result.proposal ? `台账变更状态：${result.proposal.status === "applied" ? "用户已确认，已实际保存" : result.proposal.status === "cancelled" ? "已取消，没有保存" : "等待确认，尚未保存"}。${result.proposal.title}。\n` +
        result.proposal.changes.slice(0, 5).map(({ after }) => `${after.eventId} ${after.eventName}，${after.date}，${after.category}，${after.channel}，报名 ${after.registered}，实到 ${after.attended ?? "未知"}`).join("\n") : "",
      result.sources?.slice(0, 5).map(({ title, url }) => `${title.slice(0, 100)} ${url.slice(0, 500)}`).join("\n"),
    ].filter(Boolean).join("\n") : JSON.stringify({
      ledger: turn.revision === revision ? "本轮台账版本" : "历史台账版本，数值不可作为当前数据",
      ...(result.kind === "review" ? {
        scope: result.run.scope, totals: result.report.totals,
        groups: result.report.groups.slice(0, 25).map(({ label, registered, attended, rate, coverage, status }) =>
          ({ label, registered, attended, rate, coverage, status })), note: result.run.note,
        pending: result.pending ? `${result.pending.eventId} · ${result.pending.channel}` : null,
      } : {
        baselineId: result.report.base.activity.eventId, targetId: result.report.comparison.activity.eventId,
        rateDelta: result.report.rateDelta,
        channels: result.report.channels.slice(0, 25).map(({ label, before, after, delta }) =>
          ({ label, before: before?.rate, after: after?.rate, delta })), action: result.action, note: result.note,
      }),
    });
    const attached = turn.documents?.map((doc) => `附件 ${doc.name}（${doc.pageCount} 页，历史节选）：\n${doc.text.slice(0, Math.floor(6000 / (turn.documents?.length || 1)))}`).join("\n\n");
    const question = [turn.question, attached].filter(Boolean).join("\n\n");
    if (history.length >= 60 || size + content.length + question.length > 24000) break;
    history.unshift({ role: "user", content: question }, { role: "assistant", content });
    size += content.length + question.length;
  }
  return history;
}

export function useAiConversation(modelConfigured: boolean) {
  const [threads, setThreads] = useState<AiConversation[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [storageWarning, setStorageWarning] = useState(false);
  const active = useRef(new Map<string, { id: string; controller: AbortController }>());
  const saved = useRef(new Map<string, AiConversation>());
  const writes = useRef(Promise.resolve());
  const currentThreads = useRef(threads);
  currentThreads.current = threads;
  const removing = useRef(new Set<string>());
  const currentThread = threads.find(({ id }) => id === selectedId);

  useEffect(() => {
    let disposed = false;
    const running = active.current;
    function open(restored: AiConversation[]) {
      if (disposed) return;
      const restoredThreads = restored.map(toSavedThread).sort((a, b) => b.updatedAt - a.updatedAt);
      for (const thread of restoredThreads) saved.current.set(thread.id, thread);
      let preferred: string | null = null;
      try { preferred = sessionStorage.getItem(selectedKey); } catch { /* The most recent thread is available. */ }
      const next = restoredThreads.find(({ id }) => id === preferred) ?? restoredThreads[0] ?? makeThread();
      setThreads(restoredThreads.length ? restoredThreads : [next]);
      setSelectedId(next.id);
      setLoaded(true);
    }
    void readConversations<AiConversation>().then(open).catch(() => {
      if (!disposed) setStorageWarning(true);
      open([]);
    });
    return () => {
      disposed = true;
      for (const { controller } of running.values()) controller.abort();
      running.clear();
    };
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    try { sessionStorage.setItem(selectedKey, selectedId); } catch { /* The conversation stays open. */ }
  }, [selectedId]);

  useEffect(() => {
    if (!loaded) return;
    for (const thread of threads) {
      const previous = saved.current.get(thread.id);
      const latest = thread.turns.at(-1);
      if (previous === thread || removing.current.has(thread.id) || (latest?.status === "running" && previous?.turns.at(-1)?.id === latest.id)) continue;
      saved.current.set(thread.id, thread);
      writes.current = writes.current.then(() => writeConversation(toSavedThread(thread))).catch(() => setStorageWarning(true));
    }
  }, [loaded, threads]);

  function update(threadId: string, id: string, change: (turn: AiTurn) => AiTurn) {
    const updatedAt = Date.now();
    setThreads((current) => current.map((thread) => thread.id === threadId ? {
      ...thread, updatedAt, turns: thread.turns.map((turn) => turn.id === id ? { ...change(turn), updatedAt } : turn),
    } : thread));
  }

  function stop(threadId = selectedId) {
    const request = active.current.get(threadId);
    if (!request) return;
    active.current.delete(threadId);
    request.controller.abort();
    update(threadId, request.id, (turn) => ({ ...turn, status: "stopped", steps: settleSteps(turn.steps, "stopped") }));
  }

  function stopAll() {
    for (const threadId of active.current.keys()) stop(threadId);
  }

  async function execute(input: TaskInput, revision: number, continued?: { turn: AiTurn; steps: AnalysisStep[]; previous?: ReviewResult }) {
    if (!currentThread || active.current.has(currentThread.id)) return;
    const { id: threadId } = currentThread;
    const id = continued?.turn.id ?? messageId();
    const request = { id, controller: new AbortController() };
    active.current.set(threadId, request);
    if (continued) {
      update(threadId, id, (turn) => ({
        ...turn,
        status: "running",
        warning: undefined,
        before: turn.before ?? continued.previous,
        steps: [...turn.steps, ...continued.steps],
      }));
    } else {
      const parameters: AiTurn["request"] = input.kind === "compare"
        ? { kind: "compare", baselineId: input.baselineId, targetId: input.targetId }
        : input.kind === "chat" ? { kind: "chat", eventId: input.eventId, pair: input.pair, allowWeb: input.allowWeb }
        : { kind: "review", scope: input.scope, fixedScope: input.fixedScope };
      const startedAt = Date.now();
      const turn: AiTurn = { id, startedAt, updatedAt: startedAt, question: input.question, request: parameters, useRules: input.useRules, revision,
        documents: input.kind === "chat" ? input.documents : undefined, status: "running", steps: [] };
      setThreads((current) => current.map((thread) => thread.id === threadId ? { ...thread, updatedAt: startedAt, turns: [...thread.turns, turn] } : thread));
    }

    const isCurrent = () => active.current.get(threadId) === request;
    function finish(result: TurnResult, warning?: string) {
      if (!isCurrent()) return;
      const local = (result.kind === "review" ? result.run.mode : result.mode) === "local";
      update(threadId, id, (turn) => ({
        ...turn, result, revision, warning, status: "completed",
        steps: local && result.kind !== "chat" ? [...settleSteps(turn.steps, "failed"), localStep(result)] : settleSteps(turn.steps, "failed"),
      }));
    }

    try {
      const history = promptContext(currentThread.turns, revision);
      const response = modelConfigured ? await requestAnalysis({ ...input, history }, request.controller.signal, (step) => {
        if (isCurrent()) update(threadId, id, (turn) => ({ ...turn, steps: saveStep(turn.steps, step) }));
      }, (delta) => {
        if (isCurrent()) update(threadId, id, (turn) => ({ ...turn, text: (turn.text ?? "") + delta }));
      }) : undefined;
      if (isCurrent()) finish(resultFor(input, response));
    } catch (error) {
      if (!isCurrent()) return;
      try {
        const warning = error instanceof Error ? error.message : "模型暂时不可用。";
        finish(resultFor(input), input.kind === "chat" ? warning : `${warning} 已使用本地统计。`);
      } catch (fallbackError) {
        const warning = fallbackError instanceof Error ? fallbackError.message : "无法完成分析。";
        update(threadId, id, (turn) => ({ ...turn, status: "completed", warning, steps: settleSteps(turn.steps, "failed") }));
      }
    } finally {
      if (isCurrent()) active.current.delete(threadId);
    }
  }

  function resume(turn: AiTurn, ledger: WorkspaceLedger, row: AttendanceRecord, source?: ScanSource) {
    const previous = turn.result;
    if (!previous || previous.kind === "chat") return;
    const common = { question: turn.question, rows: ledger.rows, useRules: turn.useRules };
    const input: TaskInput = previous.kind === "review"
      ? { ...common, scope: previous.run.scope, fixedScope: true, workflow: true }
      : { ...common, kind: "compare", baselineId: previous.report.base.activity.eventId, targetId: previous.report.comparison.activity.eventId };
    const steps: AnalysisStep[] = [];
    if (source) steps.push({ name: "识别签到截图", detail: `${source} · ${row.eventId} · ${row.channel}。` });
    steps.push({ name: "确认签到并继续分析", detail: `${row.eventId} · ${row.channel} · 实到 ${row.attended} 人。` });
    void execute(input, ledger.revision, { turn, previous: previous.kind === "review" ? previous : undefined, steps });
  }

  function create() {
    if (!loaded) return;
    const draft = threads.find((thread) => !thread.turns.length);
    const thread = draft ?? makeThread();
    if (!draft) setThreads((current) => [thread, ...current]);
    setSelectedId(thread.id);
  }

  function resolveProposal(turn: AiTurn, status: "applied" | "cancelled", revision = turn.revision) {
    update(selectedId, turn.id, (current) => current.result?.kind === "chat" && current.result.proposal ? {
      ...current, revision, result: { ...current.result, proposal: { ...current.result.proposal, status } },
    } : current);
  }

  function resolveQuestions(turn: AiTurn, answers: string[]) {
    update(selectedId, turn.id, (current) => current.result?.kind === "chat" && current.result.pendingQuestions ? {
      ...current, questionAnswers: answers,
    } : current);
  }

  async function remove(id: string) {
    if (removing.current.has(id) || !currentThreads.current.some((thread) => thread.id === id)) return false;
    removing.current.add(id);
    stop(id);
    try {
      await deleteConversation(id);
      saved.current.delete(id);
      const remaining = currentThreads.current.filter((thread) => thread.id !== id).sort((a, b) => b.updatedAt - a.updatedAt);
      const next = remaining[0] ?? makeThread();
      setThreads((current) => {
        const kept = current.filter((thread) => thread.id !== id);
        return kept.length ? kept : [next];
      });
      setSelectedId((current) => current === id ? next.id : current);
      return true;
    } catch {
      return false;
    } finally {
      removing.current.delete(id);
    }
  }

  return {
    threads: [...threads].sort((a, b) => b.updatedAt - a.updatedAt), selectedId, turns: currentThread?.turns ?? [],
    select: setSelectedId, create, remove, loaded, storageWarning, execute, resume, resolveProposal, resolveQuestions, stop, stopAll,
  };
}

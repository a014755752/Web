"use client";

import Image from "next/image";
import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { ArrowDown, ArrowRight, ArrowUp, ChartNoAxesCombined, Check, ChevronRight, Copy, FileText, GitCompareArrows, LoaderCircle, PanelLeft, PanelRight, Paperclip, RotateCcw, ScanLine, Square, X } from "lucide-react";
import { groupLabels, numberLabel, percent, scopeLabel, type AttendanceRecord, type Report, type ReportGroup } from "@/lib/attendance";
import type { AnalysisRun } from "@/lib/analysis-run";
import type { ActivityPair } from "@/lib/conversation";
import { formatPointChange, type LedgerActivity } from "@/lib/ledger-activities";
import { clubRules } from "@/lib/rules";
import { ToolCalls, ToolInspectorList } from "./agent-tools";
import { type AiConversation, type AiTurn } from "./use-ai-conversation";
import { ConversationSidebar } from "./conversation-history";
import "./ai-workspace.css";

export type AiQuestion =
  | { kind: "chat"; question: string; eventId?: string; pair?: ActivityPair }
  | { kind: "review"; question: string; eventId?: string }
  | { kind: "compare"; question: string; baselineId: string; targetId: string };

type AiActions = {
  openActivity: (id: string) => void;
  openEvidence: (group: ReportGroup, report: Report, ruleId: string | null) => void;
  openReport: (run: AnalysisRun) => void;
  openRule: (id: string) => void;
  scan: (turn: AiTurn, row: AttendanceRecord, file?: File) => void;
  retry: (turn: AiTurn) => void;
};

const reviewQuestion = "核对签到缺口，判断哪个宣传渠道值得优先复盘。";
const compareQuestion = "比较两场活动的渠道表现，为下一场选一条可执行的改进动作。";

function previousActivity(activities: LedgerActivity[], activity?: LedgerActivity) {
  return activity && activities.find(({ category, date }) => date < activity.date && category === activity.category);
}

function ActivitySelect({ label, value, activities, exclude, all, disabled, change }: {
  label: string;
  value: string;
  activities: LedgerActivity[];
  exclude?: string;
  all?: boolean;
  disabled: boolean;
  change: (id: string) => void;
}) {
  return (
    <label className="field ai-activity-select">
      {label}
      <select value={value} disabled={disabled} onChange={(event) => change(event.target.value)}>
        {all && <option value="">全部活动</option>}
        {!value && !all && <option value="">选择活动</option>}
        {activities.map(({ eventId, eventName }) => <option key={eventId} value={eventId} disabled={exclude === eventId}>{eventId} · {eventName}</option>)}
      </select>
    </label>
  );
}

export function AiWorkspace({ turns, threads, selected, select, create, remove, activities, ledgerTitle, modelLabel, notice, storageWarning,
  revision, ready, useRules, setUseRules, ask, stop, actions }: {
  turns: AiTurn[];
  threads: AiConversation[];
  selected: string;
  select: (id: string) => void;
  create: () => void;
  remove: (id: string) => Promise<boolean>;
  activities: LedgerActivity[];
  ledgerTitle: string;
  modelLabel?: string;
  notice?: React.ReactNode;
  storageWarning: boolean;
  revision: number;
  ready: boolean;
  useRules: boolean;
  setUseRules: (value: boolean) => void;
  ask: (value: AiQuestion) => void;
  stop: () => void;
  actions: AiActions;
}) {
  const taskTurn = turns.findLast((turn) => turn.result && turn.result.kind !== "chat");
  const lastResult = taskTurn?.result;
  const [kind, setKind] = useState<"review" | "compare">(() => lastResult?.kind === "compare" ? "compare" : "review");
  const [draft, setDraft] = useState("");
  const [reviewId, setReviewId] = useState<string | null>(null);
  const [baselineId, setBaselineId] = useState(() => lastResult?.kind === "compare" ? lastResult.report.base.activity.eventId : "");
  const [targetId, setTargetId] = useState(() => lastResult?.kind === "compare" ? lastResult.report.comparison.activity.eventId : "");
  const [formError, setFormError] = useState("");
  const [inspector, setInspector] = useState(false);
  const [sessionsOpen, setSessionsOpen] = useState(false);
  const [awayFromEnd, setAwayFromEnd] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  const latest = turns.at(-1);
  const running = turns.find((turn) => turn.status === "running");
  const working = !!running;
  const inspectedTurn = running ?? latest;
  const reviewContext = lastResult?.kind === "review" ? lastResult.run.scope.eventId : undefined;
  const context = reviewContext ?? (lastResult?.kind === "compare" ? lastResult.report.comparison.activity.eventId : undefined);
  const reviewedActivity = activities.find(({ eventId }) => eventId === reviewContext);
  const previousReviewed = previousActivity(activities, reviewedActivity);
  const ids = new Set(activities.map(({ eventId }) => eventId));
  const activityId = reviewId === "" || (reviewId && ids.has(reviewId)) ? reviewId
    : context && ids.has(context) ? context : activities[0]?.eventId ?? "";
  const currentTarget = activities.find(({ eventId }) => eventId === (targetId || activityId)) ?? activities[0];
  const defaultBase = previousActivity(activities, currentTarget) ?? activities.find(({ eventId }) => eventId !== currentTarget?.eventId);
  const currentBaseline = activities.find(({ eventId }) => eventId === baselineId && eventId !== currentTarget?.eventId) ?? defaultBase;
  const pending = lastResult?.kind === "review" ? lastResult.pending : lastResult?.kind === "compare" ? lastResult.action.record : undefined;
  const attachmentTask = pending && taskTurn?.status === "completed" && taskTurn.revision === revision ? taskTurn : undefined;
  const latestMissing = activities.find(({ rows }) => rows.some(({ attended }) => attended === null));
  const missingCount = activities.reduce((sum, { rows }) => sum + rows.filter(({ attended }) => attended === null).length, 0);

  useEffect(() => {
    setSessionsOpen(window.matchMedia("(min-width: 1100px)").matches);
    setInspector(window.matchMedia("(min-width: 1600px)").matches);
  }, []);

  useLayoutEffect(() => {
    if (pinned.current && scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight;
  }, [turns]);

  function jumpToEnd() {
    pinned.current = true;
    if (scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight;
    setAwayFromEnd(false);
  }

  function compare(question: string, before: LedgerActivity, after: LedgerActivity) {
    setKind("compare");
    setBaselineId(before.eventId);
    setTargetId(after.eventId);
    jumpToEnd();
    ask({ kind: "compare", question, baselineId: before.eventId, targetId: after.eventId });
  }

  function startReview(question: string, id?: string) {
    setKind("review");
    setReviewId(id ?? "");
    jumpToEnd();
    ask({ kind: "review", question, eventId: id });
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (working || !ready) return;
    const query = draft.trim();
    if (query) {
      jumpToEnd();
      ask({ kind: "chat", question: query, eventId: activityId || undefined,
        pair: kind === "compare" && currentBaseline && currentTarget ? { baselineId: currentBaseline.eventId, targetId: currentTarget.eventId } : undefined });
    } else if (kind === "compare") {
      if (!currentTarget || !currentBaseline) {
        setFormError("请选择两场不同的活动后发起对比。");
        return;
      }
      compare(compareQuestion, currentBaseline, currentTarget);
    } else {
      startReview(reviewQuestion, activityId || undefined);
    }
    setFormError("");
    setDraft("");
  }

  function attach(file?: File) {
    if (file && pending && attachmentTask) actions.scan(attachmentTask, pending, file);
  }

  return (
    <div className="agent-workspace">
      <header className="agent-header">
        <div className="ai-page-title">
          <button type="button" className="icon-button" aria-label={sessionsOpen ? "收起会话列表" : "打开会话列表"} aria-expanded={sessionsOpen}
            aria-controls="conversation-sidebar" onClick={() => {
              setSessionsOpen(!sessionsOpen);
              if (!sessionsOpen && window.matchMedia("(max-width: 1099px)").matches) setInspector(false);
            }}><PanelLeft size={18} /></button>
          <Image className="composer-icon" src="/images/review-pencil.webp" width={32} height={32} alt="" unoptimized /><h1>AI 对话</h1>
        </div>
        <div className="agent-header-actions">
          <button type="button" className="button secondary small-button" aria-expanded={inspector} aria-controls="agent-inspector"
            onClick={() => {
              setInspector(!inspector);
              if (!inspector && window.matchMedia("(max-width: 1099px)").matches) setSessionsOpen(false);
            }}><PanelRight size={16} />工具面板</button>
        </div>
      </header>
      <div className="agent-body">
        {sessionsOpen && <>
          <button type="button" className="conversation-sidebar-backdrop" aria-label="关闭会话列表" onClick={() => setSessionsOpen(false)} />
          <ConversationSidebar threads={threads} selected={selected} remove={remove} ready={ready} close={() => setSessionsOpen(false)}
            select={(id) => {
              if (window.matchMedia("(max-width: 1099px)").matches) setSessionsOpen(false);
              select(id);
            }} create={() => {
              create();
              if (window.matchMedia("(max-width: 1099px)").matches) setSessionsOpen(false);
              requestAnimationFrame(() => document.getElementById("ai-question")?.focus());
            }} />
        </>}
        <div className="agent-main">
          <div ref={scroller} className="agent-scroll" aria-label="对话记录" onScroll={(event) => {
            const node = event.currentTarget;
            pinned.current = node.scrollHeight - node.clientHeight - node.scrollTop < 95;
            setAwayFromEnd(!pinned.current);
          }}>
            <div className="agent-thread">
              {notice}
              {storageWarning && <p className="form-error" role="status">对话暂时无法保存到浏览器。</p>}
              {!turns.length && <section className="agent-start" aria-labelledby="agent-start-title">
                <h2 id="agent-start-title">今天想聊什么？</h2>
                <div className="agent-suggestions">
                  <button type="button" disabled={!ready} onClick={() => startReview(reviewQuestion, (latestMissing ?? currentTarget)?.eventId)}>
                    <ScanLine size={20} /><strong>查找签到缺口</strong><span>{latestMissing?.eventName ?? '核对报名和签到记录'}</span><ChevronRight size={16} /></button>
                  {currentBaseline && currentTarget && <button type="button" disabled={!ready} onClick={() => compare(compareQuestion, currentBaseline, currentTarget)}>
                    <GitCompareArrows size={20} /><strong>对比两场活动</strong><span>{currentBaseline.eventId} → {currentTarget.eventId}</span><ChevronRight size={16} /></button>}
                  <button type="button" disabled={!ready} onClick={() => startReview("按活动类型汇总全学期的报名、到场和签到覆盖率。") }>
                    <ChartNoAxesCombined size={20} /><strong>汇总各活动类型</strong><span>全学期活动</span><ChevronRight size={16} /></button>
                </div>
              </section>}
              {turns.map((turn) => <TurnCard key={turn.id} turn={turn} stale={turn.revision !== revision} actions={actions} current={latest?.id === turn.id}
                modelLabel={modelLabel} canRetry={!working && ready}
                comparePrevious={latest?.id === turn.id && reviewedActivity && previousReviewed ? () => compare(compareQuestion, previousReviewed, reviewedActivity) : undefined} />)}
            </div>
          </div>

          <div className="agent-dock">
            {awayFromEnd && <button type="button" className="button secondary small-button agent-jump" onClick={jumpToEnd}><ArrowDown size={15} />回到最新消息</button>}
            <form className="ai-composer" aria-label="向 AI 提问" onSubmit={submit}>
            <div className="ai-composer-head">
              <div className="segmented" role="group" aria-label="分析任务">
                <button type="button" aria-pressed={kind === "review"} disabled={working} onClick={() => { setKind("review"); setFormError(""); }}>活动复盘</button>
                <button type="button" aria-pressed={kind === "compare"} disabled={working} onClick={() => { setKind("compare"); setFormError(""); }}>两场对比</button>
              </div>
              <div className="ai-selection">
                {kind === "review" ? <ActivitySelect label="复盘范围" value={activityId} activities={activities} all disabled={!!working} change={setReviewId} /> : <>
                  <ActivitySelect label="基准活动" value={currentBaseline?.eventId ?? ""} exclude={currentTarget?.eventId} activities={activities} disabled={!!working} change={setBaselineId} />
                  <ActivitySelect label="对照活动" value={currentTarget?.eventId ?? ""} exclude={currentBaseline?.eventId} activities={activities} disabled={!!working} change={setTargetId} />
                </>}
              </div>
              <label className="rules-toggle"><input type="checkbox" checked={useRules} disabled={working} onChange={(event) => setUseRules(event.target.checked)} />应用社团规则</label>
            </div>
            <label className="sr-only" htmlFor="ai-question">复盘问题</label>
            <textarea id="ai-question" rows={2} maxLength={300} value={draft} enterKeyHint="send"
              placeholder="聊聊活动、追问结论，或让我查一下台账…"
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing && event.keyCode !== 229 && draft.trim()) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
              onPaste={(event) => {
                if (!attachmentTask || !pending) return;
                const image = [...event.clipboardData.files].find((file) => ["image/png", "image/jpeg"].includes(file.type));
                if (image) { event.preventDefault(); attach(image); }
              }}
              onChange={(event) => { setDraft(event.target.value); setFormError(""); }} />
            <div className="ai-composer-actions">
              {attachmentTask && <label className="button secondary small-button file-button">
                <Paperclip size={16} />上传签到截图
                <input type="file" accept="image/png,image/jpeg" onChange={(event) => { attach(event.target.files?.[0]); event.target.value = ""; }} />
              </label>}
              <span className="agent-key-hint">Enter 发送 · Shift+Enter 换行</span>
              {working ? <button type="button" className="button secondary" onClick={stop}><Square size={14} />停止</button> :
                <button type="submit" className="button primary" disabled={!ready}><ArrowUp size={16} />{draft.trim() ? "发送" : kind === "review" ? "开始 AI 复盘" : "开始 AI 对比"}</button>}
            </div>
            {formError && <p className="form-error" role="alert">{formError}</p>}
            </form>
          </div>
        </div>

        {inspector && <aside id="agent-inspector" className="agent-inspector" aria-labelledby="agent-inspector-title" onKeyDown={(event) => {
          if (event.key === "Escape") setInspector(false);
        }}>
          <header><h2 id="agent-inspector-title">工具面板</h2><button className="icon-button" type="button" aria-label="关闭工具面板" onClick={() => setInspector(false)}><X size={17} /></button></header>
          <section className="agent-inspector-scope">
            <h3>台账上下文</h3><strong>{ledgerTitle}</strong>
            <p>{activities.length} 场活动 · {missingCount} 条签到待补录</p>
            {currentTarget && <button type="button" className="link-button" onClick={() => actions.openActivity(currentTarget.eventId)}>{currentTarget.eventName}<ChevronRight size={14} /></button>}
          </section>
          {inspectedTurn && <ToolInspectorList turn={inspectedTurn} inspect={(id) => {
            const item = document.getElementById(id);
            if (!(item instanceof HTMLDetailsElement)) return;
            item.open = true;
            if (window.matchMedia("(max-width: 1020px)").matches) setInspector(false);
            requestAnimationFrame(() => item.scrollIntoView({ block: "nearest" }));
          }} />}
          {!latest && latestMissing && <section className="agent-inspector-scope">
            <h3>待核对签到</h3>
            {activities.filter(({ rows }) => rows.some(({ attended }) => attended === null)).slice(0, 4).map((activity) => <button key={activity.eventId}
              className="agent-inspector-link" type="button" disabled={!ready} onClick={() => startReview(reviewQuestion, activity.eventId)}>
              <ScanLine size={15} /><span>{activity.eventName}</span><ChevronRight size={14} />
            </button>)}
          </section>}
        </aside>}
      </div>
    </div>
  );
}

function RuleSources({ turn, open }: { turn: AiTurn; open: AiActions["openRule"] }) {
  const result = turn.result;
  const ids = result?.kind === "review" ? result.run.sources
    : result?.kind === "compare" ? [result.report.base.rule?.id, result.report.comparison.rule?.id] : [];
  const rules = [...new Set(ids)].flatMap((id) => clubRules.filter((rule) => rule.id === id));
  if (!rules.length) return null;
  return (
    <section className="ai-sources">
      <h3>引用规则</h3>
      {rules.map((rule) => <details key={rule.id}>
        <summary><FileText size={14} />{rule.title} · {rule.version}</summary>
        <p>{rule.text}</p>
        <button type="button" className="link-button" onClick={() => open(rule.id)}>查看规则<ChevronRight size={13} /></button>
      </details>)}
    </section>
  );
}

function TurnCard({ turn, stale, actions, current = false, comparePrevious, modelLabel, canRetry }: {
  turn: AiTurn;
  stale: boolean;
  actions: AiActions;
  current?: boolean;
  comparePrevious?: () => void;
  modelLabel?: string;
  canRetry: boolean;
}) {
  const { result, status } = turn;
  const [copyStatus, setCopyStatus] = useState("");
  const canAct = current && !stale && status === "completed";
  const mode = result?.kind === "review" ? result.run.mode : result?.mode;
  const title = result?.kind === "review"
    ? result.report.rows.find(({ eventId }) => eventId === result.run.scope.eventId)?.eventName ?? scopeLabel(result.run.scope)
    : result?.kind === "compare" ? "两场活动对比" : "";
  const note = result?.kind === "review" ? result.run.note : result?.kind === "compare" ? result.note : undefined;

  async function copyAnswer() {
    if (!result) return;
    const body = result.kind === "chat" ? result.text : result.kind === "review"
      ? `报名 ${result.report.totals.registered} 人 · 已记录到场 ${result.report.totals.attended} 人 · 覆盖 ${percent(result.report.totals.coverage)}`
      : `${result.report.base.activity.eventName} → ${result.report.comparison.activity.eventName}\n到场率变化 ${formatPointChange(result.report.rateDelta)}\n${result.action.title}\n${result.action.detail}`;
    try {
      await navigator.clipboard.writeText([title, body, note].filter(Boolean).join("\n"));
      setCopyStatus("已复制");
    } catch {
      setCopyStatus("无法复制");
    }
  }

  return (
    <section className="ai-turn" aria-label="对话结果">
      <div className="agent-user-message"><span>你</span><p className="ai-question">{turn.question}</p></div>
      <div className="agent-reply-head">
        <span className="agent-reply-mark"><ChartNoAxesCombined size={16} /></span><strong>复盘助手</strong>
        {modelLabel && (mode === "agent" || (!mode && status === "running")) && <span>{modelLabel}</span>}
      </div>
      <ToolCalls turn={turn} />
      {status === "stopped" && <p className="muted" role="status">分析已停止。</p>}
      {turn.warning && <p className="form-error" role="status">{turn.warning}</p>}
      {stale && result && result.kind !== "chat" && status !== "running" && <p className="muted">这条结论来自更新前的台账。发送同一问题可按最新数据重算。</p>}
      {status === "running" && !turn.text && <p className="agent-running muted" role="status"><LoaderCircle className="spinning" size={15} />{turn.before ? "正在继续复盘" : "正在处理"}…</p>}
      {(result?.kind === "chat" || turn.text) && <div className="agent-chat-text">{result?.kind === "chat" ? result.text : turn.text}</div>}
      {note && status !== "running" && <p className="agent-reply-copy">{note}</p>}
      {result && result.kind !== "chat" && <div className="card ai-answer">
        <div className="ai-answer-heading">
          <h2>{title}</h2>
          <span className={`pill ${mode === "agent" ? "success" : "neutral"}`}>{mode === "agent" ? "AI 分析" : "本地统计"}</span>
        </div>
        {result.kind === "review" ? <ReviewAnswer turn={turn} result={result} active={status === "running"} canAct={canAct} stale={stale} actions={actions} /> :
          <ComparisonAnswer turn={turn} result={result} canAct={canAct} stale={stale} actions={actions} />}
        {canAct && result.kind === "review" && !result.pending && comparePrevious && <button type="button" className="button secondary small-button"
          onClick={comparePrevious}><GitCompareArrows size={15} />与上一场同类型活动对比</button>}
      </div>}
      <RuleSources turn={turn} open={actions.openRule} />
      {status !== "running" && <div className="agent-message-actions">
        {result && <button type="button" className="link-button" onClick={() => void copyAnswer()}><Copy size={15} />复制结果</button>}
        {canRetry && <button type="button" className="link-button" onClick={() => actions.retry(turn)}><RotateCcw size={15} />重新运行</button>}
        {copyStatus && <span role="status">{copyStatus}</span>}
      </div>}
    </section>
  );
}

type ReviewResult = Extract<NonNullable<AiTurn["result"]>, { kind: "review" }>;
type CompareResult = Extract<NonNullable<AiTurn["result"]>, { kind: "compare" }>;

function ReviewAnswer({ turn, result, active, canAct, stale, actions }: {
  turn: AiTurn; result: ReviewResult; active: boolean; canAct: boolean; stale: boolean; actions: AiActions;
}) {
  const { report, pending, run } = result;
  const eventId = run.scope.eventId;
  const priority = report.priorities[0];
  const before = turn.before?.report;
  const priorities = (value: Report) => value.priorities.map(({ label }) => label).join("、") || "可比较组不足";
  const followUp = run.followUp;
  const excluded = !pending && !priority ? report.groups.filter(({ status }) => status !== "ready").slice(0, 4) : [];
  return (
    <>
      <div className="ai-metrics">
        <div><span>报名</span><strong>{numberLabel(report.totals.registered)} 人</strong></div>
        <div><span>已记录到场</span><strong>{numberLabel(report.totals.attended)} 人</strong></div>
        <div><span>签到覆盖率</span><strong>{percent(report.totals.coverage)}</strong></div>
      </div>
      {pending && <div className="ai-finding ai-finding-warning">
        <div>
          <div className="agent-approval-label"><ScanLine size={15} /><code>confirm_attendance</code><span>{active ? "运行中" : "等待确认"}</span></div>
          <h3>{active ? "正在复核补录结果" : "需要核对签到"}</h3>
          <p>{pending.eventId} · {pending.eventName} · {pending.channel}，报名 {numberLabel(pending.registered)} 人。{report.totals.missing > 1 && ` 当前共 ${report.totals.missing} 条待补录。`}</p>
          {priority && !active && <p>当前可比较渠道优先核查{priorities(report)}。</p>}
        </div>
        {canAct && <button type="button" className="button primary small-button" onClick={() => actions.scan(turn, pending)}><ScanLine size={15} />补录{pending.channel}签到</button>}
      </div>}
      {!pending && <div className="ai-finding">
        <div>
          <h3>{priority ? `优先复盘${priorities(report)}` : "可比较分组不足"}</h3>
          <p>{priority ? <>到场率 {percent(priority.rate)}，{numberLabel(priority.attended)} 到场 / {numberLabel(priority.tracked)} 有效报名。{followUp?.action === "verify_signup" ? "建议核对报名归属和签到记录。" : "建议复核该组的宣传安排和报名记录。"}</>
            : `需要至少两组达到 ${report.criteria.minSamples} 人有效样本和 ${percent(report.criteria.minCoverage)} 签到覆盖率。`}</p>
          {excluded.length > 0 && <ul>{excluded.map((group) => <li key={group.label}>{group.label} · {numberLabel(group.tracked)} 人有效报名 · {groupLabels[group.status]}</li>)}</ul>}
        </div>
        {!stale && priority && <button type="button" className="button secondary small-button" onClick={() => actions.openEvidence(priority, report, run.ruleId)}>查看数据依据<ChevronRight size={15} /></button>}
      </div>}
      {before && !active && <section className="ai-before-after" aria-label="补录前后">
        <h3>补录前后</h3>
        <div><span>签到覆盖率</span><span>{percent(before.totals.coverage)} <ArrowRight size={14} /> <strong>{percent(report.totals.coverage)}</strong></span></div>
        <div><span>优先复盘</span><span>{priorities(before)} <ArrowRight size={14} /> <strong>{priorities(report)}</strong></span></div>
      </section>}
      <div className="ai-answer-links">
        {eventId && <button type="button" className="link-button" onClick={() => actions.openActivity(eventId)}>查看活动台账<ChevronRight size={14} /></button>}
        {canAct && <button type="button" className="link-button" onClick={() => actions.openReport(run)}><ChartNoAxesCombined size={15} />查看复盘图表</button>}
      </div>
    </>
  );
}

function ComparisonAnswer({ turn, result, canAct, stale, actions }: { turn: AiTurn; result: CompareResult; canAct: boolean; stale: boolean; actions: AiActions }) {
  const { report, action } = result;
  const { base, comparison, channels } = report;
  const finding = channels.find(({ label }) => label === action.channel);
  const evidence = finding?.after;
  const record = action.record;
  return (
    <>
      <div className="ai-pair">
        {[base, comparison].map(({ activity, report }, index) => <div key={activity.eventId}>
          <span>{index === 0 ? "基准" : "对照"} · {activity.category} · {activity.date}</span>
          <button type="button" className="link-button" onClick={() => actions.openActivity(activity.eventId)}>{activity.eventName}<ChevronRight size={14} /></button>
          <p>报名 {numberLabel(report.totals.registered)} 人 · 已记录到场 {numberLabel(report.totals.attended)} 人 · 覆盖 {percent(report.totals.coverage)}</p>
        </div>)}
      </div>
      <div className="table-scroll"><table className="data-table ai-difference">
        <thead><tr><th scope="col">到场率</th><th scope="col">基准</th><th scope="col">对照</th><th scope="col">变化</th></tr></thead>
        <tbody>
          <tr><th scope="row">整场</th><td>{percent(base.report.totals.rate)}</td><td>{percent(comparison.report.totals.rate)}</td><td>{formatPointChange(report.rateDelta)}</td></tr>
          {channels.map(({ label, before, after, delta }) => <tr key={label} className={finding?.label === label ? "priority-row" : undefined}>
            <th scope="row">{label}</th>
            {[before, after].map((group, index) => <td key={index}>{percent(group?.rate ?? null)}{group && group.status !== "ready" && <small>{groupLabels[group.status]}</small>}</td>)}
            <td>{formatPointChange(delta)}</td>
          </tr>)}
        </tbody>
      </table></div>
      {report.rateDelta === null && <p className="muted">两场都达到样本及签到覆盖门槛后，显示整场到场率差值。</p>}
      <div className="ai-finding">
        <div><span className="ai-action-label">下一场改进动作</span><h3>{action.title}</h3><p>{action.detail}</p>
          {finding?.before && finding.after && <p>依据 · {finding.label} {percent(finding.before.rate)} → {percent(finding.after.rate)}，{formatPointChange(finding.delta)}。</p>}
        </div>
        {canAct && record && <button type="button" className="button secondary small-button" onClick={() => actions.scan(turn, record)}><ScanLine size={15} />核对签到</button>}
        {!stale && evidence && <button type="button" className="button secondary small-button" onClick={() => actions.openEvidence(evidence, comparison.report, comparison.rule?.id ?? null)}>查看渠道依据<ChevronRight size={14} /></button>}
      </div>
    </>
  );
}

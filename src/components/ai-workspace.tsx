"use client";

import Image from "next/image";
import { useState, type FormEvent } from "react";
import { ArrowRight, ArrowUp, ChartNoAxesCombined, Check, ChevronRight, FileText, GitCompareArrows, LoaderCircle, Plus, ScanLine, Square } from "lucide-react";
import { groupLabels, numberLabel, percent, scopeLabel, type AttendanceRecord, type Report, type ReportGroup } from "@/lib/attendance";
import type { AnalysisRun } from "@/lib/analysis-run";
import { formatPointChange, type LedgerActivity } from "@/lib/ledger-activities";
import { clubRules } from "@/lib/rules";
import type { AiTurn } from "./use-ai-conversation";
import "./ai-workspace.css";

export type AiQuestion =
  | { kind: "review"; question: string; eventId?: string }
  | { kind: "compare"; question: string; baselineId: string; targetId: string };

type AiActions = {
  openActivity: (id: string) => void;
  openEvidence: (group: ReportGroup, report: Report, ruleId: string | null) => void;
  openReport: (run: AnalysisRun) => void;
  openRule: (id: string) => void;
  scan: (turn: AiTurn, row: AttendanceRecord) => void;
};

const reviewQuestion = "核对签到缺口，判断哪个宣传渠道值得优先复盘。";
const compareQuestion = "比较两场活动的渠道表现，为下一场选一条可执行的改进动作。";

function previousActivity(activities: LedgerActivity[], activity?: LedgerActivity) {
  return activity && activities.find(({ category, date }) => date < activity.date && category === activity.category);
}

function mentionedActivities(question: string, activities: LedgerActivity[]) {
  const tokens = Array.from(question.matchAll(/[a-z0-9_-]+/gi));
  return activities.flatMap((activity) => {
    const byName = question.indexOf(activity.eventName);
    const byId = tokens.find((token) => token[0].toUpperCase() === activity.eventId.toUpperCase())?.index ?? -1;
    const position = byName < 0 ? byId : byId < 0 ? byName : Math.min(byName, byId);
    return position < 0 ? [] : [{ activity, position }];
  }).sort((a, b) => a.position - b.position).map(({ activity }) => activity);
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

export function AiWorkspace({ turns, activities, revision, ready, useRules, setUseRules, ask, stop, reset, actions }: {
  turns: AiTurn[];
  activities: LedgerActivity[];
  revision: number;
  ready: boolean;
  useRules: boolean;
  setUseRules: (value: boolean) => void;
  ask: (value: AiQuestion) => void;
  stop: () => void;
  reset: () => void;
  actions: AiActions;
}) {
  const lastResult = turns.at(-1)?.result;
  const [kind, setKind] = useState<AiQuestion["kind"]>(() => lastResult?.kind ?? "review");
  const [draft, setDraft] = useState("");
  const [reviewId, setReviewId] = useState<string | null>(null);
  const [baselineId, setBaselineId] = useState(() => lastResult?.kind === "compare" ? lastResult.report.base.activity.eventId : "");
  const [targetId, setTargetId] = useState(() => lastResult?.kind === "compare" ? lastResult.report.comparison.activity.eventId : "");
  const [formError, setFormError] = useState("");
  const latest = turns.at(-1);
  const working = latest?.status === "running";
  const reviewContext = latest?.result?.kind === "review" ? latest.result.run.scope.eventId : undefined;
  const context = reviewContext ?? (latest?.result?.kind === "compare" ? latest.result.report.comparison.activity.eventId : undefined);
  const reviewedActivity = activities.find(({ eventId }) => eventId === reviewContext);
  const previousReviewed = previousActivity(activities, reviewedActivity);
  const ids = new Set(activities.map(({ eventId }) => eventId));
  const activityId = reviewId === "" || (reviewId && ids.has(reviewId)) ? reviewId
    : context && ids.has(context) ? context : activities[0]?.eventId ?? "";
  const currentTarget = activities.find(({ eventId }) => eventId === (targetId || activityId)) ?? activities[0];
  const defaultBase = previousActivity(activities, currentTarget) ?? activities.find(({ eventId }) => eventId !== currentTarget?.eventId);
  const currentBaseline = activities.find(({ eventId }) => eventId === baselineId && eventId !== currentTarget?.eventId) ?? defaultBase;

  function compare(question: string, before: LedgerActivity, after: LedgerActivity) {
    setKind("compare");
    setBaselineId(before.eventId);
    setTargetId(after.eventId);
    ask({ kind: "compare", question, baselineId: before.eventId, targetId: after.eventId });
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (working || !ready) return;
    const query = draft.trim();
    const mentioned = mentionedActivities(query, activities);
    const previous = /上一次|上一场|上次|上场/u.test(query) && /比|差异|变化/u.test(query);
    const naturalCompare = /对比|比较|相比|差异|变化/u.test(query) && mentioned.length >= 2;
    if (kind === "compare" || naturalCompare || previous) {
      const after = mentioned[1] ?? (previous ? mentioned[0] : undefined) ?? currentTarget;
      const before = previous && mentioned.length < 2 ? previousActivity(activities, after) : mentioned[0] ?? currentBaseline;
      if (!after || !before || before.eventId === after.eventId) {
        setFormError(previous ? "没有找到更早的同类型活动，可以选择两场活动对比。" : "请选择两场不同的活动后发起对比。");
        return;
      }
      compare(query || compareQuestion, before, after);
    } else {
      const eventId = /所有活动|全部活动|全学期/u.test(query) ? undefined : mentioned[0]?.eventId ?? (activityId || undefined);
      setReviewId(eventId ?? "");
      ask({ kind: "review", question: query || reviewQuestion, eventId });
    }
    setFormError("");
    setDraft("");
  }

  function newConversation() {
    reset();
    setKind("review");
    setDraft("");
    setReviewId(null);
    setBaselineId("");
    setTargetId("");
    setFormError("");
  }

  return (
    <>
      <header className="page-heading">
        <div className="ai-page-title"><Image className="composer-icon" src="/images/review-pencil.webp" width={36} height={36} alt="" unoptimized /><h1>AI 对话</h1></div>
        {turns.length > 0 && <button type="button" className="button secondary" onClick={newConversation}><Plus size={16} />新对话</button>}
      </header>
      <div className="ai-layout">
        <div className="ai-main">
          <form className="card ai-composer" aria-label="向 AI 提问" onSubmit={submit}>
            <div className="ai-composer-head">
              <div className="segmented" role="group" aria-label="分析任务">
                <button type="button" aria-pressed={kind === "review"} disabled={working} onClick={() => { setKind("review"); setFormError(""); }}>活动复盘</button>
                <button type="button" aria-pressed={kind === "compare"} disabled={working} onClick={() => { setKind("compare"); setFormError(""); }}>两场对比</button>
              </div>
              <label className="rules-toggle"><input type="checkbox" checked={useRules} disabled={working} onChange={(event) => setUseRules(event.target.checked)} />应用社团规则</label>
            </div>
            <div className="ai-selection">
              {kind === "review" ? <ActivitySelect label="复盘范围" value={activityId} activities={activities} all disabled={!!working} change={setReviewId} /> : <>
                <ActivitySelect label="基准活动" value={currentBaseline?.eventId ?? ""} exclude={currentTarget?.eventId} activities={activities} disabled={!!working} change={setBaselineId} />
                <ActivitySelect label="对照活动" value={currentTarget?.eventId ?? ""} exclude={currentBaseline?.eventId} activities={activities} disabled={!!working} change={setTargetId} />
              </>}
            </div>
            <label className="sr-only" htmlFor="ai-question">复盘问题</label>
            <textarea id="ai-question" rows={2} maxLength={300} value={draft} disabled={working} enterKeyHint="send"
              placeholder={kind === "review" ? "例如，查一下这场活动的签到缺口，判断哪个渠道值得优先复盘。" : "例如，重点比较公众号，为下一场活动安排一条改进动作。"}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing && event.keyCode !== 229 && draft.trim()) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
              onChange={(event) => { setDraft(event.target.value); setFormError(""); }} />
            <div className="ai-composer-actions">
              {working ? <button type="button" className="button secondary" onClick={stop}><Square size={14} />停止分析</button> :
                <button type="submit" className="button primary" disabled={!ready}><ArrowUp size={16} />{draft.trim() ? "发送" : kind === "review" ? "开始 AI 复盘" : "开始 AI 对比"}</button>}
            </div>
            {formError && <p className="form-error" role="alert">{formError}</p>}
          </form>

          {latest && <TurnCard turn={latest} stale={latest.revision !== revision} actions={actions} current
            comparePrevious={reviewedActivity && previousReviewed ? () => compare(compareQuestion, previousReviewed, reviewedActivity) : undefined} />}

          {turns.length > 1 && <details className="card ai-history">
            <summary>本次对话记录 <span>{turns.length - 1} 条</span></summary>
            {turns.slice(0, -1).reverse().map((turn) => <TurnCard key={turn.id} turn={turn} stale={turn.revision !== revision} actions={actions} />)}
          </details>}
        </div>

        {latest && <aside className="card ai-trace" aria-labelledby="ai-trace-heading">
          <h2 id="ai-trace-heading">任务过程</h2>
          {latest.steps.length > 0 && <ol>{latest.steps.map((step, index) => <li key={index}>
            <span className="ai-step-icon"><Check size={13} aria-hidden="true" /></span>
            <div><strong>{step.name}</strong><p>{step.detail}</p></div>
          </li>)}</ol>}
          {working && <p className="running-state" role="status"><LoaderCircle size={16} className="spinning" />{latest.before ? "正在重算复盘结论" : "正在查询台账和分析口径"}</p>}
          <RuleSources turn={latest} open={actions.openRule} />
        </aside>}
      </div>
    </>
  );
}

function RuleSources({ turn, open }: { turn: AiTurn; open: AiActions["openRule"] }) {
  const result = turn.result;
  const ids = result?.kind === "review" ? result.run.sources
    : result ? [result.report.base.rule?.id, result.report.comparison.rule?.id] : [];
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

function TurnCard({ turn, stale, actions, current = false, comparePrevious }: {
  turn: AiTurn;
  stale: boolean;
  actions: AiActions;
  current?: boolean;
  comparePrevious?: () => void;
}) {
  const { result, status } = turn;
  const canAct = current && !stale && status === "completed";
  const mode = result?.kind === "review" ? result.run.mode : result?.mode;
  const title = result?.kind === "review"
    ? result.report.rows.find(({ eventId }) => eventId === result.run.scope.eventId)?.eventName ?? scopeLabel(result.run.scope)
    : "两场活动对比";
  return (
    <section className="ai-turn" aria-label="对话结果">
      <p className="ai-question">{turn.question}</p>
      {status === "stopped" && <p className="muted" role="status">分析已停止。</p>}
      {turn.warning && <p className="form-error" role="status">{turn.warning}</p>}
      {stale && result && status !== "running" && <p className="muted">这条结论来自更新前的台账。发送同一问题可按最新数据重算。</p>}
      {!result && status === "running" && <p className="card ai-answer muted" role="status"><LoaderCircle className="spinning" size={15} />{turn.steps.at(-1)?.name ?? "正在执行分析"}…</p>}
      {result && <div className="card ai-answer">
        <div className="ai-answer-heading">
          <h2>{title}</h2>
          <span className={`pill ${mode === "agent" ? "success" : "neutral"}`}>{mode === "agent" ? "AI 分析" : "本地统计"}</span>
        </div>
        {result.kind === "review" ? <ReviewAnswer turn={turn} result={result} active={status === "running"} canAct={canAct} stale={stale} actions={actions} /> :
          <ComparisonAnswer turn={turn} result={result} canAct={canAct} stale={stale} actions={actions} />}
        {canAct && result.kind === "review" && !result.pending && comparePrevious && <button type="button" className="button secondary small-button"
          onClick={comparePrevious}><GitCompareArrows size={15} />与上一场同类型活动对比</button>}
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

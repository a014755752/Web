"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import { useState, type FormEvent } from "react";
import {
  ArrowDownLeft, ArrowRight, Check, ChevronRight, CircleAlert, FileText, GitCompareArrows, LoaderCircle, ScanLine,
} from "lucide-react";
import { numberLabel, percent, groupLabels, recordKey, scopeLabel, type AnalysisScope, type AttendanceRecord, type Report, type ReportGroup } from "@/lib/attendance";
import { promptExamples, type AnalysisRun, type AnalysisStep } from "@/lib/analysis-run";
import type { ClubRule } from "@/lib/rules";
import { ChartPlaceholder } from "./chart-placeholder";

const AttendanceChart = dynamic(() => import("./attendance-chart"), {
  ssr: false,
  loading: () => <div className="chart-canvas"><ChartPlaceholder label="正在加载报名与到场图表" /></div>,
});

export function AnalysisComposer({ question, setQuestion, analyze, running, useRules, setUseRules, stop, error, steps, run }: {
  question: string;
  setQuestion: (value: string) => void;
  analyze: (question: string) => void;
  running: boolean;
  useRules: boolean;
  setUseRules: (value: boolean) => void;
  stop: () => void;
  error: string;
  steps: AnalysisStep[];
  run: AnalysisRun | null;
}) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (question.trim() && !running) analyze(question.trim());
  }

  return (
    <section className="composer card" aria-labelledby="composer-title">
      <div className="composer-heading">
        <Image className="composer-icon" src="/images/review-pencil.webp" width={36} height={36} alt="" unoptimized />
        <h2 id="composer-title">复盘助手</h2>
        <label className="rules-toggle">
          <input type="checkbox" checked={useRules} onChange={(event) => setUseRules(event.target.checked)} disabled={running} />
          <span>应用社团规则</span>
        </label>
      </div>
      <form className="composer-input" onSubmit={submit}>
        <input
          aria-label="复盘问题" value={question} onChange={(event) => setQuestion(event.target.value)}
          placeholder="想复盘哪些活动或渠道？" maxLength={300} disabled={running}
        />
        {running ? <button type="button" className="button secondary" onClick={stop}>停止</button> :
          <button type="submit" className="button primary analyze-button" disabled={!question.trim()}>
            开始分析<ArrowRight size={17} />
          </button>}
      </form>
      <div className="composer-footer">
        <div className="prompt-options" aria-label="推荐问题">
          {promptExamples.map((item) => <button key={item.label} type="button" className="prompt-chip" onClick={() => analyze(item.question)} disabled={running}>
            {item.label}
          </button>)}
        </div>
        {running && <span className="running-state" role="status"><LoaderCircle size={15} className="spinning" />正在分析</span>}
        {run && !running && <span className="run-complete" role="status"><Check size={15} />{run.mode === "agent" ? "模型分析完成" : "本地统计完成"}</span>}
      </div>
      {error && <p className="form-error composer-error" role="alert">{error}</p>}
      {steps.length > 0 && (
        <details className="run-trace" open={running || undefined}>
          <summary>分析过程 <span>{steps.length} 步</span></summary>
          <ol>{steps.map((step, index) => <li key={index}><strong>{step.name}</strong><span>{step.detail}</span></li>)}</ol>
        </details>
      )}
    </section>
  );
}

export function FilterBar({ scope, rows, change, reset }: {
  scope: AnalysisScope;
  rows: AttendanceRecord[];
  change: (next: AnalysisScope) => void;
  reset: () => void;
}) {
  const categories = [...new Set(rows.map((row) => row.category))];
  const channels = [...new Set(rows.map((row) => row.channel))];

  return (
    <div className="filter-bar" aria-label="统计筛选">
      <label className="compact-field"><span>开始日期</span>
        <input type="date" value={scope.from ?? ""} onChange={(event) => change({ ...scope, from: event.target.value || null })} />
      </label>
      <label className="compact-field"><span>结束日期</span>
        <input type="date" value={scope.to ?? ""} onChange={(event) => change({ ...scope, to: event.target.value || null })} />
      </label>
      <label className="compact-field"><span>活动类型</span>
        <select value={scope.category ?? ""} onChange={(event) => change({ ...scope, category: event.target.value || null })}>
          <option value="">全部活动类型</option>
          {categories.map((item) => <option key={item}>{item}</option>)}
        </select>
      </label>
      <label className="compact-field"><span>宣传渠道</span>
        <select value={scope.channel ?? ""} onChange={(event) => change({ ...scope, channel: event.target.value || null })}>
          <option value="">全部宣传渠道</option>
          {channels.map((item) => <option key={item}>{item}</option>)}
        </select>
      </label>
      <button type="button" className="button plain reset-filters" onClick={reset}>重置</button>
    </div>
  );
}

export function SummaryCards({ report }: { report: Report }) {
  const { totals } = report;
  const tiles = [
    { name: "报名人次", value: numberLabel(totals.registered), unit: "人次", caption: `${totals.events} 场活动` },
    { name: "已记录到场", value: numberLabel(totals.attended), unit: "人次", caption: `${totals.rowCount - totals.missing} / ${totals.rowCount} 条已记录` },
    { name: "到场率", value: percent(totals.rate), caption: `有效报名 ${numberLabel(totals.tracked)} 人次` },
    { name: "签到覆盖率", value: percent(totals.coverage), caption: totals.missing ? `${totals.missing} 条记录待补录` : null },
  ];

  return <div className="card summary-grid">
    {tiles.map(({ name, value, unit, caption }) => (
      <section className="stat-card" key={name} aria-label={name}>
        <h2>{name}</h2>
        <div className="stat-value">{value}{unit && <span>{unit}</span>}</div>
        {caption && <span className="stat-caption">{caption}</span>}
      </section>
    ))}
  </div>;
}

export function Overview({ report, setGrouping, evidence }: {
  report: Report;
  setGrouping: (value: AnalysisScope["groupBy"]) => void;
  evidence: (group: ReportGroup) => void;
}) {
  const [metric, setMetric] = useState<"count" | "rate">("count");
  return (
    <section className="card overview" aria-labelledby="overview-title">
      <div className="card-heading">
        <h2 id="overview-title">报名与到场</h2>
        <div className="segmented" role="group" aria-label="显示指标">
          <button type="button" aria-pressed={metric === "count"} onClick={() => setMetric("count")}>人数</button>
          <button type="button" aria-pressed={metric === "rate"} onClick={() => setMetric("rate")}>到场率</button>
        </div>
      </div>
      {report.groups.length > 0 ? <AttendanceChart groups={report.groups} metric={metric} evidence={evidence} /> :
        <div className="chart-canvas empty-chart">当前范围暂无数据</div>}
      <div className="chart-footer">
        <div className="legend">
          {metric === "count" && <span><i className="legend-swatch light" />报名人数</span>}
          <span><i className="legend-swatch" />{metric === "count" ? "已记录到场" : "到场率"}</span>
        </div>
        <label className="chart-group"><span>分组</span>
          <select aria-label="图表分组" value={report.scope.groupBy} onChange={(event) => setGrouping(event.target.value as AnalysisScope["groupBy"])}>
            <option value="channel">宣传渠道</option><option value="category">活动类型</option>
          </select>
        </label>
      </div>
    </section>
  );
}

export function InsightPanel({ report, rule, run, evidence, edit, openRule }: {
  report: Report;
  rule: ClubRule | null;
  run: AnalysisRun | null;
  evidence: (group: ReportGroup) => void;
  edit: (row: AttendanceRecord) => void;
  openRule: (id: string) => void;
}) {
  const followUp = run?.followUp;
  const suggestedGroup = followUp && followUp.action !== "fill_checkin"
    ? report.priorities.find(({ label }) => label === followUp.label) : undefined;
  const priority = suggestedGroup ?? report.priorities[0];
  const suggestedRecord = followUp?.action === "fill_checkin"
    ? report.rows.find((row) => row.attended === null && recordKey(row) === followUp.key) : undefined;
  const incomplete = report.groups.find((group) => group.status === "incomplete" && (!suggestedRecord || group.rows.includes(suggestedRecord)));
  const mustFill = report.rows.filter((row) => row.attended === null);
  const missing = suggestedRecord ?? incomplete?.rows.find((row) => row.attended === null) ?? mustFill[0];
  const emphasizeMissing = missing && (suggestedRecord || run?.focus === "missing" || !priority);
  const nextStep = suggestedGroup && (followUp?.action === "inspect_promotion"
    ? "对照该组各场活动的宣传安排和报名记录。"
    : "按原始记录核对该组的报名归属和签到。");
  const noResult = !emphasizeMissing && !priority;
  const sources = run?.sources.filter((id) => id !== rule?.id) ?? [];

  return (
    <section className="card insights" aria-labelledby="insights-title">
      <div className="card-heading">
        <h2 id="insights-title">复盘结论</h2>
        <span className={`pill ${emphasizeMissing ? "warning" : noResult ? "neutral" : "success"}`}>
          {emphasizeMissing ? "待补录" : noResult ? "数据不足" : "可比较"}
        </span>
      </div>
      {emphasizeMissing ? (
        <div className="insight-callout caution">
          <CircleAlert size={19} />
          <div>
            <h3>{incomplete ? `${incomplete.label}签到覆盖不足` : "有签到记录待补录"}</h3>
            <p>{incomplete ? `覆盖率 ${percent(incomplete.coverage)}，当前口径要求至少 ${percent(report.criteria.minCoverage)}。` : `当前范围有 ${mustFill.length} 条签到记录待补录。`}</p>
          </div>
        </div>
      ) : priority ? (
        <div className="insight-callout positive">
          <ArrowDownLeft size={20} />
          <div><h3>{report.priorities.length > 1 ? "多个分组并列最低" : `优先复盘 ${priority.label}`}</h3>
            <p>{report.priorities.length > 1
              ? `${report.priorities.map((group) => group.label).join("、")}均为 ${percent(priority.rate)}。`
              : `到场率 ${percent(priority.rate)}，对应 ${priority.attended} 到场 / ${priority.tracked} 有效报名。`}</p>
            {nextStep && <p className="insight-next">{nextStep}</p>}
          </div>
        </div>
      ) : (
        <div className="insight-callout subtle">
          <CircleAlert size={19} /><div><h3>可比较的分组不足</h3><p>当前有 {report.ranked.length} 组达到口径。至少两组才能判断应优先复盘哪一组。</p></div>
        </div>
      )}
      {emphasizeMissing && missing && (
        <div className="source-row">
          <div><strong>{missing.eventName}</strong><span>{missing.eventId} · {missing.channel} · 报名 {missing.registered} 人</span></div>
          <button type="button" className="button secondary small-button" onClick={() => edit(missing)}><ScanLine size={15} />补录签到</button>
        </div>
      )}
      {priority && !emphasizeMissing && <button type="button" className="link-button primary-link" onClick={() => evidence(priority)}>查看计算依据<ChevronRight size={16} /></button>}
      <div className="insight-rules">
        <div className="thresholds"><span>有效样本 <strong>≥ {report.criteria.minSamples} 人</strong></span><span>签到覆盖 <strong>≥ {percent(report.criteria.minCoverage)}</strong></span></div>
        {rule ? <button type="button" className="link-button rule-source" onClick={() => openRule(rule.id)}>
          <FileText size={15} />{rule.title} · {rule.version}<ChevronRight size={14} />
        </button> : <span className="muted rule-source">默认计算参数</span>}
        {sources.length > 0 && <div className="extra-sources">{sources.map((id) => (
          <button key={id} type="button" className="link-button" onClick={() => openRule(id)}><FileText size={13} />{id === "checkin-2026" ? "签到数据补录说明" : id === "channels-2026" ? "宣传渠道归属说明" : "检索来源"}</button>
        ))}</div>}
      </div>
    </section>
  );
}

export function GroupTable({ report, evidence }: { report: Report; evidence: (value: ReportGroup) => void }) {
  return (
    <section className="card group-table" aria-labelledby="group-table-title">
      <div className="card-heading">
        <h2 id="group-table-title">{report.scope.groupBy === "channel" ? "渠道明细" : "活动类型明细"}</h2>
      </div>
      <div className="table-scroll">
        <table className="data-table">
          <thead><tr>
            <th scope="col">{report.scope.groupBy === "channel" ? "宣传渠道" : "活动类型"}</th>
            <th scope="col" className="numeric">报名</th><th scope="col" className="numeric">已到场</th>
            <th scope="col">到场率</th><th scope="col">签到覆盖</th><th scope="col">状态</th><th scope="col">依据</th>
          </tr></thead>
          <tbody>{report.groups.map((group) => (
            <tr key={group.label} className={report.priorities.includes(group) ? "priority-row" : undefined}>
              <th scope="row">{group.label}</th>
              <td className="numeric">{numberLabel(group.registered)}</td>
              <td className="numeric">{group.tracked > 0 ? numberLabel(group.attended) : "—"}</td>
              <td><div className="table-rate"><span>{percent(group.rate)}</span><span className="rate-track" aria-hidden="true"><i style={{ width: percent(group.rate ?? 0) }} /></span></div></td>
              <td>{percent(group.coverage)}</td>
              <td><span className={`pill ${group.status === "ready" ? "success" : group.status === "incomplete" ? "warning" : "neutral"}`}>{groupLabels[group.status]}</span></td>
              <td><button type="button" className="link-button" aria-label={`查看 ${group.label} 依据`} onClick={() => evidence(group)}>查看<ChevronRight size={14} /></button></td>
            </tr>
          ))}</tbody>
        </table>
        {!report.groups.length && <p className="empty-note">调整日期或筛选条件后再查看。</p>}
      </div>
    </section>
  );
}

export function ScenarioPanel({ report, trial, change, evidence }: {
  report: Report;
  trial: Report;
  change: (minimum: number) => void;
  evidence: (group: ReportGroup, trial: boolean) => void;
}) {
  return (
    <details className="card scenario-card">
      <summary className="scenario-summary"><GitCompareArrows size={18} />试算样本门槛<ChevronRight size={16} /></summary>
      <div className="scenarios">
        {[report, trial].map((result, index) => {
          const group = result.priorities[0];
          return (
            <div key={index} className={`scenario ${index ? "scenario-trial" : ""}`}>
              <div className="scenario-heading"><h3>{index ? "手动试算" : "当前口径"}</h3><span>覆盖 ≥ {percent(result.criteria.minCoverage)}</span></div>
              {index ? <label className="scenario-input">有效样本至少
                <input type="number" min={0} max={1_000_000} step={1} value={trial.criteria.minSamples}
                  onChange={(event) => {
                    const value = event.target.valueAsNumber;
                    if (Number.isInteger(value) && value >= 0 && value <= 1_000_000) change(value);
                  }} />人
              </label> : <p className="scenario-threshold">有效样本至少 <strong>{result.criteria.minSamples}</strong> 人</p>}
              <div className="scenario-result">
                <span>{group
                  ? result.priorities.length > 1 ? result.priorities.map((item) => item.label).join("、") : group.label
                  : "可比较组不足"}</span>
                <strong>{group ? percent(group.rate) : "—"}</strong>
              </div>
              <div className="scenario-footer">
                <span>{result.ranked.length} 组可比较</span>
                {group && <button type="button" className="link-button" onClick={() => evidence(group, Boolean(index))}>查看依据<ChevronRight size={13} /></button>}
              </div>
            </div>
          );
        })}
      </div>
    </details>
  );
}

export function PrintSummary({ report, trial, source, rule }: { report: Report; trial: Report; source: string; rule: ClubRule | null }) {
  return (
    <section className="print-report">
      <h1>校园社团活动复盘简报</h1>
      <p>{source} · {scopeLabel(report.scope)}</p>
      <p>报名 {report.totals.registered} 人 · 已记录到场 {report.totals.attended} 人 · 到场率 {percent(report.totals.rate)} · 签到覆盖 {percent(report.totals.coverage)}</p>
      <p>计算口径：{rule?.title ?? "默认参数"} · 有效样本 ≥ {report.criteria.minSamples} 人 · 覆盖率 ≥ {percent(report.criteria.minCoverage)}。</p>
      <p>优先复盘：{report.priorities.map((group) => `${group.label}（${percent(group.rate)}）`).join("、") || "可比较组不足"}。</p>
      {trial !== report && <p>试算（{trial.criteria.minSamples} 人门槛）：{trial.priorities.map((group) => `${group.label}（${percent(group.rate)}）`).join("、") || "可比较组不足"}。</p>}
      <table>
        <thead><tr><th>分组</th><th>总报名</th><th>有效报名</th><th>到场</th><th>到场率</th><th>覆盖率</th><th>状态</th></tr></thead>
        <tbody>{report.groups.map((group) => (
          <tr key={group.label}><th scope="row">{group.label}</th><td>{group.registered}</td><td>{group.tracked}</td>
            <td>{group.attended}</td><td>{percent(group.rate)}</td><td>{percent(group.coverage)}</td><td>{groupLabels[group.status]}</td></tr>
        ))}</tbody>
      </table>
    </section>
  );
}

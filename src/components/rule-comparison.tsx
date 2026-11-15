"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, BookOpen, FlaskConical, LoaderCircle, Play } from "lucide-react";
import { requestAnalysis } from "@/lib/analysis-client";
import { runLocalAnalysis, type AnalysisInput, type AnalysisRun } from "@/lib/analysis-run";
import { defaultScope, groupLabels, makeReport, percent } from "@/lib/attendance";
import { ruleComparisonRecords } from "@/lib/demo-data";
import { clubRules } from "@/lib/rules";

const input = {
  question: "保持当前筛选范围，比较本场招新活动宣传渠道的到场率，指出优先复盘的渠道。",
  rows: ruleComparisonRecords,
  scope: { ...defaultScope(ruleComparisonRecords), category: "招新" },
};

function getResult(run: AnalysisRun) {
  const report = makeReport(input.rows, run.scope, run.criteria);
  if (report.rows.length !== input.rows.length || run.scope.groupBy !== "channel" || run.scope.category !== "招新") {
    throw new Error("对照范围发生变化");
  }
  return { run, report };
}

type Comparison = { baseline: ReturnType<typeof getResult>; retrieved: ReturnType<typeof getResult> };

export function RuleComparison({ modelConfigured }: { modelConfigured: boolean }) {
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [working, setWorking] = useState(false);
  const [notice, setNotice] = useState("");
  const active = useRef<AbortController | null>(null);

  useEffect(() => () => active.current?.abort(), []);

  async function compare() {
    const request = new AbortController();
    active.current = request;
    setWorking(true);
    setNotice("");
    setComparison(null);

    async function complete(useRules: boolean) {
      const payload: AnalysisInput = { ...input, useRules };
      const run = modelConfigured ? await requestAnalysis(payload, request.signal) : runLocalAnalysis(payload);
      return getResult(run);
    }

    try {
      const baseline = await complete(false);
      const retrieved = await complete(true);
      if (!request.signal.aborted) setComparison({ baseline, retrieved });
    } catch {
      if (request.signal.aborted) return;
      setComparison({
        baseline: getResult(runLocalAnalysis({ ...input, useRules: false })),
        retrieved: getResult(runLocalAnalysis({ ...input, useRules: true })),
      });
      setNotice("模型对照未完成，当前结果来自本地计算。");
    } finally {
      if (!request.signal.aborted) {
        setWorking(false);
        active.current = null;
      }
    }
  }

  const changed = comparison &&
    comparison.baseline.report.priorities.map(({ label }) => label).join("、") !==
    comparison.retrieved.report.priorities.map(({ label }) => label).join("、");

  return (
    <section className="card rule-comparison" aria-labelledby="rule-comparison-title">
      <div className="card-heading">
        <div>
          <div className="heading-line"><FlaskConical size={18} /><h2 id="rule-comparison-title">规则检索对照</h2></div>
          <p>同一场招新活动 · 2026-09-06 · 3 个宣传渠道</p>
        </div>
        <button type="button" className="button primary" onClick={() => void compare()} disabled={working}>
          {working ? <LoaderCircle size={16} className="spinning" /> : <Play size={15} />}
          {working ? "对照中…" : "运行对照"}
        </button>
      </div>
      {notice && <p role="status" className="field-note comparison-notice">{notice}</p>}
      {comparison && (
        <div className="comparison-output" aria-live="polite">
          <div className="scenarios">
            <ComparisonCard title="关闭规则检索" result={comparison.baseline} />
            <ComparisonCard title="开启规则检索" result={comparison.retrieved} />
          </div>
          {changed && <p className="comparison-note"><ArrowRight size={15} />相同记录应用不同口径后，优先复盘对象发生变化。</p>}
        </div>
      )}
    </section>
  );
}

function ComparisonCard({ title, result }: { title: string; result: Comparison["baseline"] }) {
  const { run, report } = result;
  const rule = clubRules.find((item) => item.id === run.ruleId);
  const priority = report.priorities[0];
  const poster = report.groups.find((item) => item.label === "海报");
  const method = run.mode === "local" ? "本地计算" : run.retrieval === "vector" ? "向量检索" : run.retrieval === "keyword" ? "关键词检索" : "模型计算";

  return (
    <div className={`scenario ${rule ? "scenario-trial" : ""}`}>
      <div className="scenario-heading"><h3>{title}</h3><span>{method}</span></div>
      <p className="scenario-threshold">有效样本 ≥ <strong>{run.criteria.minSamples}</strong> 人 · 覆盖 ≥ {percent(run.criteria.minCoverage)}</p>
      <div className="scenario-result">
        <span>{priority ? report.priorities.map(({ label }) => label).join("、") : "可比较组不足"}</span>
        <strong>{percent(priority?.rate ?? null)}</strong>
      </div>
      {poster && <p className="comparison-sample">海报 {poster.tracked} 个样本 · {groupLabels[poster.status]}</p>}
      {rule && <a className="link-button" href={`#rule-${rule.id}`}><BookOpen size={14} />{rule.title} · {rule.version}</a>}
    </div>
  );
}

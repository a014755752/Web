"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDownToLine, BookOpen, CalendarDays, ChartNoAxesColumnIncreasing, ChevronRight, Database, FileSpreadsheet, FlaskConical, Layers3, ScanLine, Upload, X } from "lucide-react";
import {
  defaultCriteria, defaultScope, makeReport, recordKey, scopeLabel, scopeSchema,
  type AnalysisScope, type AttendanceRecord, type ReportGroup,
} from "@/lib/attendance";
import { runLocalAnalysis, type AnalysisInput, type AnalysisRun, type AnalysisStep } from "@/lib/analysis-run";
import { requestAnalysis } from "@/lib/analysis-client";
import { demoRecords, semesterRecords } from "@/lib/demo-data";
import { applicableRule, clubRules } from "@/lib/rules";
import { AttendanceDialog } from "./attendance-dialog";
import { CsvDialog, downloadCsv, EvidenceDialog, RecordsTable, RulesWorkspace, type Attachment, type Attachments } from "./data-panels";
import { Modal } from "./modal";
import { AnalysisComposer, FilterBar, GroupTable, InsightPanel, Overview, PrintSummary, ScenarioPanel, SummaryCards } from "./review-panels";

const views = [
  { id: "review", label: "复盘工作台", icon: ChartNoAxesColumnIncreasing },
  { id: "data", label: "数据管理", icon: Database },
  { id: "rules", label: "规则库", icon: BookOpen },
] as const;

type View = typeof views[number]["id"];
type Dialog = { type: "sample" | "csv" } |
  { type: "scan"; initial: AttendanceRecord | null } |
  { type: "evidence"; group: ReportGroup; trial: boolean };

type Dataset = { title: string; kind: "demo" | "semester" | "imported"; rows: AttendanceRecord[] };
const initialData: Dataset = { title: "答辩样例", kind: "demo", rows: demoRecords };

export function ReviewApp({ modelConfigured, visionConfigured = modelConfigured }: { modelConfigured: boolean; visionConfigured?: boolean }) {
  const [dataset, setDataset] = useState(initialData);
  const [attachments, setAttachments] = useState<Attachments>({});
  const [view, setView] = useState<View>("review");
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [scope, setScope] = useState(() => defaultScope(demoRecords));
  const [trialMinimum, setTrialMinimum] = useState(20);
  const [useRules, setUseRules] = useState(true);
  const [question, setQuestion] = useState("");
  const [steps, setSteps] = useState<AnalysisStep[]>([]);
  const [run, setRun] = useState<AnalysisRun | null>(null);
  const [running, setRunning] = useState(false);
  const [analysisError, setAnalysisError] = useState("");
  const [notice, setNotice] = useState("");
  const [ruleAnchor, setRuleAnchor] = useState<string | null>(null);
  const active = useRef<AbortController | null>(null);

  useEffect(() => () => active.current?.abort(), []);
  useEffect(() => {
    if (ruleAnchor && view === "rules") {
      document.getElementById(`rule-${ruleAnchor}`)?.scrollIntoView({ block: "center" });
    }
  }, [ruleAnchor, view]);

  const rule = !useRules ? null : run
    ? clubRules.find((entry) => entry.id === run.ruleId) ?? null
    : applicableRule(scope);
  const criteria = run?.criteria ?? rule?.criteria ?? defaultCriteria;
  const report = useMemo(() => makeReport(dataset.rows, scope, criteria), [dataset.rows, scope, criteria]);
  const trial = useMemo(() => makeReport(dataset.rows, scope, {
    ...criteria, minSamples: trialMinimum,
  }), [dataset.rows, scope, criteria, trialMinimum]);
  const scopeValid = scopeSchema.safeParse(scope).success;
  const isSample = dataset.kind !== "imported";
  const currentView = views.find((item) => item.id === view);
  const sourceLabel = isSample ? `模拟数据 · ${dataset.title}` : dataset.title;

  function stopAnalysis() {
    active.current?.abort();
    active.current = null;
    setRunning(false);
  }

  function clearAnalysis() {
    stopAnalysis();
    setRun(null);
    setSteps([]);
    setAnalysisError("");
  }

  function changeScope(next: AnalysisScope) {
    clearAnalysis();
    setScope(next);
  }

  function selectView(next: View) {
    setRuleAnchor(null);
    setView(next);
    window.scrollTo(0, 0);
  }

  function openRule(id: string) {
    setDialog(null);
    setView("rules");
    setRuleAnchor(id);
  }

  function replaceDataset(next: Dataset) {
    clearAnalysis();
    setDataset(next);
    setAttachments({});
    setScope(defaultScope(next.rows));
    setTrialMinimum(20);
    setQuestion("");
    setDialog(null);
    setNotice(`已载入 ${next.rows.length} 条活动记录。`);
    selectView("review");
  }

  function showScan(row: AttendanceRecord | null) {
    setDialog({ type: "scan", initial: row });
  }

  function saveAttendance(key: string, attended: number, photo?: Attachment) {
    stopAnalysis();
    setAnalysisError("");
    setDataset((current) => ({
      ...current,
      rows: current.rows.map((row) => recordKey(row) === key ? { ...row, attended } : row),
    }));
    setAttachments((current) => {
      const next = { ...current };
      if (photo) next[key] = photo;
      else delete next[key];
      return next;
    });
    if (run) setSteps((current) => [...current, { name: "更新签到并重算", detail: `经用户确认，目标记录的到场人数为 ${attended}。` }]);
    setDialog(null);
    setNotice("已保存签到记录，统计已重新计算。");
  }

  function applyRun(result: AnalysisRun) {
    setScope(result.scope);
    setRun(result);
    setTrialMinimum(result.criteria.minSamples);
    setView("review");
  }

  function applyLocal(input: AnalysisInput) {
    const result = runLocalAnalysis(input);
    const calculation = makeReport(input.rows, result.scope, result.criteria);
    setSteps((previous) => [...previous, {
      name: "汇总当前数据",
      detail: `共 ${calculation.totals.rowCount} 条记录、${calculation.groups.length} 组，${calculation.totals.missing} 条签到待补录。`,
    }]);
    applyRun(result);
  }

  async function analyze(query: string) {
    stopAnalysis();
    setQuestion(query);
    setSteps([]);
    setAnalysisError("");
    if (!scopeValid) {
      setAnalysisError("请先核对日期范围。");
      return;
    }
    const input = { question: query, rows: dataset.rows, scope, useRules };
    if (!modelConfigured) {
      applyLocal(input);
      return;
    }

    const request = new AbortController();
    active.current = request;
    setRunning(true);
    try {
      const result = await requestAnalysis(input, request.signal, (step) => {
        if (active.current === request) setSteps((current) => [...current, step]);
      });
      if (active.current === request) applyRun(result);
    } catch (cause) {
      if (active.current !== request) return;
      const reason = cause instanceof Error ? cause.message : "模型暂时不可用。";
      setAnalysisError(`${reason} 已使用本地统计。`);
      applyLocal(input);
    } finally {
      if (active.current === request) {
        active.current = null;
        setRunning(false);
      }
    }
  }

  const openEvidence = (group: ReportGroup, simulation = false) => setDialog({ type: "evidence", group, trial: simulation });

  return (
    <>
      <div className="app-shell">
        <aside className="sidebar">
          <button type="button" className="brand" onClick={() => selectView("review")}>
            <span className="brand-mark" aria-hidden="true"><ChartNoAxesColumnIncreasing size={22} strokeWidth={2.3} /></span>
            <span className="brand-name"><strong>社团复盘</strong><small>校园活动分析</small></span>
          </button>
          <nav className="sidebar-nav" aria-label="工作区">
            {views.map(({ id, label, icon: Icon }) => <button type="button" key={id} aria-current={view === id ? "page" : undefined}
              className={`nav-link ${view === id ? "nav-active" : ""}`} onClick={() => selectView(id)}>
              <Icon size={19} strokeWidth={1.8} /><span>{label}</span>
              {view === id && <ChevronRight className="nav-arrow" size={16} />}
            </button>)}
          </nav>
          <div className="sidebar-bottom">
            <div className="dataset-card">
              <span className="dataset-icon">{isSample ? <FlaskConical size={18} /> : <Database size={18} />}</span>
              <div><span>{isSample ? "模拟数据" : "导入数据"}</span><strong title={dataset.title}>{dataset.title}</strong></div>
            </div>
            <div className="model-state"><i className={modelConfigured ? "ready-dot" : undefined} />{modelConfigured ? "模型已配置" : "本地统计模式"}</div>
          </div>
        </aside>

        <main className="main-shell">
          <header className="topbar">
            <div className="breadcrumb"><Layers3 size={16} /><span>校园社团</span><ChevronRight size={13} /><strong>{currentView?.label}</strong></div>
            <div className="top-actions">
              <button type="button" className="button secondary" onClick={() => setDialog({ type: "sample" })}><FlaskConical size={16} /><span>载入样例</span></button>
              <button type="button" className="button primary" onClick={() => setDialog({ type: "csv" })}><Upload size={16} /><span>导入 CSV</span></button>
            </div>
          </header>

          <div className="workspace">
            {view === "review" && (
              <>
                <div className="page-heading">
                  <div>
                    <h1>活动复盘工作台</h1>
                    <div className="page-meta"><CalendarDays size={16} /><span>{scopeLabel(scope)}</span><i />{isSample ? "模拟数据" : "导入数据"}</div>
                  </div>
                  <button type="button" className="button secondary report-button" onClick={() => window.print()} disabled={!scopeValid}>
                    <ArrowDownToLine size={16} />导出简报
                  </button>
                </div>
                {notice && <div className="notice" role="status"><span>{notice}</span><button type="button" className="icon-button" aria-label="关闭提示" onClick={() => setNotice("")}><X size={14} /></button></div>}
                <AnalysisComposer question={question} setQuestion={setQuestion} analyze={(query) => void analyze(query)}
                  running={running} modelConfigured={modelConfigured} useRules={useRules} setUseRules={(value) => {
                    clearAnalysis(); setUseRules(value);
                  }} stop={stopAnalysis} error={analysisError} steps={steps} run={run} />
                <FilterBar scope={scope} rows={dataset.rows} change={changeScope} reset={() => changeScope(defaultScope(dataset.rows))} />
                {!scopeValid && <p className="form-error" role="alert">起始日期须早于或等于结束日期。</p>}
                <SummaryCards report={report} />
                <div className="analysis-grid">
                  <Overview report={report} setGrouping={(groupBy) => changeScope({ ...scope, groupBy })} />
                  <InsightPanel report={report} rule={rule} run={run} evidence={openEvidence} edit={showScan} openRule={openRule} />
                </div>
                <GroupTable report={report} evidence={openEvidence} />
                <ScenarioPanel report={report} trial={trial} change={setTrialMinimum} evidence={openEvidence} />
              </>
            )}

            {view === "data" && (
              <>
                <div className="page-heading">
                  <div><h1>数据管理</h1><div className="page-meta"><FileSpreadsheet size={16} />{sourceLabel} · {dataset.rows.length} 条记录</div></div>
                  <div className="top-actions">
                    <button type="button" className="button secondary" onClick={() => downloadCsv(dataset.rows, "活动复盘数据.csv")}><ArrowDownToLine size={16} />下载数据</button>
                    <button type="button" className="button primary" onClick={() => showScan(null)}><ScanLine size={16} />补录截图</button>
                  </div>
                </div>
                {notice && <div className="notice" role="status"><span>{notice}</span><button type="button" className="icon-button" aria-label="关闭提示" onClick={() => setNotice("")}><X size={14} /></button></div>}
                <div className="card records-card"><RecordsTable rows={dataset.rows} attachments={attachments} edit={showScan} /></div>
              </>
            )}

            {view === "rules" && (
              <>
                <div className="page-heading"><div><h1>规则库</h1><div className="page-meta"><BookOpen size={16} />模拟社团内部资料 · {clubRules.length} 份</div></div></div>
                <RulesWorkspace />
              </>
            )}
          </div>
        </main>
      </div>

      <PrintSummary report={report} trial={trial} source={sourceLabel} rule={rule} />

      {dialog?.type === "csv" && <CsvDialog close={() => setDialog(null)} replace={(rows, title) => replaceDataset({ title, kind: "imported", rows })} />}
      {dialog?.type === "sample" && (
        <Modal title="载入模拟数据" close={() => setDialog(null)}>
          <div className="modal-body sample-options">
            <button type="button" className="sample-option" onClick={() => replaceDataset(initialData)}>
              <span className="tile-icon green"><FlaskConical size={20} /></span>
              <span><strong>答辩样例</strong><small>3 场活动 · 4 条记录 · 含缺失的签到记录</small></span><ChevronRight size={18} />
            </button>
            <button type="button" className="sample-option" onClick={() => replaceDataset({ title: "秋季活动样例", kind: "semester", rows: semesterRecords() })}>
              <span className="tile-icon blue"><Database size={20} /></span>
              <span><strong>秋季活动样例</strong><small>25 场活动 · 75 条记录 · 支持多维筛选</small></span><ChevronRight size={18} />
            </button>
            <p className="muted">载入样例会替换当前数据。</p>
          </div>
        </Modal>
      )}
      {dialog?.type === "scan" && <AttendanceDialog rows={dataset.rows} initial={dialog.initial}
        canScan={visionConfigured} showSample={dataset.kind === "demo"} close={() => setDialog(null)} save={saveAttendance} />}
      {dialog?.type === "evidence" && <EvidenceDialog group={dialog.group} rule={rule}
        criteria={dialog.trial ? trial.criteria : report.criteria} trial={dialog.trial}
        attachments={attachments} close={() => setDialog(null)} openRule={openRule} />}
    </>
  );
}

"use client";

import Image from "next/image";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { ArrowDownToLine, BookOpen, CalendarDays, ChartNoAxesCombined, FolderOpen, NotebookPen, Plus, ScanLine, Upload, X } from "lucide-react";
import clubMark from "@/app/icon.png";
import {
  defaultCriteria, defaultScope, makeReport, recordKey, scopeLabel, scopeSchema,
  type AnalysisScope, type AttendanceRecord, type ReportGroup,
} from "@/lib/attendance";
import { runLocalAnalysis, type AnalysisInput, type AnalysisRun, type AnalysisStep } from "@/lib/analysis-run";
import { requestAnalysis } from "@/lib/analysis-client";
import { initialRecords } from "@/lib/activity-ledger";
import { activityScope, appendLedgerRows, listActivities, validateLedgerRows, type ActivityFields, type LedgerActivity } from "@/lib/ledger-activities";
import { applicableRule, clubRules } from "@/lib/rules";
import { readLedger, writeLedger, type Attachment, type WorkspaceLedger } from "@/lib/workspace-store";
import { AttendanceDialog } from "./attendance-dialog";
import { ActivityComparison, ActivityDetail, ActivityEditor, type ActivityEditorMode } from "./activity-panels";
import { CsvDialog, downloadCsv, EvidenceDialog, RecordsWorkspace, RulesWorkspace, type CsvImportMode } from "./data-panels";
import { AnalysisComposer, FilterBar, GroupTable, InsightPanel, Overview, PrintSummary, ScenarioPanel, SummaryCards } from "./review-panels";
import VisualDashboard, { preloadVisualCharts } from "./visual-dashboard";

const views = [
  { id: "review", label: "活动复盘", icon: NotebookPen },
  { id: "visual", label: "可视化大屏", icon: ChartNoAxesCombined },
  { id: "data", label: "活动台账", icon: FolderOpen },
  { id: "rules", label: "规则库", icon: BookOpen },
] as const;

type View = typeof views[number]["id"];
type Dialog = { type: "csv" } |
  { type: "scan"; initial: AttendanceRecord | null; eventId?: string } |
  { type: "evidence"; group: ReportGroup; trial: boolean } |
  { type: "activity"; eventId: string } |
  { type: "activity-editor"; mode: ActivityEditorMode; eventId?: string } |
  { type: "compare"; eventId?: string };

const initialData: WorkspaceLedger = { revision: 0, title: "2026 秋季活动台账", rows: initialRecords, attachments: {} };

export function ReviewApp({ modelConfigured, visionConfigured = modelConfigured }: { modelConfigured: boolean; visionConfigured?: boolean }) {
  const [dataset, setDataset] = useState(initialData);
  const [storage, setStorage] = useState<"opening" | "ready" | "temporary">("opening");
  const [view, setView] = useState<View>("review");
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [scope, setScope] = useState(() => defaultScope(initialRecords));
  const [trialMinimum, setTrialMinimum] = useState<number | null>(null);
  const [useRules, setUseRules] = useState(true);
  const [question, setQuestion] = useState("");
  const [steps, setSteps] = useState<AnalysisStep[]>([]);
  const [run, setRun] = useState<AnalysisRun | null>(null);
  const [running, setRunning] = useState(false);
  const [analysisError, setAnalysisError] = useState("");
  const [notice, setNotice] = useState("");
  const [ruleAnchor, setRuleAnchor] = useState<string | null>(null);
  const active = useRef<AbortController | null>(null);
  const navigationId = useRef(0);
  const navigation = useRef<ViewTransition | null>(null);

  useEffect(() => {
    let disposed = false;
    void readLedger().then((saved) => {
      if (disposed) return;
      if (saved) {
        setDataset(saved);
        setScope(defaultScope(saved.rows));
      }
      setStorage("ready");
    }).catch(() => {
      if (!disposed) setStorage("temporary");
    });
    return () => { disposed = true; };
  }, []);

  useEffect(() => () => {
    active.current?.abort();
    navigationId.current += 1;
    navigation.current?.skipTransition();
  }, []);
  useLayoutEffect(() => {
    if (ruleAnchor && view === "rules") {
      document.getElementById(`rule-${ruleAnchor}`)?.scrollIntoView({ block: "center" });
    }
  }, [ruleAnchor, view]);

  const rule = !useRules ? null : run
    ? clubRules.find((entry) => entry.id === run.ruleId) ?? null
    : applicableRule(scope);
  const criteria = run?.criteria ?? rule?.criteria ?? defaultCriteria;
  const activities = useMemo(() => listActivities(dataset.rows), [dataset.rows]);
  const dialogEventId = dialog && "eventId" in dialog ? dialog.eventId : undefined;
  const dialogActivity = dialogEventId ? activities.find(({ eventId }) => eventId === dialogEventId) : undefined;
  const report = useMemo(() => makeReport(dataset.rows, scope, criteria), [dataset.rows, scope, criteria]);
  const trial = useMemo(() => trialMinimum === null || trialMinimum === report.criteria.minSamples
    ? report
    : makeReport(dataset.rows, report.scope, { ...report.criteria, minSamples: trialMinimum }), [dataset.rows, report, trialMinimum]);
  const scopeValid = scopeSchema.safeParse(scope).success;
  const ready = storage !== "opening";

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
    setTrialMinimum(null);
  }

  function changeScope(next: AnalysisScope) {
    clearAnalysis();
    setScope(next);
  }

  function transitionTo(next: View, scrollTop = false) {
    const id = ++navigationId.current;
    navigation.current?.skipTransition();

    function commit() {
      if (id !== navigationId.current) return;
      setView(next);
      if (scrollTop) window.scrollTo(0, 0);
    }

    if (next === view || !document.startViewTransition || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      commit();
      return;
    }

    const transition = document.startViewTransition(() => flushSync(commit));
    navigation.current = transition;
    void transition.ready.catch(() => {});
    function releaseTransition() {
      if (navigation.current === transition) navigation.current = null;
    }
    void transition.finished.then(releaseTransition, releaseTransition);
  }

  function selectView(next: View) {
    setRuleAnchor(null);
    setNotice("");
    transitionTo(next, true);
  }

  function openRule(id: string) {
    setDialog(null);
    setRuleAnchor(id);
    transitionTo("rules");
  }

  async function saveLedger(next: WorkspaceLedger) {
    setDataset(storage === "temporary" ? next : await writeLedger(next));
  }

  function confirmChange(message: string, nextDialog: Dialog | null = null) {
    setDialog(nextDialog);
    setNotice(storage === "temporary" ? `${message}浏览器存储不可用，刷新前请导出台账。` : message);
  }

  function updateScopeAfterSave(rows: AttendanceRecord[], changed?: ActivityFields) {
    clearAnalysis();
    if (changed && scope.eventId === changed.eventId) {
      setScope({ ...scope, from: changed.date, to: changed.date, category: changed.category });
      return;
    }
    const previous = defaultScope(dataset.rows);
    if (!scope.eventId && scope.from === previous.from && scope.to === previous.to) {
      const next = defaultScope(rows);
      setScope({ ...scope, from: next.from, to: next.to });
    }
  }

  async function importDataset(rows: AttendanceRecord[], filename: string, mode: CsvImportMode) {
    if (mode === "append") {
      const result = appendLedgerRows(dataset.rows, rows);
      if (!result.added) return;
      await saveLedger({ ...dataset, rows: result.rows });
      updateScopeAfterSave(result.rows);
      confirmChange(`已追加 ${result.added} 条记录${result.duplicates ? `，跳过 ${result.duplicates} 条重复记录` : ""}。`);
      return;
    }
    const replacement = validateLedgerRows(rows);
    await saveLedger({ ...dataset, title: filename.replace(/\.csv$/i, "") || "活动台账", rows: replacement, attachments: {} });
    clearAnalysis();
    setScope(defaultScope(replacement));
    setQuestion("");
    confirmChange(`已导入 ${replacement.length} 条记录。`);
  }

  function openActivity(eventId: string) {
    if (ready) setDialog({ type: "activity", eventId });
  }

  function closeDialog() {
    const backToActivity = dialog?.type === "scan" || dialog?.type === "activity-editor" || dialog?.type === "compare";
    setDialog(backToActivity && dialog.eventId ? { type: "activity", eventId: dialog.eventId } : null);
  }

  function reviewActivity(activity: LedgerActivity) {
    changeScope(activityScope(activity));
    setQuestion("");
    setDialog(null);
    selectView("review");
  }

  async function saveActivity(mode: ActivityEditorMode, record: AttendanceRecord) {
    if (mode === "create" && activities.some(({ eventId }) => eventId === record.eventId)) {
      throw new Error("此活动编号已存在，请换一个编号。");
    }

    let rows: AttendanceRecord[];
    if (mode === "edit") {
      const { eventId, eventName, date, category } = record;
      rows = validateLedgerRows(dataset.rows.map((row) => row.eventId === eventId ? { ...row, eventName, date, category } : row));
    } else {
      const result = appendLedgerRows(dataset.rows, [record]);
      if (!result.added) throw new Error("该活动已有此渠道记录。");
      rows = result.rows;
    }

    await saveLedger({ ...dataset, rows });
    updateScopeAfterSave(rows, mode === "edit" ? record : undefined);
    confirmChange(mode === "channel" ? "已新增渠道。" : "已保存活动。", { type: "activity", eventId: record.eventId });
  }

  function showScan(row: AttendanceRecord | null, eventId?: string) {
    if (ready) setDialog({ type: "scan", initial: row, eventId });
  }

  async function saveAttendance(key: string, attended: number, photo?: Attachment) {
    stopAnalysis();
    setAnalysisError("");
    const attachments = { ...dataset.attachments };
    if (photo) attachments[key] = photo;
    else delete attachments[key];
    await saveLedger({
      ...dataset,
      rows: dataset.rows.map((row) => recordKey(row) === key ? { ...row, attended } : row),
      attachments,
    });
    if (run) setSteps((current) => [...current, { name: "更新签到并重算", detail: `确认到场 ${attended} 人。` }]);
    const eventId = dialog?.type === "scan" ? dialog.eventId : undefined;
    confirmChange("已更新签到。", eventId ? { type: "activity", eventId } : null);
  }

  function applyRun(result: AnalysisRun) {
    setScope(result.scope);
    setRun(result);
    setTrialMinimum(null);
    transitionTo("review");
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
    if (!ready) return;
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

  const openEvidence = (group: ReportGroup, isTrial = false) => setDialog({ type: "evidence", group, trial: isTrial });
  const feedback = notice && <div className="notice" role="status"><span>{notice}</span><button type="button" className="icon-button" aria-label="关闭提示" onClick={() => setNotice("")}><X size={14} /></button></div>;

  return (
    <>
      <div className="app-shell" data-view={view}>
        <aside className="sidebar">
          <button type="button" className="brand" aria-label="返回活动复盘" onClick={() => selectView("review")}>
            <Image className="brand-mark" src={clubMark} width={40} height={40} alt="" unoptimized />
            <strong className="brand-name">社团复盘</strong>
          </button>
          <nav className="sidebar-nav" aria-label="工作区">
            {views.map(({ id, label, icon: Icon }) => <button type="button" key={id} aria-current={view === id ? "page" : undefined}
              className={`nav-link ${view === id ? "nav-active" : ""}`} onClick={() => selectView(id)}
              onPointerEnter={id === "visual" ? preloadVisualCharts : undefined} onFocus={id === "visual" ? preloadVisualCharts : undefined}>
              <Icon size={18} strokeWidth={1.65} aria-hidden="true" /><span>{label}</span>
            </button>)}
          </nav>
        </aside>

        <main className="main-shell">
          <div className="workspace" aria-busy={!ready}>
            {view === "review" && (
              <>
                <div className="page-heading">
                  <div>
                    <h1>活动复盘</h1>
                    <div className="page-meta"><CalendarDays size={16} /><span>{scopeLabel(scope)}</span></div>
                  </div>
                  <button type="button" className="button secondary report-button" onClick={() => window.print()} disabled={!scopeValid}>
                    <ArrowDownToLine size={16} />导出简报
                  </button>
                </div>
                {feedback}
                <AnalysisComposer question={question} setQuestion={setQuestion} analyze={(query) => void analyze(query)}
                  running={running} useRules={useRules} setUseRules={(value) => {
                    clearAnalysis(); setUseRules(value);
                  }} stop={stopAnalysis} error={analysisError} steps={steps} run={run} />
                <FilterBar scope={scope} rows={dataset.rows} change={changeScope} reset={() => changeScope(defaultScope(dataset.rows))} />
                {!scopeValid && <p className="form-error" role="alert">起始日期须早于或等于结束日期。</p>}
                <SummaryCards report={report} />
                <div className="analysis-grid">
                  <Overview report={report} setGrouping={(groupBy) => changeScope({ ...scope, groupBy })} evidence={openEvidence} />
                  <InsightPanel report={report} rule={rule} run={run} evidence={openEvidence} edit={showScan} openRule={openRule} />
                </div>
                <GroupTable report={report} evidence={openEvidence} />
                {report.groups.length > 1 && <ScenarioPanel report={report} trial={trial} change={setTrialMinimum} evidence={openEvidence} />}
              </>
            )}

            {view === "visual" && (
              <VisualDashboard report={report} evidence={openEvidence}>
                <FilterBar scope={scope} rows={dataset.rows} change={changeScope} reset={() => changeScope(defaultScope(dataset.rows))} />
                {!scopeValid && <p className="form-error" role="alert">起始日期须早于或等于结束日期。</p>}
              </VisualDashboard>
            )}

            {view === "data" && (
              <>
                <div className="page-heading data-heading">
                  <div><h1>活动台账</h1><div className="page-meta"><span>{dataset.title} · {activities.length} 场活动 · {dataset.rows.length} 条记录</span></div></div>
                  <div className="page-actions">
                    <button type="button" className="button secondary" onClick={() => downloadCsv(dataset.rows, "活动台账.csv")} disabled={!ready}><ArrowDownToLine size={16} />导出 CSV</button>
                    <button type="button" className="button secondary" onClick={() => setDialog({ type: "csv" })} disabled={!ready}><Upload size={16} />导入 CSV</button>
                    <button type="button" className="button secondary" onClick={() => showScan(null)} disabled={!ready}><ScanLine size={16} />补录签到</button>
                    <button type="button" className="button primary" onClick={() => setDialog({ type: "activity-editor", mode: "create" })} disabled={!ready}><Plus size={16} />新增活动</button>
                  </div>
                </div>
                {feedback}
                <RecordsWorkspace activities={activities} attachments={dataset.attachments} edit={ready ? showScan : undefined}
                  openActivity={openActivity} compare={() => { if (ready) setDialog({ type: "compare" }); }} />
              </>
            )}

            {view === "rules" && (
              <>
                <div className="page-heading"><h1>规则库</h1></div>
                <RulesWorkspace />
              </>
            )}
          </div>
        </main>
      </div>

      <PrintSummary report={report} trial={trial} source={dataset.title} rule={rule} />

      {dialog?.type === "csv" && <CsvDialog currentRows={dataset.rows} close={closeDialog} save={importDataset} />}
      {dialog?.type === "scan" && <AttendanceDialog rows={dialogActivity?.rows ?? dataset.rows} initial={dialog.initial}
        canScan={visionConfigured}
        close={closeDialog} save={saveAttendance} />}
      {dialog?.type === "evidence" && <EvidenceDialog group={dialog.group} rule={rule}
        criteria={dialog.trial ? trial.criteria : report.criteria} trial={dialog.trial}
        attachments={dataset.attachments} close={closeDialog} openRule={openRule} openActivity={openActivity} />}
      {dialog?.type === "activity" && dialogActivity && <ActivityDetail activity={dialogActivity} attachments={dataset.attachments}
        useRules={useRules} canCompare={activities.length > 1} close={closeDialog}
        editActivity={() => setDialog({ type: "activity-editor", mode: "edit", eventId: dialogActivity.eventId })}
        addChannel={() => setDialog({ type: "activity-editor", mode: "channel", eventId: dialogActivity.eventId })}
        editAttendance={(row) => showScan(row, dialogActivity.eventId)} compare={() => setDialog({ type: "compare", eventId: dialogActivity.eventId })}
        review={() => reviewActivity(dialogActivity)} />}
      {dialog?.type === "activity-editor" && (dialog.mode === "create" || dialogActivity) && <ActivityEditor mode={dialog.mode}
        activity={dialogActivity} rows={dataset.rows} close={closeDialog} save={(row) => saveActivity(dialog.mode, row)} />}
      {dialog?.type === "compare" && <ActivityComparison activities={activities} firstId={dialog.eventId} useRules={useRules} close={closeDialog} />}
    </>
  );
}

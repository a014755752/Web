"use client";

import Image from "next/image";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { ArrowDownToLine, BookOpen, CalendarDays, ChartNoAxesCombined, FolderOpen, MessagesSquare, Moon, NotebookPen, Plus, ScanLine, Sun, Upload, X } from "lucide-react";
import clubMark from "@/app/icon.png";
import {
  defaultCriteria, defaultScope, makeReport, recordKey, scopeLabel, scopeSchema,
  type AnalysisScope, type AttendanceRecord, type Report, type ReportGroup,
} from "@/lib/attendance";
import type { AnalysisRun } from "@/lib/analysis-run";
import type { ScanSource } from "@/lib/attendance-scan";
import { initialRecords } from "@/lib/activity-ledger";
import { activityScope, appendLedgerRows, listActivities, validateLedgerRows, type ActivityFields, type LedgerActivity } from "@/lib/ledger-activities";
import { applicableRule, clubRules, type ClubRule } from "@/lib/rules";
import { themeStorageKey, type Theme } from "@/lib/theme";
import { readLedger, writeLedger, type Attachment, type WorkspaceLedger } from "@/lib/workspace-store";
import { AttendanceDialog } from "./attendance-dialog";
import { ActivityComparison, ActivityDetail, ActivityEditor, type ActivityEditorMode } from "./activity-panels";
import { AiWorkspace, type AiQuestion } from "./ai-workspace";
import { CsvDialog, downloadCsv, EvidenceDialog, RecordsWorkspace, RulesWorkspace, type CsvImportMode } from "./data-panels";
import { FilterBar, GroupTable, InsightPanel, Overview, PrintSummary, ScenarioPanel, SummaryCards } from "./review-panels";
import { useAiConversation, type AiTurn } from "./use-ai-conversation";
import { applyLedgerProposal } from "@/lib/ledger-proposal";
import VisualDashboard, { preloadVisualCharts } from "./visual-dashboard";
import { AccessControls } from "./access-controls";

const views = [
  { id: "review", label: "活动复盘", icon: NotebookPen },
  { id: "ai", label: "AI 对话", icon: MessagesSquare },
  { id: "visual", label: "可视化大屏", icon: ChartNoAxesCombined },
  { id: "data", label: "活动台账", icon: FolderOpen },
  { id: "rules", label: "规则库", icon: BookOpen },
] as const;

type View = typeof views[number]["id"];
type Dialog = { type: "csv" } |
  { type: "scan"; initial: AttendanceRecord | null; eventId?: string; taskId?: string; file?: File } |
  { type: "evidence"; group: ReportGroup; trial: boolean; context?: { criteria: Report["criteria"]; rule: ClubRule | null } } |
  { type: "activity"; eventId: string } |
  { type: "activity-editor"; mode: ActivityEditorMode; eventId?: string } |
  { type: "compare"; eventId?: string };

const initialData: WorkspaceLedger = { revision: 0, title: "2026 秋季活动台账", rows: initialRecords, attachments: {} };

export function ReviewApp({ modelConfigured, modelLabel, visionConfigured = modelConfigured }: {
  modelConfigured: boolean; modelLabel?: string; visionConfigured?: boolean;
}) {
  const [theme, setTheme] = useState<Theme>("light");
  const [dataset, setDataset] = useState(initialData);
  const [storage, setStorage] = useState<"opening" | "ready" | "temporary">("opening");
  const [view, setView] = useState<View>("review");
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [scope, setScope] = useState(() => defaultScope(initialRecords));
  const [trialMinimum, setTrialMinimum] = useState<number | null>(null);
  const [useRules, setUseRules] = useState(true);
  const [run, setRun] = useState<AnalysisRun | null>(null);
  const [notice, setNotice] = useState("");
  const [ruleAnchor, setRuleAnchor] = useState<string | null>(null);
  const conversation = useAiConversation(modelConfigured);
  const navigationId = useRef(0);
  const navigation = useRef<ViewTransition | null>(null);

  useEffect(() => {
    setTheme(document.documentElement.dataset.theme === "dark" ? "dark" : "light");
    function openConversationFromLink() {
      if (window.location.hash === "#ai") setView("ai");
    }
    openConversationFromLink();
    window.addEventListener("hashchange", openConversationFromLink);
    return () => window.removeEventListener("hashchange", openConversationFromLink);
  }, []);

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
    navigationId.current += 1;
    navigation.current?.skipTransition();
  }, []);
  useLayoutEffect(() => {
    if (ruleAnchor && view === "rules") {
      document.getElementById(`rule-${ruleAnchor}`)?.scrollIntoView({ block: "center" });
    }
  }, [ruleAnchor, view]);

  const rule = run ? clubRules.find((entry) => entry.id === run.ruleId) ?? null : useRules ? applicableRule(scope) : null;
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

  function toggleTheme() {
    const root = document.documentElement;
    const next = root.dataset.theme === "dark" ? "light" : "dark";
    root.dataset.theme = next;
    setTheme(next);
    try { localStorage.setItem(themeStorageKey, next); } catch { /* The theme still applies to this page. */ }
  }

  function clearAnalysis() {
    setRun(null);
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
      if (next === "ai" || window.location.hash === "#ai") {
        const { pathname, search } = window.location;
        window.history.replaceState(window.history.state, "", pathname + search + (next === "ai" ? "#ai" : ""));
      }
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
    const saved = storage === "temporary" ? { ...next, revision: next.revision + 1 } : await writeLedger(next);
    conversation.stopAll();
    setDataset(saved);
    return saved;
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
    setDialog(null);
    selectView("review");
  }

  function askAi(input: AiQuestion) {
    if (!ready || !conversation.loaded) return;
    setNotice("");
    const common = { question: input.question, rows: dataset.rows, useRules };
    if (input.kind === "compare" || input.kind === "chat") {
      void conversation.execute({ ...input, ...common }, dataset.revision);
      return;
    }
    const activity = activities.find(({ eventId }) => eventId === input.eventId);
    void conversation.execute({
      ...common, scope: activity ? activityScope(activity) : defaultScope(dataset.rows), fixedScope: !!activity, workflow: true,
    }, dataset.revision);
  }

  function retryAi(turn: AiTurn) {
    if (!ready || !conversation.loaded) return;
    const request = turn.request;
    const common = { question: turn.question, rows: dataset.rows, useRules: turn.useRules };
    setNotice("");
    if (request.kind === "chat") {
      void conversation.execute({ ...request, ...common, documents: turn.documents }, dataset.revision);
      return;
    }
    if (request.kind === "compare") {
      if (!activities.some(({ eventId }) => eventId === request.baselineId) || !activities.some(({ eventId }) => eventId === request.targetId)) {
        setNotice("对比对象已从台账移除，请重新选择活动。");
        return;
      }
      void conversation.execute({ ...request, ...common }, dataset.revision);
      return;
    }
    const eventId = request.scope.eventId;
    const activity = activities.find((item) => item.eventId === eventId);
    if (request.fixedScope && eventId && !activity) {
      setNotice("这场活动已从台账移除，请重新选择活动。");
      return;
    }
    void conversation.execute({ ...common, scope: activity ? activityScope(activity) : defaultScope(dataset.rows), fixedScope: !!activity, workflow: true }, dataset.revision);
  }

  function reviewWithAi(activity: LedgerActivity) {
    conversation.stop();
    setDialog(null);
    selectView("ai");
    askAi({ kind: "review", eventId: activity.eventId, question: `复盘 ${activity.eventId}，核对签到缺口和渠道表现。` });
  }

  async function applyAiChanges(turn: AiTurn) {
    const proposal = turn.result?.kind === "chat" ? turn.result.proposal : undefined;
    if (!ready || !proposal || proposal.status !== "pending") throw new Error("这项变更已处理或当前不可用。");
    if (turn.revision !== dataset.revision) throw new Error("台账已更新，请重新生成变更。");
    const rows = applyLedgerProposal(dataset.rows, proposal);
    const attachments = { ...dataset.attachments };
    for (const { before, after } of proposal.changes) {
      if (before && (before.attended !== after.attended || before.registered !== after.registered)) delete attachments[recordKey(before)];
    }
    const saved = await saveLedger({ ...dataset, rows, attachments });
    updateScopeAfterSave(rows);
    if (scope.eventId) {
      const updated = rows.find((row) => row.eventId === scope.eventId);
      if (updated) setScope({ ...scope, from: updated.date, to: updated.date, category: updated.category });
    }
    conversation.resolveProposal(turn, "applied", saved.revision);
    setNotice(`已确认写入 ${proposal.changes.length} 条活动渠道记录。`);
  }

  function answerAiQuestions(turn: AiTurn, answers: string[]) {
    const result = turn.result;
    if (result?.kind !== "chat" || !result.pendingQuestions || turn.questionAnswers) return;
    conversation.resolveQuestions(turn, answers);
    const question = ["请根据我对你刚才问题的回答继续处理：", ...result.pendingQuestions.map((prompt, index) =>
      `${index + 1}. ${prompt}\n回答：${answers[index]}`)].join("\n\n");
    askAi({ kind: "chat", question,
      eventId: turn.request.kind === "chat" ? turn.request.eventId : undefined,
      allowWeb: turn.request.kind === "chat" ? turn.request.allowWeb : undefined });
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

  function scanForTask(turn: AiTurn, row: AttendanceRecord, file?: File) {
    if (ready && turn.revision === dataset.revision) setDialog({ type: "scan", initial: row, taskId: turn.id, file });
  }

  async function saveAttendance(key: string, attended: number, photo?: Attachment, source?: ScanSource) {
    const current = dataset.rows.find((row) => recordKey(row) === key);
    if (!current || !Number.isInteger(attended) || attended < 0 || attended > current.registered) throw new Error("请核对活动、渠道和到场人数。");
    const scan = dialog?.type === "scan" ? dialog : undefined;
    const task = scan?.taskId === undefined ? undefined : conversation.turns.find(({ id }) => id === scan.taskId);
    if (scan?.taskId !== undefined && (!task || task.revision !== dataset.revision || !scan.initial || recordKey(scan.initial) !== key || current.attended !== null)) {
      throw new Error("台账已更新，请返回对话重新核对。");
    }

    const updated = { ...current, attended };
    const attachments = { ...dataset.attachments };
    if (photo) attachments[key] = photo;
    else delete attachments[key];
    const saved = await saveLedger({
      ...dataset,
      rows: dataset.rows.map((row) => recordKey(row) === key ? updated : row),
      attachments,
    });
    clearAnalysis();
    if (task) {
      setDialog(null);
      if (storage === "temporary") setNotice("浏览器存储不可用，刷新前请导出台账。");
      conversation.resume(task, saved, updated, source);
    } else {
      confirmChange("已更新签到。", scan?.eventId ? { type: "activity", eventId: scan.eventId } : null);
    }
  }

  function applyRun(result: AnalysisRun) {
    setScope(result.scope);
    setRun(result);
    setTrialMinimum(null);
    transitionTo("review");
  }

  const openEvidence = (group: ReportGroup, isTrial = false) => setDialog({ type: "evidence", group, trial: isTrial });
  const openAiEvidence = (group: ReportGroup, result: Report, ruleId: string | null) => setDialog({
    type: "evidence", group, trial: false,
    context: { criteria: result.criteria, rule: clubRules.find((rule) => rule.id === ruleId) ?? null },
  });
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
          <button type="button" className="button secondary theme-toggle" onClick={toggleTheme}>
            {theme === "dark" ? <Sun size={16} aria-hidden="true" /> : <Moon size={16} aria-hidden="true" />}
            {theme === "dark" ? "浅色模式" : "深色模式"}
          </button>
          <AccessControls />
        </aside>

        <main className="main-shell">
          <div className={view === "ai" ? "workspace agent-content" : "workspace"} aria-busy={!ready || (view === "ai" && !conversation.loaded)}>
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

            {view === "ai" && <AiWorkspace key={conversation.selectedId}
              turns={conversation.turns} threads={conversation.threads} selected={conversation.selectedId} select={conversation.select} create={conversation.create} remove={conversation.remove}
              activities={activities} ledgerTitle={dataset.title} modelLabel={modelLabel} notice={feedback} storageWarning={conversation.storageWarning}
              revision={dataset.revision} ready={ready && conversation.loaded}
              useRules={useRules} setUseRules={(value) => { clearAnalysis(); setUseRules(value); }} ask={askAi} stop={() => conversation.stop()}
              actions={{ openActivity, openEvidence: openAiEvidence, openReport: applyRun, openRule, scan: scanForTask, retry: retryAi,
                applyChanges: applyAiChanges, cancelChanges: (turn) => conversation.resolveProposal(turn, "cancelled"), answerQuestions: answerAiQuestions }} />}

            {view === "visual" && (
              <VisualDashboard report={report} theme={theme} evidence={openEvidence}>
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
      {dialog?.type === "scan" && <AttendanceDialog rows={dialogActivity?.rows ?? dataset.rows} initial={dialog.initial} initialFile={dialog.file}
        canScan={visionConfigured} lockActivity={dialog.taskId !== undefined}
        close={closeDialog} save={saveAttendance} />}
      {dialog?.type === "evidence" && <EvidenceDialog group={dialog.group} rule={dialog.context ? dialog.context.rule : rule}
        criteria={dialog.context?.criteria ?? (dialog.trial ? trial.criteria : report.criteria)} trial={dialog.trial}
        attachments={dataset.attachments} close={closeDialog} openRule={openRule} openActivity={openActivity} />}
      {dialog?.type === "activity" && dialogActivity && <ActivityDetail activity={dialogActivity} attachments={dataset.attachments}
        useRules={useRules} canCompare={activities.length > 1} close={closeDialog}
        editActivity={() => setDialog({ type: "activity-editor", mode: "edit", eventId: dialogActivity.eventId })}
        addChannel={() => setDialog({ type: "activity-editor", mode: "channel", eventId: dialogActivity.eventId })}
        editAttendance={(row) => showScan(row, dialogActivity.eventId)} compare={() => setDialog({ type: "compare", eventId: dialogActivity.eventId })}
        review={() => reviewActivity(dialogActivity)} aiReview={() => reviewWithAi(dialogActivity)} />}
      {dialog?.type === "activity-editor" && (dialog.mode === "create" || dialogActivity) && <ActivityEditor mode={dialog.mode}
        activity={dialogActivity} rows={dataset.rows} close={closeDialog} save={(row) => saveActivity(dialog.mode, row)} />}
      {dialog?.type === "compare" && <ActivityComparison activities={activities} firstId={dialog.eventId} useRules={useRules} close={closeDialog} />}
    </>
  );
}

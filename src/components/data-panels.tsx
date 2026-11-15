"use client";

import { useMemo, useState, type ChangeEvent } from "react";
import { ArrowDownToLine, ChevronLeft, ChevronRight, FileImage, FileSpreadsheet, FileText, GitCompareArrows, Pencil, Search, Upload } from "lucide-react";
import { defaultCriteria, makeReportGroup, numberLabel, percent, recordKey, type AttendanceRecord, type Criteria, type ReportGroup } from "@/lib/attendance";
import { readCsv, writeCsv } from "@/lib/csv";
import { appendLedgerRows, type LedgerActivity } from "@/lib/ledger-activities";
import { clubRules, type ClubRule } from "@/lib/rules";
import type { Attachments } from "@/lib/workspace-store";
import { Modal } from "./modal";

type RecordsProps = {
  rows: AttendanceRecord[];
  attachments: Attachments;
  edit?: (row: AttendanceRecord) => void;
  openActivity?: (eventId: string) => void;
};
export type CsvImportMode = "append" | "replace";

const pageSize = 12;

export function downloadCsv(rows: AttendanceRecord[], filename: string) {
  const url = URL.createObjectURL(new Blob([writeCsv(rows)], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function RecordsWorkspace({ activities, attachments, edit, openActivity, compare }: {
  activities: LedgerActivity[];
  attachments: Attachments;
  edit?: RecordsProps["edit"];
  openActivity: (eventId: string) => void;
  compare: () => void;
}) {
  const [display, setDisplay] = useState<"activities" | "records">("activities");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [pendingOnly, setPendingOnly] = useState(false);
  const [page, setPage] = useState(0);
  const needle = query.trim().toLocaleLowerCase("zh-CN");
  const categories = [...new Set(activities.map((activity) => activity.category))];
  const selectedCategory = categories.includes(category) ? category : "";
  const matching = activities.filter((activity) =>
    (!selectedCategory || activity.category === selectedCategory) &&
    (!needle || [activity.eventId, activity.eventName].some((value) => value.toLocaleLowerCase("zh-CN").includes(needle))));
  const rows = matching.flatMap((activity) => activity.rows);
  const pending = rows.filter((row) => row.attended === null);
  const shownActivities = pendingOnly ? matching.filter((activity) => activity.rows.some((row) => row.attended === null)) : matching;
  const shownRecords = pendingOnly ? pending : rows;
  const count = display === "activities" ? shownActivities.length : shownRecords.length;
  const pages = Math.ceil(count / pageSize);
  const current = Math.min(page, Math.max(0, pages - 1));
  const start = current * pageSize;

  return (
    <section className="card records-card ledger-card" aria-labelledby="ledger-list-title">
      <div className="ledger-card-header">
        <h2 id="ledger-list-title">台账明细</h2>
        <div className="segmented" role="group" aria-label="台账视图">
          <button type="button" aria-pressed={display === "activities"} onClick={() => { setDisplay("activities"); setPage(0); }}>按活动</button>
          <button type="button" aria-pressed={display === "records"} onClick={() => { setDisplay("records"); setPage(0); }}>签到记录</button>
        </div>
      </div>
      <div className="ledger-toolbar">
        <label className="ledger-search">
          <Search size={16} aria-hidden="true" />
          <input type="search" aria-label="搜索活动" placeholder="活动名称或编号" value={query}
            onChange={(event) => { setQuery(event.target.value); setPage(0); }} />
        </label>
        <select aria-label="台账活动类型" className="ledger-select" value={selectedCategory}
          onChange={(event) => { setCategory(event.target.value); setPage(0); }}>
          <option value="">全部活动类型</option>
          {categories.map((value) => <option key={value}>{value}</option>)}
        </select>
        <div className="segmented" role="group" aria-label="签到状态">
          <button type="button" aria-pressed={!pendingOnly} onClick={() => { setPendingOnly(false); setPage(0); }}>全部</button>
          <button type="button" aria-pressed={pendingOnly} onClick={() => { setPendingOnly(true); setPage(0); }}>待补录 {pending.length}</button>
        </div>
        <button type="button" className="button secondary ledger-compare-button" disabled={activities.length < 2} onClick={compare}>
          <GitCompareArrows size={15} />对比活动
        </button>
      </div>
      {count === 0 ? <p className="empty-note">当前筛选下没有匹配的记录。</p> : display === "activities"
        ? <ActivityTable activities={shownActivities.slice(start, start + pageSize)} openActivity={openActivity} />
        : <RecordsTable rows={shownRecords.slice(start, start + pageSize)} attachments={attachments} edit={edit} openActivity={openActivity} />}
      {count > 0 && <div className="ledger-pagination">
        <span role="status">{start + 1}–{Math.min(start + pageSize, count)} / 共 {count} {display === "activities" ? "场活动" : "条记录"}</span>
        {pages > 1 && <div className="ledger-page-buttons">
          <button type="button" className="button secondary small-button" disabled={current === 0} onClick={() => setPage(current - 1)}><ChevronLeft size={15} />上一页</button>
          <button type="button" className="button secondary small-button" disabled={current + 1 === pages} onClick={() => setPage(current + 1)}>下一页<ChevronRight size={15} /></button>
        </div>}
      </div>}
    </section>
  );
}

function ActivityTable({ activities, openActivity }: { activities: LedgerActivity[]; openActivity: (eventId: string) => void }) {
  return (
    <div className="table-scroll">
      <table className="data-table activity-table">
        <thead><tr>
          <th scope="col">活动</th><th scope="col">日期</th><th scope="col">类型</th>
          <th scope="col" className="numeric">报名</th><th scope="col" className="numeric">已到场</th>
          <th scope="col">签到覆盖率</th><th scope="col">状态</th>
        </tr></thead>
        <tbody>{activities.map((activity) => {
          const totals = makeReportGroup(activity.eventName, activity.rows, defaultCriteria);
          return <tr key={activity.eventId}>
            <th scope="row">
              <button type="button" className="link-button event-link" onClick={() => openActivity(activity.eventId)}>{activity.eventName}</button>
              <span className="cell-caption">{activity.eventId}</span>
            </th>
            <td className="date-cell">{activity.date}</td><td>{activity.category}</td>
            <td className="numeric">{numberLabel(totals.registered)}</td>
            <td className="numeric">{totals.missing === totals.rowCount ? "—" : numberLabel(totals.attended)}</td>
            <td>{percent(totals.coverage)}</td>
            <td><span className={`pill ${totals.missing ? "warning" : "success"}`}>{totals.missing ? `${totals.missing} 条待补录` : "已记录"}</span></td>
          </tr>;
        })}</tbody>
      </table>
    </div>
  );
}

export function RecordsTable({ rows, attachments, edit, openActivity, compact = false }: RecordsProps & { compact?: boolean }) {
  const showActions = Boolean(edit) || Object.keys(attachments).length > 0;
  return (
    <div className="table-scroll">
      <table className="data-table">
        <thead><tr>
          {!compact && <><th scope="col">活动</th><th scope="col">日期</th><th scope="col">类型</th></>}
          <th scope="col">渠道</th>
          <th scope="col" className="numeric">报名</th><th scope="col" className="numeric">到场</th>
          {showActions && <th scope="col">记录</th>}
        </tr></thead>
        <tbody>
          {rows.map((row) => {
            const key = recordKey(row);
            const file = attachments[key];
            return (
              <tr key={key}>
                {compact ? <th scope="row">{row.channel}</th> : <>
                  <th scope="row">
                    {openActivity ? <button type="button" className="link-button event-link" onClick={() => openActivity(row.eventId)}>{row.eventName}</button> : <span className="cell-title">{row.eventName}</span>}
                    <span className="cell-caption">{row.eventId}</span>
                  </th>
                  <td className="date-cell">{row.date}</td><td>{row.category}</td><td>{row.channel}</td>
                </>}
                <td className="numeric">{numberLabel(row.registered)}</td>
                <td className="numeric">{row.attended === null ? <span className="pill warning">待补录</span> : numberLabel(row.attended)}</td>
                {showActions && <td>
                  <div className="row-actions">
                    {file && <a href={file.url} download={file.name} className="link-button"><FileImage size={14} />原图</a>}
                    {edit && <button type="button" className="link-button" onClick={() => edit(row)}>
                      <Pencil size={13} />{row.attended === null ? "补录" : "修改"}
                    </button>}
                  </div>
                </td>}
              </tr>
            );
          })}
        </tbody>
      </table>
      {!rows.length && <p className="empty-note">此范围内没有记录。</p>}
    </div>
  );
}

export function CsvDialog({ currentRows, close, save }: {
  currentRows: AttendanceRecord[];
  close: () => void;
  save: (rows: AttendanceRecord[], name: string, mode: CsvImportMode) => Promise<void>;
}) {
  const [pending, setPending] = useState<{ rows: AttendanceRecord[]; name: string } | null>(null);
  const [issues, setIssues] = useState<string[]>([]);
  const [mode, setMode] = useState<CsvImportMode>("append");
  const [phase, setPhase] = useState<"idle" | "checking" | "saving">("idle");
  const busy = phase !== "idle";
  const appendPlan = useMemo(() => {
    if (!pending || mode !== "append") return null;
    try {
      const { added, duplicates } = appendLedgerRows(currentRows, pending.rows);
      return { added, duplicates, error: "" };
    } catch (cause) {
      return { added: 0, duplicates: 0, error: cause instanceof Error ? cause.message : "无法追加此文件。" };
    }
  }, [currentRows, mode, pending]);

  async function inspect(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setIssues([]);
    setPending(null);
    if (file.size > 1_000_000) {
      setIssues(["请选择 1 MB 以内的 CSV 文件。"]);
      return;
    }
    setPhase("checking");
    try {
      const result = readCsv(await file.text());
      setIssues(result.issues);
      if (!result.issues.length) setPending({ rows: result.rows, name: file.name });
    } catch {
      setIssues(["读取失败，请检查文件后重试。"]);
    } finally {
      setPhase("idle");
    }
  }

  async function importFile() {
    if (!pending || busy || (appendPlan && !appendPlan.added)) return;
    setPhase("saving");
    setIssues([]);
    try {
      await save(pending.rows, pending.name, mode);
    } catch (cause) {
      setIssues([cause instanceof Error ? cause.message : "导入失败，请重试。"]);
    } finally {
      setPhase("idle");
    }
  }

  return (
    <Modal title="导入活动台账" close={close} closeDisabled={phase === "saving"}>
      <div className="modal-body">
        <p className="muted">日期用 YYYY-MM-DD。到场人数留空表示待补录。</p>
        <label className="file-drop">
          <Upload size={20} />
          <span>{phase === "checking" ? "正在校验…" : "选择 CSV 文件"}</span>
          <input type="file" accept=".csv,text/csv" onChange={inspect} disabled={busy} />
        </label>
        {issues.length > 0 && <ul className="form-errors" role="alert">{issues.map((issue, index) => <li key={index}>{issue}</li>)}</ul>}
        {pending && <>
          <div className="import-preview"><FileSpreadsheet size={18} /><div><strong>{pending.name}</strong><span>{pending.rows.length} 条渠道记录</span></div></div>
          <div className="csv-mode" role="group" aria-label="导入方式">
            <label><input type="radio" name="csv-mode" checked={mode === "append"} disabled={busy} onChange={() => { setMode("append"); setIssues([]); }} />追加到台账</label>
            <label><input type="radio" name="csv-mode" checked={mode === "replace"} disabled={busy} onChange={() => { setMode("replace"); setIssues([]); }} />替换台账</label>
          </div>
          {appendPlan?.error ? <p className="form-error" role="alert">{appendPlan.error}</p>
            : appendPlan ? <p className="muted">新增 {appendPlan.added} 条，跳过 {appendPlan.duplicates} 条完全相同的记录。</p>
              : <p className="form-error">替换后，原台账及关联签到截图将被清除。</p>}
        </>}
      </div>
      <div className="modal-actions">
        <button type="button" className="button secondary" onClick={() => downloadCsv([], "活动台账模板.csv")}>
          <ArrowDownToLine size={16} />下载模板
        </button>
        <button type="button" className="button primary" disabled={!pending || busy || Boolean(appendPlan && !appendPlan.added)} onClick={() => void importFile()}>{phase === "saving" ? "正在导入…" : mode === "replace" ? "确认替换" : "确认导入"}</button>
      </div>
    </Modal>
  );
}

export function RulesWorkspace() {
  return (
    <div className="rules-grid">
      {clubRules.map((rule) => (
        <article key={rule.id} className="card rule-card" id={`rule-${rule.id}`}>
          <header className="rule-heading">
            <h2>{rule.title}</h2>
            <span className={`pill ${rule.through ? "neutral" : "success"}`}>{rule.through ? "历史版本" : rule.version}</span>
          </header>
          <p className="muted">{rule.category ?? "通用"} · {rule.from}{rule.through ? ` 至 ${rule.through}` : " 起"}</p>
          <p>{rule.text}</p>
          {rule.criteria && <div className="rule-metrics">
            <span>有效样本 ≥ {rule.criteria.minSamples} 人</span><span>覆盖率 ≥ {percent(rule.criteria.minCoverage)}</span>
          </div>}
        </article>
      ))}
    </div>
  );
}

export function EvidenceDialog({ group, rule, criteria, trial, attachments, close, openRule, openActivity }: {
  group: ReportGroup;
  rule: ClubRule | null;
  criteria: Criteria;
  trial: boolean;
  attachments: Attachments;
  close: () => void;
  openRule: (id: string) => void;
  openActivity: (eventId: string) => void;
}) {
  const photos = group.rows.flatMap((row) => {
    const key = recordKey(row);
    return attachments[key] ? [{ key, row, file: attachments[key] }] : [];
  });
  return (
    <Modal title={`${group.label} · 计算依据`} close={close} wide>
      <div className="modal-body evidence-body">
        <div className="evidence-metrics">
          <div><span>到场率</span><strong>{percent(group.rate)}</strong><span>{group.attended} 到场 / {group.tracked} 有效报名</span></div>
          <div><span>签到覆盖率</span><strong>{percent(group.coverage)}</strong><span>{group.tracked} 有效报名 / {group.registered} 总报名</span></div>
        </div>
        <div>
          <h3>原始记录</h3>
          <RecordsTable rows={group.rows} attachments={{}} openActivity={openActivity} />
        </div>
        {photos.length > 0 && <div>
          <h3>签到截图</h3>
          <div className="evidence-photos">
            {photos.map(({ key, row, file }) => (
              <figure key={key}>
                <img src={file.url} alt={`${row.eventName} · ${row.channel}签到原图`} loading="lazy" />
                <figcaption><strong>{row.eventId} · {row.channel}</strong><a className="link-button" href={file.url} download={file.name}>下载原图</a></figcaption>
              </figure>
            ))}
          </div>
        </div>}
        <p className="muted">{trial ? "手动试算" : "当前口径"} · 有效样本 ≥ {criteria.minSamples} 人 · 签到覆盖率 ≥ {percent(criteria.minCoverage)}</p>
        {rule && <div className="evidence-rule">
          <FileText size={18} />
          <div><strong>{rule.title} · {rule.version}</strong><p>{rule.text}</p></div>
          <button type="button" className="icon-button" aria-label="查看规则原文" onClick={() => openRule(rule.id)}><ChevronRight size={17} /></button>
        </div>}
      </div>
    </Modal>
  );
}

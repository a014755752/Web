"use client";

import { useState, type ChangeEvent } from "react";
import { ArrowDownToLine, ChevronRight, FileImage, FileSpreadsheet, FileText, Pencil, Upload } from "lucide-react";
import { numberLabel, percent, recordKey, type AttendanceRecord, type Criteria, type ReportGroup } from "@/lib/attendance";
import { readCsv, writeCsv } from "@/lib/csv";
import { clubRules, type ClubRule } from "@/lib/rules";
import type { Attachments } from "@/lib/workspace-store";
import { Modal } from "./modal";

type RecordsProps = { rows: AttendanceRecord[]; attachments: Attachments; edit?: (row: AttendanceRecord) => void };

export function downloadCsv(rows: AttendanceRecord[], filename: string) {
  const url = URL.createObjectURL(new Blob([writeCsv(rows)], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function RecordsWorkspace({ rows, attachments, edit }: RecordsProps) {
  const [pendingOnly, setPendingOnly] = useState(false);
  const pending = rows.filter(({ attended }) => attended === null);
  const visibleRows = [...(pendingOnly ? pending : rows)].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <section className="card records-card" aria-label="签到记录">
      <div className="segmented records-filter" role="group" aria-label="签到状态">
        <button type="button" aria-pressed={!pendingOnly} onClick={() => setPendingOnly(false)}>全部记录</button>
        <button type="button" aria-pressed={pendingOnly} onClick={() => setPendingOnly(true)}>待补录 {pending.length}</button>
      </div>
      {pendingOnly && !pending.length ? <p className="empty-note">没有待补录记录。</p>
        : <RecordsTable rows={visibleRows} attachments={attachments} edit={edit} />}
    </section>
  );
}

function RecordsTable({ rows, attachments, edit }: RecordsProps) {
  const showActions = Boolean(edit) || Object.keys(attachments).length > 0;
  return (
    <div className="table-scroll">
      <table className="data-table">
        <thead><tr>
          <th scope="col">活动</th><th scope="col">日期</th><th scope="col">类型</th><th scope="col">渠道</th>
          <th scope="col" className="numeric">报名</th><th scope="col" className="numeric">到场</th>
          {showActions && <th scope="col">记录</th>}
        </tr></thead>
        <tbody>
          {rows.map((row) => {
            const key = recordKey(row);
            const file = attachments[key];
            return (
              <tr key={key}>
                <th scope="row"><span className="cell-title">{row.eventName}</span><span className="cell-caption">{row.eventId}</span></th>
                <td className="date-cell">{row.date}</td><td>{row.category}</td><td>{row.channel}</td>
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

export function CsvDialog({ close, replace }: { close: () => void; replace: (rows: AttendanceRecord[], name: string) => Promise<void> }) {
  const [pending, setPending] = useState<{ rows: AttendanceRecord[]; name: string } | null>(null);
  const [issues, setIssues] = useState<string[]>([]);
  const [phase, setPhase] = useState<"idle" | "checking" | "saving">("idle");
  const busy = phase !== "idle";

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
    if (!pending || busy) return;
    setPhase("saving");
    setIssues([]);
    try {
      await replace(pending.rows, pending.name);
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
        {pending && <div className="import-preview"><FileSpreadsheet size={18} /><div><strong>{pending.name}</strong><span>{pending.rows.length} 条记录，导入后会替换当前台账。</span></div></div>}
      </div>
      <div className="modal-actions">
        <button type="button" className="button secondary" onClick={() => downloadCsv([], "活动台账模板.csv")}>
          <ArrowDownToLine size={16} />下载模板
        </button>
        <button type="button" className="button primary" disabled={!pending || busy} onClick={() => void importFile()}>{phase === "saving" ? "正在导入…" : "确认导入"}</button>
      </div>
    </Modal>
  );
}

export function RulesWorkspace() {
  return (
    <div className="rules-grid">
      {clubRules.map((rule) => (
        <article key={rule.id} className="card rule-card" id={`rule-${rule.id}`}>
          <div className="rule-heading">
            <span className="tile-icon"><FileText size={19} /></span>
            <span className={`pill ${rule.through ? "neutral" : "success"}`}>{rule.through ? "历史版本" : rule.version}</span>
          </div>
          <h2>{rule.title}</h2>
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

export function EvidenceDialog({ group, rule, criteria, trial, attachments, close, openRule }: {
  group: ReportGroup;
  rule: ClubRule | null;
  criteria: Criteria;
  trial: boolean;
  attachments: Attachments;
  close: () => void;
  openRule: (id: string) => void;
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
          <RecordsTable rows={group.rows} attachments={{}} />
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

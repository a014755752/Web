"use client";

import { Fragment, useId, useState, type FormEvent } from "react";
import { ArrowLeftRight, ArrowRight, GitCompareArrows, MessagesSquare, Pencil, Plus } from "lucide-react";
import { groupLabels, numberLabel, percent, recordSchema, type AttendanceRecord, type ReportGroup } from "@/lib/attendance";
import { compareActivityReports, formatPointChange, nextActivityId, reportActivity, type LedgerActivity } from "@/lib/ledger-activities";
import type { Attachments } from "@/lib/workspace-store";
import { RecordsTable } from "./data-panels";
import { Modal } from "./modal";
import { SummaryCards } from "./review-panels";
import "./ledger.css";

const editorTitles = { create: "新增活动", edit: "编辑活动", channel: "新增渠道" };
export type ActivityEditorMode = keyof typeof editorTitles;

export function ActivityEditor({ mode, activity, rows, close, save }: {
  mode: ActivityEditorMode;
  activity?: LedgerActivity;
  rows: AttendanceRecord[];
  close: () => void;
  save: (row: AttendanceRecord) => Promise<void>;
}) {
  const inputId = useId();
  const [fields, setFields] = useState(() => ({
    eventId: activity?.eventId ?? nextActivityId(rows),
    eventName: activity?.eventName ?? "",
    date: activity?.date ?? "",
    category: activity?.category ?? "",
    channel: "",
    registered: "",
    attended: "",
  }));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const activityTypes = [...new Set(rows.map((row) => row.category))];
  const channels = [...new Set(rows.map((row) => row.channel))];

  function change(field: keyof typeof fields, value: string) {
    setFields((current) => ({ ...current, [field]: value }));
    setError("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const draft = mode === "edit" && activity
      ? { ...activity.rows[0], eventName: fields.eventName, date: fields.date, category: fields.category }
      : { ...fields, registered: fields.registered === "" ? NaN : Number(fields.registered), attended: fields.attended === "" ? null : Number(fields.attended) };
    const parsed = recordSchema.safeParse(draft);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      setError(issue?.code === "custom" ? issue.message : "请核对必填信息、日期和人数。");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await save(parsed.data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "保存失败，请重试。");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={editorTitles[mode]} close={close} closeDisabled={saving}>
      {(dismiss) => <form onSubmit={(event) => void submit(event)}>
        <div className="modal-body activity-form">
          {mode === "channel" ? <p className="activity-context">{activity?.eventName} · {activity?.date}</p> : <>
            <label className="field">活动名称
              <input required maxLength={80} value={fields.eventName} disabled={saving} onChange={(event) => change("eventName", event.target.value)} />
            </label>
            <div className="activity-form-grid">
              <label className="field">活动编号
                <input required maxLength={80} readOnly={mode === "edit"} value={fields.eventId} disabled={saving} onChange={(event) => change("eventId", event.target.value)} />
              </label>
              <label className="field">活动日期
                <input type="date" required value={fields.date} disabled={saving} onChange={(event) => change("date", event.target.value)} />
              </label>
            </div>
            <label className="field">活动类型
              <input required maxLength={80} list={inputId + "-types"} value={fields.category} disabled={saving} onChange={(event) => change("category", event.target.value)} />
              <datalist id={inputId + "-types"}>{activityTypes.map((type) => <option key={type} value={type} />)}</datalist>
            </label>
          </>}
          {mode !== "edit" && <div className={`activity-channel-fields ${mode === "create" ? "activity-channel-inset" : ""}`}>
            <label className="field">宣传渠道
              <input required maxLength={80} list={inputId + "-channels"} value={fields.channel} disabled={saving} onChange={(event) => change("channel", event.target.value)} />
              <datalist id={inputId + "-channels"}>{channels.map((channel) => <option key={channel} value={channel} />)}</datalist>
            </label>
            <div className="activity-form-grid">
              <label className="field">报名人数
                <input type="number" min={0} max={1_000_000} step={1} required value={fields.registered} disabled={saving} onChange={(event) => change("registered", event.target.value)} />
              </label>
              <label className="field">到场人数
                <input type="number" min={0} max={fields.registered || 1_000_000} step={1} placeholder="留空为待补录" value={fields.attended} disabled={saving} onChange={(event) => change("attended", event.target.value)} />
              </label>
            </div>
          </div>}
          {error && <p className="form-error" role="alert">{error}</p>}
        </div>
        <div className="modal-actions">
          <button type="button" className="button secondary" disabled={saving} onClick={dismiss}>取消</button>
          <button type="submit" className="button primary" disabled={saving}>{saving ? "正在保存…" : "保存"}</button>
        </div>
      </form>}
    </Modal>
  );
}

export function ActivityDetail({ activity, attachments, useRules, canCompare, close, editActivity, addChannel, editAttendance, compare, review, aiReview }: {
  activity: LedgerActivity;
  attachments: Attachments;
  useRules: boolean;
  canCompare: boolean;
  close: () => void;
  editActivity: () => void;
  addChannel: () => void;
  editAttendance: (row: AttendanceRecord) => void;
  compare: () => void;
  review: () => void;
  aiReview: () => void;
}) {
  const { report } = reportActivity(activity, useRules);
  return (
    <Modal title={activity.eventName} close={close} wide>
      <div className="modal-body activity-detail">
        <p className="muted">{activity.eventId} · {activity.category} · {activity.date}</p>
        <SummaryCards report={report} />
        <div className="activity-section-heading">
          <h3>渠道签到</h3>
          <button type="button" className="button secondary small-button" onClick={addChannel}><Plus size={15} />新增渠道</button>
        </div>
        <RecordsTable rows={activity.rows} attachments={attachments} edit={editAttendance} compact />
      </div>
      <div className="modal-actions activity-detail-actions">
        <button type="button" className="button secondary" onClick={editActivity}><Pencil size={15} />编辑活动</button>
        {canCompare && <button type="button" className="button secondary" onClick={compare}><GitCompareArrows size={15} />对比活动</button>}
        <button type="button" className="button secondary" onClick={review}>复盘此活动<ArrowRight size={15} /></button>
        <button type="button" className="button primary" onClick={aiReview}><MessagesSquare size={15} />AI 复盘</button>
      </div>
    </Modal>
  );
}

const deltaNumber = new Intl.NumberFormat("zh-CN", { signDisplay: "exceptZero", maximumFractionDigits: 1 });

function channelRate(group?: ReportGroup) {
  return group ? <><span>{percent(group.rate)}</span>{group.status !== "ready" && <small>{groupLabels[group.status]}</small>}</> : "—";
}

export function ActivityComparison({ activities, firstId, useRules, close }: {
  activities: LedgerActivity[];
  firstId?: string;
  useRules: boolean;
  close: () => void;
}) {
  const [baselineId, setBaselineId] = useState(firstId ?? activities[1]?.eventId);
  const [targetId, setTargetId] = useState(activities.find(({ eventId }) => eventId !== baselineId)?.eventId);
  const baseline = activities.find(({ eventId }) => eventId === baselineId);
  const target = activities.find(({ eventId }) => eventId === targetId);
  if (!baseline || !target) return null;

  const { base, comparison, rateDelta, coverageDelta, channels } = compareActivityReports(baseline, target, useRules);
  const { totals: baseTotals } = base.report;
  const { totals: targetTotals } = comparison.report;
  const baseKnown = baseTotals.rowCount > baseTotals.missing;
  const targetKnown = targetTotals.rowCount > targetTotals.missing;
  const metrics = [
    ["报名人数", numberLabel(baseTotals.registered), numberLabel(targetTotals.registered), deltaNumber.format(targetTotals.registered - baseTotals.registered)],
    ["已记录到场", baseKnown ? numberLabel(baseTotals.attended) : "—", targetKnown ? numberLabel(targetTotals.attended) : "—",
      baseKnown && targetKnown ? deltaNumber.format(targetTotals.attended - baseTotals.attended) : "—"],
    ["到场率", percent(baseTotals.rate), percent(targetTotals.rate), formatPointChange(rateDelta)],
    ["签到覆盖率", percent(baseTotals.coverage), percent(targetTotals.coverage), formatPointChange(coverageDelta)],
  ];

  return (
    <Modal title="对比活动" close={close} wide>
      <div className="modal-body activity-comparison">
        <div className="comparison-selectors">
          {([
            { label: "基准活动", selected: baselineId, excluded: targetId, change: setBaselineId, calculation: base },
            { label: "对照活动", selected: targetId, excluded: baselineId, change: setTargetId, calculation: comparison },
          ]).map(({ label, selected, excluded, change, calculation }, index) => (
            <Fragment key={label}>
              {index === 1 && <button type="button" className="icon-button comparison-swap" aria-label="交换基准和对照" title="交换基准和对照"
                onClick={() => { setBaselineId(target.eventId); setTargetId(baseline.eventId); }}><ArrowLeftRight size={16} /></button>}
              <label className="field">{label}
                <select value={selected} aria-label={label} onChange={(event) => change(event.target.value)}>
                  {activities.map(({ eventId, eventName, date }) => <option key={eventId} value={eventId} disabled={excluded === eventId}>{eventName} · {date} · {eventId}</option>)}
                </select>
                <small className="comparison-criteria">{calculation.rule?.title ?? "默认口径"} · 样本 ≥ {calculation.report.criteria.minSamples} 人 · 覆盖 ≥ {percent(calculation.report.criteria.minCoverage)}</small>
              </label>
            </Fragment>
          ))}
        </div>
        <div className="table-scroll"><table className="data-table comparison-table">
          <thead><tr><th scope="col">指标</th><th scope="col">基准</th><th scope="col">对照</th><th scope="col">变化</th></tr></thead>
          <tbody>{metrics.map(([name, before, after, change]) => <tr key={name}>
            <th scope="row">{name}</th><td>{before}</td><td>{after}</td><td className="comparison-delta">{change}</td>
          </tr>)}</tbody>
        </table></div>
        {rateDelta === null && <p className="muted">两场活动都达到样本和签到覆盖门槛后，显示到场率差值。</p>}
        <h3>各渠道到场率</h3>
        <div className="table-scroll"><table className="data-table comparison-table">
          <thead><tr><th scope="col">宣传渠道</th><th scope="col">基准</th><th scope="col">对照</th><th scope="col">变化</th></tr></thead>
          <tbody>{channels.map(({ label, before, after, delta }) => <tr key={label}>
            <th scope="row">{label}</th><td>{channelRate(before)}</td><td>{channelRate(after)}</td>
            <td className="comparison-delta">{formatPointChange(delta)}</td>
          </tr>)}</tbody>
        </table></div>
      </div>
    </Modal>
  );
}

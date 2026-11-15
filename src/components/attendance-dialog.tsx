"use client";

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { FileImage, LoaderCircle, Upload, X } from "lucide-react";
import { recordKey, type AttendanceRecord } from "@/lib/attendance";
import { scanResultSchema, type ScanResult } from "@/lib/attendance-scan";
import type { Attachment } from "@/lib/workspace-store";
import { Modal } from "./modal";

const imageLimit = 4 * 1024 * 1024;

function imageUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function AttendanceDialog({ rows, initial, canScan, close, save }: {
  rows: AttendanceRecord[];
  initial: AttendanceRecord | null;
  canScan: boolean;
  close: () => void;
  save: (key: string, attended: number, photo?: Attachment) => Promise<void>;
}) {
  const [target, setTarget] = useState(initial ? recordKey(initial) : "");
  const [value, setValue] = useState(initial?.attended?.toString() ?? "");
  const [attachment, setAttachment] = useState<Attachment | undefined>();
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [reportScope, setReportScope] = useState<ScanResult["scope"] | null>(null);
  const active = useRef<AbortController | null>(null);
  const row = rows.find((item) => recordKey(item) === target);

  useEffect(() => () => active.current?.abort(), []);

  async function inspect(file: File, request: AbortController) {
    const url = await imageUrl(file);
    if (request.signal.aborted) return;
    setAttachment({ name: file.name, url });
    let result: ScanResult | undefined;
    let method = "本地 OCR";
    if (canScan) {
      try {
        const form = new FormData();
        form.set("file", file);
        const response = await fetch("/api/attendance/scan", { method: "POST", body: form, signal: request.signal });
        if (response.ok) {
          const data = await response.json() as { result?: unknown; model?: string };
          const parsed = scanResultSchema.safeParse(data.result);
          if (parsed.success) {
            result = parsed.data;
            method = data.model === "deepseek-flash" ? "DeepSeek Flash" : "视觉模型";
          }
        }
      } catch {
        request.signal.throwIfAborted();
      }
    }
    if (!result) {
      const { recognizeAttendance } = await import("@/lib/attendance-ocr");
      result = await recognizeAttendance(file, rows, request.signal);
    }
    if (request.signal.aborted) return;

    setReportScope(result.scope);
    const matched = rows.find((item) => item.eventId === result.eventId && item.channel === result.channel);
    setTarget(result.scope === "channel" && matched ? recordKey(matched) : "");
    setValue(result.attended?.toString() ?? "");
    const hint = result.scope === "event"
      ? "识别为全场汇总。请上传带宣传渠道的签到截图。"
      : result.attended === null
        ? "到场数不清晰，请对照原图填写。"
        : "已提取到场人数，请对照原图核对活动与渠道后确认。";
    setMessage(`${method} · ${hint}`);
  }

  async function load(file: File) {
    if (!["image/png", "image/jpeg"].includes(file.type) || file.size > imageLimit || file.size === 0) {
      setError("请选择 4 MB 以内的 PNG 或 JPG 文件。");
      return;
    }
    active.current?.abort();
    const request = new AbortController();
    active.current = request;
    setBusy(true);
    setError("");
    setMessage("");
    setAttachment(undefined);
    setReportScope(null);
    setValue("");
    try {
      await inspect(file, request);
    } catch {
      if (!request.signal.aborted) setError("截图未能识别。可以对照原图手动填写。");
    } finally {
      if (!request.signal.aborted) setBusy(false);
    }
  }

  function choose(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) void load(file);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || saving || reportScope === "event") return;
    const count = /^\d+$/.test(value) ? Number(value) : Number.NaN;
    if (!row || !Number.isSafeInteger(count) || count > row.registered) {
      setError("请选择记录并输入不超过报名人数的非负整数。");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await save(target, count, attachment);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "保存失败，请重试。");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="补录签到" close={close} closeDisabled={saving} wide>
      {(dismiss) => <form onSubmit={submit}>
        <div className="modal-body">
          <div className="scan-grid">
            <div className="scan-source">
              {attachment ? (
                <div className="image-preview">
                  <img src={attachment.url} alt="签到截图原图" />
                  <button type="button" className="icon-button remove-photo" aria-label="移除截图" disabled={busy || saving} onClick={() => {
                    setAttachment(undefined);
                    setReportScope(null);
                    setMessage("");
                    setError("");
                    setValue(row?.attended?.toString() ?? "");
                  }}><X size={16} /></button>
                </div>
              ) : (
                <label className="file-drop photo-drop">
                  <FileImage size={27} /><span>上传签到截图</span><small>可选 · PNG 或 JPG · 最大 4 MB</small>
                  <input type="file" accept="image/png,image/jpeg" onChange={choose} disabled={busy || saving} />
                </label>
              )}
              {attachment && <div className="scan-actions">
                <label className="button secondary file-button"><Upload size={15} />更换截图
                  <input type="file" accept="image/png,image/jpeg" onChange={choose} disabled={busy || saving} />
                </label>
              </div>}
            </div>
            <div className="scan-fields">
              {busy && <div className="scan-state" role="status"><LoaderCircle size={16} className="spinning" />正在识别截图…</div>}
              <label className="field">活动与渠道
                <select value={target} disabled={busy || saving} onChange={(event) => {
                  setTarget(event.target.value);
                  if (!attachment) setValue(rows.find((item) => recordKey(item) === event.target.value)?.attended?.toString() ?? "");
                  setError("");
                }}>
                  <option value="">选择对应记录</option>
                  {rows.map((item) => <option key={recordKey(item)} value={recordKey(item)}>{item.eventId} · {item.eventName} · {item.channel}</option>)}
                </select>
              </label>
              <label className="field">到场人数
                <input type="number" inputMode="numeric" min={0} max={row?.registered} step={1} value={value} disabled={busy || saving}
                  onChange={(event) => { setValue(event.target.value); setError(""); }} required />
              </label>
              {row && <p className="muted">报名 {row.registered} 人</p>}
              {message && <p className="field-note" role="status">{message}</p>}
              {error && <p className="form-error" role="alert">{error}</p>}
            </div>
          </div>
        </div>
        <div className="modal-actions">
          <button type="button" className="button secondary" onClick={dismiss} disabled={saving}>取消</button>
          <button type="submit" className="button primary" disabled={busy || saving || !target || value === "" || reportScope === "event"}>{saving ? "正在保存…" : "保存签到"}</button>
        </div>
      </form>}
    </Modal>
  );
}

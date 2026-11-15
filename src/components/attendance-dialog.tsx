"use client";

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { FileImage, LoaderCircle, ScanLine, Upload, X } from "lucide-react";
import { recordKey, type AttendanceRecord } from "@/lib/attendance";
import type { Attachment } from "./data-panels";
import { Modal } from "./modal";

type ScanResult = {
  eventId: string | null;
  channel: string | null;
  attended: number | null;
  scope: "channel" | "event" | "unclear";
};

const imageLimit = 4 * 1024 * 1024;

function imageUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function AttendanceDialog({ rows, initial, canScan, showSample, close, save }: {
  rows: AttendanceRecord[];
  initial: AttendanceRecord | null;
  canScan: boolean;
  showSample: boolean;
  close: () => void;
  save: (key: string, attended: number, photo?: Attachment) => void;
}) {
  const [target, setTarget] = useState(initial ? recordKey(initial) : "");
  const [value, setValue] = useState(initial?.attended?.toString() ?? "");
  const [attachment, setAttachment] = useState<Attachment | undefined>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [reportScope, setReportScope] = useState<ScanResult["scope"] | null>(null);
  const active = useRef<AbortController | null>(null);
  const row = rows.find((item) => recordKey(item) === target);

  useEffect(() => () => active.current?.abort(), []);

  async function inspect(file: File, request: AbortController) {
    if (!["image/png", "image/jpeg"].includes(file.type) || file.size > imageLimit || file.size === 0) {
      setError("请选择 4 MB 以内的 PNG 或 JPG 文件。");
      return;
    }

    const url = await imageUrl(file);
    if (request.signal.aborted) return;
    setAttachment({ name: file.name, url });
    if (!canScan) {
      setMessage("请对照原图，手动核对目标记录和到场人数。");
      return;
    }

    const form = new FormData();
    form.set("file", file);
    const response = await fetch("/api/attendance/scan", { method: "POST", body: form, signal: request.signal });
    const data = await response.json() as { result?: ScanResult; error?: string };
    if (!response.ok || !data.result) throw new Error(data.error ?? "截图识别失败，可以手动核对。");
    if (request.signal.aborted) return;
    const result = data.result;
    setReportScope(result.scope);
    const matched = rows.find((item) => item.eventId === result.eventId && item.channel === result.channel);
    setTarget(result.scope === "channel" && matched ? recordKey(matched) : "");
    setValue(result.attended?.toString() ?? "");
    setMessage(result.scope === "event"
      ? "识别为全场汇总。请上传带宣传渠道的签到截图。"
      : result.attended === null
        ? "到场数不清晰，请对照原图填写。"
        : "已提取签到信息，请对照原图核对后确认。");
  }

  async function load(loadFile: (signal: AbortSignal) => Promise<File>) {
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
      const file = await loadFile(request.signal);
      if (!request.signal.aborted) await inspect(file, request);
    } catch (cause) {
      if (!request.signal.aborted) setError(cause instanceof Error ? cause.message : "读取失败，请重试。");
    } finally {
      if (!request.signal.aborted) setBusy(false);
    }
  }

  function choose(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) void load(async () => file);
  }

  function chooseSample(alternate = false) {
    void load(async (signal) => {
      const name = alternate ? "checkin-a02-alt.png" : "checkin-a02.png";
      const response = await fetch(`/samples/${name}`, { signal });
      if (!response.ok) throw new Error("读取演示截图失败。");
      return new File([await response.blob()], name, { type: "image/png" });
    });
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || reportScope === "event") return;
    const count = /^\d+$/.test(value) ? Number(value) : Number.NaN;
    if (!row || !Number.isSafeInteger(count) || count > row.registered) {
      setError("请选择记录并输入不超过报名人数的非负整数。");
      return;
    }
    save(target, count, attachment);
  }

  return (
    <Modal title="补录签到" close={close} wide>
      <form onSubmit={submit}>
        <div className="modal-body">
          <div className="scan-grid">
            <div className="scan-source">
              {attachment ? (
                <div className="image-preview">
                  {/* A browser-local upload has no server URL to optimize. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={attachment.url} alt="签到截图原图" />
                  <button type="button" className="icon-button remove-photo" aria-label="移除截图" disabled={busy} onClick={() => {
                    setAttachment(undefined);
                    setReportScope(null);
                    setMessage("");
                    setError("");
                  }}><X size={16} /></button>
                </div>
              ) : (
                <label className="file-drop photo-drop">
                  <FileImage size={27} /><span>上传签到截图</span><small>PNG 或 JPG · 最大 4 MB</small>
                  <input type="file" accept="image/png,image/jpeg" onChange={choose} disabled={busy} />
                </label>
              )}
              <div className="scan-actions">
                {attachment && <label className="button secondary file-button"><Upload size={15} />更换图片
                  <input type="file" accept="image/png,image/jpeg" onChange={choose} disabled={busy} />
                </label>}
                {showSample && (
                  <>
                    <button type="button" className="button secondary" onClick={() => chooseSample()} disabled={busy}>载入示例截图</button>
                    <button type="button" className="button plain" onClick={() => chooseSample(true)} disabled={busy}>另一张示例</button>
                  </>
                )}
              </div>
            </div>
            <div className="scan-fields">
              <div className="scan-state" aria-live="polite">
                {busy ? <LoaderCircle size={16} className="spinning" /> : <ScanLine size={16} />}
                {busy ? "处理截图中…" : canScan ? "截图识别与核对" : "手动核对"}
              </div>
              <label className="field">活动与渠道
                <select value={target} disabled={busy} onChange={(event) => {
                  setTarget(event.target.value);
                  if (!attachment) setValue(rows.find((item) => recordKey(item) === event.target.value)?.attended?.toString() ?? "");
                  setError("");
                }}>
                  <option value="">选择对应记录</option>
                  {rows.map((item) => <option key={recordKey(item)} value={recordKey(item)}>{item.eventId} · {item.eventName} · {item.channel}</option>)}
                </select>
              </label>
              <label className="field">到场人数
                <input type="number" inputMode="numeric" min={0} max={row?.registered} step={1} value={value} disabled={busy}
                  onChange={(event) => { setValue(event.target.value); setError(""); }} placeholder="输入核对后的到场数" required />
              </label>
              {row && <p className="muted">报名 {row.registered} 人 · 当前到场 {row.attended ?? "待补录"}</p>}
              {message && <p className="field-note" role="status">{message}</p>}
              {error && <p className="form-error" role="alert">{error}</p>}
            </div>
          </div>
        </div>
        <div className="modal-actions">
          <button type="button" className="button secondary" onClick={close}>取消</button>
          <button type="submit" className="button primary" disabled={busy || !target || value === "" || reportScope === "event"}>确认补录</button>
        </div>
      </form>
    </Modal>
  );
}

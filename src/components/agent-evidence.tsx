"use client";

import { useState } from "react";
import { Check, ExternalLink, FileText, LoaderCircle, X } from "lucide-react";
import { safeWebUrl, type AgentDocument, type WebSource } from "@/lib/agent-documents";
import type { LedgerProposal } from "@/lib/ledger-proposal";
import type { AiTurn } from "./use-ai-conversation";

export function DocumentAttachments({ documents, remove }: { documents?: AgentDocument[]; remove?: (id: string) => void }) {
  if (!documents?.length) return null;
  return <div className="agent-documents">{documents.map((doc) => <div className="agent-document" key={doc.id}>
    <details><summary><FileText size={15} /><span>{doc.name}</span><small>{doc.pageCount} 页{doc.partial ? " · 文字不完整" : ""}</small></summary>
      <pre>{doc.text}</pre></details>
    {remove && <button type="button" className="icon-button" aria-label={`移除文件：${doc.name}`} onClick={() => remove(doc.id)}><X size={14} /></button>}
  </div>)}</div>;
}

export function WebSources({ sources }: { sources?: WebSource[] }) {
  const valid = sources?.filter((source) => safeWebUrl(source.url));
  if (!valid?.length) return null;
  return <section className="agent-web-sources" aria-label="网页来源"><h3>网页来源</h3>{valid.map((source, index) =>
    <a key={source.url} href={source.url} target="_blank" rel="noopener noreferrer"><span>{index + 1}</span><div><strong>{source.title || new URL(source.url).hostname}</strong>
      <small>{source.siteName || new URL(source.url).hostname}{source.date ? ` · ${source.date.slice(0, 10)}` : ""}</small></div><ExternalLink size={13} /></a>)}</section>;
}

function ChangedValue({ before, after, existed }: { before: string | number | null | undefined; after: string | number | null; existed: boolean }) {
  const value = (entry: typeof before) => entry === null || entry === undefined ? "未记录" : String(entry);
  return existed && before !== after ? <span className="agent-changed-value"><del>{value(before)}</del><strong>{value(after)}</strong></span> : <span>{value(after)}</span>;
}

export function LedgerProposalCard({ turn, proposal, stale, disabled, apply, cancel }: {
  turn: AiTurn; proposal: LedgerProposal; stale: boolean; disabled: boolean;
  apply: (turn: AiTurn) => Promise<void>; cancel: (turn: AiTurn) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const pending = proposal.status === "pending";
  async function confirm() {
    if (saving || disabled || stale || !pending) return;
    setSaving(true); setError("");
    try { await apply(turn); } catch (error) { setError(error instanceof Error ? error.message : "保存失败，请重试。"); }
    finally { setSaving(false); }
  }
  return <section className="agent-ledger-proposal card" aria-label="活动变更预览">
    <header><h3>{proposal.title}</h3><span className={`pill ${pending ? "neutral" : proposal.status === "applied" ? "success" : "neutral"}`}>
      {pending ? "待确认" : proposal.status === "applied" ? "已写入台账" : "已取消"}</span></header>
    <div className="table-scroll"><table className="data-table"><thead><tr><th>活动</th><th>日期</th><th>渠道</th><th>报名</th><th>实到</th></tr></thead>
      <tbody>{proposal.changes.map(({ before, after }) => <tr key={`${after.eventId}:${after.channel}`}>
        <td><small>{after.eventId} · {before ? "修改" : "新增"}</small><ChangedValue before={before?.eventName} after={after.eventName} existed={!!before} />
          <small><ChangedValue before={before?.category} after={after.category} existed={!!before} /></small></td>
        <td><ChangedValue before={before?.date} after={after.date} existed={!!before} /></td><td>{after.channel}</td>
        <td><ChangedValue before={before?.registered} after={after.registered} existed={!!before} /></td>
        <td><ChangedValue before={before?.attended} after={after.attended} existed={!!before} /></td>
      </tr>)}</tbody></table></div>
    {pending && stale && <p className="muted">台账已更新，请重新生成变更。</p>}
    {error && <p className="form-error" role="alert">{error}</p>}
    {pending && <footer><button type="button" className="button secondary small-button" disabled={saving || disabled} onClick={() => cancel(turn)}>取消变更</button>
      <button type="button" className="button primary small-button" disabled={saving || disabled || stale} onClick={() => void confirm()}>
        {saving ? <LoaderCircle size={15} className="spinning" /> : <Check size={15} />}确认写入</button></footer>}
  </section>;
}

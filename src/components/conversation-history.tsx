"use client";

import { useState } from "react";
import { LoaderCircle, MessageSquare, Search, Trash2 } from "lucide-react";
import { Modal } from "./modal";
import { conversationTitle, type AiConversation } from "./use-ai-conversation";

type HistoryProps = {
  threads: AiConversation[];
  selected: string;
  select: (id: string) => void;
  remove: (id: string) => Promise<boolean>;
};

const dateFormat = new Intl.DateTimeFormat("zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

function dateGroup(timestamp: number) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.floor((today.getTime() - timestamp) / 86400000);
  return days < 0 ? "今天" : days < 1 ? "昨天" : days < 7 ? "近七天" : "更早";
}

export function ConversationList({ threads, selected, select, remove, compact = false, query = "" }: HistoryProps & { compact?: boolean; query?: string }) {
  const [confirmId, setConfirmId] = useState("");
  const [pending, setPending] = useState("");
  const [error, setError] = useState("");
  const search = query.trim().toLocaleLowerCase();
  const matching = threads.filter((thread) => thread.turns.length && (!search || thread.turns.some(({ question }) => question.toLocaleLowerCase().includes(search))));
  let group = "";

  async function erase(id: string) {
    setPending(id);
    setError("");
    const deleted = await remove(id);
    setPending("");
    if (deleted) setConfirmId("");
    else setError("删除失败，请重试。");
  }

  return <div className={`conversation-list ${compact ? "conversation-list-compact" : ""}`}>
    {!matching.length && <p className="conversation-empty">{search ? "没有找到相关对话" : "还没有对话记录"}</p>}
    {matching.map((thread) => {
      const label = dateGroup(thread.updatedAt);
      const showGroup = label !== group;
      group = label;
      const title = conversationTitle(thread);
      const running = thread.turns.some(({ status }) => status === "running");
      return <div key={thread.id}>
        {showGroup && <h3 className="conversation-date-group">{label}</h3>}
        <div className={`conversation-row ${selected === thread.id ? "conversation-row-selected" : ""}`}>
          <div className="conversation-row-main">
            <button type="button" className="conversation-open" aria-current={selected === thread.id ? "true" : undefined}
              title={title} onClick={() => select(thread.id)} disabled={pending === thread.id}>
              {running ? <LoaderCircle size={15} className="spinning" aria-label="执行中" /> : <MessageSquare size={15} aria-hidden="true" />}
              <span><strong>{title}</strong>{!compact && <small>{thread.turns.length} 轮对话 · <time dateTime={new Date(thread.updatedAt).toISOString()}>{dateFormat.format(thread.updatedAt)}</time></small>}</span>
            </button>
            <button type="button" className="icon-button conversation-delete" aria-label={`删除对话：${title}`} title="删除对话"
              aria-expanded={confirmId === thread.id} disabled={!!pending} onClick={() => { setConfirmId(confirmId === thread.id ? "" : thread.id); setError(""); }}><Trash2 size={14} /></button>
          </div>
          {confirmId === thread.id && <div className="conversation-confirm" role="group" aria-label={`确认删除：${title}`}>
            <p>删除这段对话及全部消息？</p>
            <div><button type="button" className="button secondary small-button" disabled={!!pending} onClick={() => setConfirmId("")}>取消</button>
              <button type="button" className="button small-button conversation-confirm-delete" disabled={!!pending} onClick={() => void erase(thread.id)}>
                {pending === thread.id && <LoaderCircle size={13} className="spinning" />}确认删除</button></div>
            {error && <p className="form-error" role="alert">{error}</p>}
          </div>}
        </div>
      </div>;
    })}
  </div>;
}

export function ConversationHistory({ close, ...props }: HistoryProps & { close: () => void }) {
  const [query, setQuery] = useState("");
  return <Modal title="对话历史" close={close}>
    <div className="modal-body conversation-history-body">
      <label className="conversation-search"><Search size={16} aria-hidden="true" />
        <input type="search" aria-label="搜索对话" placeholder="搜索对话" value={query} onChange={(event) => setQuery(event.target.value)} autoFocus />
      </label>
      <ConversationList {...props} query={query} select={(id) => { props.select(id); close(); }} />
    </div>
  </Modal>;
}

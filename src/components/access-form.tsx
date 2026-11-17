"use client";

import Image from "next/image";
import { useState, type FormEvent } from "react";
import { ArrowRight, LoaderCircle, LockKeyhole } from "lucide-react";
import clubMark from "@/app/icon.png";
import "./access.css";

export function AccessForm({ configured }: { configured: boolean }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !configured) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/access/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "暂时无法验证，请重试。");
      window.location.replace("/");
    } catch (error) {
      setError(error instanceof Error ? error.message : "网络连接失败，请重试。");
      setBusy(false);
    }
  }

  return <main className="access-page">
    <section className="access-card" aria-labelledby="access-title">
      <div className="access-brand"><Image src={clubMark} width={44} height={44} alt="" unoptimized /><span>社团复盘</span></div>
      <div className="access-heading"><LockKeyhole size={21} /><h1 id="access-title">进入工作台</h1></div>
      <p className="access-description">请输入访问密码。</p>
      <form onSubmit={submit}>
        <label htmlFor="access-password">访问密码</label>
        <input id="access-password" type="password" autoComplete="current-password" autoFocus maxLength={256} required
          value={password} disabled={busy || !configured} onChange={(event) => setPassword(event.target.value)} />
        {!configured && <p className="form-error" role="alert">访问尚未开通，请联系管理员。</p>}
        {error && <p className="form-error" role="alert">{error}</p>}
        <button type="submit" className="button primary" disabled={busy || !configured || !password}>
          {busy ? <LoaderCircle className="spinning" size={16} /> : <ArrowRight size={16} />}{busy ? "正在验证" : "进入"}
        </button>
      </form>
    </section>
  </main>;
}

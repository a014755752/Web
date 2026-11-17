"use client";

import { useEffect, useState } from "react";
import { LogOut } from "lucide-react";
import "./access.css";

export function AccessControls() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function check() {
      try {
        const response = await fetch("/api/access/session", { cache: "no-store" });
        if (response.status === 401 || response.status === 503) window.location.replace("/login");
      } catch { /* A network failure does not imply that the session expired. */ }
    }
    const timer = window.setInterval(() => void check(), 60_000);
    const focus = () => void check();
    window.addEventListener("focus", focus);
    void check();
    return () => { clearInterval(timer); window.removeEventListener("focus", focus); };
  }, []);

  async function logout() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/access/logout", { method: "POST" });
      if (!response.ok) throw new Error();
      window.location.replace("/login");
    } catch { setBusy(false); setError("退出失败，请重试。"); }
  }

  return <><button type="button" className="button secondary access-exit" onClick={() => void logout()} disabled={busy}>
    <LogOut size={16} />{busy ? "正在退出" : "退出访问"}
  </button>{error && <p className="form-error" role="alert">{error}</p>}</>;
}

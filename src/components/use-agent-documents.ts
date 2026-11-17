"use client";

import { useEffect, useRef, useState } from "react";
import { documentSchema, MAX_DOCUMENT_BYTES, type AgentDocument } from "@/lib/agent-documents";

export function useAgentDocuments() {
  const [documents, setDocuments] = useState<AgentDocument[]>([]);
  const [uploading, setUploading] = useState("");
  const [error, setError] = useState("");
  const active = useRef<AbortController | null>(null);
  useEffect(() => () => active.current?.abort(), []);

  async function upload(files: File[]) {
    if (active.current || !files.length) return;
    if (documents.length + files.length > 3) { setError("每次最多上传 3 个文件。"); return; }
    const request = new AbortController();
    active.current = request;
    setError("");
    const next = [...documents];
    try {
      for (const file of files) {
        if (file.size === 0 || file.size > MAX_DOCUMENT_BYTES) throw new Error("请选择 20 MB 以内的文件。");
        if (!/\.(pdf|docx?|pptx?|png|jpe?g|webp|gif|bmp|tiff?)$/i.test(file.name)) throw new Error("支持 PDF、Word、PPT 和图片。");
        setUploading(file.name);
        const form = new FormData();
        form.set("file", file);
        const response = await fetch("/api/documents/ocr", { method: "POST", body: form, signal: request.signal });
        const body = await response.json() as { document?: unknown; error?: string };
        if (!response.ok) throw new Error(body.error || "文件识别失败。");
        const parsed = documentSchema.safeParse(body.document);
        if (!parsed.success) throw new Error("识别结果不完整，请重试。");
        if (next.reduce((size, doc) => size + doc.text.length, 0) + parsed.data.text.length > 48000) throw new Error("本次文件文字过多，请分次发送。");
        next.push(parsed.data);
        setDocuments([...next]);
      }
    } catch (error) {
      if (!request.signal.aborted) setError(error instanceof Error ? error.message : "文件识别未完成。");
    } finally {
      if (active.current === request) { active.current = null; setUploading(""); }
    }
  }

  return { documents, uploading, error, upload, remove: (id: string) => setDocuments((current) => current.filter((doc) => doc.id !== id)),
    clear: () => { setDocuments([]); setError(""); } };
}

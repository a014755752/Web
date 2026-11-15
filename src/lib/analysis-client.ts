import type { AnalysisEvent, AnalysisInput, AnalysisRun, AnalysisStep } from "./analysis-run";

export async function requestAnalysis(
  input: AnalysisInput,
  signal: AbortSignal,
  onStep: (step: AnalysisStep) => void,
): Promise<AnalysisRun> {
  const response = await fetch("/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    signal,
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(body?.error ?? "模型分析请求失败。");
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error("没有收到分析结果。");

  const decoder = new TextDecoder();
  let buffer = "";
  let run: AnalysisRun | null = null;
  function consume(line: string) {
    if (!line.trim()) return;
    const event = JSON.parse(line) as AnalysisEvent;
    if (event.type === "step") onStep(event.step);
    if (event.type === "result") run = event.run;
    if (event.type === "error") throw new Error(event.message);
  }

  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      lines.forEach(consume);
    }
    consume(buffer + decoder.decode());
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
  if (!run) throw new Error("分析未返回可用结果。");
  return run;
}

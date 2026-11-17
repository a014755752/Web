import { z } from "zod";
import type { AnalysisEvent, AnalysisStep } from "@/lib/analysis-run";
import { recordsSchema, scopeSchema } from "@/lib/attendance";
import { runActivityAgent } from "@/lib/server/activity-agent";
import { runComparisonAgent } from "@/lib/server/comparison-agent";
import { modelConfig, modelFailure } from "@/lib/server/model";

export const runtime = "nodejs";

const common = {
  question: z.string().trim().min(1).max(300),
  rows: recordsSchema,
  useRules: z.boolean(),
};
const inputSchema = z.union([
  z.object({ ...common, kind: z.literal("review").optional(), scope: scopeSchema, fixedScope: z.boolean().optional(), workflow: z.boolean().optional() }),
  z.object({ ...common, kind: z.literal("compare"), baselineId: z.string().trim().min(1).max(80), targetId: z.string().trim().min(1).max(80) })
    .refine(({ baselineId, targetId, rows }) => baselineId !== targetId &&
      rows.some(({ eventId }) => eventId === baselineId) && rows.some(({ eventId }) => eventId === targetId)),
]);
const requestLimit = 1_500_000;

export async function POST(request: Request) {
  const config = modelConfig();
  if (!config) return Response.json({ error: "模型尚未配置。" }, { status: 503 });
  if (Number(request.headers.get("content-length")) > requestLimit) {
    return Response.json({ error: "活动数据超过请求大小限制。" }, { status: 413 });
  }

  const body = await request.text().catch(() => "");
  if (body.length > requestLimit) return Response.json({ error: "活动数据超过请求大小限制。" }, { status: 413 });
  let data: unknown;
  try {
    data = JSON.parse(body);
  } catch {
    return Response.json({ error: "分析请求格式有误。" }, { status: 400 });
  }
  const parsed = inputSchema.safeParse(data);
  if (!parsed.success) return Response.json({ error: "请核对问题、日期范围和活动记录。" }, { status: 400 });

  const cancellation = new AbortController();
  const timeout = AbortSignal.timeout(48_000);
  const signal = AbortSignal.any([request.signal, cancellation.signal, timeout]);
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (event: AnalysisEvent) => {
        if (!cancellation.signal.aborted && !request.signal.aborted) {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        }
      };

      try {
        const onStep = (step: AnalysisStep) => emit({ type: "step", step });
        const result = parsed.data.kind === "compare"
          ? await runComparisonAgent(parsed.data, config, signal, onStep)
          : await runActivityAgent(parsed.data, config, signal, onStep);
        emit({ type: "result", run: result });
      } catch (error) {
        emit({
          type: "error",
          message: timeout.aborted ? "模型分析超时。" : modelFailure(error, "模型暂时无法完成分析，请稍后重试。"),
        });
      } finally {
        if (!cancellation.signal.aborted) controller.close();
      }
    },
    cancel() {
      cancellation.abort();
    },
  });

  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
}

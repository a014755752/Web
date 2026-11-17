import { MAX_DOCUMENT_BYTES } from "@/lib/agent-documents";
import { DeepSeekToolError, recognizeDocument, recognizedDocumentFile } from "@/lib/server/deepseek-tools";
import { modelConfig } from "@/lib/server/model";

export const runtime = "nodejs";
export const maxDuration = 180;

export async function POST(request: Request) {
  const config = modelConfig();
  if (!config?.deepseek) return Response.json({ error: "请先在服务端配置 DeepSeek API。" }, { status: 503 });
  if (Number(request.headers.get("content-length")) > MAX_DOCUMENT_BYTES + 65536) return Response.json({ error: "请选择 20 MB 以内的文件。" }, { status: 413 });
  const data = await request.formData().catch(() => null);
  const file = data?.get("file");
  if (!(file instanceof File) || file.size === 0 || file.size > MAX_DOCUMENT_BYTES) return Response.json({ error: "请选择 20 MB 以内的文档或图片。" }, { status: 400 });
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!recognizedDocumentFile(file.name, bytes)) return Response.json({ error: "文件内容或格式不符，请上传 PDF、Word、PPT 或支持的图片。" }, { status: 400 });
  try {
    const document = await recognizeDocument(file, config, AbortSignal.any([request.signal, AbortSignal.timeout(180000)]));
    return Response.json({ document }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof DeepSeekToolError ? error.message : "文件识别未完成，请稍后重试或拆分文件。" },
      { status: error instanceof DeepSeekToolError ? error.status : 502 });
  }
}

import { z } from "zod";
import { safeWebUrl, type AgentDocument, type WebSource } from "../agent-documents";
import type { ModelConfig } from "./model";

export class DeepSeekToolError extends Error {
  constructor(message: string, readonly status = 502) { super(message); }
}

function serviceError(status: number, message: string) {
  if (/password.protected/i.test(message)) return "文件有打开密码，请移除密码后上传。";
  if (/1000 pages|1000 页/i.test(message)) return "文件超过 1,000 页，请拆分后上传。";
  if (/could not be parsed|not supported|could not be decoded/i.test(message)) return "文件无法解析，请检查文件或转换格式后上传。";
  if (/did not finish|180 seconds/i.test(message)) return "文件识别超时，请拆分为更小的文件。";
  return ({ 400: "工具请求无法处理，请核对文件或网址。", 401: "DeepSeek 工具认证失败。", 402: "DeepSeek 账户额度不足。",
    403: "该网页无法抓取，请换一个来源。", 404: "未获取到网页内容或该工具接口暂不可用。", 408: "上传或读取超时，请重试。",
    413: "文件超过服务大小限制，请拆分后上传。", 429: "DeepSeek 工具繁忙，请稍后重试。", 503: "DeepSeek 工具服务暂时不可用。",
    504: "DeepSeek 工具超时，请稍后重试。" } as Record<number, string>)[status] ?? "DeepSeek 工具暂时无法完成请求，请稍后重试。";
}

async function requestTool(config: ModelConfig, endpoint: "search" | "fetch" | "ocr", body: object | FormData, signal: AbortSignal) {
  if (!config.deepseek) throw new DeepSeekToolError("此工具需要配置 DeepSeek API。", 503);
  const multipart = body instanceof FormData;
  const response = await fetch(`https://api.deepseek.com/v1/tools/${endpoint}`, {
    method: "POST", headers: { Authorization: `Bearer ${config.key}`, ...(multipart ? {} : { "Content-Type": "application/json" }) },
    body: multipart ? body : JSON.stringify(body), signal, cache: "no-store",
  });
  const data = await response.json().catch(() => null);
  const error = z.object({ error: z.object({ message: z.string().optional() }) }).safeParse(data);
  // OCR can return an error object after the response has already started with HTTP 200.
  if (!response.ok || error.success) throw new DeepSeekToolError(serviceError(response.ok ? 502 : response.status,
    error.success ? error.data.error.message ?? "" : ""), response.ok ? 502 : response.status);
  return data;
}

const searchSchema = z.object({ results: z.array(z.object({
  title: z.string(), url: z.string(), snippet: z.string().optional(), summary: z.string().optional(), content: z.string().optional(),
  site_name: z.string().nullish(), date: z.string().nullish(),
})) });

export async function searchWeb(query: string, config: ModelConfig, signal: AbortSignal) {
  const data = searchSchema.parse(await requestTool(config, "search", { query, count: 5, need_content: true }, signal));
  return data.results.flatMap((result) => {
    const url = safeWebUrl(result.url);
    if (!url) return [];
    const source: WebSource = { title: result.title.slice(0, 240), url, snippet: (result.snippet || result.summary || "").slice(0, 800),
      siteName: result.site_name ?? undefined, date: result.date ?? undefined };
    return [{ ...source, summary: (result.summary ?? "").slice(0, 1800), content: (result.content ?? "").slice(0, 4500) }];
  });
}

export async function fetchWebpage(value: string, config: ModelConfig, signal: AbortSignal) {
  const url = safeWebUrl(value);
  if (!url) throw new DeepSeekToolError("请输入可公开访问的 HTTP 或 HTTPS 网页地址。", 400);
  const data = z.object({ title: z.string(), content: z.string() }).parse(await requestTool(config, "fetch", { url }, signal));
  return { url, title: data.title.slice(0, 240), content: data.content.slice(0, 20000), partial: data.content.length > 20000 };
}

export function recognizedDocumentFile(name: string, bytes: Uint8Array) {
  const extension = name.toLowerCase().split(".").at(-1);
  const starts = (magic: number[]) => magic.every((byte, index) => bytes[index] === byte);
  if (extension === "pdf") return starts([0x25, 0x50, 0x44, 0x46, 0x2d]);
  if (["docx", "pptx"].includes(extension ?? "")) return starts([0x50, 0x4b, 0x03, 0x04]);
  if (["doc", "ppt"].includes(extension ?? "")) return starts([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
  if (extension === "png") return starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (["jpg", "jpeg"].includes(extension ?? "")) return starts([0xff, 0xd8, 0xff]);
  if (extension === "webp") return starts([0x52, 0x49, 0x46, 0x46]) && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
  if (extension === "gif") return starts([0x47, 0x49, 0x46, 0x38]);
  if (extension === "bmp") return starts([0x42, 0x4d]);
  return ["tif", "tiff"].includes(extension ?? "") && (starts([0x49, 0x49, 0x2a, 0]) || starts([0x4d, 0x4d, 0, 0x2a]));
}

const ocrSchema = z.object({ page_count: z.number().int().min(1).max(1000), pages: z.array(z.object({
  index: z.number().int().min(0), text: z.string(), finish_reason: z.enum(["stop", "length"]),
})).min(1).max(1000) }).refine((data) => data.page_count === data.pages.length);

export async function recognizeDocument(file: File, config: ModelConfig, signal: AbortSignal): Promise<AgentDocument> {
  const form = new FormData();
  form.set("file", file, file.name);
  form.set("purpose", "text_recognition");
  const data = ocrSchema.parse(await requestTool(config, "ocr", form, signal));
  const text = [...data.pages].sort((a, b) => a.index - b.index).map(({ index, text }) =>
    `[第 ${index + 1} 页]\n${text.replace(/<｜box｜>[\s\S]*?<｜\/box｜>/gu, "").replace(/<｜\/?ref｜>/gu, "").trim()}`).join("\n\n");
  if (!data.pages.some((page) => page.text.trim())) throw new DeepSeekToolError("未识别到文字，请检查文件清晰度。", 422);
  return { id: crypto.randomUUID(), name: file.name.slice(0, 200), source: "DeepSeek OCR", pageCount: data.page_count,
    text: text.slice(0, 24000), partial: text.length > 24000 || data.pages.some((page) => page.finish_reason === "length") };
}

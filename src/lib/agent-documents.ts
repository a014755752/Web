import { z } from "zod";

export const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;
export const DOCUMENT_ACCEPT = ".pdf,.doc,.docx,.ppt,.pptx,.png,.jpg,.jpeg,.webp,.gif,.bmp,.tif,.tiff";
export const documentSchema = z.object({
  id: z.string().min(1).max(80), name: z.string().min(1).max(200),
  pageCount: z.number().int().min(1).max(1000),
  text: z.string().min(1).max(24000), partial: z.boolean(), source: z.literal("DeepSeek OCR"),
});
export type AgentDocument = z.infer<typeof documentSchema>;
export type WebSource = { title: string; url: string; snippet: string; siteName?: string; date?: string };

export function safeWebUrl(value: string) {
  if (!URL.canParse(value)) return null;
  const url = new URL(value);
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) return null;
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") ||
      /^(?:127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(host) ||
      host === "::1" || host === "::" || /^(?:fc|fd|fe[89ab])[\da-f]*:/i.test(host) || host.startsWith("::ffff:")) return null;
  return url.href;
}

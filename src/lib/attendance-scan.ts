import { z } from "zod";

export const scanResultSchema = z.object({
  eventId: z.string().trim().min(1).max(80).nullable(),
  channel: z.string().trim().min(1).max(80).nullable(),
  attended: z.number().int().min(0).max(1_000_000).nullable(),
  scope: z.enum(["channel", "event", "unclear"]),
});

export type ScanResult = z.infer<typeof scanResultSchema>;
export type ScanSource = "DeepSeek Flash" | "DeepSeek OCR" | "视觉模型" | "本地 OCR";

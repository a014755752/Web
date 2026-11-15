import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

export function modelConfig() {
  const key = process.env.MODEL_API_KEY?.trim() || process.env.DASHSCOPE_API_KEY?.trim();
  if (!key) return null;

  const baseURL = (process.env.MODEL_BASE_URL?.trim() || "https://dashscope.aliyuncs.com/compatible-mode/v1").replace(/\/+$/, "");
  const dashscope = /(?:dashscope(?:-intl)?|maas)\.aliyuncs\.com(?:\/|$)/i.test(baseURL);
  return {
    key,
    baseURL,
    dashscope,
    text: process.env.MODEL_TEXT?.trim() || "qwen-plus",
    vision: process.env.MODEL_VISION?.trim() || "qwen3-vl-plus",
    embedding: process.env.MODEL_EMBEDDING?.trim() || "text-embedding-v4",
  };
}

export type ModelConfig = NonNullable<ReturnType<typeof modelConfig>>;

export function createModel(config: ModelConfig) {
  return createOpenAICompatible({
    name: "campus-club",
    baseURL: config.baseURL,
    apiKey: config.key,
    supportsStructuredOutputs: false,
    transformRequestBody: (body) => (
      config.dashscope && typeof body.model === "string" && body.model.startsWith("qwen")
        ? { ...body, enable_thinking: false }
        : body
    ),
  });
}

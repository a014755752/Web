import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { APICallError } from "ai";

export function modelConfig() {
  const deepSeekKey = process.env.DEEPSEEK_API_KEY?.trim();
  const compatibleKey = process.env.MODEL_API_KEY?.trim();
  const dashScopeKey = process.env.DASHSCOPE_API_KEY?.trim();
  const defaultURL = deepSeekKey ? "https://api.deepseek.com" : "https://dashscope.aliyuncs.com/compatible-mode/v1";
  const baseURL = (process.env.MODEL_BASE_URL?.trim() || defaultURL).replace(/\/+$/, "");
  if (!URL.canParse(baseURL)) return null;
  const { hostname, protocol } = new URL(baseURL);
  const deepseek = protocol === "https:" && hostname === "api.deepseek.com";
  const dashscope = /^(?:dashscope(?:-intl)?|maas)\.aliyuncs\.com$/i.test(hostname);
  const key = deepseek ? deepSeekKey || compatibleKey : compatibleKey || dashScopeKey;
  if (!key) return null;

  return {
    key,
    baseURL,
    deepseek,
    dashscope,
    text: process.env.MODEL_TEXT?.trim() || (deepseek ? "deepseek-flash" : "qwen-plus"),
    vision: process.env.MODEL_VISION?.trim() || (deepseek ? "deepseek-flash" : "qwen3-vl-plus"),
    embedding: deepseek ? null : process.env.MODEL_EMBEDDING?.trim() || "text-embedding-v4",
  };
}

export type ModelConfig = NonNullable<ReturnType<typeof modelConfig>>;

export function createModel(config: ModelConfig) {
  return createOpenAICompatible({
    name: "campus-club",
    baseURL: config.baseURL,
    apiKey: config.key,
    supportsStructuredOutputs: false,
    transformRequestBody: (body) => {
      if (config.deepseek) return { ...body, thinking: { type: "disabled" } };
      if (config.dashscope && typeof body.model === "string" && body.model.startsWith("qwen")) {
        return { ...body, enable_thinking: false };
      }
      return body;
    },
  });
}

export function modelFailure(error: unknown, fallback: string) {
  if (!APICallError.isInstance(error)) return fallback;
  switch (error.statusCode) {
    case 401:
    case 403: return "模型服务拒绝认证，请检查密钥权限。";
    case 402: return "模型额度不足，请检查账户余额。";
    case 429: return "模型服务请求过多，请稍后重试。";
    default: return fallback;
  }
}

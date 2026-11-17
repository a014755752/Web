import { ReviewApp } from "@/components/review-app";
import { modelConfig } from "@/lib/server/model";

export const dynamic = "force-dynamic";

export default function Page() {
  const config = modelConfig();
  const modelLabel = config?.deepseek && config.text === "deepseek-flash" ? "DeepSeek Flash" : config?.text;
  return <ReviewApp modelConfigured={!!config} modelLabel={modelLabel} />;
}

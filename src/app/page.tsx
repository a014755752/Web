import { ReviewApp } from "@/components/review-app";
import { modelConfig } from "@/lib/server/model";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { accessCookie, validAccessSession } from "@/lib/server/access";

export const dynamic = "force-dynamic";

export default async function Page() {
  if (!validAccessSession((await cookies()).get(accessCookie)?.value)) redirect("/login");
  const config = modelConfig();
  const modelLabel = config?.deepseek && config.text === "deepseek-flash" ? "DeepSeek Flash" : config?.text;
  return <ReviewApp modelConfigured={!!config} modelLabel={modelLabel} />;
}

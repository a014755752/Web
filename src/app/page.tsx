import { ReviewApp } from "@/components/review-app";
import { modelConfig } from "@/lib/server/model";

export const dynamic = "force-dynamic";

export default function Page() {
  return <ReviewApp modelConfigured={Boolean(modelConfig())} />;
}

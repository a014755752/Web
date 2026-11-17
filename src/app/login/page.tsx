import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AccessForm } from "@/components/access-form";
import { accessConfigured, accessCookie, validAccessSession } from "@/lib/server/access";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (validAccessSession((await cookies()).get(accessCookie)?.value)) redirect("/");
  return <AccessForm configured={accessConfigured()} />;
}

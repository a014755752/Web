import { NextResponse } from "next/server";
import { accessCookie, sameOrigin, secureCookie } from "@/lib/server/access";

export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "请求来源不允许。" }, { status: 403 });
  const response = NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  response.cookies.set(accessCookie, "", { httpOnly: true, sameSite: "strict", secure: secureCookie(request), path: "/", maxAge: 0 });
  return response;
}

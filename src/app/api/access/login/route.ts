import { NextResponse } from "next/server";
import { accessConfigured, accessCookie, createAccessSession, passwordMatches, sameOrigin, secureCookie, sessionSeconds } from "@/lib/server/access";

export const runtime = "nodejs";
const attempts = globalThis as typeof globalThis & { campusAccessFailures?: number[] };
const windowMs = 5 * 60 * 1000;
const maxFailures = 20;

export async function POST(request: Request) {
  const headers = { "Cache-Control": "no-store" };
  if (!sameOrigin(request)) return NextResponse.json({ error: "请求来源不允许。" }, { status: 403, headers });
  if (!accessConfigured()) return NextResponse.json({ error: "服务端尚未配置访问密码，请联系管理员。" }, { status: 503, headers });
  const now = Date.now();
  const failures = (attempts.campusAccessFailures ?? []).filter((time) => now - time < windowMs);
  attempts.campusAccessFailures = failures;
  if (failures.length >= maxFailures) {
    return NextResponse.json({ error: "密码尝试过多，请稍后再试。" },
      { status: 429, headers: { ...headers, "Retry-After": String(Math.ceil((failures[0] + windowMs - now) / 1000)) } });
  }
  if (Number(request.headers.get("content-length")) > 2048) return NextResponse.json({ error: "请求内容过长。" }, { status: 413, headers });
  const body = await request.text();
  let value: unknown;
  try { value = body.length <= 2048 ? JSON.parse(body) : null; } catch { value = null; }
  const password = value && typeof value === "object" && "password" in value ? value.password : null;
  if (typeof password !== "string" || !passwordMatches(password)) {
    failures.push(now);
    return NextResponse.json({ error: "密码不正确，请重新输入。" }, { status: 401, headers });
  }
  const response = NextResponse.json({ ok: true }, { headers });
  response.cookies.set(accessCookie, createAccessSession(), {
    httpOnly: true, sameSite: "strict", secure: secureCookie(request), path: "/", maxAge: sessionSeconds,
  });
  return response;
}

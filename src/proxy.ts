import { NextResponse, type NextRequest } from "next/server";
import { accessConfigured, accessCookie, sameOrigin, validAccessSession } from "@/lib/server/access";

export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const publicPath = path === "/login" || path === "/api/access/login" || path === "/api/access/logout";
  if (publicPath) return NextResponse.next();
  const authenticated = validAccessSession(request.cookies.get(accessCookie)?.value);
  if (!authenticated) {
    if (path.startsWith("/api/")) return NextResponse.json({ error: accessConfigured() ? "请先输入访问密码。" : "服务端尚未配置访问密码。" },
      { status: accessConfigured() ? 401 : 503, headers: { "Cache-Control": "no-store" } });
    return NextResponse.redirect(new URL("/login", request.url));
  }
  if (path.startsWith("/api/") && !["GET", "HEAD", "OPTIONS"].includes(request.method) && !sameOrigin(request)) {
    return NextResponse.json({ error: "请求来源不允许。" }, { status: 403 });
  }
  const response = NextResponse.next();
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const config = { matcher: ["/((?!_next/static|_next/image|icon.png|images/|ocr/).*)"] };

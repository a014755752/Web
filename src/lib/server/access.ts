import "server-only";

import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const accessCookie = "campus_access";
export const sessionSeconds = 8 * 60 * 60;

function credentials() {
  const password = process.env.ACCESS_PASSWORD ?? "";
  const secret = process.env.ACCESS_SESSION_SECRET ?? "";
  return password.length >= 8 && secret.length >= 32 ? { password, secret } : null;
}

export function accessConfigured() { return credentials() !== null; }

function equal(a: string, b: string) {
  return timingSafeEqual(createHash("sha256").update(a).digest(), createHash("sha256").update(b).digest());
}

export function passwordMatches(value: string) {
  const config = credentials();
  return !!config && equal(value, config.password);
}

function signature(payload: string) {
  const config = credentials();
  if (!config) return null;
  // Password changes also invalidate existing sessions.
  return createHmac("sha256", config.secret).update(config.password).update("\0").update(payload).digest("base64url");
}

export function createAccessSession() {
  const payload = `${Date.now() + sessionSeconds * 1000}.${randomBytes(24).toString("base64url")}`;
  const signed = signature(payload);
  if (!signed) throw new Error("Access password is not configured");
  return `${payload}.${signed}`;
}

export function validAccessSession(token?: string) {
  if (!token || token.length > 200) return false;
  const parts = token.split(".");
  if (parts.length !== 3 || !/^\d{13}$/.test(parts[0]) || !/^[A-Za-z0-9_-]{32}$/.test(parts[1])) return false;
  const expires = Number(parts[0]);
  const now = Date.now();
  if (expires <= now || expires > now + sessionSeconds * 1000) return false;
  const signed = signature(`${parts[0]}.${parts[1]}`);
  return !!signed && equal(parts[2], signed);
}

export function sameOrigin(request: Request) {
  if (request.headers.get("sec-fetch-site") === "cross-site") return false;
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try { return new URL(origin).host === (request.headers.get("host") || new URL(request.url).host); }
  catch { return false; }
}

export function secureCookie(request: Request) {
  return new URL(request.url).protocol === "https:" || request.headers.get("x-forwarded-proto") === "https";
}

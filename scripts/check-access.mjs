import assert from "node:assert/strict";
import { createHmac, randomBytes } from "node:crypto";
import { spawn } from "node:child_process";

// Run after npm run build. Uses isolated credentials and never calls a model.
const port = 3212;
const base = `http://127.0.0.1:${port}`;
const password = randomBytes(18).toString("base64url");
const secret = randomBytes(48).toString("base64url");
let child;
let output = "";

async function stop() {
  if (!child || child.exitCode !== null) return;
  const process = child;
  await new Promise((resolve) => { process.once("exit", resolve); process.kill(); });
}

async function start(accessPassword) {
  output = "";
  child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-H", "127.0.0.1", "-p", String(port)], {
    env: { ...process.env, ACCESS_PASSWORD: accessPassword, ACCESS_SESSION_SECRET: secret,
      DEEPSEEK_API_KEY: "access-test-placeholder", MODEL_BASE_URL: "https://api.deepseek.com", NEXT_TELEMETRY_DISABLED: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (data) => { output += data; });
  child.stderr.on("data", (data) => { output += data; });
  for (let index = 0; index < 100; index++) {
    if (child.exitCode !== null) throw new Error("Test server failed to start");
    if (output.includes("Ready in")) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Test server did not become ready");
}

function request(path, { method = "GET", cookie, origin, body, headers = {} } = {}) {
  return fetch(`${base}${path}`, { method, redirect: "manual", headers: {
    ...(cookie ? { Cookie: cookie } : {}), ...(origin ? { Origin: origin } : {}),
    ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...headers,
  }, body: body === undefined ? undefined : JSON.stringify(body) });
}

const login = (value, more = {}) => request("/api/access/login", { method: "POST", body: { password: value }, ...more });
const apiPaths = ["/api/analyze", "/api/attendance/scan", "/api/documents/ocr"];

try {
  await start(password);
  const entry = await request("/");
  assert.equal(entry.status, 307);
  assert.equal(new URL(entry.headers.get("location"), base).pathname, "/login");
  assert.equal((await request("/login")).status, 200);
  for (const path of apiPaths) {
    const response = await request(path, { method: "POST", body: {} });
    assert.equal(response.status, 401, path);
    assert.equal((await request(path, { method: "POST", body: {}, headers: { "x-middleware-subrequest": "proxy:proxy:proxy:proxy:proxy" } })).status, 401);
  }
  assert.equal((await login("incorrect-password")).status, 401);
  assert.equal((await login(password, { origin: "https://other.example" })).status, 403);
  assert.equal((await request("/api/access/session", { cookie: "campus_access=forged" })).status, 401);

  const signedIn = await login(password, { origin: base });
  assert.equal(signedIn.status, 200);
  const setCookie = signedIn.headers.get("set-cookie");
  assert.match(setCookie, /HttpOnly/i);
  assert.match(setCookie, /SameSite=strict/i);
  assert.match(setCookie, /Max-Age=28800/i);
  assert.ok(!setCookie.includes(password));
  const cookie = setCookie.split(";")[0];
  assert.equal((await request("/api/access/session", { cookie })).status, 200);
  assert.equal((await request("/", { cookie })).status, 200);
  assert.equal((await request("/api/analyze", { method: "POST", cookie, body: {} })).status, 400);
  assert.equal((await request("/api/analyze", { method: "POST", cookie, body: {}, origin: "https://other.example" })).status, 403);
  const secure = await login(password, { headers: { "x-forwarded-proto": "https" } });
  assert.match(secure.headers.get("set-cookie"), /; Secure/i);

  const payload = `${Date.now() - 1000}.${randomBytes(24).toString("base64url")}`;
  const expired = createHmac("sha256", secret).update(password).update("\0").update(payload).digest("base64url");
  assert.equal((await request("/api/access/session", { cookie: `campus_access=${payload}.${expired}` })).status, 401);
  const loggedOut = await request("/api/access/logout", { method: "POST", cookie, origin: base });
  assert.equal(loggedOut.status, 200);
  assert.match(loggedOut.headers.get("set-cookie"), /Max-Age=0/i);
  assert.equal((await request("/api/access/session")).status, 401);
  console.log("PASS: page gate, all AI API gates, valid login, forgery/expiry, CSRF, secure Cookie and logout");

  for (let index = 0; index < 19; index++) assert.equal((await login("wrong-password")).status, 401);
  const limited = await login("wrong-password");
  assert.equal(limited.status, 429);
  assert.ok(Number(limited.headers.get("retry-after")) > 0);
  console.log("PASS: repeated incorrect passwords are rate limited");

  await stop();
  await start(`${password}-changed`);
  assert.equal((await request("/api/access/session", { cookie })).status, 401);
  assert.equal((await login(password)).status, 401);
  assert.equal((await login(`${password}-changed`)).status, 200);
  console.log("PASS: changing the password invalidates previous sessions");

  await stop();
  await start("");
  assert.equal((await login(password)).status, 503);
  for (const path of apiPaths) assert.equal((await request(path, { method: "POST", body: {} })).status, 503);
  console.log("PASS: missing access configuration fails closed");
} finally { await stop(); }

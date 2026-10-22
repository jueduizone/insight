import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import jwt from "jsonwebtoken";
import pg from "pg";
import { postgresConfig } from "../src/server/postgres-config.mjs";
import { isPatchedRuntime } from "../src/server/runtime-security.mjs";

function assertNoPassword(value) {
  if (!value || typeof value !== "object") return;
  assert.equal(Object.hasOwn(value, "password_hash"), false, "Password hash disclosed");
  for (const nested of Object.values(value)) assertNoPassword(nested);
}

export async function verifyDeployment(origin, env = process.env) {
  const url = new URL(origin);
  assert.ok(url.protocol === "https:" || url.hostname === "127.0.0.1", "Use HTTPS for remote verification");
  for (const name of ["DATABASE_URL", "JWT_SECRET", "CRON_SECRET"]) {
    assert.ok(env[name], `${name} is required for read-only deployment verification`);
  }

  const checks = [];
  async function check(path, status = 200, options = {}) {
    const response = await fetch(new URL(path, url), {
      ...options,
      headers: {
        ...(env.PROTECTION_BYPASS_SECRET ? { "x-vercel-protection-bypass": env.PROTECTION_BYPASS_SECRET } : {}),
        ...options.headers,
      },
      redirect: "manual",
      signal: AbortSignal.timeout(45_000),
    });
    assert.equal(response.status, status, `${path}: unexpected HTTP status`);
    const text = await response.text();
    const body = response.headers.get("content-type")?.includes("application/json") ? JSON.parse(text) : text;
    checks.push({ path, status: response.status });
    return { body, headers: response.headers };
  }

  const publicHealth = await check("/api/health");
  assert.deepEqual(publicHealth.body, { status: "ok" });
  assert.match(publicHealth.headers.get("cache-control"), /no-store/);
  const { body: health } = await check("/api/health", 200, { headers: { Authorization: `Bearer ${env.CRON_SECRET}` } });
  assert.equal(health.runtime.patched, true);
  assert.equal(isPatchedRuntime(health.runtime.node), true);
  assert.equal(health.database.schema, "insight");
  assert.deepEqual((await check("/api/health", 200, { headers: { Authorization: "Bearer invalid" } })).body, { status: "ok" });
  await check("/api/health", 405, { method: "POST" });
  await check("/api/v1/stats", 401);
  await check("/api/v1/stats", 401, { headers: { Authorization: "Bearer invalid" } });
  await check("/api/cron/github", 401);

  const client = new pg.Client(postgresConfig(env.DATABASE_URL));
  let admin, event, database;
  try {
    await client.connect();
    assert.equal(client.connection.stream.encrypted, true);
    assert.equal(client.connection.stream.authorized, true);
    admin = (await client.query("SELECT id FROM users WHERE role = 'super_admin' AND deleted_at IS NULL LIMIT 1")).rows[0];
    event = (await client.query("SELECT event_id FROM activity_records GROUP BY event_id ORDER BY count(*) DESC LIMIT 1")).rows[0];
    database = (await client.query("SELECT current_schema() AS schema, (SELECT COUNT(*) FROM users)::int AS users, (SELECT COUNT(*) FROM activity_events)::int AS events, (SELECT COUNT(*) FROM activity_records)::int AS records")).rows[0];
    assert.equal(database.schema, "insight");
  } finally {
    await client.end();
  }
  assert.ok(admin, "No super-admin available for read-only verification");
  assert.ok(event, "No activity records available for nested-user verification");
  const token = jwt.sign({ uid: Number(admin.id) }, env.JWT_SECRET, { expiresIn: "2m" });
  const headers = { Authorization: `Bearer ${token}` };
  for (const path of [
    "/api/v1/stats", "/api/v1/users?page_size=2", "/api/v1/events?page_size=2",
    `/api/v1/events/${event.event_id}/records?page_size=2`, "/api/v1/operation-logs",
    "/api/v1/projects?page_size=2", "/api/v1/reports/weekly",
  ]) {
    const { body } = await check(path, 200, { headers });
    assert.equal(body.code, 200, `${path}: unexpected application code`);
    assertNoPassword(body);
  }
  for (const path of ["/", "/login", "/developers", "/activities", "/projects", "/operations", "/settings"]) {
    const { body } = await check(path);
    assert.ok(typeof body === "string" && body.includes("__NEXT_DATA__"), `${path}: missing Next page`);
  }
  const { body: login } = await check("/login");
  const assets = [...login.matchAll(/<script[^>]+src="([^\"]+)"/g)].map(match => match[1]);
  assert.ok(assets.length > 0, "Missing client JavaScript assets");
  for (const asset of assets) {
    assert.ok(asset.startsWith("/_next/"), "Unexpected client script origin");
    await check(asset);
  }
  return { origin: url.origin, runtime: health.runtime, database, checks, passed: true };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    console.log(JSON.stringify(await verifyDeployment(process.argv[2]), null, 2));
  } catch (error) {
    // Do not print connection or fetch errors that may embed credentials.
    console.error(error instanceof assert.AssertionError ? error.message : "Deployment verification failed; connection details suppressed");
    process.exitCode = 1;
  }
}

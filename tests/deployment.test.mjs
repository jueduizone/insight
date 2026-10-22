import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("Vercel routes all paths to the single pinned-runtime Next container", () => {
  const config = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));
  assert.deepEqual(Object.keys(config.services), ["web"]);
  assert.equal(config.services.web.runtime, "container");
  assert.equal(config.services.web.entrypoint, "Dockerfile.vercel");
  assert.deepEqual(config.rewrites, [{ source: "/(.*)", destination: { service: "web" } }]);
  assert.equal(config.crons.length, 5);
  assert.ok(config.crons.every(cron => cron.path.startsWith("/api/cron/")));
  const docker = readFileSync(new URL("../Dockerfile.vercel", import.meta.url), "utf8");
  assert.match(docker, /^FROM node:24\.22\.1-bookworm-slim@sha256:[a-f0-9]{64} AS base/m);
  assert.match(docker, /^USER node$/m);
  assert.match(docker, /node scripts\/check-runtime\.mjs && exec node server\.js/);
});

test("container build context excludes secrets and local build artifacts", () => {
  const ignore = readFileSync(new URL("../.dockerignore", import.meta.url), "utf8").trim().split("\n");
  for (const path of [".git", ".vercel", ".next", "node_modules", ".env*", ".keyrail*", "*.pem", "config.yaml", "insight"]) {
    assert.ok(ignore.includes(path), `${path} must not enter the container build context`);
  }
});

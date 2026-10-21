import assert from "node:assert/strict";
import { test } from "node:test";
import { X509Certificate } from "node:crypto";
import tls from "node:tls";
import { execFileSync } from "node:child_process";
import pg from "pg";
import { postgresConfig } from "../src/server/postgres-config.mjs";
import { isPatchedRuntime } from "../src/server/runtime-security.mjs";

test("only patched Node 24 releases satisfy the runtime requirement", () => {
  for (const version of ["20.11.1", "24.18.0", "24.22.0", "22.23.4", "24.22.1-rc.1", "invalid"]) {
    assert.equal(isPatchedRuntime(version), false, version);
  }
  for (const version of ["24.22.1", "v24.22.1", "24.22.2", "24.23.0"]) {
    assert.equal(isPatchedRuntime(version), true, version);
  }
  assert.equal(isPatchedRuntime(process.version), true);
});

test("URL parameters cannot turn off remote certificate verification or change schema", () => {
  for (const query of ["", "sslmode=require&channel_binding=require", "sslmode=disable", "sslmode=no-verify", "ssl=false", "sslmode=prefer&uselibpqcompat=true", "options=-c%20search_path%3Dpublic"]) {
    const client = new pg.Client(postgresConfig(`postgresql://user:placeholder@database.example/db?${query}`));
    assert.equal(client.connectionParameters.ssl.rejectUnauthorized, true, query);
    assert.equal(client.connectionParameters.options, "-c search_path=insight,public");
  }
});

test("localhost text in credentials or a remote hostname cannot disable TLS", () => {
  for (const url of [
    "postgresql://user:localhost@database.example/db",
    "postgresql://user:placeholder@localhost.example/db",
    "postgresql://user:placeholder@localhost/db?host=database.example",
  ]) {
    assert.equal(new pg.Client(postgresConfig(url)).connectionParameters.ssl.rejectUnauthorized, true);
  }
});

test("only exact loopback hosts support local non-TLS development", () => {
  for (const host of ["localhost", "127.0.0.1", "[::1]"]) {
    assert.equal(new pg.Client(postgresConfig(`postgresql://user:placeholder@${host}/db`)).connectionParameters.ssl, false);
  }
});

test("remote TLS actually rejects an untrusted certificate", async (t) => {
  const dir = execFileSync("mktemp", ["-d"]).toString().trim();
  const { readFile, rm } = await import("node:fs/promises");
  t.after(() => rm(dir, { recursive: true, force: true }));
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", `${dir}/key.pem`, "-out", `${dir}/cert.pem`, "-days", "1", "-subj", "/CN=untrusted.invalid"], { stdio: "ignore" });
  const server = tls.createServer({ key: await readFile(`${dir}/key.pem`), cert: await readFile(`${dir}/cert.pem`) });
  server.on("tlsClientError", () => {});
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const { ssl } = postgresConfig("postgresql://user:placeholder@remote.example/db?sslmode=disable");
  await assert.rejects(new Promise((resolve, reject) => {
    const socket = tls.connect({ ...ssl, host: "127.0.0.1", port: server.address().port, servername: "untrusted.invalid" }, () => { socket.end(); resolve(); });
    socket.on("error", reject);
  }), error => ["DEPTH_ZERO_SELF_SIGNED_CERT", "SELF_SIGNED_CERT_IN_CHAIN"].includes(error.code));
});

test("runtime CA bundle no longer includes the retired emSign roots", () => {
  const roots = tls.rootCertificates.map(pem => new X509Certificate(pem));
  // Node 24.22.1 keeps G1 and separately blocks compromised public keys.
  const removedRoots = /CN=emSign (Root CA - C1|ECC Root CA - C3|ECC Root CA - G3)(?:\n|$)/;
  assert.deepEqual(roots.filter(cert => removedRoots.test(cert.subject)).map(cert => cert.subject), []);
});

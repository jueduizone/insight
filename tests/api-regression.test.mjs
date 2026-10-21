import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import { test } from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
function loadTypeScript(path, imports = {}) {
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const exports = {};
  vm.runInNewContext(outputText, {
    exports, process: { env: {} }, Buffer,
    console: { error() {} },
    require: (id) => Object.hasOwn(imports, id) ? imports[id] : require(id),
  });
  return exports;
}

const http = loadTypeScript("../src/server/http.ts");
function api(overrides = {}) {
  return loadTypeScript("../src/server/apiHandlers.ts", {
    "./http": http,
    "./db": { one: async () => null, ...overrides.db },
    "./auth": {
      requireAuth: async () => ({ id: 1, role: "super_admin" }),
      requireSuperAdmin: async () => ({ id: 1, role: "super_admin" }),
      getUserByEmail: async () => null,
      hashPassword: async () => "hashed-test-password",
      ...overrides.auth,
    },
    "./ai": {}, "./integrations": {}, "./workers": {},
  }).handleApi;
}

async function request(handle, method, path, body = {}) {
  const res = { status(code) { this.code = code; return this; }, json(payload) { this.payload = payload; } };
  await handle({ method, body, headers: {}, query: {} }, res, path.split("/"));
  return res;
}

test("admin create, edit and password routes resolve their documented paths", async () => {
  const target = { id: 7, role: "admin", email: "test@example.com" };
  const updates = [];
  const handle = api({ db: {
    arrayParam: (value) => value ?? [], jsonParam: JSON.stringify,
    one: async (sql, params) => {
      if (sql.startsWith("SELECT")) { assert.equal(params[0], 7); return { ...target }; }
      updates.push({ sql, params });
      return { ...target };
    },
  } });
  const created = await request(handle, "POST", "v1/admin/users", { email: target.email, username: "test", password: "test-password" });
  assert.equal(created.code, 201);
  const edited = await request(handle, "PUT", "v1/admin/users/7", { email: target.email, username: "updated", role: "admin" });
  assert.equal(edited.code, 200);
  const password = await request(handle, "PUT", "v1/admin/users/7/password", { password: "new-test-password" });
  assert.equal(password.code, 200);
  assert.equal(updates.length, 3);
  assert.equal(updates[2].params[13], "hashed-test-password");
});

test("cron fails closed when no secret is configured", async () => {
  const res = await request(api(), "GET", "cron/github");
  assert.equal(res.code, 401);
});

test("unexpected server errors do not reveal internal details", async () => {
  const res = await request(api({ auth: { requireAuth: async () => { throw new Error("private database details"); } } }), "GET", "v1/stats");
  assert.equal(res.code, 500);
  assert.equal(res.payload.data, null);
  assert.equal(JSON.stringify(res.payload).includes("private database details"), false);
});

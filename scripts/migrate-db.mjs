import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";
import { postgresConfig } from "../src/server/postgres-config.mjs";
import { assertPatchedRuntime } from "../src/server/runtime-security.mjs";

assertPatchedRuntime();

const __dirname = dirname(fileURLToPath(import.meta.url));
const connectionString =
  process.env.DIRECT_DATABASE_URL ||
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL;

if (!connectionString) {
  console.error("DIRECT_DATABASE_URL or DATABASE_URL is required");
  process.exit(1);
}

const sql = await readFile(join(__dirname, "schema.sql"), "utf8");
const client = new pg.Client(postgresConfig(connectionString));

await client.connect();
try {
  await client.query(sql);
  console.log("Database schema is up to date");
} finally {
  await client.end();
}

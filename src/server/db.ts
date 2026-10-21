import { Pool, type QueryResult, type QueryResultRow } from "pg";
import { postgresConfig } from "./postgres-config.mjs";

declare global {
  var insightPgPool: Pool | undefined;
}

const connectionString =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_PRISMA_URL;

if (!connectionString && process.env.NODE_ENV !== "test") {
  // Keep module importable during build; actual API calls fail loudly below.
  console.warn("DATABASE_URL is not configured");
}

export const pool =
  globalThis.insightPgPool ??
  new Pool({
    ...postgresConfig(connectionString),
    max: Number(process.env.PGPOOL_MAX ?? 5),
    idleTimeoutMillis: 20_000,
    connectionTimeoutMillis: 10_000,
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.insightPgPool = pool;
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = []
): Promise<QueryResult<T>> {
  if (!connectionString) {
    throw new Error("DATABASE_URL is not configured");
  }
  return pool.query<T>(text, params);
}

export async function one<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = []
): Promise<T | null> {
  const result = await query<T>(text, params);
  return result.rows[0] ?? null;
}

export async function count(text: string, params: unknown[] = []): Promise<number> {
  const result = await one<{ count: string }>(text, params);
  return Number(result?.count ?? 0);
}

export function jsonParam(value: unknown) {
  return value == null ? null : JSON.stringify(value);
}

export function arrayParam(values: unknown) {
  return Array.isArray(values) ? values : [];
}

export function toSnakeUser(row: Record<string, unknown> | null) {
  if (!row) {
    return null;
  }
  const safe = { ...row };
  delete safe.password_hash;
  delete safe.deleted_at;
  return safe;
}

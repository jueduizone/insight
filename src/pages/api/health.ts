import { timingSafeEqual } from "node:crypto";
import type { NextApiRequest, NextApiResponse } from "next";
import { one } from "@/server/db";
import { assertPatchedRuntime, runtimeSecurity } from "@/server/runtime-security.mjs";

function canReadDetails(req: NextApiRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(req.headers.authorization ?? "");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.status(405).json({ status: "method_not_allowed" });
    return;
  }

  const details = canReadDetails(req);
  try {
    assertPatchedRuntime();
    const database = await one<{ schema: string }>("SELECT current_schema() AS schema");
    if (database?.schema !== "insight") throw new Error("Unexpected database schema");
    res.status(200).json({
      status: "ok",
      ...(details ? { runtime: runtimeSecurity(), database: { schema: database.schema } } : {}),
    });
  } catch {
    res.status(503).json({
      status: "unavailable",
      ...(details ? { runtime: runtimeSecurity() } : {}),
    });
  }
}

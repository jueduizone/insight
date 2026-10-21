import type { NextApiRequest, NextApiResponse } from "next";
import { handleApi } from "@/server/apiHandlers";
import { parsePath } from "@/server/http";
import { assertPatchedRuntime } from "@/server/runtime-security.mjs";

export const config = {
  api: {
    bodyParser: false,
    responseLimit: false,
  },
  maxDuration: 300,
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    assertPatchedRuntime();
  } catch {
    res.status(503).json({ code: 503, message: "Runtime security update required", data: null });
    return;
  }
  await handleApi(req, res, parsePath(req));
}

import type { NextApiRequest, NextApiResponse } from "next";

export type ApiResponse<T = unknown> = {
  code: number;
  message: string;
  data: T | null;
};

export class ApiError extends Error {
  statusCode: number;
  data: unknown;

  constructor(statusCode: number, message: string, data: unknown = null) {
    super(message);
    this.statusCode = statusCode;
    this.data = data;
  }
}

export function success<T>(
  res: NextApiResponse<ApiResponse<T>>,
  statusCode: number,
  message: string,
  data: T
) {
  res.status(statusCode).json({ code: 200, message, data });
}

export function failure(
  res: NextApiResponse<ApiResponse>,
  statusCode: number,
  message: string,
  data: unknown = null
) {
  res.status(statusCode).json({ code: 500, message, data: data ?? null });
}

export async function readJsonBody<T = Record<string, unknown>>(
  req: NextApiRequest
): Promise<T> {
  if (req.body && typeof req.body === "object") {
    return req.body as T;
  }

  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) {
    return {} as T;
  }
  try {
    return JSON.parse(raw) as T;
  } catch (err) {
    throw new ApiError(400, "Invalid request parameters", String(err));
  }
}

export function firstQueryValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }
  return value ?? "";
}

export function intQuery(
  value: string | string[] | undefined,
  fallback: number
): number {
  const parsed = Number.parseInt(firstQueryValue(value), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function boolQuery(value: string | string[] | undefined): boolean | null {
  const raw = firstQueryValue(value);
  if (!raw) {
    return null;
  }
  if (raw === "true") {
    return true;
  }
  if (raw === "false") {
    return false;
  }
  return null;
}

export function assertMethod(req: NextApiRequest, methods: string[]) {
  if (!methods.includes(req.method ?? "")) {
    throw new ApiError(405, "Method not allowed");
  }
}

export function parsePath(req: NextApiRequest): string[] {
  const path = req.query.path;
  if (Array.isArray(path)) {
    return path;
  }
  if (typeof path === "string") {
    return [path];
  }
  return [];
}

export function parseId(raw: string | undefined, label = "ID"): number {
  const id = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(id) || id <= 0) {
    throw new ApiError(400, `Invalid ${label}`);
  }
  return id;
}

export function normalizeDateInput(value: unknown): Date | null {
  if (!value) {
    return null;
  }
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date;
}

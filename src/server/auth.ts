import type { NextApiRequest } from "next";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { ApiError } from "./http";
import { one, query, toSnakeUser } from "./db";

export type AuthUser = {
  id: number;
  email: string;
  username: string;
  avatar: string;
  github: string;
  role: string;
};

type Claims = {
  uid: number;
  email: string;
  avatar: string;
  username: string;
  github: string;
};

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}

export async function checkPassword(password: string, hash: string | null) {
  if (!hash) {
    return false;
  }
  return bcrypt.compare(password, hash);
}

function jwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new ApiError(500, "JWT_SECRET is not configured");
  }
  return secret;
}

export function generateToken(user: AuthUser) {
  return jwt.sign(
    {
      uid: user.id,
      email: user.email,
      avatar: user.avatar,
      username: user.username,
      github: user.github,
    },
    jwtSecret(),
    { expiresIn: "7d" }
  );
}

export function verifyToken(token: string): Claims {
  try {
    return jwt.verify(token, jwtSecret()) as Claims;
  } catch {
    throw new ApiError(401, "Unauthorized");
  }
}

export async function requireAuth(req: NextApiRequest): Promise<AuthUser> {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    throw new ApiError(401, "Unauthorized");
  }
  const claims = verifyToken(header.slice("Bearer ".length));
  const result = await one<Record<string, unknown>>(
    "SELECT id, email, username, avatar, github, role FROM users WHERE id = $1 AND deleted_at IS NULL",
    [claims.uid]
  );
  if (!result) {
    throw new ApiError(401, "Unauthorized");
  }
  return {
    id: Number(result.id),
    email: String(result.email ?? ""),
    username: String(result.username ?? ""),
    avatar: String(result.avatar ?? ""),
    github: String(result.github ?? ""),
    role: String(result.role ?? "member"),
  };
}

export async function requireSuperAdmin(req: NextApiRequest) {
  const user = await requireAuth(req);
  if (user.role !== "super_admin") {
    throw new ApiError(403, "Permission denied");
  }
  return user;
}

export async function getUserByEmail(email: string) {
  return one<Record<string, unknown>>(
    "SELECT * FROM users WHERE lower(email) = lower($1) AND deleted_at IS NULL LIMIT 1",
    [email.trim()]
  );
}

export async function login(email: string, password: string) {
  const user = await getUserByEmail(email.trim());
  if (!user || !(await checkPassword(password, String(user.password_hash ?? "")))) {
    throw new ApiError(401, "Invalid email or password");
  }
  const authUser: AuthUser = {
    id: Number(user.id),
    email: String(user.email ?? ""),
    username: String(user.username ?? ""),
    avatar: String(user.avatar ?? ""),
    github: String(user.github ?? ""),
    role: String(user.role ?? "member"),
  };
  const token = generateToken(authUser);
  const safeUser = toSnakeUser(user) ?? {};
  return {
    ...safeUser,
    ID: safeUser.id,
    permissions: [authUser.role],
    token,
  };
}

export async function countUsersByRole(role: string) {
  const result = await query<{ count: string }>(
    "SELECT COUNT(*)::text AS count FROM users WHERE role = $1 AND deleted_at IS NULL",
    [role]
  );
  return Number(result.rows[0]?.count ?? 0);
}

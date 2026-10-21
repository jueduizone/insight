import fs from "node:fs/promises";
import type { NextApiRequest, NextApiResponse } from "next";
import formidable from "formidable";
import { parse as parseCsv } from "csv-parse/sync";
import {
  ApiError,
  assertMethod,
  boolQuery,
  failure,
  firstQueryValue,
  intQuery,
  normalizeDateInput,
  parseId,
  readJsonBody,
  success,
  type ApiResponse,
} from "./http";
import { arrayParam, count, jsonParam, one, query, toSnakeUser } from "./db";
import {
  checkPassword,
  countUsersByRole,
  getUserByEmail,
  hashPassword,
  login,
  requireAuth,
  requireSuperAdmin,
  type AuthUser,
} from "./auth";
import { analyzeEvent as callAnalyzeEvent, callKimi, generateProfile } from "./ai";
import {
  extractGitHubLogin,
  extractWeb3InsightID,
  fetchGitHubUser,
  fetchWeb3InsightUser,
  triggerWeb3InsightAnalysis,
} from "./integrations";
import {
  cleanProjectsBatch,
  collectGitHubBatch,
  computeActivityScores,
  generateProfilesBatch,
  syncWeb3InsightBatch,
} from "./workers";

type Res = NextApiResponse<ApiResponse>;

type MultipartPayload = {
  fields: Record<string, string>;
  filePath: string;
};

function requireFields(body: Record<string, unknown>, fields: string[]) {
  for (const field of fields) {
    if (!String(body[field] ?? "").trim()) {
      throw new ApiError(400, "Invalid request parameters", `${field} is required`);
    }
  }
}

function sqlBoolFilter(
  clauses: string[],
  _params: unknown[],
  value: boolean | null,
  whenTrue: string,
  whenFalse: string
) {
  if (value === true) {
    clauses.push(whenTrue);
  } else if (value === false) {
    clauses.push(whenFalse);
  }
}

async function parseMultipart(req: NextApiRequest): Promise<MultipartPayload> {
  const form = formidable({
    maxFileSize: 10 * 1024 * 1024,
    multiples: false,
  });
  const [fields, files] = await form.parse(req);
  const first = (value: string | string[] | undefined) =>
    Array.isArray(value) ? value[0] ?? "" : value ?? "";
  const fileValue = files.file;
  const file = Array.isArray(fileValue) ? fileValue[0] : fileValue;
  if (!file?.filepath) {
    throw new ApiError(400, "Missing CSV file");
  }
  return {
    fields: Object.fromEntries(
      Object.entries(fields).map(([key, value]) => [key, first(value)])
    ),
    filePath: file.filepath,
  };
}

async function readCsvRows(filePath: string) {
  const content = await fs.readFile(filePath);
  const records = parseCsv(content, {
    bom: true,
    relax_column_count: true,
    skip_empty_lines: true,
  }) as string[][];
  if (records.length === 0) {
    throw new ApiError(400, "CSV file is empty");
  }
  return {
    headers: records[0].map((header) => header.trim()),
    rows: records.slice(1),
  };
}

function valueGetter(
  headers: string[],
  mapping: Record<string, string>,
  row: string[]
) {
  const colIndex = new Map(headers.map((header, index) => [header.trim(), index]));
  return (field: string) => {
    const col = mapping[field];
    if (!col) {
      return "";
    }
    const idx = colIndex.get(col);
    if (idx == null || idx >= row.length) {
      return "";
    }
    return String(row[idx] ?? "").trim();
  };
}

function parseOptionalDate(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  for (const candidate of [
    trimmed,
    trimmed.replace(" ", "T"),
    `${trimmed}T00:00:00Z`,
  ]) {
    const date = new Date(candidate);
    if (!Number.isNaN(date.getTime())) {
      return date;
    }
  }
  return null;
}

async function updateUser(user: Record<string, unknown>) {
  const result = await one<Record<string, unknown>>(
    `UPDATE users SET
      email = $2,
      username = $3,
      avatar = $4,
      github = $5,
      twitter = $6,
      wechat = $7,
      telegram = $8,
      existing_projects = $9,
      intro = $10,
      monad_experience = $11,
      wallet_address = $12,
      role = $13,
      password_hash = $14,
      first_joined_at = $15,
      projects_raw = $16,
      projects_cleaned = $17,
      updated_at = NOW()
    WHERE id = $1 AND deleted_at IS NULL
    RETURNING *`,
    [
      user.id,
      user.email ?? "",
      user.username ?? "",
      user.avatar ?? "",
      user.github ?? "",
      user.twitter ?? "",
      user.wechat ?? "",
      user.telegram ?? "",
      user.existing_projects ?? "",
      user.intro ?? "",
      user.monad_experience ?? "",
      user.wallet_address ?? "",
      user.role ?? "member",
      user.password_hash ?? "",
      user.first_joined_at ?? null,
      user.projects_raw ?? "",
      user.projects_cleaned ?? false,
    ]
  );
  return result;
}

async function createUser(values: Record<string, unknown>) {
  return one<Record<string, unknown>>(
    `INSERT INTO users (
      created_at, updated_at, email, username, intro, monad_experience, avatar,
      github, twitter, wechat, telegram, existing_projects, wallet_address,
      tags, "group", github_stats, twitter_stats, notes, role, password_hash,
      activity_score, first_joined_at, projects_raw, projects_cleaned, extra_csv_data,
      web3insight_data, web3insight_id
    ) VALUES (
      NOW(), NOW(), $1, $2, $3, $4, $5,
      $6, $7, $8, $9, $10, $11,
      $12::text[], $13, $14::jsonb, $15::jsonb, $16, $17, $18,
      $19, $20, $21, $22, $23::jsonb,
      $24::jsonb, $25
    ) RETURNING *`,
    [
      values.email ?? "",
      values.username ?? "",
      values.intro ?? "",
      values.monad_experience ?? "",
      values.avatar ?? "",
      values.github ?? "",
      values.twitter ?? "",
      values.wechat ?? "",
      values.telegram ?? "",
      values.existing_projects ?? "",
      values.wallet_address ?? "",
      arrayParam(values.tags),
      values.group ?? "normal",
      jsonParam(values.github_stats ?? {}),
      jsonParam(values.twitter_stats ?? {}),
      values.notes ?? "",
      values.role ?? "member",
      values.password_hash ?? "",
      values.activity_score ?? 0,
      values.first_joined_at ?? null,
      values.projects_raw ?? "",
      values.projects_cleaned ?? false,
      jsonParam(values.extra_csv_data ?? {}),
      jsonParam(values.web3insight_data ?? {}),
      values.web3insight_id ?? "",
    ]
  );
}

async function getUserByID(id: number) {
  const user = await one<Record<string, unknown>>(
    "SELECT * FROM users WHERE id = $1 AND deleted_at IS NULL",
    [id]
  );
  if (!user) {
    throw new ApiError(404, "User not found");
  }
  return user;
}

async function handleLogin(req: NextApiRequest, res: Res) {
  assertMethod(req, ["POST"]);
  const body = await readJsonBody<Record<string, unknown>>(req);
  requireFields(body, ["email", "password"]);
  const data = await login(String(body.email), String(body.password));
  success(res, 200, "Login successful", data);
}

async function handleAdminUsers(req: NextApiRequest, res: Res, path: string[]) {
  const currentUser = await requireSuperAdmin(req);
  if (path.length === 2 && req.method === "POST") {
    const body = await readJsonBody<Record<string, unknown>>(req);
    requireFields(body, ["email", "username", "password"]);
    const passwordHash = await hashPassword(String(body.password));
    const existing = await getUserByEmail(String(body.email));
    if (existing) {
      if (existing.role === "admin" || existing.role === "super_admin") {
        throw new ApiError(409, "Admin user already exists");
      }
      existing.username = String(body.username);
      existing.password_hash = passwordHash;
      existing.role = "admin";
      const updated = await updateUser(existing);
      success(res, 200, "Existing developer promoted to admin", {
        id: updated?.id,
        created_at: updated?.created_at,
        email: updated?.email,
        username: updated?.username,
        role: updated?.role,
      });
      return;
    }
    const user = await createUser({
      email: String(body.email),
      username: String(body.username),
      password_hash: passwordHash,
      role: "admin",
    });
    success(res, 201, "Admin user created", {
      id: user?.id,
      created_at: user?.created_at,
      email: user?.email,
      username: user?.username,
      role: user?.role,
    });
    return;
  }

  const userID = parseId(path[2], "user ID");
  const target = await getUserByID(userID);
  if (target.role !== "admin" && target.role !== "super_admin") {
    throw new ApiError(400, "Only admin accounts can be edited here");
  }

  if (path.length === 3 && req.method === "PUT") {
    const body = await readJsonBody<Record<string, unknown>>(req);
    requireFields(body, ["email", "username", "role"]);
    const nextRole = String(body.role);
    if (nextRole !== "admin" && nextRole !== "super_admin") {
      throw new ApiError(400, "Invalid request parameters");
    }
    if (currentUser.id === Number(target.id) && nextRole !== "super_admin") {
      throw new ApiError(400, "Cannot remove your own super_admin role");
    }
    if (target.role === "super_admin" && nextRole !== "super_admin") {
      const total = await countUsersByRole("super_admin");
      if (total <= 1) {
        throw new ApiError(400, "At least one super_admin is required");
      }
    }
    const existing = await getUserByEmail(String(body.email));
    if (existing && Number(existing.id) !== userID) {
      throw new ApiError(409, "Email already exists");
    }
    target.email = String(body.email);
    target.username = String(body.username);
    target.role = nextRole;
    const updated = await updateUser(target);
    success(res, 200, "Admin user updated", {
      id: updated?.id,
      created_at: updated?.created_at,
      email: updated?.email,
      username: updated?.username,
      role: updated?.role,
    });
    return;
  }

  if (path.length === 4 && path[3] === "password" && req.method === "PUT") {
    const body = await readJsonBody<Record<string, unknown>>(req);
    requireFields(body, ["password"]);
    target.password_hash = await hashPassword(String(body.password));
    await updateUser(target);
    success(res, 200, "Password reset successfully", null);
    return;
  }

  throw new ApiError(404, "Not found");
}

async function handleUsers(req: NextApiRequest, res: Res, path: string[], auth: AuthUser) {
  if (path.length === 1 && req.method === "GET") {
    const page = Math.max(1, intQuery(req.query.page, 1));
    const pageSize = Math.max(1, intQuery(req.query.page_size, 10));
    const clauses = ["deleted_at IS NULL"];
    const params: unknown[] = [];
    const add = (sql: string, value: unknown) => {
      params.push(value);
      clauses.push(sql.replace("?", `$${params.length}`));
    };

    const username = firstQueryValue(req.query.username);
    if (username) {
      add("username ILIKE ?", `%${username}%`);
    }
    const rolesParam = firstQueryValue(req.query.roles);
    const role = firstQueryValue(req.query.role);
    if (rolesParam) {
      const roles = rolesParam.split(",").map((item) => item.trim()).filter(Boolean);
      params.push(roles);
      clauses.push(`role = ANY($${params.length})`);
    } else if (role) {
      add("role = ?", role);
    } else {
      clauses.push("role NOT IN ('admin', 'super_admin')");
    }
    const group = firstQueryValue(req.query.group);
    if (group) {
      add('"group" = ?', group);
    }
    sqlBoolFilter(
      clauses,
      params,
      boolQuery(req.query.has_github),
      "github IS NOT NULL AND github != ''",
      "github IS NULL OR github = ''"
    );
    sqlBoolFilter(
      clauses,
      params,
      boolQuery(req.query.has_profile),
      "notes IS NOT NULL AND notes != '' AND notes NOT LIKE '%数据不足%'",
      "notes IS NULL OR notes = '' OR notes LIKE '%数据不足%'"
    );
    const eventID = firstQueryValue(req.query.event_id);
    const eventStatus = firstQueryValue(req.query.event_status);
    if (eventID) {
      params.push(Number(eventID));
      const eventParam = `$${params.length}`;
      if (eventStatus) {
        params.push(eventStatus);
        clauses.push(
          `id IN (SELECT DISTINCT user_id FROM activity_records WHERE event_id = ${eventParam} AND status = $${params.length})`
        );
      } else {
        clauses.push(
          `id IN (SELECT DISTINCT user_id FROM activity_records WHERE event_id = ${eventParam})`
        );
      }
    }
    const where = `WHERE ${clauses.join(" AND ")}`;
    const sortMap: Record<string, string> = {
      activity_score: "activity_score",
      created_at: "created_at",
      updated_at: "updated_at",
      username: "username",
    };
    const sortBy = sortMap[firstQueryValue(req.query.sort_by)] ?? "activity_score";
    const order = firstQueryValue(req.query.order) === "asc" ? "ASC" : "DESC";
    const total = await count(`SELECT COUNT(*)::text AS count FROM users ${where}`, params);
    const users = await query<Record<string, unknown>>(
      `SELECT id, created_at, updated_at, email, username, intro, monad_experience, avatar, github, twitter, wechat, telegram, existing_projects, wallet_address, web3insight_id, web3insight_data, tags, "group", notes, role, activity_score, first_joined_at, projects_raw, projects_cleaned, projects_cleaned_at, github_stats
       FROM users ${where}
       ORDER BY ${sortBy} ${order} NULLS LAST
       OFFSET $${params.length + 1} LIMIT $${params.length + 2}`,
      [...params, (page - 1) * pageSize, pageSize]
    );
    success(res, 200, "Success", {
      users: users.rows.map(toSnakeUser),
      total,
      page,
      page_size: pageSize,
    });
    return;
  }

  if (path.length === 1 && req.method === "POST") {
    const body = await readJsonBody<Record<string, unknown>>(req);
    requireFields(body, ["email", "username"]);
    const existing = await getUserByEmail(String(body.email));
    if (existing) {
      throw new ApiError(409, "Email already exists");
    }
    const user = await createUser({
      email: String(body.email),
      username: String(body.username),
      avatar: body.avatar ?? "",
      github: body.github ?? "",
      twitter: body.twitter ?? "",
      role: "member",
    });
    success(res, 201, "User created successfully", toSnakeUser(user));
    return;
  }

  if (path[1] === "me" && path[2] === "password" && req.method === "PUT") {
    const body = await readJsonBody<Record<string, unknown>>(req);
    requireFields(body, ["old_password", "new_password"]);
    const user = await getUserByID(auth.id);
    if (!(await checkPassword(String(body.old_password), String(user.password_hash ?? "")))) {
      throw new ApiError(401, "Old password is incorrect");
    }
    user.password_hash = await hashPassword(String(body.new_password));
    await updateUser(user);
    success(res, 200, "Password changed successfully", null);
    return;
  }

  const userID = parseId(path[1], "ID");
  if (path.length === 2 && req.method === "GET") {
    const user = await getUserByID(userID);
    success(res, 200, "success", toSnakeUser(user));
    return;
  }
  if (path[2] === "activity" && req.method === "GET") {
    const records = await query<Record<string, unknown>>(
      `SELECT ar.*, row_to_json(ae.*) AS event
       FROM activity_records ar
       LEFT JOIN activity_events ae ON ae.id = ar.event_id
       WHERE ar.user_id = $1
       ORDER BY ar.created_at DESC`,
      [userID]
    );
    success(res, 200, "Success", records.rows);
    return;
  }
  if (path[2] === "generate-profile" && req.method === "POST") {
    const user = await getUserByID(userID);
    const records = await query<Record<string, unknown>>(
      `SELECT ar.*, ae.name AS event_name
       FROM activity_records ar
       LEFT JOIN activity_events ae ON ae.id = ar.event_id
       WHERE ar.user_id = $1`,
      [userID]
    );
    if (
      !user.github &&
      !user.intro &&
      !user.monad_experience &&
      !user.existing_projects &&
      records.rows.length === 0
    ) {
      throw new ApiError(400, "用户数据不足，无法生成画像");
    }
    const prompt = [
      `开发者信息：\n用户名: ${String(user.username ?? "")}\n邮箱: ${String(user.email ?? "")}`,
      user.github ? `GitHub: ${String(user.github)}` : "",
      user.intro ? `简介: ${String(user.intro)}` : "",
      user.monad_experience ? `Monad经验: ${String(user.monad_experience)}` : "",
      user.existing_projects ? `已有项目: ${String(user.existing_projects)}` : "",
      "\n参与活动记录：",
      ...records.rows.map(
        (record) =>
          `- 活动: ${String(record.event_name ?? "")}, 角色: ${String(record.role ?? "")}, 奖项: ${String(record.award ?? "")}, 状态: ${String(record.status ?? "")}`
      ),
    ]
      .filter(Boolean)
      .join("\n");
    const profile = await generateProfile(prompt);
    await query("UPDATE users SET notes = $1, updated_at = NOW() WHERE id = $2", [
      profile,
      userID,
    ]);
    success(res, 200, "Profile generated", { notes: profile });
    return;
  }
  if (path[2] === "sync-web3insight" && req.method === "POST") {
    const user = await getUserByID(userID);
    if (!user.github) {
      throw new ApiError(400, "User has no GitHub account linked");
    }
    const login = extractGitHubLogin(String(user.github));
    const result: Record<string, unknown> = {};
    let synced = false;
    try {
      const stats = await fetchGitHubUser(login);
      await query("UPDATE users SET github_stats = $1::jsonb WHERE id = $2", [
        jsonParam(stats),
        userID,
      ]);
      result.github_stats = stats;
      synced = true;
    } catch (err) {
      result.github_error = String(err);
    }
    try {
      const web3 = await fetchWeb3InsightUser(login);
      const raw = web3.found ? web3.raw : { status: "not_found", github_login: login };
      await query(
        "UPDATE users SET web3insight_id = COALESCE(NULLIF($1, ''), web3insight_id), web3insight_data = $2::jsonb WHERE id = $3",
        [extractWeb3InsightID(web3.data), jsonParam(raw), userID]
      );
      result.web3insight = web3.raw;
      result.web3insight_found = web3.found;
      synced = true;
    } catch (err) {
      result.web3insight_error = String(err);
    }
    if (!synced) {
      throw new ApiError(500, "Failed to fetch data from GitHub or Web3Insight");
    }
    success(res, 200, "Sync successful", result);
    return;
  }

  throw new ApiError(404, "Not found");
}

async function getProjectByID(id: number) {
  const project = await one<Record<string, unknown>>(
    "SELECT * FROM projects WHERE id = $1 AND deleted_at IS NULL",
    [id]
  );
  if (!project) {
    throw new ApiError(404, "Project not found");
  }
  return project;
}

async function handleProjects(req: NextApiRequest, res: Res, path: string[]) {
  if (path[1] === "hackathon" && path[2] === "import" && req.method === "POST") {
    const { fields, filePath } = await parseMultipart(req);
    const { headers, rows } = await readCsvRows(filePath);
    if ((fields.mode || "preview") === "preview") {
      success(res, 200, "Preview", { columns: headers, rows: rows.slice(0, 5) });
      return;
    }
    if (!fields.field_mapping) {
      throw new ApiError(400, "field_mapping is required for import mode");
    }
    const mapping = JSON.parse(fields.field_mapping) as Record<string, string>;
    const systemFields = new Set([
      "name",
      "description",
      "github",
      "site",
      "team_name",
      "members",
      "score",
      "rank",
      "status",
      "award_level",
      "tags",
      "event_id",
    ]);
    let created = 0;
    let updated = 0;
    for (const row of rows) {
      const get = valueGetter(headers, mapping, row);
      const name = get("name");
      if (!name) {
        continue;
      }
      const eventID = Number.parseInt(get("event_id"), 10) || 0;
      const tags = get("tags")
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean);
      const extra = Object.fromEntries(
        Object.entries(mapping)
          .filter(([field]) => !systemFields.has(field))
          .map(([field]) => [field, get(field)])
          .filter(([, value]) => value)
      );
      const existing = await one<Record<string, unknown>>(
        "SELECT * FROM projects WHERE name = $1 AND ($2::int = 0 OR event_id = $2) AND deleted_at IS NULL LIMIT 1",
        [name, eventID]
      );
      if (existing) {
        await query(
          `UPDATE projects SET description=$2, github=$3, site=$4, team_name=$5, members=$6, score=$7, rank=$8, status=$9, award_level=$10, tags=$11::text[], scores=$12::jsonb, updated_at=NOW()
           WHERE id=$1`,
          [
            existing.id,
            get("description"),
            get("github"),
            get("site"),
            get("team_name"),
            get("members"),
            Number.parseFloat(get("score")) || 0,
            Number.parseInt(get("rank"), 10) || 0,
            get("status"),
            get("award_level"),
            tags,
            jsonParam(extra),
          ]
        );
        updated += 1;
      } else {
        await query(
          `INSERT INTO projects (created_at, updated_at, name, description, github, site, tags, event_id, team_name, members, score, scores, rank, status, award_level)
           VALUES (NOW(), NOW(), $1, $2, $3, $4, $5::text[], $6, $7, $8, $9, $10::jsonb, $11, $12, $13)`,
          [
            name,
            get("description"),
            get("github"),
            get("site"),
            tags,
            eventID,
            get("team_name"),
            get("members"),
            Number.parseFloat(get("score")) || 0,
            jsonParam(extra),
            Number.parseInt(get("rank"), 10) || 0,
            get("status"),
            get("award_level"),
          ]
        );
        created += 1;
      }
    }
    success(res, 200, "Import complete", { created, updated });
    return;
  }

  if (path.length === 1 && req.method === "GET") {
    const page = Math.max(1, intQuery(req.query.page, 1));
    const pageSize = Math.max(1, intQuery(req.query.page_size, 10));
    const clauses = ["deleted_at IS NULL"];
    const params: unknown[] = [];
    const keyword = firstQueryValue(req.query.keyword);
    if (keyword) {
      params.push(`%${keyword}%`);
      clauses.push(`(name ILIKE $${params.length} OR description ILIKE $${params.length})`);
    }
    const tag = firstQueryValue(req.query.tag);
    if (tag) {
      params.push(tag);
      clauses.push(`$${params.length} = ANY(tags)`);
    }
    const where = `WHERE ${clauses.join(" AND ")}`;
    const total = await count(`SELECT COUNT(*)::text AS count FROM projects ${where}`, params);
    const projects = await query<Record<string, unknown>>(
      `SELECT * FROM projects ${where} ORDER BY created_at DESC OFFSET $${params.length + 1} LIMIT $${params.length + 2}`,
      [...params, (page - 1) * pageSize, pageSize]
    );
    success(res, 200, "Success", {
      projects: projects.rows,
      total,
      page,
      page_size: pageSize,
    });
    return;
  }
  if (path.length === 1 && req.method === "POST") {
    const body = await readJsonBody<Record<string, unknown>>(req);
    requireFields(body, ["name", "description"]);
    const project = await one<Record<string, unknown>>(
      `INSERT INTO projects (created_at, updated_at, name, description, github, site, cover_img, tags)
       VALUES (NOW(), NOW(), $1, $2, $3, $4, $5, $6::text[]) RETURNING *`,
      [
        body.name,
        body.description,
        body.github ?? "",
        body.site ?? "",
        body.cover_image ?? "",
        arrayParam(body.tags),
      ]
    );
    success(res, 201, "Project created successfully", project);
    return;
  }
  const projectID = parseId(path[1], "ID");
  if (path.length === 2 && req.method === "GET") {
    success(res, 200, "Success", await getProjectByID(projectID));
    return;
  }
  if (path.length === 2 && req.method === "PUT") {
    await getProjectByID(projectID);
    const body = await readJsonBody<Record<string, unknown>>(req);
    const project = await one<Record<string, unknown>>(
      `UPDATE projects SET
        name = COALESCE(NULLIF($2, ''), name),
        description = COALESCE(NULLIF($3, ''), description),
        github = $4,
        site = $5,
        tags = $6::text[],
        updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [
        projectID,
        body.name ?? "",
        body.description ?? "",
        body.github ?? "",
        body.site ?? "",
        arrayParam(body.tags),
      ]
    );
    success(res, 200, "Project updated", project);
    return;
  }
  if (path.length === 2 && req.method === "DELETE") {
    await query("UPDATE projects SET deleted_at = NOW() WHERE id = $1", [projectID]);
    success(res, 200, "Project deleted", null);
    return;
  }
  throw new ApiError(404, "Not found");
}

async function handleEvents(req: NextApiRequest, res: Res, path: string[]) {
  if (path.length === 1 && req.method === "GET") {
    const page = Math.max(1, intQuery(req.query.page, 1));
    const pageSize = Math.max(1, intQuery(req.query.page_size, 10));
    const params: unknown[] = [];
    let where = "";
    const name = firstQueryValue(req.query.name);
    if (name) {
      params.push(`%${name}%`);
      where = `WHERE name ILIKE $1`;
    }
    const total = await count(`SELECT COUNT(*)::text AS count FROM activity_events ${where}`, params);
    const events = await query<Record<string, unknown>>(
      `SELECT ae.*,
        COUNT(ar.id)::int AS participant_count,
        COUNT(ar.id) FILTER (WHERE ar.award != '')::int AS awarded_count
       FROM activity_events ae
       LEFT JOIN activity_records ar ON ar.event_id = ae.id
       ${where}
       GROUP BY ae.id
       ORDER BY ae.created_at DESC
       OFFSET $${params.length + 1} LIMIT $${params.length + 2}`,
      [...params, (page - 1) * pageSize, pageSize]
    );
    success(res, 200, "Success", {
      events: events.rows,
      total,
      page,
      page_size: pageSize,
    });
    return;
  }
  if (path.length === 1 && req.method === "POST") {
    const body = await readJsonBody<Record<string, unknown>>(req);
    requireFields(body, ["name"]);
    const event = await one<Record<string, unknown>>(
      `INSERT INTO activity_events (created_at, updated_at, name, type, platform, start_date, end_date, description)
       VALUES (NOW(), NOW(), $1, $2, $3, $4, $5, $6) RETURNING *`,
      [
        body.name,
        body.type ?? "",
        body.platform ?? "",
        normalizeDateInput(body.start_date),
        normalizeDateInput(body.end_date),
        body.description ?? "",
      ]
    );
    success(res, 201, "Event created", event);
    return;
  }
  const eventID = parseId(path[1], "ID");
  if (path.length === 2 && req.method === "GET") {
    const event = await one<Record<string, unknown>>(
      "SELECT * FROM activity_events WHERE id = $1",
      [eventID]
    );
    if (!event) {
      throw new ApiError(404, "Event not found");
    }
    success(res, 200, "Success", event);
    return;
  }
  if (path.length === 2 && req.method === "PUT") {
    const body = await readJsonBody<Record<string, unknown>>(req);
    const event = await one<Record<string, unknown>>(
      `UPDATE activity_events SET
       name = COALESCE(NULLIF($2, ''), name),
       type = $3,
       platform = $4,
       start_date = COALESCE($5, start_date),
       end_date = COALESCE($6, end_date),
       description = $7,
       updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [
        eventID,
        body.name ?? "",
        body.type ?? "",
        body.platform ?? "",
        normalizeDateInput(body.start_date),
        normalizeDateInput(body.end_date),
        body.description ?? "",
      ]
    );
    if (!event) {
      throw new ApiError(404, "Event not found");
    }
    success(res, 200, "Event updated", event);
    return;
  }
  if (path.length === 2 && req.method === "DELETE") {
    const records = await count(
      "SELECT COUNT(*)::text AS count FROM activity_records WHERE event_id = $1",
      [eventID]
    );
    if (records > 0) {
      throw new ApiError(400, "该活动已有参与者记录，无法删除");
    }
    await query("DELETE FROM activity_events WHERE id = $1", [eventID]);
    success(res, 200, "Event deleted", null);
    return;
  }
  if (path[2] === "records" && req.method === "GET") {
    const page = Math.max(1, intQuery(req.query.page, 1));
    const pageSize = Math.max(1, intQuery(req.query.page_size, 10));
    const total = await count(
      "SELECT COUNT(*)::text AS count FROM activity_records WHERE event_id = $1",
      [eventID]
    );
    const records = await query<Record<string, unknown>>(
      `SELECT ar.*, (to_jsonb(u) - 'password_hash' - 'deleted_at') AS user
       FROM activity_records ar
       LEFT JOIN users u ON u.id = ar.user_id
       WHERE ar.event_id = $1
       OFFSET $2 LIMIT $3`,
      [eventID, (page - 1) * pageSize, pageSize]
    );
    success(res, 200, "Success", { records: records.rows, total, page, page_size: pageSize });
    return;
  }
  if (path[2] === "import" && req.method === "POST") {
    await importEventCsv(req, res, eventID);
    return;
  }
  if (path[2] === "analysis" && req.method === "GET") {
    await analyzeEvent(req, res, eventID);
    return;
  }
  throw new ApiError(404, "Not found");
}

async function importEventCsv(req: NextApiRequest, res: Res, eventID: number) {
  const event = await one("SELECT id FROM activity_events WHERE id = $1", [eventID]);
  if (!event) {
    throw new ApiError(404, "Event not found");
  }
  const { fields, filePath } = await parseMultipart(req);
  const { headers, rows } = await readCsvRows(filePath);
  if ((fields.mode || "preview") === "preview") {
    success(res, 200, "Preview", { columns: headers, rows: rows.slice(0, 5) });
    return;
  }
  if (!fields.field_mapping) {
    throw new ApiError(400, "field_mapping is required for import mode");
  }
  const mapping = JSON.parse(fields.field_mapping) as Record<string, string>;
  const standardFields = new Set([
    "email",
    "username",
    "first_name",
    "last_name",
    "github",
    "wallet_address",
    "award",
    "role",
    "status",
    "wechat",
    "telegram",
    "existing_projects",
    "intro",
    "monad_experience",
    "joined_at",
  ]);
  let created = 0;
  let merged = 0;
  let recordCreated = 0;
  let recordUpdated = 0;
  const githubLogins: string[] = [];

  for (const row of rows) {
    const get = valueGetter(headers, mapping, row);
    const email = get("email");
    const github = get("github");
    const wallet = get("wallet_address");
    let username = get("username");
    if (!username && (get("last_name") || get("first_name"))) {
      username = `${get("last_name")} ${get("first_name")}`.trim();
    }
    if (!email && !github && !wallet && !username) {
      continue;
    }
    let existing =
      (email
        ? await one<Record<string, unknown>>(
            "SELECT * FROM users WHERE email = $1 AND deleted_at IS NULL",
            [email]
          )
        : null) ||
      (github
        ? await one<Record<string, unknown>>(
            "SELECT * FROM users WHERE github = $1 AND deleted_at IS NULL",
            [github]
          )
        : null) ||
      (wallet
        ? await one<Record<string, unknown>>(
            "SELECT * FROM users WHERE wallet_address = $1 AND deleted_at IS NULL",
            [wallet]
          )
        : null);
    const existingProjects = get("existing_projects");
    const joinedAt = parseOptionalDate(get("joined_at"));
    let userID: number;
    if (existing) {
      existing.email = email || existing.email;
      existing.username = username || existing.username;
      existing.github = github || existing.github;
      existing.wallet_address = wallet || existing.wallet_address;
      existing.wechat = get("wechat") || existing.wechat;
      existing.telegram = get("telegram") || existing.telegram;
      existing.existing_projects = existingProjects || existing.existing_projects;
      existing.intro = get("intro") || existing.intro;
      existing.monad_experience = get("monad_experience") || existing.monad_experience;
      if (existing.role !== "admin" && existing.role !== "super_admin") {
        existing.role = "member";
      }
      if (joinedAt && (!existing.first_joined_at || joinedAt < new Date(String(existing.first_joined_at)))) {
        existing.first_joined_at = joinedAt;
      }
      if (existingProjects.length > 30) {
        existing.projects_raw = existingProjects;
        existing.projects_cleaned = false;
      }
      existing = await updateUser(existing);
      userID = Number(existing?.id);
      merged += 1;
    } else {
      const user = await createUser({
        email,
        username,
        github,
        wallet_address: wallet,
        wechat: get("wechat"),
        telegram: get("telegram"),
        existing_projects: existingProjects,
        intro: get("intro"),
        monad_experience: get("monad_experience"),
        role: "member",
        first_joined_at: joinedAt,
        projects_raw: existingProjects.length > 30 ? existingProjects : "",
        projects_cleaned: false,
      });
      userID = Number(user?.id);
      created += 1;
    }

    const mappedStandardColumns = new Set(
      Object.entries(mapping)
        .filter(([field]) => standardFields.has(field))
        .map(([, column]) => column)
    );
    const extraData = Object.fromEntries(
      Object.entries(mapping)
        .filter(([field]) => !standardFields.has(field))
        .map(([field]) => [field, get(field)])
        .filter(([, value]) => value)
    );
    const extraCsv: Record<string, string> = {};
    headers.forEach((header, index) => {
      if (!mappedStandardColumns.has(header)) {
        const value = String(row[index] ?? "").trim();
        if (value) {
          extraCsv[header] = value;
        }
      }
    });
    if (Object.keys(extraCsv).length > 0) {
      await query(
        "UPDATE users SET extra_csv_data = COALESCE(extra_csv_data, '{}'::jsonb) || $1::jsonb WHERE id = $2",
        [jsonParam(extraCsv), userID]
      );
    }

    const upsert = await one<{ created: boolean }>(
      `WITH existing AS (
         SELECT id FROM activity_records WHERE user_id = $1 AND event_id = $2
       ), updated AS (
         UPDATE activity_records SET award = COALESCE(NULLIF($3, ''), award), role = COALESCE(NULLIF($4, ''), role), status = COALESCE(NULLIF($5, ''), status), extra_data = $6::jsonb, updated_at = NOW()
         WHERE id IN (SELECT id FROM existing)
         RETURNING false AS created
       ), inserted AS (
         INSERT INTO activity_records (created_at, updated_at, user_id, event_id, award, role, status, extra_data)
         SELECT NOW(), NOW(), $1, $2, $3, $4, $5, $6::jsonb
         WHERE NOT EXISTS (SELECT 1 FROM existing)
         RETURNING true AS created
       )
       SELECT created FROM inserted UNION ALL SELECT created FROM updated LIMIT 1`,
      [
        userID,
        eventID,
        get("award"),
        get("role"),
        get("status"),
        jsonParam(extraData),
      ]
    );
    if (upsert?.created) {
      recordCreated += 1;
    } else {
      recordUpdated += 1;
    }
    if (github) {
      githubLogins.push(github);
    }
  }

  let web3insightTriggered = githubLogins.length > 0;
  if (web3insightTriggered) {
    try {
      await triggerWeb3InsightAnalysis(githubLogins);
    } catch {
      web3insightTriggered = false;
    }
  }
  await cleanProjectsBatch(50);
  success(res, 200, "Import complete", {
    created,
    merged,
    record_created: recordCreated,
    record_updated: recordUpdated,
    web3insight_triggered: web3insightTriggered,
  });
}

async function suggestMapping(req: NextApiRequest, res: Res) {
  const body = await readJsonBody<{ columns?: string[] }>(req);
  if (!body.columns?.length) {
    throw new ApiError(400, "columns is required");
  }
  const columnsJSON = JSON.stringify(body.columns);
  const systemPrompt = `你是一个数据导入助手。请将 CSV 文件的列名映射到以下系统字段。

系统字段说明：
- email: 邮箱地址（主键，用于去重）
- last_name: 姓
- first_name: 名
- username: 完整姓名
- github: GitHub 用户名或链接
- wallet_address: 钱包地址（0x开头）
- twitter: Twitter/X 用户名
- wechat: 微信号
- telegram: Telegram 用户名
- existing_projects: 已有项目名称
- intro: 个人简介/描述
- monad_experience: Monad/Web3 经验描述
- award: 获奖情况
- role: 参与角色
- status: 参与状态`;
  const userPrompt =
    `CSV 列名列表：${columnsJSON}\n\n` +
    '严格按以下格式返回 JSON，key 必须是英文系统字段名，value 必须是对应的 CSV 列名原文。找不到对应的字段不要包含。只返回 JSON 对象，不要任何其他文字：\n{"email": "对应的CSV列名", "github": "对应的CSV列名", ...}';
  const content = await callKimi(systemPrompt, userPrompt);
  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");
  if (start === -1 || end <= start) {
    throw new ApiError(500, "Failed to parse AI response");
  }
  success(res, 200, "Success", JSON.parse(content.slice(start, end + 1)));
}

async function analyzeEvent(_req: NextApiRequest, res: Res, eventID: number) {
  const event = await one<Record<string, unknown>>(
    "SELECT * FROM activity_events WHERE id = $1",
    [eventID]
  );
  if (!event) {
    throw new ApiError(404, "Event not found");
  }
  const records = await query<Record<string, unknown>>(
    `SELECT ar.*, (to_jsonb(u) - 'password_hash' - 'deleted_at') AS user
     FROM activity_records ar
     LEFT JOIN users u ON u.id = ar.user_id
     WHERE ar.event_id = $1
     LIMIT 500`,
    [eventID]
  );
  const totalCount = records.rows.length;
  if (totalCount === 0) {
    success(res, 200, "Success", {
      event_id: event.id,
      event_name: event.name,
      total_count: 0,
      awarded_count: 0,
      role_dist: {},
      award_dist: {},
      report: "该活动暂无参与数据，无法生成分析报告。请先导入参与者数据后再试。",
    });
    return;
  }
  const roleDist: Record<string, number> = {};
  const awardDist: Record<string, number> = {};
  const samples: string[] = [];
  for (const record of records.rows) {
    if (record.role) {
      roleDist[String(record.role)] = (roleDist[String(record.role)] ?? 0) + 1;
    }
    if (record.award) {
      awardDist[String(record.award)] = (awardDist[String(record.award)] ?? 0) + 1;
    }
    const user = (record.user ?? {}) as Record<string, unknown>;
    if (samples.length < 60) {
      samples.push(
        [
          user.username ? `用户:${String(user.username)}` : "",
          user.github ? `GitHub:${String(user.github)}` : "",
          record.role ? `角色:${String(record.role)}` : "",
          record.award ? `获奖:${String(record.award)}` : "",
          user.intro ? `简介:${String(user.intro).slice(0, 90)}` : "",
          user.monad_experience
            ? `Monad经验:${String(user.monad_experience).slice(0, 90)}`
            : "",
          user.existing_projects
            ? `已有项目:${String(user.existing_projects).slice(0, 90)}`
            : "",
        ]
          .filter(Boolean)
          .join("；")
      );
    }
  }
  const awardedCount = Object.values(awardDist).reduce((sum, value) => sum + value, 0);
  const prompt = [
    `活动名称：${String(event.name ?? "")}`,
    `活动类型：${String(event.type ?? "")}`,
    `活动平台：${String(event.platform ?? "")}`,
    `活动描述：${String(event.description ?? "")}`,
    `参与人数：${totalCount}`,
    `获奖人数：${awardedCount}`,
    `角色分布：${JSON.stringify(roleDist)}`,
    `获奖情况：${JSON.stringify(awardDist)}`,
    "参与者样本：",
    ...samples,
  ].join("\n");
  const systemPrompt = `你是 Monad 生态开发者运营分析师。直接输出中文分析报告，不要有任何思考过程或前言。

报告格式（Markdown，严格按此输出）：
## 活动概览
## 参与数据
## 角色与获奖分布
## 人群与技能信号
## 协作机会
## 数据质量

要求：总字数不超过420字，必须基于给定原始字段，不编造具体姓名或项目；直接给结论，不废话。`;
  let report: string;
  try {
    report = await callAnalyzeEvent(systemPrompt, prompt);
  } catch {
    report = `## 活动概览\n${String(event.name ?? "")} 已导入 ${totalCount} 位参与者。\n\n## 参与数据\n- 参与人数：${totalCount}\n- 获奖人数：${awardedCount}\n\n## 角色与获奖分布\n角色分布：${JSON.stringify(roleDist)}；获奖分布：${JSON.stringify(awardDist)}。\n\n## 人群与技能信号\n建议补充 GitHub、项目和技能字段后继续分析。\n\n## 协作机会\n- 按角色和获奖情况分层跟进。\n\n## 数据质量\n如字段覆盖不足，建议重新导入保留原始表单列。`;
  }
  success(res, 200, "Success", {
    event_id: event.id,
    event_name: event.name,
    total_count: totalCount,
    awarded_count: awardedCount,
    role_dist: roleDist,
    award_dist: awardDist,
    report,
  });
}

async function handleOperationLogs(req: NextApiRequest, res: Res, auth: AuthUser) {
  if (req.method === "POST") {
    const body = await readJsonBody<Record<string, unknown>>(req);
    requireFields(body, ["target_type", "target_id", "content"]);
    const log = await one<Record<string, unknown>>(
      `INSERT INTO operation_logs (created_at, updated_at, target_type, target_id, admin_id, content)
       VALUES (NOW(), NOW(), $1, $2, $3, $4) RETURNING *`,
      [body.target_type, Number(body.target_id), auth.id, body.content]
    );
    success(res, 201, "Log created", log);
    return;
  }
  if (req.method === "GET") {
    const clauses: string[] = [];
    const params: unknown[] = [];
    const targetType = firstQueryValue(req.query.target_type);
    if (targetType) {
      params.push(targetType);
      clauses.push(`ol.target_type = $${params.length}`);
    }
    const targetID = firstQueryValue(req.query.target_id);
    if (targetID) {
      params.push(Number(targetID));
      clauses.push(`ol.target_id = $${params.length}`);
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const logs = await query<Record<string, unknown>>(
      `SELECT ol.*, (to_jsonb(u) - 'password_hash' - 'deleted_at') AS admin
       FROM operation_logs ol
       LEFT JOIN users u ON u.id = ol.admin_id
       ${where}
       ORDER BY ol.created_at DESC`,
      params
    );
    success(res, 200, "Success", logs.rows);
    return;
  }
  throw new ApiError(405, "Method not allowed");
}

async function statsResponse() {
  const start30d = new Date();
  start30d.setDate(start30d.getDate() - 30);
  const [
    totalUsers,
    newUsers7d,
    activeUsers,
    totalEvents,
    totalProjects,
    totalRecords,
    web3InsightCount,
    hasGithubCount,
    hasProfileCount,
  ] = await Promise.all([
    count("SELECT COUNT(*)::text AS count FROM users WHERE role = 'member' AND deleted_at IS NULL"),
    count(
      "SELECT COUNT(*)::text AS count FROM users WHERE role = 'member' AND created_at >= $1 AND deleted_at IS NULL",
      [start30d]
    ),
    count(
      "SELECT COUNT(*)::text AS count FROM users WHERE role = 'member' AND activity_score > 0 AND deleted_at IS NULL"
    ),
    count("SELECT COUNT(*)::text AS count FROM activity_events"),
    count("SELECT COUNT(*)::text AS count FROM projects WHERE deleted_at IS NULL"),
    count("SELECT COUNT(*)::text AS count FROM activity_records"),
    count(
      "SELECT COUNT(*)::text AS count FROM users WHERE role = 'member' AND ((web3insight_id IS NOT NULL AND web3insight_id != '' AND web3insight_id != 'not_found') OR (web3insight_data IS NOT NULL AND web3insight_data != '{}'::jsonb AND COALESCE(web3insight_data->>'status', '') NOT IN ('not_found', 'invalid_github'))) AND deleted_at IS NULL"
    ),
    count(
      "SELECT COUNT(*)::text AS count FROM users WHERE role = 'member' AND github != '' AND deleted_at IS NULL"
    ),
    count(
      "SELECT COUNT(*)::text AS count FROM users WHERE role = 'member' AND notes IS NOT NULL AND notes != '' AND notes NOT LIKE '%数据不足%' AND deleted_at IS NULL"
    ),
  ]);
  return {
    total_users: totalUsers,
    new_users_7d: newUsers7d,
    active_users: activeUsers,
    total_events: totalEvents,
    total_projects: totalProjects,
    total_records: totalRecords,
    web3insight_count: web3InsightCount,
    has_github_count: hasGithubCount,
    has_profile_count: hasProfileCount,
  };
}

async function weeklyReportData() {
  const end = new Date();
  const start = new Date(end);
  start.setDate(end.getDate() - 30);
  const summary = await statsResponse();
  const eventFunnel = await query<Record<string, unknown>>(
    `SELECT ae.id AS event_id, ae.name AS event_name, ae.type AS event_type, ae.platform, COUNT(ar.id)::int AS count
     FROM activity_events ae
     LEFT JOIN activity_records ar ON ar.event_id = ae.id
     GROUP BY ae.id, ae.name, ae.type, ae.platform
     ORDER BY count DESC`
  );
  const coverage = await query<Record<string, unknown>>(
    `SELECT
       COUNT(*) FILTER (WHERE role='member' AND github != '')::int AS github_count,
       COUNT(*) FILTER (WHERE role='member' AND twitter != '')::int AS twitter_count,
       COUNT(*) FILTER (WHERE role='member' AND (telegram != '' OR wechat != ''))::int AS telegram_count,
       COUNT(*) FILTER (WHERE role='member')::int AS total_users
     FROM users WHERE deleted_at IS NULL`
  );
  const coverageRow = coverage.rows[0] ?? {};
  const totalUsers = Number(coverageRow.total_users ?? 0);
  const contactCoverage = {
    ...coverageRow,
    github_pct: totalUsers ? (Number(coverageRow.github_count ?? 0) / totalUsers) * 100 : 0,
    twitter_pct: totalUsers ? (Number(coverageRow.twitter_count ?? 0) / totalUsers) * 100 : 0,
    telegram_pct: totalUsers
      ? (Number(coverageRow.telegram_count ?? 0) / totalUsers) * 100
      : 0,
  };
  const distribution = await query<Record<string, unknown>>(
    `SELECT * FROM (
       SELECT '0' AS range, COUNT(*)::int AS count FROM users WHERE role='member' AND activity_score = 0 AND deleted_at IS NULL
       UNION ALL SELECT '1-30', COUNT(*)::int FROM users WHERE role='member' AND activity_score >= 1 AND activity_score <= 30 AND deleted_at IS NULL
       UNION ALL SELECT '31-60', COUNT(*)::int FROM users WHERE role='member' AND activity_score >= 31 AND activity_score <= 60 AND deleted_at IS NULL
       UNION ALL SELECT '61-100', COUNT(*)::int FROM users WHERE role='member' AND activity_score > 60 AND deleted_at IS NULL
     ) buckets`
  );
  const trend = await query<Record<string, unknown>>(
    `SELECT TO_CHAR(created_at, 'YYYY-MM-DD') AS date, COUNT(*)::int AS count
     FROM users
     WHERE role = 'member' AND created_at >= $1 AND created_at <= $2 AND deleted_at IS NULL
     GROUP BY date
     ORDER BY date ASC`,
    [start, end]
  );
  return {
    period: {
      start: start.toISOString().slice(0, 10),
      end: end.toISOString().slice(0, 10),
      days: 30,
    },
    summary: {
      total_users: summary.total_users,
      new_users: summary.new_users_7d,
      active_users: summary.active_users,
      total_events: summary.total_events,
      total_records: summary.total_records,
    },
    event_funnel: eventFunnel.rows,
    retention: [],
    contact_coverage: contactCoverage,
    activity_distribution: distribution.rows,
    new_users_trend: trend.rows,
  };
}

async function handleReports(req: NextApiRequest, res: Res, path: string[]) {
  if (path[1] === "weekly" && req.method === "GET") {
    success(res, 200, "success", await weeklyReportData());
    return;
  }
  if (path[1] === "generate" && req.method === "GET") {
    const reportData = await weeklyReportData();
    const prompt = JSON.stringify(reportData);
    const report = await callKimi(
      "你是Monad生态运营分析师，根据提供的开发者社区运营数据，生成一份专业的中文周报，包含：数据概览、亮点分析、问题发现、运营建议，格式清晰，300字以内。",
      prompt
    );
    success(res, 200, "success", { report });
    return;
  }
  throw new ApiError(404, "Not found");
}

async function handleCron(req: NextApiRequest, res: Res, path: string[]) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) {
    throw new ApiError(401, "Unauthorized");
  }
  assertMethod(req, ["GET", "POST"]);
  const task = path[1];
  const result =
    task === "project-cleaner"
      ? await cleanProjectsBatch()
      : task === "github"
        ? await collectGitHubBatch()
        : task === "activity-score"
          ? await computeActivityScores()
          : task === "web3insight"
            ? await syncWeb3InsightBatch()
            : task === "profiles"
              ? await generateProfilesBatch()
              : null;
  if (!result) {
    throw new ApiError(404, "Cron task not found");
  }
  success(res, 200, "Cron task complete", result);
}

export async function handleApi(req: NextApiRequest, res: Res, path: string[]) {
  try {
    if (path[0] === "cron") {
      await handleCron(req, res, path);
      return;
    }
    if (path[0] !== "v1") {
      throw new ApiError(404, "Not found");
    }
    const route = path.slice(1);
    if (route[0] === "login") {
      await handleLogin(req, res);
      return;
    }

    const auth = await requireAuth(req);
    if (route[0] === "admin" && route[1] === "users") {
      await handleAdminUsers(req, res, route);
      return;
    }
    if (route[0] === "users") {
      await handleUsers(req, res, route, auth);
      return;
    }
    if (route[0] === "projects") {
      await handleProjects(req, res, route);
      return;
    }
    if (route[0] === "events") {
      await handleEvents(req, res, route);
      return;
    }
    if (route[0] === "operation-logs") {
      await handleOperationLogs(req, res, auth);
      return;
    }
    if (route[0] === "stats" && req.method === "GET") {
      success(res, 200, "success", await statsResponse());
      return;
    }
    if (route[0] === "reports") {
      await handleReports(req, res, route);
      return;
    }
    if (route[0] === "suggest-mapping" && req.method === "POST") {
      await suggestMapping(req, res);
      return;
    }
    throw new ApiError(404, "Not found");
  } catch (err) {
    if (err instanceof ApiError) {
      failure(res, err.statusCode, err.message, err.data);
      return;
    }
    console.error(err);
    failure(res, 500, "Internal server error");
  }
}

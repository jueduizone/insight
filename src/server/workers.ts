import { analyzeEvent, callKimi, generateProfile } from "./ai";
import { jsonParam, query } from "./db";
import {
  extractGitHubLogin,
  extractWeb3InsightID,
  fetchGitHubUser,
  fetchWeb3InsightUser,
} from "./integrations";

const insufficientDataMarker = "（数据不足，待补充）";

const noisePatterns = [
  "没有",
  "无",
  "none",
  "solo",
  "现场组队",
  "有一些",
  "随便",
  "待定",
  "n/a",
  "na",
  "暂无",
  "不知道",
  "还没有",
  "没想好",
  "无项目",
  "没项目",
  "自己",
  "独立",
];

function isNoiseContent(raw: string) {
  const value = raw.trim().toLowerCase();
  if (!value) {
    return true;
  }
  if (noisePatterns.includes(value)) {
    return true;
  }
  return (
    [...value].length <= 6 &&
    noisePatterns.some((pattern) => value.includes(pattern))
  );
}

export async function cleanProjectsBatch(limit = 50) {
  const users = await query<{ id: number; projects_raw: string }>(
    "SELECT id, projects_raw FROM users WHERE projects_cleaned = false AND projects_raw != '' AND deleted_at IS NULL LIMIT $1",
    [limit]
  );
  let processed = 0;
  for (const user of users.rows) {
    let cleaned = "";
    if (!isNoiseContent(user.projects_raw)) {
      try {
        cleaned = (
          await callKimi(
            "你是一个项目名称提取助手。",
            "从以下项目描述中提取真实项目名称。规则：\n" +
              "1. 如果没有真实项目名（例如：没有/无/none/solo/现场组队/有一些/随便/待定/N/A 等），只返回空字符串。\n" +
              "2. 如果有真实项目名，用英文逗号分隔返回所有项目名，不要其他文字。\n" +
              "描述：" +
              user.projects_raw
          )
        ).trim();
        if (isNoiseContent(cleaned)) {
          cleaned = "";
        }
      } catch {
        continue;
      }
    }
    await query(
      "UPDATE users SET existing_projects = $1, projects_cleaned = true, projects_cleaned_at = NOW(), updated_at = NOW() WHERE id = $2",
      [cleaned, user.id]
    );
    processed += 1;
  }
  return { processed };
}

export async function collectGitHubBatch(limit = 100) {
  const users = await query<{ id: number; github: string }>(
    "SELECT id, github FROM users WHERE github != '' AND deleted_at IS NULL LIMIT $1",
    [limit]
  );
  let processed = 0;
  let failed = 0;
  for (const user of users.rows) {
    const login = extractGitHubLogin(user.github);
    if (!login) {
      continue;
    }
    try {
      const stats = await fetchGitHubUser(login);
      await query(
        "UPDATE users SET github_stats = $1::jsonb, updated_at = NOW() WHERE id = $2",
        [jsonParam(stats), user.id]
      );
      processed += 1;
    } catch {
      failed += 1;
    }
  }
  return { processed, failed };
}

export async function syncWeb3InsightBatch(limit = 100) {
  const users = await query<{ id: number; github: string }>(
    "SELECT id, github FROM users WHERE github != '' AND (web3insight_id IS NULL OR web3insight_id = '') AND (web3insight_data IS NULL OR web3insight_data = '{}'::jsonb) AND role = 'member' AND deleted_at IS NULL LIMIT $1",
    [limit]
  );
  let synced = 0;
  let failed = 0;
  for (const user of users.rows) {
    const login = extractGitHubLogin(user.github);
    if (!login) {
      await query(
        "UPDATE users SET web3insight_data = $1::jsonb, updated_at = NOW() WHERE id = $2",
        [jsonParam({ status: "invalid_github", github_login: "" }), user.id]
      );
      synced += 1;
      continue;
    }
    try {
      const result = await fetchWeb3InsightUser(login);
      const raw = result.found
        ? result.raw
        : { status: "not_found", github_login: login };
      const web3InsightID = extractWeb3InsightID(result.data);
      await query(
        "UPDATE users SET web3insight_id = COALESCE(NULLIF($1, ''), web3insight_id), web3insight_data = $2::jsonb, updated_at = NOW() WHERE id = $3",
        [web3InsightID, jsonParam(raw), user.id]
      );
      synced += 1;
    } catch {
      failed += 1;
    }
  }
  return { synced, failed };
}

const techLangScores: Record<string, number> = {
  Rust: 5,
  Solidity: 5,
  TypeScript: 3,
  Go: 2,
  Python: 2,
};

export async function computeActivityScores() {
  const users = await query<{
    id: number;
    github_stats: Record<string, unknown> | null;
    projects_cleaned: boolean;
    existing_projects: string | null;
  }>(
    "SELECT id, github_stats, projects_cleaned, existing_projects FROM users WHERE deleted_at IS NULL"
  );
  const eventCounts = await query<{ user_id: number; event_count: string }>(
    "SELECT user_id, COUNT(DISTINCT event_id)::text AS event_count FROM activity_records GROUP BY user_id"
  );
  const countByUser = new Map(
    eventCounts.rows.map((row) => [Number(row.user_id), Number(row.event_count)])
  );

  let processed = 0;
  for (const user of users.rows) {
    let score = 0;
    const gs = user.github_stats ?? {};
    const githubScore = Math.min(
      40,
      Number(gs.total_commits_30d ?? 0) * 2 +
        Math.floor(Number(gs.followers ?? 0) / 10) +
        Math.floor(Number(gs.public_repos ?? 0) / 5)
    );
    score += githubScore;
    score += Math.min(25, Math.round(Number(gs.monad_commits ?? 0) / 20));
    const languages = Array.isArray(gs.languages) ? gs.languages : [];
    score += Math.min(
      15,
      languages.reduce(
        (sum, lang) => sum + (techLangScores[String(lang)] ?? 0),
        0
      )
    );
    if (
      user.projects_cleaned &&
      user.existing_projects &&
      !isNoiseContent(user.existing_projects)
    ) {
      score += 20;
    }
    score += Math.min(20, (countByUser.get(Number(user.id)) ?? 0) * 5);
    await query("UPDATE users SET activity_score = $1, updated_at = NOW() WHERE id = $2", [
      score,
      user.id,
    ]);
    processed += 1;
  }
  return { processed };
}

function textFromRecord(record: Record<string, unknown>) {
  return Object.entries(record)
    .filter(([, value]) => value != null && String(value).trim() !== "")
    .map(([key, value]) => `${key}:${String(value)}`)
    .join(" ");
}

export async function generateProfilesBatch(limit = 50) {
  const users = await query<Record<string, unknown>>(
    "SELECT id, username, github, intro, monad_experience, existing_projects, notes, github_stats, web3insight_data, extra_csv_data FROM users WHERE role = 'member' AND (notes IS NULL OR notes = '') AND id IN (SELECT DISTINCT user_id FROM activity_records) AND deleted_at IS NULL LIMIT $1",
    [limit]
  );

  let processed = 0;
  for (const user of users.rows) {
    const records = await query<Record<string, unknown>>(
      "SELECT ar.*, ae.name AS event_name FROM activity_records ar LEFT JOIN activity_events ae ON ae.id = ar.event_id WHERE ar.user_id = $1",
      [user.id]
    );
    const hasBasicInfo = Boolean(
      user.github || user.intro || user.monad_experience || user.existing_projects
    );
    if (!hasBasicInfo && records.rows.length === 0) {
      await query("UPDATE users SET notes = $1, updated_at = NOW() WHERE id = $2", [
        insufficientDataMarker,
        user.id,
      ]);
      continue;
    }

    const lines = [
      "开发者信息：",
      `用户名: ${String(user.username ?? "")}`,
      user.github ? `GitHub: ${String(user.github)}` : "",
      user.intro ? `简介: ${String(user.intro)}` : "",
      user.monad_experience ? `Monad经验: ${String(user.monad_experience)}` : "",
      user.existing_projects ? `已有项目: ${String(user.existing_projects)}` : "",
    ].filter(Boolean);
    if (user.github_stats) {
      lines.push("\nGitHub 数据：", textFromRecord(user.github_stats as Record<string, unknown>));
    }
    if (user.extra_csv_data) {
      lines.push(
        "\n来自报名表的补充信息：",
        textFromRecord(user.extra_csv_data as Record<string, unknown>)
      );
    }
    lines.push("\n参与活动记录：");
    for (const record of records.rows) {
      lines.push(
        `- ${String(record.event_name ?? "")}，角色: ${String(record.role ?? "")}，获奖: ${String(record.award ?? "")}，状态: ${String(record.status ?? "")}`
      );
      if (record.extra_data) {
        lines.push(textFromRecord(record.extra_data as Record<string, unknown>));
      }
    }

    try {
      const profile = await generateProfile(lines.join("\n"));
      await query("UPDATE users SET notes = $1, updated_at = NOW() WHERE id = $2", [
        profile,
        user.id,
      ]);
      processed += 1;
    } catch {
      // Keep row retryable for the next cron run.
    }
  }
  return { processed };
}

export { analyzeEvent };

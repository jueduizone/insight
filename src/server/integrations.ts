import monadDevelopers from "../../insight/data/monad_devs.json";

const githubAPIBase = "https://api.github.com";
const defaultWeb3InsightBase = "https://api.web3insight.ai";

type MonadDeveloper = {
  login: string;
  country?: string | null;
  monad_commits?: number;
  is_chinese?: boolean;
};

const monadDeveloperIndex = new Map(
  (monadDevelopers as MonadDeveloper[]).map((developer) => [
    developer.login.toLowerCase(),
    developer,
  ])
);

export type GitHubStats = {
  login: string;
  name: string;
  location: string;
  bio: string;
  company: string;
  public_repos: number;
  followers: number;
  following: number;
  total_commits_7d: number;
  total_commits_30d: number;
  active_repos: string[];
  languages: string[];
  last_active_at: string;
  fetched_at: string;
  monad_commits?: number;
  is_chinese_dev?: boolean;
};

export function extractGitHubLogin(raw: string) {
  let value = raw.trim();
  for (const prefix of [
    "https://github.com/",
    "http://github.com/",
    "github.com/",
  ]) {
    if (value.toLowerCase().startsWith(prefix)) {
      value = value.slice(prefix.length);
      break;
    }
  }
  if (value.startsWith("id:")) {
    value = value.slice(3);
  }
  const atIndex = value.indexOf("@");
  if (atIndex !== -1) {
    value = value.slice(atIndex + 1);
    if (value.startsWith("github.com/")) {
      value = value.slice("github.com/".length);
    }
  }
  return value.replace(/\/+$/, "").trim();
}

async function githubGet<T>(url: string): Promise<T> {
  const headers: Record<string, string> = {
    "User-Agent": "DevInsight/1.0",
  };
  if (process.env.GITHUB_PAT) {
    headers.Authorization = `token ${process.env.GITHUB_PAT}`;
  }
  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`github api returned ${response.status} for ${url}`);
  }
  return (await response.json()) as T;
}

async function fetchUserRepos(login: string) {
  const langs = new Map<string, number>();
  for (let page = 1; page <= 5; page += 1) {
    try {
      const repos = await githubGet<Array<{ language?: string | null }>>(
        `${githubAPIBase}/users/${login}/repos?per_page=100&page=${page}&sort=pushed`
      );
      if (repos.length === 0) {
        break;
      }
      for (const repo of repos) {
        if (repo.language) {
          langs.set(repo.language, (langs.get(repo.language) ?? 0) + 1);
        }
      }
    } catch {
      break;
    }
  }
  return langs;
}

function isChineseDeveloper(location: string, country = "") {
  const countries = ["china", "hong kong", "taiwan", "macau", "cn", "hk", "tw"];
  const keywords = [
    "china",
    "beijing",
    "shanghai",
    "shenzhen",
    "guangzhou",
    "hangzhou",
    "chengdu",
    "wuhan",
    "nanjing",
    "suzhou",
    "hong kong",
    "taiwan",
    "中国",
    "北京",
    "上海",
    "深圳",
    "广州",
    "杭州",
    "成都",
    "武汉",
  ];
  const normalizedLocation = location.toLowerCase();
  const normalizedCountry = country.toLowerCase();
  return (
    countries.includes(normalizedCountry) ||
    keywords.some((keyword) => normalizedLocation.includes(keyword))
  );
}

export async function fetchGitHubUser(login: string): Promise<GitHubStats> {
  const userInfo = await githubGet<{
    login: string;
    name?: string | null;
    location?: string | null;
    bio?: string | null;
    company?: string | null;
    public_repos?: number;
    followers?: number;
    following?: number;
  }>(`${githubAPIBase}/users/${login}`);

  const events = await githubGet<
    Array<{
      type: string;
      created_at: string;
      repo?: { name?: string };
      payload?: { size?: number; commits?: unknown[] };
    }>
  >(`${githubAPIBase}/users/${login}/events/public?per_page=100`);

  const now = new Date();
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(now.getDate() - 7);
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(now.getDate() - 30);

  let totalCommits7d = 0;
  let totalCommits30d = 0;
  const activeRepos = new Set<string>();
  let lastActiveAt = "";

  for (const event of events) {
    if (event.type !== "PushEvent") {
      continue;
    }
    const createdAt = new Date(event.created_at);
    const size = event.payload?.size ?? event.payload?.commits?.length ?? 0;
    if (createdAt > sevenDaysAgo) {
      totalCommits7d += size;
    }
    if (createdAt > thirtyDaysAgo) {
      totalCommits30d += size;
    }
    if (event.repo?.name && activeRepos.size < 10) {
      activeRepos.add(event.repo.name);
    }
    if (!lastActiveAt) {
      lastActiveAt = createdAt.toISOString();
    }
  }

  const langs = await fetchUserRepos(login);
  const languages = [...langs.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([language]) => language);

  const stats: GitHubStats = {
    login,
    name: userInfo.name ?? "",
    location: userInfo.location ?? "",
    bio: userInfo.bio ?? "",
    company: userInfo.company ?? "",
    public_repos: userInfo.public_repos ?? 0,
    followers: userInfo.followers ?? 0,
    following: userInfo.following ?? 0,
    total_commits_7d: totalCommits7d,
    total_commits_30d: totalCommits30d,
    active_repos: [...activeRepos],
    languages,
    last_active_at: lastActiveAt,
    fetched_at: now.toISOString(),
  };

  const monadDeveloper = monadDeveloperIndex.get(login.toLowerCase());
  if (monadDeveloper) {
    stats.monad_commits = Math.trunc(monadDeveloper.monad_commits ?? 0);
    stats.is_chinese_dev =
      Boolean(monadDeveloper.is_chinese) ||
      isChineseDeveloper(stats.location, monadDeveloper.country ?? "");
  } else {
    stats.is_chinese_dev = isChineseDeveloper(stats.location);
  }
  return stats;
}

function web3InsightConfig() {
  return {
    baseURL: (process.env.WEB3INSIGHT_BASE_URL || defaultWeb3InsightBase).replace(
      /\/$/,
      ""
    ),
    token: process.env.WEB3INSIGHT_API_KEY || "",
  };
}

async function newWeb3InsightRequest<T>(
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const { baseURL, token } = web3InsightConfig();
  if (!token) {
    throw new Error("WEB3INSIGHT_API_KEY is not configured");
  }
  const response = await fetch(`${baseURL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(60_000),
  });

  const text = await response.text();
  if (response.status === 404) {
    return { status: "not_found" } as T;
  }
  if (!response.ok) {
    throw new Error(
      `web3insight request failed: status=${response.status} body=${text.slice(0, 300)}`
    );
  }
  return text ? (JSON.parse(text) as T) : ({} as T);
}

function numericValue(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function web3InsightEnvelopeError(result: Record<string, unknown>) {
  const code = numericValue(result.code);
  if (code !== null && code !== 0 && code !== 200) {
    throw new Error(`web3insight API error code=${code} message=${String(result.message ?? "")}`);
  }
  const statusCode = numericValue(result.status_code);
  if (statusCode !== null && statusCode >= 400) {
    throw new Error(
      `web3insight API error status_code=${statusCode} message=${String(result.message ?? "")}`
    );
  }
}

function unwrapWeb3InsightUser(raw: unknown): { data: Record<string, unknown>; found: boolean } {
  if (!raw || typeof raw !== "object") {
    return { data: {}, found: false };
  }
  const result = raw as Record<string, unknown>;
  if (result.status === "not_found") {
    return { data: {}, found: false };
  }
  web3InsightEnvelopeError(result);
  const data = result.data;
  if (data && typeof data === "object" && !Array.isArray(data)) {
    return { data: data as Record<string, unknown>, found: true };
  }
  return { data: result, found: Object.keys(result).length > 0 };
}

export async function fetchWeb3InsightUser(githubLogin: string) {
  const login = extractGitHubLogin(githubLogin);
  if (!login) {
    return { data: {}, raw: { status: "invalid_github" }, found: false };
  }
  const raw = await newWeb3InsightRequest<Record<string, unknown>>(
    "GET",
    `/v1/event/users/${login}`
  );
  const { data, found } = unwrapWeb3InsightUser(raw);
  return { data, raw, found };
}

export async function triggerWeb3InsightAnalysis(githubLogins: string[]) {
  const github_urls = githubLogins
    .map(extractGitHubLogin)
    .filter(Boolean)
    .map((login) => `https://github.com/${login}`);
  if (github_urls.length === 0) {
    return "";
  }

  const result = await newWeb3InsightRequest<Record<string, unknown>>(
    "POST",
    "/v1/custom/analysis/users",
    {
      intent: "analyze_github_users",
      description: "Analyze Monad Insight imported developers by GitHub profile URL.",
      request_data: { github_urls },
    }
  );
  web3InsightEnvelopeError(result);
  const data = result.data as Record<string, unknown> | undefined;
  return String(data?.task_id ?? result.task_id ?? "");
}

export function extractWeb3InsightID(data: Record<string, unknown>) {
  for (const key of ["web3insight_id", "id", "user_id"]) {
    const value = data[key];
    if (typeof value === "string" && value) {
      return value;
    }
  }
  return "";
}

# Insight Security Check - 2026-10-22

Checked against the WeChat article titled "安全大逃杀：https 证书、PHP、Node.js 三连爆"
and the Node.js October 2026 security advisory. Date uses Asia/Shanghai.

## Remediation Progress

The findings below preserve the initial read-only audit. The user subsequently
authorized fixes, tests, commit, and deployment.

- Local default Node is now `24.22.1` (OpenSSL `3.5.9`, Brotli `1.2.0`). Existing
  unrelated Node processes were not restarted.
- `.nvmrc`, package engines, build/start checks, and API runtime checks require
  patched Node 24 (`24.22.1` or later). `/api/health` checks the live runtime and
  schema; exact versions require the production Cron bearer secret.
- Remote PostgreSQL connections now enforce certificate verification and use
  `search_path=insight,public`; connection URL flags cannot disable verification.
  A read-only connection using the production configuration succeeded with
  `encrypted=true`, `authorized=true`, schema `insight`, 3527 users, 14 events,
  and 4120 activity records. No data migration was executed.
- Next is `16.4.2`, React/React DOM `19.3.1`, and csv-parse `7.0.3`.
  `npm audit --omit=dev --registry=https://registry.npmjs.org` reports zero
  production dependency vulnerabilities. Clean `npm ci` succeeds.
- Full audit still reports five high-severity entries in the development-only
  ESLint dependency chain (braces/micromatch/fast-glob/Next ESLint tooling).
  Upstream braces has no patched version in the audited advisory. No forced
  downgrade of Next ESLint tooling was applied.
- Nested activity/log user records exclude password hashes. Unexpected server
  errors no longer return exception text. Cron rejects requests if its secret
  is absent. Admin create/edit/password routes use the correct path segments.
- Candidate runtime and production promotion are verified separately from the
  local build. Deployment outcomes are recorded in the release handoff.

## Initial Audit Scope

- Local checkout: `/Users/IanX/codespace/insight`.
- Local shell runtime and listening Node processes.
- Read-only Vercel metadata for `open-build/insight` and its production deployment.
- Normal HTTPS requests and certificate-chain inspection for the production domains.
- No exploit payloads, password tests, production writes, dependency upgrades,
  service restarts, or redeployments were performed.
- The former Linux server was not accessed over SSH. Its installed PHP, Nginx,
  kernel, hypervisor, and compromise status remain outside this check.

## Findings

### 1. Local Node runtime requires an upgrade

Observed executable: `/Users/IanX/.nvm/versions/node/v20.11.1/bin/node`.

- Node: `v20.11.1`; bundled Brotli: `1.0.9`; platform: macOS/arm64.
- Node 20 reached end of life on April 30, 2026, according to the official
  release schedule. It is not a supported target for this security release.
- The installed newer Node branch is `v24.18.0`, which also precedes `24.22.1`.
- Listening local Node processes were observed on loopback addresses only at
  ports 8765, 8766, and 8788. This is a point-in-time observation, not proof
  that old runtimes are harmless or that every process was inventoried.

Recommended supported baseline: Node `24.22.1` or a later patched 24.x release.
Existing processes must be restarted on the new executable after upgrading.
Do not assume updating a Next dependency updates Node itself.

The official advisory identifies Brotli remote code execution
(`CVE-2026-111497`), TLS hostname-validation issues including
`CVE-2026-105483` and `CVE-2026-106069`, and a CA certificate update for the
eMudhra intermediate CA incident. Its supported fixed releases are
`22.23.4`, `24.22.1`, and `26.12.1`.
The advisory does not provide a separate per-CVE impact matrix for EOL Node 20;
the observed old runtime is a remediation requirement, not an exploitability test.

### 2. Production Node patch level is not verified

Read-only Vercel API observations:

- Project and production deployment both report `nodeVersion: 24.x`.
- Production deployment: `dpl_4ptHvpRCiKQbDrexe5dSgpvnCDj6`, state `READY`.
- Production deployment was created on June 16, 2026.
- HTTPS for the production site returns 200 with `server: Vercel`.
- An unauthenticated GET to `/api/v1/stats` returns 401 as expected.

Vercel documents that it manages minor and patch updates. Its metadata here
does not expose the running `process.version`. Neither the deployment creation
date nor the `24.x` label proves the current patch level, so production cannot
be marked patched or vulnerable solely from these observations.

Close this item by obtaining a runtime `process.version` from a restricted
diagnostic or application log, or an applicable Vercel security confirmation.
For branch 24, require at least `24.22.1`. A build-time version alone only
identifies the build runtime, not necessarily the live function runtime.

The source uses server-side `fetch` for GitHub, AI, and Web3Insight. No explicit
Brotli decoder calls were found. Absence of explicit decoder calls does not
establish that dependencies or HTTP clients cannot decompress responses.

### 3. Served certificates do not use eMudhra/emSign

Certificate-chain inspection with normal TLS verification enabled returned:

- `insight.gmonad.cc`: leaf -> YR1 -> Root YR -> ISRG Root X1.
- `insight-seven-omega.vercel.app`: leaf -> WR1 -> GTS Root R1 -> GlobalSign Root CA.
- Both connections reported successful certificate validation.

No eMudhra/emSign certificate appears in these served chains. This only clears
the served-chain question; it does not clear outbound client trust stores.
The old local Node runtime still contains emSign roots and lacks the new
release's CA update. Root presence alone does not prove that a forged chain
was accepted; no forged-certificate or revocation-bypass test was performed.

### 4. Database TLS has an unsafe fallback in source

`src/server/db.ts:26` and `scripts/migrate-db.mjs:20` configure
`rejectUnauthorized: false` for non-local connections.

Verified using dummy connection strings and the installed `pg@8.21.0`:

- `sslmode=require` replaces that SSL object with `{}`; default TLS certificate
  validation applies under this version's current interpretation.
- Without an SSL-mode URL parameter, `rejectUnauthorized: false` remains active.

The previously supplied production connection string includes `sslmode=require`.
This check did not retrieve or reprint the current encrypted production value.
Do not characterize this finding as a proven production TLS-validation bypass.
Remove the insecure fallback and use explicit verified TLS as a separate fix.

### 5. PHP, Nginx, and Linux require scope distinctions

- No PHP source, Nginx configuration, Dockerfile, or compose manifest was found
  in the project outside dependencies/generated output.
- No local PHP/PHP-FPM/Nginx process was found, and their binaries were not on PATH.
- The inspected local machine uses Darwin, not Linux.
- Production is a Next.js deployment on Vercel; underlying platform components
  are provider managed and were not directly inspected.
- The old Linux deployment has not been checked and must not be assumed patched.

## Sources

User-provided article:
`https://mp.weixin.qq.com/s/xie0TOiTlte-H77AdDcdtA`

Official Node security advisory, read October 22, 2026:
`https://nodejs.org/en/blog/vulnerability/october-2026-security-releases`

Official Node release index and maintenance schedule:
`https://nodejs.org/dist/index.json`
`https://raw.githubusercontent.com/nodejs/Release/main/schedule.json`

Official Vercel runtime version policy:
`https://vercel.com/docs/functions/runtimes/node-js/node-js-versions`

Other evidence consists of local read-only command output, TLS inspection,
source inspection, and authenticated Vercel GET responses. No credentials,
tokens, database URLs, or password hashes are included in this report.

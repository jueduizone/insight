# Monad DevInsight

This app is now a single Next.js project. The former Go/Gin backend has been
ported to Next API routes under `/api/v1/*`; the frontend calls the same-origin
API through `/api`.

## Local Development

```bash
nvm install
nvm use
npm ci
cp env.example .env.local
npm run db:migrate
npm run dev
```

Open http://localhost:3000.

Node 24.22.1 or a later patched 24.x release is required. `.nvmrc` pins the
verified baseline; `engines.node` selects the patched 24.x branch on Vercel.
Development, production builds, startup, and database migration check this
requirement before proceeding.

```bash
npm test
npm run typecheck
npm run lint
npm run build
```

## Environment

Required:

- `DATABASE_URL`: Neon direct Postgres URL for runtime requests.
- `DIRECT_DATABASE_URL`: Neon direct Postgres URL for migrations.
- `JWT_SECRET`: JWT signing secret.
- `CRON_SECRET`: required bearer token for cron endpoints and private health details.

Optional integrations:

- `AI_BASE_URL`
- `AI_API_KEY`
- `AI_MODEL`
- `WEB3INSIGHT_BASE_URL`
- `WEB3INSIGHT_API_KEY`
- `GITHUB_PAT`

For the shared Neon database, the app sets `search_path=insight,public` in code.
Use the direct Neon host, not the `-pooler` host, unless search path behavior has
been re-tested.

Remote database connections always verify TLS certificates and hostnames.
The shared runtime/migration connection configuration normalizes URL TLS
options so a connection string cannot silently disable verification or
override `search_path`. Only exact loopback hosts allow non-TLS local
development. Use a trusted public CA for the managed database endpoint.

## API

The Next catch-all API route is `src/pages/api/[...path].ts`.

Main routes:

- `POST /api/v1/login`
- `/api/v1/users`
- `/api/v1/projects`
- `/api/v1/events`
- `/api/v1/operation-logs`
- `/api/v1/stats`
- `/api/v1/reports/weekly`
- `/api/v1/reports/generate`
- `POST /api/v1/suggest-mapping`

Cron routes:

- `/api/cron/project-cleaner`
- `/api/cron/github`
- `/api/cron/activity-score`
- `/api/cron/web3insight`
- `/api/cron/profiles`

## Deployment

On Vercel/OpenBuild:

1. Configure the environment variables above.
2. Run `npm run db:migrate` once against the production database.
3. Deploy with Vercel.

```bash
npx vercel link
npx vercel env pull .env.local
npm run db:migrate
npx vercel --prod
```

The repository includes `vercel.json` with cron schedules and API max duration.

### Deployment Health

`GET /api/health` returns an uncached readiness status after checking the actual
function Node patch level and the database schema. It returns 503 on an
unpatched runtime or unexpected database schema. Normal public responses do
not expose runtime versions, database names, or errors.

An operator can send `Authorization: Bearer <CRON_SECRET>` to the same endpoint
to inspect the actual function Node/OpenSSL/Brotli versions and schema name.
Keep this token private. API cold starts also write a `[runtime-security]`
record to server logs, with version information only.

Deployment procedure: deploy a preview using production environment settings,
verify health and authenticated API reads, then promote that tested deployment.
Vercel's `24.x` project setting alone is not evidence of the patch version.

## Shared Neon Schema

The restored Insight data lives under the `insight` schema in the shared Neon
database:

- `insight.users`
- `insight.projects`
- `insight.activity_events`
- `insight.activity_records`
- `insight.operation_logs`

Cross-system links live in `shared.user_links`. Runtime SQL intentionally uses
unqualified table names; the Postgres connection sets:

```sql
search_path = insight, public
```

So `SELECT * FROM users` resolves to `insight.users`.

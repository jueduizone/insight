# Shared Neon Database Migration

`insight-old.dump` has been restored into the same Neon database used by
`gmonad.cc`, but under a separate schema:

```text
public.*   -> gmonad.cc tables
insight.*  -> insight tables
shared.*   -> cross-system mapping tables
```

This keeps both systems in one database for future cross-querying while avoiding
table-name collisions such as `public.users` versus `insight.users`.

## Restored Tables

The old insight dump was restored into:

```text
insight.users
insight.projects
insight.activity_events
insight.activity_records
insight.operation_logs
```

Current row counts after restore:

```text
insight.users: 3527
insight.projects: 0
insight.activity_events: 14
insight.activity_records: 4120
insight.operation_logs: 1
```

Sequences in the `insight` schema have been reset to `max(id) + 1`.

## Shared Link Table

The migration also created:

```text
shared.user_links
```

Initial automatic matches:

```text
email: 46
github: 13
```

The table shape:

```sql
create table shared.user_links (
  id bigserial primary key,
  gmonad_user_id bigint references public.users(id),
  insight_user_id bigint references insight.users(id),
  match_key text,
  match_type text,
  confidence numeric,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (gmonad_user_id, insight_user_id)
);
```

## Required Code Change

All existing insight SQL uses unqualified table names such as:

```sql
select * from users
select * from activity_records
```

That should continue to work, but the database connection must set:

```sql
search_path = insight, public
```

Runtime and migration code share `src/server/postgres-config.mjs`:

```ts
import { postgresConfig } from "./postgres-config.mjs";

const pool = new Pool({
  ...postgresConfig(connectionString),
  max: Number(process.env.PGPOOL_MAX ?? 5),
  idleTimeoutMillis: 20_000,
  connectionTimeoutMillis: 10_000,
});
```

This helper enforces verified remote TLS and `search_path=insight,public`.
URL parameters cannot disable certificate verification or override the schema.
Only exact loopback hosts support non-TLS development connections. Do not copy
the former `rejectUnauthorized: false` fallback into another connection.

## Vercel Env

Use the same Neon direct host as gmonad, but set search path for insight:

```env
DATABASE_URL=postgresql://...@ep-rough-bread-aojpv5xu.c-2.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require
DIRECT_DATABASE_URL=postgresql://...@ep-rough-bread-aojpv5xu.c-2.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require
JWT_SECRET=...
CRON_SECRET=...
```

Do not point insight at the Neon `-pooler` host unless search path behavior has
been re-tested. The pooler connection previously reported an empty search path.

## Verification SQL

After deploying code with `search_path=insight,public`, verify:

```sql
show search_path;

select count(*) from users;
select count(*) from activity_records;

select count(*) from public.users;
select count(*) from shared.user_links;
```

When connected through the insight app, `select count(*) from users` should read
from `insight.users`.

For explicit cross-system queries:

```sql
select
  gu.id as gmonad_user_id,
  gu.email,
  iu.id as insight_user_id,
  iu.activity_score
from shared.user_links ul
join public.users gu on gu.id = ul.gmonad_user_id
join insight.users iu on iu.id = ul.insight_user_id
order by ul.confidence desc, ul.id desc
limit 20;
```

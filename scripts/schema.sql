CREATE SCHEMA IF NOT EXISTS insight;
CREATE SCHEMA IF NOT EXISTS shared;

SET search_path = insight, public;

CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  email TEXT NOT NULL UNIQUE,
  username TEXT NOT NULL DEFAULT '',
  intro TEXT NOT NULL DEFAULT '',
  monad_experience TEXT NOT NULL DEFAULT '',
  avatar TEXT NOT NULL DEFAULT '',
  github TEXT NOT NULL DEFAULT '',
  twitter TEXT NOT NULL DEFAULT '',
  wechat TEXT NOT NULL DEFAULT '',
  telegram TEXT NOT NULL DEFAULT '',
  existing_projects TEXT NOT NULL DEFAULT '',
  uid BIGINT NOT NULL DEFAULT 0,
  wallet_address TEXT NOT NULL DEFAULT '',
  web3insight_id TEXT NOT NULL DEFAULT '',
  web3insight_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  tags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "group" TEXT NOT NULL DEFAULT 'normal',
  github_stats JSONB NOT NULL DEFAULT '{}'::jsonb,
  twitter_stats JSONB NOT NULL DEFAULT '{}'::jsonb,
  notes TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'member',
  password_hash TEXT NOT NULL DEFAULT '',
  activity_score INTEGER NOT NULL DEFAULT 0,
  first_joined_at TIMESTAMPTZ,
  projects_raw TEXT NOT NULL DEFAULT '',
  projects_cleaned BOOLEAN NOT NULL DEFAULT FALSE,
  projects_cleaned_at TIMESTAMPTZ,
  extra_csv_data JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_github ON users(github);
CREATE INDEX IF NOT EXISTS idx_users_wallet_address ON users(wallet_address);
CREATE INDEX IF NOT EXISTS idx_users_deleted_at ON users(deleted_at);

CREATE TABLE IF NOT EXISTS projects (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  name TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  github TEXT NOT NULL DEFAULT '',
  site TEXT NOT NULL DEFAULT '',
  cover_img TEXT NOT NULL DEFAULT '',
  tags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  event_id BIGINT NOT NULL DEFAULT 0,
  team_name TEXT NOT NULL DEFAULT '',
  members TEXT NOT NULL DEFAULT '',
  score DOUBLE PRECISION NOT NULL DEFAULT 0,
  scores JSONB NOT NULL DEFAULT '{}'::jsonb,
  rank INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT '',
  award_level TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_projects_deleted_at ON projects(deleted_at);
CREATE INDEX IF NOT EXISTS idx_projects_event_id ON projects(event_id);
CREATE INDEX IF NOT EXISTS idx_projects_tags ON projects USING GIN(tags);

CREATE TABLE IF NOT EXISTS activity_events (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  name TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL DEFAULT '',
  platform TEXT NOT NULL DEFAULT '',
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ,
  description TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS activity_records (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_id BIGINT NOT NULL REFERENCES activity_events(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT '',
  award TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT '',
  extra_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE(user_id, event_id)
);

CREATE INDEX IF NOT EXISTS idx_activity_records_user_id ON activity_records(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_records_event_id ON activity_records(event_id);

CREATE TABLE IF NOT EXISTS operation_logs (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  target_type TEXT NOT NULL DEFAULT '',
  target_id BIGINT NOT NULL DEFAULT 0,
  admin_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_operation_logs_target ON operation_logs(target_type, target_id);

CREATE TABLE IF NOT EXISTS shared.user_links (
  id BIGSERIAL PRIMARY KEY,
  gmonad_user_id BIGINT,
  insight_user_id BIGINT REFERENCES insight.users(id),
  match_key TEXT,
  match_type TEXT,
  confidence NUMERIC,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (gmonad_user_id, insight_user_id)
);

DO $$
BEGIN
  IF to_regclass('public.users') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conname = 'user_links_gmonad_user_id_fkey'
         AND conrelid = 'shared.user_links'::regclass
     )
  THEN
    ALTER TABLE shared.user_links
      ADD CONSTRAINT user_links_gmonad_user_id_fkey
      FOREIGN KEY (gmonad_user_id) REFERENCES public.users(id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_user_links_gmonad_user_id ON shared.user_links(gmonad_user_id);
CREATE INDEX IF NOT EXISTS idx_user_links_insight_user_id ON shared.user_links(insight_user_id);
CREATE INDEX IF NOT EXISTS idx_user_links_match_type ON shared.user_links(match_type);

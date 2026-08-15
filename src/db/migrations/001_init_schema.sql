-- ============================================================
-- PAC — Memory Schema
-- Migration: 001_init_schema.sql
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── USERS ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email        TEXT UNIQUE NOT NULL,
  display_name TEXT,
  timezone     TEXT DEFAULT 'Asia/Kolkata',
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  deleted_at   TIMESTAMPTZ
);

-- ─── MEMORIES (Parent Table) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS memories (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id),
  type         TEXT NOT NULL CHECK (type IN ('fact', 'task', 'event', 'project')),
  content      TEXT NOT NULL,
  category     TEXT CHECK (category IN ('interview', 'deadline', 'report', 'general')),
  source       TEXT CHECK (source IN ('gmail', 'github', 'calendar', 'manual')),
  source_ref   TEXT,
  importance   FLOAT DEFAULT 0.5 CHECK (importance >= 0 AND importance <= 1),
  event_date   TIMESTAMPTZ,
  due_date     TIMESTAMPTZ,
  qdrant_id    UUID,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  accessed_at  TIMESTAMPTZ,
  deleted_at   TIMESTAMPTZ
);

-- ─── TASKS ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tasks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  memory_id   UUID REFERENCES memories(id),
  user_id     UUID REFERENCES users(id),
  title       TEXT NOT NULL,
  description TEXT,
  assigned_by TEXT,
  status      TEXT DEFAULT 'pending' CHECK (
                status IN ('pending', 'in_progress', 'completed', 'overdue')
              ),
  due_date    TIMESTAMPTZ,
  started_at  TIMESTAMPTZ,
  done_at     TIMESTAMPTZ,
  priority    INTEGER DEFAULT 3 CHECK (priority BETWEEN 1 AND 5),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  deleted_at  TIMESTAMPTZ
);

-- ─── EVENTS ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS events (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  memory_id        UUID REFERENCES memories(id),
  user_id          UUID REFERENCES users(id),
  title            TEXT NOT NULL,
  description      TEXT,
  location         TEXT,
  meeting_link     TEXT,
  event_date       TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER DEFAULT 60,
  is_recurring     BOOLEAN DEFAULT FALSE,
  recurrence       TEXT CHECK (recurrence IN ('daily', 'weekly', 'monthly')),
  recurrence_day   TEXT,
  attendees        TEXT[],
  event_type       TEXT CHECK (
                     event_type IN ('interview', 'meeting', 'deadline', 'personal')
                   ),
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  deleted_at       TIMESTAMPTZ
);

-- ─── PROJECTS ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS projects (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  memory_id    UUID REFERENCES memories(id),
  user_id      UUID REFERENCES users(id),
  name         TEXT NOT NULL,
  description  TEXT,
  field        TEXT,
  status       TEXT DEFAULT 'planning' CHECK (
                 status IN ('planning', 'active', 'completed', 'abandoned')
               ),
  team_members TEXT[],
  owner        TEXT,
  github_repo  TEXT,
  live_url     TEXT,
  start_date   TIMESTAMPTZ,
  deadline     TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  deleted_at   TIMESTAMPTZ
);

-- ─── INDEXES ─────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_memories_user_id   ON memories(user_id);
CREATE INDEX IF NOT EXISTS idx_memories_type       ON memories(type);
CREATE INDEX IF NOT EXISTS idx_memories_importance ON memories(importance);
CREATE INDEX IF NOT EXISTS idx_tasks_user_id       ON tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status        ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_events_user_id      ON events(user_id);
CREATE INDEX IF NOT EXISTS idx_events_event_date   ON events(event_date);
CREATE INDEX IF NOT EXISTS idx_projects_user_id    ON projects(user_id);
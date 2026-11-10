// Production database init for the Lamp & Light Coaching program.
//
// Creates the program's tables in the SQLite file named by DB_PATH
// (default: data/bench.db under the project root — the same default
// the server itself uses) IF they do not exist yet, and exits. It is
// safe to run on every boot: every statement is IF NOT EXISTS, and it
// never creates, changes, or deletes any account or student data.
//
// The table shapes are the final Road One schema (see
// server/src/schema.ts): the master's cycles / progress / reflections,
// with cycles carrying its student_id stamp (the owner's Supabase Auth
// user id, stored as text) and wheel_areas column, and progress /
// reflections with their unique upsert indexes. There are NO account
// tables: accounts live in Supabase Auth (decided 2026-11-10), so this
// database holds student work only.
//
// Why this exists: the test bench seeded its database by copying the
// master's app.db (scripts/setup-db.ts, deliberately NOT shipped in
// this bundle). Production starts from an empty file on the Render
// persistent disk instead. Importing James's own saved work and the
// existing student's saved answers is a separate, later step (Phase
// 4) — nothing is seeded here, so a fresh production database
// contains ZERO rows of student work.

import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

const DB_PATH =
  process.env.DB_PATH ?? join(import.meta.dir, "../data/bench.db");

mkdirSync(dirname(DB_PATH), { recursive: true });

const sqlite = new Database(DB_PATH, { create: true });
sqlite.exec("PRAGMA journal_mode = WAL;");
sqlite.exec("PRAGMA foreign_keys = ON;");

sqlite.exec(`
CREATE TABLE IF NOT EXISTS cycles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id TEXT NOT NULL,
  focus_area TEXT,
  wheel_scores TEXT,
  wheel_areas TEXT,
  created_at INTEGER NOT NULL,
  completed_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_cycles_student ON cycles(student_id);

CREATE TABLE IF NOT EXISTS progress (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cycle_id INTEGER NOT NULL REFERENCES cycles(id),
  lesson_id TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0,
  last_visited_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_progress_cycle ON progress(cycle_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_progress_cycle_lesson ON progress(cycle_id, lesson_id);

CREATE TABLE IF NOT EXISTS reflections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cycle_id INTEGER NOT NULL REFERENCES cycles(id),
  lesson_id TEXT NOT NULL,
  prompt_key TEXT NOT NULL,
  text TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reflections_cycle ON reflections(cycle_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_reflections_cycle_lesson_key ON reflections(cycle_id, lesson_id, prompt_key);
`);

const { n } = sqlite
  .query("SELECT COUNT(DISTINCT student_id) AS n FROM cycles")
  .get() as { n: number };
console.log(
  `database ready at ${DB_PATH} — schema in place, work saved for ${n} student(s)`,
);
sqlite.close();

import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { join } from "node:path";
import * as schema from "./schema";

// The memory book. One SQLite file for the whole program — in
// production it lives on the host's persistent disk (DB_PATH, the
// plan's change 5), with its tables created by
// scripts/init-prod-db.ts. It holds student WORK only (cycles,
// progress, reflections) — accounts live in Supabase Auth.
export const DB_PATH =
  process.env.DB_PATH ?? join(import.meta.dir, "../../data/bench.db");

export const sqlite = new Database(DB_PATH, { create: true });
sqlite.exec("PRAGMA journal_mode = WAL;");
sqlite.exec("PRAGMA foreign_keys = ON;");

export const db = drizzle(sqlite, { schema });
export type Db = typeof db;

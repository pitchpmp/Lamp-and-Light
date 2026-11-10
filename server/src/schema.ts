import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

// Road One schema. The three tables are the master's, unchanged in
// shape except: cycles gains a student_id stamp (every focus belongs
// to exactly one student), and progress/reflections gain the unique
// indexes their upsert logic always assumed.
//
// There is deliberately NO accounts table here (road-one-plan.md,
// change 2; decided 2026-11-10): accounts live in Supabase Auth — the
// same sign-in the live site uses. The stamp on a cycle is the
// student's Supabase Auth user id (a UUID, stored as text), resolved
// from their verified access token on every request (auth.ts).

// One "run" (cycle) = one pass through the whole program focused on a
// single life area chosen at the Wheel of Life. Students finish a run,
// then start another for the next area; every run keeps its own
// progress, worksheet answers, and wheel scores.
export const cycles = sqliteTable(
  "cycles",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    // Road One addition: whose run this is — the owner's Supabase Auth
    // user id (UUID text). Every action filters on it.
    studentId: text("student_id").notNull(),
    focusArea: text("focus_area"),
    wheelScores: text("wheel_scores"), // JSON: { [areaLabel]: 1..10 }
    wheelAreas: text("wheel_areas"), // JSON: { selected: string[], customs: string[] } — the student's picked wheel areas (Tab 2, Lesson 3)
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    completedAt: integer("completed_at", { mode: "timestamp_ms" }),
  },
  (t) => [index("idx_cycles_student").on(t.studentId)],
);

export const progress = sqliteTable(
  "progress",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    cycleId: integer("cycle_id")
      .notNull()
      .references(() => cycles.id),
    lessonId: text("lesson_id").notNull(),
    completed: integer("completed").notNull().default(0),
    lastVisitedAt: integer("last_visited_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [
    index("idx_progress_cycle").on(t.cycleId),
    uniqueIndex("idx_progress_cycle_lesson").on(t.cycleId, t.lessonId),
  ],
);

export const reflections = sqliteTable(
  "reflections",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    cycleId: integer("cycle_id")
      .notNull()
      .references(() => cycles.id),
    lessonId: text("lesson_id").notNull(),
    promptKey: text("prompt_key").notNull(),
    text: text("text").notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [
    index("idx_reflections_cycle").on(t.cycleId),
    uniqueIndex("idx_reflections_cycle_lesson_key").on(
      t.cycleId,
      t.lessonId,
      t.promptKey,
    ),
  ],
);

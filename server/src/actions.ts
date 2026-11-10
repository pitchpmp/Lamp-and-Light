import {
  ActionError,
  defineAction,
  z,
  type ActionCtx,
  type ActionsModule,
} from "./engine";
import { and, asc, eq, inArray } from "drizzle-orm";
import * as schema from "./schema";

const okResponse = z.object({ ok: z.literal(true) });

const cycleShape = z.object({
  id: z.number(),
  focusArea: z.string().nullable(),
  wheelScores: z.string().nullable(),
  wheelAreas: z.string().nullable(),
  createdAt: z.string(),
  completedAt: z.string().nullable(),
});

const stateResponse = z.object({
  cycles: z.array(cycleShape),
  progress: z.array(
    z.object({ cycleId: z.number(), lessonId: z.string(), completed: z.boolean() }),
  ),
  reflections: z.array(
    z.object({
      cycleId: z.number(),
      lessonId: z.string(),
      promptKey: z.string(),
      text: z.string(),
    }),
  ),
});

type State = z.infer<typeof stateResponse>;

// Road One guard: a cycle is only visible to the student who owns it.
// Every write that names a cycleId goes through this (or an equivalent
// ownership-scoped WHERE) before touching progress or reflections.
async function assertOwnsCycle(ctx: ActionCtx, cycleId: number): Promise<void> {
  const db = ctx.db<typeof schema>();
  const rows = await db
    .select({ id: schema.cycles.id })
    .from(schema.cycles)
    .where(
      and(
        eq(schema.cycles.id, cycleId),
        eq(schema.cycles.studentId, ctx.studentId),
      ),
    )
    .limit(1);
  if (rows.length === 0) {
    throw new ActionError("cycle not found", 404, "not_found");
  }
}

export const Actions = {
  getState: defineAction({
    request: z.object({}),
    response: stateResponse,
    async handler(ctx): Promise<State> {
      const db = ctx.db<typeof schema>();
      const cycleRows = await db
        .select()
        .from(schema.cycles)
        .where(eq(schema.cycles.studentId, ctx.studentId))
        .orderBy(asc(schema.cycles.id));
      const cycles = cycleRows.map((c) => ({
        id: c.id,
        focusArea: c.focusArea,
        wheelScores: c.wheelScores,
        wheelAreas: c.wheelAreas,
        createdAt: c.createdAt.toISOString(),
        completedAt: c.completedAt ? c.completedAt.toISOString() : null,
      }));
      if (cycles.length === 0) {
        // First open: create the student's first run so there is always
        // somewhere for progress to live.
        const inserted = await db
          .insert(schema.cycles)
          .values({ studentId: ctx.studentId })
          .returning({ id: schema.cycles.id, createdAt: schema.cycles.createdAt });
        const row = inserted[0];
        if (row) {
          cycles.push({
            id: row.id,
            focusArea: null,
            wheelScores: null,
            wheelAreas: null,
            createdAt: row.createdAt.toISOString(),
            completedAt: null,
          });
        }
      }
      // Only ever fetch rows that hang off this student's own cycles.
      const cycleIds = cycles.map((c) => c.id);
      const prog =
        cycleIds.length === 0
          ? []
          : await db
              .select()
              .from(schema.progress)
              .where(inArray(schema.progress.cycleId, cycleIds));
      const refs =
        cycleIds.length === 0
          ? []
          : await db
              .select()
              .from(schema.reflections)
              .where(inArray(schema.reflections.cycleId, cycleIds));
      return {
        cycles,
        progress: prog.map((p) => ({
          cycleId: p.cycleId,
          lessonId: p.lessonId,
          completed: p.completed === 1,
        })),
        reflections: refs.map((r) => ({
          cycleId: r.cycleId,
          lessonId: r.lessonId,
          promptKey: r.promptKey,
          text: r.text,
        })),
      };
    },
  }),

  createCycle: defineAction({
    request: z.object({ focusArea: z.string().max(80).optional() }),
    response: z.object({ id: z.number() }),
    async handler(ctx, args): Promise<{ id: number }> {
      const db = ctx.db<typeof schema>();
      const inserted = await db
        .insert(schema.cycles)
        .values({ studentId: ctx.studentId, focusArea: args.focusArea ?? null })
        .returning({ id: schema.cycles.id });
      const row = inserted[0];
      if (!row) throw new Error("createCycle: insert returned no rows");
      ctx.invalidateQueries();
      return { id: row.id };
    },
  }),

  setCycleFocus: defineAction({
    request: z.object({ cycleId: z.number(), focusArea: z.string().min(1).max(80) }),
    response: okResponse,
    async handler(ctx, args): Promise<{ ok: true }> {
      const db = ctx.db<typeof schema>();
      const updated = await db
        .update(schema.cycles)
        .set({ focusArea: args.focusArea })
        .where(
          and(
            eq(schema.cycles.id, args.cycleId),
            eq(schema.cycles.studentId, ctx.studentId),
          ),
        )
        .returning({ id: schema.cycles.id });
      if (updated.length === 0) {
        throw new ActionError("cycle not found", 404, "not_found");
      }
      ctx.invalidateQueries();
      return { ok: true as const };
    },
  }),

  saveWheel: defineAction({
    request: z.object({
      cycleId: z.number(),
      scores: z.record(z.string(), z.number().int().min(1).max(10)),
    }),
    response: okResponse,
    async handler(ctx, args): Promise<{ ok: true }> {
      const db = ctx.db<typeof schema>();
      const updated = await db
        .update(schema.cycles)
        .set({ wheelScores: JSON.stringify(args.scores) })
        .where(
          and(
            eq(schema.cycles.id, args.cycleId),
            eq(schema.cycles.studentId, ctx.studentId),
          ),
        )
        .returning({ id: schema.cycles.id });
      if (updated.length === 0) {
        throw new ActionError("cycle not found", 404, "not_found");
      }
      ctx.invalidateQueries();
      return { ok: true as const };
    },
  }),

  saveWheelAreas: defineAction({
    request: z.object({
      cycleId: z.number(),
      selected: z.array(z.string().min(1).max(60)).max(8),
      customs: z.array(z.string().min(1).max(60)).max(3),
    }),
    response: okResponse,
    async handler(ctx, args): Promise<{ ok: true }> {
      const db = ctx.db<typeof schema>();
      const updated = await db
        .update(schema.cycles)
        .set({
          wheelAreas: JSON.stringify({
            selected: args.selected,
            customs: args.customs,
          }),
        })
        .where(
          and(
            eq(schema.cycles.id, args.cycleId),
            eq(schema.cycles.studentId, ctx.studentId),
          ),
        )
        .returning({ id: schema.cycles.id });
      if (updated.length === 0) {
        throw new ActionError("cycle not found", 404, "not_found");
      }
      ctx.invalidateQueries();
      return { ok: true as const };
    },
  }),

  completeCycle: defineAction({
    request: z.object({ cycleId: z.number(), completed: z.boolean() }),
    response: okResponse,
    async handler(ctx, args): Promise<{ ok: true }> {
      const db = ctx.db<typeof schema>();
      const updated = await db
        .update(schema.cycles)
        .set({ completedAt: args.completed ? new Date() : null })
        .where(
          and(
            eq(schema.cycles.id, args.cycleId),
            eq(schema.cycles.studentId, ctx.studentId),
          ),
        )
        .returning({ id: schema.cycles.id });
      if (updated.length === 0) {
        throw new ActionError("cycle not found", 404, "not_found");
      }
      ctx.invalidateQueries();
      return { ok: true as const };
    },
  }),

  markVisited: defineAction({
    request: z.object({ cycleId: z.number(), lessonId: z.string() }),
    response: okResponse,
    async handler(ctx, args): Promise<{ ok: true }> {
      const db = ctx.db<typeof schema>();
      await assertOwnsCycle(ctx, args.cycleId);
      const rows = await db
        .select()
        .from(schema.progress)
        .where(
          and(
            eq(schema.progress.cycleId, args.cycleId),
            eq(schema.progress.lessonId, args.lessonId),
          ),
        )
        .limit(1);
      const existing = rows[0];
      if (existing) {
        await db
          .update(schema.progress)
          .set({ lastVisitedAt: new Date() })
          .where(eq(schema.progress.id, existing.id));
      } else {
        await db.insert(schema.progress).values({
          cycleId: args.cycleId,
          lessonId: args.lessonId,
          completed: 0,
          lastVisitedAt: new Date(),
        });
      }
      return { ok: true as const };
    },
  }),

  toggleComplete: defineAction({
    request: z.object({
      cycleId: z.number(),
      lessonId: z.string(),
      completed: z.boolean(),
    }),
    response: okResponse,
    async handler(ctx, args): Promise<{ ok: true }> {
      const db = ctx.db<typeof schema>();
      await assertOwnsCycle(ctx, args.cycleId);
      const rows = await db
        .select()
        .from(schema.progress)
        .where(
          and(
            eq(schema.progress.cycleId, args.cycleId),
            eq(schema.progress.lessonId, args.lessonId),
          ),
        )
        .limit(1);
      const existing = rows[0];
      if (existing) {
        await db
          .update(schema.progress)
          .set({ completed: args.completed ? 1 : 0, lastVisitedAt: new Date() })
          .where(eq(schema.progress.id, existing.id));
      } else {
        await db.insert(schema.progress).values({
          cycleId: args.cycleId,
          lessonId: args.lessonId,
          completed: args.completed ? 1 : 0,
          lastVisitedAt: new Date(),
        });
      }
      ctx.invalidateQueries();
      return { ok: true as const };
    },
  }),

  saveReflection: defineAction({
    request: z.object({
      cycleId: z.number(),
      lessonId: z.string(),
      promptKey: z.string(),
      text: z.string().max(20000),
    }),
    response: okResponse,
    async handler(ctx, args): Promise<{ ok: true }> {
      const db = ctx.db<typeof schema>();
      await assertOwnsCycle(ctx, args.cycleId);
      const rows = await db
        .select()
        .from(schema.reflections)
        .where(
          and(
            eq(schema.reflections.cycleId, args.cycleId),
            eq(schema.reflections.lessonId, args.lessonId),
            eq(schema.reflections.promptKey, args.promptKey),
          ),
        )
        .limit(1);
      const existing = rows[0];
      if (existing) {
        await db
          .update(schema.reflections)
          .set({ text: args.text, updatedAt: new Date() })
          .where(eq(schema.reflections.id, existing.id));
      } else {
        await db.insert(schema.reflections).values({
          cycleId: args.cycleId,
          lessonId: args.lessonId,
          promptKey: args.promptKey,
          text: args.text,
          updatedAt: new Date(),
        });
      }
      ctx.invalidateQueries();
      return { ok: true as const };
    },
  }),
} satisfies ActionsModule;

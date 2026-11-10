// The replacement "engine room" contract — a drop-in stand-in for the
// Muse-only @hatch/space-sdk server API, so the master's action handlers
// port across almost unchanged:
//
//   * defineAction({ request, response, handler }) keeps its shape.
//   * ctx.db<typeof schema>() returns the app's Drizzle database.
//   * ctx.invalidateQueries() exists but is a no-op: the client already
//     invalidates its own react-query cache after every mutation
//     (see client/src/App.tsx), exactly as it did inside Muse.
//   * ctx.studentId / ctx.studentEmail are the Road One addition: the
//     signed-in student, resolved from their verified Supabase access
//     token by server.ts before any handler runs. studentId is the
//     student's Supabase Auth user id (UUID). Handlers never see
//     another student's id.

import { z } from "zod";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import type * as schema from "./schema";

export { z };

export type AppDb = BunSQLiteDatabase<typeof schema>;

export interface ActionCtx {
  db: <_S>() => AppDb;
  studentId: string;
  studentEmail: string;
  invalidateQueries: () => void;
}

export interface ActionDef<
  Req extends z.ZodTypeAny = z.ZodTypeAny,
  Res extends z.ZodTypeAny = z.ZodTypeAny,
> {
  request: Req;
  response: Res;
  handler: (ctx: ActionCtx, args: z.infer<Req>) => Promise<z.infer<Res>>;
}

export function defineAction<
  Req extends z.ZodTypeAny,
  Res extends z.ZodTypeAny,
>(def: ActionDef<Req, Res>): ActionDef<Req, Res> {
  return def;
}

export type ActionsModule = Record<string, ActionDef>;

// An error a handler throws on purpose: carries the HTTP status and a
// stable machine-readable code for the client (e.g. 404 "not_found" when
// a student reaches for a cycle that is not theirs).
export class ActionError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status = 400, code?: string) {
    super(message);
    this.name = "ActionError";
    this.status = status;
    this.code = code;
  }
}

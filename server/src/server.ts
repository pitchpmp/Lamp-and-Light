// Road One production server. One process does three jobs:
//
//   GET  /auth/me  — who the presented Supabase access token belongs
//                    to (the client signs in directly with Supabase;
//                    there are no account endpoints here at all).
//   POST /actions  — the same {action, args} contract the master's pages
//                    have always called, now behind the sign-in door.
//   GET  /*        — the built client (client/dist), so the service
//                    runs exactly what a browser would run.
//
// Wire format mirrors the Muse space runtime the client was built for:
// success is HTTP 200 with { data: <result> }; failure is { error, code? }
// with a 4xx/5xx status. Every action requires a verified Supabase
// access token; the handler receives the signed-in student's Supabase
// user id and can only ever touch that student's own cycles (see
// actions.ts).

import { join, normalize } from "node:path";
import { z } from "zod";
import { Actions } from "./actions";
import * as auth from "./auth";
import { db } from "./db";
import { ActionError, type ActionCtx, type ActionDef } from "./engine";
import { SUPABASE_URL, supabaseConfigured } from "./supabase";

// Sign-in is Supabase Auth. SUPABASE_URL now has a built-in default
// (the public project URL, see supabase.ts), so the service boots
// with NO environment variables configured at all. This check stays
// only as a last-resort guard if the default is ever removed.
if (!supabaseConfigured) {
  console.error(
    "SUPABASE_URL is not set and no default is configured — student sign-in " +
      "(Supabase Auth) cannot be verified.",
  );
  process.exit(1);
}

// Every setting has a working default — zero dashboard config needed:
//   PORT — Render assigns it; 8787 locally.
//   HOST — 0.0.0.0 so Render (and any host) can reach the process;
//          127.0.0.1 would hide it from the platform's port scan.
//   DB_PATH — defaults in db.ts to data/bench.db under the project.
const PORT = Number(process.env.PORT ?? 8787);
const HOST = process.env.HOST?.trim() || "0.0.0.0";
const DIST = join(import.meta.dir, "../../client/dist");

const actionTable = Actions as Record<string, ActionDef>;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function errorBody(err: unknown): { status: number; body: { error: string; code?: string } } {
  if (err instanceof ActionError) {
    return {
      status: err.status,
      body: { error: err.message, ...(err.code ? { code: err.code } : {}) },
    };
  }
  if (err instanceof z.ZodError) {
    return {
      status: 400,
      body: { error: `invalid request: ${err.issues.map((i) => i.message).join("; ")}`, code: "invalid_request" },
    };
  }
  console.error(err);
  return { status: 500, body: { error: "something went wrong on the server", code: "internal" } };
}

function bearer(req: Request): string | null {
  const header = req.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice("Bearer ".length) || null;
}

async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = (await req.json()) as unknown;
    if (body && typeof body === "object") return body as Record<string, unknown>;
  } catch {
    // fall through to the error below
  }
  throw new ActionError("request body must be JSON", 400, "invalid_json");
}

async function handleAuth(req: Request, path: string): Promise<Response> {
  try {
    // The only auth endpoint left: accounts and sessions live in
    // Supabase Auth, which the client talks to directly. This answers
    // "is my token still good, and whose is it?" for the client.
    if (path === "/auth/me" && req.method === "GET") {
      const student = await auth.studentForToken(bearer(req));
      if (!student) {
        throw new ActionError("not signed in", 401, "unauthorized");
      }
      return json({ data: { id: student.id, email: student.email } });
    }
    return json({ error: "not found" }, 404);
  } catch (err) {
    const { status, body } = errorBody(err);
    return json(body, status);
  }
}

async function handleAction(req: Request): Promise<Response> {
  try {
    const student = await auth.studentForToken(bearer(req));
    if (!student) {
      throw new ActionError("not signed in", 401, "unauthorized");
    }
    const body = await readJson(req);
    const name = typeof body.action === "string" ? body.action : "";
    const def = actionTable[name];
    if (!def) {
      throw new ActionError(`unknown action: ${name || "(none)"}`, 404, "unknown_action");
    }
    const args = def.request.parse(body.args ?? {});
    const ctx: ActionCtx = {
      db: () => db,
      studentId: student.id,
      studentEmail: student.email,
      // The client invalidates its own query cache after mutations
      // (client/src/App.tsx) — nothing for the server to do.
      invalidateQueries: () => {},
    };
    const result = await def.handler(ctx, args);
    // Validate on the way out too, so the bench enforces the same
    // contract the Muse runtime did.
    const data = def.response.parse(result);
    return json({ data });
  } catch (err) {
    const { status, body } = errorBody(err);
    return json(body, status);
  }
}

async function serveStatic(pathname: string): Promise<Response> {
  const rel = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const filePath = normalize(join(DIST, rel));
  if (filePath.startsWith(DIST)) {
    const file = Bun.file(filePath);
    if (await file.exists()) return new Response(file);
  }
  // Single-page app: any other path gets the shell.
  const index = Bun.file(join(DIST, "index.html"));
  if (await index.exists()) {
    return new Response(index, { headers: { "content-type": "text/html" } });
  }
  return new Response("client not built yet — run: bun run build:client", {
    status: 503,
  });
}

const server = Bun.serve({
  hostname: HOST,
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === "/health") return json({ ok: true });
    if (url.pathname.startsWith("/auth/")) return handleAuth(req, url.pathname);
    if (url.pathname === "/actions" && req.method === "POST") {
      return handleAction(req);
    }
    if (req.method === "GET") return serveStatic(url.pathname);
    return json({ error: "not found" }, 404);
  },
});

console.log(`Road One program listening on http://${HOST}:${server.port}`);
console.log(`  client: client/dist  db: ${process.env.DB_PATH ?? "data/bench.db (default)"}  supabase: ${SUPABASE_URL}`);

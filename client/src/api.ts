// Typed RPC client — same contract as the master's, re-pointed at the
// Road One engine room. Types come straight from `server/src/actions.ts`
// (type-only import: the browser bundle never pulls in server runtime).
//
// Difference from the Muse version: every call carries the signed-in
// student's Supabase access token (Authorization: Bearer …), obtained
// and refreshed by supabase.ts. When the server says the token is no
// longer good (401) even after a refresh, the session is dropped and
// an "ll-auth-expired" event fires so main.tsx can return to the
// sign-in door.

import type { Actions } from "../../server/src/actions";
import type { z } from "zod";
import { clearSession, ensureAccessToken, refreshSession } from "./supabase";

export class ActionError extends Error {
  readonly status: number;
  readonly code?: string;
  /** Mirrors the Muse client's retry contract: only errors the server
   * marks retry-safe may be retried by react-query. Ours never are. */
  readonly retrySafe = false;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ActionError";
    this.status = status;
    this.code = code;
  }
}

async function postAction(
  name: string,
  args: unknown,
  token: string | null,
): Promise<{ response: Response; body: { data?: unknown; error?: string; code?: string } | null }> {
  const response = await fetch("./actions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ action: name, args: args ?? {} }),
  });
  const body = (await response.json().catch(() => null)) as {
    data?: unknown;
    error?: string;
    code?: string;
  } | null;
  return { response, body };
}

async function callAction(name: string, args: unknown): Promise<unknown> {
  let token = await ensureAccessToken();
  if (!token) {
    window.dispatchEvent(new Event("ll-auth-expired"));
    throw new ActionError("not signed in", 401, "unauthorized");
  }
  let { response, body } = await postAction(name, args, token);
  if (response.status === 401) {
    // The stored token may have died early (revoked, clock skew): one
    // forced refresh and one retry before giving up on the session.
    const refreshed = await refreshSession();
    if (refreshed) {
      ({ response, body } = await postAction(name, args, refreshed.accessToken));
    }
  }
  if (!response.ok || (body && body.error)) {
    if (response.status === 401) {
      clearSession();
      window.dispatchEvent(new Event("ll-auth-expired"));
    }
    throw new ActionError(
      body?.error ?? `action ${name} failed: ${response.status}`,
      response.status,
      body?.code,
    );
  }
  return body?.data;
}

// Type machinery mirrors @hatch/space-sdk/client exactly, so every
// ApiRequest/ApiResponse use inside App.tsx resolves as it did in Muse.
type ClientActionShape = { request: z.ZodType; response: z.ZodType };
type ActionRequest<D extends ClientActionShape> = z.infer<D["request"]>;
type ActionResponse<D extends ClientActionShape> = z.infer<D["response"]>;

export type ActionClient<A extends Record<string, ClientActionShape>> = {
  [K in keyof A]: (args: ActionRequest<A[K]>) => Promise<ActionResponse<A[K]>>;
};

export type ApiRequest<
  C extends Record<string, (args: never) => Promise<unknown>>,
  K extends keyof C,
> = Parameters<C[K]>[0];

export type ApiResponse<
  C extends Record<string, (args: never) => Promise<unknown>>,
  K extends keyof C,
> = Awaited<ReturnType<C[K]>>;

function createActionClient<
  A extends Record<string, ClientActionShape>,
>(): ActionClient<A> {
  return new Proxy(
    {},
    {
      get(_target, name) {
        // Same guard as the Muse client: promise-protocol and symbol
        // keys must not resolve to phantom actions.
        if (typeof name !== "string") return undefined;
        if (name === "then" || name === "catch" || name === "finally") {
          return undefined;
        }
        return (args: unknown) => callAction(name, args);
      },
    },
  ) as ActionClient<A>;
}

export const api = createActionClient<typeof Actions>();

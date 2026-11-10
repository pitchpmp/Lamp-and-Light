// Who is asking? — resolved from the Supabase access token on every
// request (road-one-plan.md, changes 2–3; sign-in decision confirmed
// by James 2026-11-10).
//
// Accounts, passwords, and sessions all live in Supabase Auth — the
// same sign-in the live site uses today, so the existing student
// keeps her email and password. This server keeps NO accounts layer
// of its own: no password hashes, no session table. It only verifies
// the token Supabase issued (see supabase.ts) and hands the student's
// Supabase user id to the action handlers, which scope every read and
// write to cycles stamped with that id.

import { verifyAccessToken } from "./supabase";

export interface SignedInStudent {
  /** Supabase Auth user id (UUID) — the stamp on the student's cycles. */
  id: string;
  email: string;
}

// Resolve a bearer token to its student, or null when it is missing,
// unknown to Supabase, or expired.
export async function studentForToken(
  token: string | null,
): Promise<SignedInStudent | null> {
  const identity = await verifyAccessToken(token);
  if (!identity) return null;
  return { id: identity.id, email: identity.email };
}

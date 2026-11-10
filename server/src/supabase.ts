// Supabase Auth verification — the sign-in door (road-one-plan.md,
// change 2, decided by James 2026-11-10: students keep the SAME
// email-and-password sign-in the live site already uses).
//
// Accounts live in Supabase Auth, not in this program's database. The
// client signs in directly against Supabase and sends the resulting
// access token (a JWT) with every action call. This module's one job
// is to prove a presented token really came from our Supabase project
// and to say whose it is:
//
//   * The token's signature is checked against the project's public
//     signing keys (JWKS), fetched from the project itself and cached
//     by jose. Current Supabase projects sign with asymmetric keys
//     (ES256), so no project secret ever touches this server.
//   * Issuer and audience are pinned to this project, so a token from
//     anywhere else — or an expired one — is refused.
//   * The verified payload's `sub` is the student's Supabase user id
//     (a UUID). That id is the name stamp every cycle carries
//     (schema.ts), exactly as the plan's change 3 specifies.
//
// Legacy fallback: if a token ever arrives signed HS256 (the old
// shared-secret scheme), it is accepted only when SUPABASE_JWT_SECRET
// is configured in the environment. The secret itself is set in the
// host's dashboard — it is never in this repo. Unset, HS256 tokens are
// simply refused.

import { createSecretKey } from "node:crypto";
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";

const SUPABASE_URL = (process.env.SUPABASE_URL ?? "").replace(/\/+$/, "");
const JWT_SECRET = process.env.SUPABASE_JWT_SECRET ?? "";

export const supabaseConfigured = SUPABASE_URL.length > 0;

const ISSUER = `${SUPABASE_URL}/auth/v1`;

const jwks = supabaseConfigured
  ? createRemoteJWKSet(new URL(`${ISSUER}/.well-known/jwks.json`), {
      cacheMaxAge: 10 * 60 * 1000, // signing keys rotate rarely
      cooldownDuration: 30 * 1000,
    })
  : null;

const getKey: JWTVerifyGetKey = async (header, input) => {
  if (header.alg === "HS256") {
    if (!JWT_SECRET) {
      throw new Error("HS256 token presented but SUPABASE_JWT_SECRET is not set");
    }
    return createSecretKey(Buffer.from(JWT_SECRET, "utf8"));
  }
  if (!jwks) throw new Error("SUPABASE_URL is not configured");
  return jwks(header, input);
};

export interface SupabaseIdentity {
  /** The student's Supabase Auth user id (UUID) — payload `sub`. */
  id: string;
  email: string;
}

// Resolve a bearer access token to its student, or null when the
// token is missing, malformed, expired, from another project, or
// signed with a key this project does not use.
export async function verifyAccessToken(
  token: string | null,
): Promise<SupabaseIdentity | null> {
  if (!token || !supabaseConfigured) return null;
  try {
    const { payload } = await jwtVerify(token, getKey, {
      issuer: ISSUER,
      audience: "authenticated",
      algorithms: ["ES256", "RS256", "HS256"],
    });
    if (typeof payload.sub !== "string" || payload.sub.length === 0) {
      return null;
    }
    return {
      id: payload.sub,
      email: typeof payload.email === "string" ? payload.email : "",
    };
  } catch {
    return null;
  }
}

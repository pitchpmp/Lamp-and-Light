// Student sign-in — Supabase Auth, the same door the live site uses
// today (decided by James 2026-11-10: students keep the email and
// password they already have). This module talks to Supabase directly
// from the browser, exactly like the live site's program page does:
//
//   * Create account → POST /auth/v1/signup. The project has
//     confirmation emails OFF, so signup returns a live session and
//     the student goes straight in — no confirmation email.
//   * Sign in → POST /auth/v1/token?grant_type=password.
//   * The session (access token + refresh token + expiry) is kept in
//     localStorage; the access token rides with every program action
//     call (api.ts), and our server verifies it against Supabase's
//     signing keys before touching any student's work.
//   * Access tokens live about an hour; a refresh token quietly
//     trades for a new session before expiry, so a student is not
//     bounced mid-lesson.
//
// The URL and key below are PUBLIC values — the same pair the live
// site's program page already ships to every visitor's browser. The
// key is Supabase's publishable (anon) key: it identifies the project,
// it is not a secret, and all account security lives in Supabase Auth
// itself plus this server's token verification.

export const SUPABASE_URL = "https://vaikkfgrnwiqmbueridr.supabase.co";
export const SUPABASE_ANON_KEY = "sb_publishable_PdGo6ooTpOjEoTa4IbVVWg_zfZQZhkh";

const SESSION_KEY = "ll-supabase-session";
const REFRESH_SKEW_S = 60; // refresh a minute before the token dies

export interface SupabaseSession {
  accessToken: string;
  refreshToken: string;
  /** Epoch seconds when the access token expires. */
  expiresAt: number;
  userId: string;
  email: string;
}

interface SupabaseSessionResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  user?: { id?: string; email?: string };
}

export function getSession(): SupabaseSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as SupabaseSession;
    if (!s.accessToken || !s.refreshToken || !s.userId) return null;
    return s;
  } catch {
    return null;
  }
}

function setSession(s: SupabaseSession | null): void {
  try {
    if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s));
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    // storage unavailable (private mode etc.) — the gate will simply
    // ask for sign-in again next load.
  }
}

export function clearSession(): void {
  setSession(null);
}

async function authRequest(
  path: string,
  body: Record<string, unknown>,
  accessToken?: string,
): Promise<{ ok: boolean; status: number; data: Record<string, unknown> | null }> {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      "content-type": "application/json",
      ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  return { ok: res.ok, status: res.status, data };
}

function supabaseErrorText(data: Record<string, unknown> | null): string {
  if (!data) return "";
  for (const key of ["error_description", "msg", "message", "error"]) {
    const v = data[key];
    if (typeof v === "string" && v.length > 0) return v;
  }
  return "";
}

function sessionFrom(data: Record<string, unknown> | null): SupabaseSession {
  const d = (data ?? {}) as SupabaseSessionResponse;
  if (!d.access_token || !d.refresh_token || !d.user?.id) {
    throw new Error("Supabase did not return a session — please try again.");
  }
  return {
    accessToken: d.access_token,
    refreshToken: d.refresh_token,
    expiresAt: Math.floor(Date.now() / 1000) + (d.expires_in ?? 3600),
    userId: d.user.id,
    email: d.user.email ?? "",
  };
}

// Create the account and sign the student straight in (the project
// has no confirmation-email step).
export async function signUp(
  email: string,
  password: string,
): Promise<SupabaseSession> {
  const res = await authRequest("/auth/v1/signup", { email, password });
  if (!res.ok) {
    const text = supabaseErrorText(res.data);
    if (/already.*regist|already exists|already been/i.test(text)) {
      throw new Error("An account with that email already exists — try signing in.");
    }
    if (/at least|password/i.test(text) && res.status === 422) {
      throw new Error(text);
    }
    throw new Error(text || "Could not create the account — please try again.");
  }
  // With autoconfirm on, signup returns a session. If a project ever
  // answers without one, fall back to a plain sign-in with the same
  // credentials before giving up.
  if ((res.data as SupabaseSessionResponse | null)?.access_token) {
    const session = sessionFrom(res.data);
    setSession(session);
    return session;
  }
  return signIn(email, password);
}

export async function signIn(
  email: string,
  password: string,
): Promise<SupabaseSession> {
  const res = await authRequest("/auth/v1/token?grant_type=password", {
    email,
    password,
  });
  if (!res.ok) {
    const text = supabaseErrorText(res.data);
    if (/invalid login credentials/i.test(text)) {
      // Same message either way: never reveal whether the email exists.
      throw new Error("Email or password is not right.");
    }
    throw new Error(text || "Could not sign you in — please try again.");
  }
  const session = sessionFrom(res.data);
  setSession(session);
  return session;
}

// Trade the refresh token for a fresh session. Returns null (and
// clears the stored session) when Supabase refuses — the refresh
// token is spent, revoked, or the account is gone.
export async function refreshSession(): Promise<SupabaseSession | null> {
  const current = getSession();
  if (!current) return null;
  try {
    const res = await authRequest("/auth/v1/token?grant_type=refresh_token", {
      refresh_token: current.refreshToken,
    });
    if (!res.ok) {
      clearSession();
      return null;
    }
    const session = sessionFrom(res.data);
    setSession(session);
    return session;
  } catch {
    // A network hiccup is not a refusal: keep the stored session and
    // let the caller decide (the stored access token may still work).
    return null;
  }
}

// The access token for the next program call — refreshing first when
// the stored one is expired or about to be. Null when signed out.
export async function ensureAccessToken(): Promise<string | null> {
  const session = getSession();
  if (!session) return null;
  if (session.expiresAt - Math.floor(Date.now() / 1000) > REFRESH_SKEW_S) {
    return session.accessToken;
  }
  const refreshed = await refreshSession();
  return refreshed?.accessToken ?? getSession()?.accessToken ?? null;
}

// Sign out at Supabase too (best effort — the local session is dropped
// either way), so the refresh token cannot quietly sign back in.
export async function signOut(): Promise<void> {
  const session = getSession();
  clearSession();
  if (session) {
    await authRequest("/auth/v1/logout", {}, session.accessToken).catch(
      () => {},
    );
  }
}

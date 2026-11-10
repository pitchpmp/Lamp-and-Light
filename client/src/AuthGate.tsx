// The sign-in door (road-one-plan.md, change 2). Students sign in with
// the email they enrolled with and a password they create; creating an
// account signs them straight in — there is no confirmation email.
// Sign-in is Supabase Auth — the same accounts the live site uses —
// handled by supabase.ts; this form only collects the email/password.
// This component is chrome around the program, not part of the
// master's pages: once a session exists, App renders untouched.

import { useState } from "react";
import { signIn, signUp } from "./supabase";

const NAVY = "#112241";
const BRASS = "#b9863f";

export function AuthGate({ onSignedIn }: { onSignedIn: () => void }) {
  const [mode, setMode] = useState<"signin" | "create">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      // Supabase answers with a live session for both paths (creating
      // an account signs straight in — no confirmation email).
      if (mode === "signin") await signIn(email, password);
      else await signUp(email, password);
      onSignedIn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  const inputCls =
    "w-full rounded-lg border px-3.5 py-2.5 font-sans text-base outline-none focus:ring-2";
  const inputStyle = { borderColor: "#d8cdb4", background: "#fffdf8", color: "#2b2620" } as const;

  return (
    <div
      className="flex min-h-full items-center justify-center px-4 py-10"
      style={{ background: "#f7f1e5" }}
    >
      <div
        className="w-full max-w-md rounded-2xl border p-6 shadow-sm sm:p-8"
        style={{ background: "#fffdf8", borderColor: "#e3d9c2" }}
      >
        <p
          className="text-center font-sans text-xs font-bold uppercase tracking-[0.18em]"
          style={{ color: BRASS }}
        >
          Lamp &amp; Light Coaching
        </p>
        <h1
          className="mt-2 text-center font-serif text-2xl font-bold"
          style={{ color: NAVY }}
        >
          {mode === "signin" ? "Student sign-in" : "Create your account"}
        </h1>
        <p className="mt-2 text-center font-sans text-sm" style={{ color: "#5d6863" }}>
          {mode === "signin"
            ? "Sign in with the email you enrolled and paid with. Your work saves to your own account as you go."
            : "Use the email you enrolled and paid with — that email is your login. You go straight in; there is no confirmation email."}
        </p>

        <form onSubmit={submit} className="mt-6 space-y-4">
          <label className="block">
            <span className="mb-1 block font-sans text-sm font-semibold" style={{ color: NAVY }}>
              Your email
            </span>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputCls}
              style={inputStyle}
            />
          </label>
          <label className="block">
            <span className="mb-1 block font-sans text-sm font-semibold" style={{ color: NAVY }}>
              Password
            </span>
            <input
              type="password"
              required
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputCls}
              style={inputStyle}
            />
          </label>

          {error ? (
            <p className="rounded-lg px-3 py-2 font-sans text-sm" style={{ background: "#fbeae8", color: "#8c2f26" }}>
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg px-4 py-3 font-sans text-base font-bold text-white disabled:opacity-60"
            style={{ background: NAVY }}
          >
            {busy ? "One moment…" : mode === "signin" ? "Sign in" : "Create your account"}
          </button>
        </form>

        <p className="mt-5 text-center font-sans text-sm" style={{ color: "#5d6863" }}>
          {mode === "signin" ? (
            <>
              Enrolled, but no login yet?{" "}
              <button type="button" className="font-bold underline" style={{ color: BRASS }} onClick={() => { setMode("create"); setError(null); }}>
                Create your account
              </button>
            </>
          ) : (
            <>
              Already have a login?{" "}
              <button type="button" className="font-bold underline" style={{ color: BRASS }} onClick={() => { setMode("signin"); setError(null); }}>
                Sign in
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  );
}

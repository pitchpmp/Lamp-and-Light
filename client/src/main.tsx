import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { AuthGate } from "./AuthGate";
import { getSession, signOut } from "./supabase";
import "./theme.css";
import "./space-root.css";

// Local stand-in for the Muse runtime's spaceQueryClient, with the same
// retry contract: queries retry only errors the server explicitly marks
// retry-safe (the engine room marks none), so a refused or failed call
// surfaces immediately instead of looping.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) =>
        error instanceof Error &&
        (error as { retrySafe?: unknown }).retrySafe === true &&
        failureCount < 3,
    },
  },
});

function Root() {
  // A stored Supabase session means "signed in"; its freshness is
  // resolved by api.ts/supabase.ts on the first call (refresh or a
  // clean bounce back to this gate via "ll-auth-expired").
  const [signedIn, setSignedIn] = useState(() => getSession() !== null);

  useEffect(() => {
    const onExpired = () => setSignedIn(false);
    window.addEventListener("ll-auth-expired", onExpired);
    return () => window.removeEventListener("ll-auth-expired", onExpired);
  }, []);

  if (!signedIn) {
    return <AuthGate onSignedIn={() => setSignedIn(true)} />;
  }

  return (
    <>
      <App />
      <button
        type="button"
        onClick={async () => {
          queryClient.clear();
          await signOut();
          setSignedIn(false);
        }}
        className="fixed bottom-3 right-3 z-50 rounded-full px-3.5 py-1.5 font-sans text-xs font-bold text-white shadow"
        style={{ background: "#112241", opacity: 0.85 }}
      >
        Sign out
      </button>
    </>
  );
}

const rootEl = document.querySelector<HTMLElement>("[data-generated-space-root]");
if (!rootEl) {
  throw new Error("missing generated space root element");
}

// Keep BOTH the `hatch-space-root` class AND the `data-hatch-space-root`
// attribute on the outer div: space-root.css selects on
// `.hatch-space-root[data-hatch-space-root]` for safe-area insets,
// viewport sizing, and background — dropping either breaks layout.
createRoot(rootEl).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <div className="hatch-space-root" data-hatch-space-root>
        <Root />
      </div>
    </QueryClientProvider>
  </StrictMode>,
);

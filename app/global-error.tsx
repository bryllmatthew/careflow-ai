"use client";

import "./globals.css";

/**
 * Fallback for a crash in the root layout itself -- rare, but if it happens
 * this replaces app/layout.tsx entirely, so it must define its own <html>
 * and <body> and import global styles itself (Next does not do this
 * automatically here). Kept deliberately minimal: no design-system
 * components, since the thing that crashed might be upstream of them.
 */
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif" }}>
        <div
          style={{
            display: "flex",
            minHeight: "100dvh",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "1rem",
            padding: "2rem",
            textAlign: "center",
          }}
        >
          <h1 style={{ fontSize: "1.125rem", fontWeight: 600 }}>CareFlow AI hit a problem</h1>
          <p style={{ fontSize: "0.875rem", color: "#666", maxWidth: "24rem" }}>
            Something went wrong loading the application. Reloading usually fixes this.
          </p>
          {error.digest && (
            <p style={{ fontSize: "0.75rem", color: "#999" }}>Reference: {error.digest}</p>
          )}
          <button
            onClick={() => retry()}
            style={{
              padding: "0.5rem 1rem",
              borderRadius: "0.375rem",
              border: "1px solid #ccc",
              background: "white",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}

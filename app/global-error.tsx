"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily: "system-ui, sans-serif",
          padding: "4rem 1.5rem",
          maxWidth: "560px",
          margin: "0 auto",
          textAlign: "center",
        }}
      >
        <h1 style={{ fontSize: "1.25rem", fontWeight: 600 }}>
          Application error
        </h1>
        <p style={{ marginTop: "0.5rem", color: "#555", fontSize: "0.875rem" }}>
          The app hit a fatal error. Nothing was saved. Please reload the page.
        </p>
        {error.digest && (
          <p
            style={{
              fontFamily: "monospace",
              fontSize: "0.75rem",
              color: "#888",
            }}
          >
            ref: {error.digest}
          </p>
        )}
        <button
          onClick={reset}
          style={{
            marginTop: "1rem",
            padding: "0.5rem 1rem",
            borderRadius: "0.5rem",
            background: "black",
            color: "white",
            fontSize: "0.875rem",
          }}
        >
          Reload
        </button>
      </body>
    </html>
  );
}

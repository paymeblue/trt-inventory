import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { runWithObservabilityContext } from "@/lib/observability/context";
import { Logger } from "@/lib/observability/logger";

describe("Logger", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.LOG_FORMAT = "json";
    process.env.LOG_LEVEL = "debug";
  });

  afterEach(() => {
    process.env.LOG_FORMAT = originalEnv.LOG_FORMAT;
    process.env.LOG_LEVEL = originalEnv.LOG_LEVEL;
  });

  it("redacts sensitive keys in JSON output", () => {
    const chunks: string[] = [];
    const spy = vi.spyOn(process.stdout, "write").mockImplementation((c) => {
      chunks.push(typeof c === "string" ? c : c.toString());
      return true;
    });

    const log = new Logger();
    runWithObservabilityContext({ requestId: "r1" }, () => {
      log.info("test.event", {
        user: "ok",
        password: "secret123",
        nested: { Authorization: "bearer x" },
      });
    });

    const record = JSON.parse(chunks[0].trim()) as Record<string, unknown>;
    expect(record.password).toBe("[REDACTED]");
    expect(record.nested).toEqual({ Authorization: "[REDACTED]" });
    expect(record.user).toBe("ok");

    spy.mockRestore();
  });

  it("includes requestId from observability context", () => {
    const chunks: string[] = [];
    const spy = vi.spyOn(process.stdout, "write").mockImplementation((c) => {
      chunks.push(typeof c === "string" ? c : c.toString());
      return true;
    });

    const log = new Logger();
    runWithObservabilityContext(
      { requestId: "abc-123", traceparent: "00-4bf92f3577b34da6-00f067aa0ba902b7-01" },
      () => {
        log.warn("slow.query", { ms: 42 });
      },
    );

    const record = JSON.parse(chunks[0].trim()) as Record<string, unknown>;
    expect(record.requestId).toBe("abc-123");
    expect(record.traceparent).toBe("00-4bf92f3577b34da6-00f067aa0ba902b7-01");
    expect(record.ms).toBe(42);

    spy.mockRestore();
  });
});

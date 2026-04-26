import { randomUUID } from "node:crypto";
import { getObservabilityContext } from "@/lib/observability/context";
import { readRequestIdHeader, readTraceparent } from "@/lib/observability/request-id";
import type { LogBindings, LogLevel } from "@/lib/observability/types";

const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  fatal: 50,
};

const REDACT_KEYS = new Set([
  "password",
  "passwordhash",
  "authorization",
  "cookie",
  "set-cookie",
  "setcookie",
  "secret",
  "token",
  "accesstoken",
  "refreshtoken",
  "session",
]);

function configuredLevel(): LogLevel {
  const raw = process.env.LOG_LEVEL?.toLowerCase();
  if (raw === "debug" || raw === "trace") return "debug";
  if (raw === "warn") return "warn";
  if (raw === "error") return "error";
  if (raw === "fatal") return "fatal";
  return process.env.NODE_ENV === "production" ? "info" : "debug";
}

function jsonLogsEnabled(): boolean {
  if (process.env.LOG_FORMAT === "json") return true;
  if (process.env.LOG_FORMAT === "pretty") return false;
  return process.env.NODE_ENV === "production";
}

function normalizeKey(key: string): string {
  return key.toLowerCase().replaceAll(/[^a-z0-9]/g, "");
}

function redactDeep(value: unknown, depth: number): unknown {
  if (depth > 6) return "[MaxDepth]";
  if (value === null || value === undefined) return value;
  if (typeof value === "bigint") return value.toString();
  if (typeof value !== "object") return value;
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      ...(process.env.NODE_ENV === "production"
        ? {}
        : { stack: value.stack }),
    };
  }
  if (Array.isArray(value)) {
    return value.map((v) => redactDeep(v, depth + 1));
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (REDACT_KEYS.has(normalizeKey(k))) {
      out[k] = "[REDACTED]";
    } else {
      out[k] = redactDeep(v, depth + 1);
    }
  }
  return out;
}

function shouldLog(level: LogLevel): boolean {
  return LEVEL_RANK[level] >= LEVEL_RANK[configuredLevel()];
}

function formatPretty(
  level: LogLevel,
  msg: string,
  attrs: Record<string, unknown> | undefined,
): string {
  const ctx = getObservabilityContext();
  const parts = [
    new Date().toISOString(),
    level.toUpperCase().padEnd(5),
    msg,
  ];
  if (ctx?.requestId) parts.push(`req=${ctx.requestId}`);
  if (attrs && Object.keys(attrs).length > 0) {
    parts.push(JSON.stringify(attrs));
  }
  return parts.join(" ") + "\n";
}

function writeLine(level: LogLevel, line: string) {
  if (level === "error" || level === "fatal") {
    process.stderr.write(line);
  } else {
    process.stdout.write(line);
  }
}

function baseRecord(
  level: LogLevel,
  msg: string,
  attrs: Record<string, unknown> | undefined,
  bindings: LogBindings | undefined,
): Record<string, unknown> {
  const ctx = getObservabilityContext();
  const merged: Record<string, unknown> = {};
  if (bindings) Object.assign(merged, bindings);
  if (attrs) Object.assign(merged, attrs);
  return {
    t: new Date().toISOString(),
    level,
    msg,
    service: "trt-inventory",
    env: process.env.NODE_ENV ?? "development",
    ...(ctx?.requestId ? { requestId: ctx.requestId } : {}),
    ...(ctx?.traceparent ? { traceparent: ctx.traceparent } : {}),
    ...(redactDeep(merged, 0) as Record<string, unknown>),
  };
}

export class Logger {
  constructor(private readonly bindings: LogBindings = {}) {}

  child(extra: LogBindings): Logger {
    return new Logger({ ...this.bindings, ...extra });
  }

  debug(msg: string, attrs?: Record<string, unknown>) {
    this.emit("debug", msg, attrs);
  }

  info(msg: string, attrs?: Record<string, unknown>) {
    this.emit("info", msg, attrs);
  }

  warn(msg: string, attrs?: Record<string, unknown>) {
    this.emit("warn", msg, attrs);
  }

  error(msg: string, attrs?: Record<string, unknown>) {
    this.emit("error", msg, attrs);
  }

  fatal(msg: string, attrs?: Record<string, unknown>) {
    this.emit("fatal", msg, attrs);
  }

  private emit(level: LogLevel, msg: string, attrs?: Record<string, unknown>) {
    if (!shouldLog(level)) return;
    const mergedBindings =
      Object.keys(this.bindings).length > 0 ? this.bindings : undefined;
    if (jsonLogsEnabled()) {
      const record = baseRecord(level, msg, attrs, mergedBindings);
      writeLine(level, JSON.stringify(record) + "\n");
    } else {
      const flatAttrs: Record<string, unknown> = {};
      if (mergedBindings) Object.assign(flatAttrs, mergedBindings);
      if (attrs) Object.assign(flatAttrs, attrs);
      writeLine(level, formatPretty(level, msg, flatAttrs));
    }
  }
}

const rootLogger = new Logger();

/** Logger with AsyncLocalStorage context when inside `runWithObservabilityContext`. */
export function getLogger(): Logger {
  return rootLogger;
}

/**
 * Build context from incoming request headers (Route Handler or Server
 * Component via `headers()`).
 */
export function observabilityContextFromHeaders(h: Headers) {
  return {
    requestId: readRequestIdHeader(h) ?? randomUUID(),
    traceparent: readTraceparent(h),
  };
}

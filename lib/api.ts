import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { getLogger } from "@/lib/observability/logger";

export function jsonError(status: number, message: string, extra?: unknown) {
  return NextResponse.json(
    { error: message, ...(extra ? { details: extra } : {}) },
    { status },
  );
}

export function handleError(err: unknown) {
  const log = getLogger();
  if (err instanceof ZodError) {
    log.warn("api.validation_failed", {
      issueCount: err.issues.length,
      codes: err.issues.map((i) => i.code),
    });
    return jsonError(400, "Validation failed", err.issues);
  }
  log.error("api.unhandled_error", { err });
  return jsonError(500, "Internal server error");
}

import { NextResponse } from "next/server";
import { ZodError } from "zod";

export function jsonError(status: number, message: string, extra?: unknown) {
  return NextResponse.json(
    { error: message, ...(extra ? { details: extra } : {}) },
    { status },
  );
}

export function handleError(err: unknown) {
  if (err instanceof ZodError) {
    return jsonError(400, "Validation failed", err.issues);
  }
  console.error(err);
  return jsonError(500, "Internal server error");
}

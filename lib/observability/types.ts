export type LogLevel = "debug" | "info" | "warn" | "error" | "fatal";

/** Carried on `x-request-id` / AsyncLocalStorage for the Node request lifecycle. */
export interface ObservabilityContext {
  requestId: string;
  /** W3C traceparent when the client or ingress forwards it (OTel-ready). */
  traceparent?: string;
}

export interface LogBindings {
  [key: string]: unknown;
}

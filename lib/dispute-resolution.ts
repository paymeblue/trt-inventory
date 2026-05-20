import type { DisputeStatus, Role } from "@/db/schema";

/** Super-admin and logistics triage and close disputes. */
export function canManageDisputes(role: Role): boolean {
  return role === "super_admin" || role === "logistics";
}

/** Thread accepts new replies while investigation is active. */
export function isDisputeMessagingOpen(status: DisputeStatus): boolean {
  return (
    status === "open" ||
    status === "under_review" ||
    status === "awaiting_response"
  );
}

export function isDisputeTerminal(status: DisputeStatus): boolean {
  return status === "resolved" || status === "closed";
}

export type DisputeTransition =
  | "start_review"
  | "request_response"
  | "resolve"
  | "close"
  | "reopen";

const TRANSITION_TARGET: Record<DisputeTransition, DisputeStatus> = {
  start_review: "under_review",
  request_response: "awaiting_response",
  resolve: "resolved",
  close: "closed",
  reopen: "open",
};

export function targetStatusForTransition(t: DisputeTransition): DisputeStatus {
  return TRANSITION_TARGET[t];
}

/** Allowed workflow moves from each status (coordinator actions). */
export function allowedTransitions(
  status: DisputeStatus,
): DisputeTransition[] {
  switch (status) {
    case "open":
      return ["start_review", "resolve", "close"];
    case "under_review":
      return ["request_response", "resolve", "close"];
    case "awaiting_response":
      return ["start_review", "resolve", "close"];
    case "resolved":
      return ["close", "reopen"];
    case "closed":
      return ["reopen"];
    default:
      return [];
  }
}

export function canApplyTransition(
  current: DisputeStatus,
  transition: DisputeTransition,
): boolean {
  return allowedTransitions(current).includes(transition);
}

export function transitionButtonLabel(t: DisputeTransition): string {
  switch (t) {
    case "start_review":
      return "Start review";
    case "request_response":
      return "Awaiting response";
    case "resolve":
      return "Mark resolved";
    case "close":
      return "Close case";
    case "reopen":
      return "Reopen";
    default:
      return t;
  }
}

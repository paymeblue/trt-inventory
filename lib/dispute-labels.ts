import type {
  DisputeCategory,
  DisputePriority,
  DisputeStatus,
} from "@/db/schema";

export function disputeStatusLabel(status: DisputeStatus): string {
  switch (status) {
    case "open":
      return "Open";
    case "under_review":
      return "Under review";
    case "awaiting_response":
      return "Awaiting response";
    case "resolved":
      return "Resolved";
    case "closed":
      return "Closed";
    default:
      return status;
  }
}

export function disputeStatusPill(status: DisputeStatus): string {
  switch (status) {
    case "open":
      return "pill pill-active";
    case "under_review":
      return "pill pill-anomaly";
    case "awaiting_response":
      return "pill pill-draft";
    case "resolved":
      return "pill pill-fulfilled";
    case "closed":
      return "pill pill-draft";
    default:
      return "pill";
  }
}

export function disputeCategoryLabel(cat: DisputeCategory | null): string {
  if (!cat) return "Uncategorized";
  switch (cat) {
    case "delivery_shortage":
      return "Delivery shortage";
    case "wrong_item":
      return "Wrong item";
    case "damaged_goods":
      return "Damaged goods";
    case "scan_verification":
      return "Scan / verification";
    case "documentation":
      return "Documentation";
    case "other":
      return "Other";
    default:
      return cat;
  }
}

export function disputePriorityLabel(p: DisputePriority): string {
  switch (p) {
    case "low":
      return "Low";
    case "normal":
      return "Normal";
    case "high":
      return "High";
    case "urgent":
      return "Urgent";
    default:
      return p;
  }
}

export const DISPUTE_CATEGORY_OPTIONS: DisputeCategory[] = [
  "delivery_shortage",
  "wrong_item",
  "damaged_goods",
  "scan_verification",
  "documentation",
  "other",
];

export const DISPUTE_PRIORITY_OPTIONS: DisputePriority[] = [
  "low",
  "normal",
  "high",
  "urgent",
];

export function formatEventTypeLabel(eventType: string): string {
  switch (eventType) {
    case "created":
      return "Dispute opened";
    case "status_changed":
      return "Status updated";
    case "assigned":
      return "Assignee updated";
    case "priority_changed":
      return "Priority updated";
    case "category_set":
      return "Category set";
    case "resolution_recorded":
      return "Resolution recorded";
    case "reopened":
      return "Case reopened";
    case "message_posted":
      return "Message posted";
    default:
      return eventType.replace(/_/g, " ");
  }
}

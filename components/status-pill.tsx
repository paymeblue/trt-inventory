import type { OrderStatus } from "@/db/schema";

export function StatusPill({ status }: { status: OrderStatus }) {
  const label = status.charAt(0).toUpperCase() + status.slice(1);
  return <span className={`pill pill-${status}`}>{label}</span>;
}

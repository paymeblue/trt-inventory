import { redirect } from "next/navigation";

/**
 * The "warehouse" concept was replaced by per-project items. Any old
 * bookmark, shared link, or cached navigation that still points here
 * gets nudged to the projects list.
 */
export default function WarehouseRedirect() {
  redirect("/projects");
}

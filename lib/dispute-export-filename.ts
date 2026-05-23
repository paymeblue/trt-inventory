export function disputeExportFilename(
  disputeId: string,
  format: "pdf" | "docx",
): string {
  const short = disputeId.replace(/-/g, "").slice(0, 8);
  const stamp = new Date().toISOString().slice(0, 10);
  return `dispute-${short}-${stamp}.${format}`;
}

export function parseExportFilename(
  contentDisposition: string | null,
  fallback: string,
): string {
  const match = contentDisposition?.match(/filename="([^"]+)"/);
  return match?.[1] ?? fallback;
}

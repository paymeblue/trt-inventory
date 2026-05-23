import {
  disputeExportFilename,
  parseExportFilename,
} from "@/lib/dispute-export-filename";

export async function downloadDisputeExport(
  disputeId: string,
  format: "pdf" | "docx",
): Promise<void> {
  const res = await fetch(
    `/api/disputes/${disputeId}/export?format=${format}`,
    { credentials: "same-origin" },
  );

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(body?.error ?? `Export failed (${res.status})`);
  }

  const blob = await res.blob();
  const filename = parseExportFilename(
    res.headers.get("Content-Disposition"),
    disputeExportFilename(disputeId, format),
  );

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

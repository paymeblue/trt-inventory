import { describe, expect, it } from "vitest";
import {
  disputeExportFilename,
  parseExportFilename,
} from "@/lib/dispute-export-filename";
import {
  buildDisputeDocx,
  buildDisputePdf,
} from "@/lib/dispute-export";

const sampleBundle = {
  dispute: {
    id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    title: "Missing ceiling units on delivery",
    description:
      "Installer reported three ceiling units missing from the delivery manifest.",
    status: "under_review",
    category: "delivery_shortage",
    priority: "high",
    photoPath: null,
    projectId: "proj-1",
    orderId: "ord-1",
    projectName: "North Site Alpha",
    orderLabel: "Order ord-1",
    createdAt: new Date("2026-05-01T10:00:00Z"),
    updatedAt: new Date("2026-05-02T14:30:00Z"),
    resolvedAt: null,
    closedAt: null,
    resolutionSummary: null,
    creatorName: "Jane PM",
    assigneeName: "John SA",
    resolverName: null,
  },
  messages: [
    {
      id: "msg-1",
      body: "Please confirm with logistics whether the units were picked.",
      createdAt: new Date("2026-05-01T11:00:00Z"),
      authorName: "Jane PM",
    },
  ],
  events: [
    {
      id: "ev-1",
      eventType: "created",
      detail: { status: "open" },
      createdAt: new Date("2026-05-01T10:00:00Z"),
      actorName: "Jane PM",
    },
    {
      id: "ev-2",
      eventType: "status_changed",
      detail: { from: "open", to: "under_review", transition: "review" },
      createdAt: new Date("2026-05-02T14:30:00Z"),
      actorName: "John SA",
    },
  ],
  exportedAt: new Date("2026-05-23T08:00:00Z"),
  exportedByName: "Jane PM",
};

describe("dispute export", () => {
  it("builds non-empty PDF and DOCX buffers", async () => {
    const pdf = await buildDisputePdf(sampleBundle);
    const docx = await buildDisputeDocx(sampleBundle);

    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
    expect(pdf.length).toBeGreaterThan(2000);
    expect(docx.length).toBeGreaterThan(2000);
    expect(docx.subarray(0, 2).toString()).toBe("PK");
  });

  it("derives stable filenames", () => {
    expect(disputeExportFilename(sampleBundle.dispute.id, "pdf")).toMatch(
      /^dispute-aaaaaaaa-2026-\d{2}-\d{2}\.pdf$/,
    );
    expect(
      parseExportFilename('attachment; filename="dispute-test.pdf"', "fallback.pdf"),
    ).toBe("dispute-test.pdf");
  });
});

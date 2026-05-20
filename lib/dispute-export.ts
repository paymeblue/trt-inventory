import {
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import PDFDocument from "pdfkit";
import type { DisputeExportBundle } from "@/lib/dispute-bundle";
import {
  disputeCategoryLabel,
  disputePriorityLabel,
  disputeStatusLabel,
} from "@/lib/dispute-labels";
import { formatEventTypeLabel } from "@/lib/dispute-labels";
import type {
  DisputeCategory,
  DisputePriority,
  DisputeStatus,
} from "@/db/schema";

function fmt(d: Date | null | undefined): string {
  if (!d) return "—";
  return d.toLocaleString("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function metaRows(bundle: DisputeExportBundle): [string, string][] {
  const d = bundle.dispute;
  return [
    ["Reference ID", d.id],
    ["Status", disputeStatusLabel(d.status as DisputeStatus)],
    ["Priority", disputePriorityLabel(d.priority as DisputePriority)],
    [
      "Category",
      disputeCategoryLabel(d.category as DisputeCategory | null),
    ],
    ["Opened by", d.creatorName ?? "—"],
    ["Assignee", d.assigneeName ?? "—"],
    ["Opened", fmt(d.createdAt)],
    ["Last updated", fmt(d.updatedAt)],
    ["Project", d.projectName ?? d.projectId ?? "—"],
    ["Order", d.orderLabel ?? "—"],
    ["Resolved", fmt(d.resolvedAt)],
    ["Resolver", d.resolverName ?? "—"],
    ["Closed", fmt(d.closedAt)],
    ["Exported by", bundle.exportedByName],
    ["Exported at", fmt(bundle.exportedAt)],
  ];
}

export async function buildDisputeDocx(
  bundle: DisputeExportBundle,
): Promise<Buffer> {
  const d = bundle.dispute;
  const children: (Paragraph | Table)[] = [
    new Paragraph({
      text: "TRT Inventory — Dispute Record",
      heading: HeadingLevel.TITLE,
    }),
    new Paragraph({
      text: d.title,
      heading: HeadingLevel.HEADING_1,
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: "This document is generated for audit and evidence purposes. ",
          italics: true,
        }),
        new TextRun({
          text: `Reference ${d.id}`,
          bold: true,
        }),
      ],
    }),
    new Paragraph({ text: "Case summary", heading: HeadingLevel.HEADING_2 }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: metaRows(bundle).map(
        ([label, value]) =>
          new TableRow({
            children: [
              new TableCell({
                children: [new Paragraph({ children: [new TextRun({ text: label, bold: true })] })],
              }),
              new TableCell({
                children: [new Paragraph(value)],
              }),
            ],
          }),
      ),
    }),
    new Paragraph({ text: "Initial report", heading: HeadingLevel.HEADING_2 }),
    new Paragraph({ text: d.description }),
  ];

  if (d.resolutionSummary) {
    children.push(
      new Paragraph({ text: "Resolution", heading: HeadingLevel.HEADING_2 }),
      new Paragraph({ text: d.resolutionSummary }),
    );
  }

  children.push(
    new Paragraph({ text: "Conversation", heading: HeadingLevel.HEADING_2 }),
  );
  if (bundle.messages.length === 0) {
    children.push(new Paragraph({ text: "(No messages)" }));
  } else {
    for (const m of bundle.messages) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: `${m.authorName ?? "Unknown"} — `, bold: true }),
            new TextRun({ text: fmt(m.createdAt), italics: true }),
          ],
        }),
        new Paragraph({ text: m.body }),
        new Paragraph({ text: "" }),
      );
    }
  }

  children.push(
    new Paragraph({ text: "Audit trail", heading: HeadingLevel.HEADING_2 }),
  );
  if (bundle.events.length === 0) {
    children.push(new Paragraph({ text: "(No events recorded)" }));
  } else {
    for (const ev of bundle.events) {
      const detail =
        ev.detail && typeof ev.detail === "object"
          ? JSON.stringify(ev.detail)
          : "";
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: fmt(ev.createdAt), italics: true }),
            new TextRun({ text: ` · ${formatEventTypeLabel(ev.eventType)}` }),
            new TextRun({
              text: ev.actorName ? ` · ${ev.actorName}` : "",
            }),
          ],
        }),
      );
      if (detail) {
        children.push(new Paragraph({ text: detail, style: "IntenseQuote" }));
      }
    }
  }

  const doc = new Document({ sections: [{ children }] });
  return Packer.toBuffer(doc);
}

export function buildDisputePdf(bundle: DisputeExportBundle): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: "A4" });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c as Buffer));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const d = bundle.dispute;

    doc
      .fontSize(18)
      .fillColor("#0f172a")
      .text("TRT Inventory — Dispute Record", { underline: false });
    doc.moveDown(0.5);
    doc.fontSize(14).text(d.title);
    doc.moveDown(0.3);
    doc
      .fontSize(9)
      .fillColor("#64748b")
      .text(
        `Reference ${d.id} · Generated ${fmt(bundle.exportedAt)} by ${bundle.exportedByName}`,
      );
    doc.moveDown(1);

    doc.fontSize(11).fillColor("#0f172a").text("Case summary", { underline: true });
    doc.moveDown(0.4);
    doc.fontSize(10).fillColor("#334155");
    for (const [label, value] of metaRows(bundle)) {
      doc.text(`${label}: ${value}`);
    }
    doc.moveDown(1);

    doc.fontSize(11).fillColor("#0f172a").text("Initial report", { underline: true });
    doc.moveDown(0.4);
    doc.fontSize(10).fillColor("#334155").text(d.description, { align: "left" });
    doc.moveDown(1);

    if (d.resolutionSummary) {
      doc.fontSize(11).fillColor("#0f172a").text("Resolution", { underline: true });
      doc.moveDown(0.4);
      doc.fontSize(10).fillColor("#166534").text(d.resolutionSummary);
      doc.moveDown(1);
    }

    doc.fontSize(11).fillColor("#0f172a").text("Conversation", { underline: true });
    doc.moveDown(0.4);
    if (bundle.messages.length === 0) {
      doc.fontSize(10).fillColor("#64748b").text("(No messages)");
    } else {
      for (const m of bundle.messages) {
        doc
          .fontSize(9)
          .fillColor("#64748b")
          .text(`${m.authorName ?? "Unknown"} · ${fmt(m.createdAt)}`);
        doc.fontSize(10).fillColor("#0f172a").text(m.body);
        doc.moveDown(0.6);
      }
    }
    doc.moveDown(0.5);

    doc.fontSize(11).fillColor("#0f172a").text("Audit trail", { underline: true });
    doc.moveDown(0.4);
    if (bundle.events.length === 0) {
      doc.fontSize(10).fillColor("#64748b").text("(No events recorded)");
    } else {
      for (const ev of bundle.events) {
        let line = `${fmt(ev.createdAt)} — ${formatEventTypeLabel(ev.eventType)}`;
        if (ev.actorName) line += ` (${ev.actorName})`;
        doc.fontSize(9).fillColor("#64748b").text(line);
        if (ev.detail && typeof ev.detail === "object") {
          doc
            .fontSize(8)
            .fillColor("#94a3b8")
            .text(JSON.stringify(ev.detail));
        }
        doc.moveDown(0.3);
      }
    }

    doc.moveDown(1);
    doc
      .fontSize(8)
      .fillColor("#94a3b8")
      .text(
        "Confidential — retain for internal dispute resolution and evidence. Do not alter after export.",
        { align: "center" },
      );

    doc.end();
  });
}

export function disputeExportFilename(
  disputeId: string,
  format: "pdf" | "docx",
): string {
  const short = disputeId.replace(/-/g, "").slice(0, 8);
  const stamp = new Date().toISOString().slice(0, 10);
  return `dispute-${short}-${stamp}.${format}`;
}

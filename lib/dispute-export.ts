import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  ShadingType,
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
  formatEventTypeLabel,
} from "@/lib/dispute-labels";
import type {
  DisputeCategory,
  DisputePriority,
  DisputeStatus,
} from "@/db/schema";

type PDFDocumentType = InstanceType<typeof PDFDocument>;

const BRAND = "TRT Inventory";
const FOOTER =
  "Confidential — retain for internal dispute resolution and evidence. Do not alter after export.";

const PDF_COLORS = {
  title: "#0f172a",
  muted: "#64748b",
  label: "#475569",
  body: "#1e293b",
  rule: "#e2e8f0",
  sectionBg: "#f1f5f9",
  accent: "#166534",
} as const;

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

function formatEventDetail(
  eventType: string,
  detail: unknown,
): string | null {
  if (!detail || typeof detail !== "object") return null;
  const d = detail as Record<string, unknown>;

  switch (eventType) {
    case "status_changed":
      return `Status: ${disputeStatusLabel(String(d.from) as DisputeStatus)} → ${disputeStatusLabel(String(d.to) as DisputeStatus)}`;
    case "priority_changed":
      return `Priority: ${disputePriorityLabel(String(d.from) as DisputePriority)} → ${disputePriorityLabel(String(d.to) as DisputePriority)}`;
    case "category_set":
      return `Category: ${disputeCategoryLabel((d.category as DisputeCategory | null) ?? null)}`;
    case "assigned":
      return d.assignedToId
        ? `Assigned to user ${String(d.assignedToId)}`
        : "Assignee cleared";
    case "resolution_recorded":
      return typeof d.summary === "string" ? d.summary : null;
    case "reopened":
      return `Reopened from ${disputeStatusLabel(String(d.from) as DisputeStatus)}`;
    default:
      return null;
  }
}

function docxLabelCell(text: string): TableCell {
  return new TableCell({
    width: { size: 32, type: WidthType.PERCENTAGE },
    shading: { fill: "F8FAFC", type: ShadingType.CLEAR },
    margins: { top: 100, bottom: 100, left: 140, right: 100 },
    children: [
      new Paragraph({
        children: [
          new TextRun({
            text,
            bold: true,
            size: 18,
            color: "475569",
          }),
        ],
      }),
    ],
  });
}

function docxValueCell(text: string): TableCell {
  return new TableCell({
    width: { size: 68, type: WidthType.PERCENTAGE },
    margins: { top: 100, bottom: 100, left: 100, right: 140 },
    children: [
      new Paragraph({
        children: [new TextRun({ text, size: 20, color: "0F172A" })],
      }),
    ],
  });
}

function docxMetaTable(rows: [string, string][]): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: rows.map(
      ([label, value]) =>
        new TableRow({
          children: [docxLabelCell(label), docxValueCell(value)],
        }),
    ),
  });
}

function docxSectionHeading(text: string): Paragraph {
  return new Paragraph({
    text,
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 280, after: 160 },
  });
}

function docxBody(text: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, size: 22, color: "1E293B" })],
    spacing: { after: 160, line: 276 },
  });
}

export async function buildDisputeDocx(
  bundle: DisputeExportBundle,
): Promise<Buffer> {
  const d = bundle.dispute;
  const children: (Paragraph | Table)[] = [
    new Paragraph({
      text: `${BRAND} — Dispute Record`,
      heading: HeadingLevel.TITLE,
      spacing: { after: 120 },
    }),
    new Paragraph({
      text: d.title,
      heading: HeadingLevel.HEADING_1,
      spacing: { after: 200 },
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: "Generated for audit and evidence purposes. ",
          italics: true,
          size: 20,
          color: "64748B",
        }),
        new TextRun({
          text: `Reference ${d.id}`,
          bold: true,
          size: 20,
          color: "64748B",
        }),
      ],
      spacing: { after: 240 },
    }),
    docxSectionHeading("Case summary"),
    docxMetaTable(metaRows(bundle)),
    docxSectionHeading("Initial report"),
    docxBody(d.description),
  ];

  if (d.resolutionSummary) {
    children.push(
      docxSectionHeading("Resolution"),
      new Paragraph({
        children: [
          new TextRun({
            text: d.resolutionSummary,
            size: 22,
            color: "166534",
          }),
        ],
        spacing: { after: 160, line: 276 },
      }),
    );
  }

  children.push(docxSectionHeading("Conversation"));
  if (bundle.messages.length === 0) {
    children.push(docxBody("(No messages)"));
  } else {
    for (const m of bundle.messages) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: m.authorName ?? "Unknown",
              bold: true,
              size: 20,
              color: "334155",
            }),
            new TextRun({
              text: ` · ${fmt(m.createdAt)}`,
              italics: true,
              size: 18,
              color: "64748B",
            }),
          ],
          spacing: { before: 180, after: 80 },
        }),
        docxBody(m.body),
      );
    }
  }

  children.push(docxSectionHeading("Audit trail"));
  if (bundle.events.length === 0) {
    children.push(docxBody("(No events recorded)"));
  } else {
    children.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            tableHeader: true,
            children: [
              new TableCell({
                width: { size: 22, type: WidthType.PERCENTAGE },
                shading: { fill: "F1F5F9", type: ShadingType.CLEAR },
                children: [
                  new Paragraph({
                    children: [
                      new TextRun({ text: "When", bold: true, size: 18 }),
                    ],
                  }),
                ],
              }),
              new TableCell({
                width: { size: 28, type: WidthType.PERCENTAGE },
                shading: { fill: "F1F5F9", type: ShadingType.CLEAR },
                children: [
                  new Paragraph({
                    children: [
                      new TextRun({ text: "Event", bold: true, size: 18 }),
                    ],
                  }),
                ],
              }),
              new TableCell({
                width: { size: 18, type: WidthType.PERCENTAGE },
                shading: { fill: "F1F5F9", type: ShadingType.CLEAR },
                children: [
                  new Paragraph({
                    children: [
                      new TextRun({ text: "Actor", bold: true, size: 18 }),
                    ],
                  }),
                ],
              }),
              new TableCell({
                width: { size: 32, type: WidthType.PERCENTAGE },
                shading: { fill: "F1F5F9", type: ShadingType.CLEAR },
                children: [
                  new Paragraph({
                    children: [
                      new TextRun({ text: "Details", bold: true, size: 18 }),
                    ],
                  }),
                ],
              }),
            ],
          }),
          ...bundle.events.map((ev) => {
            const detail = formatEventDetail(ev.eventType, ev.detail);
            return new TableRow({
              children: [
                docxValueCell(fmt(ev.createdAt)),
                docxValueCell(formatEventTypeLabel(ev.eventType)),
                docxValueCell(ev.actorName ?? "—"),
                docxValueCell(detail ?? "—"),
              ],
            });
          }),
        ],
      }),
    );
  }

  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: FOOTER,
          italics: true,
          size: 16,
          color: "94A3B8",
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { before: 360 },
    }),
  );

  const doc = new Document({
    sections: [{ properties: {}, children }],
  });
  return Packer.toBuffer(doc);
}

function pdfContentWidth(doc: PDFDocumentType): number {
  return doc.page.width - doc.page.margins.left - doc.page.margins.right;
}

function pdfDrawRule(doc: PDFDocumentType, y: number): void {
  doc
    .moveTo(doc.page.margins.left, y)
    .lineTo(doc.page.width - doc.page.margins.right, y)
    .strokeColor(PDF_COLORS.rule)
    .lineWidth(0.5)
    .stroke();
}

function pdfSectionHeader(doc: PDFDocumentType, title: string): void {
  doc.moveDown(0.6);
  const x = doc.page.margins.left;
  const width = pdfContentWidth(doc);
  const y = doc.y;
  doc.rect(x, y, width, 22).fill(PDF_COLORS.sectionBg);
  doc
    .fillColor(PDF_COLORS.title)
    .font("Helvetica-Bold")
    .fontSize(11)
    .text(title, x + 8, y + 6, { width: width - 16 });
  doc.y = y + 30;
}

function pdfKeyValueTable(
  doc: PDFDocumentType,
  rows: [string, string][],
): void {
  const x = doc.page.margins.left;
  const labelWidth = 130;
  const valueWidth = pdfContentWidth(doc) - labelWidth;

  for (const [label, value] of rows) {
    const rowY = doc.y;
    doc
      .font("Helvetica-Bold")
      .fontSize(9)
      .fillColor(PDF_COLORS.label)
      .text(label, x, rowY, { width: labelWidth, lineGap: 2 });
    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor(PDF_COLORS.body)
      .text(value, x + labelWidth, rowY, { width: valueWidth, lineGap: 2 });
    doc.y = Math.max(doc.y, rowY + 14);
    pdfDrawRule(doc, doc.y + 2);
    doc.y += 10;
  }
}

function pdfMessageBlock(
  doc: PDFDocumentType,
  author: string,
  when: string,
  body: string,
): void {
  const x = doc.page.margins.left;
  const width = pdfContentWidth(doc);

  doc
    .font("Helvetica-Bold")
    .fontSize(9)
    .fillColor(PDF_COLORS.label)
    .text(`${author} · ${when}`, x);
  doc.moveDown(0.15);

  const padX = 10;
  const padY = 8;
  const textWidth = width - padX * 2;
  doc.font("Helvetica").fontSize(10).fillColor(PDF_COLORS.body);
  const textHeight = doc.heightOfString(body, { width: textWidth });
  const boxY = doc.y;
  const boxHeight = textHeight + padY * 2;

  doc
    .roundedRect(x, boxY, width, boxHeight, 4)
    .strokeColor(PDF_COLORS.rule)
    .lineWidth(1)
    .stroke();
  doc.text(body, x + padX, boxY + padY, { width: textWidth, lineGap: 2 });
  doc.y = boxY + boxHeight + 10;
}

function pdfAuditTable(doc: PDFDocumentType, bundle: DisputeExportBundle): void {
  const x = doc.page.margins.left;
  const width = pdfContentWidth(doc);
  const cols = [0.22, 0.26, 0.16, 0.36];
  const colWidths = cols.map((f) => width * f);

  const drawHeader = () => {
    const y = doc.y;
    doc.rect(x, y, width, 18).fill(PDF_COLORS.sectionBg);
    doc.font("Helvetica-Bold").fontSize(8).fillColor(PDF_COLORS.label);
    let cx = x + 6;
    for (const [label, w] of [
      ["When", colWidths[0]],
      ["Event", colWidths[1]],
      ["Actor", colWidths[2]],
      ["Details", colWidths[3]],
    ] as const) {
      doc.text(label, cx, y + 5, { width: w - 8 });
      cx += w;
    }
    doc.y = y + 22;
  };

  drawHeader();

  for (const ev of bundle.events) {
    const detail = formatEventDetail(ev.eventType, ev.detail) ?? "—";
    const rowTexts = [
      fmt(ev.createdAt),
      formatEventTypeLabel(ev.eventType),
      ev.actorName ?? "—",
      detail,
    ];
    const heights = rowTexts.map((text, i) =>
      doc.heightOfString(text, { width: colWidths[i]! - 8, lineGap: 1 }),
    );
    const rowHeight = Math.max(...heights, 12) + 10;

    if (doc.y + rowHeight > doc.page.height - doc.page.margins.bottom - 50) {
      doc.addPage();
      drawHeader();
    }

    const rowY = doc.y;
    pdfDrawRule(doc, rowY);
    doc.font("Helvetica").fontSize(8).fillColor(PDF_COLORS.body);
    let cx = x + 6;
    for (let i = 0; i < rowTexts.length; i++) {
      doc.text(rowTexts[i]!, cx, rowY + 5, {
        width: colWidths[i]! - 8,
        lineGap: 1,
      });
      cx += colWidths[i]!;
    }
    doc.y = rowY + rowHeight;
  }
}

function pdfAddFooters(doc: PDFDocumentType): void {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const x = doc.page.margins.left;
    const width = pdfContentWidth(doc);
    const footerY = doc.page.height - 42;
    pdfDrawRule(doc, footerY - 6);
    doc
      .font("Helvetica")
      .fontSize(8)
      .fillColor(PDF_COLORS.muted)
      .text(FOOTER, x, footerY, { width, align: "center", lineGap: 1 });
    doc.text(`Page ${i + 1} of ${range.count}`, x, footerY + 14, {
      width,
      align: "right",
    });
  }
}

export function buildDisputePdf(bundle: DisputeExportBundle): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      margin: 48,
      size: "A4",
      bufferPages: true,
      info: {
        Title: `${BRAND} — ${bundle.dispute.title}`,
        Author: bundle.exportedByName,
        Subject: `Dispute record ${bundle.dispute.id}`,
      },
    });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c as Buffer));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const d = bundle.dispute;
    const x = doc.page.margins.left;
    const width = pdfContentWidth(doc);

    doc
      .font("Helvetica-Bold")
      .fontSize(16)
      .fillColor(PDF_COLORS.title)
      .text(`${BRAND} — Dispute Record`, x);
    doc.moveDown(0.35);
    doc.font("Helvetica-Bold").fontSize(13).text(d.title, x, doc.y, { width });
    doc.moveDown(0.25);
    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor(PDF_COLORS.muted)
      .text(
        `Reference ${d.id} · Exported ${fmt(bundle.exportedAt)} by ${bundle.exportedByName}`,
        x,
        doc.y,
        { width },
      );
    doc.moveDown(0.8);
    pdfDrawRule(doc, doc.y);
    doc.moveDown(0.6);

    pdfSectionHeader(doc, "Case summary");
    pdfKeyValueTable(doc, metaRows(bundle));

    pdfSectionHeader(doc, "Initial report");
    doc
      .font("Helvetica")
      .fontSize(10)
      .fillColor(PDF_COLORS.body)
      .text(d.description, x, doc.y, { width, lineGap: 2 });
    doc.moveDown(0.8);

    if (d.resolutionSummary) {
      pdfSectionHeader(doc, "Resolution");
      doc
        .font("Helvetica")
        .fontSize(10)
        .fillColor(PDF_COLORS.accent)
        .text(d.resolutionSummary, x, doc.y, { width, lineGap: 2 });
      doc.moveDown(0.8);
    }

    pdfSectionHeader(doc, "Conversation");
    if (bundle.messages.length === 0) {
      doc
        .font("Helvetica")
        .fontSize(10)
        .fillColor(PDF_COLORS.muted)
        .text("(No messages)", x);
    } else {
      for (const m of bundle.messages) {
        if (doc.y > doc.page.height - doc.page.margins.bottom - 80) {
          doc.addPage();
        }
        pdfMessageBlock(
          doc,
          m.authorName ?? "Unknown",
          fmt(m.createdAt),
          m.body,
        );
      }
    }

    pdfSectionHeader(doc, "Audit trail");
    if (bundle.events.length === 0) {
      doc
        .font("Helvetica")
        .fontSize(10)
        .fillColor(PDF_COLORS.muted)
        .text("(No events recorded)", x);
    } else {
      pdfAuditTable(doc, bundle);
    }

    pdfAddFooters(doc);
    doc.end();
  });
}

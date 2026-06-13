import { NextResponse, type NextRequest } from "next/server";
import path from "node:path";
import fs from "node:fs";
import { and, asc, eq, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { orders, products, users } from "@/db/schema";
import { requireUserAny } from "@/lib/auth-guard";
import { handleError } from "@/lib/api";
import type { Paragraph as DocxParagraph } from "docx";

// ─── Letterhead ───────────────────────────────────────────────────────────────

const COMPANY = "TRT Arredo";
const PHONE = "(+234) 902 572 1890";
const EMAIL = "info@trtarredo.com";
const ADDR_LAGOS = "GALCON House, Plot 2 Block 113, Lekki Phase 1, Lagos.";
const ADDR_ABUJA = "4th Floor, KOJO Motors, Plot 1209 Kado Road, Mabushi, Abuja.";
const LOGO_PATH = path.join(process.cwd(), "public", "trt-logo.png");
const HEADER_BG = "#0f2540";
const ACCENT = "#1d6fa4";

// ─── Data ─────────────────────────────────────────────────────────────────────

interface ReportItem {
  line: number;
  sku: string;
  productName: string;
  barcode: string;
  scannedBy: string;
  scannedAt: string;
}

interface ReportEntry {
  orderId: string;
  projectName: string;
  pm: string;
  receiver: string;
  logisticsVerifier: string;
  fulfilledAt: Date;
  items: ReportItem[];
}

async function fetchReportData(orderId?: string): Promise<ReportEntry[]> {
  const fulfilledOrders = await db.query.orders.findMany({
    where: and(
      isNotNull(orders.fulfilledAt),
      eq(orders.isLogisticsGate, false),
      ...(orderId ? [eq(orders.id, orderId)] : []),
    ),
    with: { items: true, project: true },
    orderBy: [asc(orders.fulfilledAt)],
  });

  const entries: ReportEntry[] = [];

  for (const o of fulfilledOrders) {
    // Build sku → product name map for this project
    const projectProds = o.project
      ? await db.query.products.findMany({
          where: eq(products.projectId, o.project.id),
          columns: { sku: true, name: true },
        })
      : [];
    const nameMap = new Map(projectProds.map((p) => [p.sku, p.name]));

    // Receiver
    let receiver = "Unassigned";
    if (o.project?.installerUserId) {
      const u = await db.query.users.findFirst({
        where: eq(users.id, o.project.installerUserId),
        columns: { name: true },
      });
      if (u) receiver = u.name;
    }

    // Logistics verifier from gate order
    let logisticsVerifier = "—";
    const gateOrder = await db.query.orders.findFirst({
      where: and(eq(orders.projectId, o.projectId), eq(orders.isLogisticsGate, true)),
      with: { items: true },
    });
    const verifier = gateOrder?.items.find((i) => i.logisticsScannedBy)?.logisticsScannedBy;
    if (verifier) logisticsVerifier = verifier;

    entries.push({
      orderId: o.id,
      projectName: o.project?.name ?? "Unknown",
      pm: o.createdBy,
      receiver,
      logisticsVerifier,
      fulfilledAt: o.fulfilledAt!,
      items: o.items.map((i, idx) => ({
        line: idx + 1,
        sku: i.productId,
        productName: nameMap.get(i.productId) ?? i.productId,
        barcode: i.barcode,
        scannedBy: i.scannedBy ?? "—",
        scannedAt: i.scannedAt ? new Date(i.scannedAt).toLocaleString() : "—",
      })),
    });
  }

  return entries;
}

// ─── PDF ──────────────────────────────────────────────────────────────────────

async function buildPdf(entries: ReportEntry[]): Promise<Buffer> {
  const PDFDocument = (await import("pdfkit")).default;

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 0, autoFirstPage: true });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const W = doc.page.width;
    const M = 40;

    function drawLetterhead() {
      // Header band
      doc.rect(0, 0, W, 100).fill(HEADER_BG);

      if (fs.existsSync(LOGO_PATH)) {
        doc.image(LOGO_PATH, M, 16, { width: 130 });
      }

      // Contact block — right aligned
      doc
        .fillColor("#ffffff")
        .font("Helvetica-Bold")
        .fontSize(8)
        .text(PHONE, 0, 20, { align: "right", width: W - M })
        .font("Helvetica")
        .fontSize(7)
        .text(EMAIL, 0, 32, { align: "right", width: W - M })
        .text(`Lagos: ${ADDR_LAGOS}`, 0, 44, { align: "right", width: W - M })
        .text(`Abuja: ${ADDR_ABUJA}`, 0, 56, { align: "right", width: W - M });

      doc.y = 112;
      doc.x = M;
    }

    function drawOrderPage(entry: ReportEntry, isFirst: boolean) {
      if (!isFirst) {
        doc.addPage({ margin: 0 });
      }

      drawLetterhead();

      const y0 = doc.y;

      // Order meta block
      doc
        .fillColor(ACCENT)
        .font("Helvetica-Bold")
        .fontSize(11)
        .text("DELIVERY VERIFICATION REPORT", M, y0);

      doc.moveDown(0.4);

      const metaY = doc.y;
      doc
        .fillColor("#333333")
        .font("Helvetica-Bold")
        .fontSize(8)
        .text("Order ID:", M, metaY)
        .font("Helvetica")
        .text(entry.orderId.slice(0, 8).toUpperCase(), M + 52, metaY);

      doc
        .font("Helvetica-Bold")
        .text("Project:", M, metaY + 14)
        .font("Helvetica")
        .text(entry.projectName, M + 52, metaY + 14);

      doc
        .font("Helvetica-Bold")
        .text("Fulfilled:", M, metaY + 28)
        .font("Helvetica")
        .text(new Date(entry.fulfilledAt).toLocaleString(), M + 52, metaY + 28);

      // Section heading: Items
      const itemsY = metaY + 52;
      doc.rect(M, itemsY, W - M * 2, 16).fill(ACCENT);
      doc
        .fillColor("#ffffff")
        .font("Helvetica-Bold")
        .fontSize(7)
        .text("ITEMS DELIVERED", M + 4, itemsY + 5);

      // Column positions
      const C = {
        no: M + 2,
        sku: M + 26,
        name: M + 90,
        barcode: M + 230,
        by: M + 340,
        at: M + 415,
      };
      const COL_W = { no: 24, sku: 62, name: 138, barcode: 108, by: 73, at: W - M - 415 };
      const ROW_H = 16;

      // Column headers
      const colHdrY = itemsY + 16;
      doc.rect(M, colHdrY, W - M * 2, ROW_H).fill("#e8edf2");
      doc
        .fillColor("#444444")
        .font("Helvetica-Bold")
        .fontSize(6.5);

      (
        [
          ["#", C.no, COL_W.no],
          ["SKU", C.sku, COL_W.sku],
          ["Product Name", C.name, COL_W.name],
          ["Barcode", C.barcode, COL_W.barcode],
          ["Verified By", C.by, COL_W.by],
          ["Verified At", C.at, COL_W.at],
        ] as [string, number, number][]
      ).forEach(([label, x, w]) => {
        doc.text(label, x, colHdrY + 5, { width: w, lineBreak: false });
      });

      // Item rows
      let rowY = colHdrY + ROW_H;
      entry.items.forEach((item, idx) => {
        const shade = idx % 2 === 0;
        doc.rect(M, rowY, W - M * 2, ROW_H).fill(shade ? "#f7f9fb" : "#ffffff");
        doc.fillColor("#222222").font("Helvetica").fontSize(6.5);

        (
          [
            [String(item.line), C.no, COL_W.no],
            [item.sku, C.sku, COL_W.sku],
            [item.productName, C.name, COL_W.name],
            [item.barcode, C.barcode, COL_W.barcode],
            [item.scannedBy, C.by, COL_W.by],
            [item.scannedAt, C.at, COL_W.at],
          ] as [string, number, number][]
        ).forEach(([val, x, w]) => {
          doc.text(val, x, rowY + 5, { width: w, lineBreak: false, ellipsis: true });
        });
        rowY += ROW_H;
      });

      // Table border
      doc.rect(M, itemsY, W - M * 2, rowY - itemsY).stroke("#c8d4e0");

      // Personnel section
      const perY = rowY + 20;
      doc.rect(M, perY, W - M * 2, 16).fill(HEADER_BG);
      doc
        .fillColor("#ffffff")
        .font("Helvetica-Bold")
        .fontSize(7)
        .text("VERIFICATION PERSONNEL", M + 4, perY + 5);

      const perDataY = perY + 20;
      const COL2 = W / 2;

      const personnel: [string, string][] = [
        ["Project Manager", entry.pm],
        ["Logistics Verifier", entry.logisticsVerifier],
        ["Receiver / Installer", entry.receiver],
      ];

      personnel.forEach(([role, name], idx) => {
        const x = idx % 2 === 0 ? M : COL2;
        const y = perDataY + Math.floor(idx / 2) * 24;
        doc
          .fillColor("#555555")
          .font("Helvetica-Bold")
          .fontSize(7)
          .text(`${role}:`, x, y, { lineBreak: false });
        doc
          .fillColor("#111111")
          .font("Helvetica")
          .text(`  ${name}`, x + 95, y, { lineBreak: false });
      });

      // Signature lines
      const sigY = perDataY + Math.ceil(personnel.length / 2) * 24 + 20;
      const sigSpacing = (W - M * 2) / 3;

      [["Receiver Signature", M], ["PM Signature", M + sigSpacing], ["Date", M + sigSpacing * 2]].forEach(
        ([label, x]) => {
          doc
            .moveTo(x as number, sigY + 20)
            .lineTo((x as number) + sigSpacing - 16, sigY + 20)
            .stroke("#999999");
          doc
            .fillColor("#888888")
            .font("Helvetica")
            .fontSize(6.5)
            .text(label as string, x as number, sigY + 24, {
              width: sigSpacing - 16,
              lineBreak: false,
            });
        },
      );

      // Footer
      doc
        .fillColor("#bbbbbb")
        .font("Helvetica")
        .fontSize(6.5)
        .text(`${COMPANY} · Confidential · ${new Date().toLocaleDateString()}`, M, doc.page.height - 20, {
          align: "center",
          width: W - M * 2,
        });
    }

    entries.forEach((entry, idx) => drawOrderPage(entry, idx === 0));
    doc.end();
  });
}

// ─── XLSX ──────────────────────────────────────────────────────────────────────

async function buildXlsx(entries: ReportEntry[]): Promise<Buffer> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = COMPANY;

  for (const entry of entries) {
    const sheetName = entry.projectName.slice(0, 28).replace(/[\\/?*[\]:]/g, "_");
    const ws = wb.addWorksheet(sheetName, {
      pageSetup: { paperSize: 9, orientation: "landscape" },
    });

    // Letterhead
    ws.mergeCells("A1:H2");
    ws.getCell("A1").value = `${COMPANY} — Delivery Verification Report`;
    ws.getCell("A1").font = { name: "Calibri", size: 14, bold: true, color: { argb: "FFFFFFFF" } };
    ws.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F2540" } };
    ws.getCell("A1").alignment = { vertical: "middle", horizontal: "left", indent: 1 };
    ws.getRow(1).height = 28;
    ws.getRow(2).height = 6;

    ws.mergeCells("A3:H3");
    ws.getCell("A3").value = `${PHONE}  |  ${EMAIL}  |  Lagos: ${ADDR_LAGOS}  |  Abuja: ${ADDR_ABUJA}`;
    ws.getCell("A3").font = { name: "Calibri", size: 7, color: { argb: "FF0F2540" } };
    ws.getRow(3).height = 12;

    // Order meta
    ws.getRow(4).height = 8;

    const metaRows: [string, string][] = [
      ["Order ID", entry.orderId.slice(0, 8).toUpperCase()],
      ["Project", entry.projectName],
      ["Fulfilled", new Date(entry.fulfilledAt).toLocaleString()],
    ];

    let r = 5;
    for (const [label, value] of metaRows) {
      ws.mergeCells(`B${r}:D${r}`);
      ws.getCell(`A${r}`).value = label;
      ws.getCell(`A${r}`).font = { bold: true, name: "Calibri", size: 9 };
      ws.getCell(`B${r}`).value = value;
      ws.getCell(`B${r}`).font = { name: "Calibri", size: 9 };
      ws.getRow(r).height = 14;
      r++;
    }

    r++; // blank spacer

    // Items heading
    ws.mergeCells(`A${r}:H${r}`);
    ws.getCell(`A${r}`).value = "ITEMS DELIVERED";
    ws.getCell(`A${r}`).font = { bold: true, color: { argb: "FFFFFFFF" }, name: "Calibri", size: 9 };
    ws.getCell(`A${r}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1D6FA4" } };
    ws.getRow(r).height = 16;
    r++;

    // Item column headers
    const ITEM_COLS = ["#", "SKU", "Product Name", "Barcode", "Verified By", "Verified At"];
    const ITEM_WIDTHS = [5, 14, 32, 22, 18, 20];
    ws.columns = ITEM_COLS.map((_, i) => ({ width: ITEM_WIDTHS[i] }));

    ITEM_COLS.forEach((h, ci) => {
      const cell = ws.getRow(r).getCell(ci + 1);
      cell.value = h;
      cell.font = { bold: true, color: { argb: "FFFFFFFF" }, name: "Calibri", size: 8 };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2D4A6A" } };
      cell.alignment = { horizontal: "center", vertical: "middle" };
    });
    ws.getRow(r).height = 16;
    r++;

    // Item rows
    entry.items.forEach((item, idx) => {
      const row = ws.getRow(r);
      [item.line, item.sku, item.productName, item.barcode, item.scannedBy, item.scannedAt].forEach(
        (val, ci) => {
          const cell = row.getCell(ci + 1);
          cell.value = val;
          cell.font = { name: "Calibri", size: 8 };
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: idx % 2 === 0 ? "FFF7F9FB" : "FFFFFFFF" },
          };
          cell.border = { bottom: { style: "hair", color: { argb: "FFCCD4DD" } } };
        },
      );
      row.height = 14;
      r++;
    });

    r++; // spacer before personnel

    // Personnel heading
    ws.mergeCells(`A${r}:H${r}`);
    ws.getCell(`A${r}`).value = "VERIFICATION PERSONNEL";
    ws.getCell(`A${r}`).font = { bold: true, color: { argb: "FFFFFFFF" }, name: "Calibri", size: 9 };
    ws.getCell(`A${r}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F2540" } };
    ws.getRow(r).height = 16;
    r++;

    const personnel: [string, string][] = [
      ["Project Manager", entry.pm],
      ["Logistics Verifier", entry.logisticsVerifier],
      ["Receiver / Installer", entry.receiver],
    ];

    for (const [role, name] of personnel) {
      ws.getCell(`A${r}`).value = role;
      ws.getCell(`A${r}`).font = { bold: true, name: "Calibri", size: 9 };
      ws.mergeCells(`B${r}:D${r}`);
      ws.getCell(`B${r}`).value = name;
      ws.getCell(`B${r}`).font = { name: "Calibri", size: 9 };
      ws.getRow(r).height = 14;
      r++;
    }

    // Signature rows
    r++;
    ws.mergeCells(`A${r}:C${r}`);
    ws.getCell(`A${r}`).value = "Receiver Signature: ______________________";
    ws.getCell(`A${r}`).font = { name: "Calibri", size: 9, color: { argb: "FF777777" } };

    ws.mergeCells(`D${r}:F${r}`);
    ws.getCell(`D${r}`).value = "PM Signature: ______________________";
    ws.getCell(`D${r}`).font = { name: "Calibri", size: 9, color: { argb: "FF777777" } };

    ws.mergeCells(`G${r}:H${r}`);
    ws.getCell(`G${r}`).value = "Date: ___________";
    ws.getCell(`G${r}`).font = { name: "Calibri", size: 9, color: { argb: "FF777777" } };
    ws.getRow(r).height = 20;

    // Logo
    if (fs.existsSync(LOGO_PATH)) {
      const imgId = wb.addImage({ filename: LOGO_PATH, extension: "png" });
      ws.addImage(imgId, { tl: { col: 5.5, row: 0 }, ext: { width: 130, height: 44 } });
    }
  }

  return Buffer.from((await wb.xlsx.writeBuffer()) as ArrayBuffer);
}

// ─── DOCX ──────────────────────────────────────────────────────────────────────

async function buildDocx(entries: ReportEntry[]): Promise<Buffer> {
  const {
    Document,
    Packer,
    Paragraph,
    Table,
    TableRow,
    TableCell,
    TextRun,
    HeadingLevel,
    AlignmentType,
    ShadingType,
    WidthType,
    BorderStyle,
    ImageRun,
    Header,
    PageBreak,
  } = await import("docx");

  const logoBuffer = fs.existsSync(LOGO_PATH) ? fs.readFileSync(LOGO_PATH) : null;

  const headerChildren: DocxParagraph[] = [];

  if (logoBuffer) {
    headerChildren.push(
      new Paragraph({
        children: [
          new ImageRun({ data: logoBuffer, transformation: { width: 150, height: 52 }, type: "png" }),
        ],
      }),
    );
  }

  headerChildren.push(
    new Paragraph({
      children: [new TextRun({ text: COMPANY, bold: true, size: 26, color: "0F2540" })],
    }),
    new Paragraph({
      children: [new TextRun({ text: `${PHONE}  |  ${EMAIL}`, size: 14, color: "555555" })],
    }),
    new Paragraph({
      children: [new TextRun({ text: `Lagos: ${ADDR_LAGOS}  |  Abuja: ${ADDR_ABUJA}`, size: 14, color: "555555" })],
    }),
    new Paragraph({ children: [] }),
  );

  const borderNone = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" } as const;
  const borderThin = { style: BorderStyle.SINGLE, size: 1, color: "C8D4E0" } as const;
  const cellBorders = { borders: { top: borderThin, bottom: borderThin, left: borderNone, right: borderNone } };

  function sectionHeading(text: string, color: string) {
    return new Paragraph({
      children: [new TextRun({ text, bold: true, size: 18, color: "FFFFFF" })],
      shading: { type: ShadingType.SOLID, color },
      spacing: { before: 200, after: 0 },
    });
  }

  function metaRow(label: string, value: string) {
    return new Paragraph({
      children: [
        new TextRun({ text: `${label}: `, bold: true, size: 16 }),
        new TextRun({ text: value, size: 16 }),
      ],
      spacing: { before: 60, after: 0 },
    });
  }

  const ITEM_WIDTHS_DXA = [600, 1200, 2400, 1800, 1600, 1800];
  const ITEM_HDRS = ["#", "SKU", "Product Name", "Barcode", "Verified By", "Verified At"];

  function itemTable(items: ReportItem[]) {
    const hdrRow = new TableRow({
      tableHeader: true,
      children: ITEM_HDRS.map((h, i) =>
        new TableCell({
          ...cellBorders,
          shading: { type: ShadingType.SOLID, color: "2D4A6A" },
          width: { size: ITEM_WIDTHS_DXA[i] ?? 1500, type: WidthType.DXA },
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [new TextRun({ text: h, bold: true, color: "FFFFFF", size: 14 })],
            }),
          ],
        }),
      ),
    });

    const dataRows = items.map(
      (item, idx) =>
        new TableRow({
          children: [
            String(item.line),
            item.sku,
            item.productName,
            item.barcode,
            item.scannedBy,
            item.scannedAt,
          ].map(
            (val, i) =>
              new TableCell({
                ...cellBorders,
                shading: { type: ShadingType.SOLID, color: idx % 2 === 0 ? "F7F9FB" : "FFFFFF" },
                width: { size: ITEM_WIDTHS_DXA[i] ?? 1500, type: WidthType.DXA },
                children: [new Paragraph({ children: [new TextRun({ text: val, size: 14 })] })],
              }),
          ),
        }),
    );

    return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [hdrRow, ...dataRows] });
  }

  function personnelTable(entry: ReportEntry) {
    const rows: [string, string][] = [
      ["Project Manager", entry.pm],
      ["Logistics Verifier", entry.logisticsVerifier],
      ["Receiver / Installer", entry.receiver],
    ];
    return new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: rows.map(
        ([role, name]) =>
          new TableRow({
            children: [
              new TableCell({
                ...cellBorders,
                width: { size: 3000, type: WidthType.DXA },
                children: [new Paragraph({ children: [new TextRun({ text: role, bold: true, size: 16 })] })],
              }),
              new TableCell({
                ...cellBorders,
                children: [new Paragraph({ children: [new TextRun({ text: name, size: 16 })] })],
              }),
            ],
          }),
      ),
    });
  }

  // Build document body: one section per order
  const bodyChildren: (typeof Paragraph.prototype | typeof Table.prototype | InstanceType<typeof Paragraph>)[] = [];

  entries.forEach((entry, idx) => {
    if (idx > 0) {
      bodyChildren.push(new Paragraph({ children: [new PageBreak()] }));
    }

    bodyChildren.push(
      new Paragraph({
        children: [new TextRun({ text: "DELIVERY VERIFICATION REPORT", bold: true, size: 22, color: "1D6FA4" })],
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 200, after: 120 },
      }),
      metaRow("Order ID", entry.orderId.slice(0, 8).toUpperCase()),
      metaRow("Project", entry.projectName),
      metaRow("Fulfilled", new Date(entry.fulfilledAt).toLocaleString()),
      new Paragraph({ children: [] }),
      sectionHeading("ITEMS DELIVERED", "1D6FA4"),
      itemTable(entry.items),
      new Paragraph({ children: [] }),
      sectionHeading("VERIFICATION PERSONNEL", "0F2540"),
      personnelTable(entry),
      new Paragraph({ children: [], spacing: { before: 400 } }),
      new Paragraph({
        children: [
          new TextRun({ text: "Receiver Signature: _____________________    ", size: 16, color: "777777" }),
          new TextRun({ text: "PM Signature: _____________________    ", size: 16, color: "777777" }),
          new TextRun({ text: "Date: ___________", size: 16, color: "777777" }),
        ],
      }),
    );
  });

  const doc = new Document({
    sections: [
      {
        headers: { default: new Header({ children: headerChildren }) },
        children: bodyChildren as ConstructorParameters<typeof Document>[0]["sections"][0]["children"],
      },
    ],
  });

  return Packer.toBuffer(doc);
}

// ─── Route ────────────────────────────────────────────────────────────────────

function today() {
  return new Date().toISOString().slice(0, 10);
}

export async function GET(req: NextRequest) {
  const auth = await requireUserAny(["pm", "super_admin", "logistics"]);
  if ("error" in auth) return auth.error;

  try {
    const format = (req.nextUrl.searchParams.get("format") ?? "pdf").toLowerCase();
    const orderId = req.nextUrl.searchParams.get("orderId") ?? undefined;
    const entries = await fetchReportData(orderId);

    if (format === "csv") {
      const escape = (v: string) =>
        v.includes(",") || v.includes('"') || v.includes("\n")
          ? `"${v.replace(/"/g, '""')}"`
          : v;
      const lines = [
        ["Order ID", "Project", "PM", "Receiver", "Logistics Verifier", "Fulfilled", "Line", "SKU", "Product Name", "Barcode", "Verified By", "Verified At"].join(","),
        ...entries.flatMap((e) =>
          e.items.map((i) =>
            [
              escape(e.orderId.slice(0, 8)),
              escape(e.projectName),
              escape(e.pm),
              escape(e.receiver),
              escape(e.logisticsVerifier),
              escape(new Date(e.fulfilledAt).toLocaleString()),
              String(i.line),
              escape(i.sku),
              escape(i.productName),
              escape(i.barcode),
              escape(i.scannedBy),
              escape(i.scannedAt),
            ].join(","),
          ),
        ),
      ];
      return new NextResponse(lines.join("\n"), {
        headers: {
          "Content-Type": "text/csv;charset=utf-8;",
          "Content-Disposition": `attachment; filename="trt-report-${today()}.csv"`,
        },
      });
    }

    if (format === "xlsx") {
      const buf = await buildXlsx(entries);
      return new NextResponse(new Uint8Array(buf), {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="trt-report-${today()}.xlsx"`,
        },
      });
    }

    if (format === "docx") {
      const buf = await buildDocx(entries);
      return new NextResponse(new Uint8Array(buf), {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "Content-Disposition": `attachment; filename="trt-report-${today()}.docx"`,
        },
      });
    }

    const buf = await buildPdf(entries);
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="trt-report-${today()}.pdf"`,
      },
    });
  } catch (err) {
    return handleError(err);
  }
}

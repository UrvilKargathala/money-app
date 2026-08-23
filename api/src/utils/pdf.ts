import PDFDocument from "pdfkit";

export type PdfTable = {
  heading: string;
  columns: string[];
  rows: (string | number)[][];
};

export type PdfSection = PdfTable & {
  paragraphs?: string[];
};

export type ReportPdfInput = {
  title: string;
  subtitle: string;
  footer?: string;
  sections: PdfSection[];
};

const PAGE_MARGIN = 48;
const ROW_HEIGHT = 16;

/**
 * Renders a deterministic tabular report PDF. Pure function of its input —
 * safe to regenerate on download without persisting files (serverless-safe).
 */
export async function buildReportPdf(input: ReportPdfInput): Promise<Buffer> {
  const doc = new PDFDocument({
    size: "A4",
    margins: { top: PAGE_MARGIN, bottom: PAGE_MARGIN, left: PAGE_MARGIN, right: PAGE_MARGIN },
    info: { Title: input.title },
  });

  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(18).fillColor("#111111").text(input.title, { continued: false });
    doc.moveDown(0.2);
    doc.fontSize(10).fillColor("#555555").text(input.subtitle);
    doc.moveDown(0.6);

    for (const section of input.sections) {
      ensureSpace(doc, 60 + section.rows.length * ROW_HEIGHT);

      doc.fontSize(13).fillColor("#111111").text(section.heading);
      doc.moveDown(0.3);

      if (section.paragraphs?.length) {
        doc.fontSize(9).fillColor("#333333");
        for (const paragraph of section.paragraphs) {
          doc.text(paragraph);
        }
        doc.moveDown(0.4);
      }

      drawTable(doc, section);

      doc.moveDown(1);
    }

    if (input.footer) {
      ensureSpace(doc, 30);
      doc
        .moveDown(1)
        .fontSize(8)
        .fillColor("#888888")
        .text(input.footer, PAGE_MARGIN, doc.page.height - PAGE_MARGIN - 10, {
          lineBreak: false,
        });
    }

    doc.end();
  });
}

function ensureSpace(doc: PDFKit.PDFDocument, needed: number): void {
  if (doc.y + needed > doc.page.height - PAGE_MARGIN) {
    doc.addPage();
  }
}

function drawTable(doc: PDFKit.PDFDocument, table: PdfTable): void {
  const contentWidth = doc.page.width - PAGE_MARGIN * 2;
  const colCount = Math.max(1, table.columns.length);
  const colWidth = contentWidth / colCount;

  // Header row.
  doc.font("Helvetica-Bold").fontSize(9).fillColor("#000000");
  table.columns.forEach((col, i) => {
    doc.text(col, PAGE_MARGIN + i * colWidth, doc.y, { width: colWidth, lineBreak: false });
  });
  doc.moveDown(0.4);

  // Rule under header.
  const ruleY = doc.y;
  doc
    .moveTo(PAGE_MARGIN, ruleY)
    .lineTo(PAGE_MARGIN + contentWidth, ruleY)
    .lineWidth(0.75)
    .strokeColor("#999999")
    .stroke();
  doc.moveDown(0.3);

  doc.font("Helvetica").fontSize(9).fillColor("#222222");
  for (const row of table.rows) {
    ensureSpace(doc, ROW_HEIGHT + 6);
    const rowY = doc.y;
    row.forEach((cell, i) => {
      doc.text(String(cell), PAGE_MARGIN + i * colWidth, rowY, {
        width: colWidth,
        lineBreak: false,
        ellipsis: true,
      });
    });
    doc.x = PAGE_MARGIN;
    doc.y = rowY + ROW_HEIGHT;
  }
}

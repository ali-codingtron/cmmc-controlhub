import {
  Document,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  HeadingLevel,
  Packer,
  AlignmentType,
  WidthType,
  BorderStyle,
  PageBreak,
} from "docx";

interface SspDoc {
  title: string;
  documentNumber?: string | null;
  revisionNumber?: string | null;
  revisionDate?: string | null;
  preparedBy?: string | null;
  reviewedBy?: string | null;
  approvedBy?: string | null;
  organization?: string | null;
  systemName?: string | null;
  systemOwner?: string | null;
  cmmcLevel?: string | null;
  status?: string | null;
  nextReviewDate?: string | null;
}

interface SspSection {
  sectionTitle: string;
  content: string;
  sortOrder: number;
}

interface SspMapping {
  controlRef: string;
  implementationNarrative: string;
  policyReference?: string | null;
  sspStatus?: string | null;
}

function metaRow(label: string, value: string | null | undefined): Paragraph {
  return new Paragraph({
    children: [
      new TextRun({ text: `${label}: `, bold: true }),
      new TextRun({ text: value ?? "—" }),
    ],
    spacing: { after: 60 },
  });
}

function sectionParagraphs(content: string): Paragraph[] {
  return content
    .split("\n")
    .filter((l) => l.trim())
    .map(
      (line) =>
        new Paragraph({
          text: line.trim(),
          spacing: { after: 80 },
        })
    );
}

export async function generateSSPDocx(
  sspDoc: SspDoc,
  sections: SspSection[],
  controlMappings: SspMapping[]
): Promise<Buffer> {
  const children: (Paragraph | Table)[] = [];

  // ── Cover / Metadata ──────────────────────────────────────────────────────
  children.push(
    new Paragraph({
      text: sspDoc.title || "System Security Plan",
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 },
    }),
    metaRow("Document Number", sspDoc.documentNumber),
    metaRow("Revision", sspDoc.revisionNumber),
    metaRow("Revision Date", sspDoc.revisionDate),
    metaRow("Prepared By", sspDoc.preparedBy),
    metaRow("Reviewed By", sspDoc.reviewedBy),
    metaRow("Approved By", sspDoc.approvedBy),
    metaRow("Organization", sspDoc.organization),
    metaRow("System Name", sspDoc.systemName),
    metaRow("System Owner", sspDoc.systemOwner),
    metaRow("CMMC Level", sspDoc.cmmcLevel),
    metaRow("Status", sspDoc.status ?? "draft"),
    metaRow("Next Review Date", sspDoc.nextReviewDate),
    new Paragraph({ children: [new PageBreak()], spacing: { after: 0 } })
  );

  // ── Extracted Sections ────────────────────────────────────────────────────
  const sortedSections = [...sections].sort((a, b) => a.sortOrder - b.sortOrder);
  for (const section of sortedSections) {
    children.push(
      new Paragraph({
        text: section.sectionTitle,
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 300, after: 120 },
      }),
      ...sectionParagraphs(section.content),
      new Paragraph({ text: "", spacing: { after: 200 } })
    );
  }

  // ── Control Implementation Statements ─────────────────────────────────────
  if (controlMappings.length > 0) {
    children.push(
      new Paragraph({ children: [new PageBreak()], spacing: { after: 0 } }),
      new Paragraph({
        text: "Control Implementation Statements",
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 300, after: 200 },
      })
    );

    const sortedMappings = [...controlMappings].sort((a, b) =>
      a.controlRef.localeCompare(b.controlRef)
    );

    const tableRows: TableRow[] = [
      new TableRow({
        children: [
          new TableCell({
            children: [new Paragraph({ children: [new TextRun({ text: "Control ID", bold: true })] })],
            width: { size: 15, type: WidthType.PERCENTAGE },
          }),
          new TableCell({
            children: [new Paragraph({ children: [new TextRun({ text: "Implementation Narrative", bold: true })] })],
            width: { size: 60, type: WidthType.PERCENTAGE },
          }),
          new TableCell({
            children: [new Paragraph({ children: [new TextRun({ text: "Policy Reference", bold: true })] })],
            width: { size: 15, type: WidthType.PERCENTAGE },
          }),
          new TableCell({
            children: [new Paragraph({ children: [new TextRun({ text: "Status", bold: true })] })],
            width: { size: 10, type: WidthType.PERCENTAGE },
          }),
        ],
        tableHeader: true,
      }),
      ...sortedMappings.map(
        (m) =>
          new TableRow({
            children: [
              new TableCell({
                children: [new Paragraph({ children: [new TextRun({ text: m.controlRef, font: "Courier New", size: 18 })] })],
              }),
              new TableCell({
                children: sectionParagraphs(m.implementationNarrative || "—"),
              }),
              new TableCell({
                children: [new Paragraph({ text: m.policyReference ?? "" })],
              }),
              new TableCell({
                children: [new Paragraph({ text: m.sspStatus ?? "planned" })],
              }),
            ],
          })
      ),
    ];

    children.push(
      new Table({
        rows: tableRows,
        width: { size: 100, type: WidthType.PERCENTAGE },
      })
    );
  }

  const doc = new Document({
    sections: [
      {
        properties: {},
        children,
      },
    ],
  });

  return Packer.toBuffer(doc);
}

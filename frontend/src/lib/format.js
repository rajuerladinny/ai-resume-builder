// Turns a plain-text resume or letter into structured blocks, for the PDF
// print layout and the Word (.docx) download. Both stay single-column with
// standard headings, so applicant tracking systems can read them.

const LINE_BREAK = /\r\n|\n|\r/;
const BULLET = /^[ \t]*(?:[-*•–▪●]|\d+[.)])[ \t]+/;
const KNOWN_HEADING =
  /^(?:professional |work |career |technical |key |core )?(?:summary|profile|objective|experience|employment(?: history)?|education|skills|projects|certifications?|achievements|awards|languages|publications|volunteering|interests)[ \t]*:?$/i;
const CONTACT = /@|\d{3}|\||linkedin|github|https?:/i;
// "Acme Payments, Senior Developer, 2021 to present": a role line, shown in bold.
const YEAR = /\b(?:19|20)\d{2}\b|\bpresent\b/i;

const wordCount = (text) => text.split(/\s+/).filter(Boolean).length;

export function isHeading(line) {
  if (KNOWN_HEADING.test(line)) return true;
  const allCaps = /[A-Z]/.test(line) && !/[a-z]/.test(line);
  return allCaps && wordCount(line) <= 5 && line.length <= 40 && !CONTACT.test(line);
}

/**
 * Split a resume into {name, contact, blocks: [{type: "heading" | "role" | "bullet" | "text", text}]}.
 * The first line is the name; the second is contact details when it looks like them.
 */
export function parseResume(text) {
  const lines = text.split(LINE_BREAK).map((line) => line.trimEnd());
  const filled = lines.filter((line) => line.trim());
  if (!filled.length) return { name: "", contact: "", blocks: [] };

  let start = lines.findIndex((line) => line.trim());
  const name = lines[start].trim();
  start += 1;
  let contact = "";
  const next = lines.slice(start).findIndex((line) => line.trim());
  if (next !== -1) {
    const candidate = lines[start + next].trim();
    if (CONTACT.test(candidate) && candidate.length <= 160 && !isHeading(candidate)) {
      contact = candidate;
      start += next + 1;
    }
  }

  const blocks = [];
  for (const raw of lines.slice(start)) {
    const line = raw.trim();
    if (!line) continue;
    if (BULLET.test(raw)) blocks.push({ type: "bullet", text: raw.replace(BULLET, "").trim() });
    else if (isHeading(line)) blocks.push({ type: "heading", text: line.replace(/:$/, "") });
    else if (YEAR.test(line) && wordCount(line) <= 16) blocks.push({ type: "role", text: line });
    else blocks.push({ type: "text", text: line });
  }
  return { name, contact, blocks };
}

/**
 * A letter keeps its own line breaks: every line is a block, and a blank line
 * before a block sets `gap` so it starts a new paragraph.
 */
export function parseLetter(text) {
  const blocks = [];
  let gap = false;
  for (const raw of text.split(LINE_BREAK)) {
    const line = raw.trim();
    if (!line) {
      gap = blocks.length > 0;
      continue;
    }
    const bullet = BULLET.test(raw);
    blocks.push({ type: bullet ? "bullet" : "text", text: bullet ? raw.replace(BULLET, "").trim() : line, gap });
    gap = false;
  }
  return { name: "", contact: "", blocks };
}

const PT = 2; // docx sizes are in half-points

/** Build a Word document. The docx library is loaded only when someone downloads. */
export async function buildDocx(text, kind = "resume") {
  const { AlignmentType, BorderStyle, Document, Packer, Paragraph, TextRun } = await import("docx");
  const parsed = kind === "letter" ? parseLetter(text) : parseResume(text);
  const children = [];
  if (parsed.name) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 60 },
        children: [new TextRun({ text: parsed.name, bold: true, size: 20 * PT })],
      })
    );
  }
  if (parsed.contact) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 200 },
        children: [new TextRun({ text: parsed.contact, size: 10 * PT, color: "444444" })],
      })
    );
  }
  for (const block of parsed.blocks) {
    if (block.type === "heading") {
      children.push(
        new Paragraph({
          spacing: { before: 240, after: 80 },
          border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "888888", space: 2 } },
          children: [new TextRun({ text: block.text.toUpperCase(), bold: true, size: 12 * PT })],
        })
      );
    } else if (block.type === "bullet") {
      children.push(
        new Paragraph({
          bullet: { level: 0 },
          spacing: { before: block.gap ? 200 : 0, after: 40 },
          children: [new TextRun(block.text)],
        })
      );
    } else {
      children.push(
        new Paragraph({
          spacing: { before: block.gap ? 200 : block.type === "role" ? 120 : 0, after: kind === "letter" ? 0 : 60 },
          children: [new TextRun({ text: block.text, bold: block.type === "role" })],
        })
      );
    }
  }
  const doc = new Document({
    creator: "AI Resume Builder",
    styles: { default: { document: { run: { font: "Calibri", size: 11 * PT } } } },
    sections: [
      {
        properties: { page: { margin: { top: 720, bottom: 720, left: 900, right: 900 } } },
        children,
      },
    ],
  });
  return Packer.toBlob(doc);
}

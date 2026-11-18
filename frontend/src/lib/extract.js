// Reads a resume file in the browser, for the demo (which has no server).
// Mirrors backend/app/extract.py: the type is decided from the file's first
// bytes, .docx is read without an XML parser, and sizes are capped.
// fixtures/parity.json holds files with the text and ATS check the backend gives.
import { atsCheck } from "./ats.js";

export const MAX_BYTES = 5 * 1024 * 1024;
const MAX_PDF_PAGES = 15;
const MAX_DOCX_XML_BYTES = 20 * 1024 * 1024;
const MAX_CHARS = 60000;

export function tidy(text) {
  return text
    .replaceAll("\u0000", "")
    .replace(/\r\n|\r/g, "\n")
    .split("\n")
    .map((line) => line.replace(/\s+$/, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, MAX_CHARS);
}

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
function unescapeXml(text) {
  return text.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (whole, name) => {
    if (name[0] !== "#") return ENTITIES[name.toLowerCase()] ?? whole;
    const code = name[1].toLowerCase() === "x" ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
    return Number.isFinite(code) && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
  });
}

/** Paragraph text from word/document.xml. */
export function docxXmlToText(xml) {
  const paragraphs = [];
  for (const [body] of xml.matchAll(/<w:p[ >][\s\S]*?<\/w:p>/g)) {
    let line = "";
    for (const [, text, mark] of body.matchAll(
      /<w:t(?: [^>]*)?>([\s\S]*?)<\/w:t>|<w:(tab|br|cr)\b[^>]*\/>/g
    )) {
      line += mark === "tab" ? "\t" : mark ? "\n" : unescapeXml(text);
    }
    paragraphs.push(line);
  }
  return paragraphs.join("\n");
}

/** Bytes of one file inside a zip archive, or null when it is not there. */
export async function readZipEntry(bytes, wanted, maxSize = MAX_DOCX_XML_BYTES) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // The directory of files sits at the end of the archive.
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new Error("not a zip");
  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  const decoder = new TextDecoder();
  for (let n = 0; n < count; n++) {
    if (at + 46 > bytes.length || view.getUint32(at, true) !== 0x02014b50) throw new Error("bad zip");
    const method = view.getUint16(at + 10, true);
    const packed = view.getUint32(at + 20, true);
    const size = view.getUint32(at + 24, true);
    const nameLength = view.getUint16(at + 28, true);
    const skip = view.getUint16(at + 30, true) + view.getUint16(at + 32, true);
    const local = view.getUint32(at + 42, true);
    const name = decoder.decode(bytes.subarray(at + 46, at + 46 + nameLength));
    at += 46 + nameLength + skip;
    if (name !== wanted) continue;
    // Checked before unpacking, so a zip bomb is never expanded.
    if (size > maxSize) throw new RangeError("too large");
    if (local + 30 > bytes.length) throw new Error("bad zip");
    const start =
      local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    const data = bytes.subarray(start, start + packed);
    if (method === 0) return data;
    if (method !== 8) throw new Error("unsupported compression");
    const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    const out = new Uint8Array(await new Response(stream).arrayBuffer());
    if (out.length > maxSize) throw new RangeError("too large");
    return out;
  }
  return null;
}

const TABLE = /<w:tbl[ \t\r\n/>]/g;
const TEXT_BOX = /<w:txbxContent[ \t\r\n/>]/g;
const IMAGE = /<w:(?:drawing|pict)[ \t\r\n/>]/g;
// Word names its page headers and footers header1.xml, footer1.xml and so on.
const HEADER_PARTS = ["header", "footer"].flatMap((kind) => [1, 2, 3].map((n) => `word/${kind}${n}.xml`));
const count = (text, pattern) => (text.match(pattern) || []).length;
const facts = (type, pages = null) => ({ type, pages, tables: 0, text_boxes: 0, images: 0, header_text: "" });

async function docxText(bytes) {
  let xml;
  const headers = [];
  try {
    xml = await readZipEntry(bytes, "word/document.xml");
    if (xml !== null) {
      for (const name of HEADER_PARTS) {
        try {
          const part = await readZipEntry(bytes, name);
          if (part !== null) headers.push(docxXmlToText(new TextDecoder().decode(part)));
        } catch (error) {
          if (!(error instanceof RangeError)) throw error; // an oversized header is skipped
        }
      }
    }
  } catch (error) {
    if (error instanceof RangeError) throw new Error("This Word file is too large.");
    throw new Error("This Word file could not be read.");
  }
  if (xml === null) throw new Error("Only .docx Word files are supported.");
  const source = new TextDecoder().decode(xml);
  return {
    text: docxXmlToText(source),
    facts: {
      ...facts("docx"),
      tables: count(source, TABLE),
      text_boxes: count(source, TEXT_BOX),
      images: count(source, IMAGE),
      header_text: tidy(headers.join("\n")),
    },
  };
}

async function pdfText(bytes) {
  let text = "";
  let pages = 0;
  try {
    // Loaded only when a PDF is opened, so it stays out of the first download.
    const [pdfjs, worker] = await Promise.all([
      import("pdfjs-dist"),
      import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
    ]);
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    const pdf = await pdfjs.getDocument({ data: bytes, isEvalSupported: false }).promise;
    if (pdf.numPages > MAX_PDF_PAGES) {
      throw new RangeError(`This PDF has more than ${MAX_PDF_PAGES} pages.`);
    }
    pages = pdf.numPages;
    for (let n = 1; n <= pdf.numPages; n++) {
      const content = await (await pdf.getPage(n)).getTextContent();
      for (const item of content.items) {
        if (typeof item.str !== "string") continue;
        text += item.str + (item.hasEOL ? "\n" : "");
      }
      text += "\n";
    }
  } catch (error) {
    if (error instanceof RangeError) throw new Error(error.message);
    if (error?.name === "PasswordException") {
      throw new Error("This PDF is password protected. Paste the text instead.");
    }
    throw new Error("This PDF could not be read. Paste the text instead.");
  }
  if (!text.trim()) {
    throw new Error("This PDF has no selectable text (it may be a scan). Paste the text instead.");
  }
  return { text, facts: facts("pdf", pages) };
}

const startsWith = (bytes, ...codes) => codes.every((code, i) => bytes[i] === code);

/** Plain text, its length and an ATS readability check from PDF, .docx or text bytes. */
export async function extractBytes(bytes) {
  if (!bytes.length) throw new Error("The file is empty.");
  if (bytes.length > MAX_BYTES) throw new Error("The file is larger than 5 MB.");
  let read;
  if (startsWith(bytes, 0x25, 0x50, 0x44, 0x46, 0x2d)) {
    read = await pdfText(bytes); // %PDF-
  } else if (startsWith(bytes, 0x50, 0x4b, 0x03, 0x04)) {
    read = await docxText(bytes); // PK..
  } else if (bytes.subarray(0, 4096).includes(0)) {
    throw new Error("Upload a PDF, a .docx Word file or a text file.");
  } else {
    let decoded;
    try {
      decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      decoded = new TextDecoder("latin1").decode(bytes);
    }
    read = { text: decoded, facts: facts("text") };
  }
  const text = tidy(read.text);
  if (!text) throw new Error("No text was found in the file.");
  return { text, characters: text.length, ats: atsCheck(text, read.facts) };
}

export async function extractFile(file) {
  if (file.size > MAX_BYTES) throw new Error("The file is larger than 5 MB.");
  return extractBytes(new Uint8Array(await file.arrayBuffer()));
}

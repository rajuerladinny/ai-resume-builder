// ATS readability check for the in-browser demo: will an applicant tracking
// system read this file correctly? A JavaScript port of backend/app/ats.py;
// fixtures/parity.json holds the two together for Word and text files.

const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/;
const PHONE = /(?:\+?\d[ \t\-()]*){10,15}/;
const WORD = /[^ \t\n\r\f\v]+/g;
const LINE_BREAK = /\r\n|\n|\r/;
const GARBLED = /[�-]|\(cid:[0-9]+\)/g;
const MIN_CHARS_PER_PAGE = 300;
const MAX_PAGES = 2;
const MIN_LINES_FOR_LAYOUT = 15;
const MAX_SHORT_LINE_PERCENT = 50;

const check = (id, ok, title, detail) => ({ id, ok, title, detail });
const plural = (n, word) => (n === 1 ? `${n} ${word}` : `${n} ${word}s`);
const wordCount = (line) => (line.match(WORD) || []).length;

export function atsCheck(text, facts) {
  const kind = facts.type;
  const pages = facts.pages || 0;
  const lines = text.split(LINE_BREAK).filter((line) => line.trim());
  const checks = [];

  if (kind === "text") {
    checks.push(
      check("file", false, "File type", "Plain text is fine for checking here, but send employers a PDF or Word file.")
    );
  } else {
    checks.push(
      check("file", true, "File type", `${kind === "pdf" ? "PDF" : "Word"} files are accepted by most systems.`)
    );
  }

  if (kind === "pdf" && pages) {
    const perPage = Math.floor(text.length / pages);
    const dense = perPage >= MIN_CHARS_PER_PAGE;
    checks.push(
      check(
        "text",
        dense,
        "Selectable text",
        dense
          ? `About ${perPage} characters of text per page.`
          : `Only about ${perPage} characters of text per page. Parts may be images or ` +
              "scanned, which systems cannot read. Export the PDF from your word processor."
      )
    );
    const short = pages <= MAX_PAGES;
    checks.push(
      check("pages", short, "Length", short ? `${plural(pages, "page")}.` : `${pages} pages. Most recruiters expect one or two.`)
    );
  }

  const garbled = (text.match(GARBLED) || []).length;
  checks.push(
    check(
      "characters",
      !garbled,
      "Characters come through cleanly",
      !garbled
        ? "No broken or unreadable characters."
        : `${plural(garbled, "character")} could not be read. Icon fonts, symbols and fancy ` +
            "bullets often cause this; use plain text and simple bullets."
    )
  );

  const hasEmail = EMAIL.test(text);
  const hasPhone = PHONE.test(text);
  const header = facts.header_text || "";
  const inHeader = EMAIL.test(header) || PHONE.test(header);
  let detail;
  if (hasEmail && hasPhone) detail = "Email and phone number are in the main text.";
  else if (inHeader) {
    detail =
      "Your contact details are in the page header or footer, which some systems skip. Move them into the main text.";
  } else {
    const missing = !(hasEmail || hasPhone) ? "email or phone number" : !hasEmail ? "email" : "phone number";
    detail = `No ${missing} found in the text. If they are in an image or icon, type them out.`;
  }
  checks.push(check("contact", hasEmail && hasPhone, "Contact details readable", detail));

  if (kind === "docx") {
    const { tables, text_boxes: boxes, images } = facts;
    checks.push(
      check(
        "tables",
        !tables,
        "No tables",
        !tables
          ? "No tables found."
          : `${plural(tables, "table")} found. Some systems read tables out of order; use plain lines instead.`
      )
    );
    checks.push(
      check(
        "text_boxes",
        !boxes,
        "No text boxes",
        !boxes
          ? "No text boxes found."
          : `${boxes} text ${boxes === 1 ? "box" : "boxes"} found. Text boxes are often ` +
              "skipped; move that text into the page."
      )
    );
    checks.push(
      check(
        "images",
        !images,
        "No images or graphics",
        !images
          ? "No images found."
          : `${plural(images, "image")} or graphics found. Systems cannot read text in images, ` +
              "skill bars or icons; make sure nothing important is only shown that way."
      )
    );
  }

  if (lines.length >= MIN_LINES_FOR_LAYOUT) {
    const short = lines.filter((line) => wordCount(line) <= 2).length;
    const percent = Math.floor((short * 100) / lines.length);
    const ok = percent <= MAX_SHORT_LINE_PERCENT;
    checks.push(
      check(
        "layout",
        ok,
        "Single-column layout",
        ok
          ? "The text reads in a sensible order."
          : `${percent}% of lines are only one or two words, a sign of columns or ` +
              "tables. Systems may read the text in the wrong order; a single column is safest."
      )
    );
  }

  return { checks, passed: checks.filter((c) => c.ok).length, total: checks.length };
}

// Anonymous screening: remove the details that let a reviewer guess who a
// candidate is (name, contact details, links, photo-era personal details such
// as age, gender or marital status) so the first read judges skills only.
// Scores are always calculated on the full text; only what is shown changes.

const LINE_BREAK = /\r\n|\n|\r/;
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
const PHONE = /(?:\+?\d[ \t\-().]*){10,15}/g;
const LINK = /\b(?:https?:\/\/|www\.)\S+|\b(?:linkedin\.com|github\.com|gitlab\.com|behance\.net|dribbble\.com)\/\S*/gi;
const NAME_LINE = /^[\p{L}][\p{L} .'-]{1,59}$/u;
const PERSONAL =
  /^[ \t]*(?:date of birth|d\.?o\.?b\.?|birth ?date|age|gender|sex|marital status|nationality|religion|caste|father'?s name|mother'?s name|husband'?s name|passport(?: no\.?| number)?|address|permanent address|photo)[ \t]*[:\-–]/i;

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The first line when it looks like a person's name, else "". */
export function nameLine(text) {
  const first = text.split(LINE_BREAK).find((line) => line.trim())?.trim() ?? "";
  const words = first.split(/\s+/).filter(Boolean);
  return words.length >= 2 && words.length <= 5 && NAME_LINE.test(first) ? first : "";
}

/**
 * Returns {text, removed}: the resume with identifying details replaced by
 * [Name], [email], [phone], [link] and [personal detail removed], and how many
 * replacements were made.
 */
export function redactResume(text) {
  let removed = 0;
  const count = (replacement) => () => {
    removed += 1;
    return replacement;
  };
  // Contact details first, so a name inside an email address goes with the address.
  let out = text.replace(EMAIL, count("[email]")).replace(LINK, count("[link]")).replace(PHONE, count("[phone] "));
  const name = nameLine(text);
  if (name) {
    // The full name, and each part of it (people often repeat a first name).
    const parts = [name, ...name.split(/\s+/).filter((part) => part.replace(/\./g, "").length > 2)];
    for (const part of parts) {
      out = out.replace(new RegExp(`(?<![\\p{L}])${escapeRegExp(part)}(?![\\p{L}])`, "giu"), count("[Name]"));
    }
    out = out.replace(/\[Name\](?:[ \t]+\[Name\])+/g, "[Name]");
  }
  out = out
    .split(LINE_BREAK)
    .map((line) => (PERSONAL.test(line) ? count("[personal detail removed]")() : line.replace(/[ \t]+$/, "")))
    .join("\n");
  return { text: out, removed };
}

/** "Candidate 3" style labels, by the order resumes were added. */
export const candidateLabel = (index) => `Candidate ${index + 1}`;

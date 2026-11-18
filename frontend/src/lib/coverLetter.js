// Template cover letter for the in-browser demo, and the fallback when no AI
// model is connected. A JavaScript port of the template in
// backend/app/cover_letter.py; fixtures/parity.json holds the two together.
import { WEAK_PHRASES } from "./checks.js";
import { analyze, extractKeywords } from "./keywords.js";

const LINE_BREAK = /\r\n|\n|\r/;
const BULLET_MARK = /^[ \t]*(?:[-*•–▪●]|\d+[.)])[ \t]+/;
const NAME_WORD = /^[A-Za-z][A-Za-z.'-]*$/;
const TITLE_PREFIX = /^(?:job title|title|role|position)[ \t]*:[ \t]*/i;
const DIGIT = /[0-9]/;
const MAX_HIGHLIGHTS = 3;
const MAX_SKILLS = 4;

export const TEMPLATE_NOTICE =
  "No AI model is connected, so this letter was built from a template using your " +
  "resume's own bullet points. Edit it before sending.";

const lines = (text) =>
  text
    .split(LINE_BREAK)
    .map((line) => line.trim())
    .filter(Boolean);
const words = (text) => text.split(/\s+/).filter(Boolean);

export function candidateName(resume) {
  const first = lines(resume)[0];
  if (!first) return "";
  const parts = words(first);
  if (!(parts.length >= 2 && parts.length <= 5 && first.length <= 60 && parts.every((w) => NAME_WORD.test(w)))) {
    return "";
  }
  const name = parts.join(" ");
  // "RAVI KUMAR" -> "Ravi Kumar"
  if (name === name.toUpperCase() && /[A-Z]/.test(name)) {
    return name.replace(/[A-Za-z]+/g, (w) => w[0] + w.slice(1).toLowerCase());
  }
  return name;
}

export function roleTitle(job) {
  const first = lines(job)[0];
  if (!first) return "";
  const title = first.replace(TITLE_PREFIX, "").trim();
  if (title && words(title).length <= 8 && title.length <= 80 && !/[.!?]$/.test(title)) return title;
  return "";
}

export function displayTerm(term, job) {
  const lowered = job.toLowerCase();
  const index = lowered.indexOf(term);
  if (index === -1 || lowered.length !== job.length) return term;
  return job.slice(index, index + term.length);
}

export function joinWords(items) {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** The resume bullet points that best match the job, best first. */
export function highlights(resume, job, limit = MAX_HIGHLIGHTS) {
  const scored = [];
  lines(resume).forEach((line, position) => {
    if (!BULLET_MARK.test(line)) return;
    const text = line.replace(BULLET_MARK, "").trim().replace(/\.+$/, "");
    const lowered = text.toLowerCase();
    if (words(text).length < 4 || WEAK_PHRASES.some((phrase) => lowered.includes(phrase))) return;
    const hits = analyze(text, job).matched.length;
    if (hits) scored.push({ score: hits + (DIGIT.test(text) ? 1 : 0), position, text });
  });
  scored.sort((a, b) => b.score - a.score || a.position - b.position);
  return scored.slice(0, limit).map((s) => s.text);
}

export function templateLetter(resume, job) {
  const name = candidateName(resume);
  const title = roleTitle(job);
  const matched = new Set(analyze(resume, job).matched);
  const lowered = job.toLowerCase();
  const position = (term) => (lowered.includes(term) ? lowered.indexOf(term) : lowered.length);
  const found = extractKeywords(job)
    .filter((k) => k.kind === "skill" && matched.has(k.term))
    .map((k) => k.term)
    .sort((a, b) => position(a) - position(b));
  const skills = found.slice(0, MAX_SKILLS).map((term) => displayTerm(term, job));
  const points = highlights(resume, job);

  let opening = title
    ? `I am writing to apply for the ${title} role.`
    : "I am writing to apply for this role.";
  if (skills.length) opening += ` My experience with ${joinWords(skills)} matches what you are looking for.`;
  const parts = ["Dear Hiring Manager,", "", opening, ""];
  if (points.length) {
    parts.push("A few highlights from my recent work:", ...points.map((p) => `- ${p}`), "");
  }
  parts.push(
    "I would welcome the chance to talk about how I can help your team. " +
      "Thank you for your time and consideration.",
    "",
    "Sincerely,",
    name || "[Your name]"
  );
  return parts.join("\n");
}

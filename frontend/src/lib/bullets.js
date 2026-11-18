// Bullet coach: line-by-line advice for each bullet point in a resume.
// Rule-based and instant, like the resume review; runs in the browser in both
// the full app and the demo.

const BULLET = /^[ \t]*(?:[-*•–▪●]|\d+[.)])[ \t]+/;
const LINE_BREAK = /\r\n|\n|\r/;

// Weak openings and stronger verbs to use instead.
const WEAK_STARTS = [
  ["responsible for", ["Led", "Owned", "Managed"]],
  ["worked on", ["Built", "Developed", "Delivered"]],
  ["helped with", ["Supported", "Contributed to", "Enabled"]],
  ["helped", ["Supported", "Enabled", "Improved"]],
  ["duties included", ["Delivered", "Handled", "Ran"]],
  ["in charge of", ["Led", "Directed", "Oversaw"]],
  ["involved in", ["Contributed to", "Partnered on", "Drove"]],
  ["participated in", ["Contributed to", "Collaborated on", "Drove"]],
  ["assisted", ["Supported", "Partnered with", "Enabled"]],
  ["tasked with", ["Delivered", "Completed", "Drove"]],
];
const PRONOUN_START = /^(?:i|my|me|we|our)\b/i;
const NUMBER = /[0-9]/;
const MAX_WORDS = 30;
const MIN_WORDS = 5;
export const MAX_COACHED = 15;

const wordCount = (text) => text.split(/\s+/).filter(Boolean).length;

/** Advice for one bullet's text (without its marker). Returns [{id, message}]. */
export function bulletIssues(text) {
  const issues = [];
  const lowered = text.toLowerCase();
  const weak = WEAK_STARTS.find(([phrase]) => lowered.startsWith(phrase));
  if (weak) {
    const [phrase, verbs] = weak;
    issues.push({
      id: "weak",
      message: `Starts with "${phrase}". Try a stronger verb: ${verbs.slice(0, -1).join(", ")} or ${verbs.at(-1)}.`,
    });
  }
  if (PRONOUN_START.test(text)) {
    issues.push({ id: "pronoun", message: "Drop the pronoun and start with what you did." });
  }
  const words = wordCount(text);
  if (words < MIN_WORDS) {
    issues.push({ id: "short", message: "Very short. Say what you did and what changed because of it." });
  } else if (words > MAX_WORDS) {
    issues.push({ id: "long", message: `${words} words. Keep a bullet to one or two lines.` });
  }
  if (!NUMBER.test(text)) {
    issues.push({
      id: "number",
      message: "No number. Add one if you have it: users, %, time or money saved, team size.",
    });
  }
  return issues;
}

/**
 * Coach every bullet in a resume.
 * Returns {total, strong, items: [{line, text, issues}]} with only the bullets
 * that need work, the most issues first, up to MAX_COACHED.
 */
export function coachBullets(resume) {
  const bullets = [];
  resume.split(LINE_BREAK).forEach((raw, index) => {
    if (!BULLET.test(raw)) return;
    const text = raw.replace(BULLET, "").trim();
    if (text) bullets.push({ line: index + 1, text, issues: bulletIssues(text) });
  });
  const needWork = bullets
    .filter((b) => b.issues.length)
    .sort((a, b) => b.issues.length - a.issues.length || a.line - b.line);
  return {
    total: bullets.length,
    strong: bullets.length - needWork.length,
    items: needWork.slice(0, MAX_COACHED),
  };
}

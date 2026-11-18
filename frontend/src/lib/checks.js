// Rule-based resume review for the in-browser demo.
// A JavaScript port of backend/app/checks.py; keep the two in step.
// fixtures/parity.json holds the results this file must reproduce exactly.

const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/;
const PHONE = /(?:\+?\d[ \t\-()]*){10,15}/;
const BULLET = /^[ \t]*(?:[-*•–▪●]|\d+[.)])[ \t]+[^ \t]/;
const SECTIONS = {
  experience: /^\W*(?:work |professional )?(?:experience|employment)\b/i,
  education: /^\W*(?:education|qualifications?)\b/i,
  skills: /^\W*(?:technical |key |core )?skills\b/i,
};
const WORD = /[^ \t\n\r\f\v]+/g;
export const WEAK_PHRASES = [
  "responsible for",
  "worked on",
  "helped with",
  "duties included",
  "in charge of",
  "involved in",
];
const PRONOUN = /\b(?:I|my|me|myself)\b/;
const MIN_WORDS = 250;
const MAX_WORDS = 900;

const wordCount = (text) => (text.match(WORD) || []).length;

export function review(resume) {
  const lines = resume.split(/\r\n|\n|\r/);
  const words = wordCount(resume);
  const bullets = lines.filter((line) => BULLET.test(line));
  const withNumbers = bullets.filter((b) => /[0-9]/.test(b.replace(BULLET, "")));
  const missingSections = Object.entries(SECTIONS)
    .filter(([, pattern]) => !lines.some((line) => pattern.test(line) && wordCount(line) <= 4))
    .map(([name]) => name);
  const lowered = resume.toLowerCase();
  const weak = WEAK_PHRASES.filter((phrase) => lowered.includes(phrase));
  const hasEmail = EMAIL.test(resume);
  const hasPhone = PHONE.test(resume);
  const hasPronoun = PRONOUN.test(resume);

  const check = (id, ok, title, detail) => ({ id, ok, title, detail });
  const missingContact = [
    ["an email address", hasEmail],
    ["a phone number", hasPhone],
  ]
    .filter(([, found]) => !found)
    .map(([name]) => name);

  const checks = [
    check(
      "contact",
      hasEmail && hasPhone,
      "Contact details",
      hasEmail && hasPhone
        ? "Email and phone number found."
        : `Add ${missingContact.join(" and ")} at the top.`
    ),
    check(
      "sections",
      missingSections.length === 0,
      "Standard section headings",
      missingSections.length === 0
        ? "Experience, Education and Skills headings found."
        : `Add a heading on its own line for: ${missingSections.join(", ")}.`
    ),
    check(
      "bullets",
      bullets.length >= 5,
      "Bullet points",
      bullets.length >= 5
        ? `${bullets.length} bullet points found.`
        : `Only ${bullets.length} bullet points found. Describe each role in 3 to 6 bullets.`
    ),
    check(
      "numbers",
      withNumbers.length >= 3,
      "Results with numbers",
      withNumbers.length >= 3
        ? `${withNumbers.length} bullet points include a number.`
        : `${withNumbers.length} bullet points include a number. Add figures such as users, ` +
            "percentages or time saved, where you have them."
    ),
    check(
      "length",
      words >= MIN_WORDS && words <= MAX_WORDS,
      "Length",
      words >= MIN_WORDS && words <= MAX_WORDS
        ? `${words} words, about right for one to two pages.`
        : words < MIN_WORDS
          ? `${words} words is short; aim for at least ${MIN_WORDS}.`
          : `${words} words is long; aim for under ${MAX_WORDS}.`
    ),
    check(
      "wording",
      weak.length === 0,
      "Strong wording",
      weak.length === 0
        ? "No weak phrases found."
        : `Replace with an action verb: ${weak.map((w) => `"${w}"`).join(", ")}.`
    ),
    check(
      "pronouns",
      !hasPronoun,
      "No first-person pronouns",
      hasPronoun ? 'Drop "I", "my" and "me"; start bullets with the verb.' : "None found."
    ),
  ];
  return {
    checks,
    passed: checks.filter((c) => c.ok).length,
    total: checks.length,
    words,
  };
}

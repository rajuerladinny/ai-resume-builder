// Keyword extraction and resume-to-job matching for the in-browser demo.
// A JavaScript port of backend/app/keywords.py. The word lists come from
// vocab.js, which the backend generates; fixtures/parity.json holds the
// results this file must reproduce exactly (see tests/parity.test.js).
import vocab from "./vocab.js";

const SKILLS = vocab.skills;
const ALIASES = new Map(Object.entries(vocab.aliases));
const STOPWORDS = new Set(vocab.stopwords);
const SKILL_WORDS = new Set(SKILLS.filter((s) => !s.includes(" ")));
const SKILL_PHRASES = SKILLS.filter((s) => s.includes(" ")).sort((a, b) => b.length - a.length);
const TOKEN = /[a-z0-9][a-z0-9+#.\-/]*/g;
const TRAILING = /[.\-/]+$/;

function canonical(raw) {
  const token = raw.replace(TRAILING, "");
  if (ALIASES.has(token)) return ALIASES.get(token);
  if (SKILL_WORDS.has(token)) return token;
  if (token.endsWith("s") && SKILL_WORDS.has(token.slice(0, -1))) return token.slice(0, -1);
  // light plural stemming for ordinary words
  if (token.length > 4 && token.endsWith("s") && !/(ss|us|is)$/.test(token)) {
    return token.slice(0, -1);
  }
  return token;
}

/** Lower-case tokens with tech terms kept whole (c++, node.js, ci/cd). */
export function normalize(text) {
  const lowered = text.toLowerCase().replaceAll(".net", " dotnet ");
  const tokens = [];
  for (const raw of lowered.match(TOKEN) || []) {
    const parts = raw.replace(TRAILING, "") === "ci/cd" ? [raw] : raw.split("/");
    for (const part of parts) {
      const token = canonical(part);
      if (token) tokens.push(...token.split(" ")); // an alias may expand to a phrase
    }
  }
  return tokens;
}

/** Non-overlapping occurrences, like Python's str.count. */
function count(haystack, needle) {
  let n = 0;
  for (let i = haystack.indexOf(needle); i !== -1; i = haystack.indexOf(needle, i + needle.length)) {
    n += 1;
  }
  return n;
}

/** Python's round(): halves go to the nearest even number. */
function roundHalfEven(x) {
  const floor = Math.floor(x);
  const diff = x - floor;
  if (diff !== 0.5) return diff > 0.5 ? floor + 1 : floor;
  return floor % 2 === 0 ? floor : floor + 1;
}

/** Keywords a job post is asking for, most important first. */
export function extractKeywords(jobText, maxOther = 12) {
  const tokens = normalize(jobText);
  const joined = ` ${tokens.join(" ")} `;
  const counts = new Map();
  for (const t of tokens) counts.set(t, (counts.get(t) || 0) + 1);

  const found = [];
  const phraseWords = new Set();
  for (const phrase of SKILL_PHRASES) {
    const n = count(joined, ` ${phrase} `);
    if (n) {
      found.push({ term: phrase, kind: "skill", count: n });
      for (const word of phrase.split(" ")) phraseWords.add(word);
    }
  }
  for (const word of SKILL_WORDS) {
    if (counts.get(word)) found.push({ term: word, kind: "skill", count: counts.get(word) });
  }
  found.sort((a, b) => b.count - a.count || (a.term < b.term ? -1 : a.term > b.term ? 1 : 0));

  const others = [...counts.entries()]
    .sort((a, b) => b[1] - a[1]) // stable, so ties keep first-seen order
    .filter(
      ([t, c]) =>
        c >= 2 &&
        t.length >= 3 &&
        !STOPWORDS.has(t) &&
        !SKILL_WORDS.has(t) &&
        !phraseWords.has(t) &&
        !/^[0-9]+$/.test(t)
    )
    .map(([t, c]) => ({ term: t, kind: "term", count: c }));
  return found.concat(others.slice(0, maxOther));
}

/** Compare a resume with a job post. Skills count double. */
export function analyze(resumeText, jobText) {
  const keywords = extractKeywords(jobText);
  const resumeTokens = normalize(resumeText);
  const resumeSet = new Set(resumeTokens);
  const resumeJoined = ` ${resumeTokens.join(" ")} `;

  const matched = [];
  const missing = [];
  let got = 0;
  let total = 0;
  for (const kw of keywords) {
    const weight = kw.kind === "skill" ? 2 : 1;
    total += weight;
    const present = kw.term.includes(" ")
      ? resumeJoined.includes(` ${kw.term} `)
      : resumeSet.has(kw.term);
    if (present) {
      got += weight;
      matched.push(kw.term);
    } else {
      missing.push(kw.term);
    }
  }
  return {
    score: total ? roundHalfEven((100 * got) / total) : 0,
    matched,
    missing,
    keywords: keywords.length,
  };
}

/** Score several resumes ({name, text}) against one job post, best match first. */
export function rankResumes(jobText, resumes) {
  return resumes
    .map((r, index) => ({ index, name: r.name, ...analyze(r.text, jobText) }))
    .sort((a, b) => b.score - a.score); // stable, so ties keep the order given
}

/** Score one resume against several job posts ({name, text}), best fit first. */
export function rankJobs(resumeText, jobs) {
  return jobs
    .map((j, index) => ({ index, name: j.name, ...analyze(resumeText, j.text) }))
    .sort((a, b) => b.score - a.score); // stable, so ties keep the order given
}

/** Job keywords that appear in the tailored resume but not the original. */
export function inventedTerms(original, tailored, job) {
  const before = analyze(original, job);
  const after = analyze(tailored, job);
  return after.matched.filter((t) => before.missing.includes(t));
}

export function suggestions(missing, limit = 8) {
  return missing
    .slice(0, limit)
    .map((term) => `The job asks for "${term}". If you have used it, add where and how.`);
}

// Helpers for the "Compare resumes" view.

export const MAX_COMPARE = 20;
export const MAX_RESUME_CHARS = 20000;

/** Quotes a CSV cell and neutralises spreadsheet formula prefixes. */
export function csvCell(value) {
  const text = String(value ?? "");
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

export function rankingToCsv(results) {
  const rows = results.map((r, i) =>
    [
      i + 1,
      r.name,
      r.score,
      r.matched.join("; "),
      r.missing.join("; "),
      `${r.review.passed}/${r.review.total}`,
      r.review.words,
    ]
      .map(csvCell)
      .join(",")
  );
  return [
    "rank,file,match_score,matched_keywords,missing_keywords,review_checks_passed,words",
    ...rows,
    "",
  ].join("\r\n");
}

/** Gives files that share a name a numbered suffix, so rows can be told apart. */
export function uniqueName(name, taken) {
  if (!taken.includes(name)) return name;
  for (let n = 2; ; n++) {
    const candidate = `${name} (${n})`;
    if (!taken.includes(candidate)) return candidate;
  }
}

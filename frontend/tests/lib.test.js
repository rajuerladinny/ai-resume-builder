import assert from "node:assert/strict";
import { test } from "node:test";
import { createDemoApi } from "../src/lib/demo.js";
import { diffLines, diffSummary } from "../src/lib/diff.js";
import { rankingToCsv, uniqueName } from "../src/lib/rank.js";
import sample from "../src/lib/sample.js";


test("diffLines marks added, removed and unchanged lines in order", () => {
  const lines = diffLines("a\nb\nc\nd", "a\nB\nc\nd\ne");
  assert.deepEqual(lines, [
    { type: "same", text: "a" },
    { type: "removed", text: "b" },
    { type: "added", text: "B" },
    { type: "same", text: "c" },
    { type: "same", text: "d" },
    { type: "added", text: "e" },
  ]);
  assert.deepEqual(diffSummary(lines), { added: 2, removed: 1 });
  assert.deepEqual(diffSummary(diffLines("same\ntext", "same\ntext")), { added: 0, removed: 0 });
});

test("diffLines rebuilds both texts", () => {
  const lines = diffLines(sample.resume, sample.tailored);
  const before = lines.filter((l) => l.type !== "added").map((l) => l.text);
  const after = lines.filter((l) => l.type !== "removed").map((l) => l.text);
  assert.equal(before.join("\n"), sample.resume);
  assert.equal(after.join("\n"), sample.tailored);
});

test("demo: the sample gets a prepared rewrite that raises the score", async () => {
  const api = createDemoApi();
  const analysis = await api.analyze(sample.resume, sample.job);
  assert.equal(analysis.review.total, 7);
  const result = await api.tailor(sample.resume, sample.job);
  assert.equal(result.rewritten, true);
  assert.ok(result.after.score > result.before.score);
  assert.equal(result.before.score, analysis.score);
  assert.ok(result.check.includes("ci/cd"));
  assert.match(result.notice, /prepared example/);
  assert.ok(result.review.passed > analysis.review.passed);
});

test("demo: other text is analysed but never rewritten", async () => {
  const api = createDemoApi();
  const resume = `${sample.resume}\n- Extra line`;
  const result = await api.tailor(resume, sample.job);
  assert.equal(result.rewritten, false);
  assert.equal(result.tailored, resume.trim());
  assert.deepEqual(result.check, []);
  assert.match(result.notice, /no AI model/);
});

test("demo: text files are read in the browser; bad files are refused", async () => {
  const api = createDemoApi();
  const text = new File(["  My resume text  "], "resume.txt", { type: "text/plain" });
  assert.deepEqual(await api.extract(text), { text: "My resume text", characters: 14 });
  const binary = new File([new Uint8Array([0, 1, 2, 3])], "photo.png");
  await assert.rejects(api.extract(binary), /Upload a PDF/);
  const brokenWord = new File([new Uint8Array([0x50, 0x4b, 3, 4, 9, 9, 9])], "cv.docx");
  await assert.rejects(api.extract(brokenWord), /could not be read/);
  await assert.rejects(api.extract(new File([], "empty.txt")), /empty/);
});

test("demo: ranks several resumes against one job post", async () => {
  const api = createDemoApi();
  const { keywords, results } = await api.rank(sample.job, [
    { name: "weak.txt", text: "I bake bread and cakes." },
    { name: "original.pdf", text: sample.resume },
    { name: "tailored.docx", text: sample.tailored },
  ]);
  assert.ok(keywords > 0);
  assert.deepEqual(
    results.map((r) => r.name),
    ["tailored.docx", "original.pdf", "weak.txt"]
  );
  assert.equal(results[0].review.total, 7);
  assert.equal(results[2].score, 0);
});

test("ranking CSV has one row per resume and neutralises formulas", () => {
  const csv = rankingToCsv([
    {
      name: "=cmd.pdf",
      score: 64,
      matched: ["react", "jest"],
      missing: ["aws"],
      review: { passed: 6, total: 7, words: 150 },
    },
  ]);
  const lines = csv.trimEnd().split("\r\n");
  assert.equal(lines.length, 2);
  assert.equal(lines[1], `"1","'=cmd.pdf","64","react; jest","aws","6/7","150"`);
});

test("uniqueName numbers files that share a name", () => {
  assert.equal(uniqueName("cv.pdf", []), "cv.pdf");
  assert.equal(uniqueName("cv.pdf", ["cv.pdf"]), "cv.pdf (2)");
  assert.equal(uniqueName("cv.pdf", ["cv.pdf", "cv.pdf (2)"]), "cv.pdf (3)");
});

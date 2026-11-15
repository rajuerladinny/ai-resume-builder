import assert from "node:assert/strict";
import { test } from "node:test";
import { createDemoApi } from "../src/lib/demo.js";
import { diffLines, diffSummary } from "../src/lib/diff.js";
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

test("demo: only text files can be read", async () => {
  const api = createDemoApi();
  const text = new File(["  My resume text  "], "resume.txt", { type: "text/plain" });
  assert.deepEqual(await api.extract(text), { text: "My resume text", characters: 14 });
  const pdf = new File(["%PDF-1.7"], "resume.pdf", { type: "application/pdf" });
  await assert.rejects(api.extract(pdf), /text files only/);
});

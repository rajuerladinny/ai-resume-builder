// The in-browser demo must give the same results as the Python backend.
// fixtures/parity.json is written by `python -m app.export_shared`.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { review } from "../src/lib/checks.js";
import { extractBytes } from "../src/lib/extract.js";
import {
  analyze,
  extractKeywords,
  inventedTerms,
  normalize,
  rankResumes,
} from "../src/lib/keywords.js";
import sample from "../src/lib/sample.js";

const parity = JSON.parse(readFileSync(new URL("../../fixtures/parity.json", import.meta.url)));


for (const c of parity.cases) {
  test(`matches the backend: ${c.name}`, () => {
    assert.deepEqual(extractKeywords(c.job), c.keywords);
    assert.deepEqual(analyze(c.resume, c.job), c.analyze);
    assert.deepEqual(review(c.resume), c.review);
  });
}

test("flags the same added keywords as the backend", () => {
  assert.deepEqual(inventedTerms(sample.resume, sample.tailored, sample.job), parity.sample_check);
});

test("ranks resumes in the same order as the backend", () => {
  assert.deepEqual(rankResumes(parity.rank.job, parity.rank.resumes), parity.rank.expected);
});

for (const file of parity.files) {
  test(`extracts the same text as the backend: ${file.name}`, async () => {
    const bytes = new Uint8Array(Buffer.from(file.base64, "base64"));
    assert.deepEqual(await extractBytes(bytes), {
      text: file.text,
      characters: file.text.length,
    });
  });
}

test("normalize keeps tech terms whole and applies aliases", () => {
  const tokens = normalize("ReactJS, Node.js, C++, C#, CI/CD, .NET and K8s. REST APIs");
  for (const expected of ["react", "node.js", "c++", "c#", "ci/cd", "dotnet", "kubernetes", "api"]) {
    assert.ok(tokens.includes(expected), expected);
  }
  assert.deepEqual(normalize("HTML/CSS, Kubernetes, AWS, Jenkins, Express"), [
    "html",
    "css",
    "kubernetes",
    "aws",
    "jenkins",
    "express",
  ]);
});

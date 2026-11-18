import assert from "node:assert/strict";
import { test } from "node:test";
import { bulletIssues, coachBullets, MAX_COACHED } from "../src/lib/bullets.js";
import { candidateName, templateLetter } from "../src/lib/coverLetter.js";
import { createDemoApi } from "../src/lib/demo.js";
import { extractBytes } from "../src/lib/extract.js";
import { buildDocx, isHeading, parseLetter, parseResume } from "../src/lib/format.js";
import { interviewQuestions } from "../src/lib/interview.js";
import { load, remove, save } from "../src/lib/storage.js";
import sample from "../src/lib/sample.js";

const ids = (issues) => issues.map((i) => i.id);

test("bullet coach: flags weak openings, pronouns, length and missing numbers", () => {
  assert.deepEqual(ids(bulletIssues("Built dashboards used by 2 million customers")), []);
  assert.deepEqual(ids(bulletIssues("Worked on the checkout pages for the store")), ["weak", "number"]);
  assert.match(bulletIssues("Responsible for the reporting screens for 4 teams")[0].message, /Led, Owned or Managed/);
  assert.deepEqual(ids(bulletIssues("I built 3 reusable form components")), ["pronoun"]);
  assert.deepEqual(ids(bulletIssues("Mentor")), ["short", "number"]);
  assert.deepEqual(ids(bulletIssues(`Built ${"very ".repeat(30)}big things for 5 teams`)), ["long"]);
});

test("bullet coach: lists only bullets that need work, most issues first", () => {
  const result = coachBullets(sample.resume);
  assert.equal(result.total, 9);
  assert.equal(result.strong + result.items.length, result.total);
  assert.ok(result.items.every((item) => item.issues.length > 0));
  const counts = result.items.map((item) => item.issues.length);
  assert.deepEqual(counts, [...counts].sort((a, b) => b - a));
  assert.equal(result.items[0].text, "Responsible for the reporting screens that show payment data to merchants");
  const many = Array.from({ length: 40 }, (_, i) => `- worked on thing ${i}`).join("\n");
  assert.equal(coachBullets(many).items.length, MAX_COACHED);
  assert.deepEqual(coachBullets("No bullets here."), { total: 0, strong: 0, items: [] });
});

test("interview prep: questions for skills shown, skills missing and the job's themes", () => {
  const questions = interviewQuestions(sample.resume, sample.job);
  const kinds = questions.map((q) => q.kind);
  assert.equal(kinds[0], "general");
  assert.equal(kinds.at(-1), "general");
  const skill = questions.filter((q) => q.kind === "skill");
  const gap = questions.filter((q) => q.kind === "gap");
  assert.ok(skill.length >= 1 && skill.length <= 4);
  assert.ok(gap.length >= 1 && gap.length <= 3);
  assert.ok(skill.some((q) => q.question.includes("React")));
  assert.ok(gap.some((q) => /GraphQL|Next\.js|AWS|Node\.js|CI\/CD/.test(q.question)));
  assert.ok(questions.some((q) => q.kind === "theme" && /junior colleague/.test(q.question)));
  assert.ok(questions.filter((q) => q.kind === "theme").length <= 4);
  assert.ok(questions.every((q) => q.question && q.tip));
});

test("interview prep works with an empty job post", () => {
  const questions = interviewQuestions(sample.resume, "");
  assert.deepEqual(questions.map((q) => q.kind), ["general", "general"]);
});

test("format: splits a resume into name, contact, headings, bullets and text", () => {
  const parsed = parseResume(sample.resume);
  assert.equal(parsed.name, "Ravi Kumar");
  assert.match(parsed.contact, /ravi\.kumar@example\.com/);
  const headings = parsed.blocks.filter((b) => b.type === "heading").map((b) => b.text);
  assert.deepEqual(headings, ["SUMMARY", "EXPERIENCE", "EDUCATION", "SKILLS"]);
  assert.equal(parsed.blocks.filter((b) => b.type === "bullet").length, 9);
  const roles = parsed.blocks.filter((b) => b.type === "role").map((b) => b.text);
  assert.deepEqual(roles, [
    "Acme Payments, Senior Developer, 2021 to present",
    "Shopline Retail, Developer, 2018 to 2021",
    "B.Tech in Computer Science, JNTU Hyderabad, 2018",
  ]);
  assert.ok(parsed.blocks.some((b) => b.type === "text" && b.text.startsWith("Front-end developer")));
  assert.deepEqual(parseResume("  \n "), { name: "", contact: "", blocks: [] });
});

test("format: headings by name or capitals, never contact lines", () => {
  assert.equal(isHeading("Work Experience:"), true);
  assert.equal(isHeading("PROJECTS"), true);
  assert.equal(isHeading("RAVI@EXAMPLE.COM | 98765"), false);
  assert.equal(isHeading("Built things in React"), false);
});

test("format: a letter keeps its lines and marks new paragraphs", () => {
  const parsed = parseLetter("Dear Hiring Manager,\n\nFirst line\nsecond line\n- a point\n\nSincerely,\nAsha");
  assert.deepEqual(parsed.blocks, [
    { type: "text", text: "Dear Hiring Manager,", gap: false },
    { type: "text", text: "First line", gap: true },
    { type: "text", text: "second line", gap: false },
    { type: "bullet", text: "a point", gap: false },
    { type: "text", text: "Sincerely,", gap: true },
    { type: "text", text: "Asha", gap: false },
  ]);
});

test("Word download contains every line of the resume, in order", async (t) => {
  try {
    await import("docx");
  } catch {
    t.skip("docx is not installed; run npm install");
    return;
  }
  const blob = await buildDocx(sample.resume);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  assert.equal(String.fromCharCode(bytes[0], bytes[1]), "PK"); // a zip, like every .docx
  // Read it back with the app's own upload reader.
  const { text } = await extractBytes(bytes);
  const expected = sample.resume
    .split("\n")
    .map((line) => line.replace(/^- /, "").trim())
    .filter(Boolean);
  const got = text.split("\n").map((line) => line.trim()).filter(Boolean);
  assert.deepEqual(got, expected);

  const letter = await buildDocx(templateLetter(sample.resume, sample.job), "letter");
  const { text: letterText } = await extractBytes(new Uint8Array(await letter.arrayBuffer()));
  assert.match(letterText, /Dear Hiring Manager,/);
  assert.match(letterText, /Sincerely,\s+Ravi Kumar/);
});

test("storage: saves, loads and forgets, and survives missing or broken storage", () => {
  const original = globalThis.localStorage;
  try {
    const data = new Map();
    globalThis.localStorage = {
      getItem: (k) => (data.has(k) ? data.get(k) : null),
      setItem: (k, v) => data.set(k, v),
      removeItem: (k) => data.delete(k),
    };
    assert.equal(load("resume", "none"), "none");
    assert.equal(save("resume", { text: "hi" }), true);
    assert.deepEqual(load("resume"), { text: "hi" });
    remove("resume");
    assert.equal(load("resume"), null);

    data.set("ai-resume-builder:broken", "{not json");
    assert.equal(load("broken", "fallback"), "fallback");

    globalThis.localStorage = {
      getItem() {
        throw new Error("blocked");
      },
      setItem() {
        throw new Error("full");
      },
      removeItem() {
        throw new Error("blocked");
      },
    };
    assert.equal(load("resume", "fallback"), "fallback");
    assert.equal(save("resume", "x"), false);
    remove("resume");
  } finally {
    globalThis.localStorage = original;
  }
});

test("demo: cover letter uses the template and invents nothing", async () => {
  const api = createDemoApi();
  const result = await api.coverLetter(sample.resume, sample.job);
  assert.equal(result.ai, false);
  assert.deepEqual(result.check, []);
  assert.equal(result.letter, templateLetter(sample.resume, sample.job));
  assert.match(result.notice, /demo has no AI model/);
  assert.equal(candidateName(sample.resume), "Ravi Kumar");
});

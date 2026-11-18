import assert from "node:assert/strict";
import { test } from "node:test";
import { atsCheck } from "../src/lib/ats.js";
import { createDemoApi } from "../src/lib/demo.js";
import { candidateLabel, nameLine, redactResume } from "../src/lib/redact.js";
import sample from "../src/lib/sample.js";
import {
  addApplication,
  applicationsToCsv,
  exportBackup,
  importBackup,
  MAX_APPLICATIONS,
  normalizeApplication,
  removeApplication,
  sortApplications,
  summarize,
  updateApplication,
} from "../src/lib/tracker.js";

test("tracker: records are cleaned, unsafe links dropped and scores bounded", () => {
  const app = normalizeApplication({
    company: "  Acme  ",
    role: "Frontend Engineer",
    status: "nonsense",
    date: "yesterday",
    link: "javascript:alert(1)",
    score: 140,
    extra: "dropped",
  });
  assert.equal(app.company, "Acme");
  assert.equal(app.status, "saved");
  assert.match(app.date, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(app.link, "");
  assert.equal(app.score, null);
  assert.equal("extra" in app, false);
  assert.equal(normalizeApplication({ link: "https://jobs.example.com/1", score: "64.4" }).link, "https://jobs.example.com/1");
  assert.equal(normalizeApplication({ score: "64.4" }).score, 64);
  assert.equal(normalizeApplication({ score: null }).score, null); // never turns into 0
  assert.equal(normalizeApplication({ score: 0 }).score, 0);
  assert.equal(normalizeApplication({ notes: "x".repeat(5000) }).notes.length, 2000);
});

test("tracker: add, update, remove, sort, filter and summarize", () => {
  let list = [];
  list = addApplication(list, { company: "A", status: "applied", date: "2026-11-01" });
  list = addApplication(list, { company: "B", status: "interview", date: "2026-11-10" });
  list = addApplication(list, { company: "C", status: "saved", date: "2026-11-10" });
  list = addApplication(list, { company: "D", status: "rejected", date: "2026-10-20" });
  assert.deepEqual(sortApplications(list).map((a) => a.company), ["C", "B", "A", "D"]);
  assert.deepEqual(sortApplications(list, "interview").map((a) => a.company), ["B"]);
  const b = list.find((a) => a.company === "B");
  list = updateApplication(list, b.id, { status: "offer", id: "ignored" });
  assert.equal(list.find((a) => a.company === "B").status, "offer");
  assert.equal(list.find((a) => a.company === "B").id, b.id);
  const summary = summarize(list);
  assert.equal(summary.total, 4);
  assert.deepEqual(summary.counts, { saved: 1, applied: 1, interview: 0, offer: 1, rejected: 1 });
  assert.equal(summary.responseRate, 33); // 1 of the 3 sent reached an interview or offer
  list = removeApplication(list, b.id);
  assert.equal(list.length, 3);
  assert.equal(summarize([]).responseRate, null);
  const many = Array.from({ length: MAX_APPLICATIONS + 5 }, (_, i) => ({ company: `Co ${i}` }));
  assert.equal(many.reduce(addApplication, []).length, MAX_APPLICATIONS);
});

test("tracker: CSV export is safe for spreadsheets; backups round-trip", () => {
  const list = addApplication([], { company: "=HYPERLINK(1)", role: 'Dev "lead"', status: "applied", date: "2026-11-02", score: 70 });
  const csv = applicationsToCsv(list);
  assert.match(csv, /^"Date","Company","Role","Status"/);
  assert.match(csv, /"'=HYPERLINK\(1\)"/);
  assert.match(csv, /"Dev ""lead"""/);
  assert.match(csv, /"Applied","70"/);
  assert.deepEqual(importBackup(exportBackup(list)), list);
  assert.deepEqual(importBackup(JSON.stringify([{ company: "Plain list" }]))[0].company, "Plain list");
  assert.throws(() => importBackup("not json"), /not a tracker backup/);
  assert.throws(() => importBackup('{"other": 1}'), /not a tracker backup/);
});

test("anonymous screening: removes name, contact details, links and personal details", () => {
  const resume = [
    "Priya Sharma",
    "priya.sharma@example.com | +91 98765 43210 | linkedin.com/in/priya-sharma",
    "Date of Birth: 12/03/1995",
    "Gender - Female",
    "Marital status: Single",
    "",
    "SUMMARY",
    "Priya is a React developer. See https://priya.dev for work.",
    "- Built dashboards used by 2 million customers",
  ].join("\n");
  const { text, removed } = redactResume(resume);
  for (const secret of ["Priya", "Sharma", "example.com", "98765", "linkedin", "1995", "Female", "Single", "priya.dev"]) {
    assert.ok(!text.includes(secret), `${secret} should be removed:\n${text}`);
  }
  assert.ok(text.startsWith("[Name]\n[email] | [phone] | [link]"), text);
  assert.ok(text.includes("[personal detail removed]"));
  assert.ok(text.includes("- Built dashboards used by 2 million customers"));
  assert.ok(text.includes("[Name] is a React developer. See [link] for work."));
  assert.ok(removed >= 9);
});

test("anonymous screening: leaves resumes without a name line alone except contacts", () => {
  assert.equal(nameLine("SUMMARY of skills 2024\nmore"), "");
  assert.equal(nameLine("Ravi Kumar\nmore"), "Ravi Kumar");
  assert.equal(nameLine("José María Núñez\nmore"), "José María Núñez");
  const { text } = redactResume("Experienced engineer 2024\nMail me: a@b.co");
  assert.equal(text, "Experienced engineer 2024\nMail me: [email]");
  assert.equal(redactResume(sample.resume).text.includes("Ravi"), false);
  assert.equal(candidateLabel(0), "Candidate 1");
});

test("ATS check: Word layout problems found in the browser too", () => {
  const facts = { type: "docx", pages: null, tables: 2, text_boxes: 0, images: 1, header_text: "a@b.co" };
  const result = atsCheck("Asha Rao\nBuilt things", facts);
  const byId = Object.fromEntries(result.checks.map((c) => [c.id, c]));
  assert.equal(byId.tables.detail.startsWith("2 tables found"), true);
  assert.equal(byId.images.ok, false);
  assert.match(byId.contact.detail, /page header or footer/);
  assert.equal(result.passed, result.checks.filter((c) => c.ok).length);
});

test("demo: ranks job posts for one resume, best fit first", async () => {
  const api = createDemoApi();
  const { results } = await api.rankJobs(sample.resume, [
    { name: "Bakery", text: "Bread, cakes and ovens. Bread daily." },
    { name: "Frontend", text: sample.job },
  ]);
  assert.deepEqual(results.map((r) => r.name), ["Frontend", "Bakery"]);
  assert.equal(results[0].index, 1);
});

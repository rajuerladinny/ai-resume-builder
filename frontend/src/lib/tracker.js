// Application tracker: where you applied, with which resume, and what happened.
// Kept only in this browser (see storage.js); export to CSV or a backup file
// to keep a copy or move it to another device.
import { csvCell } from "./rank.js";

export const STATUSES = [
  ["saved", "Saved"],
  ["applied", "Applied"],
  ["interview", "Interview"],
  ["offer", "Offer"],
  ["rejected", "Rejected"],
];
const STATUS_IDS = new Set(STATUSES.map(([id]) => id));
export const MAX_APPLICATIONS = 500;
const LIMITS = { company: 120, role: 120, link: 500, notes: 2000, resume: 120 };

const today = () => new Date().toISOString().slice(0, 10);
const newId = () =>
  globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/** A clean application record; unknown fields are dropped, long ones cut. */
export function normalizeApplication(input = {}) {
  const text = (key) => String(input[key] ?? "").trim().slice(0, LIMITS[key]);
  const score = input.score === null || input.score === undefined || input.score === "" ? NaN : Number(input.score);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(input.date ?? "") ? input.date : today();
  const link = text("link");
  return {
    id: typeof input.id === "string" && input.id ? input.id.slice(0, 64) : newId(),
    company: text("company"),
    role: text("role"),
    status: STATUS_IDS.has(input.status) ? input.status : "saved",
    date,
    // Only web links, so a pasted "javascript:" link can never run.
    link: /^https?:\/\//i.test(link) ? link : "",
    resume: text("resume"),
    score: Number.isFinite(score) && score >= 0 && score <= 100 ? Math.round(score) : null,
    notes: text("notes"),
  };
}

export function addApplication(list, input) {
  return [normalizeApplication(input), ...list].slice(0, MAX_APPLICATIONS);
}

export function updateApplication(list, id, changes) {
  return list.map((app) => (app.id === id ? normalizeApplication({ ...app, ...changes, id }) : app));
}

export function removeApplication(list, id) {
  return list.filter((app) => app.id !== id);
}

/** Counts per status, plus the share of applications that reached an interview or offer. */
export function summarize(list) {
  const counts = Object.fromEntries(STATUSES.map(([id]) => [id, 0]));
  for (const app of list) counts[app.status] += 1;
  const sent = list.length - counts.saved;
  const progressed = counts.interview + counts.offer;
  return { total: list.length, counts, responseRate: sent ? Math.round((progressed * 100) / sent) : null };
}

/** Newest first; within a day, the order added. Optionally only one status. */
export function sortApplications(list, status = "all") {
  return list
    .map((app, order) => ({ app, order }))
    .filter(({ app }) => status === "all" || app.status === status)
    .sort((a, b) => b.app.date.localeCompare(a.app.date) || a.order - b.order)
    .map(({ app }) => app);
}

export function applicationsToCsv(list) {
  const label = Object.fromEntries(STATUSES);
  const header = ["Date", "Company", "Role", "Status", "Match score", "Resume version", "Link", "Notes"];
  const rows = list.map((a) => [a.date, a.company, a.role, label[a.status], a.score ?? "", a.resume, a.link, a.notes]);
  return [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

/** Read a backup file made by "Download backup". Throws an Error safe to show. */
export function importBackup(json) {
  let data;
  try {
    data = JSON.parse(json);
  } catch {
    throw new Error("This is not a tracker backup file.");
  }
  const list = Array.isArray(data) ? data : data?.applications;
  if (!Array.isArray(list)) throw new Error("This is not a tracker backup file.");
  return list.slice(0, MAX_APPLICATIONS).map(normalizeApplication);
}

export function exportBackup(list) {
  return JSON.stringify({ app: "ai-resume-builder", version: 1, applications: list }, null, 2);
}

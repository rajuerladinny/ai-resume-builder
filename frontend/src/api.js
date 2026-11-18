import { createDemoApi } from "./lib/demo.js";

// Demo mode runs entirely in the browser: a build with VITE_DEMO_MODE=true, or ?demo in the URL.
export const DEMO =
  import.meta.env.VITE_DEMO_MODE === "true" ||
  new URLSearchParams(window.location.search).has("demo");

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
// Tailoring waits on an AI model, so it gets a long allowance.
const TIMEOUT_MS = 120000;

async function send(path, init, fallback422) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await fetch(`/api${path}`, { method: "POST", ...init, signal: controller.signal });
  } catch {
    throw new Error("Could not reach the server. Check your connection and try again.");
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error(
      typeof detail.detail === "string"
        ? detail.detail
        : res.status === 422
          ? fallback422
          : "Something went wrong. Please try again."
    );
  }
  return res.json();
}

const post = (path, body) =>
  send(
    path,
    { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
    "Paste at least a few lines for both the resume and the job post."
  );

const httpApi = {
  analyze: (resume, job) => post("/analyze", { resume, job }),
  tailor: (resume, job) => post("/tailor", { resume, job }),
  coverLetter: (resume, job) => post("/cover-letter", { resume, job }),
  rank: (job, resumes) => post("/rank", { job, resumes }),
  rankJobs: (resume, jobs) => post("/rank-jobs", { resume, jobs }),
  // The file is sent as the raw request body and read in memory; it is not stored.
  extract: (file) =>
    send(
      "/extract",
      { headers: { "Content-Type": "application/octet-stream" }, body: file },
      "This file could not be read. Paste the text instead."
    ),
};

/** Whether the server has an AI model connected: "ai", "mock", or null when unknown. */
export async function aiMode() {
  if (DEMO) return "demo";
  try {
    const res = await fetch("/api/health");
    return res.ok ? (await res.json()).ai ?? null : null;
  } catch {
    return null;
  }
}

export const api = DEMO ? createDemoApi() : httpApi;

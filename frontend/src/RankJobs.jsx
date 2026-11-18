import { useRef, useState } from "react";
import { api } from "./api.js";
import { roleTitle } from "./lib/coverLetter.js";
import sample from "./lib/sample.js";

const MIN_RESUME = 100;
const MIN_JOB = 50;
const MAX_RESUME = 20000;
const MAX_JOB = 10000;
export const MAX_JOBS = 10;

const tone = (score) => (score >= 70 ? "good" : score >= 40 ? "ok" : "low");

const SAMPLE_JOBS = [
  sample.job,
  `Backend Python Developer

We need a Python developer to build REST APIs with Django and PostgreSQL on AWS. You will write unit tests, review code and work with Docker and Kubernetes. Experience with Redis and Kafka is a plus.`,
  `UI Engineer (React)

Join our design systems team. Build accessible, responsive React components in TypeScript with Storybook and Jest. You will work closely with designers, improve performance and mentor other engineers on accessibility.`,
];

/** Rank several job posts against one resume, to decide where to apply first. */
export default function RankJobs({ resume, setResume, onTailor, onTrack }) {
  const nextId = useRef(1);
  const blank = () => ({ id: nextId.current++, title: "", text: "" });
  const [jobs, setJobs] = useState(() => [blank(), blank()]);
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [tracked, setTracked] = useState([]);

  const filled = jobs.filter((j) => j.text.trim().length >= MIN_JOB);
  const ready = resume.trim().length >= MIN_RESUME && filled.length >= 1;
  const nameOf = (job, i) => job.title.trim() || roleTitle(job.text) || `Job ${i + 1}`;

  function change(id, field, value) {
    setJobs((list) => list.map((j) => (j.id === id ? { ...j, [field]: value } : j)));
    setData(null);
  }

  async function rank() {
    setBusy(true);
    setError("");
    setTracked([]);
    try {
      const submitted = filled.map((j) => ({ id: j.id, name: nameOf(j, jobs.indexOf(j)), text: j.text }));
      const res = await api.rankJobs(
        resume,
        submitted.map(({ name, text }) => ({ name, text }))
      );
      setData({ submitted, results: res.results });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function loadSample() {
    setResume(sample.resume);
    setJobs(SAMPLE_JOBS.map((text) => ({ ...blank(), text })));
    setData(null);
    setError("");
  }

  return (
    <>
      <p className="notice no-print">
        Paste your resume and up to {MAX_JOBS} job posts you are considering. See which ones fit you best, so you can
        spend your time on the applications most likely to get a reply.
      </p>
      <section className="inputs no-print">
        <div className="field">
          <label htmlFor="jobs-resume">Your resume</label>
          <textarea
            id="jobs-resume"
            rows={16}
            maxLength={MAX_RESUME}
            value={resume}
            placeholder="Paste your resume (shared with the Tailor tab)"
            onChange={(e) => {
              setResume(e.target.value);
              setData(null);
            }}
          />
        </div>
        <div className="field">
          <span className="label">
            Job posts ({jobs.length} of {MAX_JOBS})
          </span>
          <div className="job-list">
            {jobs.map((job, i) => (
              <div key={job.id} className="job-item">
                <div className="row">
                  <input
                    type="text"
                    className="text-input"
                    aria-label={`Job ${i + 1} title`}
                    placeholder={`Job ${i + 1} title (optional)`}
                    maxLength={120}
                    value={job.title}
                    onChange={(e) => change(job.id, "title", e.target.value)}
                  />
                  {jobs.length > 1 && (
                    <button
                      type="button"
                      className="link"
                      aria-label={`Remove job ${i + 1}`}
                      onClick={() => {
                        setJobs((list) => list.filter((j) => j.id !== job.id));
                        setData(null);
                      }}
                    >
                      Remove
                    </button>
                  )}
                </div>
                <textarea
                  rows={4}
                  maxLength={MAX_JOB}
                  aria-label={`Job ${i + 1} description`}
                  placeholder="Paste the job description"
                  value={job.text}
                  onChange={(e) => change(job.id, "text", e.target.value)}
                />
              </div>
            ))}
          </div>
          {jobs.length < MAX_JOBS && (
            <button type="button" className="small secondary" onClick={() => setJobs((list) => [...list, blank()])}>
              Add another job
            </button>
          )}
        </div>
      </section>

      <div className="actions no-print">
        <button disabled={!ready || busy} onClick={rank}>
          {busy ? "Ranking…" : `Rank ${filled.length || ""} jobs`.replace("  ", " ")}
        </button>
        <button type="button" className="link" disabled={busy} onClick={loadSample}>
          Try a sample
        </button>
        {!ready && <span className="hint">Paste your resume and at least one job post.</span>}
      </div>
      {error && (
        <p className="error no-print" role="alert">
          {error}
        </p>
      )}

      {data && (
        <section className="card no-print">
          <h2>Best fit first</h2>
          <p className="hint">
            The score counts how many of each job post's keywords your resume shows. Apply first where you score
            highest, and tailor your resume for each one.
          </p>
          <ol className="job-results">
            {data.results.map((r) => {
              const job = data.submitted[r.index];
              return (
                <li key={job.id}>
                  <span className={`pct big ${tone(r.score)}`}>{r.score}%</span>
                  <div className="job-result-body">
                    <strong>{r.name}</strong>
                    <span className="hint">
                      {r.matched.length} of {r.keywords} keywords found
                      {r.missing.length > 0 && ` · missing: ${r.missing.slice(0, 6).join(", ")}`}
                      {r.missing.length > 6 && "…"}
                    </span>
                  </div>
                  <div className="row tight">
                    <button type="button" className="small secondary" onClick={() => onTailor(job.text)}>
                      Tailor for this job
                    </button>
                    <button
                      type="button"
                      className="small secondary"
                      disabled={tracked.includes(job.id)}
                      onClick={() => {
                        onTrack({ role: r.name, score: r.score, status: "saved" });
                        setTracked((list) => [...list, job.id]);
                      }}
                    >
                      {tracked.includes(job.id) ? "Saved to tracker" : "Save to tracker"}
                    </button>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      )}
    </>
  );
}

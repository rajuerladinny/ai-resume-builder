import { useMemo, useRef, useState } from "react";
import { api, DEMO, MAX_UPLOAD_BYTES } from "./api.js";
import { diffLines, diffSummary } from "./lib/diff.js";
import sample from "./lib/sample.js";

const MIN_CHARS = 100;
const MAX_RESUME = 20000;
const MAX_JOB = 10000;

function Score({ label, value }) {
  const tone = value >= 70 ? "good" : value >= 40 ? "ok" : "low";
  return (
    <div className={`score ${tone}`}>
      <span className="score-value">{value}%</span>
      <span className="score-label">{label}</span>
    </div>
  );
}

function Chips({ title, items, tone }) {
  if (!items.length) return null;
  return (
    <div className="chips">
      <h3>{title}</h3>
      <div>
        {items.map((item) => (
          <span key={item} className={`chip ${tone}`}>
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

function Review({ review, title }) {
  return (
    <section className="card no-print">
      <div className="row">
        <h2>{title}</h2>
        <span className="hint">
          {review.passed} of {review.total} checks passed · {review.words} words
        </span>
      </div>
      <ul className="checks">
        {review.checks.map((c) => (
          <li key={c.id} className={c.ok ? "pass" : "fail"}>
            <span className="mark" aria-hidden="true">
              {c.ok ? "✓" : "!"}
            </span>
            <span>
              <strong>{c.title}</strong>
              <span className="visually-hidden">{c.ok ? " (passed): " : " (needs work): "}</span>
              <br />
              {c.detail}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Changes({ before, after }) {
  const lines = useMemo(() => diffLines(before.trim(), after.trim()), [before, after]);
  const { added, removed } = diffSummary(lines);
  if (!added && !removed) return <p className="hint">No lines were changed.</p>;
  return (
    <>
      <p className="hint">
        {added} {added === 1 ? "line" : "lines"} added or rewritten, {removed} removed or replaced.
      </p>
      <div className="diff" role="group" aria-label="Changes from your original resume">
        {lines.map((line, i) => (
          <div key={i} className={`diff-line ${line.type}`}>
            <span className="diff-mark" aria-hidden="true">
              {line.type === "added" ? "+" : line.type === "removed" ? "−" : " "}
            </span>
            <span className="visually-hidden">
              {line.type === "added" ? "Added: " : line.type === "removed" ? "Removed: " : ""}
            </span>
            {line.text || " "}
          </div>
        ))}
      </div>
    </>
  );
}

function download(filename, text) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function App() {
  const [resume, setResume] = useState("");
  const [job, setJob] = useState("");
  const [analysis, setAnalysis] = useState(null);
  const [review, setReview] = useState(null);
  const [result, setResult] = useState(null);
  const [original, setOriginal] = useState("");
  const [tailored, setTailored] = useState("");
  const [view, setView] = useState("edit");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const fileInput = useRef(null);

  function reset() {
    setAnalysis(null);
    setReview(null);
    setResult(null);
    setError("");
    setCopied(false);
  }

  async function run(kind) {
    setBusy(kind);
    setError("");
    setCopied(false);
    try {
      if (kind === "analyze") {
        const res = await api.analyze(resume, job);
        setAnalysis(res);
        setReview(res.review);
        setResult(null);
      } else {
        const res = await api.tailor(resume, job);
        setResult(res);
        setOriginal(resume);
        setTailored(res.tailored);
        setAnalysis(res.after);
        setReview(res.review);
        setView("edit");
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  }

  async function upload(e) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow choosing the same file again
    if (!file) return;
    if (file.size > MAX_UPLOAD_BYTES) {
      setError("The file is larger than 5 MB.");
      return;
    }
    setBusy("upload");
    setError("");
    try {
      const res = await api.extract(file);
      setResume(res.text.slice(0, MAX_RESUME));
      reset();
      if (res.text.length > MAX_RESUME) {
        setError(`The file is long; only the first ${MAX_RESUME.toLocaleString()} characters were kept.`);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  }

  function loadSample() {
    setResume(sample.resume);
    setJob(sample.job);
    reset();
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(tailored);
      setCopied(true);
    } catch {
      setError("Could not copy. Select the text and copy it manually.");
    }
  }

  const ready = resume.trim().length >= MIN_CHARS && job.trim().length >= MIN_CHARS;
  const rewritten = Boolean(result && result.rewritten);

  return (
    <div className="page">
      {DEMO && (
        <p className="demo-bar no-print" role="status">
          <strong>Demo.</strong> Runs in your browser; nothing is sent anywhere. Load the sample to
          see a prepared rewrite.
        </p>
      )}
      <header className="no-print">
        <h1>AI Resume Builder</h1>
        <p>
          Paste your resume and a job post. See how well they match, then get a
          version tailored to that job.
        </p>
      </header>

      <section className="inputs no-print">
        <div>
          <div className="row">
            <label htmlFor="resume">Your resume</label>
            <div className="row tight">
              <input
                ref={fileInput}
                type="file"
                className="visually-hidden"
                tabIndex={-1}
                aria-hidden="true"
                accept={DEMO ? ".txt,.md,text/plain" : ".pdf,.docx,.txt,.md"}
                onChange={upload}
              />
              <button
                type="button"
                className="small secondary"
                disabled={Boolean(busy)}
                onClick={() => fileInput.current?.click()}
              >
                {busy === "upload" ? "Reading…" : DEMO ? "Upload text file" : "Upload PDF or Word"}
              </button>
            </div>
          </div>
          <textarea
            id="resume"
            rows={12}
            maxLength={MAX_RESUME}
            value={resume}
            placeholder="Paste your resume as plain text, or upload a file"
            onChange={(e) => setResume(e.target.value)}
          />
          <span className="count">
            {resume.length.toLocaleString()} / {MAX_RESUME.toLocaleString()}
          </span>
        </div>
        <div>
          <div className="row">
            <label htmlFor="job">Job post</label>
          </div>
          <textarea
            id="job"
            rows={12}
            maxLength={MAX_JOB}
            value={job}
            placeholder="Paste the full job description"
            onChange={(e) => setJob(e.target.value)}
          />
          <span className="count">
            {job.length.toLocaleString()} / {MAX_JOB.toLocaleString()}
          </span>
        </div>
      </section>

      <div className="actions no-print">
        <button
          className="secondary"
          disabled={!ready || Boolean(busy)}
          onClick={() => run("analyze")}
        >
          {busy === "analyze" ? "Checking…" : "Check match"}
        </button>
        <button disabled={!ready || Boolean(busy)} onClick={() => run("tailor")}>
          {busy === "tailor" ? "Tailoring…" : "Tailor my resume"}
        </button>
        <button type="button" className="link" disabled={Boolean(busy)} onClick={loadSample}>
          Try a sample
        </button>
        {(resume || job) && (
          <button
            type="button"
            className="link"
            disabled={Boolean(busy)}
            onClick={() => {
              setResume("");
              setJob("");
              reset();
            }}
          >
            Clear
          </button>
        )}
        {!ready && <span className="hint">Paste both to continue.</span>}
      </div>
      {error && (
        <p className="error no-print" role="alert">
          {error}
        </p>
      )}

      {analysis && (
        <section className="card no-print">
          <div className="scores">
            {rewritten && <Score label="Before" value={result.before.score} />}
            <Score label={rewritten ? "After" : "Match score"} value={analysis.score} />
          </div>
          {analysis.keywords === 0 && (
            <p className="hint">
              No keywords found in the job post. Paste the full description.
            </p>
          )}
          <Chips title="Found in your resume" items={analysis.matched} tone="good" />
          <Chips title="Missing from your resume" items={analysis.missing} tone="low" />
          <p className="hint">
            Only add a missing keyword if you really have that experience.
          </p>
        </section>
      )}

      {review && (
        <Review review={review} title={result ? "Tailored resume review" : "Resume review"} />
      )}

      {result && (
        <section className="card">
          {result.notice && <p className="notice no-print">{result.notice}</p>}
          {result.check.length > 0 && (
            <p className="warning no-print">
              Check these before sending. The rewrite mentions them, but your
              original resume did not: <strong>{result.check.join(", ")}</strong>.
              Remove any that are not true.
            </p>
          )}
          <div className="row no-print">
            <h2>Tailored resume</h2>
            <div className="row tight">
              <button
                className="secondary"
                aria-pressed={view === "changes"}
                onClick={() => setView(view === "edit" ? "changes" : "edit")}
              >
                {view === "edit" ? "Show changes" : "Back to editing"}
              </button>
              <button className="secondary" onClick={copy}>
                {copied ? "Copied" : "Copy"}
              </button>
              <button
                className="secondary"
                onClick={() => download("tailored-resume.txt", tailored)}
              >
                Download .txt
              </button>
              <button className="secondary" onClick={() => window.print()}>
                Save as PDF
              </button>
            </div>
          </div>
          {view === "edit" ? (
            <textarea
              className="output no-print"
              rows={22}
              aria-label="Tailored resume"
              value={tailored}
              onChange={(e) => setTailored(e.target.value)}
            />
          ) : (
            <div className="no-print">
              <Changes before={original} after={tailored} />
            </div>
          )}
          <pre className="print-only">{tailored}</pre>
          {result.suggestions.length > 0 && (
            <div className="no-print">
              <h3>Ways to improve it further</h3>
              <ul>
                {result.suggestions.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      <footer className="no-print">
        This app does not save your resume or uploaded files. AI rewriting sends the text to an AI
        provider to produce the result.
      </footer>
    </div>
  );
}

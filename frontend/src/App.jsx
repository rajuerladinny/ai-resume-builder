import { useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { aiMode, api, DEMO, MAX_UPLOAD_BYTES } from "./api.js";
import Compare from "./Compare.jsx";
import { coachBullets } from "./lib/bullets.js";
import { diffLines, diffSummary } from "./lib/diff.js";
import { buildDocx, parseLetter, parseResume } from "./lib/format.js";
import { interviewQuestions } from "./lib/interview.js";
import sample from "./lib/sample.js";
import { load, remove, save } from "./lib/storage.js";

const MIN_CHARS = 100;
const MAX_RESUME = 20000;
const MAX_JOB = 10000;

const tone = (value) => (value >= 70 ? "good" : value >= 40 ? "ok" : "low");

function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const downloadText = (filename, text) =>
  downloadBlob(filename, new Blob([text], { type: "text/plain;charset=utf-8" }));

/* ---------- small pieces ---------- */

function ScoreRing({ label, value }) {
  return (
    <div className={`score ${tone(value)}`}>
      <div className="ring" style={{ "--value": value }} role="img" aria-label={`${label}: ${value}%`}>
        <span className="score-value">{value}%</span>
      </div>
      <span className="score-label">{label}</span>
    </div>
  );
}

function Chips({ title, items, tone: chipTone }) {
  if (!items.length) return null;
  return (
    <div className="chips">
      <h3>{title}</h3>
      <div>
        {items.map((item) => (
          <span key={item} className={`chip ${chipTone}`}>
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
            {line.text || " "}
          </div>
        ))}
      </div>
    </>
  );
}

/** Copy, Word, text and PDF buttons for a document. */
function ExportButtons({ text, kind, baseName, onPrint, onError }) {
  const [copied, setCopied] = useState(false);
  const [building, setBuilding] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      onError("Could not copy. Select the text and copy it manually.");
    }
  }

  async function word() {
    setBuilding(true);
    try {
      downloadBlob(`${baseName}.docx`, await buildDocx(text, kind));
    } catch {
      onError("The Word file could not be created. Try the PDF or text download.");
    } finally {
      setBuilding(false);
    }
  }

  return (
    <>
      <button type="button" className="secondary" onClick={copy}>
        {copied ? "Copied" : "Copy"}
      </button>
      <button type="button" className="secondary" disabled={building} onClick={word}>
        {building ? "Preparing…" : "Word"}
      </button>
      <button type="button" className="secondary" onClick={() => downloadText(`${baseName}.txt`, text)}>
        Text
      </button>
      <button type="button" className="secondary" onClick={() => onPrint(text, kind)}>
        PDF
      </button>
    </>
  );
}

/** The layout "Save as PDF" prints: single column, standard headings. */
function PrintView({ doc }) {
  if (!doc) return null;
  const parsed = doc.kind === "letter" ? parseLetter(doc.text) : parseResume(doc.text);
  const items = [];
  let bullets = [];
  const flush = () => {
    if (bullets.length) items.push(<ul key={`ul-${items.length}`}>{bullets}</ul>);
    bullets = [];
  };
  parsed.blocks.forEach((block, i) => {
    if (block.type === "bullet") {
      bullets.push(<li key={i}>{block.text}</li>);
      return;
    }
    flush();
    if (block.type === "heading") items.push(<h2 key={i}>{block.text}</h2>);
    else items.push(<p key={i} className={block.type === "role" ? "role" : block.gap ? "gap" : undefined}>{block.text}</p>);
  });
  flush();
  return (
    <article className={`print-only print-${doc.kind}`}>
      {parsed.name && <h1>{parsed.name}</h1>}
      {parsed.contact && <p className="contact">{parsed.contact}</p>}
      {items}
    </article>
  );
}

/* ---------- toolkit: bullets, interview prep, cover letter ---------- */

function BulletCoach({ text }) {
  const result = useMemo(() => coachBullets(text), [text]);
  if (!result.total) {
    return <p className="hint">No bullet points found. Start lines with "- " to describe what you did.</p>;
  }
  return (
    <>
      <p className="hint">
        {result.strong} of {result.total} bullet points look strong.
        {result.items.length > 0 && " Suggestions for the rest:"}
      </p>
      <ul className="coach">
        {result.items.map((item) => (
          <li key={item.line}>
            <q>{item.text}</q>
            <ul>
              {item.issues.map((issue) => (
                <li key={issue.id}>{issue.message}</li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </>
  );
}

function InterviewPrep({ resume, job }) {
  const questions = useMemo(() => interviewQuestions(resume, job), [resume, job]);
  const labels = { general: "General", skill: "Your skills", gap: "Gaps", theme: "From the job post" };
  return (
    <ol className="questions">
      {questions.map((q) => (
        <li key={q.question}>
          <span className={`tag ${q.kind}`}>{labels[q.kind]}</span>
          <strong>{q.question}</strong>
          <span className="hint">{q.tip}</span>
        </li>
      ))}
    </ol>
  );
}

function CoverLetter({ resume, job, onPrint }) {
  const [result, setResult] = useState(null);
  const [letter, setLetter] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function write() {
    setBusy(true);
    setError("");
    try {
      const res = await api.coverLetter(resume, job);
      setResult(res);
      setLetter(res.letter);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="row">
        <p className="hint">A letter for this job, using only facts from your resume.</p>
        <button type="button" disabled={busy} onClick={write}>
          {busy ? "Writing…" : result ? "Write again" : "Write my cover letter"}
        </button>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {result && (
        <>
          {result.notice && <p className="notice">{result.notice}</p>}
          {result.check.length > 0 && (
            <p className="warning">
              Check these before sending. The letter mentions them, but your resume does not:{" "}
              <strong>{result.check.join(", ")}</strong>.
            </p>
          )}
          <textarea
            className="output"
            rows={16}
            aria-label="Cover letter"
            value={letter}
            onChange={(e) => setLetter(e.target.value)}
          />
          <div className="row tight">
            <ExportButtons text={letter} kind="letter" baseName="cover-letter" onPrint={onPrint} onError={setError} />
          </div>
        </>
      )}
    </>
  );
}

const TOOLS = [
  ["bullets", "Improve bullets"],
  ["interview", "Interview prep"],
  ["letter", "Cover letter"],
];

function Toolkit({ resume, job, onPrint }) {
  const [tool, setTool] = useState("bullets");
  return (
    <section className="card no-print">
      <h2>Next steps</h2>
      <div className="modes small" role="tablist" aria-label="Tools">
        {TOOLS.map(([value, text]) => (
          <button
            key={value}
            type="button"
            role="tab"
            id={`tool-${value}`}
            aria-selected={tool === value}
            aria-controls={`panel-${value}`}
            className={tool === value ? "mode active" : "mode"}
            onClick={() => setTool(value)}
          >
            {text}
          </button>
        ))}
      </div>
      {/* Panels stay mounted, so a written letter survives switching tabs. */}
      <div role="tabpanel" id="panel-bullets" aria-labelledby="tool-bullets" hidden={tool !== "bullets"}>
        <BulletCoach text={resume} />
      </div>
      <div role="tabpanel" id="panel-interview" aria-labelledby="tool-interview" hidden={tool !== "interview"}>
        <InterviewPrep resume={resume} job={job} />
      </div>
      <div role="tabpanel" id="panel-letter" aria-labelledby="tool-letter" hidden={tool !== "letter"}>
        <CoverLetter resume={resume} job={job} onPrint={onPrint} />
      </div>
    </section>
  );
}

/* ---------- tailor page ---------- */

function Tailor({ onPrint }) {
  const remembered = useMemo(() => load("draft"), []);
  const [remember, setRemember] = useState(Boolean(remembered));
  const [resume, setResume] = useState(remembered?.resume ?? "");
  const [job, setJob] = useState(remembered?.job ?? "");
  const [analysis, setAnalysis] = useState(null);
  const [review, setReview] = useState(null);
  const [result, setResult] = useState(null);
  const [original, setOriginal] = useState("");
  const [tailored, setTailored] = useState("");
  const [analyzed, setAnalyzed] = useState({ resume: "", job: "" });
  const [view, setView] = useState("edit");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const fileInput = useRef(null);

  // Saved only while "Remember on this device" is ticked.
  useEffect(() => {
    if (remember) save("draft", { resume, job });
    else remove("draft");
  }, [remember, resume, job]);

  function reset() {
    setAnalysis(null);
    setReview(null);
    setResult(null);
    setError("");
  }

  async function run(kind) {
    setBusy(kind);
    setError("");
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
      setAnalyzed({ resume, job });
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

  const ready = resume.trim().length >= MIN_CHARS && job.trim().length >= MIN_CHARS;
  const rewritten = Boolean(result && result.rewritten);
  // The toolkit works on the latest version: the tailored text once there is one.
  const current = result ? tailored : analyzed.resume;
  const stale = analysis && (resume !== analyzed.resume || job !== analyzed.job);

  return (
    <>
      <section className="inputs no-print">
        <div className="field">
          <div className="row">
            <label htmlFor="resume">Your resume</label>
            <input
              ref={fileInput}
              type="file"
              className="visually-hidden"
              tabIndex={-1}
              aria-hidden="true"
              accept=".pdf,.docx,.txt,.md"
              onChange={upload}
            />
            <button
              type="button"
              className="small secondary"
              disabled={Boolean(busy)}
              onClick={() => fileInput.current?.click()}
            >
              {busy === "upload" ? "Reading…" : "Upload PDF or Word"}
            </button>
          </div>
          <textarea
            id="resume"
            rows={13}
            maxLength={MAX_RESUME}
            value={resume}
            placeholder="Paste your resume as plain text, or upload a file"
            onChange={(e) => setResume(e.target.value)}
          />
          <div className="row">
            <label className="check">
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
              Remember on this device
            </label>
            <span className="count">
              {resume.length.toLocaleString()} / {MAX_RESUME.toLocaleString()}
            </span>
          </div>
        </div>
        <div className="field">
          <div className="row">
            <label htmlFor="job">Job post</label>
          </div>
          <textarea
            id="job"
            rows={13}
            maxLength={MAX_JOB}
            value={job}
            placeholder="Paste the full job description"
            onChange={(e) => setJob(e.target.value)}
          />
          <div className="row">
            <span />
            <span className="count">
              {job.length.toLocaleString()} / {MAX_JOB.toLocaleString()}
            </span>
          </div>
        </div>
      </section>

      <div className="actions no-print">
        <button className="secondary" disabled={!ready || Boolean(busy)} onClick={() => run("analyze")}>
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
      {stale && (
        <p className="notice no-print" role="status">
          You have edited the text since the last check. Run it again to update the results.
        </p>
      )}

      {analysis && (
        <section className="card no-print">
          <div className="score-row">
            <div className="scores">
              {rewritten && <ScoreRing label="Before" value={result.before.score} />}
              <ScoreRing label={rewritten ? "After" : "Match score"} value={analysis.score} />
            </div>
            <div className="score-chips">
              {analysis.keywords === 0 && (
                <p className="hint">No keywords found in the job post. Paste the full description.</p>
              )}
              <Chips title="Found in your resume" items={analysis.matched} tone="good" />
              <Chips title="Missing from your resume" items={analysis.missing} tone="low" />
              <p className="hint">Only add a missing keyword if you really have that experience.</p>
            </div>
          </div>
        </section>
      )}

      {review && <Review review={review} title={result ? "Tailored resume review" : "Resume review"} />}

      {result && (
        <section className="card no-print">
          {result.notice && <p className="notice">{result.notice}</p>}
          {result.check.length > 0 && (
            <p className="warning">
              Check these before sending. The rewrite mentions them, but your original resume did not:{" "}
              <strong>{result.check.join(", ")}</strong>. Remove any that are not true.
            </p>
          )}
          <div className="row">
            <h2>Tailored resume</h2>
            <div className="row tight">
              <button
                type="button"
                className="secondary"
                aria-pressed={view === "changes"}
                onClick={() => setView(view === "edit" ? "changes" : "edit")}
              >
                {view === "edit" ? "Show changes" : "Back to editing"}
              </button>
              <ExportButtons
                text={tailored}
                kind="resume"
                baseName="tailored-resume"
                onPrint={onPrint}
                onError={setError}
              />
            </div>
          </div>
          {view === "edit" ? (
            <textarea
              className="output"
              rows={22}
              aria-label="Tailored resume"
              value={tailored}
              onChange={(e) => setTailored(e.target.value)}
            />
          ) : (
            <Changes before={original} after={tailored} />
          )}
          {result.suggestions.length > 0 && (
            <>
              <h3>Ways to improve it further</h3>
              <ul>
                {result.suggestions.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      {analysis && <Toolkit resume={current} job={analyzed.job} onPrint={onPrint} />}
    </>
  );
}

/* ---------- page ---------- */

const THEMES = ["system", "light", "dark"];
const THEME_LABEL = { system: "Theme: system", light: "Theme: light", dark: "Theme: dark" };

function useTheme() {
  const [theme, setTheme] = useState(() => load("theme", "system"));
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "system") delete root.dataset.theme;
    else root.dataset.theme = theme;
    save("theme", theme);
  }, [theme]);
  const next = () => setTheme(THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length]);
  return [theme, next];
}

function AiStatus() {
  const [mode, setMode] = useState(null);
  useEffect(() => {
    aiMode().then(setMode);
  }, []);
  if (!mode) return null;
  const text = {
    demo: "Demo · runs in your browser",
    ai: "AI model connected",
    mock: "No AI model · analysis and templates only",
  }[mode];
  return <span className={`status-pill ${mode}`}>{text}</span>;
}

const MODES = [
  ["tailor", "Tailor my resume"],
  ["compare", "Compare resumes"],
];

export default function App() {
  const [mode, setMode] = useState("tailor");
  const [theme, nextTheme] = useTheme();
  const [printing, setPrinting] = useState(null);

  // Render the print layout synchronously, then open the browser's print dialog.
  function printDoc(text, kind) {
    flushSync(() => setPrinting({ text, kind }));
    window.print();
  }

  return (
    <>
      <div className="page no-print">
        {DEMO && (
          <p className="demo-bar" role="status">
            <strong>Demo.</strong> Runs in your browser; nothing is sent anywhere. Load the sample to see a
            prepared rewrite.
          </p>
        )}
        <header>
          <div className="brand-row">
            <div className="brand">
              <span className="logo" aria-hidden="true">
                AR
              </span>
              <h1>AI Resume Builder</h1>
            </div>
            <div className="row tight">
              <AiStatus />
              <button type="button" className="small secondary" onClick={nextTheme} title="Change theme">
                {THEME_LABEL[theme]}
              </button>
            </div>
          </div>
          <p>
            {mode === "tailor"
              ? "Paste your resume and a job post. See how well they match, fix weak spots, then get a tailored resume, a cover letter and interview questions."
              : "Hiring? Add a job post and up to 20 resumes to see which ones match it best."}
          </p>
          <div className="modes" role="tablist" aria-label="What would you like to do?">
            {MODES.map(([value, text]) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={mode === value}
                className={mode === value ? "mode active" : "mode"}
                onClick={() => setMode(value)}
              >
                {text}
              </button>
            ))}
          </div>
        </header>

        <main>
          {/* Both stay mounted, so switching tabs never loses pasted text or results. */}
          <div hidden={mode !== "tailor"}>
            <Tailor onPrint={printDoc} />
          </div>
          <div hidden={mode !== "compare"}>
            <Compare />
          </div>
        </main>

        <footer>
          Resumes are processed to produce the results and are not stored on the server. "Remember on
          this device" keeps a copy only in this browser. AI rewriting and cover letters send the text to
          the AI provider the site's owner has connected.{" "}
          <a href="https://github.com/rajuerladinny/ai-resume-builder">Source code</a>
        </footer>
      </div>
      <PrintView doc={printing} />
    </>
  );
}

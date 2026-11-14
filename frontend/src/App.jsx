import { useState } from "react";
import { api } from "./api.js";

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

export default function App() {
  const [resume, setResume] = useState("");
  const [job, setJob] = useState("");
  const [analysis, setAnalysis] = useState(null);
  const [result, setResult] = useState(null);
  const [tailored, setTailored] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  async function run(kind) {
    setBusy(kind);
    setError("");
    setCopied(false);
    try {
      if (kind === "analyze") {
        setAnalysis(await api.analyze(resume, job));
        setResult(null);
      } else {
        const res = await api.tailor(resume, job);
        setResult(res);
        setTailored(res.tailored);
        setAnalysis(res.after);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(tailored);
      setCopied(true);
    } catch {
      setError("Could not copy. Select the text and copy it manually.");
    }
  }

  const ready = resume.trim().length >= 100 && job.trim().length >= 100;

  return (
    <div className="page">
      <header className="no-print">
        <h1>AI Resume Builder</h1>
        <p>
          Paste your resume and a job post. See how well they match, then get a
          version tailored to that job.
        </p>
      </header>

      <section className="inputs no-print">
        <label>
          Your resume
          <textarea
            rows={12}
            maxLength={20000}
            value={resume}
            placeholder="Paste your resume as plain text"
            onChange={(e) => setResume(e.target.value)}
          />
        </label>
        <label>
          Job post
          <textarea
            rows={12}
            maxLength={10000}
            value={job}
            placeholder="Paste the full job description"
            onChange={(e) => setJob(e.target.value)}
          />
        </label>
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
        {!ready && <span className="hint">Paste both to continue.</span>}
      </div>
      {error && <p className="error no-print">{error}</p>}

      {analysis && (
        <section className="card no-print">
          <div className="scores">
            {result && result.rewritten && (
              <Score label="Before" value={result.before.score} />
            )}
            <Score
              label={result && result.rewritten ? "After" : "Match score"}
              value={analysis.score}
            />
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
            <div className="row">
              <button className="secondary" onClick={copy}>
                {copied ? "Copied" : "Copy"}
              </button>
              <button className="secondary" onClick={() => window.print()}>
                Save as PDF
              </button>
            </div>
          </div>
          <textarea
            className="output no-print"
            rows={22}
            value={tailored}
            onChange={(e) => setTailored(e.target.value)}
          />
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
        This app does not save your resume. AI rewriting sends it to an AI provider to produce the result.
      </footer>
    </div>
  );
}

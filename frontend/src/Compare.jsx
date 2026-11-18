import { useRef, useState } from "react";
import { api, DEMO, MAX_UPLOAD_BYTES } from "./api.js";
import { MAX_COMPARE, MAX_RESUME_CHARS, rankingToCsv, uniqueName } from "./lib/rank.js";
import { candidateLabel, redactResume } from "./lib/redact.js";
import sample from "./lib/sample.js";

const MIN_JOB = 100;
const MAX_JOB = 10000;
const WEAK_SAMPLE = `Kiran Mehta
kiran.mehta@example.com | +91 90000 12345

EXPERIENCE
Sunrise Bakery, Shift Supervisor, 2019 to present
- Managed a team of 6 bakers across two shifts
- Cut ingredient waste by 15% with a new stock sheet

EDUCATION
B.Com, Osmania University, 2018

SKILLS
Scheduling, stock control, customer service
`;

function tone(score) {
  return score >= 70 ? "good" : score >= 40 ? "ok" : "low";
}

function download(filename, text) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function Detail({ result, text, anonymous }) {
  const failed = result.review.checks.filter((c) => !c.ok);
  const [showText, setShowText] = useState(false);
  return (
    <div className="detail">
      {result.matched.length > 0 && (
        <p>
          <strong>Found:</strong>{" "}
          {result.matched.map((t) => (
            <span key={t} className="chip good">
              {t}
            </span>
          ))}
        </p>
      )}
      {result.missing.length > 0 && (
        <p>
          <strong>Missing:</strong>{" "}
          {result.missing.map((t) => (
            <span key={t} className="chip low">
              {t}
            </span>
          ))}
        </p>
      )}
      <p className="hint">
        Resume review: {result.review.passed} of {result.review.total} checks passed,{" "}
        {result.review.words} words.
        {failed.length > 0 && ` Needs work: ${failed.map((c) => c.title.toLowerCase()).join(", ")}.`}
      </p>
      <button type="button" className="link small" aria-expanded={showText} onClick={() => setShowText(!showText)}>
        {showText ? "Hide resume" : anonymous ? "Read anonymized resume" : "Read resume"}
      </button>
      {showText && <pre className="resume-text">{anonymous ? redactResume(text).text : text}</pre>}
    </div>
  );
}

export default function Compare() {
  const [job, setJob] = useState("");
  const [files, setFiles] = useState([]);
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [anonymous, setAnonymous] = useState(false);
  const fileInput = useRef(null);
  const nextId = useRef(1);

  const ready = files.filter((f) => f.status === "ready");
  const canRank = job.trim().length >= MIN_JOB && ready.length > 0 && !busy;

  async function addFiles(list) {
    const chosen = [...list];
    if (!chosen.length || busy) return;
    const room = MAX_COMPARE - files.length;
    setError(
      chosen.length > room ? `Only ${MAX_COMPARE} resumes can be compared at once.` : ""
    );
    setBusy("reading");
    setData(null);
    const names = files.map((f) => f.name);
    // One at a time: steady progress, and gentle on the upload limit.
    for (const file of chosen.slice(0, Math.max(0, room))) {
      const id = nextId.current++;
      const name = uniqueName(file.name, names);
      names.push(name);
      setFiles((current) => [...current, { id, name, status: "reading" }]);
      let update;
      try {
        if (file.size > MAX_UPLOAD_BYTES) throw new Error("The file is larger than 5 MB.");
        const res = await api.extract(file);
        update = { status: "ready", text: res.text.slice(0, MAX_RESUME_CHARS) };
      } catch (err) {
        update = { status: "error", error: err.message };
      }
      setFiles((current) => current.map((f) => (f.id === id ? { ...f, ...update } : f)));
    }
    setBusy("");
  }

  function loadSample() {
    setJob(sample.job);
    setFiles(
      [
        ["Ravi Kumar (original).txt", sample.resume],
        ["Kiran Mehta.txt", WEAK_SAMPLE],
        ["Ravi Kumar (tailored).txt", sample.tailored],
      ].map(([name, text]) => ({ id: nextId.current++, name, status: "ready", text }))
    );
    setData(null);
    setError("");
  }

  async function rank() {
    setBusy("ranking");
    setError("");
    setOpen(null);
    try {
      // Labels follow the file list, so "Candidate 2" is the same person everywhere.
      const submitted = ready.map((f) => ({ name: f.name, text: f.text, label: candidateLabel(files.indexOf(f)) }));
      // Scores always use the full text; anonymous screening only changes what is shown.
      const res = await api.rank(job, submitted.map(({ name, text }) => ({ name, text })));
      setData({ ...res, submitted });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  }

  function remove(id) {
    setFiles((current) => current.filter((f) => f.id !== id));
    setData(null);
  }

  return (
    <>
      <section className="inputs no-print">
        <div>
          <div className="row">
            <label htmlFor="compare-job">Job post</label>
          </div>
          <textarea
            id="compare-job"
            rows={12}
            maxLength={MAX_JOB}
            value={job}
            placeholder="Paste the full job description"
            onChange={(e) => {
              setJob(e.target.value);
              setData(null);
            }}
          />
          <span className="count">
            {job.length.toLocaleString()} / {MAX_JOB.toLocaleString()}
          </span>
        </div>
        <div>
          <div className="row">
            <span className="label">
              Resumes ({files.length} of {MAX_COMPARE})
            </span>
          </div>
          <div
            className={dragging ? "drop dragging" : "drop"}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              addFiles(e.dataTransfer.files);
            }}
          >
            <input
              ref={fileInput}
              type="file"
              multiple
              className="visually-hidden"
              tabIndex={-1}
              aria-hidden="true"
              accept=".pdf,.docx,.txt,.md"
              onChange={(e) => {
                addFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              className="secondary"
              disabled={Boolean(busy) || files.length >= MAX_COMPARE}
              onClick={() => fileInput.current?.click()}
            >
              {busy === "reading" ? "Reading files…" : "Choose files"}
            </button>
            <p className="hint">
              or drop them here. PDF, Word (.docx) or text, up to 5 MB each.
              {DEMO ? " Files are read in your browser and never uploaded." : " Files are not stored."}
            </p>
          </div>
          {files.length > 0 && (
            <ul className="files">
              {files.map((f, i) => (
                <li key={f.id} className={f.status}>
                  <span className="file-name">{anonymous ? candidateLabel(i) : f.name}</span>
                  <span className="file-status">
                    {f.status === "reading" ? "Reading…" : f.status === "ready" ? "Ready" : f.error}
                  </span>
                  <button
                    type="button"
                    className="link"
                    aria-label={`Remove ${anonymous ? candidateLabel(i) : f.name}`}
                    disabled={Boolean(busy)}
                    onClick={() => remove(f.id)}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <div className="actions no-print">
        <button disabled={!canRank} onClick={rank}>
          {busy === "ranking" ? "Ranking…" : `Rank ${ready.length || ""} resumes`.replace("  ", " ")}
        </button>
        <button type="button" className="link" disabled={Boolean(busy)} onClick={loadSample}>
          Try sample candidates
        </button>
        <label className="check" title="Hide names, contact details and personal details while you screen">
          <input type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} />
          Anonymous screening
        </label>
        {(job || files.length > 0) && (
          <button
            type="button"
            className="link"
            disabled={Boolean(busy)}
            onClick={() => {
              setJob("");
              setFiles([]);
              setData(null);
              setError("");
            }}
          >
            Clear
          </button>
        )}
        {!canRank && !busy && (
          <span className="hint">Paste the job post and add at least one resume.</span>
        )}
      </div>
      {error && (
        <p className="error no-print" role="alert">
          {error}
        </p>
      )}

      {data && (
        <section className="card">
          <div className="row no-print">
            <h2>Ranking</h2>
            <button
              className="secondary"
              onClick={() =>
                download(
                  "resume-ranking.csv",
                  rankingToCsv(anonymous ? data.results.map((r) => ({ ...r, name: data.submitted[r.index].label })) : data.results)
                )
              }
            >
              Export CSV
            </button>
          </div>
          <p className="notice">
            The score counts how many of the job post’s {data.keywords} keywords appear in each
            resume. Use it to decide what to read first, not whom to reject: a strong candidate
            who words things differently can score low.
          </p>
          {anonymous && (
            <p className="notice">
              Anonymous screening is on: names, contact details, links and personal details such as age or gender are
              hidden. Untick it when you have made your shortlist.
            </p>
          )}
          {data.keywords === 0 && (
            <p className="hint">No keywords found in the job post. Paste the full description.</p>
          )}
          <div className="table-wrap">
            <table className="ranking">
              <thead>
                <tr>
                  <th scope="col">#</th>
                  <th scope="col">Resume</th>
                  <th scope="col">Match</th>
                  <th scope="col">Missing</th>
                  <th scope="col">Review</th>
                  <th scope="col">
                    <span className="visually-hidden">Details</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.results.map((r, i) => (
                  <ResultRows
                    key={r.index}
                    rank={i + 1}
                    result={r}
                    name={anonymous ? data.submitted[r.index].label : r.name}
                    text={data.submitted[r.index].text}
                    anonymous={anonymous}
                    open={open === r.index}
                    onToggle={() => setOpen(open === r.index ? null : r.index)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}

function ResultRows({ rank, result, name, text, anonymous, open, onToggle }) {
  return (
    <>
      <tr>
        <td>{rank}</td>
        <td className="file-name">{name}</td>
        <td>
          <span className={`pct ${tone(result.score)}`}>{result.score}%</span>
        </td>
        <td>{result.missing.length}</td>
        <td>
          {result.review.passed}/{result.review.total}
        </td>
        <td>
          <button type="button" className="link" aria-expanded={open} onClick={onToggle}>
            {open ? "Hide" : "Details"}
          </button>
        </td>
      </tr>
      {open && (
        <tr className="detail-row">
          <td colSpan={6}>
            <Detail result={result} text={text} anonymous={anonymous} />
          </td>
        </tr>
      )}
    </>
  );
}

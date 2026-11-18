import { useRef, useState } from "react";
import {
  applicationsToCsv,
  exportBackup,
  importBackup,
  sortApplications,
  STATUSES,
  summarize,
} from "./lib/tracker.js";

const LABEL = Object.fromEntries(STATUSES);
const EMPTY = { company: "", role: "", status: "applied", date: "", link: "", resume: "", notes: "" };

function download(filename, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function ApplicationForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState({ ...EMPTY, date: new Date().toISOString().slice(0, 10), ...initial });
  const set = (field) => (e) => setForm({ ...form, [field]: e.target.value });
  return (
    <form
      className="app-form"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(form);
      }}
    >
      <label>
        Company
        <input className="text-input" required maxLength={120} value={form.company} onChange={set("company")} />
      </label>
      <label>
        Role
        <input className="text-input" maxLength={120} value={form.role} onChange={set("role")} />
      </label>
      <label>
        Status
        <select className="text-input" value={form.status} onChange={set("status")}>
          {STATUSES.map(([id, text]) => (
            <option key={id} value={id}>
              {text}
            </option>
          ))}
        </select>
      </label>
      <label>
        Date
        <input className="text-input" type="date" value={form.date} onChange={set("date")} />
      </label>
      <label>
        Job link
        <input className="text-input" type="url" maxLength={500} placeholder="https://" value={form.link} onChange={set("link")} />
      </label>
      <label>
        Resume version
        <input className="text-input" maxLength={120} placeholder="e.g. Frontend v3" value={form.resume} onChange={set("resume")} />
      </label>
      <label className="wide">
        Notes
        <textarea rows={3} maxLength={2000} value={form.notes} onChange={set("notes")} />
      </label>
      <div className="row tight wide">
        <button type="button" className="secondary" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit">Save</button>
      </div>
    </form>
  );
}

/** Where you applied, with which resume, and what happened. Stored only in this browser. */
export default function Tracker({ applications, onAdd, onUpdate, onRemove, onReplace }) {
  const [filter, setFilter] = useState("all");
  const [editing, setEditing] = useState(null); // "new", an id, or null
  const [message, setMessage] = useState("");
  const [removed, setRemoved] = useState(null);
  const restoreInput = useRef(null);
  const summary = summarize(applications);
  const shown = sortApplications(applications, filter);

  async function restore(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const list = importBackup(await file.text());
      onReplace(list);
      setRemoved(null);
      setMessage(`Restored ${list.length} applications from the backup.`);
    } catch (err) {
      setMessage(err.message);
    }
  }

  return (
    <>
      <p className="notice no-print">
        Keep track of every application: where, when, which resume, and what happened. Everything here is saved only in
        this browser. Download a backup to keep a copy or move it to another device.
      </p>

      <section className="card no-print">
        <div className="stats">
          <div>
            <span className="stat-value">{summary.total}</span>
            <span className="stat-label">Total</span>
          </div>
          {STATUSES.map(([id, text]) => (
            <div key={id}>
              <span className={`stat-value status-${id}`}>{summary.counts[id]}</span>
              <span className="stat-label">{text}</span>
            </div>
          ))}
          <div>
            <span className="stat-value">{summary.responseRate === null ? "–" : `${summary.responseRate}%`}</span>
            <span className="stat-label">Got an interview</span>
          </div>
        </div>
      </section>

      <div className="actions no-print">
        <button type="button" onClick={() => setEditing("new")} disabled={editing === "new"}>
          Add application
        </button>
        <label className="inline-select">
          Show
          <select className="text-input" value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="all">All</option>
            {STATUSES.map(([id, text]) => (
              <option key={id} value={id}>
                {text}
              </option>
            ))}
          </select>
        </label>
        <span className="spacer" />
        <button
          type="button"
          className="small secondary"
          disabled={!applications.length}
          onClick={() => download("applications.csv", applicationsToCsv(sortApplications(applications)), "text/csv;charset=utf-8")}
        >
          Export CSV
        </button>
        <button
          type="button"
          className="small secondary"
          disabled={!applications.length}
          onClick={() => download("applications-backup.json", exportBackup(applications), "application/json")}
        >
          Download backup
        </button>
        <input ref={restoreInput} type="file" accept=".json,application/json" className="visually-hidden" tabIndex={-1} aria-hidden="true" onChange={restore} />
        <button type="button" className="small secondary" onClick={() => restoreInput.current?.click()}>
          Restore backup
        </button>
      </div>
      {message && (
        <p className="notice no-print" role="status">
          {message}
          {removed && (
            <>
              {" "}
              <button
                type="button"
                className="link small"
                onClick={() => {
                  onAdd(removed);
                  setRemoved(null);
                  setMessage("Restored.");
                }}
              >
                Undo
              </button>
            </>
          )}
        </p>
      )}

      {editing === "new" && (
        <section className="card no-print">
          <h2>New application</h2>
          <ApplicationForm
            initial={{}}
            onCancel={() => setEditing(null)}
            onSave={(form) => {
              onAdd(form);
              setEditing(null);
              setRemoved(null);
              setMessage(`Added ${form.company}.`);
            }}
          />
        </section>
      )}

      {applications.length === 0 && editing !== "new" && (
        <p className="hint">
          No applications yet. Add one here, or use "Save to tracker" after checking a job in the other tabs.
        </p>
      )}

      <ul className="applications no-print">
        {shown.map((app) => (
          <li key={app.id} className="card">
            {editing === app.id ? (
              <ApplicationForm
                initial={app}
                onCancel={() => setEditing(null)}
                onSave={(form) => {
                  onUpdate(app.id, form);
                  setEditing(null);
                }}
              />
            ) : (
              <>
                <div className="row">
                  <div>
                    <strong>{app.company || app.role || "Untitled application"}</strong>
                    {app.company && app.role && <span> · {app.role}</span>}
                    {!app.company && (
                      <span className="hint"> · add the company with Edit</span>
                    )}
                    <div className="hint">
                      {app.date}
                      {app.score !== null && ` · match ${app.score}%`}
                      {app.resume && ` · resume: ${app.resume}`}
                    </div>
                  </div>
                  <div className="row tight">
                    <select
                      className={`text-input status-select status-${app.status}`}
                      aria-label={`Status for ${app.company || "application"}`}
                      value={app.status}
                      onChange={(e) => onUpdate(app.id, { status: e.target.value })}
                    >
                      {STATUSES.map(([id, text]) => (
                        <option key={id} value={id}>
                          {text}
                        </option>
                      ))}
                    </select>
                    <button type="button" className="small secondary" onClick={() => setEditing(app.id)}>
                      Edit
                    </button>
                    <button
                      type="button"
                      className="small link"
                      onClick={() => {
                        onRemove(app.id);
                        setRemoved(app);
                        setMessage(`Removed ${app.company || "the application"}.`);
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
                {app.link && (
                  <a href={app.link} target="_blank" rel="noopener noreferrer" className="small-link">
                    Job post
                  </a>
                )}
                {app.notes && <p className="app-notes">{app.notes}</p>}
              </>
            )}
          </li>
        ))}
      </ul>
      {filter !== "all" && shown.length === 0 && applications.length > 0 && (
        <p className="hint">No applications with the status "{LABEL[filter]}".</p>
      )}
    </>
  );
}

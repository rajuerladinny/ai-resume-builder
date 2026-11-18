# Project Overview: AI Resume Builder

A short map of the codebase. For features, setup and configuration, see [README.md](README.md).

## What it is

A web app that helps job seekers fit a resume to a specific job post, and helps recruiters see which resumes match a job best. The rule-based features work without any AI; an OpenAI-compatible model can be connected for rewriting and cover letters. Nothing is stored on the server.

## Tech stack

| Layer | Technology |
|---|---|
| Page | React 19, Vite 8, plain CSS with light and dark themes |
| Word export | [`docx`](https://www.npmjs.com/package/docx), loaded only when someone downloads |
| In-browser PDF reading (demo) | [`pdfjs-dist`](https://www.npmjs.com/package/pdfjs-dist), loaded only when needed |
| API | Python 3.12, FastAPI, Uvicorn |
| Upload parsing | `pypdf` for PDF; the standard library for .docx and text |
| AI (optional) | Any OpenAI-compatible chat completions API, called with the standard library |
| Storage | None on the server. Opt-in `localStorage` in the visitor's browser |
| Tests and CI | pytest, `node --test`, ruff, GitHub Actions, Dependabot |
| Deployment | One Docker image; Render blueprint; GitHub Pages for the demo |

## Directory layout

```
ai-resume-builder/
├── backend/                 FastAPI app (no database)
│   ├── app/
│   └── tests/
├── frontend/                React app and the in-browser demo
│   ├── src/
│   └── tests/
├── fixtures/parity.json     Shared results both implementations must reproduce
├── docs/                    Deployment guide and screenshots
├── .github/                 CI, demo deploy, Dependabot, issue and PR templates
├── Dockerfile               Builds the page, then serves it with the API
└── render.yaml              One-click deploy on Render
```

## Backend modules (`backend/app/`)

| Module | Responsibility |
|---|---|
| `main.py` | Routes, startup checks of settings, rate limits, security headers, serves the built page |
| `keywords.py` | Keyword extraction, aliases (`reactjs` → `react`) and the match score. No AI |
| `checks.py` | The seven-check resume review. No AI |
| `extract.py` | Reads uploaded PDF, .docx and text in memory |
| `tailor.py` | Rewrite flow: score, rewrite, rescore, flag added keywords, fall back safely |
| `cover_letter.py` | AI cover letter with safeguards, and the template letter |
| `llm.py` | OpenAI-compatible client, prompts and settings checks |
| `ratelimit.py` | In-memory sliding-window limiter per visitor |
| `export_shared.py` | Writes `frontend/src/lib/vocab.js` and `fixtures/parity.json` |

## Frontend (`frontend/src/`)

| File | Responsibility |
|---|---|
| `App.jsx` | Page layout, theme, the Tailor flow, the Next steps toolkit, export and print |
| `Compare.jsx` | Compare up to 20 resumes against one job post |
| `api.js` | Calls the API, or the in-browser demo when built with `VITE_DEMO_MODE` or opened with `?demo` |
| `lib/keywords.js`, `lib/checks.js`, `lib/extract.js`, `lib/coverLetter.js` | JavaScript ports of the backend, for the demo |
| `lib/vocab.js` | Skill, alias and stopword lists generated from the backend. Do not edit |
| `lib/demo.js` | The in-browser stand-in for the API |
| `lib/bullets.js` | Bullet coach |
| `lib/interview.js` | Interview questions |
| `lib/format.js` | Splits a resume or letter into blocks; builds the Word file |
| `lib/storage.js` | Opt-in, failure-safe browser storage |
| `lib/diff.js`, `lib/rank.js`, `lib/sample.js` | Changes view, CSV export, the sample resume |

## Tests

| Suite | Covers |
|---|---|
| `backend/tests/test_core.py` | Keywords, scoring and the tailoring safeguards |
| `backend/tests/test_checks_extract.py` | Resume review and file reading |
| `backend/tests/test_cover_letter.py` | Template letter, AI safeguards, settings checks |
| `backend/tests/test_api.py` | Every route, limits, headers and health |
| `backend/tests/test_shared.py` | Generated files are up to date |
| `frontend/tests/parity.test.js` | The JavaScript ports match the backend exactly |
| `frontend/tests/features.test.js` | Bullet coach, interview prep, layouts, Word export round trip, storage |
| `frontend/tests/lib.test.js` | Diff, ranking, CSV and the demo API |

## Keeping the two implementations in step

The demo and the server must give identical scores, reviews and template letters. The Python code is the source of truth. `python -m app.export_shared` records its results on fixed inputs in `fixtures/parity.json`, and `frontend/tests/parity.test.js` fails if the JavaScript gives anything different. `backend/tests/test_shared.py` fails if the recorded results are out of date.

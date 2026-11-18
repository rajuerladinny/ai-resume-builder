# Changelog

## 1.0.0

### Added
- **Cover letters**: AI-written from the resume's facts when a model is connected, with any job keyword the resume lacks flagged; otherwise a template letter built from the resume's own best-matching bullet points. Works in the demo too.
- **Bullet coach**: advice on each weak bullet point, with stronger verbs to start with.
- **Interview prep**: likely questions from the skills shown, the gaps and themes in the job post, each with an answering tip.
- **Word (.docx) download** and a cleaner single-column PDF layout for the tailored resume and the cover letter.
- **Remember on this device** (opt-in), **light and dark themes**, a refreshed layout with score rings, and a badge showing whether an AI model is connected.
- `POST /api/cover-letter`; `GET /api/health` now reports the version and AI mode.
- Render blueprint, deployment guide, project overview, contributing and security guides, issue and pull request templates, Apache 2.0 license.

### Changed
- Upgraded to React 19 and Vite 8, and to current GitHub Actions.
- Settings are checked at startup; a wrong value stops the server with a clear message instead of failing on a visitor's request.
- AI failures are logged by error type (never resume text).
- CORS allows only the methods and headers the page uses.
- CI lints the backend with ruff and checks the container serves a cover letter.

## Before 1.0 (unversioned)
- Compare up to 20 resumes against one job post, with CSV export.
- Resume upload (PDF, Word, text), rule-based review, changes view, in-browser demo, CI and Docker hardening.
- Match score, missing keywords and AI tailoring with safeguards.

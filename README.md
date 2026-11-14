# AI Resume Builder

Paste a resume and a job post; get a match score, missing keywords and a
resume tailored to that job, with one-click PDF export.

See [PLAN.md](PLAN.md) for the product plan, pricing and roadmap.

## Project layout

```
backend/   Python + FastAPI (no database)
  app/keywords.py    keyword extraction and match score (no AI)
  app/tailor.py      tailoring flow, invented-keyword check, safe fallbacks
  app/llm.py         OpenAI-compatible LLM client and the rewrite prompt
  app/ratelimit.py   per-visitor hourly limits
  app/main.py        HTTP routes
  tests/             pytest tests for the core logic
frontend/  React + Vite
  src/App.jsx        the single page
```

## Run the backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload        # http://localhost:8000
```

It starts in mock mode, which needs no LLM: the match score and keyword
analysis work in full, and the resume comes back unchanged. To get real
rewriting, set the variables shown in `backend/.env.example` (export them in
your shell; the app does not load `.env` files by itself).

## Run the frontend

```bash
cd frontend
npm install
npm run dev                          # http://localhost:5173
```

## Tests

```bash
cd backend && python -m pytest -q
```

## Deploy

```bash
docker build -t ai-resume-builder .
docker run -p 8000:8000 -e LLM_PROVIDER=mock ai-resume-builder
```

Serve it over HTTPS. Behind a reverse proxy, set `TRUST_PROXY=1` so the
hourly limits apply per visitor instead of to the proxy.

## Privacy

The app keeps nothing: resumes and job posts are handled in memory for one
request. With a real LLM connected, the text is sent to that provider, so
name the provider in your privacy policy before launching.

## Known gaps

- Only the core Python logic is covered by tests. The HTTP routes, the React
  app and the Docker build have not been run end to end yet.
- The rewrite prompt has not been tried against a real model yet; expect to
  tune it.
- The skill list in `keywords.py` covers software roles only.
- Paste-only input; no PDF or DOCX upload.
- Limits are per IP address and held in memory, so they reset on restart.

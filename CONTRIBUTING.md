# Contributing to AI Resume Builder

Thanks for helping improve this project. Contributions of every size are welcome, from typo fixes to new features.

## Ground rules

- **Never use a real person's resume** in issues, tests, fixtures or screenshots. Make one up, or use the built-in sample.
- Open an issue before starting a large change, so we can agree on the approach first.
- Keep pull requests small and focused on one thing.
- Report security problems privately, as described in [SECURITY.md](SECURITY.md), not in a public issue.

## Set up

Requires Python 3.12+ and Node.js 20.19+.

```bash
git clone https://github.com/rajuerladinny/ai-resume-builder.git
cd ai-resume-builder

cd backend
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements-dev.txt
uvicorn app.main:app --reload

# in a second terminal
cd frontend
npm install
npm run dev
```

## Before you open a pull request

```bash
cd backend && ruff check . && python -m pytest -q
cd frontend && npm test && npm run build && npm run build:demo
```

- Add or update tests for any behaviour you change.
- If you changed `keywords.py`, `checks.py`, `tailor.py` or `cover_letter.py`, run `python -m app.export_shared` in `backend/` and commit the regenerated `fixtures/parity.json` and `frontend/src/lib/vocab.js`. Then make the matching change in the JavaScript port under `frontend/src/lib/` until `npm test` passes.
- Update the README if you add a setting, a route or a visible feature.

## Good first contributions

- Add skills and aliases for a field you know to `SKILLS` and `ALIASES` in `backend/app/keywords.py`.
- Improve the wording of a review check, a bullet coach tip or an interview question.
- Try the AI rewrite with a model you use and share prompt improvements, with made-up resumes.

## Pull requests

Describe what changed, why, and how you tested it. CI must pass before review. By contributing, you agree that your contribution is licensed under the project's [Apache License 2.0](LICENSE).

"""FastAPI routes. Run with: uvicorn app.main:app --reload

Nothing is stored: resumes and job posts are processed in memory and
discarded when the request ends. Interactive API docs are served at /docs.
"""
import os
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from . import __version__, ats, checks, cover_letter, extract, keywords, llm
from . import tailor as tailoring
from .ratelimit import RateLimiter


def _limit(name: str, default: int) -> int:
    """A per-visitor hourly limit from the environment, checked at startup."""
    raw = os.environ.get(name, str(default))
    try:
        value = int(raw)
    except ValueError:
        raise RuntimeError(f"{name} must be a whole number, not {raw!r}.") from None
    if value < 1:
        raise RuntimeError(f"{name} must be at least 1.")
    return value


# Fail at startup, not on a visitor's first request, when settings are wrong.
_config_errors = llm.config_errors()
if _config_errors:
    raise RuntimeError("Invalid configuration: " + " ".join(_config_errors))

app = FastAPI(
    title="AI Resume Builder",
    version=__version__,
    description="Match score, resume review, tailoring and cover letters. Nothing is stored.",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in os.environ.get("CORS_ORIGINS", "http://localhost:5173").split(",") if o.strip()],
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)

# Per visitor (IP address), per hour. Analysis is free to run; tailoring and
# cover letters cost LLM money.
analyze_limiter = RateLimiter(_limit("ANALYZE_LIMIT", 60), 3600)
tailor_limiter = RateLimiter(_limit("TAILOR_LIMIT", 10), 3600)
extract_limiter = RateLimiter(_limit("EXTRACT_LIMIT", 120), 3600)
MAX_COMPARE = 20
MAX_JOBS = 10


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "no-referrer")
    if request.url.path.startswith("/api/"):
        # Responses contain the visitor's resume; never cache them.
        response.headers.setdefault("Cache-Control", "no-store")
    return response


class ResumeJobIn(BaseModel):
    resume: str = Field(min_length=100, max_length=20_000)
    job: str = Field(min_length=100, max_length=10_000)


class ResumeItem(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    text: str = Field(min_length=1, max_length=20_000)


class RankIn(BaseModel):
    job: str = Field(min_length=100, max_length=10_000)
    resumes: list[ResumeItem] = Field(min_length=1, max_length=MAX_COMPARE)


class JobItem(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    text: str = Field(min_length=50, max_length=10_000)


class RankJobsIn(BaseModel):
    resume: str = Field(min_length=100, max_length=20_000)
    jobs: list[JobItem] = Field(min_length=1, max_length=MAX_JOBS)


def client_ip(request: Request) -> str:
    """Visitor address. Behind a reverse proxy, set TRUST_PROXY=1 so the
    address the proxy forwards is used instead of the proxy's own."""
    if os.environ.get("TRUST_PROXY") == "1":
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


@app.post("/api/analyze")
def post_analyze(body: ResumeJobIn, request: Request):
    if not analyze_limiter.allow(client_ip(request)):
        raise HTTPException(429, "Too many requests. Please try again later.")
    return {**keywords.analyze(body.resume, body.job), "review": checks.review(body.resume)}


@app.post("/api/tailor")
def post_tailor(body: ResumeJobIn, request: Request):
    if not tailor_limiter.allow(client_ip(request)):
        raise HTTPException(
            429, "You have reached the hourly limit. Please try again later."
        )
    result = tailoring.tailor(body.resume, body.job)
    result["review"] = checks.review(result["tailored"])
    return result


@app.post("/api/cover-letter")
def post_cover_letter(body: ResumeJobIn, request: Request):
    """A cover letter for this job, from the resume's facts only."""
    if not tailor_limiter.allow(client_ip(request)):
        raise HTTPException(
            429, "You have reached the hourly limit. Please try again later."
        )
    return cover_letter.cover_letter(body.resume, body.job)


@app.post("/api/rank")
def post_rank(body: RankIn, request: Request):
    """Score up to 20 resumes against one job post, best match first."""
    if not analyze_limiter.allow(client_ip(request)):
        raise HTTPException(429, "Too many requests. Please try again later.")
    ranked = keywords.rank_resumes(body.job, [r.model_dump() for r in body.resumes])
    return {
        "keywords": len(keywords.extract_keywords(body.job)),
        "results": [
            {**r, "review": checks.review(body.resumes[r["index"]].text)} for r in ranked
        ],
    }


@app.post("/api/rank-jobs")
def post_rank_jobs(body: RankJobsIn, request: Request):
    """Score one resume against up to 10 job posts, best fit first."""
    if not analyze_limiter.allow(client_ip(request)):
        raise HTTPException(429, "Too many requests. Please try again later.")
    return {"results": keywords.rank_jobs(body.resume, [j.model_dump() for j in body.jobs])}


@app.post("/api/extract")
async def post_extract(request: Request):
    """Read an uploaded resume (PDF, .docx or text) sent as the raw request body.

    Also returns an ATS readability check of the file's layout."""
    if not extract_limiter.allow(client_ip(request)):
        raise HTTPException(429, "Too many uploads. Please try again later.")
    data = bytearray()
    async for chunk in request.stream():
        data.extend(chunk)
        if len(data) > extract.MAX_BYTES:
            raise HTTPException(413, "The file is larger than 5 MB.")
    try:
        # Parsing is CPU work; keep it off the event loop.
        text, facts = await run_in_threadpool(extract.extract_file, bytes(data))
    except extract.ExtractError as error:
        raise HTTPException(422, str(error)) from None
    return {"text": text, "characters": len(text), "ats": ats.ats_check(text, facts)}


@app.get("/api/health")
def health():
    """Liveness check. "ai" says whether a model is connected ("ai") or not ("mock")."""
    return {"ok": True, "version": __version__, "ai": llm.mode()}


# Serve the built React app when it exists (single-container deployment).
# Registered last so it never shadows the /api routes above.
_static = Path(os.environ.get("STATIC_DIR", Path(__file__).parents[2] / "frontend" / "dist"))
if _static.is_dir():
    app.mount("/", StaticFiles(directory=_static, html=True), name="frontend")

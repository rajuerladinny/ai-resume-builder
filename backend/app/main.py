"""FastAPI routes. Run with: uvicorn app.main:app --reload

Nothing is stored: resumes and job posts are processed in memory and
discarded when the request ends.
"""
import os
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from . import keywords, tailor as tailoring
from .ratelimit import RateLimiter

app = FastAPI(title="AI Resume Builder")
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.environ.get("CORS_ORIGINS", "http://localhost:5173").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Per visitor (IP address). Analysis is free to run; tailoring costs LLM money.
analyze_limiter = RateLimiter(int(os.environ.get("ANALYZE_LIMIT", "60")), 3600)
tailor_limiter = RateLimiter(int(os.environ.get("TAILOR_LIMIT", "10")), 3600)


class ResumeJobIn(BaseModel):
    resume: str = Field(min_length=100, max_length=20_000)
    job: str = Field(min_length=100, max_length=10_000)


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
    return keywords.analyze(body.resume, body.job)


@app.post("/api/tailor")
def post_tailor(body: ResumeJobIn, request: Request):
    if not tailor_limiter.allow(client_ip(request)):
        raise HTTPException(
            429, "You have reached the hourly limit. Please try again later."
        )
    return tailoring.tailor(body.resume, body.job)


@app.get("/api/health")
def health():
    return {"ok": True}


# Serve the built React app when it exists (single-container deployment).
# Registered last so it never shadows the /api routes above.
_static = Path(os.environ.get("STATIC_DIR", Path(__file__).parents[2] / "frontend" / "dist"))
if _static.is_dir():
    app.mount("/", StaticFiles(directory=_static, html=True), name="frontend")

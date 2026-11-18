"""Tailoring flow: analyse, rewrite, analyse again, flag anything invented."""
from collections.abc import Callable

from . import llm
from .keywords import analyze, normalize


def invented_terms(original: str, tailored: str, job: str) -> list[str]:
    """Job keywords that appear in the tailored resume but not the original.

    These are the claims most likely to be made up by the model, so the user
    is asked to check each one before sending the resume anywhere.
    """
    before = analyze(original, job)
    after = analyze(tailored, job)
    return [t for t in after["matched"] if t in before["missing"]]


def suggestions(missing: list[str], limit: int = 8) -> list[str]:
    return [
        f'The job asks for "{term}". If you have used it, add where and how.'
        for term in missing[:limit]
    ]


def tailor(
    resume: str,
    job: str,
    rewrite: Callable[[str, str, list[str]], str] | None = None,
) -> dict:
    mock = rewrite is None and llm.is_mock()
    rewrite = rewrite or llm.rewrite
    before = analyze(resume, job)
    try:
        tailored = rewrite(resume, job, before["missing"]) or resume.strip()
        failed = False
    except Exception:
        tailored, failed = resume.strip(), True
    # A reply far shorter than the original means the model dropped content.
    if len(normalize(tailored)) < 0.5 * len(normalize(resume)):
        tailored, failed = resume.strip(), True

    after = analyze(tailored, job)
    return {
        "tailored": tailored,
        "before": before,
        "after": after,
        "check": invented_terms(resume, tailored, job),
        "suggestions": suggestions(after["missing"]),
        "rewritten": not (mock or failed),
        "notice": (
            "No AI model is connected, so the resume is unchanged. "
            "The analysis below still applies."
            if mock
            else "The AI rewrite failed, so the resume is unchanged. Try again."
            if failed
            else ""
        ),
    }

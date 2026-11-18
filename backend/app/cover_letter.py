"""Cover letters: an AI-written letter when a model is connected, otherwise a
template letter built only from the resume and the job post. No invented facts
either way: the template copies the resume's own bullet points, and the AI is
told to use only facts from the resume and is checked for added keywords.

frontend/src/lib/coverLetter.js is a JavaScript port of the template, used by
the in-browser demo. fixtures/parity.json holds the two together.
"""

import logging
import re
from collections.abc import Callable

from . import llm
from .checks import WEAK_PHRASES
from .keywords import analyze, extract_keywords
from .tailor import invented_terms

_LINE_BREAK = re.compile(r"\r\n|\n|\r")
_BULLET_MARK = re.compile(r"^[ \t]*(?:[-*•–▪●]|\d+[.)])[ \t]+")
_NAME_WORD = re.compile(r"^[A-Za-z][A-Za-z.'\-]*$")
_TITLE_PREFIX = re.compile(r"^(?:job title|title|role|position)[ \t]*:[ \t]*", re.I)
_DIGIT = re.compile(r"[0-9]")
_LETTERS = re.compile(r"[A-Za-z]+")
MAX_HIGHLIGHTS = 3
MAX_SKILLS = 4

AI_NOTICE = "Written by AI from your resume. Read it carefully and edit it before sending."
TEMPLATE_NOTICE = (
    "No AI model is connected, so this letter was built from a template using your "
    "resume's own bullet points. Edit it before sending."
)
FAILED_NOTICE = "The AI letter failed, so this one was built from a template. Edit it before sending."

logger = logging.getLogger(__name__)


def _lines(text: str) -> list[str]:
    return [line.strip() for line in _LINE_BREAK.split(text) if line.strip()]


def candidate_name(resume: str) -> str:
    """The resume's first line when it looks like a person's name, else ""."""
    lines = _lines(resume)
    if not lines:
        return ""
    words = lines[0].split()
    if not (2 <= len(words) <= 5 and len(lines[0]) <= 60 and all(_NAME_WORD.match(w) for w in words)):
        return ""
    name = " ".join(words)
    if name.isupper():  # "RAVI KUMAR" -> "Ravi Kumar"
        name = _LETTERS.sub(lambda m: m.group(0)[0] + m.group(0)[1:].lower(), name)
    return name


def role_title(job: str) -> str:
    """The job post's first line when it reads like a job title, else ""."""
    lines = _lines(job)
    if not lines:
        return ""
    title = _TITLE_PREFIX.sub("", lines[0]).strip()
    if title and len(title.split()) <= 8 and len(title) <= 80 and not title.endswith((".", "!", "?")):
        return title
    return ""


def display_term(term: str, job: str) -> str:
    """A keyword as the job post spells it ("React.js" rather than "react")."""
    lowered = job.lower()
    index = lowered.find(term)
    if index == -1 or len(lowered) != len(job):
        return term
    return job[index : index + len(term)]


def join_words(items: list[str]) -> str:
    if len(items) <= 1:
        return "".join(items)
    return ", ".join(items[:-1]) + " and " + items[-1]


def highlights(resume: str, job: str, limit: int = MAX_HIGHLIGHTS) -> list[str]:
    """The resume bullet points that best match the job, best first."""
    scored = []
    for position, line in enumerate(_lines(resume)):
        if not _BULLET_MARK.match(line):
            continue
        text = _BULLET_MARK.sub("", line).strip().rstrip(".")
        lowered = text.lower()
        if len(text.split()) < 4 or any(phrase in lowered for phrase in WEAK_PHRASES):
            continue  # a weak bullet reads badly in a letter
        hits = len(analyze(text, job)["matched"])
        score = hits + (1 if _DIGIT.search(text) else 0)
        if hits:
            scored.append((-score, position, text))
    scored.sort()
    return [text for _, _, text in scored[:limit]]


def template_letter(resume: str, job: str) -> str:
    name = candidate_name(resume)
    title = role_title(job)
    matched = set(analyze(resume, job)["matched"])
    lowered = job.lower()
    found = [k["term"] for k in extract_keywords(job) if k["kind"] == "skill" and k["term"] in matched]
    # In the order the job post mentions them; terms found only through an alias go last.
    found.sort(key=lambda term: lowered.find(term) if term in lowered else len(lowered))
    skills = [display_term(term, job) for term in found[:MAX_SKILLS]]
    points = highlights(resume, job)

    opening = f"I am writing to apply for the {title} role." if title else "I am writing to apply for this role."
    if skills:
        opening += f" My experience with {join_words(skills)} matches what you are looking for."
    parts = ["Dear Hiring Manager,", "", opening, ""]
    if points:
        parts += ["A few highlights from my recent work:", *[f"- {p}" for p in points], ""]
    parts += [
        "I would welcome the chance to talk about how I can help your team. "
        "Thank you for your time and consideration.",
        "",
        "Sincerely,",
        name or "[Your name]",
    ]
    return "\n".join(parts)


def cover_letter(
    resume: str,
    job: str,
    write: Callable[[str, str], str] | None = None,
) -> dict:
    """Returns {"letter", "ai", "notice", "check"}.

    "check" lists job keywords the AI letter claims that the resume lacks.
    """
    if write is None and llm.is_mock():
        return {"letter": template_letter(resume, job), "ai": False, "notice": TEMPLATE_NOTICE, "check": []}
    write = write or llm.write_cover_letter
    try:
        letter = (write(resume, job) or "").strip()
    except Exception as error:
        logger.warning("LLM request failed: %s", type(error).__name__)
        letter = ""
    if len(letter.split()) < 60:  # empty, failed or cut short
        return {"letter": template_letter(resume, job), "ai": False, "notice": FAILED_NOTICE, "check": []}
    return {
        "letter": letter,
        "ai": True,
        "notice": AI_NOTICE,
        "check": invented_terms(resume, letter, job),
    }

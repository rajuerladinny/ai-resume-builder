"""Rule-based resume review. Standard library only, no AI.

Each check is one thing a recruiter or an applicant tracking system looks
for. The results are instant and repeatable, like the match score.

frontend/src/lib/checks.js is a JavaScript port used by the in-browser demo.
The patterns here are ASCII-only with explicit spaces, so both give the same result;
tests/test_shared.py and the frontend tests hold the two together.
"""
import re

_EMAIL = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+", re.A)
_PHONE = re.compile(r"(?:\+?\d[ \t\-()]*){10,15}", re.A)
_BULLET = re.compile(r"^[ \t]*(?:[-*•–▪●]|\d+[.)])[ \t]+[^ \t]", re.A)
_SECTIONS = {
    "experience": re.compile(
        r"^\W*(?:work |professional )?(?:experience|employment)\b", re.I | re.A
    ),
    "education": re.compile(r"^\W*(?:education|qualifications?)\b", re.I | re.A),
    "skills": re.compile(r"^\W*(?:technical |key |core )?skills\b", re.I | re.A),
}
_WORD = re.compile(r"[^ \t\n\r\f\v]+")
_LINE_BREAK = re.compile(r"\r\n|\n|\r")
_WEAK = [
    "responsible for",
    "worked on",
    "helped with",
    "duties included",
    "in charge of",
    "involved in",
]
_PRONOUN = re.compile(r"\b(?:I|my|me|myself)\b", re.A)
MIN_WORDS, MAX_WORDS = 250, 900


def review(resume: str) -> dict:
    """Returns {"checks": [{"id", "ok", "title", "detail"}], "passed", "total", "words"}."""
    lines = _LINE_BREAK.split(resume)
    words = len(_WORD.findall(resume))
    bullets = [line for line in lines if _BULLET.match(line)]
    with_numbers = [b for b in bullets if re.search(r"[0-9]", _BULLET.sub("", b, count=1))]
    missing_sections = [
        name
        for name, pattern in _SECTIONS.items()
        if not any(pattern.match(line) and len(_WORD.findall(line)) <= 4 for line in lines)
    ]
    lowered = resume.lower()
    weak = [phrase for phrase in _WEAK if phrase in lowered]
    has_email = bool(_EMAIL.search(resume))
    has_phone = bool(_PHONE.search(resume))

    def check(check_id: str, ok: bool, title: str, detail: str) -> dict:
        return {"id": check_id, "ok": ok, "title": title, "detail": detail}

    checks = [
        check(
            "contact",
            has_email and has_phone,
            "Contact details",
            "Email and phone number found."
            if has_email and has_phone
            else "Add "
            + " and ".join(
                name for name, found in (("an email address", has_email), ("a phone number", has_phone)) if not found
            )
            + " at the top.",
        ),
        check(
            "sections",
            not missing_sections,
            "Standard section headings",
            "Experience, Education and Skills headings found."
            if not missing_sections
            else "Add a heading on its own line for: " + ", ".join(missing_sections) + ".",
        ),
        check(
            "bullets",
            len(bullets) >= 5,
            "Bullet points",
            f"{len(bullets)} bullet points found."
            if len(bullets) >= 5
            else f"Only {len(bullets)} bullet points found. Describe each role in 3 to 6 bullets.",
        ),
        check(
            "numbers",
            len(with_numbers) >= 3,
            "Results with numbers",
            f"{len(with_numbers)} bullet points include a number."
            if len(with_numbers) >= 3
            else f"{len(with_numbers)} bullet points include a number. Add figures such as users, "
            "percentages or time saved, where you have them.",
        ),
        check(
            "length",
            MIN_WORDS <= words <= MAX_WORDS,
            "Length",
            f"{words} words, about right for one to two pages."
            if MIN_WORDS <= words <= MAX_WORDS
            else f"{words} words is short; aim for at least {MIN_WORDS}."
            if words < MIN_WORDS
            else f"{words} words is long; aim for under {MAX_WORDS}.",
        ),
        check(
            "wording",
            not weak,
            "Strong wording",
            "No weak phrases found."
            if not weak
            else "Replace with an action verb: " + ", ".join(f'"{w}"' for w in weak) + ".",
        ),
        check(
            "pronouns",
            not _PRONOUN.search(resume),
            "No first-person pronouns",
            "None found."
            if not _PRONOUN.search(resume)
            else 'Drop "I", "my" and "me"; start bullets with the verb.',
        ),
    ]
    return {
        "checks": checks,
        "passed": sum(1 for c in checks if c["ok"]),
        "total": len(checks),
        "words": words,
    }

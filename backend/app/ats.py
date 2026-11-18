"""ATS readability check: will an applicant tracking system read this file
correctly? Rule-based, no AI. Works on the text pulled from an upload plus
facts about the file's layout (see extract.extract_file).

frontend/src/lib/ats.js is a JavaScript port used by the in-browser demo;
fixtures/parity.json holds the two together for Word and text files. (PDF
text comes from different readers in the two, so PDF results can differ.)
"""

import re

from .checks import _EMAIL, _PHONE, _WORD

_LINE_BREAK = re.compile(r"\r\n|\n|\r")
_GARBLED = re.compile("[�-]|\\(cid:[0-9]+\\)")
MIN_CHARS_PER_PAGE = 300
MAX_PAGES = 2
MIN_LINES_FOR_LAYOUT = 15
MAX_SHORT_LINE_PERCENT = 50


def _check(check_id: str, ok: bool, title: str, detail: str) -> dict:
    return {"id": check_id, "ok": ok, "title": title, "detail": detail}


def _plural(n: int, word: str) -> str:
    return f"{n} {word}" if n == 1 else f"{n} {word}s"


def ats_check(text: str, facts: dict) -> dict:
    """Returns {"checks": [{"id", "ok", "title", "detail"}], "passed", "total"}."""
    kind = facts["type"]
    pages = facts.get("pages") or 0
    lines = [line for line in _LINE_BREAK.split(text) if line.strip()]
    checks = []

    if kind == "text":
        checks.append(
            _check(
                "file",
                False,
                "File type",
                "Plain text is fine for checking here, but send employers a PDF or Word file.",
            )
        )
    else:
        checks.append(_check("file", True, "File type", f"{'PDF' if kind == 'pdf' else 'Word'} files are accepted by most systems."))

    if kind == "pdf" and pages:
        per_page = len(text) // pages
        ok = per_page >= MIN_CHARS_PER_PAGE
        checks.append(
            _check(
                "text",
                ok,
                "Selectable text",
                f"About {per_page} characters of text per page."
                if ok
                else f"Only about {per_page} characters of text per page. Parts may be images or "
                "scanned, which systems cannot read. Export the PDF from your word processor.",
            )
        )
        ok = pages <= MAX_PAGES
        checks.append(
            _check(
                "pages",
                ok,
                "Length",
                f"{_plural(pages, 'page')}."
                if ok
                else f"{pages} pages. Most recruiters expect one or two.",
            )
        )

    garbled = len(_GARBLED.findall(text))
    checks.append(
        _check(
            "characters",
            not garbled,
            "Characters come through cleanly",
            "No broken or unreadable characters."
            if not garbled
            else f"{_plural(garbled, 'character')} could not be read. Icon fonts, symbols and fancy "
            "bullets often cause this; use plain text and simple bullets.",
        )
    )

    has_email = bool(_EMAIL.search(text))
    has_phone = bool(_PHONE.search(text))
    header = facts.get("header_text") or ""
    in_header = bool(_EMAIL.search(header) or _PHONE.search(header))
    if has_email and has_phone:
        detail = "Email and phone number are in the main text."
    elif in_header:
        detail = "Your contact details are in the page header or footer, which some systems skip. Move them into the main text."
    else:
        detail = "No " + (
            "email or phone number" if not (has_email or has_phone) else "email" if not has_email else "phone number"
        ) + " found in the text. If they are in an image or icon, type them out."
    checks.append(_check("contact", has_email and has_phone, "Contact details readable", detail))

    if kind == "docx":
        tables, boxes, images = facts["tables"], facts["text_boxes"], facts["images"]
        checks.append(
            _check(
                "tables",
                not tables,
                "No tables",
                "No tables found."
                if not tables
                else f"{_plural(tables, 'table')} found. Some systems read tables out of order; "
                "use plain lines instead.",
            )
        )
        checks.append(
            _check(
                "text_boxes",
                not boxes,
                "No text boxes",
                "No text boxes found."
                if not boxes
                else f"{boxes} text {'box' if boxes == 1 else 'boxes'} found. Text boxes are often "
                "skipped; move that text into the page.",
            )
        )
        checks.append(
            _check(
                "images",
                not images,
                "No images or graphics",
                "No images found."
                if not images
                else f"{_plural(images, 'image')} or graphics found. Systems cannot read text in images, "
                "skill bars or icons; make sure nothing important is only shown that way.",
            )
        )

    if len(lines) >= MIN_LINES_FOR_LAYOUT:
        short = sum(1 for line in lines if len(_WORD.findall(line)) <= 2)
        percent = short * 100 // len(lines)
        ok = percent <= MAX_SHORT_LINE_PERCENT
        checks.append(
            _check(
                "layout",
                ok,
                "Single-column layout",
                "The text reads in a sensible order."
                if ok
                else f"{percent}% of lines are only one or two words, a sign of columns or "
                "tables. Systems may read the text in the wrong order; a single column is safest.",
            )
        )

    return {
        "checks": checks,
        "passed": sum(1 for c in checks if c["ok"]),
        "total": len(checks),
    }

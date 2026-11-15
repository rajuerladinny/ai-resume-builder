"""Turn an uploaded resume file into plain text. Nothing is written to disk.

Supported: PDF (needs the `pypdf` package), Word .docx and plain text. The
type is decided from the file's first bytes, never from its name.
"""
import html
import io
import re
import zipfile

MAX_BYTES = 5 * 1024 * 1024
MAX_PDF_PAGES = 15
MAX_DOCX_XML_BYTES = 20 * 1024 * 1024
MAX_CHARS = 60_000


class ExtractError(ValueError):
    """The file cannot be read; the message is safe to show to the visitor."""


def _tidy(text: str) -> str:
    text = text.replace("\x00", "").replace("\r\n", "\n").replace("\r", "\n")
    text = "\n".join(line.rstrip() for line in text.split("\n"))
    return re.sub(r"\n{3,}", "\n\n", text).strip()[:MAX_CHARS]


def _pdf(data: bytes) -> str:
    try:
        from pypdf import PdfReader
    except ImportError:  # pragma: no cover - depends on the installation
        raise ExtractError("PDF upload is not available here. Paste the text instead.") from None
    try:
        reader = PdfReader(io.BytesIO(data))
        if reader.is_encrypted:
            raise ExtractError("This PDF is password protected. Paste the text instead.")
        if len(reader.pages) > MAX_PDF_PAGES:
            raise ExtractError(f"This PDF has more than {MAX_PDF_PAGES} pages.")
        text = "\n".join(page.extract_text() or "" for page in reader.pages)
    except ExtractError:
        raise
    except Exception:
        raise ExtractError("This PDF could not be read. Paste the text instead.") from None
    if not text.strip():
        raise ExtractError(
            "This PDF has no selectable text (it may be a scan). Paste the text instead."
        )
    return text


def _docx(data: bytes) -> str:
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            info = archive.getinfo("word/document.xml")
            # Checked before reading, so a zip bomb is never expanded.
            if info.file_size > MAX_DOCX_XML_BYTES:
                raise ExtractError("This Word file is too large.")
            xml = archive.read(info).decode("utf-8", errors="replace")
    except ExtractError:
        raise
    except KeyError:
        raise ExtractError("Only .docx Word files are supported.") from None
    except Exception:
        raise ExtractError("This Word file could not be read.") from None
    # Read with patterns, not an XML parser, so entity tricks cannot apply.
    paragraphs = []
    for body in re.findall(r"<w:p[ >].*?</w:p>", xml, flags=re.S):
        parts = []
        for text, mark in re.findall(
            r"<w:t(?: [^>]*)?>(.*?)</w:t>|<w:(tab|br|cr)\b[^>]*/>", body, flags=re.S
        ):
            parts.append("\t" if mark == "tab" else "\n" if mark else html.unescape(text))
        paragraphs.append("".join(parts))
    return "\n".join(paragraphs)


def extract_text(data: bytes) -> str:
    """Plain text from a PDF, .docx or text file. Raises ExtractError."""
    if not data:
        raise ExtractError("The file is empty.")
    if len(data) > MAX_BYTES:
        raise ExtractError("The file is larger than 5 MB.")
    if data.startswith(b"%PDF-"):
        text = _pdf(data)
    elif data.startswith(b"PK\x03\x04"):
        text = _docx(data)
    elif b"\x00" in data[:4096]:
        raise ExtractError("Upload a PDF, a .docx Word file or a text file.")
    else:
        try:
            text = data.decode("utf-8-sig")
        except UnicodeDecodeError:
            text = data.decode("latin-1")
    text = _tidy(text)
    if not text:
        raise ExtractError("No text was found in the file.")
    return text

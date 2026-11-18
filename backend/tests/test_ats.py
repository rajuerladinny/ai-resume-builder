"""ATS readability check and job ranking."""

import io
import zipfile

from app import ats, extract, keywords
from tests.test_checks_extract import PDF
from tests.test_core import JOB, RESUME


def word_file(body: str, header: str = "") -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("word/document.xml", f"<w:document><w:body>{body}</w:body></w:document>")
        if header:
            archive.writestr("word/header1.xml", f"<w:hdr><w:p><w:r><w:t>{header}</w:t></w:r></w:p></w:hdr>")
    return buffer.getvalue()


def para(text: str) -> str:
    return f"<w:p><w:r><w:t>{text}</w:t></w:r></w:p>"


def results(data: bytes) -> dict:
    text, facts = extract.extract_file(data)
    return {c["id"]: c for c in ats.ats_check(text, facts)["checks"]}


def test_word_facts_count_tables_text_boxes_images_and_header():
    body = (
        para("Ravi Kumar")
        + "<w:tbl><w:tr><w:tc>" + para("Skills") + "</w:tc></w:tr></w:tbl>"
        + "<w:tbl ><w:tr><w:tc>" + para("More") + "</w:tc></w:tr></w:tbl>"
        + '<w:p><w:r><w:drawing><wp:inline/></w:drawing></w:r></w:p>'
        + "<w:p><w:r><w:pict><v:shape><w:txbxContent>" + para("Boxed") + "</w:txbxContent></v:shape></w:pict></w:r></w:p>"
    )
    _, facts = extract.extract_file(word_file(body, header="ravi@example.com | +91 98765 43210"))
    assert facts == {
        "type": "docx",
        "pages": None,
        "tables": 2,
        "text_boxes": 1,
        "images": 2,  # a drawing and a picture
        "header_text": "ravi@example.com | +91 98765 43210",
    }


def test_word_layout_problems_are_explained():
    body = para("Ravi Kumar") + "<w:tbl>" + para("x") + "</w:tbl>" + "<w:p><w:r><w:drawing/></w:r></w:p>"
    checks = results(word_file(body, header="ravi@example.com | +91 98765 43210"))
    assert checks["file"]["ok"] is True
    assert checks["tables"]["ok"] is False and "1 table found" in checks["tables"]["detail"]
    assert checks["images"]["ok"] is False and checks["images"]["detail"].startswith("1 image")
    assert checks["text_boxes"]["ok"] is True
    assert checks["contact"]["ok"] is False
    assert "page header or footer" in checks["contact"]["detail"]


def test_clean_word_file_passes():
    lines = ["Ravi Kumar", "ravi@example.com | +91 98765 43210"] + [f"Built feature number {n} for the team" for n in range(20)]
    checks = results(word_file("".join(para(line) for line in lines)))
    assert all(c["ok"] for c in checks.values()), checks
    assert set(checks) == {"file", "characters", "contact", "tables", "text_boxes", "images", "layout"}


def test_garbled_characters_and_missing_contact_details():
    text = "Ravi Kumar\n React developer (cid:12)\n�"
    checks = {c["id"]: c for c in ats.ats_check(text, {"type": "text", "pages": None})["checks"]}
    assert checks["characters"]["ok"] is False
    assert checks["characters"]["detail"].startswith("3 characters could not be read")
    assert checks["contact"]["detail"].startswith("No email or phone number found")
    assert "layout" not in checks  # too few lines to judge
    only_email = {c["id"]: c for c in ats.ats_check("a@b.co", {"type": "text"})["checks"]}
    assert only_email["contact"]["detail"].startswith("No phone number found")


def test_columns_are_detected_from_many_short_lines():
    text = "\n".join(["Skills", "React", "Redux", "Jest"] * 5 + ["Built dashboards used by millions of people"] * 4)
    checks = {c["id"]: c for c in ats.ats_check(text, {"type": "text"})["checks"]}
    assert checks["layout"]["ok"] is False
    assert checks["layout"]["detail"].startswith("83% of lines")


def test_pdf_pages_and_text_density():
    checks = results(PDF)
    assert "pages" in checks and checks["pages"]["ok"] is True
    assert checks["text"]["ok"] is False  # the test PDF holds only a few words
    many = ats.ats_check("x" * 4000, {"type": "pdf", "pages": 3})
    by_id = {c["id"]: c for c in many["checks"]}
    assert by_id["pages"]["ok"] is False and by_id["pages"]["detail"].startswith("3 pages")
    assert by_id["text"]["ok"] is True


def test_rank_jobs_orders_by_fit_and_keeps_ties_in_order():
    jobs = [
        {"name": "Bakery", "text": "Bread, cakes and ovens. Bread daily."},
        {"name": "Frontend", "text": JOB},
        {"name": "Also bakery", "text": "Ovens and bread. Bread daily, cakes."},
    ]
    ranked = keywords.rank_jobs(RESUME, jobs)
    assert [r["name"] for r in ranked] == ["Frontend", "Bakery", "Also bakery"]
    assert ranked[0]["index"] == 1
    assert ranked[0]["score"] == keywords.analyze(RESUME, JOB)["score"]

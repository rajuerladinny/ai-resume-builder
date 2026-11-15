import base64
import io
import zipfile

import pytest

from app import checks, extract

GOOD = """Asha Rao
asha.rao@example.com | +91 98765 43210

EXPERIENCE
Acme, Engineer, 2020 to present
- Built 4 dashboards used by 2 million users
- Cut load time by 40%
- Led a team of 3 engineers
- Wrote tests for every component
- Shipped weekly releases

EDUCATION
B.Tech, 2019

SKILLS
React, TypeScript
""" + ("Delivered reliable software across many projects. " * 40)


def results(text):
    return {c["id"]: c for c in checks.review(text)["checks"]}


def test_review_passes_a_well_formed_resume():
    review = checks.review(GOOD)
    assert review["passed"] == review["total"] == 7
    assert review["words"] > checks.MIN_WORDS


def test_review_explains_each_problem():
    weak = "I was responsible for things.\nWorked on stuff.\n- one bullet"
    found = results(weak)
    assert not any(c["ok"] for c in found.values())
    assert found["contact"]["detail"] == "Add an email address and a phone number at the top."
    assert "experience, education, skills" in found["sections"]["detail"]
    assert '"responsible for", "worked on"' in found["wording"]["detail"]
    assert results("a@b.co " + weak)["contact"]["detail"] == "Add a phone number at the top."


def test_review_ignores_list_numbers_and_inline_headings():
    numbered = "1. Built things\n2. Fixed things\n3. Shipped things"
    assert "0 bullet points include a number" in results(numbered)["numbers"]["detail"]
    # A sentence that merely starts with "Experience" is not a section heading.
    inline = "Experience with React is something this resume talks about at length"
    assert "experience" in results(inline)["sections"]["detail"]


def docx(document_xml: str, name: str = "word/document.xml") -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr(name, document_xml)
    return buffer.getvalue()


def test_extract_reads_docx_paragraphs_tabs_and_entities():
    xml = (
        "<w:document><w:body>"
        '<w:p><w:pPr><w:pStyle w:val="Title"/></w:pPr><w:r><w:t>Ravi Kumar</w:t></w:r></w:p>'
        '<w:p w:rsidR="1"><w:r><w:t xml:space="preserve">R&amp;D </w:t><w:tab/><w:t>Lead</w:t></w:r></w:p>'
        "</w:body></w:document>"
    )
    assert extract.extract_text(docx(xml)) == "Ravi Kumar\nR&D \tLead"


def test_extract_reads_plain_text_and_tidies_it():
    assert extract.extract_text("﻿Line one  \r\n\r\n\r\n\r\nLine two\r".encode()) == (
        "Line one\n\nLine two"
    )
    assert extract.extract_text("caf\xe9".encode("latin-1")) == "caf\xe9"


# A one-page PDF with two lines of text, made once with reportlab.
PDF = base64.b64decode(
    "JVBERi0xLjMKJZOMi54gUmVwb3J0TGFiIEdlbmVyYXRlZCBQREYgZG9jdW1lbnQgKG9wZW5zb3VyY2Up"
    "CjEgMCBvYmoKPDwKL0YxIDIgMCBSCj4+CmVuZG9iagoyIDAgb2JqCjw8Ci9CYXNlRm9udCAvSGVsdmV0"
    "aWNhIC9FbmNvZGluZyAvV2luQW5zaUVuY29kaW5nIC9OYW1lIC9GMSAvU3VidHlwZSAvVHlwZTEgL1R5"
    "cGUgL0ZvbnQKPj4KZW5kb2JqCjMgMCBvYmoKPDwKL0NvbnRlbnRzIDcgMCBSIC9NZWRpYUJveCBbIDAg"
    "MCA1OTUuMjc1NiA4NDEuODg5OCBdIC9QYXJlbnQgNiAwIFIgL1Jlc291cmNlcyA8PAovRm9udCAxIDAg"
    "UiAvUHJvY1NldCBbIC9QREYgL1RleHQgL0ltYWdlQiAvSW1hZ2VDIC9JbWFnZUkgXQo+PiAvUm90YXRl"
    "IDAgL1RyYW5zIDw8Cgo+PiAKICAvVHlwZSAvUGFnZQo+PgplbmRvYmoKNCAwIG9iago8PAovUGFnZU1v"
    "ZGUgL1VzZU5vbmUgL1BhZ2VzIDYgMCBSIC9UeXBlIC9DYXRhbG9nCj4+CmVuZG9iago1IDAgb2JqCjw8"
    "Ci9BdXRob3IgKGFub255bW91cykgL0NyZWF0aW9uRGF0ZSAoRDoyMDI2MTExNTE2NTcwMSswNScwMCcp"
    "IC9DcmVhdG9yIChhbm9ueW1vdXMpIC9LZXl3b3JkcyAoKSAvTW9kRGF0ZSAoRDoyMDI2MTExNTE2NTcw"
    "MSswNScwMCcpIC9Qcm9kdWNlciAoUmVwb3J0TGFiIFBERiBMaWJyYXJ5IC0gXChvcGVuc291cmNlXCkp"
    "IAogIC9TdWJqZWN0ICh1bnNwZWNpZmllZCkgL1RpdGxlICh1bnRpdGxlZCkgL1RyYXBwZWQgL0ZhbHNl"
    "Cj4+CmVuZG9iago2IDAgb2JqCjw8Ci9Db3VudCAxIC9LaWRzIFsgMyAwIFIgXSAvVHlwZSAvUGFnZXMK"
    "Pj4KZW5kb2JqCjcgMCBvYmoKPDwKL0xlbmd0aCAxNjUKPj4Kc3RyZWFtCjEgMCAwIDEgMCAwIGNtICBC"
    "VCAvRjEgMTIgVGYgMTQuNCBUTCBFVApCVCAxIDAgMCAxIDcyIDcyMCBUbSAoUmF2aSBLdW1hciAtIEZy"
    "b250LWVuZCBEZXZlbG9wZXIpIFRqIFQqIEVUCkJUIDEgMCAwIDEgNzIgNzAwIFRtIChCdWlsdCBkYXNo"
    "Ym9hcmRzIGluIFJlYWN0KSBUaiBUKiBFVAogCmVuZHN0cmVhbQplbmRvYmoKeHJlZgowIDgKMDAwMDAw"
    "MDAwMCA2NTUzNSBmIAowMDAwMDAwMDYxIDAwMDAwIG4gCjAwMDAwMDAwOTIgMDAwMDAgbiAKMDAwMDAw"
    "MDE5OSAwMDAwMCBuIAowMDAwMDAwNDAyIDAwMDAwIG4gCjAwMDAwMDA0NzAgMDAwMDAgbiAKMDAwMDAw"
    "MDczMSAwMDAwMCBuIAowMDAwMDAwNzkwIDAwMDAwIG4gCnRyYWlsZXIKPDwKL0lEIApbPDRjNDFjMjFh"
    "ZGRkOWNkZTEwMDRmN2NlNzA0NmVlYTJkPjw0YzQxYzIxYWRkZDljZGUxMDA0ZjdjZTcwNDZlZWEyZD5d"
    "CiUgUmVwb3J0TGFiIGdlbmVyYXRlZCBQREYgZG9jdW1lbnQgLS0gZGlnZXN0IChvcGVuc291cmNlKQoK"
    "L0luZm8gNSAwIFIKL1Jvb3QgNCAwIFIKL1NpemUgOAo+PgpzdGFydHhyZWYKMTAwNQolJUVPRgo="
)


def test_extract_reads_pdf_text():
    pytest.importorskip("pypdf")
    assert extract.extract_text(PDF) == (
        "Ravi Kumar - Front-end Developer\nBuilt dashboards in React"
    )


@pytest.mark.parametrize(
    "data, message",
    [
        (b"", "empty"),
        (b"\x00\x01\x02binary", "Upload a PDF"),
        (b"   \n ", "No text"),
        (b"x" * (extract.MAX_BYTES + 1), "larger than 5 MB"),
        (b"PK\x03\x04not really a zip", "could not be read"),
        (b"%PDF-1.7 broken", "could not be read"),
    ],
)
def test_extract_rejects_unreadable_files(data, message):
    with pytest.raises(extract.ExtractError, match=message):
        extract.extract_text(data)


def test_extract_rejects_other_zip_files_and_zip_bombs(monkeypatch):
    with pytest.raises(extract.ExtractError, match="Only .docx"):
        extract.extract_text(docx("<x/>", name="other.xml"))
    monkeypatch.setattr(extract, "MAX_DOCX_XML_BYTES", 10)
    with pytest.raises(extract.ExtractError, match="too large"):
        extract.extract_text(docx("<w:p><w:r><w:t>" + "a" * 100 + "</w:t></w:r></w:p>"))

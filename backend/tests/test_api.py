"""HTTP route tests. They need FastAPI's test client (see requirements-dev.txt)."""
import pytest

pytest.importorskip("fastapi")
pytest.importorskip("httpx")

from fastapi.testclient import TestClient  # noqa: E402

from app import extract, main  # noqa: E402
from tests.test_checks_extract import docx  # noqa: E402
from tests.test_core import JOB, RESUME  # noqa: E402


@pytest.fixture()
def client(monkeypatch):
    monkeypatch.delenv("LLM_PROVIDER", raising=False)
    for limiter in (main.analyze_limiter, main.tailor_limiter, main.extract_limiter):
        limiter.hits.clear()
    return TestClient(main.app)


def test_analyze_returns_score_keywords_and_review(client):
    res = client.post("/api/analyze", json={"resume": RESUME, "job": JOB})
    assert res.status_code == 200
    body = res.json()
    assert 0 < body["score"] < 100
    assert "graphql" in body["missing"]
    assert body["review"]["total"] == 7
    assert {c["id"] for c in body["review"]["checks"]} >= {"contact", "sections", "length"}


def test_tailor_in_mock_mode_explains_that_nothing_changed(client):
    body = client.post("/api/tailor", json={"resume": RESUME, "job": JOB}).json()
    assert body["rewritten"] is False
    assert body["tailored"] == RESUME.strip()
    assert "No AI model" in body["notice"]
    assert body["review"]["total"] == 7


def test_short_or_missing_input_is_rejected(client):
    assert client.post("/api/analyze", json={"resume": "short", "job": JOB}).status_code == 422
    assert client.post("/api/tailor", json={"resume": RESUME}).status_code == 422


def test_extract_reads_text_and_word_files(client):
    text = client.post("/api/extract", content=b"Ravi Kumar\r\nDeveloper")
    assert text.json() == {"text": "Ravi Kumar\nDeveloper", "characters": 20}
    word = client.post(
        "/api/extract", content=docx("<w:p><w:r><w:t>Ravi Kumar</w:t></w:r></w:p>")
    )
    assert word.json()["text"] == "Ravi Kumar"


def test_extract_rejects_bad_and_oversized_files(client):
    binary = client.post("/api/extract", content=b"\x00\x01\x02")
    assert binary.status_code == 422
    assert "Upload a PDF" in binary.json()["detail"]
    assert client.post("/api/extract", content=b"").status_code == 422
    too_big = client.post("/api/extract", content=b"x" * (extract.MAX_BYTES + 1))
    assert too_big.status_code == 413


def test_rank_orders_resumes_and_includes_reviews(client):
    body = {
        "job": JOB,
        "resumes": [
            {"name": "baker.pdf", "text": "I bake bread and cakes."},
            {"name": "ravi.docx", "text": RESUME},
        ],
    }
    res = client.post("/api/rank", json=body)
    assert res.status_code == 200
    data = res.json()
    assert data["keywords"] > 0
    assert [r["name"] for r in data["results"]] == ["ravi.docx", "baker.pdf"]
    assert data["results"][0]["score"] > data["results"][1]["score"] == 0
    assert data["results"][0]["review"]["total"] == 7
    assert [r["index"] for r in data["results"]] == [1, 0]
    # Two files may share a name; each still gets its own review.
    same = {"job": JOB, "resumes": [{"name": "cv.pdf", "text": "x"}, {"name": "cv.pdf", "text": RESUME}]}
    words = [r["review"]["words"] for r in client.post("/api/rank", json=same).json()["results"]]
    assert words == [60, 1]


def test_rank_limits_the_number_of_resumes(client):
    one = {"name": "a.txt", "text": RESUME}
    too_many = {"job": JOB, "resumes": [one] * (main.MAX_COMPARE + 1)}
    assert client.post("/api/rank", json=too_many).status_code == 422
    assert client.post("/api/rank", json={"job": JOB, "resumes": []}).status_code == 422
    assert client.post("/api/rank", json={"job": "short", "resumes": [one]}).status_code == 422


def test_rate_limits(client, monkeypatch):
    monkeypatch.setattr(main.tailor_limiter, "limit", 0)
    assert client.post("/api/tailor", json={"resume": RESUME, "job": JOB}).status_code == 429
    monkeypatch.setattr(main.extract_limiter, "limit", 0)
    assert client.post("/api/extract", content=b"text").status_code == 429
    monkeypatch.setattr(main.analyze_limiter, "limit", 0)
    assert client.post("/api/analyze", json={"resume": RESUME, "job": JOB}).status_code == 429


def test_security_headers_and_health(client):
    res = client.get("/api/health")
    assert res.json() == {"ok": True}
    assert res.headers["x-content-type-options"] == "nosniff"
    assert res.headers["x-frame-options"] == "DENY"
    assert res.headers["cache-control"] == "no-store"
    assert res.headers["referrer-policy"] == "no-referrer"

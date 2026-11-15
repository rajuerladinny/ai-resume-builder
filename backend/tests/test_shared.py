"""Keeps the files shared with the frontend in step with this backend."""
import base64
import json

import pytest

from app import export_shared, extract

needs_frontend = pytest.mark.skipif(
    not export_shared.SAMPLE_PATH.exists(), reason="frontend sources are not present"
)
HINT = "Run `python -m app.export_shared` and commit the result."


def without_file_bytes(parity: dict) -> dict:
    """Compressed bytes differ between zlib versions, so they are checked separately."""
    files = [{k: v for k, v in f.items() if k != "base64"} for f in parity["files"]]
    return {**parity, "files": files}


@needs_frontend
def test_shared_files_are_up_to_date():
    assert export_shared.VOCAB_PATH.read_text(encoding="utf-8") == export_shared.render_vocab(), HINT
    committed = json.loads(export_shared.PARITY_PATH.read_text(encoding="utf-8"))
    assert without_file_bytes(committed) == without_file_bytes(export_shared.parity()), HINT


@needs_frontend
def test_committed_files_extract_to_their_recorded_text():
    committed = json.loads(export_shared.PARITY_PATH.read_text(encoding="utf-8"))
    assert len(committed["files"]) == 3
    for file in committed["files"]:
        assert extract.extract_text(base64.b64decode(file["base64"])) == file["text"], file["name"]


def test_parity_cases_cover_the_awkward_inputs():
    cases = {c["name"]: c for c in export_shared.parity()["cases"]}
    assert cases["half-point scores"]["analyze"]["score"] == 12  # 12.5 rounds to even
    assert cases["empty job"]["analyze"]["keywords"] == 0
    assert cases["sample tailored"]["analyze"]["score"] > cases["sample"]["analyze"]["score"]

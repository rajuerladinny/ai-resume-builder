"""Keeps the files shared with the frontend in step with this backend."""
import pytest

from app import export_shared


@pytest.mark.skipif(
    not export_shared.SAMPLE_PATH.exists(), reason="frontend sources are not present"
)
def test_shared_files_are_up_to_date():
    hint = "Run `python -m app.export_shared` and commit the result."
    assert export_shared.VOCAB_PATH.read_text(encoding="utf-8") == export_shared.render_vocab(), hint
    assert export_shared.PARITY_PATH.read_text(encoding="utf-8") == export_shared.render(
        export_shared.parity()
    ), hint


def test_parity_cases_cover_the_awkward_inputs():
    cases = {c["name"]: c for c in export_shared.parity()["cases"]}
    assert cases["half-point scores"]["analyze"]["score"] == 12  # 12.5 rounds to even
    assert cases["empty job"]["analyze"]["keywords"] == 0
    assert cases["sample tailored"]["analyze"]["score"] > cases["sample"]["analyze"]["score"]

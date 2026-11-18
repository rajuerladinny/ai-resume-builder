"""Cover letters: the template, and the safeguards around the AI letter."""

import pytest

from app import cover_letter as cl
from app import llm
from tests.test_core import JOB, RESUME


def test_candidate_name():
    assert cl.candidate_name("Ravi Kumar\nravi@example.com") == "Ravi Kumar"
    assert cl.candidate_name("\n  RAVI KUMAR  \n") == "Ravi Kumar"
    assert cl.candidate_name("Ravi Kumar - Front-end Developer") == ""  # not just a name
    assert cl.candidate_name("Resume 2024") == ""
    assert cl.candidate_name("Ravi") == ""
    assert cl.candidate_name("") == ""


def test_role_title():
    assert cl.role_title("Senior Frontend Engineer\n\nWe are hiring") == "Senior Frontend Engineer"
    assert cl.role_title("Job title: Data Analyst\nDetails") == "Data Analyst"
    assert cl.role_title("We are looking for a great engineer to join us.") == ""
    assert cl.role_title("") == ""


def test_join_words_and_display_term():
    assert cl.join_words([]) == ""
    assert cl.join_words(["a"]) == "a"
    assert cl.join_words(["a", "b"]) == "a and b"
    assert cl.join_words(["a", "b", "c"]) == "a, b and c"
    assert cl.display_term("react", "Expert in React.js") == "React"
    assert cl.display_term("node.js", "NodeJS services") == "node.js"


def test_highlights_prefer_matching_bullets_with_numbers_and_skip_weak_ones():
    resume = (
        "- Responsible for React and TypeScript code\n"
        "- Built React dashboards for 3 teams\n"
        "- Built React dashboards for the team\n"
        "- Baked bread for the office party\n"
        "- React"
    )
    assert cl.highlights(resume, JOB) == [
        "Built React dashboards for 3 teams",
        "Built React dashboards for the team",
    ]


def test_template_letter_uses_only_resume_facts():
    letter = cl.template_letter(RESUME, JOB)
    assert letter.startswith("Dear Hiring Manager,\n\nI am writing to apply for the Senior Frontend Engineer role.")
    assert "React" in letter and "TypeScript" in letter
    assert "GraphQL" not in letter and "AWS" not in letter  # in the job, not the resume
    assert "- Built customer dashboards in ReactJS and TS used by 2 million users" in letter
    assert letter.endswith("Sincerely,\n[Your name]")  # the sample's first line is not a bare name


def test_mock_mode_returns_the_template(monkeypatch):
    monkeypatch.delenv("LLM_PROVIDER", raising=False)
    result = cl.cover_letter(RESUME, JOB)
    assert result == {
        "letter": cl.template_letter(RESUME, JOB),
        "ai": False,
        "notice": cl.TEMPLATE_NOTICE,
        "check": [],
    }


def test_ai_letter_flags_keywords_missing_from_the_resume():
    letter = "Dear team,\n\n" + "I built React dashboards and GraphQL services on AWS. " * 8
    result = cl.cover_letter(RESUME, JOB, write=lambda resume, job: letter)
    assert result["ai"] is True
    assert result["notice"] == cl.AI_NOTICE
    assert set(result["check"]) == {"graphql", "aws"}


@pytest.mark.parametrize("reply", ["", "Too short to be a letter."])
def test_short_ai_reply_falls_back_to_the_template(reply):
    result = cl.cover_letter(RESUME, JOB, write=lambda resume, job: reply)
    assert result["ai"] is False
    assert result["notice"] == cl.FAILED_NOTICE
    assert result["letter"] == cl.template_letter(RESUME, JOB)


def test_failed_ai_call_falls_back_and_is_logged(caplog):
    def broken(resume, job):
        raise TimeoutError("model is down")

    result = cl.cover_letter(RESUME, JOB, write=broken)
    assert result["ai"] is False
    assert "LLM request failed: TimeoutError" in caplog.text
    assert "Ravi" not in caplog.text  # never log resume content


def test_config_errors(monkeypatch):
    for name in ("LLM_PROVIDER", "LLM_MODEL", "LLM_BASE_URL", "LLM_TIMEOUT"):
        monkeypatch.delenv(name, raising=False)
    assert llm.config_errors() == []
    assert llm.mode() == "mock"
    monkeypatch.setenv("LLM_PROVIDER", "anthropic")
    assert "LLM_PROVIDER must be one of" in llm.config_errors()[0]
    monkeypatch.setenv("LLM_PROVIDER", "openai")
    assert llm.config_errors() == ["LLM_PROVIDER=openai needs LLM_MODEL."]
    monkeypatch.setenv("LLM_MODEL", "some-model")
    monkeypatch.setenv("LLM_BASE_URL", "localhost:11434")
    monkeypatch.setenv("LLM_TIMEOUT", "soon")
    assert llm.config_errors() == [
        "LLM_BASE_URL must start with http:// or https://.",
        "LLM_TIMEOUT must be a number of seconds.",
    ]
    monkeypatch.setenv("LLM_BASE_URL", "https://example.com/v1")
    monkeypatch.setenv("LLM_TIMEOUT", "30")
    assert llm.config_errors() == []
    assert llm.mode() == "ai"

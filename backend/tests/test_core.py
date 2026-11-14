from app import tailor as tailoring
from app.keywords import analyze, extract_keywords, normalize
from app.ratelimit import RateLimiter

JOB = """Senior Frontend Engineer

We are looking for a Senior Frontend Engineer with 5+ years of experience in
React.js and TypeScript. You will build dashboards for our payments platform
and mentor junior engineers. Experience with Next.js, GraphQL and CI/CD
pipelines is required. Knowledge of Node.js and AWS is a plus.

Responsibilities: own dashboards end to end, improve performance of the
payments dashboards, write unit testing suites with Jest, mentor engineers.
"""

RESUME = """Ravi Kumar - Front-end Developer

EXPERIENCE
Acme Corp, Senior Developer, 2019 to present
- Built customer dashboards in ReactJS and TS used by 2 million users
- Cut page load time by 40% through performance work
- Set up unit testing with Jest and CI/CD on Jenkins
- Mentor for three junior developers

SKILLS
JavaScript, React, Redux, HTML, CSS, Git
"""


def test_normalize_keeps_tech_terms_and_applies_aliases():
    tokens = normalize("ReactJS, Node.js, C++, C#, CI/CD, .NET and K8s. REST APIs")
    for expected in ["react", "node.js", "c++", "c#", "ci/cd", "dotnet", "kubernetes", "api"]:
        assert expected in tokens


def test_normalize_splits_slashes_and_does_not_mangle_skill_names():
    tokens = normalize("HTML/CSS, Kubernetes, AWS, Jenkins, Express")
    assert tokens == ["html", "css", "kubernetes", "aws", "jenkins", "express"]


def test_extract_keywords_finds_skills_and_repeated_terms():
    found = {k["term"]: k for k in extract_keywords(JOB)}
    for skill in ["react", "typescript", "next.js", "graphql", "ci/cd", "node.js", "aws", "jest", "unit testing"]:
        assert found[skill]["kind"] == "skill"
    assert found["dashboard"]["kind"] == "term"  # repeated, not a known skill
    assert "experience" not in found  # filler is ignored
    assert "testing" not in found  # already covered by the phrase


def test_analyze_scores_matched_and_missing():
    result = analyze(RESUME, JOB)
    assert {"react", "typescript", "jest", "ci/cd", "unit testing"} <= set(result["matched"])
    assert {"next.js", "graphql", "aws", "node.js"} <= set(result["missing"])
    assert 0 < result["score"] < 100
    assert result["keywords"] == len(result["matched"]) + len(result["missing"])


def test_analyze_extremes():
    assert analyze(JOB, JOB)["score"] == 100
    assert analyze("I bake bread and cakes.", JOB)["score"] == 0
    assert analyze(RESUME, "")["score"] == 0


def test_tailor_in_mock_mode_leaves_resume_unchanged(monkeypatch):
    monkeypatch.delenv("LLM_PROVIDER", raising=False)
    result = tailoring.tailor(RESUME, JOB)
    assert result["tailored"] == RESUME.strip()
    assert result["rewritten"] is False
    assert "No AI model" in result["notice"]
    assert result["before"]["score"] == result["after"]["score"]
    assert result["check"] == []
    assert result["suggestions"]


def test_tailor_flags_keywords_the_model_added():
    def inventive(resume, job, missing):
        return resume + "\n- Deployed GraphQL services on AWS"

    result = tailoring.tailor(RESUME, JOB, rewrite=inventive)
    assert result["rewritten"] is True
    assert set(result["check"]) == {"graphql", "aws"}
    assert result["after"]["score"] > result["before"]["score"]


def test_tailor_passes_missing_keywords_to_the_model():
    seen = {}

    def spy(resume, job, missing):
        seen["missing"] = missing
        return resume

    tailoring.tailor(RESUME, JOB, rewrite=spy)
    assert "graphql" in seen["missing"]


def test_tailor_keeps_original_when_model_fails_or_truncates():
    def broken(resume, job, missing):
        raise RuntimeError("LLM down")

    failed = tailoring.tailor(RESUME, JOB, rewrite=broken)
    assert failed["tailored"] == RESUME.strip()
    assert failed["rewritten"] is False
    assert "failed" in failed["notice"]

    truncated = tailoring.tailor(RESUME, JOB, rewrite=lambda *a: "Ravi Kumar")
    assert truncated["tailored"] == RESUME.strip()
    assert truncated["rewritten"] is False


def test_rate_limiter_blocks_then_recovers():
    limiter = RateLimiter(limit=2, window_seconds=10)
    assert limiter.allow("a", now=0)
    assert limiter.allow("a", now=1)
    assert not limiter.allow("a", now=2)
    assert limiter.allow("b", now=2)
    assert limiter.allow("a", now=11)

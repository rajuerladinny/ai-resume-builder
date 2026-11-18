"""Keyword extraction and resume-to-job matching. Standard library only.

No AI is used here, so the match score is free, instant and repeatable.
"""
import re
from collections import Counter

# Skills worth double weight when a job post names them. Lower case.
# Multi-word entries are matched as phrases.
SKILLS = {
    # languages
    "javascript", "typescript", "python", "java", "c++", "c#", "go", "rust",
    "kotlin", "swift", "php", "ruby", "scala", "sql", "html", "css", "bash",
    # front end
    "react", "redux", "next.js", "angular", "vue", "svelte", "tailwind",
    "webpack", "vite", "jest", "cypress", "playwright", "storybook",
    "react native", "flutter", "android", "ios", "graphql", "rest api",
    "responsive design", "accessibility", "micro frontend",
    # back end
    "node.js", "express", "django", "flask", "fastapi", "spring boot",
    "dotnet", "microservice", "kafka", "rabbitmq", "redis", "grpc",
    # data
    "postgresql", "mysql", "mongodb", "elasticsearch", "snowflake", "spark",
    "airflow", "pandas", "numpy", "power bi", "tableau", "etl",
    # cloud and devops
    "aws", "azure", "gcp", "docker", "kubernetes", "terraform", "jenkins",
    "ci/cd", "github actions", "linux", "git", "nginx",
    # ai
    "machine learning", "deep learning", "nlp", "llm", "pytorch",
    "tensorflow", "langchain", "rag", "prompt engineering",
    # practices
    "agile", "scrum", "system design", "unit testing", "tdd", "code review",
    "data structures", "algorithms", "oop", "design patterns",
}

ALIASES = {
    "js": "javascript", "ts": "typescript", "reactjs": "react",
    "react.js": "react", "nodejs": "node.js", "node": "node.js",
    "nextjs": "next.js", "vuejs": "vue", "vue.js": "vue",
    "angularjs": "angular", "k8s": "kubernetes", "postgres": "postgresql",
    "mongo": "mongodb", "golang": "go", "restful": "rest", "apis": "api",
    "ml": "machine learning", "springboot": "spring boot",
    "frontend": "front-end", "backend": "back-end",
    "microservices": "microservice", "frontends": "frontend",
    "llms": "llm", "cicd": "ci/cd", "tailwindcss": "tailwind",
    "expressjs": "express", "express.js": "express",
}

STOPWORDS = {
    "a", "an", "the", "and", "or", "of", "to", "in", "on", "for", "at", "by",
    "with", "as", "is", "are", "be", "will", "you", "your", "we", "our",
    "us", "this", "that", "from", "have", "has", "it", "its", "their",
    "they", "who", "what", "can", "should", "must", "may", "etc", "all",
    "any", "not", "but", "if", "than", "then", "also", "such", "into",
    "about", "over", "more", "other", "per", "via", "within", "across",
    # job-post filler that says nothing about fit
    "experience", "experienced", "year", "years", "work", "working", "team",
    "teams", "role", "job", "candidate", "candidates", "company", "ability",
    "strong", "good", "excellent", "knowledge", "understanding", "skill",
    "skills", "required", "requirement", "requirements", "preferred",
    "responsibility", "responsibilities", "including", "plus", "new",
    "using", "use", "used", "well", "looking", "join", "need", "needs",
    "like", "based", "etc.", "end", "minimum", "least", "high", "best", "related",
    "ensure", "help", "one", "two", "three", "day", "days",
    "apply", "location", "salary", "benefit", "benefits", "opportunity",
    "hands-on", "proficiency", "proficient", "familiarity", "familiar",
    "degree", "bachelor", "equivalent", "position", "environment",
    "build", "building", "develop", "developing", "development",
}

_SKILL_WORDS = {s for s in SKILLS if " " not in s}
_SKILL_PHRASES = sorted((s for s in SKILLS if " " in s), key=len, reverse=True)
_TOKEN = re.compile(r"[a-z0-9][a-z0-9+#.\-/]*")


def _canonical(token: str) -> str:
    token = token.rstrip(".-/")
    if token in ALIASES:
        return ALIASES[token]
    if token in _SKILL_WORDS:
        return token
    if token.endswith("s") and token[:-1] in _SKILL_WORDS:
        return token[:-1]
    # light plural stemming for ordinary words
    if len(token) > 4 and token.endswith("s") and not token.endswith(("ss", "us", "is")):
        return token[:-1]
    return token


def normalize(text: str) -> list[str]:
    """Lower-case tokens with tech terms kept whole (c++, node.js, ci/cd)."""
    text = text.lower().replace(".net", " dotnet ")
    tokens = []
    for raw in _TOKEN.findall(text):
        parts = [raw] if raw.rstrip(".-/") == "ci/cd" else raw.split("/")
        for part in parts:
            token = _canonical(part)
            if token:
                tokens.extend(token.split(" "))  # an alias may expand to a phrase
    return tokens


def extract_keywords(job_text: str, max_other: int = 12) -> list[dict]:
    """Keywords a job post is asking for, most important first.

    Returns [{"term": str, "kind": "skill" | "term", "count": int}].
    Known skills are always included; other words only if they repeat.
    """
    tokens = normalize(job_text)
    joined = " " + " ".join(tokens) + " "
    counts = Counter(tokens)

    found: list[dict] = []
    phrase_words: set[str] = set()
    for phrase in _SKILL_PHRASES:
        n = joined.count(f" {phrase} ")
        if n:
            found.append({"term": phrase, "kind": "skill", "count": n})
            phrase_words.update(phrase.split(" "))
    for word in _SKILL_WORDS:
        if counts[word]:
            found.append({"term": word, "kind": "skill", "count": counts[word]})
    found.sort(key=lambda k: (-k["count"], k["term"]))

    others = [
        {"term": t, "kind": "term", "count": c}
        for t, c in counts.most_common()
        if c >= 2
        and len(t) >= 3
        and t not in STOPWORDS
        and t not in _SKILL_WORDS
        and t not in phrase_words
        and not t.isdigit()
    ]
    return found + others[:max_other]


def rank_resumes(job_text: str, resumes: list[dict]) -> list[dict]:
    """Score several resumes against one job post, best match first.

    `resumes` is [{"name": str, "text": str}]. Each result carries `index`,
    the resume's position in that list. Ties keep the order given.
    The score counts keyword overlap only, so treat the order as a first
    pass for a person to review, never as a decision about a candidate.
    """
    scored = [
        {"index": i, "name": r["name"], **analyze(r["text"], job_text)}
        for i, r in enumerate(resumes)
    ]
    return sorted(scored, key=lambda r: -r["score"])


def analyze(resume_text: str, job_text: str) -> dict:
    """Compare a resume with a job post.

    Returns {"score": 0-100, "matched": [...], "missing": [...],
             "keywords": int}. Skills count double.
    """
    keywords = extract_keywords(job_text)
    resume_tokens = normalize(resume_text)
    resume_set = set(resume_tokens)
    resume_joined = " " + " ".join(resume_tokens) + " "

    matched, missing = [], []
    got = total = 0
    for kw in keywords:
        weight = 2 if kw["kind"] == "skill" else 1
        total += weight
        term = kw["term"]
        present = (
            f" {term} " in resume_joined if " " in term else term in resume_set
        )
        if present:
            got += weight
            matched.append(term)
        else:
            missing.append(term)
    score = round(100 * got / total) if total else 0
    return {
        "score": score,
        "matched": matched,
        "missing": missing,
        "keywords": len(keywords),
    }


def rank_jobs(resume_text: str, jobs: list[dict]) -> list[dict]:
    """Score one resume against several job posts, best fit first.

    `jobs` is [{"name": str, "text": str}]. Each result carries `index`, the
    job's position in that list. Ties keep the order given.
    """
    scored = [
        {"index": i, "name": j["name"], **analyze(resume_text, j["text"])}
        for i, j in enumerate(jobs)
    ]
    return sorted(scored, key=lambda r: -r["score"])

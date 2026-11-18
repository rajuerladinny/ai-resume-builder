"""LLM access through any OpenAI-compatible chat completions endpoint.

Environment variables:
    LLM_PROVIDER  "mock" (default, no LLM needed) or "openai"
    LLM_BASE_URL  e.g. http://localhost:11434/v1 for a local Ollama server,
                  or your provider's OpenAI-compatible URL
    LLM_API_KEY   provider key (any value works for local servers)
    LLM_MODEL     model name as the provider lists it
    LLM_TIMEOUT   seconds to wait for a reply (default 90)
"""

import json
import os
import urllib.request

PROVIDERS = ("mock", "openai")

SYSTEM_PROMPT = """You tailor resumes to a specific job post.

Rules, in order of importance:
1. Use ONLY facts found in the candidate's resume. Never add a skill, tool,
   employer, title, date, degree, certificate or number that is not there.
2. Reorder and rephrase so the experience most relevant to the job comes
   first and uses the job post's own wording where it is truthful.
3. Where the resume already shows a skill under a different name, use the
   name the job post uses.
4. Keep every employer, job title and date exactly as written.
5. Start bullet points with strong action verbs; keep numbers and results.
6. Output plain text only: section headings in capitals, bullets starting
   with "- ". No tables, columns, images or markdown, so that applicant
   tracking systems can read it.
7. Output the resume only, with no commentary before or after."""


def build_messages(resume: str, job: str, missing: list[str]) -> list[dict]:
    note = ""
    if missing:
        note = (
            "\n\nThe job post mentions these terms that the resume does not: "
            + ", ".join(missing)
            + ". Do NOT add them unless the resume clearly shows that "
            "experience under another name."
        )
    return [
        {"role": "system", "content": SYSTEM_PROMPT},
        {
            "role": "user",
            "content": f"JOB POST:\n{job}\n\nRESUME:\n{resume}{note}",
        },
    ]


COVER_LETTER_PROMPT = """You write cover letters for job applications.

Rules, in order of importance:
1. Use ONLY facts found in the candidate's resume. Never add a skill, tool,
   employer, title, date, degree, certificate or number that is not there.
2. Connect the candidate's most relevant experience to what the job post asks
   for, using the job post's wording where it is truthful.
3. 250 to 350 words in four short paragraphs: why this role, two or three
   relevant achievements, how they would help the team, a polite close.
4. Use the company name only if the job post states it. Never invent one.
5. Sign with the candidate's name from the resume.
6. Output plain text only, with no commentary before or after."""


def openai_answer(messages: list[dict], max_tokens: int = 2000) -> str:
    base = os.environ.get("LLM_BASE_URL", "http://localhost:11434/v1").rstrip("/")
    body = json.dumps(
        {
            "model": os.environ["LLM_MODEL"],
            "messages": messages,
            "temperature": 0.3,
            "max_tokens": max_tokens,
        }
    ).encode()
    req = urllib.request.Request(
        f"{base}/chat/completions",
        data=body,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {os.environ.get('LLM_API_KEY', 'none')}",
        },
    )
    timeout = float(os.environ.get("LLM_TIMEOUT", "90"))
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        data = json.load(resp)
    return data["choices"][0]["message"]["content"].strip()


def config_errors() -> list[str]:
    """Problems with the LLM settings, checked once at startup."""
    provider = os.environ.get("LLM_PROVIDER", "mock")
    if provider not in PROVIDERS:
        return [f'LLM_PROVIDER must be one of {", ".join(PROVIDERS)}, not "{provider}".']
    errors = []
    if provider == "openai":
        if not os.environ.get("LLM_MODEL"):
            errors.append("LLM_PROVIDER=openai needs LLM_MODEL.")
        base = os.environ.get("LLM_BASE_URL", "http://localhost:11434/v1")
        if not base.startswith(("http://", "https://")):
            errors.append("LLM_BASE_URL must start with http:// or https://.")
    try:
        if float(os.environ.get("LLM_TIMEOUT", "90")) <= 0:
            errors.append("LLM_TIMEOUT must be a positive number of seconds.")
    except ValueError:
        errors.append("LLM_TIMEOUT must be a number of seconds.")
    return errors


def is_mock() -> bool:
    return os.environ.get("LLM_PROVIDER", "mock") == "mock"


def rewrite(resume: str, job: str, missing: list[str]) -> str:
    """Return the tailored resume. Mock mode returns the resume unchanged."""
    if is_mock():
        return resume.strip()
    return openai_answer(build_messages(resume, job, missing))


def write_cover_letter(resume: str, job: str) -> str:
    messages = [
        {"role": "system", "content": COVER_LETTER_PROMPT},
        {"role": "user", "content": f"JOB POST:\n{job}\n\nRESUME:\n{resume}"},
    ]
    return openai_answer(messages, max_tokens=900)


def mode() -> str:
    """ "ai" when a model is configured, otherwise "mock"."""
    return "mock" if is_mock() else "ai"

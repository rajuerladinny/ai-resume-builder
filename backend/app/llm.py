"""LLM access through any OpenAI-compatible chat completions endpoint.

Environment variables:
    LLM_PROVIDER  "mock" (default, no LLM needed) or "openai"
    LLM_BASE_URL  e.g. http://localhost:11434/v1 for a local Ollama server
    LLM_API_KEY   provider key (any value works for local servers)
    LLM_MODEL     model name as the provider lists it
"""
import json
import os
import urllib.request

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


def openai_answer(messages: list[dict]) -> str:
    base = os.environ.get("LLM_BASE_URL", "http://localhost:11434/v1").rstrip("/")
    body = json.dumps(
        {
            "model": os.environ["LLM_MODEL"],
            "messages": messages,
            "temperature": 0.3,
            "max_tokens": 2000,
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
    with urllib.request.urlopen(req, timeout=90) as resp:
        data = json.load(resp)
    return data["choices"][0]["message"]["content"].strip()


def is_mock() -> bool:
    return os.environ.get("LLM_PROVIDER", "mock") == "mock"


def rewrite(resume: str, job: str, missing: list[str]) -> str:
    """Return the tailored resume. Mock mode returns the resume unchanged."""
    if is_mock():
        return resume.strip()
    return openai_answer(build_messages(resume, job, missing))

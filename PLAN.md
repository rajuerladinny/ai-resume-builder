# AI Resume Builder: product plan

Paste a resume and a job post. Get a match score, the keywords you are
missing, and a version of the resume tailored to that job, ready to save as a
PDF that applicant tracking systems (ATS) can read.

## Who it is for (starting niche)

Software and IT professionals in India applying through Naukri, LinkedIn and
company career pages. Chosen because:

- Tech job posts are keyword-heavy, so tailoring makes a visible difference
- The builder knows this hiring market firsthand
- The skill dictionary in `backend/app/keywords.py` is already tech-focused

Niches to consider next: freshers from tier-2 colleges, and people applying
abroad who need US, UK or Gulf resume formats.

## Problem

- Recruiters and ATS filters screen on keywords from the job post
- Rewriting a resume for every application takes 30 to 60 minutes
- General AI chat tools can do it, but need careful prompting each time, give
  no match score, and sometimes invent experience

## What makes this different

1. **Match score before and after**, calculated without AI, so it is instant,
   free to run and the same every time
2. **No invented experience.** The AI is told to use only facts from the
   resume, and any job keyword that appears in the rewrite but not in the
   original is flagged for the user to check
3. **ATS-safe output**: plain text, standard headings, one-click PDF
4. **Nothing stored**: no account needed to try it

## Version 1 scope

In:

1. Paste resume and job post
2. Free match check: score, matched keywords, missing keywords
3. Tailored resume, editable in the page
4. Copy and Save as PDF
5. Per-visitor hourly limits

Out, for later:

- Upload PDF or DOCX resumes (paste only for now)
- Accounts, saved resumes, history
- Payments and credit packs
- Cover letter, LinkedIn summary, interview questions
- Designed PDF templates

## How it works

1. Keywords are pulled from the job post: known tech skills (double weight)
   plus other words that repeat.
2. The resume is checked for each keyword. Score = matched weight / total.
3. For tailoring, the resume, the job post and the missing keywords go to an
   LLM with strict rules against adding anything untrue.
4. The rewrite is scored again and compared with the original to flag any
   newly appearing keywords.
5. If the LLM fails or returns something much shorter than the original, the
   original resume is returned unchanged.

## Tech stack

- Frontend: React (Vite)
- Backend: Python, FastAPI. No database in version 1
- LLM: any OpenAI-compatible endpoint, set through environment variables.
  "mock" mode runs the full analysis with no LLM at all

## Pricing to test

People stop paying once they get a job, so sell packs, not subscriptions.

| Plan | Price to test | What they get |
| --- | --- | --- |
| Free | Rs 0 | Unlimited match checks, 1 tailored resume |
| Pack | Rs 199 | 10 tailored resumes |
| Job hunt month | Rs 499 | Unlimited for 30 days, plus cover letters |

The free match check is the hook: it costs nothing to run and shows the user
their gap before asking for money.

## Keeping LLM cost low

- Match check uses no LLM
- One LLM call per tailored resume, with a capped output length
- Hourly limit per visitor; later, credits per account
- Hard spending limit set in the provider dashboard

## Validation before building further

1. Tailor your own resume for 5 real job posts. Is the output something you
   would send?
2. Give it to 10 job-seeking friends or colleagues. Watch where they get
   stuck. Ask what they would pay.
3. Post a before/after example on LinkedIn and count how many people ask for
   the link.

If fewer than 3 of the 10 say they would pay, change the niche before adding
features.

## Getting users

- LinkedIn posts with before/after match scores
- Job-seeker groups on WhatsApp, Telegram and Reddit
- Short videos: "Why your resume is not getting shortlisted"
- Later: referral credits (give 2 tailored resumes, get 2)

## Roadmap

| Stage | Goal | Done when |
| --- | --- | --- |
| 1 | Working prototype (this repo) | Runs locally in mock mode |
| 2 | Real LLM connected | You would send the output for a real job |
| 3 | Ten test users | Feedback collected from 10 job seekers |
| 4 | Deployed with a domain | Public link works on a phone |
| 5 | Accounts and credit packs | First Rs 199 received |
| 6 | Resume upload and cover letter | PDF/DOCX in, cover letter out |

## Risks

- Crowded market: the niche, the honest "no invented experience" check and
  the free match score have to carry the positioning
- Free alternatives: general AI chat tools. Compete on speed and the score
- One-time users: needs a steady flow of new job seekers, so marketing never
  stops
- Trust: resumes hold personal data. Store nothing until accounts exist, and
  publish a privacy policy before launch that names the AI provider
- Payments in India need a payment gateway account and GST decisions; look
  into this before stage 5

## Current status

- [x] Plan written
- [x] Backend: keyword analysis, tailoring flow, rate limits
- [x] Frontend: single page with match score, tailored resume, PDF export
- [x] Dockerfile
- [x] Resume upload (PDF, .docx, text), read in memory
- [x] Rule-based resume review; changes view; text download
- [x] In-browser demo mode; CI for tests, builds and the Docker image
- [x] Compare resumes: rank up to 20 resumes against one job post (recruiter use)
- [x] v1.0: cover letters, bullet coach, interview prep, Word and PDF export, dark mode
- [x] Open-source readiness: license, contributing and security guides, deployment guide
- [ ] First end-to-end run on a laptop
- [ ] Connect a real LLM and judge the output on 5 real job posts
- [ ] Ten test users

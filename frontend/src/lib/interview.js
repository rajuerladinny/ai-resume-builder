// Interview prep: likely questions for a job post, based on which of its
// keywords the resume shows and which it lacks. Rule-based; no AI needed.
import { analyze, extractKeywords, normalize } from "./keywords.js";
import { displayTerm } from "./coverLetter.js";

const MAX_SKILL_QUESTIONS = 4;
const MAX_GAP_QUESTIONS = 3;
const MAX_THEME_QUESTIONS = 4;

// Themes a job post may stress, the words that signal them, and a question for each.
const THEMES = [
  [["mentor", "mentoring", "coach", "coaching"], "How have you helped a junior colleague grow? What changed for them?"],
  [["lead", "leadership", "ownership", "own"], "Tell me about a time you took ownership of a problem nobody had asked you to solve."],
  [["stakeholder", "client", "customer"], "Describe a time you handled a difficult request from a customer or stakeholder."],
  [["performance", "optimization", "optimize", "scalability", "scale"], "Walk me through how you found and fixed a performance problem."],
  [["deadline", "fast-paced", "startup", "priorit"], "How do you decide what to do first when everything feels urgent?"],
  [["agile", "scrum", "sprint"], "How does your team plan and track work, and what would you change about it?"],
  [["test", "testing", "quality", "tdd", "unit"], "How do you decide what to test, and how do you keep quality up under a deadline?"],
  [["architecture", "design", "system"], "Describe the design of a system you built. Which trade-offs did you make, and why?"],
  [["communication", "collaborate", "collaboration", "cross-functional"], "Tell me about a disagreement with a teammate and how you resolved it."],
];

const STAR_TIP = "Answer in four parts: the situation, your task, what you did, and the result. Bring a number.";
const GAP_TIP = "Be honest. Mention anything close you have done, and how you would learn the rest.";
const THEME_TIP = "Pick one real example and tell it as a short story with a clear result.";

/**
 * Returns [{kind: "skill" | "gap" | "theme" | "general", question, tip}].
 */
export function interviewQuestions(resume, job) {
  const keywords = extractKeywords(job);
  const { matched } = analyze(resume, job);
  const skills = keywords.filter((k) => k.kind === "skill");
  const has = skills.filter((k) => matched.includes(k.term)).slice(0, MAX_SKILL_QUESTIONS);
  const lacks = skills.filter((k) => !matched.includes(k.term)).slice(0, MAX_GAP_QUESTIONS);
  const jobTokens = normalize(job);

  const questions = [
    {
      kind: "general",
      question: "Tell me about yourself, and why this role interests you.",
      tip: "Two minutes: where you are now, one or two highlights that fit this job, and why you applied.",
    },
    ...has.map((k) => ({
      kind: "skill",
      question: `Tell me about a project where you used ${displayTerm(k.term, job)}. What was your part, and what was the result?`,
      tip: STAR_TIP,
    })),
    ...lacks.map((k) => ({
      kind: "gap",
      question: `This role uses ${displayTerm(k.term, job)}. What is your experience with it, or how would you get up to speed?`,
      tip: GAP_TIP,
    })),
  ];
  THEMES.filter(([signals]) => jobTokens.some((t) => signals.some((s) => t.startsWith(s))))
    .slice(0, MAX_THEME_QUESTIONS)
    .forEach(([, question]) => questions.push({ kind: "theme", question, tip: THEME_TIP }));
  questions.push({
    kind: "general",
    question: "What questions do you have for us?",
    tip: "Ask about the team's biggest challenge this year, and how success in the role is measured.",
  });
  return questions;
}

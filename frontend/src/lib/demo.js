// An in-browser stand-in for the API, used by the public demo.
// Nothing leaves the browser. Analysis and review run for any text; the
// rewrite is a prepared example for the built-in sample only, because the
// demo has no AI model.
import { review } from "./checks.js";
import { extractFile } from "./extract.js";
import { analyze, extractKeywords, inventedTerms, rankResumes, suggestions } from "./keywords.js";
import sample from "./sample.js";

const same = (a, b) => a.trim() === b.trim();

export function createDemoApi() {
  return {
    analyze: async (resume, job) => ({ ...analyze(resume, job), review: review(resume) }),
    tailor: async (resume, job) => {
      const isSample = same(resume, sample.resume) && same(job, sample.job);
      const tailored = isSample ? sample.tailored.trim() : resume.trim();
      const after = analyze(tailored, job);
      return {
        tailored,
        before: analyze(resume, job),
        after,
        check: inventedTerms(resume, tailored, job),
        suggestions: suggestions(after.missing),
        rewritten: isSample,
        notice: isSample
          ? "This is a prepared example rewrite for the sample. The demo has no AI model connected."
          : "The demo has no AI model, so the resume is unchanged. Load the sample to see a rewrite. The analysis below still applies.",
        review: review(tailored),
      };
    },
    rank: async (job, resumes) => ({
      keywords: extractKeywords(job).length,
      results: rankResumes(job, resumes).map((r) => ({
        ...r,
        review: review(resumes[r.index].text),
      })),
    }),
    // The file is read here in the browser; it is never uploaded.
    extract: (file) => extractFile(file),
  };
}

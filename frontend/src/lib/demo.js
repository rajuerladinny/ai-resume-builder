// An in-browser stand-in for the API, used by the public demo.
// Nothing leaves the browser. Analysis and review run for any text; the
// rewrite is a prepared example for the built-in sample only, because the
// demo has no AI model.
import { review } from "./checks.js";
import { analyze, inventedTerms, suggestions } from "./keywords.js";
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
    extract: async (file) => {
      if (!/\.(txt|md)$/i.test(file.name) && !file.type.startsWith("text/")) {
        throw new Error("The demo reads text files only. Paste your resume, or run the full app for PDF and Word.");
      }
      const text = (await file.text()).trim();
      if (!text) throw new Error("No text was found in the file.");
      return { text, characters: text.length };
    },
  };
}

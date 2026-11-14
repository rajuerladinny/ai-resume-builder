async function post(path, body) {
  const res = await fetch(`/api${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error(
      typeof detail.detail === "string"
        ? detail.detail
        : res.status === 422
          ? "Paste at least a few lines for both the resume and the job post."
          : "Something went wrong. Please try again."
    );
  }
  return res.json();
}

export const api = {
  analyze: (resume, job) => post("/analyze", { resume, job }),
  tailor: (resume, job) => post("/tailor", { resume, job }),
};

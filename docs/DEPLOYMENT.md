# Deployment guide

The app ships as one Docker image that serves both the page and the API. There is no database to set up.

## Option 1: Render (full app, free plan available)

1. Fork or push this repository to your GitHub account.
2. In Render, choose **New → Blueprint** and select the repository. Render reads [`render.yaml`](../render.yaml).
3. Deploy. The app starts in mock mode: every feature works except AI rewriting, and cover letters use the template.
4. To turn on AI, set these in the service's **Environment** settings (keep the key there, never in the repository):
   - `LLM_PROVIDER=openai`
   - `LLM_BASE_URL` = your provider's OpenAI-compatible URL
   - `LLM_MODEL` = the model name
   - `LLM_API_KEY` = your key

Free instances sleep when idle, so the first visit after a while can take about a minute.

## Option 2: GitHub Pages (demo only)

The demo runs entirely in the browser with no server and no AI.

1. In the repository, open **Settings → Pages** and set **Source** to **GitHub Actions**.
2. Open **Actions → Deploy demo → Run workflow**.

## Option 3: Any Docker host

```bash
docker build -t ai-resume-builder .
docker run -d --restart unless-stopped -p 8000:8000 \
  -e TRUST_PROXY=1 \
  -e LLM_PROVIDER=openai -e LLM_BASE_URL=https://your-provider.example/v1 \
  -e LLM_MODEL=your-model -e LLM_API_KEY=your-key \
  ai-resume-builder
```

Put it behind a reverse proxy that serves HTTPS (Caddy, Nginx, Traefik, or your platform's load balancer). The container listens on `$PORT` (default 8000), runs as an unprivileged user, writes nothing to disk and has a built-in health check on `/api/health`.

## Using a local model

To keep resumes entirely on your own machines, run a model with [Ollama](https://ollama.com):

```bash
ollama pull llama3.2
LLM_PROVIDER=openai LLM_MODEL=llama3.2 uvicorn app.main:app
```

Inside Docker, point `LLM_BASE_URL` at the host, for example `http://host.docker.internal:11434/v1`.

## Production checklist

- [ ] Served over HTTPS
- [ ] `TRUST_PROXY=1` when behind a proxy or load balancer, so limits apply per visitor
- [ ] AI key stored in the host's secret settings, not in the repository
- [ ] `TAILOR_LIMIT` set to what your AI budget can absorb; a spending cap set with your AI provider
- [ ] A privacy notice that says resumes are not stored and names the AI provider, if any
- [ ] `/api/health` monitored (it returns `{"ok": true, "version": ..., "ai": ...}`)
- [ ] One server process, or accept that limits are counted per process (they are kept in memory)

## Updating

Pull the latest `main`, rebuild the image and restart the container. Render redeploys automatically on each push when `autoDeploy` is on.

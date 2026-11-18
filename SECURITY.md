# Security Policy

## Reporting a vulnerability

Please do **not** report security problems in public issues or pull requests.

Use GitHub's private vulnerability reporting: open the repository's **Security** tab and choose **Report a vulnerability**. Include steps to reproduce with made-up data and describe the possible impact. Never include real resumes, personal data or credentials. If that option is not available, contact the repository owner privately through GitHub.

Please allow reasonable time for a fix before any public disclosure.

## Supported versions

Security fixes are made on the `main` branch and included in the next release.

## Scope and design

The app is built to hold no personal data:

- The server stores nothing. Resumes and files are processed in memory for a single request, and responses are marked `Cache-Control: no-store`.
- Logs record request failures by error type, never resume content.
- Uploads are limited in size and pages, and requests are rate-limited per visitor.
- The Docker image runs as an unprivileged user and writes nothing to disk.

When you self-host, you are responsible for serving it over HTTPS, keeping AI provider keys out of the repository (use your host's secret settings), and telling your users which AI provider receives their text, if any.

Reports about the following are especially welcome: ways to make the server store or log resume text, bypasses of the upload or rate limits, cross-site scripting in the page, and ways to make the AI output text that the safeguards fail to flag.

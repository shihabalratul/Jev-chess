# Security policy

## Supported versions

Only the latest release (currently **1.3.x**) receives fixes.

## Reporting a vulnerability

Please **don't open a public issue** for security problems.
Report them privately via [GitHub security advisories](https://github.com/shihabalratul/Jev-chess/security/advisories/new).
Include steps to reproduce and the affected version; you'll get a reply as soon as possible.

Things we especially care about:

- API keys or tokens reaching the extension, web pages or logs
- The backend accepting requests from origins or extension IDs it shouldn't
- Ways for a web page to trigger moves or input without the user's authorization
- Execution of page-supplied code

## Keeping your setup safe

- Keep `.env` private and out of version control (it's already in `.gitignore`).
- Bind the backend to `127.0.0.1` unless you know what you're doing.
- Set a `BACKEND_TOKEN` if other software on your machine could reach the backend.
- Review `logs/` before sharing them; credentials are stripped, but board screenshots are included.

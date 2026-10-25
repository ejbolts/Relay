# Contributing to Relay

Thanks for helping improve Relay. Bug reports, documentation, accessibility fixes and small improvements are welcome.

## Before you start

- Read [README.md](README.md) for the app overview, the [technical reference](docs/TECHNICAL-REFERENCE.md) for local setup and checks, and [AGENTS.md](AGENTS.md) for verification and release conventions.
- Search existing issues and open pull requests to avoid duplicate work. Discuss large features or schema changes in an issue before implementation.
- Bug reports should include the app version, browser/device, reproduction steps, expected behavior and actual behavior. Use synthetic examples and remove personal information from screenshots.
- Do not post passwords, session cookies, invite codes, workout records, uploads or credentials. Report security concerns privately to the maintainer; use GitHub's private vulnerability reporting if it is available on the repository.

## Make a focused change

1. Fork the repository if needed, clone it and create a feature branch from current `main`. Contributors with write access can use a branch in this repository. Keep one purpose per pull request.
2. Follow the [local setup instructions](docs/TECHNICAL-REFERENCE.md#first-local-run-mock-youtube) using Python 3.12 and Node.js 22.13+ (CI uses Node.js 22). Use mock YouTube uploads and a separate sample database, upload directory, VAPID key and session-cookie name. Never develop against real user data or a running stable checkout.
3. Follow existing React/TypeScript and FastAPI/SQLAlchemy patterns. Label fields, support keyboard navigation and small screens, and respect reduced motion. Preserve account isolation and require authentication on new APIs.
4. Add regression tests for meaningful behavior changes. For schema changes, include an Alembic migration and test an existing database upgrade; creating fresh tables is not an upgrade test.
5. Run focused checks for the changed behavior using the [development test commands](docs/TECHNICAL-REFERENCE.md#checks), and exercise changed behavior with sample data. Include a reviewed screenshot for visible changes and a short recording when a sequence is needed to explain the behavior. GitHub runs the full checks below for PRs; both check jobs must pass before merging.
6. Keep release metadata and notes accurate for user-visible changes. Coordinate the pending version with the maintainer; PR count does not determine the version. Preserve release history.

To reproduce the full GitHub checks locally, from the repository root with the development virtual environment activated:

```sh
ruff format --check backend
ruff check backend
pytest
```

From `frontend/`:

```sh
npm run format:check
npm run lint
npm run build
npm test
```

Use `ruff format backend` and `npm run format` to apply formatting. Keep generated builds, local verification logs, secrets and personal data out of commits.

## Open a pull request

Explain the concrete problem and resulting behavior, link any relevant issue, list checks you ran and attach sample-data UI evidence. Note migrations, compatibility concerns or checks you could not run. Use draft PRs for early discussion. Respond to review, keep the diff focused and rerun affected checks after changes. Maintainers handle merging and deployment separately.

New to contributing? GitHub's [contribution guide](https://docs.github.com/en/get-started/exploring-projects-on-github/contributing-to-open-source) explains the fork, branch and pull-request workflow.

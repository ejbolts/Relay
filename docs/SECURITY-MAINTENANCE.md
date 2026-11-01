# Security maintenance

The Dependency security workflow audits installed Python packages and the locked npm tree on
pull requests and main pushes. It fails on any reported Python vulnerability or a high/critical
npm advisory. Findings are evaluated for actual use; an advisory count is not a count of
independent, reachable application exploits.

## November 2026 remediation

- Browser push subscriptions accept HTTPS destinations owned by Apple, Google, Mozilla or
  Microsoft. Delivery revalidates existing records and disables redirects. New providers require
  a reviewed allowlist change; arbitrary custom push servers are intentionally unsupported.
  The allowlist relies on vendor-controlled DNS and normal TLS certificate validation. Operators
  should retain outbound network restrictions as additional protection.
- Push subscriptions are capped at ten per account. Registrations and scheduling share a limit of sixty changes per minute,
  and test alerts to three per minute, including administrators. Existing-device refreshes still
  work at the device cap. Delivery attempts are bounded to ten devices per notification.
- Pillow 13 or newer is required. Photo and screenshot readers restrict decoder formats before
  identification. Photo conversion and OCR share a two-task background worker limit; existing
  byte and pixel caps remain. These are bounded threads, not an OS process sandbox or a hard CPU
  timeout; keep the service sandbox and deployment memory limits in place.
- Server-response caches retain their initiating account and cache generation. Cleanup invalidates
  pending reads and writes, including old 401 responses. Snapshot encryption fails closed when
  no key is available, and first-use key creation is atomic in IndexedDB across tabs.
- Snapshot encryption is not a separately locked vault. The same origin can use its key in an
  unlocked browser. Unsynced workout recovery remains in localStorage and must not be described
  as encrypted. Do not clear site data before an unsynced workout reaches the server.
- CSV text that could be interpreted as a formula is prefixed with an apostrophe. Exports needing
  escaping include a `Relay text encoding` column so Relay can recover the original text on
  re-import. Unmarked older files keep their literal apostrophes. Ordinary exports retain their
  existing columns. Spreadsheet software can change CSV values when re-saving files; Relay's
  CSV is a transfer format, not a full backup or active-content document format.

## Remaining npm advisories

After moving Vitest to 4.1.12, there are no high or critical npm findings in the checked tree.
Moderate and low findings remain in ESLint/TypeScript-ESLint and Workbox build dependencies
(minimatch/glob, deepmerge, ejs/jake and serialize-javascript). They are not shipped as an exposed
test/build server by the production FastAPI application. Do not expose Vite or Vitest to untrusted
networks or execute untrusted build inputs. These warnings remain visible in the workflow.

Do not override every minimatch/glob major version to silence the report: their callers use
different APIs. The current deepmerge release is also still affected. Track compatible upstream
updates and recheck this list when changing ESLint, Workbox or Vite. Moving the whole build stack
to new major versions should be a separate compatibility change.

## Deployed 1.0 exposure

The v1.0.0 source also accepts arbitrary push endpoints, opens image formats before restricting
them and exports unescaped CSV text. Those fixes are candidates for a focused 1.0 security
backport if 1.1 is not ready to deploy. The new account-cache generation fix belongs to 1.1's
offline workflow. Source inspection does not inventory the installed server packages. Before
releasing either version, verify its exact revision and package inventory through the operator's
deployment procedure; this change does not restart or update a running installation.

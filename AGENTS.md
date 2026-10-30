# Gym logger agent instructions

Follow this repository's README and checks, together with the user's shared verification and Git synchronization instructions.

Keep server release runbooks and private operator notes local. Do not commit them or include their contents in pull requests. Consult the operator's local instructions before an explicitly authorized deployment.

## Temporary UI feedback

- Show brief action confirmations, such as "Routine saved", "Copied" or "Split updated", in a non-blocking popup/toast using the app's existing feedback components. Prefer a dismissible popup that clears automatically; do not add temporary success text inline beside buttons, above cards or beneath controls, where it persists or shifts the layout.
- Keep durable state in the relevant control or badge, such as **Active**, **Saved** or an enabled switch. Avoid adding a separate inline confirmation that repeats a button or state change.
- Keep validation errors, required input instructions and information needed to recover from a failure beside the affected field or action. Use a confirmation dialog when an action requires a decision; routine success feedback should not interrupt the user or take focus.
- Apply this to UI created or changed by the task; do not sweep unrelated screens without a request.

## Efficient development verification

- **Do not run the full frontend or backend suites locally.** GitHub's **Checks** workflow runs them on every PR and `main` push, and is the gate for full-suite regressions. Accept that a CI failure may need a follow-up fix and push.
- **Always run new and changed tests locally**, together with the tests related to changed files, using the scoped commands in [the technical reference](docs/TECHNICAL-REFERENCE.md#checks). When adding a feature, add tests for it and confirm they pass before pushing. Also run file-level formatting/lint and the typecheck for edited code. Reuse passing results while their inputs remain unchanged.
- When resolving merge conflicts, run the tests related to conflicted and auto-merged files rather than the whole suite.
- Run a full suite locally only when changing that suite's test infrastructure or configuration (for example, the Vitest setup, pytest fixtures or the **Checks** workflow), or when the user asks. To investigate a CI failure, rerun only the failing tests locally.
- Require both **Frontend checks** and **Backend checks** to pass on the current PR revision before merging; do not infer that a branch push passed CI. Report a pending remote check as pending. The workflow alone does not make checks mandatory in a GitHub ruleset or authorise changes to branch protection.
- Documentation-only edits do not require application test suites.
- Preserve meaningful recovery, account isolation, import, backup and migration coverage. Do not remove tests merely to shorten a run, lower production password-hashing costs, or replace real authentication in tests intended to exercise it.
- Visible changes still need proportionate sample-data interaction checks and reviewed feature media under the shared verification skill. CI does not replace that review.

## Private URLs in repository content and pull requests

- Keep personal Tailscale hostnames, tailnet identifiers, private IP addresses and other installation-specific URLs out of new or updated committed content, including documentation, source examples, tests and release notes. Use generic examples such as `https://gym.example.com` or loopback URLs such as `http://127.0.0.1:8000`; obtain actual deployment addresses from local configuration or `tailscale serve status`.
- Apply the same rule to PR titles, descriptions, comments and shared screenshots or recordings. Before committing or publishing a PR update, inspect the staged additions, PR text and selected evidence for private URLs; omit or redact them, including browser address bars. Do not repeat a removed private URL in commit messages or PR explanations.
- Private replies to the user may include the actual clickable local or Tailscale URL. Keep actual host/address details in private replies or local verification notes; describe the environment generically in PRs while retaining the relevant port, branch/commit and sample-data isolation details.

## Release versions and announcements

For every application feature, fix, or other user-visible change, keep `frontend/release.json` and the release notes accurate in the same change or pull request before considering the task complete. Its `version` controls whether users see the release announcement again. Versions identify application releases, not the number of pull requests.

- Advance the semantic version for each new release; never reuse a version that has already been deployed. Do not increment for each PR, merge, review fix or deployment retry. Compare the latest deployed version with the existing pending release before choosing a release number.
- **A coordinated batch of multiple PRs for an application release gets one minor version bump** (for example, `0.3.0` to `0.4.0`, resetting the patch number to zero), even when its individual changes are mostly patches. Evaluate the open GitHub PRs first, then select the batch and its shared version. All PRs included in that batch contribute to the same release notes and retain that version; do not stack their individually proposed patch or minor bumps. This batch rule takes precedence over the standalone-PR rules below.
- **For an independently released single PR, default to a patch version bump** (for example, `0.3.0` to `0.3.1`) for fixes, UI changes, maintenance and small improvements to existing features. Use a minor bump for a clear, substantial new capability or workflow, such as an account system or new end-to-end import workflow, and explain why in the PR. Prefer a patch when unclear; code size, a feature label or a new UI control alone do not justify a minor bump.
- Once the batch version is assigned, follow-up corrections and additional PRs included in that same pending release retain it until deployment. An already pending minor release can become the batch release without another bump; consolidate any unpublished patch notes into it and preserve notes for deployed releases. Choose the version manually in `frontend/release.json`; the build validates and publishes this metadata but does not increment versions automatically.
- When a new version replaces an already deployed release in `frontend/release.json`, first move that deployed entry to the top of `frontend/release-history.json` so the app's **Earlier versions** list keeps it. History must stay newest first and older than the current version; do not add unpublished pending versions.
- Update the title, summary and changes to describe the release accurately. Keep the GitHub URL pointing to the matching release notes, and update `docs/RELEASE-NOTES.md` with those notes.
- **Lead release notes with feature media.** Put screenshots and animated GIFs together after the release heading, date and title, before change bullets or detailed feature descriptions. Embed them as images with descriptive alt text and captions so readers can see them inline. Apply this order to the app's What's new view, `docs/RELEASE-NOTES.md`, published GitHub Release notes and the feature-media section of release-preparation PRs, including future changes.
- **Publish recordings as GIFs.** Convert selected MP4/WebM feature recordings to short, looping animated GIFs before attaching them to PRs or release notes. Use the real reviewed recording, preserve the interaction and final result, and keep text readable while reducing dimensions/frame rate and using an optimized palette to control file size. Decode and visually review the final GIF for content, timing, corruption and private information; a file extension change or still frame is not a conversion. Use an inline `![descriptive alt text](commit-pinned.gif)` embed instead of a video download link or player. Keep original recordings locally and preserve already published URLs; do not delete old media commits just to replace an attachment.
- For a visible feature or UI improvement, include one or more reviewed screenshots when practical. Capture the verified revision using the isolated sample-data environment, inspect each image for secrets or personal data, and commit release screenshots under `docs/screenshots/releases/` with versioned filenames. Embed them in that release's notes with descriptive alt text and captions. For changes with no visible result, or when capture is unavailable, explain the omission in the notes or pull request.
- **Release notes and PRs may include multiple screenshots.** One screenshot is a verification default, not a maximum. Use additional screenshots when they help show distinct changes, screens, states or before/after comparisons; give each image a clear caption and avoid redundant captures. Apply the same review, privacy and evidence-hosting rules to every image.
- To show the screenshot in the app's announcement, set the optional `image` object in `frontend/release.json` with `url` and `alt`. Use the direct HTTPS `raw.githubusercontent.com` image URL pinned to the screenshot's committed revision, rather than a GitHub page URL or temporary local browser artifact. Verify the image loads for app users without signing into GitHub; the announcement must remain usable if it cannot load.
- Documentation, tests and internal tooling changes that do not affect application behavior do not require a version bump.
- A bare `git pull` does not rebuild the frontend. Follow `deploy/update.sh` and the deployment guide when an application deployment is authorized; updating release metadata does not authorize restarting or updating the stable app.

## Preparing release notes before deployment

Before pinning an authorized deployment revision, inspect the selected feature PRs and the intended release's notes and media. Convert selected recordings to GIFs, place all feature images/GIFs before the change bullets, and reconcile the version, history, notes and image links for the selected batch. Reuse reviewed media when it still shows the final behavior; do not record unrelated journeys just for release preparation.

Update the existing feature or coordinating PR when it is still open. If the application changes have already reached `main` and release-note/media corrections are needed, create a focused release-preparation PR with the converted GIFs, ordered notes and any required announcement metadata. Commit release media under `docs/screenshots/releases/` with versioned filenames; use the permanent `pr-media` branch for PR-only evidence. Pin shared raw image/GIF URLs to their media commit and verify access for the intended readers. Keep the selected pending release version; preparing notes/media alone does not create a new application release.

Review the final notes and rendered media, run checks proportionate to any changed metadata or code, and obtain the required PR approval and merge authorization before merging. An open preparation PR is not deployable release content. After its approved merge, fetch, select the exact `main` revision containing the prepared notes/media, and verify that revision before deployment. Preserve published tags and media links. Creating or merging this PR does not itself authorize deployment or a stable-app restart.

## GitHub releases and tags

Each deployed application version gets a Git tag and a published GitHub Release, so the repository's **Releases** page records exactly which commit each version shipped from.

- Name the tag `v` plus the `frontend/release.json` version (for example, `v0.6.0`), and use that release's `title` as the GitHub Release title. Publish it as a normal release marked latest, not a pre-release or draft.
- Create the release as part of an authorized deployment, after the server is updated, on the exact `main` commit that was deployed. That commit must contain the matching `frontend/release.json` version. Merging a PR or batch alone does not authorize tagging or publishing a release, and do not tag pending versions or feature branches.
- For example: `gh release create v0.6.0 --target <deployed main SHA> --title "<release.json title>" --notes-file <notes> --latest`. Write the notes file outside the repository from that version's section of `docs/RELEASE-NOTES.md`. Keep the images/GIFs before the change bullets, use inline image embeds, and change relative media paths to `raw.githubusercontent.com` URLs pinned to the tagged commit. Confirm the published notes display the images/GIFs in that order and apply the private URL rules to the notes.
- Treat published tags as permanent. Never move, delete, force-push or reuse a version tag; a fix after release ships as a new version with its own tag. Correcting a published release's notes text is fine.
- Keep the `url` in `frontend/release.json` pointing at the version's `docs/RELEASE-NOTES.md` section, since that link must work before the GitHub Release exists.

## Reviewing and merging a PR batch

Before merging a batch into `main`:

1. Fetch and inspect the repository state under the Git synchronization instructions. Query the attached GitHub repository for its currently open PRs, including drafts and stacked PRs, rather than relying on an earlier list or only the PR mentioned in chat. Paginate if necessary so the evaluation includes all open PRs.
2. Review each candidate's purpose, diff, base branch, dependencies, verification evidence, check/review status, mergeability and proposed release metadata. Identify overlapping changes, conflicts and PRs that would overwrite another PR's version, notes or screenshots. Exclude or defer drafts and unready PRs; an open PR is not automatically part of the batch or authorized for merging.
3. Within the user's authorized merge scope, record the selected PR numbers, merge order, exclusions and shared release version in a batch plan or coordinating PR. Use one minor bump for an application-release batch. A batch consisting entirely of documentation, tests or internal tooling with no application behavior change needs no app version bump.
4. Reconcile `frontend/release.json`, its GitHub link and `docs/RELEASE-NOTES.md` into one coherent announcement covering the whole batch. Preserve deployed release history and screenshot references. Resolve competing version edits to the selected batch version, rather than accepting successive increments from each PR.
5. Verify the combined code at a fixed revision before declaring the batch ready. Perform integration at a task boundary and rerun affected checks after any code changes. During merging, re-check the next PR's current head, checks and conflicts as earlier merges can affect it; keep the batch version unchanged. Finish by confirming `main` contains the selected changes and matching release metadata. Merging a batch alone does not authorize deployment or a stable-app restart.

## Deleting branches after merging

After merging a PR or branch into `main`, delete its head branch on GitHub (and the local branch, when no worktree or other agent is using it), then run `git fetch --prune`.

- For stacked PRs, retarget each child PR to `main` (or merge them bottom-up) before merging and deleting its parent. A child merged into a parent branch after the parent has already reached `main` never reaches `main` itself, even though GitHub shows it as merged.
- Delete a branch only after confirming that its current head reached `main`: it is an ancestor of `main`, or it matches the head of a PR merged into `main` (squash merges). Keep a branch that has commits newer than its merged PR, and report it instead.
- Keep one permanent `pr-media` branch for reviewed PR screenshots and recordings, organized in a folder for each task. Reuse it for every PR; do not create separate `media/*` branches, and never merge the media branch into application branches.
- Pin published media URLs to committed revisions. Delete legacy `media/*` branches only after preserving their full commit history on `pr-media` and confirming that existing published links still work.

## Private Tailscale endpoints

- **443 -> 3773: T3 Code.** Leave this route untouched; it does not belong to the gym app.
- **8446 -> 8000: stable gym logger.** Preserve the stable running build and real data. Use the repository's existing startup instructions.
- **8447 -> 8001: feature verification.** This is the reserved verification route. Inspect the actual backend and isolate sample data, credentials, push keys and build output before using it. The profile launchers were reverted.

The separate PowerShell profile launchers were reverted; do not assume they exist or that `start-app.ps1` isolates test data. Verification must never use or copy real workout records, uploads or credentials. Do not build into or automatically pull a running stable checkout. Keep the tested revision fixed during verification and rerun affected checks after changes.

Use **private Tailscale Serve**, with local app servers bound to loopback. Do not enable public Funnel. Inspect `tailscale serve status` before changing a route; never reset the full configuration or replace another project's endpoint. The three-port Funnel restriction does not apply to private Serve.

Retired MainPC routes (removed 10 October 2026): **8444 -> 8088** (Calorie Tracker), **8445 -> 5174** (old gym Vite preview), **8886 -> 8000** (gym alias), and **8443 -> 3000** (owner unconfirmed). Do not recreate them unless explicitly requested. MainPC now has only 443, 8446 and 8447 configured. Inspect other hosts independently.

Git synchronization does not authorize starting, rebuilding, restarting or promoting the stable app. For private verification evidence, report the actual host, HTTPS port, branch/commit (and any uncommitted edits) and data environment. For PRs and committed documentation, use a generic host as described above. Follow the shared verification skill for checks and required screenshots or recordings.

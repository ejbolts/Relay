# Feature release fragments

Each user-visible feature or fix owns one uniquely named JSON file directly in this
directory, such as `machine-weight-mapping.json`. Update that file while the feature
is being reviewed. Do not edit another feature's fragment, the combined announcement
or release history from an ordinary feature PR.

The release coordinator selects and assembles contributions once. A fragment does
not choose a version, authorise a merge or deploy anything.

## Feature author

1. Fetch and inspect open PRs before coding. Identify overlapping components and
   dependencies; sequence work in the same area or explicitly stack a dependent PR.
   Record the dependency and base in the PR. Use an owned task branch and worktree.
2. Create a lower-case, hyphen-separated fragment filename. Use this format:

   ```json
   {
     "title": "Machine weight mapping",
     "changes": [
       "**Machine trends:** Select a machine to see its sessions, or compare optional normalised weights."
     ],
     "media": [
       {
         "title": "Compare machines",
         "description": "Select a machine, adjust its conversion and inspect the combined trend. Isolated sample data.",
         "image": {
           "url": "https://raw.githubusercontent.com/ejbolts/Relay/FULL_40_CHARACTER_MEDIA_COMMIT/docs/screenshots/releases/1.2.0-machine-weights.gif",
           "alt": "Switching machines and adjusting a conversion with the resulting sample trend."
         }
       }
     ]
   }
   ```

   Replace the example URL with the actual reviewed image/GIF's full commit-pinned
   URL. Commit release media under `docs/screenshots/releases/`, using the assigned
   pending version when known. A media commit can precede the fragment so its URL
   stays pinned. Preserve published URLs. Keep PR-only evidence on `pr-media`.
   Multiple screenshots can show useful distinct states; a GIF replaces screenshots
   for the same feature. Split distinct features into separate fragments.

   For a change with no visible result, omit `media` and supply a short
   `"mediaOmission": "No visible UI; this fixes retry handling."` instead. An omission
   reason records the exception; it does not waive required visual verification for
   visible changes. Internal tooling and documentation do not need a fragment.
3. Validate pending fragments from the repository root:

   ```sh
   python backend/tools/release_fragments.py check
   python -m pytest backend/tests/test_release_fragments.py
   ```

   CI's backend tests also validate all pending fragments. The validator checks
   fields, accessible text, pinned media paths, common private URL patterns and the
   one-format rule. It cannot prove that media was reviewed or is accessible; inspect
   it and verify access separately. Keep private records and installation URLs out.
4. Include the fragment path and selected reviewed feature media in the PR. State
   the existing pending release if assigned, without editing shared release files.

## Release coordinator

Use one coordinating thread/PR for a release batch. Record its owner, selected PRs,
dependencies, merge order, exclusions and shared version. Only the coordinator edits
`frontend/release.json`, `frontend/release-history.json` and `docs/RELEASE-NOTES.md`
for that release. A standalone release can have the feature owner act as coordinator
after feature integration; it follows the same finalisation steps.

Render only explicitly selected, ready fragments in the intended display order:

```sh
python backend/tools/release_fragments.py render machine-weight-mapping profile-photo
python backend/tools/release_fragments.py render machine-weight-mapping profile-photo --format json
```

Both commands print contributions to stdout and never modify source files. Markdown
puts all selected media and captions before change bullets. JSON provides `changes`
and optional `highlights` in the app's existing format. Selection order is preserved;
unselected features are excluded. Redirect output to a local scratch file if useful,
never directly over the complete announcement or release notes.

1. Reconcile these contributions with the existing pending release. Preserve its
   entries and published media; deduplicate corrections and decide the final order.
   Write one concise title and summary, select the primary fallback image and keep
   all feature media before descriptions/bullets in the final notes. The renderer
   produces contributions, not a complete release or an automatic version bump.
2. Apply the repository's version policy once: compare against the latest deployed
   release, retain an assigned pending version and use one minor bump for a batch.
   Archive the previous announcement in `frontend/release-history.json` only when it
   was deployed. Preserve history and the matching GitHub notes anchor.
3. Review the combined announcement and media, verify media access without GitHub
   sign-in, and run affected announcement tests and the frontend build. Keep normal
   feature verification, current CI and approval gates. A clean text merge does not
   establish behavioral compatibility.
4. In the same finalisation PR, move consumed fragments to
   `release-fragments/archive/<version>/`. Keep deferred fragments pending. Archived
   fragments retain their original reviewed content and media URLs; corrections
   after finalisation belong to the coordinator. Check the diff for lost entries.
5. Merge only within explicit user authorisation. After each authorised merge,
   recheck remaining PRs and update affected branches at safe task boundaries. Do
   not rewrite an active thread's checkout or refresh every clean branch. One owner
   handles integration; consult the feature owner when behavior needs reconciling.

Finalisation must reach the exact selected `main` revision before deployment. Release
fragments, rendered output and a merged feature alone are not deployable release
metadata. Deployment, tagging and stable-app restarts retain their existing approval
and operator-runbook requirements.

## Transition for the pending release

The existing 1.2.0 announcement and older history stay intact. Already open feature
PRs may still contain shared release edits; their owner and the coordinator should
convert those contributions at a safe task boundary, preserving notes and media.
New feature PRs use fragments immediately. Do not recreate fragments for every
already integrated feature; reconcile new contributions with the current notes.

# PR media

Screenshots and recordings referenced by pull request descriptions. This branch is never
merged into `main` and must not be deleted.

- Add each PR's reviewed media in its own folder, such as `onboarding-import-guide/`, as a new
  commit on this branch. Do not create separate `media/*` branches.
- Link files with `https://raw.githubusercontent.com/ejbolts/Gym-logger/<commit SHA>/<path>`
  pinned to the commit that added them, so later commits never change a published link.
- Folders named after the former `media/*` branches hold their final files. `legacy/` holds
  older files that PR descriptions link to. This commit's parents keep every previously
  linked commit reachable, so existing PR links keep working.
- Use sample data only, and check media for private addresses before publishing.

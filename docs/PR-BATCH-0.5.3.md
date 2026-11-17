# Gym Logger 0.5.3 consolidation

Selected all four open, non-draft PRs after fetching on 13 October 2026. Each targets `master`; none has a required GitHub check, review objection or unresolved review comment. No PRs are excluded.

| Integration order | PR | Reviewed head | Purpose |
| --- | --- | --- | --- |
| 1 | [#23](https://github.com/ejbolts/Gym-video-logger/pull/23) | `28d442137c0f136aae9579f2a08c8cd74f5164a6` | Custom exercise labels and account isolation |
| 2 | [#24](https://github.com/ejbolts/Gym-video-logger/pull/24) | `cf41a70cb48c54ed4c43abcae7391522fcfa9025` | Strict weight/volume records and popup countdown |
| 3 | [#25](https://github.com/ejbolts/Gym-video-logger/pull/25) | `cc5d648ead94e01385b5120b652b5f91d1ef8f20` | Profile visibility, sharing and follow requests |
| 4 | [#26](https://github.com/ejbolts/Gym-video-logger/pull/26) | `fc07c67492656ff3ec935cd4e953b150cc6855d6` | Editing the actual Home cards |

Integrate from `master` at `00d52f4`. Start with the smallest change, then the shared record calculations, profile navigation and finally the larger Today layout refactor. No source dependency requires a different order. The trial integration finds conflicts only in `frontend/release.json` and `docs/RELEASE-NOTES.md`; overlapping application code merges automatically and needs combined regression checks.

The user explicitly capped and approved this batch at **0.5.3**, overriding the default release-number rule. The public deployed `https://gym-logger.duckdns.org/release.json` reports **0.3.0** at review time. Consolidate the unpublished 0.4.0, 0.4.1 and 0.5.0 proposals into one 0.5.3 announcement; preserve deployed history and existing screenshot references. Do not increment again for review fixes or the merge.

Use one consolidation PR containing merge commits from these exact heads. Merge it with a **merge commit**, not squash or rebase: all four original PR heads remain ancestors of `master`, allowing GitHub to recognise the original PRs as merged. Recheck original heads, mergeability, reviews/checks and current `master` before merging. Any new source change invalidates the affected combined verification.

Required combined verification: repository formatting/lint checks, production frontend build, full frontend/backend suites, fresh schema and upgrade from a synthetic pre-sharing schema, and isolated phone-width UI checks of Home editing, custom labels, record popups and profile-sharing/follow transitions. Review final screenshots and short real interaction recordings for card motion and transient record popups. Keep all records, credentials, uploads and build output separate from stable installations.

Combined verification reconciles the sharing fixture with strict PR semantics: its first set is a baseline and its second set earns a real Volume PR. Live verification also found an existing Progress summary mismatch, which combined the maximum weight and maximum reps from different sets. Keep weight, reps and RPE paired to the heaviest set, while retaining an independently calculated best estimated 1RM; cover the mixed-set and equal-weight cases with a regression test.

Merging this batch does not deploy, rebuild or restart the stable application. Deployment later requires migration `0033_profile_sharing` in addition to the already pending `0031_app_feedback` and `0032_profile_photos` migrations.

The user subsequently requested the fullscreen graph fix. Integrate only original commit `4c3c6d7cab5463cd86828e11a47ca34817819981` into the same unpublished 0.5.3 release, after the initial batch merge at `f948808`. Later commits on that source branch change Home cards and calendar totals and are excluded from this focused follow-up. The public app still reports 0.3.0 before the follow-up merge. Verify the original graph fix against the combined app and retain all existing release notes and announcements.

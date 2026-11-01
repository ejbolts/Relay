# Historical feature decisions

Reviewed against `main` on 1 November 2026.

## Retired

The following work from the old #36–#39 stack is intentionally excluded from recovery:

- Compact workout logging.
- The old routine-success toast proposal.
- Workout set rows following the pointer during drag.
- The first-run welcome and sample-data banner.
- The “fat-energy equivalent” wording proposal.
- The old refused-save guidance proposal.

Those PRs are already closed as merged into their historical stack. That status does not
mean all their changes reached the current `main`. Do not reopen or recover this stack.
Preserve current features that shipped separately, including save recovery and filters.

## Recovered separately

- Home's **+N more** loads three more friends inline and retains the expanded list during
  refreshes. This is already in `main`.
- The **Run** reaction from local commit `3446c72` is recovered independently, using a new
  migration after the current schema rather than the obsolete migration number.
- Rest timer pause/resume, the slim rest bar and the pause control beside the live time
  reached `main` through #152.

## Still awaiting a decision

- **Stale-edit conflict protection:** local commit `612381c` includes revision checking and
  a conflict choice dialog. The current retry-safe finish flow prevents duplicate creates,
  but does not prevent a stale edit from overwriting a newer saved workout.
- **Manual correction of an active workout's time:** uncommitted work remains in the
  `feature/cardio-session-time-controls` worktree. The new pause feature covers pause/resume;
  live time correction is still absent. Saved workouts already have timing editors.

Keep these two items separate from the retired stack; neither is included by this decision.

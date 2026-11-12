# Relay technical reference

Setup, maintenance and detailed behavior for contributors and administrators. For a plain-language app overview, see the [README](../README.md). Commands below run from the repository root unless stated otherwise.

## Detailed app behavior

Per-exercise partial-set choices are saved in `exercise_partial_set_weeks` (migration `0047_weekly_partial_sets`). `PATCH /api/exercises/{id}/partial-sets` accepts `partial_sets_enabled` and optional `week_start`; dates normalize to the account's week start, default to this week and cannot be in future weeks. Each change carries forward until a later explicit change; the original `exercises.partial_sets_enabled` is retained as the legacy baseline. Responses expose that baseline as `partial_sets_default`, the dated changes as `partial_set_weeks`, and the effective current choice as `partial_sets_enabled`. Weekly totals, contribution details, recommendations and muscle-volume date ranges resolve the choice on each workout date. Backups include the account-owned history. `default_muscle_set_credits` retains the full mapping for help and filter choices; exercise filters use current effective credits, and pagination starts at ten rows. Direct credits and original logged sets are preserved.

A private, multi-user mobile PWA for batching individual gym-set videos, stitching them locally, and uploading one unlisted workout video to YouTube by default. Each person signs in with their own account and a cookie session, and new accounts share their workouts and cardio publicly with sharing members by default; existing accounts retain their visibility choices. The first account created becomes the admin and claims any existing data. The admin console (Settings → Help & about → Admin console) lets the admin disable accounts, see each account's activity and storage, check disk space and the video queue, and switch video uploads (off, admins only, or everyone) and new sign-ups on or off without a restart. Video uploads are admin-only by default.

The app also includes a structured, dark, mobile-first workout tracker: an exercise library, set/reps/weight logging, RPE and rest tracking, per-set notes, a live rest timer, workout history, a colour-coded training heatmap, weekly muscle-set tracking, and per-exercise progression charts. Reusable machine photos can be captured from a phone, captioned, pinned to an exercise in a particular workout, and expanded from History. Workout records and photo metadata live in the local SQLite database independently of the optional video workflow; processed photo files live under `data/machine-photos/`.

**Equipment photo > Select** opens a multi-select grid. Merge at least two saved machines from
one exercise, choose the cover and future settings to keep, then confirm the name. Migration
`0045_merged_machine_photos` retains all original image rows and files under one canonical machine.
Merging transfers and deduplicates workout links without altering recorded workout settings;
older draft photo IDs resolve to that canonical machine when saved. Repeated merges flatten
existing groups, and account backups retain the group and every image. Shared group images
follow the owner's existing machine-photo visibility and access checks.

Weekly muscle-set tracking excludes warmups and cardio, reports raw and RPE-aware effective sets for each active muscle group, and shows unrated or lower-effort sets separately. Today's bars compare raw working-set credits with one account-owned weekly goal per muscle, configurable in Settings > Training > Units & weekly goals and defaulting to 10. Primary and secondary muscle credits keep their existing weighting; the goal does not change set counting or workout recommendations.

The [exercise muscle-credit audit](EXERCISE-MUSCLE-CREDITS.md) documents the built-in
direct (1.0) and assisting (0.5) defaults, source references and variant assumptions.
Startup refreshes changed built-in mappings and their account's workout-cache revision;
custom exercises retain their saved contributions.

Personal records have two types: **Weight PR** for a heavier completed working set for an exercise, and **Volume PR** for more reps in one set at a previously logged weight for that exercise. First attempts establish a baseline. Ties, total session volume, warmups, incomplete/zero-rep sets, and failed sets below their target do not trigger records. A short popup names the record when a set is completed. Estimated 1RM remains a Progress metric.

Training blocks are account-owned JSON in `user_settings.training_blocks`, included in account backups. `/api/training-blocks` supports GET/POST and PUT/DELETE by block ID; blocks are only created by the user. Blocks accept an optional inclusive `planned_end_date` after the start, used only for the Home card's days left. Responses add derived `workout_count` per block, `earlier_workout_count` and `history_start`; these are counted on read and never stored. Starts are unique, cannot be future dates and use the workout's saved calendar date; the next start is the previous block's exclusive end. Progress library/detail requests accept optional `block_id` and reuse the existing charts and machine views. `personal-records?include_blocks=true` adds derived block events using the same eligibility rules as lifetime records, returning `scope`, `block_id` and `block_name`; all-time events win duplicate set/type achievements. Block events are derived from current history so edits, imports and boundary changes do not leave stale records. Condensed exercise history includes `block_bests` for live PR checks while retaining unrestricted previous-set suggestions. Block mutations bump the shared training revision for cross-device refresh. Browsing a block changes only progress views, never the date-based scope used by the workout logger. `GET /api/training-blocks/{id}/summary` returns a block's workout, working-set, volume and PR totals (strength movements only; PRs counted as when browsing the block) next to the last regular block before it, derived on read from the days each block owns up to today. Blocks accept an optional `deload` flag: a deload's summary has no comparison and later blocks compare with the last non-deload block. Older apps omit `deload` when saving a block, so an update that leaves it out keeps the saved value. Once the day after a block's planned end arrives, Home's Training block card shows **Finished** and opens this summary with **Start next block** (name and 8/12-week or open end, starting today) and **Deload week first** (a 7-day deload block starting today).

Completed workout set history can be imported and exported from **Settings > Data & connections > Import & export** using CSV. Uncompleted planned or suggested rows are excluded, so importing an export cannot turn them into performed sets. Exports write `Date Lifted`, `Exercise`, `Weight (kg)`, `Weight (lb)`, `Reps`, `Bodyweight (kg)`, `Bodyweight (lb)`, `Percentile (%)`, `Warmup`, `Workout ID` and `Workout name`. Imports need a header row and one row per completed set; only `Date Lifted`, `Exercise` and `Reps` are required columns. The others are optional, and a file with neither weight column imports sets without weights and shows a warning. Column names match regardless of case and spacing, and order does not matter. Unrecognized columns are ignored and listed in the review; a known column that appears twice is rejected. `Workout ID` and `Workout name` keep separate sessions on the same date apart. IDs group rows within the file; importing always creates account-owned records with new IDs and never uses a supplied ID to overwrite a workout. Files without Workout ID remain valid, but all rows on one date become one session because they contain no session identity.

Workout exports also include `Exercise kind`, `Duration (seconds)`, `Distance (km)`, `Calories (kcal)`, `Average heart rate (bpm)`, `Speed (km/h)` and `Incline (%)`. Missing measurements stay blank; recorded zeroes remain zeroes. Cardio session totals and averages are separate from individual sets: `Cardio session calories (kcal)`, `Cardio session average heart rate (bpm)`, `Cardio session distance (km)`, `Average speed (km/h)`, `Cardio session incline (%)`, `Average power (W)` and `Average METs`. Session values repeat on each set of that cardio movement and must agree; do not sum these repeated totals. These fields survive reimport, including values recorded only on the cardio session. Session-level measurements require a cardio exercise with at least 60 seconds of completed duration. The same account and inclusive date filters apply to workouts and cardio. Linked cardio is exported through its completed workout sets once; older standalone cardio uses one row with a `cardio:` Workout ID and imports as a cardio-only workout, with the usual duplicate checks, account ownership, limits and import undo. No real workout is created by exporting.

Imports accept UTF-8 comma-separated or semicolon-separated CSV and tab-separated text copied from a spreadsheet, up to 20 MB. Dates must start with `YYYY-MM-DD`; a following time of day, such as `2026-10-17 07:30:00`, is ignored. Numbers accept a decimal point or a decimal comma with one or two decimal places (`82,5`); values with units, such as `80kg`, are rejected. `Warmup` accepts 1/0, true/false, yes/no or y/n. When only `Weight (lb)` or `Bodyweight (lb)` is filled, it is converted to kilograms and one summary warning gives the row count. Choose Strength Level, Hevy or Strong to import the original app export without renaming columns. Strong workout units are explicit; measurement files read their own units. Choose Relay for native workout or bodyweight CSVs, including Gym Logger exports, and template spreadsheets. The in-app CSV guide explains this layout and downloads a template in the person's weight unit.

Relay and Gym Logger bodyweight exports are detected automatically in the same import picker. They require `Date` and `Weight (kg)`, with optional `Body Fat (%)` and `Notes`. The shared review shows check-in totals and skips existing dates, including dates created after preview. Missing entries retain body-fat values and notes. Select **Relay > Export data** to choose completed workout history, bodyweight check-ins or both plus one date range. Both prepares two labelled CSV files before starting either download. The range ends at the latest entry among the selected data types. CSV exports are history transfers, not full account backups.

Choosing a file opens a read-only review of sessions, sets, new exercises, duplicates and warnings. **Cancel** saves nothing. **Save import** revalidates the file and current limits, skips identical existing sessions in your account, and atomically adds the remaining sessions and any missing exercises. Repeated identical sets within a session are retained. Duplicate matching uses the date and completed set content, including supplied cardio metrics, so renaming a workout does not cause a duplicate. To preserve separate same-date sessions with identical sets, include them together with different Workout IDs in one file; importing identical sessions through separate files may skip them as duplicates. Exercise aliases are compared by canonical name and pound-only legacy weights are converted to kilograms. Existing workouts and body-weight check-ins are kept; only missing body-weight dates are added from imported sets. CSV covers these set fields, cardio measurements and session names, rather than notes, photos, videos or a complete account backup.

Choose kilograms or pounds in **Settings > Training > Units & weekly goals** for weight entry and display across Home, the workout logger, History, Body, Progress and shared profiles. Changing this preference preserves saved weights and active entries. Workout CSVs keep both kg and lb columns; bodyweight CSVs continue to use the explicit `Weight (kg)` column regardless of the display preference.

On a fresh workout database, the app seeds five sample sessions across one week so the dashboard, heatmap, history, and progression graphs can be evaluated immediately. Set `GYM_SEED_SAMPLE_DATA=false` before first startup to disable this. Seeded workouts are labelled **Sample**; **Remove samples** in History deletes all of them without affecting real workouts or video sessions, and they will not reappear after a restart.

Long training logs load in windows. At startup the app requests `/api/dashboard?calendar_start=` and `/api/workouts/snapshot?start=` from the first day of the month two months back. After an interactive sign-in, the app mounts beneath the sign-in screen while it plays its exit animation (`AUTH_EXIT_MS`), so these requests overlap the animation. The dashboard's `history` summary (total, first and last workout dates, sample flag) tells the client whether older data exists. Scrolling a calendar past its oldest month, or choosing Show more after revealing the loaded History workouts, fetches the previous six months from `/api/workouts/snapshot?start=&end=` and `/api/calendar?start=&end=`. Streaks and the next-workout rotation still read the whole log on the server. The workout logger's PR badges and previous-set suggestions add `/api/exercise-history-baselines?before=`, a per-exercise summary of everything older than the startup window. Requests without these parameters still return the full history for clients that have not refreshed.

Training stays current across signed-in devices with a lightweight account revision check every five seconds while visible, plus checks on focus, returning to the app and reconnecting. Unchanged revisions reuse the current screen; changed revisions refresh the loaded history window, dashboard, body measurements and records, along with open progress, cardio, body-goal and own-profile views. Failed reads, and slow reads answered from the device's saved offline copy, are retried without acknowledging the revision. Unsaved logger entries remain separate from refreshed saved history. This synchronizes saved training; it does not transfer an in-progress workout between devices or merge simultaneous edits to the same workout.

Finishing a workout returns to Home immediately; saving an old workout returns to Sessions while the request continues. The saving/updating indicator, routine notifications and workout-completion PR summary leave navigation and scrolling available. Routine notices and completion records dismiss themselves after eight seconds and can be closed earlier. Save failures retain the logger entries for retry and preserve a screen the person has moved to.

The first working path is YouTube mock mode. It accepts a batch, processes it with local ffmpeg, and returns a deterministic mock YouTube URL without any Google credentials.

Workout types belong to each account. **Settings > Training > Workout types** manages built-in and custom
names/colours; removing a type archives it so saved workouts retain their identity. Custom types
use a separate nullable workout-type association while exercise categories remain unchanged.
Migration `0036_workout_types` adds the catalog and association; run migrations before using
the updated backend. CSV exports include optional `Workout type` and `Workout type color`
columns, and account backups include the catalog. Calendar days expose type metadata for
custom dots and legend controls; the calendar uses seven day columns without weekly set totals.

Each workout type can also hold saved exercises, independent of any split. They are stored as the
`type_exercises:<type id>` account setting (the same movement and planned-set shape as a split day)
and served by `GET /api/workout-type-exercises` and `PUT /api/workout-type-exercises/{type_id}`;
saving an empty list clears it. Exercise merges rewrite these lists like split days. Starting Up
next uses a split day's exercises first, then the type's saved exercises, then the last session of
that type. Choosing a type for a workout with no exercises yet fills in its saved exercises.

Accounts use a username and password; no account email is collected. Usernames are case-insensitive, 3–32 ASCII letters, numbers, dots, underscores or hyphens, and start with a letter or number. The separate Name field is how you appear in the app. You can change both in Profile, where you can also add, change or remove a profile photo. Photos are cropped to a 512 px square, stored under `data/profile-photos/`, visible according to profile sharing choices, included in account backups and deleted with the account; run migration `0032_profile_photos` before restarting the backend. An admin can reset a forgotten password with `python -m app.manage reset-password --username yourname`.

Each account chooses who can see its profile in **Settings > Account & privacy > Profile sharing**: **Private**, **Friends only** (its friends; stored as `followers`) or **Public** (every sharing member; the default for newly created accounts). Existing accounts without stored choices remain private. Only accounts that share can open **Shared profiles**, send friend requests, and accept, decline or remove friends. Workouts, cardio and the profile photo are always part of a shared profile; a friends-only profile shows only its name and photo until the two members are friends. Machine photos (those pinned to shared workouts), body weight (including body weight logged with sets), goals (the active body-weight goal and weekly Zone 2 target) and notes are separate opt-ins. Usernames, videos and sample data are never shared. Going private hides the profile from other members and hides other profiles immediately while keeping choices and friendships. The owner can still view their own training profile without enabling sharing; the shared content choices also apply to this preview. Profile retains name, username and photo editing, the calendar, training totals and workouts. Settings holds sharing choices, account UUID, password, sign-out and account deletion. Friend requests always need accepting, including for public profiles. Disabled accounts are hidden and admins have no extra access. Migration `0033_profile_sharing` (release 0.5.3) adds the `profile_sharing` table, which account backups include, and `profile_follows`, which they leave out because follows involve other accounts. Both are deleted with the account. Migration `0037_follow_notifications` adds a per-follow dismissed flag. Migration `0040_friendships` (release 0.10.0) replaces `profile_follows` with `friendships`: one row per pair, stored with the lower account id first, plus the requester, status, dates and a notification flag. An accepted follow in either direction becomes a friendship; pairs with only pending follows keep the earliest request. Friendships are excluded from account snapshots and deleted with either account. The notification bell shows friend requests waiting for you and your requests that were accepted, refreshes immediately through the signed-in WebSocket while connected, on focus and reconnection, and every 30 seconds while visible as a fallback, and lets you accept or decline. Existing friendships are marked seen during upgrade; accepting a request notifies only the requester.

Friend QR codes hold an ordinary app link, `https://gym.example.com/#friend=<account id>`, so any phone camera can open them without the app installed. The account id is used because usernames can change. On load (and on `hashchange` in an open app) the frontend moves the invite into this tab's `sessionStorage` and removes it from the address bar, so it survives a reload, signing in and creating an account. Once signed in, the app sends that member a friend request (the normal `POST /api/sharing/friends/{id}`, which accepts their request if they had already asked) before opening their profile, and shows a toast with **Undo** that cancels the request. Existing friends and sent requests are left unchanged; if sending fails, the profile keeps **Add friend**. Scanning your own code opens your Profile. The invite is used once, and onboarding prompts wait until the member leaves the opened profile. The QR sheet checks the owner's sharing choice: a private profile cannot be found, so it offers the sharing settings instead of a code. No backend change is involved; profile visibility, blocks and request acceptance apply as usual. QR codes are generated in the browser with `uqr`. The sheet's **Scan** tab reads codes with the device camera (`getUserMedia`, back camera preferred) and `jsqr`, which is loaded only when scanning starts. It accepts any `http(s)` link with a `#friend=` hash, ignores other codes and your own, then hands the account id to the same invite flow (`openFriendInvite` and the `relay:friend-invite` window event). The camera stops when a code is read, the tab changes or the sheet closes. In-app scanning exists because an installed web app on iPhone cannot receive links from the system camera: they open in Safari, which has its own sign-in. **Native app note:** if Relay becomes a native app with universal or app links, the system camera can open friend links directly in the app and this scanner may no longer be needed. Keep the `#friend=<account id>` link format so codes already shared keep working.

When upgrading an email-based account database, migration `0030_username_accounts` derives usernames from the old address's part before `@`, replaces unsupported characters with hyphens, and adds numeric suffixes for duplicates. Short or unusable names become `user`. Account IDs, passwords, sessions, preferences and workout ownership are preserved. Run `python -m app.manage list-users` after migration to see the assigned usernames. The account email column is removed; rolling back requires the pre-upgrade database backup and previous app version. Existing backup archives stay unchanged; new account snapshots use manifest format 2 with an owner username.

Blocking a member from their profile prevents shared-profile discovery and
access in both directions, including profile and machine photos, workout filters, history,
reactions and recent activity. It removes the friendship or request and reactions between those accounts.
Blocked members remain in the owner's **Blocked** list in **Social > Find** for unblocking, even
while the owner's profile is private. Unblocking does not recreate friendships. Migration `0039_profile_blocks`
adds this persistent relationship; run `alembic upgrade head` before serving this frontend.
Blocks are excluded from account snapshots because they refer to other accounts, and account
deletion removes blocks in both directions.

Home's Friends card refreshes its latest-workout feed every 30 seconds while visible, on
focus, when the page becomes visible and on reconnection. Each member contributes one latest
session, sorted by workout date and creation time; reactions do not affect this order.

Live friend activity shows whether each friend is working out, active now or when they were last
active. Each signed-in, open window keeps a WebSocket to `/api/presence/ws`, authenticated by the
session cookie and rejected from other origins, and reports whether it is visible and which
workout this device is doing. A member is online while any of their windows is visible. Online
status lives in memory, so the backend must run as a single process (the provided systemd unit
does); a reverse proxy must pass WebSocket upgrades, which Caddy does by default. The workout in
progress is stored in `live_workouts`, so it stays visible while a phone is locked between sets.
It clears when the logging device finishes or discards the workout, or when the app's inactivity
auto-finish time passes; another device without that workout open cannot clear it. The Friends
and feed responses include each friend's `presence`, Friends lists friends working out first,
then those online, and the feed puts friends working out first. Changes are pushed to friends'
open windows immediately, with the existing 30-second refreshes as a fallback. Only accepted
friends who could see the member on their Friends list receive it. **Online status** and **Live
workouts** in **Settings > Account & privacy > Profile sharing > Live activity** turn each part
off separately; both start on. Migration `0048_live_activity` adds both choices to
`profile_sharing` and creates `live_workouts`, which account backups leave out and account
deletion removes.

The same socket sends a content-free `notifications` invalidation only to the affected account's
open windows after notification mutations commit. These events include requests from non-friends
and do not depend on live-activity sharing choices. Each window fetches its authenticated inbox
snapshot; reading notices invalidates that account's other windows too. Initial connection,
reconnection, focus, visibility and network return refresh the bell. Events arriving during a
fetch are coalesced into a follow-up fetch, and 30-second visible polling remains the fallback.

## Project structure

- `frontend/`: React, TypeScript, Vite and `vite-plugin-pwa`; the default screen is the two-row menu with total and weekly stats.
- `backend/app/`: FastAPI API, SQLite/SQLAlchemy models, streamed multipart storage, in-process processor, and YouTube uploader interface.
- `backend/migrations/`: Alembic initial schema migration.
- `data/` (ignored by Git): SQLite database, reusable machine photos, original uploads, normalized temp files, and stitched outputs.

Sign-in uses cookie-based sessions with per-user accounts and authorization checks on each request. A sign-in lasts until the person signs out or goes 90 days (`GYM_SESSION_DAYS`) without using the app; each day of use restarts the count. Signing out, changing the password (other devices), disabling an account, or deleting it ends sessions immediately.

There is no self-service password recovery. An administrator resets a forgotten password from **Admin console → Accounts → Reset password** (`POST /api/admin/users/{id}/reset-password`), which signs the person out everywhere, clears any sign-in lockout and returns a one-time temporary password for the admin to pass on. The account is flagged `must_change_password`: its only working endpoints are the sign-in check, sign-out and the password change (`password_change_required` otherwise), and the app shows a choose-a-new-password screen until it is changed. `python -m app.manage reset-password --username <name>` sets a password of the operator's choosing from the server without the forced change.

## Prerequisites

- Python 3.12
- Node.js 22.13+ and npm (CI uses Node.js 22)
- ffmpeg and ffprobe available on `PATH` (or configured with environment variables)

Windows PowerShell (using winget where available):

```powershell
winget install Python.Python.3.12
winget install OpenJS.NodeJS.LTS
winget install Gyan.FFmpeg
```

Linux (Debian/Ubuntu example):

```bash
sudo apt update
sudo apt install python3.12 python3.12-venv nodejs npm ffmpeg
```

Check the video tools before starting:

```powershell
ffmpeg -version
ffprobe -version
```

## First local run (mock YouTube)

Copy the environment template and keep mock mode enabled:

```powershell
Copy-Item .env.example .env
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -e ".[dev]"
```

```bash
cp .env.example .env
python3.12 -m venv .venv
. .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -e '.[dev]'
```

Initialize or upgrade the SQLite database, build the PWA, then run FastAPI:

```powershell
alembic upgrade head
Set-Location frontend; npm ci; npm run build; Set-Location ..
uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000
```

```bash
alembic upgrade head
(cd frontend && npm ci && npm run build)
uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000
```

Open `http://127.0.0.1:8000`. To create the first (admin) account, either set `GYM_REGISTRATION_INVITE_CODE` in `.env` and sign up in the browser with that code, or run `python -m app.manage create-user --username yourname --display-name "Your Name"` from the repository root. That first account takes ownership of any existing workout data. Other people can sign up only when `GYM_ALLOW_REGISTRATION=true`; `GYM_ALLOW_REGISTRATION` and `GYM_VIDEO_UPLOADS` are starting values that the admin console overrides once changed. For frontend hot reload during development, run `npm run dev` from `frontend/`; Vite proxies `/api` to the local FastAPI server.

On Windows, `./start-app.ps1` builds and starts a local copy. Use `./start-app.ps1 -Dev` to include Vite for frontend development.

Vite forwards HTTP and WebSocket `/api` requests to FastAPI. For access through a private development hostname, set the `GYM_DEV_HOST` environment variable to that hostname before starting Vite; localhost works without it.

The menu has one current dark/blue theme, with three total stats above three weekly/bodyweight-trend stats. The old powerlifting stars menu is retired. Building replaces the previous `frontend/dist` assets. The server revalidates HTML, the service worker, and the manifest; fingerprinted assets may be cached. Release information is checked every minute while visible and online, and when returning or reconnecting. A new release displays a top notification with a refresh arrow; **Settings > What's new > Check for updates** also checks the worker. Replacement workers download in the background and wait, preserving the current cached assets. An update applies by itself only when it is ready within a minute of opening the app (a cold start, or returning after at least five minutes away), before anything is touched, with no unfinished workout draft, focused field, open dialog or save/upload in flight; see [App versions and API compatibility](#app-versions-and-api-compatibility). Otherwise nothing reloads automatically, including when another tab activates an update. The refresh arrow waits for installation and activation, then reloads. An active workout flushes its local draft first; storage failure, an in-flight workout save or editing a previously saved workout blocks the refresh until the work is saved. Release popups describe the loaded version and remember dismissal per account/version in this browser. The Vite development server replaces any installed production worker with a cache-clearing pass-through worker while preserving push support. Workout data, drafts, settings, and push subscriptions are retained. A local workout draft needs the exercise catalogue to reload successfully before it can be restored; failed or incomplete requests preserve the draft for retry.

Choose the pencil on **Today** to customise the Home Screen directly. The cards gently wiggle and show a drag handle at the top right, a width button beside it and a minus button at the top left. Drag a handle to move its card, or focus it and use the keyboard arrow keys; use the width button to expand or shrink a card, minus to hide a card and **Add sections** to restore it. Sections with display options also show **Customise**; the cardio goal card can track one zone goal or every goal, with a progress bar, ring or list design. **Save layout** stores order, widths, visibility and these options in your account across devices; **Cancel**, choosing the highlighted pencil again or switching away from Today discards unsaved edits, and **Reset layout** restores the original arrangement and sizing before saving. An active workout's Resume card always stays visible. Card actions pause while editing, and reduced-motion settings disable the wiggle. These preferences use the existing account settings table and need no migration.

Cardio sessions accept optional whole-number calories (kcal), average heart rate, distance, average speed, incline, average indoor-cycling power, and average METs. Prefer active calories from the machine or watch. **Log metrics / Edit metrics** works for both standalone sessions and cardio linked to a workout. Blank means unknown; zero is a recorded value where valid. The Cardio screen compares calories, fat-energy equivalent, average heart rate, distance, average speed, average incline, average METs, and MET-minutes across This week, This month, 3 months, 6 months, This year, and All time. MET-minutes are calculated as average METs × session minutes, while period-average METs are weighted by duration. Each range except All time is compared with its immediately preceding equivalent period. The week follows the saved week-start preference; month/year are calendar periods to today, and 3/6 months are rolling periods anchored to today. Future sessions are excluded and metric coverage counts make partial data clear.

The comparison uses 7,700 kcal per kg as a conventional approximation and is explicitly not measured fat loss or a food deficit. It does not estimate calories automatically or infer past entries from duration. See [Hall's discussion of the energy rule and its limitations](https://pubmed.ncbi.nlm.nih.gov/17848938/). Run `alembic upgrade head` and restart the backend before serving a metrics-enabled frontend; normal `start-app.ps1` startup handles the migration and build.

The normal multipart upload is intentionally non-resumable: if a file upload fails, retrying restarts only that file. The client-generated clip ID makes the retry idempotent, while successful clips remain intact.

## YouTube completion alerts

After an upload finishes, YouTube may still need time to create playback versions. The backend polls the video's owner-only `processingDetails` status every 20 seconds and only marks the session complete when YouTube reports success. It sends a Web Push notification to every subscribed phone if YouTube finishes successfully or reports a failure.

On the installed phone PWA, enable **Settings > Notifications > Phone alerts**. The browser asks for notification permission, saves the phone's subscription, and sends a test alert immediately. iPhone notifications require the PWA to be installed from Safari's **Add to Home Screen** flow. The server creates its local VAPID private key at `data/web-push-vapid-private.pem`; this is ignored by Git and must remain private.

The workout logger uses the same subscription for rest-timer alerts. Start a rest timer and tap **Alert** on its compact top bar once; subsequent rest timers notify that phone automatically, including while the PWA is backgrounded or the screen is locked. Extending or skipping the visible timer reschedules or cancels its pending notification.

With Phone alerts enabled, an active workout also schedules one reminder at two hours. The server stores this reminder so it survives restarts and can notify a backgrounded phone. Saving or cancelling the workout cancels its reminder; if the phone is offline, cancellation retries when it reconnects. Open the updated app once to register an existing workout's reminder. Upgrade to migration `0019_active_workout_reminders` before restarting the backend. A workout left running can be saved with **Actual duration (minutes)**; the correction stays in its local draft until saved.

**Weekly cardio** totals include every cardio session. Personal zone goals count only sessions whose average heart rate falls within that account's inclusive zone range. Configure all five ordered, non-overlapping ranges and one or more zone-specific minute targets with **Edit** on **Training > Cardio > Weekly zone goals**; the default target is 150 minutes in Zone 2. Until ranges are configured, each session keeps its saved zone label (new sessions default to Zone 2, matching earlier releases), and saving goals alone does not change saved labels. Once ranges exist, missing or out-of-range heart rate receives no zone credit, even when an older client sends a manual zone label. The average estimates a session's zone rather than measuring time spent in it. Cardio from completed workout sets uses their duration-weighted average heart rate. Editing metrics or personal ranges recalculates goal totals, including existing sessions. Goal progress and the short session notification use text.

`GET/PUT /api/cardio-preferences` reads and validates the account-owned `cardio_preferences` JSON setting, which is included in account backups without a schema migration. Saves bump the training revision so other devices refresh. The cardio overview returns `goal_weeks`; Home and shared goals return `cardio_goals`. Shared goals retain existing sharing permissions. Weekly totals and goals follow the saved week-start preference and exclude future entries. A Sunday start means Sunday through Saturday.

Mixed portrait and landscape clips are normalized to a shared 1920x1080, 30 FPS MP4 canvas before stitching. Each clip retains its original aspect ratio: portrait clips are pillarboxed and wide clips are letterboxed where necessary. This avoids distortion and makes the concat step reliable; a single YouTube video cannot safely change its encoded frame dimensions mid-playback.

## Per-account backups

Every backup belongs to one account (`account_backups.user_id`) and holds only that account's data. Backups live in `data/account-backups/<account id>/<backup id>/`, each with a `manifest.json` that lists every file with its size and SHA-256. Run these from the folder that holds the app's `.env`:

```powershell
python -m app.manage backup-account --username yourname [--label "Before trip"]
python -m app.manage list-backups [--username yourname]
python -m app.manage import-legacy-backup --username yourname --source <backup folder>
```

`backup-account` writes a standalone SQLite database containing only that account's rows (with its password hash blanked and no sign-ins, push registrations or server settings), plus its machine photos. Video uploads are not included.

`import-legacy-backup` files a backup taken before accounts existed, such as one made before upgrading to migration `0027`, under the account that claimed that data: the first account. It copies the databases, photos and video files, leaves server secrets, keys and logs behind, and refuses a backup that already contains accounts or one that has already been imported. Deleting an account deletes its backups.

## Hidden account limits

Limits stop one account from bloating the server. They sit far above real use (a six-year log peaks at 55 sets and 9 exercises in one workout), and people are never told they exist: anything over a limit gets a plain "couldn't be saved" message, and the server log records which limit was hit. The exception is the photo upload size, which people are told ("Photos can be up to 5 MB."). The app also shrinks photos before uploading them (to 1,800 px on the long side, as JPEG), so phone photos fit easily. Adjust them under **Settings → Help & about → Admin console → Account limits**; changes apply immediately.

| Limit                           | Default                        | Applies to                  |
| ------------------------------- | ------------------------------ | --------------------------- |
| Workouts, cardio sessions       | 5,000 each                     | each account, except admins |
| Custom exercises                | 100                            | each account, except admins |
| Machine photos                  | 25                             | each account, except admins |
| Changes per minute              | 60                             | each account, except admins |
| Exercises / sets in one workout | 20 / 100                       | everyone                    |
| Workout / exercise / set note   | 2,000 / 1,000 / 500 characters | everyone                    |
| Photo upload size               | 5 MB (shown to people)         | everyone                    |

CSV imports follow the same limits and save nothing if any is exceeded. A workout saved before a limit was lowered can still be edited, but not grown.

## User review and follow-up work

The [13 October 2026 user review](reviews/2026-10-13/USER-REVIEW.md) records the
reviewed revision, sample-data evidence, prioritized findings and feature roadmap.
Use [GitHub issue #29](https://github.com/ejbolts/Gym-video-logger/issues/29) as its
tracking index; each P1 finding has a separate issue. Recheck historical findings
against the current code before starting new work.

## Training splits

`GET /api/training-split` returns the signed-in account's saved split or `null`.
`PUT /api/training-split` saves a name, enabled flag, start date and 1–28 ordered steps;
each step has an account-owned `workout_type_id`, or `null` for rest. At least one step
must be a workout. Enabled splits require active types. The JSON is stored in the account's
`training_split` key in `user_settings` and is included in account backups without a schema migration.

Each step is one calendar day. The index is days since the start date modulo cycle length;
logging or skipping sessions does not advance it. Before the start, Home shows the first
scheduled day and its date. `GET /api/dashboard?on_date=YYYY-MM-DD` uses the client's local
calendar date; callers that omit it keep the server-date default. The visible app rechecks
after local midnight even when the training revision has not changed.

Saving a split changes the account's training revision so other devices refresh. Disabled
or absent splits use the existing muscle-frequency recommendations. A type removed after
saving produces an update-split state rather than substituting a different workout. Custom
recommendations carry the account-owned type metadata, and previous-session templates match
the custom type ID as well as the compatibility category.

## Body measurements

`GET /api/body-sizes` returns private dated circumference logs, newest first. `PUT /api/body-sizes` replaces the entry for `measurement_date`; omitted fields clear to null, and at least one finite circumference above 0 and up to 300 cm is required. `DELETE /api/body-sizes/{YYYY-MM-DD}` deletes only the signed-in account's entry. Each date is stored in its own `user_settings` row under `body_sizes:YYYY-MM-DD`, included in existing account backups and deletion. Writes change the training revision so other devices refresh Body. No schema migration is required. The UI converts inches to canonical cm and does not require a bodyweight record. These logs are excluded from shared profiles.

## Saved and shared routines

`/api/routines` stores up to 20 account-owned routines, with 1–28 workout/rest days,
planned exercises and sets. Each routine has its own `routine:<uuid>` user-setting row,
so existing account backups and deletion include it without a schema migration. A routine
contains planned fields only; capturing a split omits workout/set notes, body weight,
photos, credentials and incomplete performance. Limits are 200 exercises and 1000 sets
per routine, with 20 exercises per day and 50 sets per exercise.

`/api/routines/profile/{user_id}` lists only explicitly shared routines and uses the
existing profile audience, friendship, block and disabled-account checks. Copying through
that profile rechecks access, maps exercises and types into the recipient's account,
and creates an independent private routine; it never copies workout history or activates
a schedule. Unsharing does not remove copies already saved by others.

`POST /api/routines/{id}/use` accepts a start date and replaces the active split.
The unified **Your splits** page lists all owned copies, including private imports, with
the active plan's week/calendar preview and inline templates. After copying, **View my splits**
navigates to that copy and opens its card. The own profile links to this page from its
consistency header; other profiles show only their shared plans. Importing does not publish
or activate a split automatically. Templates remain disabled while a saved plan matches
their ordered workout/rest days. Sharing is a separate saved-plan option, outside the editor.
Recommendations include that day's planned movements; the logger prefills them as
unchecked suggestions. Editing an active routine updates its schedule while preserving
the start date, unless a schedule change is explicitly included in the same atomic save.
Editing the schedule directly clears its routine link; deleting the
routine keeps the schedule and restores history-based suggestions. Mutations invalidate
the account's training revision. Test with `backend/tests/test_routines.py` and the
frontend `RoutinePanel` and workout recovery tests.

## Exercise merges

Exercise merges use `POST /api/exercises/{source_id}/merge` with `target_exercise_id`.
Both exercises must belong to the signed-in account, the source must be custom and their
kinds, equipment categories and complete configured muscle-group lists must match.
Muscle matching includes partial credits even when weekly partial counting is disabled;
credit factors and muscle order do not need to match. Equipment spelling aliases follow
the library's categories (for example, DB and Dumbbell). The transaction transfers
movements, machine photos and saved routine
references, retains the destination's muscle credits and existing defaults, and rebuilds
records against the combined history. Photo-specific presets move with their photos;
an existing destination weight mapping wins because separate reference scales cannot be
combined safely. Account-local `exercise_merge:` settings flatten old IDs to the destination
and are included in account backups. The catalogue's `merged_from_ids` restores old local
drafts; workout/cardio saves and stale routine editors also resolve those IDs. Import undo
keeps destinations referenced by merges. Test with `backend/tests/test_exercise_merge.py`,
`ExerciseMergeDialog.test.tsx` and workout recovery tests.

## Checks

While developing, run the tests for the behaviour you changed. From the repository root,
after activating the virtual environment:

```powershell
python -m pytest backend/tests/test_workout_types.py -x
ruff check backend/tests/test_workout_types.py
```

From `frontend/`, use a focused watch or a one-off selection:

```sh
npm run test:watch -- src/WeightInput.test.tsx
npm run test:related -- src/weightUnits.ts
npm run test:changed -- origin/main
```

`test:changed` without a reference covers uncommitted changes; with `origin/main` it
covers the feature branch's changes. Related-test selection follows static imports, so
include relevant integration tests yourself when the relationship is indirect. On Windows,
use the actual worktree directory rather than a junction alias if Vite cannot resolve files.

Check formatting/lint for edited files and exercise changed UI behaviour with isolated
sample data. New and changed tests must pass locally before pushing. Leave the full suites
to CI: run one locally only when changing its test infrastructure or configuration, or to
rerun the specific tests behind a CI failure. Do not rerun unrelated passing checks after
every small edit. Documentation-only changes need documentation checks, not application suites.

The GitHub **Checks** workflow selects relevant full suites for feature PRs, including
stacked PRs, from the changed files in the exact tested merge commit:

- `frontend/` changes run frontend checks; `backend/`, `pyproject.toml` and
  `alembic.ini` changes run backend checks.
- Backend route, schema, model and frontend-serving modules, plus
  `frontend/src/api.ts` and `frontend/src/types.ts`, run both suites. The detector's
  tests guard the route-module mapping when new API routers are added.
- CI, deployment, shared configuration and unknown paths run both suites.
- Changes confined to `docs/`, the README, contributor/agent instructions or license
  files need neither application suite on feature PRs.
- PRs into `main`, `main` pushes and manual dispatch always run both suites.

Both required job names, **Frontend checks** and **Backend checks**, remain present.
An unaffected job reports success without checking out code, installing dependencies
or running its suite. Detection failure, cancellation or invalid output fails both
required jobs. Labels do not control selection, and the workflow is never suppressed
by path filters. Detection uses a depth-two checkout and a NUL-delimited Git diff,
including both paths of renames, without the file-count limits of API/path filtering.

Test the detector and the actual shell gates without application dependencies:

```sh
python -m unittest discover -s .github/scripts -p 'test_*.py'
ruff format --check .github/scripts
ruff check .github/scripts
```

The workflow caches dependencies and cancels superseded runs. Before merging, require
both check jobs to pass for the current PR revision. An explicit not-needed result is
valid; a pending or failed job is not. Workflow changes do not alter branch protection
or authorise a merge or deployment. The separate **Dependency security** workflow is
unchanged and still audits both dependency sets.

CI runs the full verification below. Run it locally only for the exceptions above, from
the repository root:

```powershell
ruff format --check backend .github/scripts
ruff check backend .github/scripts
python -m pytest --durations=10
Set-Location frontend; npm run format:check; npm run lint; npm run build; npm test
```

Use `ruff format backend` and `npm run format` to apply formatting. Use `npm ci` from
`frontend/` for a clean install of the committed dependency lockfile. After intentionally
changing dependencies or package scripts, update and commit `package-lock.json` with
`npm install --package-lock-only`.

Backend tests ignore the checkout's `.env` and inherited `GYM_` deployment settings.
Each run uses its own short `gym-tests-` directory in the operating system's temporary
directory for SQLite, temporary files, uploads and credentials, outside Git. An explicit
pytest `--basetemp` is still respected. The schema is created once per run; rows are cleared between tests in
foreign-key order, with real commits and connections retained for scheduler and
concurrent-request tests.

Ordinary API fixtures pre-create accounts with a real cached password hash and a
real server-side session. Tests marked `auth_flow` (including the auth and account
management suites) create their fixture accounts through real registration and login.
Use that marker for tests whose purpose includes those authentication flows; explicit
calls to registration/login and password hashing always use the real implementation.

## App versions and API compatibility

Installed apps can keep an old bundle open for days, so the API must keep working with
releases that are already deployed. The rules for changing it are in `AGENTS.md`;
`backend/app/client_versions.py` holds the mechanisms:

- Every API request sends its `frontend/release.json` version in `X-Relay-Version`. Each
  signed-in session stores the latest one, and **Admin > App versions in use** lists the
  releases seen in the last 30 days (sessions not used since the header existed show as
  *Not reported*).
- `MIN_WRITE_CLIENT_VERSION` (default `None`) makes the API refuse saves from older or
  unreported releases with `426 client_outdated`. Reads and `/api/auth/*` stay open. The app
  then shows **Update needed to save**, keeps a finished workout or body check-in queued on
  the device without asking for a review, and sends it once refreshed.
- `FIELDS_ADDED_IN` lists fields added to a full-replace save by the release that introduced
  them. When an older release replaces that record, the stored value is kept rather than reset.
  Workout updates (`PUT /api/workouts/{id}`) apply it to workout, exercise and set fields,
  matching exercises by position and exercise and sets by position.
- An update downloaded within a minute of opening the app applies by itself when nothing is
  in progress (see [Detailed app behavior](#detailed-app-behavior)), so most devices move to
  a new release the next time they are opened.

## Switching to real YouTube uploads

Configure one Google
**Web application** OAuth client, its registered callback and a persistent private encryption
key path, then enable real uploads and the appropriate account access in the admin console.
Users connect their own channels in Settings or Video logger. Connections use upload and
read-only permissions, with encrypted per-account credentials and single-use, sign-in-bound
PKCE authorization. Apply migration `0034_youtube_connections` before serving this frontend.

The legacy Desktop app command and shared token are not used for personal connections. Existing
video links remain; unfinished older batches must be uploaded again with a connected channel.
Google's current API reference no longer imposes the old blanket private-only restriction for
unverified projects; check Google's OAuth production, testing and verification requirements.

Server-to-YouTube uploads are resumable and default to `unlisted`; phone-to-server transfers
remain non-resumable. Title and description templates can use `{session_name}`, `{workout_date}`,
`{notes}`, and `{chapters}`. Timestamp links are always saved; chapter text is added only when
the timestamps satisfy common YouTube chapter minimums.

## Configuration

See `.env.example` for all supported variables:

- storage/database paths and upload limits
- starting machine-photo upload limit, 5 MB (`GYM_MAX_PHOTO_SIZE_BYTES`); the admin console overrides it
- frontend upload-concurrency hint
- ffmpeg/ffprobe executable paths
- YouTube OAuth paths, privacy, mock mode, title/description templates
- YouTube processing poll interval and Web Push VAPID/contact settings
- cleanup of original uploads and the stitched video after YouTube confirms success
- start/end trimming for each clip before it is stitched (5 seconds each by default)

By default, the original uploads and stitched output are retained while YouTube is processing, then deleted after YouTube confirms the video is ready. Set `GYM_DELETE_ORIGINALS_AFTER_SUCCESS=false` or `GYM_DELETE_OUTPUT_AFTER_SUCCESS=false` to retain either copy. Queued jobs survive a restart, while a job interrupted during ffmpeg or YouTube upload is marked failed with a useful retry message.

Each clip is also trimmed by 5 seconds at its start and end before it is normalized and stitched. Change `GYM_TRIM_START_SECONDS` or `GYM_TRIM_END_SECONDS` to adjust this (set both to `0` to disable it). Clips always retain at least 3 seconds, so very short videos are trimmed proportionally rather than made empty.

## Offline mode

Relay keeps working without a connection once an account has signed in on the device.

- The service worker precaches the app shell, Inter font, exercise icons and in-app images, about 1.8 MB in total. Exercise icons are WebP files of roughly 6 KB each. Release videos and release-note media hosted on GitHub stay online-only.
- Account reads are saved on the device as they load: the exercise library, workout types and colours, training and cardio preferences, split, Home layout, dashboard, recent workout history, personal records, body measurements and goals, cardio, training time, progress and machine-photo lists. The saved copy answers when the device reports no connection, the server cannot be reached (including 502-504 proxy errors), or the server has not answered within 4 seconds. Screen titles then show **Offline**. A late answer refreshes the copy, and the first successful request clears the indicator.
- Startup opens the remembered account offline when the session check fails or takes longer than 4 seconds. A first visit on a device still needs the server.
- Saved copies live in IndexedDB. Each record is gzip-compressed, then AES-GCM encrypted with a non-extractable Web Crypto key stored beside it and bound to the owning account and record name. Sign-out, account changes and confirmed revocation delete the records and the key. Encryption protects copied storage files; the device lock protects an unlocked browser. Origins without Web Crypto (plain HTTP other than localhost) store compressed records without encryption. Passwords are never stored on the device.
- Stored workouts take about 0.9 KB each, and the default exercise library about 3 KB. A year at three workouts a week, with its dashboard and personal records, is roughly 0.2 MB. History beyond the startup window is saved only after it has been opened.
- Finishing a workout offline stores it on the device; it syncs when the server is reachable. When a session expires, an unsynced finished workout is kept for the same account and discarded if a different account signs in.
- Sign-in, Social, notifications, sharing, settings changes, imports, exports, video uploads, machine-photo images and older history need a connection.

## Limitations and sensible next steps

- Uploads are not resumable and mobile browsers can suspend a backgrounded PWA.
- Offline, one finished workout can wait to sync at a time; starting another workout waits until it reaches the server. Settings and custom exercises cannot be changed offline.
- A processing job cannot be cancelled once ffmpeg work begins; cancellation is supported during upload.
- Video processing handles one session at a time.
- Real YouTube uploads need credentials and internet access; mock mode remains ideal for local verification.
- Future milestones could add saved workout templates, richer YouTube processing progress, or carefully designed exercise analysis. AI exercise recognition and rep counting are deliberately out of scope here.

## Muscle set contributions

Home's **Sets per muscle** opens a bottom sheet when a muscle name is tapped. The dashboard's `weekly_sets.muscle_groups[].contributions` carries one entry per source workout movement: workout ID/name/date, movement and exercise IDs, working-set count, credit per set and total credits. These entries are calculated with the same account week boundary, muscle mappings and completed-working-set rules as the chart. Low-RPE working sets remain included in the chart's raw credits; future workouts, warmups, incomplete sets, cardio and failed sets with no completed reps are excluded. No schema migration is needed for these response fields.

The arrows on **Sets per muscle** step back through `weekly_sets_history`: the eight whole weeks before `weekly_sets`, newest first, each in the same shape and with its own contributions. Each earlier week lists the muscles trained in the four weeks up to its last day. The card compares the shown week with the one before it, using an outline bar and a signed change, and keeps one bar scale across every week. The dashboard loads workouts far enough back for these weeks whatever its `calendar_start`. Dashboards cached by earlier releases have no history, so the arrows stay disabled.

Each exercise row shows a right chevron and opens its source workout in the existing History view, focused on that movement. It does not enter the workout editor or replace an active workout. If the local snapshot is missing the source movement, the app refreshes that workout's day before navigating. Removed workouts or changed exercises leave the sheet open with an error. Dashboards cached by older releases without contribution entries show a refresh instruction rather than guessed exercise details.

## App guide and feedback

New accounts see a guided feature tour before the release announcement. Use **Next**, **Back** or **Skip guide**, then optionally send private feedback from the thank-you screen. Ending or skipping the first tour opens an import step: **Import or export** opens **Settings > Data & connections > Import & export** with a one-page import popup. The same popup opens from **Show guide** directly below the section title. Select the source app, choose its original CSV and review before saving. During onboarding, **Skip for now** shows the release announcement. After choosing to import, the announcement waits until the person leaves Settings. The pending step is remembered per account in the browser, so a reload returns to it; replaying the guide later does not repeat it. Administrators read the latest 100 messages in **Settings > Help & about > Admin console > App feedback**; feedback is associated with the submitting username and deleted with that account. Messages are limited to 2,000 characters, 100 per account and the existing save-rate limit. A client submission ID prevents duplicates when a request is retried.

Open **Settings > Help & about > Feedback & feature requests** to send feedback, report problems or suggest improvements at any time. Messages are stored in the app database with your username and appear for administrators in **Settings > Help & about > Admin console > App feedback**. No email or GitHub issue is created.

Open **Settings > Help & about > App guide > Replay guide** to see the tour again, or **Add to Home Screen > Show steps** for the illustrated installation instructions. Both remain available from the installed app. Settings and the closing screen link to [contribution instructions](../CONTRIBUTING.md). Upgrade existing databases with `alembic upgrade head` for `0031_app_feedback` before serving this frontend.

## Exercise catalogue upgrades

Default seeding matches each account's exercises by case-insensitive name or the explicit aliases in `exercise_aliases.py`. A matched custom exercise keeps its ID, name, custom flag, favourites, muscle credits and explicit equipment; only blank equipment is filled from a recognised default. This invalidates cached workout snapshots once. Manual creation and CSV imports recognise the same aliases, preventing a second entry when an older custom name is retained. Unknown or ambiguous names are left alone, and equipment variants retain separate histories. The Custom pill combines with search and equipment filters in the library and workout picker.

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

Training blocks are account-owned JSON in `user_settings.training_blocks`, included in account backups. `/api/training-blocks` supports GET/POST and PUT/DELETE by block ID; blocks are only created by the user. Blocks accept an optional inclusive `planned_end_date` after the start, used only for the Home card's days left. Responses add derived `workout_count` per block, `earlier_workout_count` and `history_start`; these are counted on read and never stored. Starts are unique, cannot be future dates and use the workout's saved calendar date; the next start is the previous block's exclusive end. Progress library/detail requests accept optional `block_id` and reuse the existing charts and machine views. `personal-records?include_blocks=true` adds derived block events using the same eligibility rules as lifetime records, returning `scope`, `block_id` and `block_name`; all-time events win duplicate set/type achievements. Block events are derived from current history so edits, imports and boundary changes do not leave stale records. Condensed exercise history includes `block_bests` for live PR checks while retaining unrestricted previous-set suggestions. Block mutations bump the shared training revision for cross-device refresh. Browsing a block changes only progress views, never the date-based scope used by the workout logger. `GET /api/training-blocks/{id}/summary` returns a block's workout, working-set, volume and PR totals (strength movements only; PRs counted as when browsing the block) next to the last regular block before it, derived on read from the days each block owns up to today. Blocks accept an optional `deload` flag: a deload's summary has no comparison and later blocks compare with the last non-deload block. Older apps omit `deload` when saving a block, so an update that leaves it out keeps the saved value. Once the day after a block's planned end arrives, Home's Training block card shows **Finished** and opens this summary with **Start next block** (name and 8/12-week or open end, starting today) and **Deload week first** (a 7-day deload block starting today). `trainingBlockSuggestion.ts` decides when a block is worth offering, from data the app already holds and with nothing stored. In order: a return after 10 or more days without training, when the return is within the last 14 days; a weight goal whose kind (loss, gain, maintain) differs from the goal before it, created within the last 14 days; no all-time record in the last 21 days after three or more in the 21 days before, with at least four training days in the last 21; and no block at all once four different weeks, counted from the account's week start, hold a workout. A block started in the last 21 days suppresses every reason, and sample workouts never count. The weekly review's **Training block** row (`WeeklyReviewBlock.tsx`) shows the running block's week and, when there is a reason, the reason and **Start a block**, beside this week and last week only. Home's empty Training block card waits for the same four trained weeks (`WEEKS_BEFORE_FIRST_BLOCK`).

Completed workout set history can be imported and exported from **Settings > Data & connections > Import & export** using CSV. Uncompleted planned or suggested rows are excluded, so importing an export cannot turn them into performed sets. Exports write `Date Lifted`, `Exercise`, `Weight (kg)`, `Weight (lb)`, `Reps`, `Bodyweight (kg)`, `Bodyweight (lb)`, `Percentile (%)`, `Warmup`, `Workout ID` and `Workout name`. Imports need a header row and one row per completed set; only `Date Lifted`, `Exercise` and `Reps` are required columns. The others are optional, and a file with neither weight column imports sets without weights and shows a warning. Column names match regardless of case and spacing, and order does not matter. Unrecognized columns are ignored and listed in the review; a known column that appears twice is rejected. `Workout ID` and `Workout name` keep separate sessions on the same date apart. IDs group rows within the file; importing always creates account-owned records with new IDs and never uses a supplied ID to overwrite a workout. Files without Workout ID remain valid, but all rows on one date become one session because they contain no session identity.

Workout exports also include `Exercise kind`, `Duration (seconds)`, `Distance (km)`, `Calories (kcal)`, `Average heart rate (bpm)`, `Speed (km/h)` and `Incline (%)`. Missing measurements stay blank; recorded zeroes remain zeroes. Cardio session totals and averages are separate from individual sets: `Cardio session calories (kcal)`, `Cardio session average heart rate (bpm)`, `Cardio session distance (km)`, `Average speed (km/h)`, `Cardio session incline (%)`, `Average power (W)`, `Average METs` and `Elevation gain (m)`. Session values repeat on each set of that cardio movement and must agree; do not sum these repeated totals. These fields survive reimport, including values recorded only on the cardio session. Session-level measurements require a cardio exercise with at least 60 seconds of completed duration. The same account and inclusive date filters apply to workouts and cardio. Linked cardio is exported through its completed workout sets once; older standalone cardio uses one row with a `cardio:` Workout ID and imports as a cardio-only workout, with the usual duplicate checks, account ownership, limits and import undo. No real workout is created by exporting.

Imports accept UTF-8 comma-separated or semicolon-separated CSV and tab-separated text copied from a spreadsheet, up to 20 MB. Dates must start with `YYYY-MM-DD`; a following time of day, such as `2026-10-17 07:30:00`, is ignored. Numbers accept a decimal point or a decimal comma with one or two decimal places (`82,5`); values with units, such as `80kg`, are rejected. `Warmup` accepts 1/0, true/false, yes/no or y/n. When only `Weight (lb)` or `Bodyweight (lb)` is filled, it is converted to kilograms and one summary warning gives the row count. Choose Strength Level, Hevy or Strong to import the original app export without renaming columns. Strong workout units are explicit; measurement files read their own units. Choose Relay for native workout or bodyweight CSVs, including Gym Logger exports, and template spreadsheets. The in-app CSV guide explains this layout and downloads a template in the person's weight unit.

Relay and Gym Logger bodyweight exports are detected automatically in the same import picker. They require `Date` and `Weight (kg)`, with optional `Body Fat (%)` and `Notes`. The shared review shows check-in totals and skips existing dates, including dates created after preview. Missing entries retain body-fat values and notes. Select **Relay > Export data** to choose completed workout history, bodyweight check-ins or both plus one date range. Both prepares two labelled CSV files before starting either download. The range ends at the latest entry among the selected data types. CSV exports are history transfers, not full account backups.

Choosing a file opens a read-only review of sessions, sets, new exercises, duplicates and warnings. **Cancel** saves nothing. **Save import** revalidates the file and current limits, skips identical existing sessions in your account, and atomically adds the remaining sessions and any missing exercises. Repeated identical sets within a session are retained. Duplicate matching uses the date and completed set content, including supplied cardio metrics, so renaming a workout does not cause a duplicate. To preserve separate same-date sessions with identical sets, include them together with different Workout IDs in one file; importing identical sessions through separate files may skip them as duplicates. Exercise aliases are compared by canonical name and pound-only legacy weights are converted to kilograms. Existing workouts and body-weight check-ins are kept; only missing body-weight dates are added from imported sets. CSV covers these set fields, cardio measurements and session names, rather than notes, photos, videos or a complete account backup.

Choose kilograms or pounds in **Settings > Training > Units & weekly goals** for weight entry and display across Home, the workout logger, History, Body, Progress and shared profiles. Changing this preference preserves saved weights and active entries. Workout CSVs keep both kg and lb columns; bodyweight CSVs continue to use the explicit `Weight (kg)` column regardless of the display preference.

On a fresh workout database, the app seeds five sample sessions across one week so the dashboard, heatmap, history, and progression graphs can be evaluated immediately. Set `GYM_SEED_SAMPLE_DATA=false` before first startup to disable this. Seeded workouts are labelled **Sample**; **Remove samples** in History deletes all of them without affecting real workouts or video sessions, and they will not reappear after a restart.

Long training logs load in windows. At startup the app requests `/api/dashboard?calendar_start=` and `/api/workouts/snapshot?start=` from the first day of the month two months back. After an interactive sign-in, the app mounts beneath the sign-in screen while it plays its exit animation (`AUTH_EXIT_MS`), so these requests overlap the animation. The dashboard's `history` summary (total, first and last workout dates, sample flag) tells the client whether older data exists. Scrolling a calendar past its oldest month, or choosing Show more after revealing the loaded History workouts, fetches the previous six months from `/api/workouts/snapshot?start=&end=` and `/api/calendar?start=&end=`. Streaks and the next-workout rotation still read the whole log on the server. The workout logger's PR badges and previous-set suggestions add `/api/exercise-history-baselines?before=`, a per-exercise summary of everything older than the startup window. Requests without these parameters still return the full history for clients that have not refreshed.

Training stays current across signed-in devices with a lightweight account revision check every five seconds while visible, plus checks on focus, returning to the app and reconnecting. Unchanged revisions reuse the current screen; changed revisions refresh the loaded history window, dashboard, body measurements and records, along with open progress, cardio, body-goal and own-profile views. Failed reads, and slow reads answered from the device's saved offline copy, are retried without acknowledging the revision. Workout creates and updates return the revision they reached in an `X-Workout-Revision` response header, so the refresh after finishing or editing a workout starts all of its reads at once instead of first asking for the revision; without the header (an older server) the app checks the revision as before. `GET /api/auth/me` and `POST /api/auth/login` report the account's current revision in the same header, so opening the app reads the dashboard, workouts, exercises, check-ins and records straight after the session check, with Social's friends and feed and the exercise trends loading beside them rather than after them. Your own profile, which loads while hidden, waits until those reads have finished. Unsaved logger entries remain separate from refreshed saved history. This synchronizes saved training; it does not transfer an in-progress workout between devices or merge simultaneous edits to the same workout.

Finishing a workout returns to Home immediately; saving an old workout returns to Sessions while the request continues. The saving/updating indicator, routine notifications and workout-completion PR summary leave navigation and scrolling available. Routine notices dismiss themselves after three seconds, completion records after five, and both can be closed earlier. Pop-ups that close by themselves use four times from `POPUP_MS` in `frontend/src/popupTiming.ts`: **quick** (2.5 s) for frequent, easily redone actions such as deleting a set, removing a rest, swapping an exercise, clearing compared lifts and **Back online**; **standard** (3 s) for everyday confirmations, the connection notice's label and the weekly sets shelf; **important** (5 s) for warnings, personal records and undoing what is hard to redo, such as deleting a workout, removing a goal, a friend or a workout type, and **Workout saved**; and **critical** (7 s) for errors. A toast takes its variant's time unless its owner picks one, and a message over 90 characters gets at least the important time. An Undo window lasts as long as its toast. Hovering, pressing or focusing a toast pauses its countdown. Save failures retain the logger entries for retry and preserve a screen the person has moved to.

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

Each account chooses who can see its profile in **Settings > Account & privacy > Profile sharing**: **Private**, **Friends only** (its friends; stored as `followers`) or **Public** (every sharing member; the default for newly created accounts). Existing accounts without stored choices remain private. Only accounts that share can open **Shared profiles**, send friend requests, and accept, decline or remove friends. Workouts, cardio and the profile photo are always part of a shared profile; a friends-only profile shows only its name and photo until the two members are friends. Machine photos (those pinned to shared workouts), body weight (including body weight logged with sets), goals (the active body-weight goal and weekly Zone 2 target) and notes are separate opt-ins. Usernames appear only for public profiles, in friend suggestions and people search results; videos and sample data are never shared. Going private hides the profile from other members and hides other profiles immediately while keeping choices and friendships. The owner can still view their own training profile without enabling sharing; the shared content choices also apply to this preview. Profile retains name and photo editing (the username is shown locked), the calendar, training totals and workouts. Settings holds sharing choices, account UUID, password, sign-out and account deletion. Friend requests always need accepting, including for public profiles. Disabled accounts are hidden and admins have no extra access. Migration `0033_profile_sharing` (release 0.5.3) adds the `profile_sharing` table, which account backups include, and `profile_follows`, which they leave out because follows involve other accounts. Both are deleted with the account. Migration `0037_follow_notifications` adds a per-follow dismissed flag. Migration `0040_friendships` (release 0.10.0) replaces `profile_follows` with `friendships`: one row per pair, stored with the lower account id first, plus the requester, status, dates and a notification flag. An accepted follow in either direction becomes a friendship; pairs with only pending follows keep the earliest request. Friendships are excluded from account snapshots and deleted with either account. The notification bell shows friend requests waiting for you and your requests that were accepted, refreshes immediately through the signed-in WebSocket while connected, on focus and reconnection, and every 30 seconds while visible as a fallback, and lets you accept or decline. Existing friendships are marked seen during upgrade; accepting a request notifies only the requester.

Friend QR codes hold an ordinary app link, `https://gym.example.com/#friend=<account id>`, so any phone camera can open them without the app installed. The account id is used because usernames can change. On load (and on `hashchange` in an open app) the frontend moves the invite into this tab's `sessionStorage` and removes it from the address bar, so it survives a reload, signing in and creating an account. Once signed in, the app sends that member a friend request (the normal `POST /api/sharing/friends/{id}`, which accepts their request if they had already asked) before opening their profile, and shows a toast with **Undo** that cancels the request. Existing friends and sent requests are left unchanged; if sending fails, the profile keeps **Add friend**. Scanning your own code opens your Profile. The invite is used once, and onboarding prompts wait until the member leaves the opened profile. The QR sheet checks the owner's sharing choice: a private profile cannot be found, so it offers the sharing settings instead of a code. No backend change is involved; profile visibility, blocks and request acceptance apply as usual. QR codes are generated in the browser with `uqr`. The sheet's **Scan** tab reads codes with the device camera (`getUserMedia`, back camera preferred) and `jsqr`, which is loaded only when scanning starts. It accepts any `http(s)` link with a `#friend=` hash, ignores other codes and your own, then hands the account id to the same invite flow (`openFriendInvite` and the `relay:friend-invite` window event). The camera stops when a code is read, the tab changes or the sheet closes. In-app scanning exists because an installed web app on iPhone cannot receive links from the system camera: they open in Safari, which has its own sign-in. **Native app note:** if Relay becomes a native app with universal or app links, the system camera can open friend links directly in the app and this scanner may no longer be needed. Keep the `#friend=<account id>` link format so codes already shared keep working.

When upgrading an email-based account database, migration `0030_username_accounts` derives usernames from the old address's part before `@`, replaces unsupported characters with hyphens, and adds numeric suffixes for duplicates. Short or unusable names become `user`. Account IDs, passwords, sessions, preferences and workout ownership are preserved. Run `python -m app.manage list-users` after migration to see the assigned usernames. The account email column is removed; rolling back requires the pre-upgrade database backup and previous app version. Existing backup archives stay unchanged; new account snapshots use manifest format 2 with an owner username.

Lift comparisons use what a member already shares. The **Head to head** card on another member's
profile starts empty: **Choose lifts** opens a searchable list of your strength exercises, with the
member's best beside each one they have logged too, and the lifts you tick are compared, your best
against theirs. The choice is one list per account, stored as the `head_to_head_exercises` account
setting (your exercise ids, in the order added, at most 20), so it shows for every member you
compare with until you change it; a merged exercise is followed to its target. `GET
/api/sharing/profiles/{id}/lifts` returns that choice and every strength exercise you can choose
with both bests, and `PUT /api/sharing/lifts` saves the choice. `GET
/api/sharing/lifts/{exercise_id}` backs the **Friends** card on an exercise's progress page: one of
your exercises, ranked against the friends who have logged it too. Each account owns its own
exercises, so lifts are matched by name, ignoring case and using the import aliases. A member's
best is the completed working set with the highest estimated one-rep max (Epley, one to thirty
reps); warm-ups, missed sets and sample workouts never count. Each account is compared in its own
normalised machine weights when it normalises that exercise, as its progress chart's **All
machines** view is, and as logged otherwise, so one side can be normalised while the other is not;
normalised figures are marked with ≈. The comparison routes follow profile access: a private or
blocked profile is not found, a friends-only profile needs an accepted friendship, and an account
that shares with nobody gets no friends ranking.

Blocking a member from their profile prevents shared-profile discovery and
access in both directions, including profile and machine photos, workout filters, history,
reactions and recent activity. It removes the friendship or request and reactions between those accounts.
Blocked members remain in the owner's **Blocked** list in **Social > Friends** for unblocking, even
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

There is no self-service password recovery. **Forgot password?** on the sign-in form asks the administrators for a temporary password (`POST /api/auth/password-reset-request`, public). It only records `users.password_reset_requested_at` (migration `0061_password_reset_requests`) and never changes the password, so naming someone else's username cannot lock them out. The reply is the same for every username, and one address may send 5 requests in the sign-in throttle's 15-minute window. Administrators see waiting requests in the notifications bell (`GET /api/admin/password-reset-requests`) until they are handled. A new request also sends a phone alert to every other active admin with alerts turned on. The alert goes out after the reply is sent, so reply timing does not reveal the account. Asking again while a request is open sends nothing. Tapping the alert opens `/?admin-account=<id>#admin`; the app removes the query and opens that account. **Review** opens the account in the admin console, where requested accounts are listed first and highlighted. A request ends when an admin resets the password, dismisses it (`DELETE /api/admin/password-reset-requests/{user_id}`), or the person signs in or changes their password. Requests also expire after 7 days, and disabled accounts are never listed. Check who is asking before handing over a temporary password, because anyone can type a username into the form.

**Forgot username?** on the sign-in form works the same way for a forgotten username (`POST /api/auth/username-reminder-request`, public, with the `name` on the person's profile). The active account whose display name matches, ignoring case and spacing, gets `users.username_reminder_requested_at` (migration `0064_username_reminder_requests`); nothing else about it changes and the username is never shown to the person asking. The reply is the same whether or not a name matches, and the request has its own 5-per-window allowance per address. Admins see these in the notifications bell (`GET /api/admin/username-reminder-requests`) and get a phone alert that includes the username. In the admin console the account is tagged **Username requested** and listed first, and **Dismiss request** clears it (`DELETE /api/admin/username-reminder-requests/{user_id}`) once the admin has passed the username on. Signing in also clears it; it expires after 7 days like a reset request.

Display names are unique so that a name identifies one account. Sign-up, `python -m app.manage create-user` and **Edit profile** refuse a name another account already uses, ignoring case and spacing (`409 display_name_taken`); changing only the case or spacing of your own name is allowed. The check is in the application, not a database constraint, because accounts that already shared a name keep it until one of them changes it, and Forgot username flags every active account with that name. People cannot change their own username: **Edit profile** shows it locked and `PATCH /api/profile` answers `409 username_locked` to a different `username` (the unchanged value older apps send is still accepted). An administrator changes it from **Admin console > Accounts > Change username** (`PUT /api/admin/users/{user_id}/username`), including their own; the person's open app shows the new username after it next loads their account.

An administrator resets a forgotten password from **Admin console → Accounts → Reset password** (`POST /api/admin/users/{id}/reset-password`), which signs the person out everywhere, clears any sign-in lockout and returns a one-time temporary password for the admin to pass on. The account is flagged `must_change_password`: its only working endpoints are the sign-in check, sign-out and the password change (`password_change_required` otherwise), and the app shows a choose-a-new-password screen until it is changed. `python -m app.manage reset-password --username <name>` sets a password of the operator's choosing from the server without the forced change.

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

The menu has one current dark/blue theme, with three total stats above three weekly/bodyweight-trend stats. The old powerlifting stars menu is retired. Building replaces the previous `frontend/dist` assets. The server revalidates HTML, the service worker, and the manifest; fingerprinted assets may be cached. Release information is checked every minute while visible and online, and when returning or reconnecting. A new release displays a top notification with a refresh arrow; **Settings > What's new > Check for updates** also checks the worker. Replacement workers download in the background and wait, preserving the current cached assets. An update applies by itself only when it is ready within a minute of opening the app (a cold start, or returning after at least five minutes away), before anything is touched, with no unfinished workout draft, focused field, open dialog or save/upload in flight; see [App versions and API compatibility](#app-versions-and-api-compatibility). Otherwise nothing reloads automatically, including when another tab activates an update. The refresh arrow waits for installation and activation, then reloads. An active workout flushes its local draft first; storage failure, an in-flight workout save or editing a previously saved workout blocks the refresh until the work is saved. Release popups describe the loaded version and remember dismissal per account/version in this browser, and on the account through `/api/app-notices` (see [Prompts when the app opens](#prompts-when-the-app-opens)). The Vite development server replaces any installed production worker with a cache-clearing pass-through worker while preserving push support. Workout data, drafts, settings, and push subscriptions are retained. A local workout draft needs the exercise catalogue to reload successfully before it can be restored; failed or incomplete requests preserve the draft for retry.

Choose the pencil on **Today** to customise the Home Screen directly. The cards gently wiggle and show a drag handle at the top right, a width button beside it and a minus button at the top left. Drag a handle to move its card, or focus it and use the keyboard arrow keys; use the width button to expand or shrink a card, minus to hide a card and **Add sections** to restore it; a section added there goes straight after the first card and is scrolled to and outlined once. Sections with display options also show **Customise**; the cardio goal card can track one zone goal or every goal, with a progress bar, ring or list design. **Save layout** stores order, widths, visibility and these options in your account across devices; the highlighted pencil saves too. **Cancel** discards unsaved edits, and **Reset layout** restores the original arrangement and sizing before saving. While editing, the header's other buttons are inactive; leaving Home another way, such as an edge swipe, keeps the draft and editing resumes on return. An active workout's Resume card always stays visible. Card actions pause while editing, and reduced-motion settings disable the wiggle. These preferences use the existing account settings table and need no migration.

Cardio sessions accept optional whole-number calories (kcal), average heart rate, distance, average speed, incline, average indoor-cycling power, elevation gain in metres, and average MET. Prefer active calories from the machine or watch. **Log metrics / Edit metrics** works for both standalone sessions and cardio linked to a workout. Blank means unknown; zero is a recorded value where valid. The Cardio screen compares calories, fat-energy equivalent, average heart rate, distance, average speed, average incline, average MET, and elevation gain across This week, This month, 3 months, 6 months, This year, and All time. Period-average MET is weighted by duration. A session with no MET logged is estimated (`backend/app/cardio_estimates.py`): from speed and grade with the ACSM walking and running equations, from cycling power and body weight, from active calories and the body weight nearest the session date, or otherwise from a typical value for the activity. Elevation gain left blank is calculated from incline and distance. A logged value always replaces its estimate, and the screen marks estimated session values with ≈. The API returns estimates as `estimated_mets` and `estimated_elevation_gain_m` beside the logged `average_mets` and `elevation_gain_m`; period totals still include `met_minutes` for app releases that chart it. Each range except All time is compared with its immediately preceding equivalent period. The week follows the saved week-start preference; month/year are calendar periods to today, and 3/6 months are rolling periods anchored to today. Future sessions are excluded and metric coverage counts make partial data clear.

The comparison uses 7,700 kcal per kg as a conventional approximation and is explicitly not measured fat loss or a food deficit. It does not estimate calories automatically or infer past entries from duration. See [Hall's discussion of the energy rule and its limitations](https://pubmed.ncbi.nlm.nih.gov/17848938/). Run `alembic upgrade head` and restart the backend before serving a metrics-enabled frontend; normal `start-app.ps1` startup handles the migration and build.

The normal multipart upload is intentionally non-resumable: if a file upload fails, retrying restarts only that file. The client-generated clip ID makes the retry idempotent, while successful clips remain intact.

## YouTube completion alerts

After an upload finishes, YouTube may still need time to create playback versions. The backend polls the video's owner-only `processingDetails` status every 20 seconds and only marks the session complete when YouTube reports success. It sends a Web Push notification to every subscribed phone if YouTube finishes successfully or reports a failure.

On the installed phone PWA, enable **Settings > Notifications > Phone alerts**. The browser asks for notification permission, saves the phone's subscription, and sends a test alert immediately. iPhone notifications require the PWA to be installed from Safari's **Add to Home Screen** flow. The server creates its local VAPID private key at `data/web-push-vapid-private.pem`; this is ignored by Git and must remain private.

The workout logger uses the same subscription for rest-timer alerts. Start a rest timer and tap **Alert** on its compact top bar once; subsequent rest timers notify that phone automatically, including while the PWA is backgrounded or the screen is locked. Extending or skipping the visible timer reschedules or cancels its pending notification. The running rest is kept on the device beside the draft (`relay.live-rest-timer.v1` in `frontend/src/liveRestTimer.ts`, tied to the draft's session), so reloading the app restores the countdown, a paused rest or the finished-rest prompt; the synced draft format is unchanged.

Active workouts are private account-wide drafts at `GET/PUT /api/active-workout`. Both devices
can resume and edit the same workout. The presence socket sends a content-free `active_workout`
invalidation only to that account's authenticated windows; reconnect, focus and a visible
30-second fallback also refresh it. Drafts remain in local storage for offline recovery.
Each device retains its acknowledged base and the server merges independent fields and stable
movement/set keys. Concurrent edits to the same value, or deleting a set another device edited,
require choosing a version in **Workout sync conflict**; both copies remain until that choice. The dialog lists only what differs (per set, exercise and note, in the account's weight unit; see `frontend/src/activeWorkoutSyncDiff.ts`).
Finishing consumes the shared revision in the workout-save transaction. Stale completions remain
in the device's existing recovery queue, and ended drafts cannot be revived by reconnecting.
The additive save fields `active_workout_revision` and `active_workout_session_id` are transient
concurrency guards; older clients retain their existing save contract. Open the updated app on
each device to participate in live draft sync.

With Phone alerts enabled on a device, the server sends **Still working out?** after 45 minutes
without workout interactions on either device. An open socket, visible window or reconnect does
not reset the timer. Actual input, taps and scrolling in the logger do. It sends once per idle
period to the account's subscribed devices, survives backend restarts, and resets after further
activity. Finishing or discarding cancels it. Offline activity and cancellation reach the server
when that device reconnects, so the server can only act on activity it has received. Migration
`0057_active_workout_sync` creates the private draft, revision tombstone and reminder state;
account deletion removes them and account backups exclude them. Legacy two-hour reminders remain
supported for older clients, and are suppressed for a session using shared activity tracking.
A workout left running can be saved with **Actual duration (minutes)**; the correction stays in
its draft until saved. Inactivity reminders do not finish or discard the workout.

**Settings > Training > Unfinished workouts > Auto-save** is off by default. Then a workout left
running past its cutoff (three hours from the start, and never within 30 minutes of the last
workout activity) waits for **Save workout**, **Resume** or **Discard**. With it on, the chosen
time from 1 to 6 hours replaces the three hours, and the server saves the workout once that
cutoff passes, even when every app window is closed, then sends **Workout saved** to the
account's phones. The setting is the account-owned `workout_auto_save_minutes` user setting at
`GET/PUT /api/workout-auto-save` (`after_minutes`: null for off, or 30 to 720 in 15-minute
steps). Each device keeps a copy so the cutoff is known offline.

The server never re-derives the workout. With each draft revision the logger sends, as the
optional `autoSave` field of `PUT /api/active-workout`, the finished workout that **Save
workout** in the inactive-workout prompt would save. Either way the workout ends at its last
activity (`lastActiveAt`, such as the last set logged), not at the cutoff that noticed it was
left, and the prompt shows that end time; see `inactiveWorkoutEndAt` in
`frontend/src/activeWorkoutTimeout.ts`. The server keeps it
only while it matches the stored draft exactly; any other write, including a merge with another
device's edit or a save from an older release, clears it. The scheduler (every 15 seconds)
saves a due workout through the normal create or resumed-workout replace path, consuming the
shared revision in the same transaction, and clears the workout from friends' live activity.
When the logger could not prepare it (nothing logged, sets needing a machine, an unsynced or
offline device), or the save is refused (for example, the resumed workout was edited elsewhere),
the workout keeps waiting for the owner's choice as it does with auto-save off. Migration
`0059_workout_auto_save` adds the prepared copy to `active_workout_sync`.

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

### Full backups in Settings

**Settings > Data & connections > Full backup** lets each person download and restore their own account without an administrator. `GET /api/account-archive` streams a zip of the same snapshot `backup-account` writes (account rows with the password hash blanked, machine and profile photos, and a manifest with each file's size and SHA-256), built in a private work folder under `data/archive-work/` that is deleted once sent.

`POST /api/account-archive/preview` checks an uploaded archive and returns its workout, cardio, check-in, custom exercise and photo totals beside the account's current ones, changing nothing. `POST /api/account-archive/restore` replaces the signed-in account's training data with the archive's. The upload is treated as untrusted: only the expected file names are unpacked, within size and file-count limits, and every file must match the manifest. The database is opened read-only with SQLite's defensive settings and may contain only plain tables and indexes with names this app knows. An archive from an older release is migrated on a private copy in a separate `alembic` process; one from a newer release is refused. Rows are copied as values under the signed-in account; the account itself, sign-ins, video rows and server tables are left alone, and personal records are rebuilt. Every restored row must fall under its table's ownership rule and every reference must point at the account's own rows, so an archive cannot reach another account; one that collides with another account's rows on this server is refused. Photos are re-encoded under new names. Friends' reactions and comments on workouts the archive still contains survive; those on workouts it removes go. The account's limits apply to the archive (admins are exempt).

A restore runs in one transaction after taking a server-side snapshot labelled **Before restore**; the two newest are kept and appear in `list-backups`. Each account runs one archive operation at a time. The app reloads once after a restore so splits, blocks, layout and preferences are read again. Test with `backend/tests/test_account_archive.py` and `frontend/src/AccountArchivePanel.test.tsx`.

## Hidden account limits

Limits stop one account from bloating the server. They sit far above real use (a six-year log peaks at 55 sets and 9 exercises in one workout), and people are never told they exist: anything over a limit gets a plain "couldn't be saved" message, and the server log records which limit was hit. The exception is the photo upload size, which people are told ("Photos can be up to 5 MB."). The app also shrinks photos before uploading them (to 1,800 px on the long side, as JPEG), so phone photos fit easily. Adjust them under **Settings → Help & about → Admin console → Server → Account limits**; changes apply immediately.

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

**Skip and catch-up.** Home's Up next card shows **Skip** while it shows a split day, unless the split has no other workout day. Skip calls `PUT /api/training-split/position?on_date=YYYY-MM-DD` with the next workout step (rest days are passed over) and the current `rest_saved`; its Undo toast calls it again with the previous step. Each call saves a shift (from a date, the split stands at a step) in the `training_split_shifts` account setting, one per date, together with the start date, schedule and steps it was made for. A split saved with a different start date, schedule or day order ignores its shifts; renaming or editing exercises keeps them. A By date split counts each day from its latest shift on or before it, so missed days before a shift keep their original plan. A workout-following split's replay jumps to a shift's step at the start of its day, which is tomorrow when today's workout is already logged. The read returns the latest `shift`, which `splitStepOnDate` uses for By date previews; older apps ignore it and preview from the start date until they update.

`auto_shift` (default on) is stored on the split. `PUT /api/training-split` keeps the saved value when the field is omitted, a routine save with a schedule carries it over, and `POST /api/routines/{id}/use` accepts it. With it on, a By date split that missed two or more planned workouts in a row up to yesterday reports `catch_up: {on_date, step, missed}`, where `step` is the first missed workout. Rest days don't break the run and any of the split's workouts ends it. The app then moves the split with `catch_up: true` and shows an Undo toast. The server refuses that move with 409 `split_up_to_date` once the catch-up is no longer due, so another device or a saved dashboard can't repeat it. The latest shift starts a fresh count, so neither the catch-up nor its Undo happens twice. **Shift after missed workouts** in the schedule dialog (**Change schedule** or **Use split**) sets it for By date splits. Test with `backend/tests/test_training_split_shift.py` and `frontend/src/AppSplitSkip.test.tsx`.

**Start** (`AppTabBar.tsx`) offers three choices: Cardio, Up next and Empty. Home's default section order (`HOME_SECTIONS`, and `HomeSection` on the server) leads with the next workout, then the profile; a saved layout keeps its own order.

Tapping today (when a split is on) or a later day without a workout, in Home's week strip or the Training calendar, opens `PlannedDaySheet.tsx`. `plannedDay.ts` reads the day's plan from the same split preview the calendar outlines (`splitPreview` now also returns each day's `step`), and the routine day at that step, when its type still matches, supplies the exercises. `splitDayTemplate` in `upNext.ts` builds the template exactly as Up next does: the routine day, then the type's saved exercises, then the last session of the type. Today's plan offers **Start** and **Empty**; a rest day today offers the next training day instead. A later day is read-only with **Start now**, which starts that day's workout today, so no workout is ever dated ahead. Past days still log a missed session on their own date. In the calendar's day sheet, a logged workout's row opens its session card (on Training, on its page) and **Edit workout** opens the editor. On Training, types switched off in the calendar legend also leave the session list and its week totals.

## Body measurements

`GET /api/body-sizes` returns private dated circumference logs, newest first. `PUT /api/body-sizes` replaces the entry for `measurement_date`; omitted fields clear to null, and at least one finite circumference above 0 and up to 300 cm is required. `DELETE /api/body-sizes/{YYYY-MM-DD}` deletes only the signed-in account's entry. Each date is stored in its own `user_settings` row under `body_sizes:YYYY-MM-DD`, included in existing account backups and deletion. Writes change the training revision so other devices refresh Body. No schema migration is required. The UI converts inches to canonical cm and does not require a bodyweight record. These logs are excluded from shared profiles.

## Rep ranges and progression targets

A planned exercise in a split day (`/api/routines`) or a workout type (`/api/workout-type-exercises`) accepts an optional `rep_range` of `{min, max}` (1–100, `min` no more than `max`); cardio exercises ignore it. It is stored in the same `user_settings` JSON as the plan, so no migration is needed, and it is copied with shared splits and returned with the day's planned exercises on the dashboard. Saves replace the whole plan, so `rep_range` is registered under `routine_movement` in `FIELDS_ADDED_IN`: an older app that omits it keeps the stored range for an exercise in the same position, while an explicit value, including `null`, is always taken.

A workout started from the plan carries each exercise's range in the active draft (`repRange`). The logger shows one target line per exercise from `frontend/src/repProgression.ts`, using double progression on the exercise's last session with working sets (the pinned machine's when it has one; a session cut short to warm-ups is skipped): warm-ups are ignored, the sets at the heaviest weight decide, and once all of them reach `max` the line suggests the next weight (2.5 kg, or 5 lb for pound users); otherwise it says to stay at the weight. When the workout starts, working sets the plan left without a weight are pre-filled with that target weight as unticked suggestions; warm-ups and weights the plan set are left alone. Test with `backend/tests/test_rep_ranges.py`, `frontend/src/repProgression.test.ts` and `frontend/src/AppRepTarget.test.tsx`.

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
unchecked suggestions. On a rest day the recommendation also carries `next_training_day`, the
cycle's next training day (with its routine day), which **Start > Up next** starts instead; Up
next is hidden when there is none. Editing an active routine updates its schedule while preserving
the start date, unless a schedule change is explicitly included in the same atomic save.
Editing the schedule directly clears its routine link; deleting the
routine keeps the schedule and restores history-based suggestions. Mutations invalidate
the account's training revision. Test with `backend/tests/test_routines.py` and the
frontend `RoutinePanel` and workout recovery tests.

## Renaming and hiding exercises

`PATCH /api/exercises/{id}` accepts an optional `name` and `hidden`. Only custom exercises can be renamed (`422` otherwise); a name that matches another of the account's exercises after canonical spelling and case folding is refused with `409`. Workouts, records, photos and routines reference the exercise by ID, so they follow a rename. Any exercise can be hidden. Hidden IDs are stored as a JSON list in the account's `hidden_exercises` setting, so they are per account, included in backups and need no migration; `GET /api/exercises` reports `hidden` on each exercise. The app leaves hidden exercises out of the workout picker, swap alternatives and split exercise search, and shows them in the exercise library only under the **Hidden** pill. History, progress and personal records are unaffected. Both changes bump the training revision. Older app versions ignore the new field and keep listing hidden exercises. Test with `backend/tests/test_exercise_edit.py`.

## Exercise merges

Exercise merges use `POST /api/exercises/{source_id}/merge` with `target_exercise_id`.
Both exercises must belong to the signed-in account, the source must be custom and their
kinds, equipment categories and complete configured muscle-group lists must match.
Muscle matching includes partial credits even when weekly partial counting is disabled;
credit factors and muscle order do not need to match. Equipment spelling aliases follow
the library's categories (for example, DB and Dumbbell). The merge dialog lists exercises
that do not yet match as **Needs changes** and shows the differences; **Change** sends
`PATCH /api/exercises/{id}` with the destination's `equipment` and `muscle_set_credits`,
which only a custom exercise accepts, after which the merge passes the same checks.
Cardio exercises have no muscle credits to change. The transaction transfers
movements, machine photos and saved routine
references, retains the destination's muscle credits and existing defaults, and rebuilds
records against the combined history. Photo-specific presets move with their photos;
an existing destination weight mapping wins because separate reference scales cannot be
combined safely. Account-local `exercise_merge:` settings flatten old IDs to the destination
and are included in account backups. The catalogue's `merged_from_ids` restores old local
drafts; workout/cardio saves and stale routine editors also resolve those IDs. Import undo
keeps destinations referenced by merges. Test with `backend/tests/test_exercise_merge.py`,
`ExerciseMergeDialog.test.tsx` and workout recovery tests.

Merge suggestions (`frontend/src/exerciseMergeSuggestions.ts`) score how closely a custom
exercise's name matches each standard exercise, from 0 to 1. Names are compared word by word
after expanding shorthand (DB, RDL), singular forms, joined words (benchpress) and a few
synonyms; extra words lower the score instead of ruling a match out, and a one-letter typo
still counts. Equipment named in the custom name rules out other variants, its equipment
setting counts as one more word, and a match that shares no muscles is marked down. A name in
a standard exercise's `alternative_names` (the server's `EXERCISE_ALIAS_GROUPS`, such as
Military Press for Overhead Press) is a certain match. The merge dialog lists matches of 0.6
or more under **Suggested** until a search is typed, and a custom exercise's page shows its
best match of 0.8 or more with a shortcut into the merge. **Not the same** hides that
suggestion on the device (`gym-logger-dismissed-merge-suggestions`). Test with
`exerciseMergeSuggestions.test.ts` and `ExerciseMergeNudge.test.tsx`.

## Checks

While developing, run the tests for the behaviour you changed. From the repository root,
after activating the virtual environment:

```powershell
python -m pytest backend/tests/test_workout_types.py -x
ruff check backend/tests/test_workout_types.py
```

pytest imports `app` from the checkout it runs in (`pythonpath` in `pyproject.toml`), so a
virtual environment shared between Git worktrees needs no `PYTHONPATH`. `conftest.py` stops
the run if another checkout's `app` would be imported instead.

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

The GitHub **Checks** workflow selects checks for feature PRs, including
stacked PRs, from the changed files in the exact tested merge commit:

- Plain stylesheets directly under `frontend/src/` get CSS formatting checks and the
  production build, including TypeScript. A padding-only PR skips ESLint and Vitest.
- Changes confined to top-level frontend test files or TypeScript modules with a changed
  same-name test run Vitest against the tested merge's first parent. This runs changed
  tests and suites that import the changed modules. Plain stylesheets can accompany them.
  These PRs also run frontend formatting, lint and the production build.
- Other frontend changes, including removed files, configuration and modules without a
  matching changed test, run the full frontend checks. Changes under `backend/` or to
  `pyproject.toml` or `alembic.ini` run the full backend checks.
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
or authorise a merge or deployment. The separate **Dependency security** workflow audits installed Python packages and the npm lockfile on every PR.

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
  _Not reported_).
- `MIN_WRITE_CLIENT_VERSION` (default `None`) makes the API refuse saves from older or
  unreported releases with `426 client_outdated`. Reads and `/api/auth/*` stay open. The app
  then shows **Update needed to save**, keeps a finished workout or body check-in queued on
  the device without asking for a review, and sends it once refreshed.
- `FIELDS_ADDED_IN` lists fields added to a full-replace save by the release that introduced
  them. When an older release replaces that record, the stored value is kept rather than reset.
  Workout updates (`PUT /api/workouts/{id}`) apply it to workout, exercise and set fields,
  matching exercises by position and exercise and sets by position.
  Home layout saves preserve registered section settings omitted by older apps. Explicit settings
  are accepted for feature previews before the release coordinator assigns their version.
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

- The app downloads as two script files. The first (about 115 KB compressed) holds the sign-in screen, the session check and Home's outline; the signed-in app (`App`, about 410 KB compressed) is a separate file that starts downloading as the page starts (`appLoad.ts`) and shows the moment it arrives. If it cannot be downloaded, **Relay could not finish loading** offers **Try again**, which reloads the page. The offline worker registers only after that download has ended, so its first install does not compete with it or fetch it twice. All stylesheets stay in the first file, imported in one fixed order from `appStyles.ts`: a stylesheet imported only from the signed-in app would load after the others and change which of two equally specific rules wins, so every stylesheet must be listed there (`appStyles.test.ts` fails otherwise).
- The service worker precaches the app shell, Inter font, exercise icons and in-app images, about 1.8 MB in total. Exercise icons are WebP files of roughly 6 KB each. Release videos and release-note media hosted on GitHub stay online-only.
- Account reads are saved on the device as they load: the exercise library, workout types and colours, training and cardio preferences, split, Home layout, dashboard, recent workout history, personal records, body measurements and goals, cardio, training time, progress and machine-photo lists. The saved copy answers when the device reports no connection, the server cannot be reached (including 502-504 proxy errors), or the server has not answered within 4 seconds. A late answer refreshes the copy. A slow answer is not treated as being offline.
- The connection notice waits until an outage has lasted. A request that gets no answer (no connection, a timeout or a 502-504 proxy error) starts quiet checks of `GET /api/health` after 2, 4 and 8 seconds, then every 8 seconds, and any answer ends them. The notice appears only when nothing has answered for 20 seconds and at least two attempts failed, so short drops on a patchy signal stay silent. A read answered from the saved copy because it was slow runs at most one quiet check every 15 seconds. The notice says **No internet** when the device reports no connection and **Offline** otherwise, then shrinks to an icon after 3 seconds; the icon opens the internet state; when the internet is connected, the server as **Offline** (a proxy answered 502-504, so Relay is not running) or **Unreachable** (nothing answered); the last connection time, finished workouts and check-ins waiting on the device, and **Try now**. Once shown it checks every 10 seconds, and straight away when the device reconnects or the app returns to the foreground. It stays for at least 4 seconds, then shows **Back online** for 2.5 seconds. Checks run only while the signed-in app is open.
- A device that remembers an account opens it at once from its saved copies, before the session check answers. Until the server confirms the same account, every request that changes data is held (`sessionGate.ts`): it is sent once the account is confirmed, and refused if the session has ended or belongs to another account, whose sign-in also wipes the remembered account's data. Reads, signing in and signing out are not held. When the session check fails or takes longer than 4 seconds the account stays open offline and changes are tried as before. A first visit on a device still needs the server. Test with `frontend/src/AuthGateOpening.test.tsx`.
- After each complete refresh the device records the revision its saved exercises, workouts, records and check-ins were read at, and the day the dashboard was read for (`startup-data-v1`). The app opens with those copies at once, so every tab has its figures without waiting for the network, and treats them as current once the server reports that same revision. When the server is at another revision the copies stay on screen under **Updating your training…** until the opening reads replace them. Those reads run either way, so a change that does not move the revision is picked up as before. A missing copy, copies not all read at one revision, or copies saved by another release wait for the server instead. Test with `frontend/src/apiStartupData.test.ts` and `frontend/src/AppOpeningData.test.tsx`.
- The settings Home is built from (training blocks, training preferences, the Home layout, workout types and their saved exercises) also show this device's copy until their own read answers (`api.saved`), so Home opens in its final shape: no card appears late and pushes the others down. The copy is display only. The blocks and types still count as loading and the layout cannot be edited until the server has answered, so an older copy is never saved over a newer one. Friends' activity and notification counts are not kept on the device and still arrive from the server. Test with `frontend/src/savedSettingsFirst.test.tsx`.
- Nothing is started or recorded from figures that may be out of date. The revision does not cover the calendar, so the record above also keeps the day the dashboard was read for, and Home's figures count as confirmed only once the server has answered or has confirmed no change since they were saved that same day. Until then a start that follows them (the recommended day, a split day, a routine, cardio) waits under **Getting your latest training…** and then uses the confirmed figures; an empty workout starts at once. The weekly review and tips wait too. An exercise added or changed while the list is still being read is kept: the older answer is dropped and the refresh is left unacknowledged, so the next check reads the list again.
- Saved copies live in IndexedDB. Each record is gzip-compressed, then AES-GCM encrypted with a non-extractable Web Crypto key stored beside it and bound to the owning account and record name. Sign-out, account changes and confirmed revocation delete the records and the key. Encryption protects copied storage files; the device lock protects an unlocked browser. Origins without Web Crypto (plain HTTP other than localhost) store compressed records without encryption. Passwords are never stored on the device.
- Stored workouts take about 0.9 KB each, and the default exercise library about 3 KB. A year at three workouts a week, with its dashboard and personal records, is roughly 0.2 MB. History beyond the startup window is saved only after it has been opened.
- Finishing a workout stores it on the device before it is sent, in a queue of finished workouts (`gym-video-logger.finished-workouts.v1` in local storage) kept apart from the in-progress workout, so another workout can start straight away, including offline. Each entry keeps its whole draft. The queue sends oldest first, one at a time, retrying with backoff; a workout the server refuses waits for **Review workout** without holding back the others. Each new workout is sent with its client session ID, so a retry cannot create a duplicate. Waiting workouts show in History and Home without routine sync cards, badges or saving notifications, and cannot be edited or deleted until they reach the server. A finished workout an earlier release stored inside the in-progress draft moves into the queue when the app opens. When a session expires or is ended from another device, unsynced finished workouts and the in-progress workout, with the server copy it was last synced against (`relay.active-workout-sync`), are kept for the same account, which `relay.signed-out-account` records; on sign-in the workout syncs through the usual merge or conflict dialog. Signing out on the device and a different account signing in discard them. `POST /api/auth/logout-session` ends only the calling browser's session (the app removes that browser's push subscription first); `POST /api/auth/logout` ends every session for the account.
- The finished-workout card on Home is built on the device by `buildFinishSummary` from the payload being queued, so it needs no response from the server. It is kept per account in local storage (`relay:finished-workout:v1:<account>`) for 18 hours, and cleared when dismissed or when another workout starts. Records are added to the card, instead of the completion toast, when the saved workout's `client_session_id` matches the card's; other workouts' records still use the toast. Its two suggestions are checked before they are shown: **Compare machines** needs `GET /api/exercises/{id}/weight-mapping` to report normalisation off with more than one saved machine, and **Set rep range** needs the active split's routine to plan the exercise without a range, which it then saves with the existing `PUT /api/routines/{id}`.
- Every saved workout has a `revision` that advances with each change to its content. An edit or a resumed workout sends the revision it was loaded from as `base_revision`; `PUT /api/workouts/{id}` checks and advances it in one statement and answers `409 workout_conflict` without saving when the workout has moved on. Editing cardio metrics that rewrite a workout's sets advances it too. The editor then asks whether to keep this device's version (it rereads the latest revision and saves over it) or load the latest and drop the local edits. A resumed workout keeps its base revision in the draft across reloads; a refused queued save shows **Keep my version** and **Discard** instead of replaying. Saves without `base_revision`, from releases before revisions, replace the workout as before. Test with `backend/tests/test_workout_revisions.py` and `frontend/src/AppWorkoutConflict.test.tsx`.
- Workout saves use Fetch `keepalive` when their UTF-8 JSON body fits the browser's 64 KiB limit, allowing an in-flight request to continue across normal page closure. Larger bodies and exhausted keepalive budgets fall back to an ordinary request. Hiding/leaving or restoring the page also wakes waiting saves. This is best effort: a force-closed browser, an offline device or a suspended page cannot guarantee delivery or drain the whole queue while closed. Unconfirmed workouts stay on the device and replay with the same session ID when Relay returns; no response is treated as an acknowledgement until the server confirms it. Navigation, body check-ins and another workout can proceed while a finished workout uploads. **Finish** saves straight away when every entered set is ticked (otherwise it asks, showing how many are ticked); Home's finished card then offers **Undo**, which resumes the saved workout, and **Share**. A new live workout saves its real start time and the end its saved duration reaches (`liveWorkoutTimes` in `frontend/src/workoutResume.ts`), so the server's duration from the times equals the logged duration; resumed workouts and edits keep their own times.
- The live workout clock can be corrected from the logger header. The correction is stored in the active draft as `adjustedMs` (time added to the clock, negative when time was taken off) beside the pause fields in `frontend/src/workoutPause.ts`; the session's `startedAt` never moves, so draft identity, inactivity limits and retry keys are unchanged. The live clock, the saved duration and the start time friends see all apply it. A new correction replaces the previous one, and releases that predate the field ignore it. Saved workouts keep their own timing editors.
- A live exercise is marked complete when ticking a set leaves none open, provided it has more than one set and the ticked set was not added with **Add set** in this session. Those added sets are remembered in memory only, so after a reload a hand-added last set completes the exercise too. The weekly sets shelf shows once per exercise through `exerciseSetGains`, which takes the exercise's earlier sets back off the live week so the gain covers all of them. The bodyweight ratio is shown on the exercise's heaviest logged set only. The equipment row is drawn for exercises whose equipment mentions machine, cable or smith, or that have a saved or pinned machine; otherwise it stays mounted but hidden, so saved machines still load and the last-used one is restored, and **Equipment photo** in the exercise menu reveals it.
- Sign-in, Social, notifications, sharing, settings changes, imports, exports, video uploads, machine-photo images and older history need a connection.

## Limitations and sensible next steps

- Uploads are not resumable and mobile browsers can suspend a backgrounded PWA.
- Settings and custom exercises cannot be changed offline. A refused finished workout reopens for review only when no other workout is in progress.
- A processing job cannot be cancelled once ffmpeg work begins; cancellation is supported during upload.
- Video processing handles one session at a time.
- Real YouTube uploads need credentials and internet access; mock mode remains ideal for local verification.
- Future milestones could add saved workout templates, richer YouTube processing progress, or carefully designed exercise analysis. AI exercise recognition and rep counting are deliberately out of scope here.

## Muscle set contributions

Home's **Sets per muscle** opens a bottom sheet when a muscle name is tapped. The dashboard's `weekly_sets.muscle_groups[].contributions` carries one entry per source workout movement: workout ID/name/date, movement and exercise IDs, working-set count, credit per set and total credits. These entries are calculated with the same account week boundary, muscle mappings and completed-working-set rules as the chart. Low-RPE working sets remain included in the chart's raw credits; future workouts, warmups, incomplete sets, cardio and failed sets with no completed reps are excluded. No schema migration is needed for these response fields.

The arrows on **Sets per muscle** step back through `weekly_sets_history`: the eight whole weeks before `weekly_sets`, newest first, each in the same shape and with its own contributions. Each earlier week lists the muscles trained in the four weeks up to its last day. The card compares the shown week with the one before it, using an outline bar and a signed change, and keeps one bar scale across every week. The dashboard loads workouts far enough back for these weeks whatever its `calendar_start`. Dashboards cached by earlier releases have no history, so the arrows stay disabled.

Each exercise row shows a right chevron and opens its source workout in the existing History view, focused on that movement. It does not enter the workout editor or replace an active workout. If the local snapshot is missing the source movement, the app refreshes that workout's day before navigating. Removed workouts or changed exercises leave the sheet open with an error. Dashboards cached by older releases without contribution entries show a refresh instruction rather than guessed exercise details.

## Tips

Tips are defined in `frontend/src/tipsState.ts` and kept per account in this browser's local storage (`relay:tips:v1:<account>`). Each has a surface: a **hint** is a dot beside a control, a **nudge** is a floating note, and a **home** tip is an inline card or an entry in Home's bulb.

- Nudges and inline cards share one showing per 24 hours. Hint dots interrupt nothing, so they neither wait for nor spend it. The warm-up tip is a priority tip and skips the wait.
- Showing a tip does not mark it seen. `tipShown` counts each showing in `shows`, and a tip is marked seen when it is opened, acted on or dismissed, or after `TIP_MAX_SHOWS` (3) untouched showings.
- A tip may carry an `action` with a label and a target. `tipActions.ts` sends the target as a `relay:tip-action` window event and the app shell opens it: Machine weights for an exercise, the weight goal form on Maintain, the training block dialog, Home's edit mode, Profile, the split screen or Appearance. A `TipSlot` anchored to the control it describes passes `onAction` to run it in place.
- Home's bulb (`HomeTips.tsx`) lists feature tips only, most useful first, using the `homeBody` wording when a tip has one. **Got it** there records the tip in `homeDone`, which removes it from the bulb without marking it seen, so its in-context hint can still appear.
- Triggers are tied to a moment: Machine weights once one exercise has used two machines (`multiMachineExerciseId`), merging machines only when two saved names look alike (`hasLikelyDuplicateMachines`), and a maintenance range when the latest weigh-in reaches the active loss or gain goal.

## App guide and feedback

New accounts see a guided feature tour before the release announcement. Use **Next**, **Back** or **Skip guide**, then optionally send private feedback from the thank-you screen. Ending or skipping the first tour opens an import step: **Import or export** opens **Settings > Data & connections > Import & export** with a one-page import popup. The same popup opens from **Show guide** directly below the section title. Select the source app, choose its original CSV and review before saving. During onboarding, **Skip for now** shows the release announcement. After choosing to import, the announcement waits until the person leaves Settings. The pending step is remembered per account in the browser, so a reload returns to it; replaying the guide later does not repeat it. Administrators read the latest 100 messages in **Settings > Help & about > Admin console > App feedback**; feedback is associated with the submitting username and deleted with that account. Messages are limited to 2,000 characters, 100 per account and the existing save-rate limit. A client submission ID prevents duplicates when a request is retried.

Open **Settings > Help & about > Feedback & feature requests** to send feedback, report problems or suggest improvements at any time. Messages are stored in the app database with your username and appear for administrators in **Settings > Help & about > Admin console > App feedback**. No email or GitHub issue is created.

Open **Settings > Help & about > App guide > Replay guide** to see the tour again, or **Add to Home Screen > Show steps** for the illustrated installation instructions. Both remain available from the installed app. Settings and the closing screen link to [contribution instructions](../CONTRIBUTING.md). Upgrade existing databases with `alembic upgrade head` for `0031_app_feedback` before serving this frontend.

## Prompts when the app opens

Four things can open by themselves when the app is opened: the first-run tour with its import step, **What's new**, the Home Screen guide and the weekly review. Only the first of them to open does so on a visit (`launchPrompts.ts`); the others keep their place and open on a later visit. Opening one on request, from Settings or the notifications inbox, is not limited.

`GET` and `PUT /api/app-notices` hold what an account has already seen, in `user_settings.app_notices`: `release_seen` (the newest release whose What's new was dismissed) and `weekly_review_seen` (the first day of the latest week whose review was shown). A `PUT` may send either field and only ever moves a value forward, so a device on an older release cannot bring a notice back. Because values only move forward, a `PUT` is refused with 422 when its week starts more than two days after the server's date (a device clock set ahead) or its release is newer than the app sending it (`X-Relay-Version`); the app then keeps the notice in this browser only. Saves take the database write lock before reading, so two devices recording at once are merged. The app reads it at sign-in and waits up to four seconds for the answer before going by this browser's own memory, which is also what it uses offline. What's new is skipped when `release_seen` covers the running release, and for an account created on or after the release's date.

## Exercise catalogue upgrades

Default seeding matches each account's exercises by case-insensitive name or the explicit aliases in `exercise_aliases.py`. A matched custom exercise keeps its ID, name, custom flag, favourites, muscle credits and explicit equipment; only blank equipment is filled from a recognised default. This invalidates cached workout snapshots once. Manual creation and CSV imports recognise the same aliases, preventing a second entry when an older custom name is retained. Unknown or ambiguous names are left alone, and equipment variants retain separate histories. The Custom pill combines with search and equipment filters in the library and workout picker.

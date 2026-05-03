# Winter Party Trivia — Design Specification

**Version:** 0.2 (Draft)
**Author:** [Your name]
**Last updated:** 2026-05-03
**Status:** Draft for review

---

## 1. Overview

A web-based trivia application to facilitate a one-off office staff party in the Hunter Valley. Players join from their phones, form teams, and submit answers to verbally-read questions across multiple rounds. A single admin (the author) controls the flow of the night, vets team submissions, marks free-text answers, and reveals the leaderboard at chosen moments to maintain suspense.

The app prioritises:

- **Low friction** for players (no accounts, just a name and a team passcode)
- **Low cost** (Supabase + Render free/starter tiers)
- **Low bandwidth** (the venue's wifi may be flaky)
- **Modular round design** so new round formats can be added without rewriting the core
- **Bespoke feel** with custom branding, in-jokes, and office-specific imagery

This spec covers V1 only. A "Stretch / V2" section captures features explicitly deferred.

---

## 2. Goals and non-goals

### Goals

- Support up to 100 concurrent users in a single live trivia event
- Run reliably on iPhones, Androids and laptop browsers
- Provide real-time team answer collaboration with last-write-wins conflict resolution
- Give the admin full control over event flow (open/close rounds, push pages, send messages)
- Allow modular round types (multiple choice, free text, numeric closest, mixed-format rounds)
- Allow manual marking of free-text answers with half-marks and bonus points
- Survive transient connection drops gracefully
- Look and feel custom-built, not template-y

### Non-goals (V1)

- Player image upload (presets only — see §13)
- Internet image URL pasting
- Hand-drawn answer input
- Mini-games
- Wagers and powerups
- Hints
- Tiebreaker logic (handled manually on the night)
- Persistent user accounts across events
- Multi-event support (one global event; wipe to restart)
- Payments, integrations, third-party SSO

---

## 3. Glossary

| Term            | Definition                                                                                                                                                                                                                                                                                                                                                           |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Player**      | An end user attending the party, joining via phone browser                                                                                                                                                                                                                                                                                                           |
| **Admin**       | The single facilitator (the author) running the event                                                                                                                                                                                                                                                                                                                |
| **Team**        | A group of players who collectively submit one answer per question                                                                                                                                                                                                                                                                                                   |
| **Round**       | A logical block of questions with a shared format and scoring rules                                                                                                                                                                                                                                                                                                  |
| **Question**    | A single item within a round, with its own input type and points                                                                                                                                                                                                                                                                                                     |
| **Submission**  | A team's locked-in answers to a round after a round closes                                                                                                                                                                                                                                                                                                           |
| **Lobby**       | A screen where players or teams wait between active states                                                                                                                                                                                                                                                                                                           |
| **Push**        | An admin-initiated forced navigation of one or more clients to a new page                                                                                                                                                                                                                                                                                            |
| **Score Event** | An event that results in a team officially receiving points. Examples include the end of a round (where they receive points based on how many questions they answered correctly), or the Admin deciding that the team should receive points or have points deducted for other reasons (e.g. as one-off bonuses or punishments for things happening outside the app). |

---

## 4. Architecture

### 4.1 Stack

| Layer    | Choice                                            | Notes                                    |
| -------- | ------------------------------------------------- | ---------------------------------------- |
| Frontend | Single-page app (framework TBD in build phase)    | Mobile-first responsive                  |
| Backend  | Python on Render                                  | Existing test app proves the setup works |
| Database | Supabase Postgres                                 | Free tier sufficient for one event       |
| Realtime | Supabase Realtime (websockets)                    | Direct from browser, bypasses Render     |
| Storage  | Supabase Storage (for branding assets only)       | Player image upload deferred to V2       |
| Hosting  | Render Starter ($7/mo, paid for event month only) | Eliminates cold starts                   |

### 4.2 Why this split

The Render backend owns admin operations, sensitive writes, and any logic needing the Supabase service-role key. The browser talks directly to Supabase for reads and player writes (gated by Row Level Security). This keeps the Render service light enough to run on the 512 MB Starter tier and ensures the browser never holds privileged credentials.

### 4.3 Cold start mitigation

The free tier spins down after 15 minutes of inactivity, with a 30–60 second cold start. The Starter tier ($7/month, billed prorated to the second) keeps the service permanently warm. Decision: **upgrade to Starter for the event month, downgrade afterwards.**

### 4.4 Bandwidth considerations

The venue is a remote Hunter Valley hotel with potentially patchy wifi. The app must:

- Lazy-load team images (only fetch when displayed)
- Use small image assets (compressed, < 50 KB per team image)
- Apply optimistic UI (selections appear immediately, sync in background)
- Auto-save drafts to `localStorage` so a connection drop doesn't lose answers
- Handle Supabase Realtime reconnection explicitly with a small "reconnecting..." indicator
- Avoid blocking spinners on every interaction

---

## 5. User roles

### 5.1 Player

- No account, no email, no password
- Identified by: display name + team membership + browser-stored device ID
- Can: join/create/leave teams, view team lobby, submit answers, see their own results, message the admin

### 5.2 Admin

- Single user (the author)
- Authenticated by password (stored as a hash; secret loaded from a Render environment variable, never committed)
- Long-lived session (~12 hours) so an accidental tab close doesn't break the night
- Concurrent sessions allowed (laptop primary + phone backup)
- Can: approve new teams being created, edit team details, reset team passwords, start/stop/mark/reveal trivia rounds, award points to teams, message teams specifically or message all teams through a broadcast, see the leaderboard

### 5.3 Admin auth security

Because the GitHub repo is public, special care is required:

- Admin password hash stored in environment variable, never in source
- Supabase service-role key stored in Render env var, never in client code or repo
- Supabase Row Level Security (RLS) configured so the public anon key can only do explicitly-allowed operations
- Brute-force protection: max 5 admin login attempts per device per 10 minutes to avoid trolling.
- Admin actions go through the Render backend, which validates session before forwarding to Supabase as service role

---

## 6. Identity and device handling

### 6.1 Device ID

On first visit, the browser generates a random UUID and stores it in `localStorage`. This ID is sent with every request. It enables:

- Auto-rejoin: "Welcome back, you were on Team Banana"
- Admin visibility: flagging the same device across multiple teams
- Lightweight abuse protection (combined with rate limiting)

### 6.2 Edge cases

- **Private/incognito mode:** `localStorage` is wiped at session end. Player must re-enter name + team passcode to rejoin. Acceptable.
- **Strict corporate MDM iPhones:** may block storage entirely. Same fallback: re-enter to rejoin.
- **"Block all cookies" setting:** same fallback.

### 6.3 Anti-mischief

- Local storage ID used to stop people cheating with multiple browsers instances or logins.
- Notifications visible to admin when a device joins multiple teams.
- Admin and team members can boot other players from teams; team passcodes auto-rotate when this happens. There is a one minute cool down for non-admin people booting other team members to avoid trolling.
- Threat of point deductions for caught cheaters (out-of-band, social deterrent)
- Participants may join from a shared corporate vpn with zscaler, or may be using a shared wifi or hotspot so IP limiters will be annoying. Hence not included in the build.

This is "deter casual mischief" not "withstand a determined attacker." Acceptable for a staff party.

---

## 7. Teams

### 7.1 Team formation

Players land on the join screen and choose:

- **Join an existing team:** select from a list of approved teams (showing name + image), enter the 4-digit passcode
- **Create a new team:** provide name, image (from preset library), passcode

### 7.2 Team creation flow

1. Player enters proposed team name
2. App checks uniqueness in real time against approved + pending teams (case-insensitive, whitespace normalised)
3. Player picks an image from the preset library
4. Player sets a 4-digit passcode
5. Submission goes into a "pending" queue visible to admin
6. Player sits on a "Pending approval" screen — they may cancel or edit until admin acts
7. Admin approves / rejects with optional message
8. On approval: player auto-joins the new team and lands in the team lobby
9. On rejection: player sees the admin's message and returns to the join screen
10. If the player cancels out of a "pending approval" screen, then the record is deleted. This frees the name up in case another team wants to use it.
11. When team creation is closed by the admin, all pending teams are automatically rejected.

### 7.3 Joining an existing team

1. Player taps a team from the approved list
2. Player enters their display name
3. Display name uniqueness is checked within the team (case-insensitive, whitespace normalised)
4. Player enters the 4-digit passcode
5. On success: player joins, lands in team lobby, "X joined Team Banana" notification appears in the team lobby for existing members

### 7.4 Team rules

- No min or max size; solo teams allowed
- Players can leave and join other teams freely throughout the event
- A team currently has zero members → not auto-deleted; admin can manually delete from the team management screen
- Passcodes are 4 digits; admin can edit any team's passcode at any time
- Admin can boot a player; passcode auto-rotates on boot
- Team members can boot one of their own; passcode auto-rotates on boot
- Admin can edit any team name or passcode
- Admin can rename players (e.g. to censor vulgar names) — no pending state required since names are only visible within the team

### 7.5 Admin team management

- Pending teams queue (name, image, passcode, creator's display name) with approve / reject + optional message
- All approved teams list with: name, image, passcode (visible), member count, last-activity timestamp, total score
- Edit any team's name, image, passcode, or members
- Delete any team (including non-empty — players are returned to the join screen with a message)
- Toggle: "Team creation enabled / locked" (single switch)
- "Dark team" indicator: flag teams with no entered answers in the prior round

---

## 8. Rounds

### 8.1 Round lifecycle

```
draft → open → locked → marked → revealed
```

- **draft:** Pre-loaded but invisible to players
- **open:** Players can edit their team's answers for the questions
- **locked:** No further edits; the admin locks the round, and the most recent edits are taken as the team's answers for the round
- **marked:** Admin has assigned points (manual for free-text, automatic where possible)
- **revealed:** Players can see their score for each question and the round total in their team lobby

The admin advances rounds explicitly through these states.

### 8.2 Round configuration

A round has:

| Field                      | Description                                                                                                                                                                                                                |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                       | Unique identifier                                                                                                                                                                                                          |
| `order`                    | Display order in the event                                                                                                                                                                                                 |
| `title`                    | e.g. "Round 3: Pop Culture"                                                                                                                                                                                                |
| `description`              | Optional intro text shown to players                                                                                                                                                                                       |
| `points_per_correct`       | Default points (overridable per question)                                                                                                                                                                                  |
| `lifecycle_state`          | One of the five states above                                                                                                                                                                                               |
| `display_questions_in_app` | Boolean — whether question text is shown to players. If true, then the question number and additional text is shown before the question input. If false, then only the question number is shown before the question input. |
| `questions`                | Ordered list of questions                                                                                                                                                                                                  |

### 8.3 Question configuration

A question has:

| Field            | Description                                              |
| ---------------- | -------------------------------------------------------- |
| `id`             | Unique identifier                                        |
| `order`          | Display order in the round                               |
| `prompt_text`    | Optional text shown to players                           |
| `prompt_image`   | Optional image shown to players (e.g. for a photo round) |
| `input_type`     | `multiple_choice`, `free_text`, `numeric`                |
| `input_config`   | Type-specific settings (see below)                       |
| `correct_answer` | For auto-mark types (numeric, multi-choice)              |
| `marking_notes`  | For admin reference when manually marking                |
| `points`         | Override of `points_per_correct` if needed               |
| `multi_input`    | Boolean — see §8.5                                       |

### 8.4 Input types (V1)

#### Multiple choice

- `options`: list of strings (any number — can deliberately be very long, e.g. 26)
- `allow_multiple_selections`: boolean
- Auto-marks against `correct_answer` (a single option ID, or list of IDs)

#### Free text

- `case_sensitive`: boolean (default false)
- No auto-mark; admin marks manually
- May have a stored `correct_answer` shown to admin during marking as a reference

#### Numeric

- `min`, `max`: optional bounds
- `decimal_places`: integer (default 0)
- `unit_label`: optional display string (e.g. "kg", "%")
- `scoring_mode`: `exact` or `closest_wins`
- For `closest_wins`: optionally show a live-updating average of all teams' current entries (see §8.6)
- Auto-marks against `correct_answer`

### 8.5 Multi-input questions

A single question may have multiple input fields (e.g. a music round question requiring artist + song name as two free-text inputs). Each sub-input is marked separately and contributes to the question's total points.

### 8.6 Live numeric average (optional per question)

For numeric questions configured with `show_live_average: true`, all teams see a running average of the *current* (unsubmitted) entries across teams. Updates push via Supabase Realtime to all subscribed clients. This is opt-in per question because the broadcast cost scales with team count × update frequency.

### 8.7 Mixed input types within a round

A round can contain questions of different input types (e.g. five multi-choice + two free-text + one numeric). The frontend renders each question with its appropriate input component.

---

## 9. Real-time team answer sync

### 9.1 Behaviour during an open round

- All team members on the round page see live updates of which option is selected / what text is entered
- Last write wins
- A subtle indicator shows who made the most recent edit ("Last edited by Amrita")
- Optional presence indicator: small avatars/dots showing who else is currently on the round page
- Players can revise answers freely until the round is closed by the admin

### 9.2 Auto-submit on round close

When the admin moves a round from `open` to `locked`:

- For each team that has not yet submitted, the server uses their last-synced draft as their submission
- Teams currently offline at the moment of close still get their last-synced draft accepted
- A blank input becomes a 0-point answer
- Admin will give a verbal warning (~30 seconds) before locking, mitigating most disputes

### 9.3 Draft persistence

- Every input change auto-saves to the server (debounced, e.g. 300ms) and to the player's `localStorage`
- On reconnection, the local draft is reconciled with the server (server wins if both exist; otherwise local is uploaded)

---

## 10. Scoring

### 10.1 Score Events

- Teams can recieve "points" in lots of ways. E.g. for correctly answering questions in the main trivia rounds, or awarded for other reasons outside the main rounds at the discretion of the Admin.
- A "score event" is when a team is awarded or deducted points. The total score for a team at any point in time is the sum of all their score events.
- The admin creates score events. Each score event outlines the team receiving it, when they received it (incl. time), the points (positive or negative) awarded, a category defining the broad reason for why a score event occurred, and a specific note about why the event happened.  
- Categories are used in the leaderboard or by the admin; they help track how a team's score was totalled. Eg what proportion of points came from each of the major rounds vs ad hoc rewards vs penalties vs other games played outside the main trivia rounds.
- For trivia rounds: a single score event is created for each trivia round, which allocates the total points earned in the round, rather than a score event for each individual question in the round. A separate record of the scoring for each question in each round is retained separately for reference purposes (see 10.2).

### 10.2 Round Marking

- Once rounds are locked, the admin reviews the submissions from each team and allocates marks for each question. 
- Each question in the round has a `points` value (defaulting from the round) reflecting the marks available for that question.
- Auto-marked types award full points for correct, zero for incorrect.
- Free-text marking is manual; admin can award full, half, zero, or any custom amount (i.e. more than the default if desired).
- Once the admin has reviewed the round, they 'commit' the score. This automatically sums the points for that round and creates a draft score event.
- The admin reveals the answers verbally before teams can see their scores and marked answers. So, there is a button that the admin presses to "finalise" the score events and send them to players. This also pushs the rounds to `revealed` state so teams can look over their answers and see the marks that the admin allocated for each answer. 
- If edits are to be made later, the admin manages this with ad hoc score events.

### 10.3 Score visibility

- Players see their team's per-question scores and round total *only* once the round is `revealed`.
- The marks shown for a round are for information only; the score events are the true record of what has been awarded.
- Players never see other teams' scores or the leaderboard ranking. The leaderboard is admin-only by default; admin can choose to broadcast it as a message moment

### 10.4 Round summary for players

After a round is revealed, each team's lobby will include a link to their results. Clicking it leads to a page showing:

- Round title
- Each question with: (a) the team's submitted answer, (b) the correct answer, (c) points awarded, (d) optional admin note (e.g. "half marks for the spelling")
- Round total
- Optional: average score across all teams for each question

### 10.5 Negative scores

Allowed (relevant for V2 wager mechanics; harmless in V1).

---

## 11. Admin flow control

### 11.1 Player journey

```
Splash → Join screen → (Pending OR Team lobby) → Round answer page → Team lobby → ...
```

### 11.2 Team lobby

The default "home base" for players between rounds. Shows:

- Team name + image
- Member list (with presence indicators and the ability to "boot" a player)
- Team passcode (hidden behind a "tap to reveal" spoiler bar)
- Total score
- A log of all score events that sum to the total score, including notes describing the source
- A list of all the major rounds, including status (pending, open, finished, results available). For results available, this links to a page showing their answers and how they were scored.
- Recent admin messages
- Message-the-admin button (free text)

### 11.3 Admin push

The admin can force all players to navigate to a specific page. Used for:

- Starting a round (push all teams to the round answer page)
- Returning to lobby after a round is locked
- Showing a one-off announcement page
- Showing the leaderboard as a "moment", then forcing them to the team lobby page afterwards

### 11.4 Admin messages

- **Broadcast:** all players receive a message that appears as a toast/banner and persists in their lobby's "Recent messages" list
- **Targeted:** message a specific team or specific player (rare; useful for "Sam, please come see me")
- Free-text composition; no pre-saved templates in V1 (deferred to V2)

### 11.5 Admin console layout (high-level)

| Section           | Purpose                                                                                        |
| ----------------- | ---------------------------------------------------------------------------------------------- |
| **Event control** | Lock/unlock team creation, push pages, broadcast messages                                      |
| **Pending teams** | Approve/reject queue                                                                           |
| **Teams**         | All teams with members, scores, passcodes, last-activity, dark-team flags; edit/delete actions |
| **Rounds**        | List of rounds with lifecycle controls (open, lock, mark, reveal)                              |
| **Marking**       | For each locked round, a marking grid: teams × questions, with scoring inputs                  |
| **Leaderboard**   | Live ranked list of teams with scores                                                          |
| **Bonus points**  | Award arbitrary points with a note                                                             |
| **Activity log**  | Time-ordered log of joins, leaves, submissions, admin actions                                  |

---

## 12. Data model (initial sketch)

Tables (Supabase Postgres):

| Table           | Key columns                                                                                                                                       | Notes                                        |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `event_config`  | `id`, `team_creation_enabled`, `branding_json`                                                                                                    | Single row                                   |
| `teams`         | `id`, `name`, `image_id`, `passcode_hash`, `status` (`pending` / `approved` / `deleted`), `created_at`                                            |                                              |
| `players`       | `id`, `display_name`, `team_id`, `device_id`, `joined_at`, `last_seen_at`                                                                         |                                              |
| `rounds`        | `id`, `order`, `title`, `description`, `points_per_correct`, `lifecycle_state`, `display_questions_in_app`                                        |                                              |
| `questions`     | `id`, `round_id`, `order`, `prompt_text`, `prompt_image_url`, `input_type`, `input_config_json`, `correct_answer_json`, `marking_notes`, `points` |                                              |
| `drafts`        | `team_id`, `question_id`, `value_json`, `last_editor_player_id`, `updated_at`                                                                     | Composite primary key (team_id, question_id) |
| `submissions`   | `team_id`, `question_id`, `value_json`, `submitted_at`, `auto_submitted`                                                                          | Composite primary key                        |
| `marks`         | `team_id`, `question_id`, `points_awarded`, `admin_note`, `marked_at`                                                                             | Composite primary key                        |
| `score_events`  | `id`, `team_id`, `points`, `note`, `category`, `awarded_at`                                                                                       |                                              |
| `messages`      | `id`, `from_admin` (bool), `target_type` (`broadcast`/`team`/`player`/`admin`), `target_id`, `body`, `sent_at`                                    |                                              |
| `activity_log`  | `id`, `event_type`, `actor_type`, `actor_id`, `payload_json`, `created_at`                                                                        |                                              |
| `image_presets` | `id`, `url`, `category`, `display_name`                                                                                                           | Pre-loaded                                   |
| `admin_session` | Stored server-side; not in DB                                                                                                                     |                                              |

This is a sketch; final field names and types confirmed in build phase.

---

## 13. Branding and customisation

### 13.1 Theming

Implemented as CSS custom properties so changes are central:

```css
:root {
  --colour-primary: #...;
  --colour-secondary: #...;
  --colour-accent: #...;
  --colour-background: #...;
  --colour-text: #...;
  --font-heading: '...';
  --font-body: '...';
}
```

### 13.2 Configurable strings

A central strings file allows the author to inject office in-jokes throughout. Examples:

- App heading and subtitle
- Splash screen welcome message
- Button labels (e.g. "Submit" → "Lock it in!")
- Empty states ("No rounds yet — back to the bar")
- Loading messages (rotating)
- Error messages
- Round transitions
- Auto-generated player notifications

### 13.3 Image presets

- 50–100 preset team images, mix of generic and office-specific
- Office-specific GIFs/images supplied by the author
- Stored in Supabase Storage; CDN-cached for fast delivery
- Categorised (e.g. "Animals", "Office in-jokes", "Abstract") with category filter on the picker

### 13.4 Waiting / loading screens

A custom GIF (supplied by the author) is displayed prominently on:

- The team lobby's "no active round" state
- Any explicit "waiting for admin" page
- Loading transitions over a configurable threshold (e.g. > 1 second)

### 13.5 Audio (optional, opt-in)

Light sound effects on key moments:

- Round opens
- Round closes (buzzer)
- Score reveal
- Message arrives

Off by default; player toggle in their team lobby.

### 13.6 Australian English

All player-facing strings, code comments, and documentation use Australian English (colour, recognise, organise, centre, behaviour, favourite, etc.). Date format DD/MM/YYYY. Time format 24-hour. Note: technical CSS/JS keywords (`color`, `localStorage`) remain as-is.

---

## 14. Event setup workflow

The author pre-loads the event before the night via the admin console:

1. Configure branding (colours, logo, GIF, custom strings)
2. Upload preset images (or use defaults)
3. Create rounds with their questions, input types, correct answers, points
4. Set initial event state (`team_creation_enabled = true`, all rounds `draft`)

V1 ships with a CSV import option for rounds + questions as a faster bulk-load alternative. CSV format documented separately in the build phase.

A simple "10 questions, free-text" template is available as a starting placeholder before the author finalises round content.

---

## 15. Pages and screens

### 15.1 Player-facing

| Screen            | Purpose                                           |
| ----------------- | ------------------------------------------------- |
| Splash            | Branded landing; "Tap to start"                   |
| Join screen       | List of approved teams + "Create new team" button |
| Team creator      | Name + image picker + passcode form               |
| Pending approval  | "Waiting for admin..." with cancel/edit options   |
| Rejection notice  | Admin's message + back to join                    |
| Team lobby        | Home base (see §11.2)                             |
| Round answer page | Question(s) with appropriate input UI             |
| Round results     | Per-question results once revealed                |
| Pushed pages      | Whatever the admin sends                          |

### 15.2 Admin-facing

| Screen              | Purpose                  |
| ------------------- | ------------------------ |
| Admin login         | Password entry           |
| Admin dashboard     | Overview + quick actions |
| Pending teams queue | Approve/reject           |
| Team management     | List + edit + delete     |
| Round management    | Lifecycle controls       |
| Marking grid        | Per round, mark answers  |
| Leaderboard         | Live ranking             |
| Messaging           | Broadcast or targeted    |
| Activity log        | Audit trail              |

---

## 16. Out of scope for V1 (Stretch / V2)

| Feature                     | Notes                                                                                                  |
| --------------------------- | ------------------------------------------------------------------------------------------------------ |
| Player image upload         | Supabase Storage capacity supports it; UI + moderation deferred                                        |
| Internet image URL pasting  | Hotlink unreliability not worth the lift                                                               |
| Hand-drawn input            | Canvas + image submission; not stroke-syncing                                                          |
| Mini-games                  | Single-player; pluggable framework, no built-ins                                                       |
| Wagers                      | Per-question and per-round; admin-configurable limits                                                  |
| Powerups                    | Spin-the-wheel; example: double points, free bet, penalise others, add 20 fake options to another team |
| Hints                       | Pre-authored, admin-distributed                                                                        |
| Tiebreakers                 | Manual on the night (heads/tails)                                                                      |
| Pre-saved message templates | Admin types ad-hoc in V1                                                                               |
| Multi-event support         | Wipe to restart in V1                                                                                  |

---

## 17. Open issues / decisions deferred to build phase

- Frontend framework choice (React, Svelte, Vue, or vanilla?)
- Exact Supabase Realtime channel design (one channel per team? per round? global?)
- CSV import format specifics
- Admin console UI library / component set
- Final preset image set curation
- Custom font sourcing

---

## 18. Risks

| Risk                                 | Likelihood         | Impact | Mitigation                                                                     |
| ------------------------------------ | ------------------ | ------ | ------------------------------------------------------------------------------ |
| Venue wifi fails                     | Medium             | High   | Optimistic UI, draft persistence, graceful degradation; pen-and-paper fallback |
| Render cold start at wrong moment    | Low (with Starter) | High   | Pay $7 for Starter for the event month                                         |
| Supabase Realtime connection limit   | Low                | Medium | Free tier is 200 concurrent; we expect ≤ 100                                   |
| Admin password leaked                | Low                | High   | Env var only, never in repo; brute-force rate limit                            |
| Public GitHub exposes attack surface | Medium             | Medium | RLS configured; no secrets in repo; service-role key server-side only          |
| Cheeky users multi-account           | High               | Low    | Device ID + admin visibility + social deterrence                               |
| Determined attacker DoSes app        | Very low           | Medium | Render's basic protections; pre-register fallback if it materialises           |
| Player loses connection mid-round    | Medium             | Low    | Draft auto-save; rejoin path via name + passcode                               |

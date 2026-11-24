# YouTube publishing and channel insights

## Why

Clips currently leave Nimbus as downloaded MP4s that the user uploads by hand. The user wants to publish an approved clip straight to their YouTube channel, with its title, description and upload settings, without downloading it. Then they want to see how each published clip did and use that to improve how Claude picks and edits clips. Phase 25 already has an open item ("tune … once posted clips have retention numbers") that this unblocks.

## Goals

1. **Publish:** a rendered clip is uploaded to the connected YouTube channel as a Short, from inside Nimbus, with the metadata and settings set in Nimbus.
2. **Stats:** Nimbus pulls back each published clip's numbers (views, likes, average view duration and percentage, and the retention curve) and shows them next to the clip.
3. **Insights:** on request, Claude compares published clips against each other and suggests specific rules for selection and for the visual review. The user approves, edits or rejects each suggestion. Approved rules form a per-channel **playbook** that goes into future prompts.

## Non-goals (v1)

- TikTok, Instagram and Twitch publishing. The channel model leaves room for them, but nothing beyond YouTube is built.
- Bulk publishing. Quota makes it a poor fit (see Constraints).
- Custom thumbnails, uploading a separate caption track, or publishing the horizontal edit.
- More than one YouTube channel per workspace.
- Analysing videos that weren't published through Nimbus. Without a known source moment, there's nothing to tie the numbers back to.
- Learning numeric weights or effects-planner constants from stats (approach C below).

## Anti-goals

- **Nothing publishes without an explicit click** on that specific clip. This keeps the project rule that nothing is auto-published.
- **Prompts never change without the user approving the change.** A suggestion has no effect until it's approved.
- **The playbook doesn't grow without limit.** Active rules are capped (12 per target, each ≤ 200 chars), so they don't swamp the niche guidance.
- Publishing never deletes or replaces the local render.

## Constraints

- **Hosted, multi-user.** Nimbus will run as a hosted service for other people, so one Google Cloud project serves every workspace. Quota and Google's approvals belong to that project, so every workspace shares them. Moving the rest of Nimbus (storage, worker) to hosting is a separate project. This feature only assumes the worker can read the render it uploads.
- **Google approval is a launch prerequisite, not code.** Two separate reviews:
  - OAuth app verification for the sensitive `youtube.upload` and `yt-analytics.readonly` scopes. It needs a verified domain, a privacy policy, terms and a demo video.
  - The YouTube API Services audit, which is where to ask for more quota.

  Until both pass, the app runs in Google's "Testing" mode: a capped list of named test users (100 by our reading, unverified), refresh tokens that last 7 days. Everything below has to behave correctly in that mode.

- **Unaudited API projects no longer upload private only.** Google's docs say videos from unverified API projects aren't restricted to private viewing mode (the 2020 lock was lifted on 2026-11-02). Privacy still defaults to private in Nimbus, since nothing publishes without a deliberate choice. If an upload comes back private anyway, the UI says the user may need to change it in YouTube Studio.
- **Testing-mode refresh tokens expire after 7 days.** A Google OAuth app in "Testing" status issues refresh tokens that expire after 7 days, and `youtube.upload` is a sensitive scope. So the channel can drop off every week until the app is verified. Nimbus has to detect `invalid_grant`, mark the channel as needing reconnection, and say so. Confirmed against Google's OAuth docs (see ADR-0065).
- **Quota.** The Data API gives a project 10,000 units a day for everything except `videos.insert`, which has its own bucket of 100 calls a day at 1 unit each (since 2026-06-01; it cost about 1,600 units before). Stats reads are cheap. That budget is shared by every workspace, so Nimbus keeps its own quota ledger with two buckets (see Quota sharing).
- **Scopes.** Sign-in already asks for `youtube.upload` and `youtube.readonly` with offline access (`features/accounts/schema.ts` → `YOUTUBE_SCOPES`). Stats also need `https://www.googleapis.com/auth/yt-analytics.readonly`. Users who connected earlier have to reconnect, and Connected channels shows that as "needs reconnect".
- **Local-first wording.** ARCHITECTURE says nothing leaves the machine except Anthropic calls. This feature adds Google APIs and needs a new ADR. The worker streams the render to YouTube from wherever it's stored.
- **Analytics lag.** YouTube Analytics data shows up roughly 24–72 h after publishing. Early stats are incomplete, and the UI labels them that way.
- **Architecture rules hold.** Uploads, stats syncs and the insights analysis are worker jobs, not request handlers. The business logic is pure and unit tested: metadata building, retention-to-moment mapping, relative performance, prompt assembly with the playbook, and the rule cap.

## Approaches (picked in conversation)

For the learning loop, the user picked **B: Claude suggests changes and the user approves them**. A (a report only, user edits prompts by hand) and C (fully automatic, which can drift unnoticed) were rejected.

For how approved suggestions are stored and used:

- **A. Per-channel playbook of written rules (picked).** Short rules, each linked to the clips that justify it, added to the selection and visual review prompts. They can be read, edited and retired, and they work with a small channel's worth of data.
- **B. Best and worst clips as few-shot examples.** Rejected: it's opaque (nothing to read or approve), its token cost grows, and outliers steer it.
- **C. Tune scoring weights and planner constants.** Rejected for now: it needs hundreds of clips and can't express qualitative rules.

## Design

### Channel connection

- One YouTube channel per workspace, connected through the owner's Google account (the Better Auth `account` row with `providerId = "google"`). The first time it connects, Nimbus calls `channels.list?mine=true` and stores a `youtube_channels` row (workspace, Google account id, channel id, title, avatar, connectedAt, status `ok | needs_reconnect`).
- Add `yt-analytics.readonly` to the Google scopes. Connected channels shows YouTube as connected only when all three scopes are granted, and otherwise offers "Reconnect".
- Access tokens are refreshed through Better Auth's account tokens. If a refresh fails with `invalid_grant`, the channel is set to `needs_reconnect` and every job that needs it fails with a message that points to Settings › Connected channels.
- `/channels` replaces its coming-soon page with the YouTube channel card: avatar, title, published-clip count, the latest numbers, and links to Insights.

### Publishing

- **Where:** a "Publish to YouTube" action in the clip dialog and the clip editor's output panel. It's enabled only when the clip is approved and rendered, and the render is current (status `rendered`, not edited since the render).
- **Form** (Base UI dialog, shadcn-first), prefilled and editable:
  - Title: the clip title, ≤ 100 chars.
  - Description: Claude drafts it at selection from the hook and reason, with hashtags including `#Shorts`. Editable, ≤ 5,000 chars. _Builder's call: draft it during the selection pass (no extra call) or with a small call when the form opens. Prefer the selection pass._
  - Tags: comma list, prefilled from the niche.
  - Privacy: private / unlisted / public. Defaults to private, with a note about the audit lock.
  - Schedule: optional publish time (sets `status.publishAt`, which requires private).
  - Category: defaults to Gaming (20).
  - Made for kids: defaults to No (`selfDeclaredMadeForKids: false`).
  - Language: the project's spoken language.
  - Workspace defaults for tags, privacy and the hashtags line live in Settings › Project defaults, in a new "Publishing" group.
- **Job:** `publish_clip { clipId, publicationId }`. It does a resumable upload (`videos.insert`, `uploadType=resumable`) of the render asset from disk, with progress reported through the existing job events/SSE. If the job is retried, it resumes the session URI it saved instead of starting over. On success it stores the YouTube video id and URL.
- **Data:** a `publications` table: id, clipId, channelId, platform `youtube`, the metadata as sent (jsonb), `renderAssetId` at publish time, the playbook rule ids active when the clip was selected (see Provenance), status `queued | waiting_quota | uploading | processing | published | failed | removed`, videoId, url, error, publishedAt. A clip can be published more than once (for example re-rendered and published again), and the latest publication is the one the UI shows.
- **UI states:** a published badge on the tile with a link to the video, progress while uploading, and on failure an error with Retry. The quota, private-lock and reconnect messages are written for a person, not raw API text.

### Quota sharing

- **Ledger.** A `youtube_quota_usage` ledger stores the units spent per Pacific-time day, per workspace and per call kind. Every YouTube call goes through one adapter that books its cost before making the call. Quota resets at midnight Pacific.
- **Plan limit.** Each plan gets a daily publish limit, recorded as a usage event like render minutes and shown in Plan & usage. The Admin plan has no limit. The numbers are set once the real quota is known.
- **Two buckets.** Uploads are counted against their own daily bucket (`YOUTUBE_DAILY_UPLOADS`), and reads against the shared one (`YOUTUBE_DAILY_QUOTA`), the same way Google splits them. Uploads can't starve stats syncing.
- **When quota runs out.** If the project-wide budget is spent, or YouTube returns `quotaExceeded`, a publish moves to `waiting_quota` and is picked up again after the reset. The UI says "Queued, YouTube's daily limit is reached, it'll go out after midnight Pacific". It's never shown as a failure.
- **Fair order.** Waiting publishes go out oldest first, at most N per workspace each day, so one workspace can't use up the morning's budget. _(Design call. N comes from the plan.)_

### Stats

- **Job:** `sync_stats { publicationId }`. It calls `videos.list` (statistics: views, likes, comments) and the YouTube Analytics `reports.query`. Per video it reads `views`, `averageViewDuration` and `averageViewPercentage`, plus the retention curve (`audienceWatchRatio` by `elapsedVideoTimeRatio`). _Unverified: whether Shorts-specific metrics, such as the share viewed vs swiped away, are available through the API. Use them if they are, and don't depend on them._ _Also unverified: whether the retention curve is returned for Shorts. If it isn't, Insights falls back to views, average view duration and average view percentage. Suggestions then rest on which clips held viewers rather than where in the clip they left, and the per-moment evidence is left out. (Proposed fallback, not yet confirmed by the user.)_
- **Schedule:** the worker's sweep enqueues `sync_stats` for each publication at about 1, 2, 7 and 28 days after publishing, and never twice at once for the same publication. A "Refresh stats" button enqueues one immediately.
- **Data:** `publication_stats` stores snapshots (publicationId, fetchedAt, counters, avg duration and percentage, retention curve as jsonb), so trends can be shown and the latest snapshot read.
- **Mapping:** a pure `retentionMoments(curve, clip, transcript, effects, beats)` turns the ratio curve into clip-relative seconds. It marks the steepest drops and any rises, and attaches the words spoken, the effects active and the beats at each one. Insights and the UI both use it.
- **Relative performance:** a pure function scores each publication against the channel's own median for clips of similar age. Raw views aren't comparable across ages.
- **UI:** in the clip dialog, a Stats tab with the numbers, a retention sparkline with the clip's beats marked, and the "data still coming in" label inside the lag window. On `/channels`, a sortable list of published clips with their key numbers.

### Insights and the playbook

- **Trigger:** "Find patterns" on `/channels` › Insights. It's enabled once there are at least 8 publications with a stats snapshot at least 7 days after publishing. _Builder's call on the exact threshold; make it a constant._
- **Job:** `analyze_performance { channelId }`. For each eligible clip it sends Claude the title, hook, reason, selection score, niche, the clip's transcript with timestamps, its effects and beats, the retention moments, its relative performance, and which playbook rules were active when it was selected. It also sends the current playbook. Claude returns structured suggestions (zod-validated):
  - target: `selection | review`
  - rule text: ≤ 200 chars, written as an instruction
  - rationale
  - evidence clip ids, for and against
  - confidence
  - kind: `add | edit <ruleId> | retire <ruleId>`

  Suggestions are stored with status `pending`. The analysis uses the workspace's Claude key and records a `claude_run`, like selection, so it counts against the plan's Claude runs. _(Design call.)_

- **Review UI:** each suggestion as a card with its rationale and evidence clips (click to open a clip with its stats). Actions: Approve, Edit then approve, Reject. Approving an `edit` or `retire` updates the existing rule. Rejected suggestions are kept and sent with the next analysis, so Claude doesn't suggest them again.
- **Playbook:** a `playbook_rules` table: id, channelId, target, text, status `active | retired`, sourceSuggestionId, `supersedesId`, createdAt, retiredAt. Rules never change text in place. An edit, whether approved from a suggestion or made by hand, retires the old row and creates a new one that points back to it. That way, the ids stored on a clip always match the wording it was selected under. _(Design call.)_ It's shown on `/channels` › Insights, where each rule can be edited, retired and restored by hand. The cap of 12 active rules per target is enforced on approve, and the UI asks which rule to retire.
- **Prompt use:** a pure `playbookSection(rules)` adds a "What has worked on this channel" block to `buildSelectionPrompt` (and the chunked and manual variants) for `selection` rules, and to the visual review prompt for `review` rules. Review rules can steer the reaction and weird beats, which drive effects. A project uses its workspace channel's playbook. With no channel or no active rules, the prompts are unchanged byte-for-byte, so existing tests and goldens hold.
- **Provenance:** at selection, each clip records the active rule ids it was selected under (`clips.playbookRuleIds`). This lets the next analysis compare clips selected before and after a rule, which is how Claude can suggest retiring a rule that didn't help.

### Errors and edge cases

- The render changes after publishing: the publication keeps the asset it uploaded, and the clip shows "edited since publish".
- The video is deleted on YouTube: `videos.list` returns nothing, so the publication is marked `removed` and drops out of stats and insights.
- The channel is disconnected: past publications and the playbook stay, and publishing and syncing are disabled until it reconnects.
- The workspace has no Claude key: Find patterns is disabled with the same message the selector uses. Stats still work.

### Testing

- Unit: metadata building and limits, the retention mapping, relative performance, playbook prompt assembly (and byte-for-byte equality with no rules), the rule cap, suggestion parsing.
- Integration (PGlite + MSW): a resumable upload, including resume after a failure; token refresh and `invalid_grant` → needs_reconnect; quota error; sync stats; the analyze job with mocked Claude; approving a suggestion changes the next selection prompt.
- e2e: a fake YouTube adapter (like the fake transcriber), then publish from the clip dialog → published badge → seeded stats show → approve a suggestion → the rule appears in the playbook. Plus an axe check on the new screens.
- Doctor: reports whether Google credentials are configured and the channel's token status.

### Rollout (phases)

0. **In parallel, outside the code:** start Google OAuth verification and the YouTube API audit as early as possible, since they can take weeks. Launch waits on them. Until then, use the testing-mode user list.
1. **Phase 30: Publish.** Scope update, channel row, quota ledger and plan limit, `publish_clip` with `waiting_quota`, the form, badges, ADR for Google APIs in a hosted, multi-user Nimbus.
2. **Phase 31: Stats.** `sync_stats`, snapshots, retention mapping, Stats tab, the `/channels` list.
3. **Phase 32: Insights.** `analyze_performance`, suggestions UI, playbook, prompt injection, provenance.

Each phase ships on its own and passes the quality gates.

## Left to the builder

- The YouTube client: `googleapis` or plain `fetch` against the REST endpoints, behind an adapter with a fake for tests. Check the installed version and the current API docs first.
- How the description draft is generated (see Publishing).
- The exact stats sync times and the insights threshold, as named constants.
- Table and column names, as long as they follow the existing Drizzle conventions.

@AGENTS.md

# Buurtheld

A Strava companion app for finding the easiest Local Legend titles to claim. Multi-user web app, built primarily as a learning project for Next.js App Router.

## Concept

Strava's **Local Legend** is awarded to whoever runs a segment the most times in a rolling 90-day window. This app surfaces segments where the current leader has a low effort count, lets you favorite ones you're chasing, and shows how many more efforts you need.

Two top-level views:
- **Explore** — map-driven, fetches `/segments/explore` as you pan, sorts visible segments ascending by remaining-distance-to-LL.
- **Favorites** — list of starred segments only, plus a small map with pins. No new segment fetches happen here.

Activity type is **Run only** (no Ride/Course Record mode).

## Stack

| Concern | Choice |
|---|---|
| Framework | Next.js 16 App Router (TypeScript) |
| Styling | Tailwind CSS v4 — Strava orange `#FC5200` primary, light theme only (no dark mode for v1) |
| Map | MapLibre GL + OpenFreeMap vector tiles (no API key needed) |
| DB | Neon Postgres (provisioned via Vercel Storage; `DATABASE_URL` injected) |
| ORM | Drizzle (`src/lib/db/schema.ts`) — generate-then-migrate, not push |
| Auth | Strava OAuth via serverless route handlers; session = signed JWT (`jose`) in httpOnly cookie |
| Deploy | Vercel (project name: `buurtheld`) |
| Form factor | Mobile-first PWA, installable (not yet wired) |
| Cron | Vercel Cron, daily, refreshes favorites' 90-day effort counts (not yet wired) |

## Repo layout

```
src/
├── app/
│   ├── api/auth/{login,callback,logout}/route.ts   OAuth round-trip
│   ├── layout.tsx, page.tsx                         Branded landing
│   ├── globals.css, icon.png
├── lib/
│   ├── auth/session.ts                              JWT session helpers
│   ├── strava/oauth.ts                              Strava token exchange + refresh
│   └── db/{schema.ts,client.ts}                     Drizzle schema + connection
drizzle/                                             Generated SQL migrations (commit these)
public/icons/                                        PWA icons (32/192/512 + SVG master)
.env.local                                           gitignored; loaded by Next + Drizzle CLI
.env.example                                         committed reference
drizzle.config.ts                                    loads .env.local via dotenv
```

## Conventions

- Code style follows `~/.claude/CLAUDE.md` (user-global). TL;DR: no needless comments, guard-clause / early-return with inline booleans, no `out` params.
- Always ask before committing. Never amend; new commits only.
- No emojis in code or commit messages unless explicitly requested.
- Don't add try/except defensively — let errors surface unless there's a clear recovery path.
- One module per concern — `src/lib/<area>/<file>.ts`. Don't bundle unrelated helpers.
- Server-only secrets stay server-side. Tokens are server-fetched via session helpers; never sent to the client.
- Database access is server-only — all `db` queries go through route handlers or server components.

## Decisions already locked in (don't relitigate)

- Light theme only for v1. Dark mode is a deliberate v2 item.
- Run activity only — no Ride toggle.
- Local Legend only — no Course Record mode.
- Multi-user from day one — favorites + 90-day counts persisted per-user in DB.
- Tokens stored in DB, not JWT — JWT only carries `userId`. (Refactor pending — see "Next up".)
- Effort refresh: on-favorite (immediate) + manual "Refresh" buttons + daily Vercel cron, rate-limit-aware (yields at ≥70% of either Strava window).
- Cron cadence is daily, not every 2h. App-wide Strava rate limit (200 req/15min, 2000/day shared) is the binding constraint.
- Premium assumed — `/segments/{id}/all_efforts` requires Strava Premium; user has it. On 403, degrade to leader-only stats and show a banner.
- Leader-count cache TTL: 7 days for `segments.detailsFetchedAt`.
- On logout/disconnect, keep favorites and linked data; only nullify tokens.
- Units: locale-detect, default to km.
- Deauthorize webhook: v2 item, not v1.

## Build order

- ✅ M1 — Scaffold (Next.js, Tailwind, env, branding)
- ✅ M2 — OAuth round-trip (login/callback/logout, JWT session)
- ✅ M3a — Drizzle schema + initial migration applied to Neon
- ⏭️ **M3b — Move tokens from JWT to DB; add auto-refresh wrapper** ← current
- ⏭️ M4 — Explore page: MapLibre canvas, `/segments/explore` proxy, segment list
- ⏭️ M5 — Favorites: star toggle, favorites table, Favorites page (small map + list)
- ⏭️ M6 — Effort counts: `/all_efforts` integration, remaining-distance computation
- ⏭️ M7 — Daily Vercel Cron refresh + rate-limit accounting
- ⏭️ M8 — PWA polish (manifest, service worker, install prompt)
- ⏭️ M9 — Edge cases: 403 Premium banner, rate-limit banner, error boundaries

## DB schema (current)

5 tables, migrated. `src/lib/db/schema.ts` is the source of truth.

- **users** — `id` (serial), `strava_athlete_id` (unique), names, avatar, access_token, refresh_token, token_expires_at, has_premium, created_at, last_login_at
- **segments** — Strava segment id as PK, geometry, distance, avg_grade, polyline, LL flags, leader effort counts, `details_fetched_at`
- **favorites** — (user_id, segment_id) composite PK
- **athlete_efforts** — (user_id, segment_id) composite PK, `recent_90d_count`, `fetched_at`
- **rate_limit_state** — single-row, short/long-window usage + reset timestamps

## Strava integration notes

- OAuth scopes: `read,activity:read`. `read_all` only needed for private segments — skipping for v1.
- Callback domain at Strava is `localhost`. Production deploy needs it updated to the Vercel domain (Strava allows only one).
- Rate limits are app-wide, not per-user. 200/15min and 2000/day default; can request more later.
- Token refresh: Strava access tokens expire ~6h after issue. The auto-refresh wrapper (M3b) compares `token_expires_at` with `now() + 60s`, refreshes if needed, persists new token + expiry.

## Workflow

- `npm run dev` — Next.js dev (Turbopack, port 3000)
- `npm run build` / `npm run start` — production build / serve
- `npm run lint` — ESLint
- `npm run db:generate` — new SQL migration after schema edits
- `npm run db:migrate` — apply pending migrations
- `npm run db:push` — direct schema sync (avoid in CI; needs TTY)
- `npm run db:studio` — Drizzle Studio UI

`vercel link` is done; `vercel env pull` syncs env vars. Don't commit `.env.local` or `.vercel/`.

## Hosting

- Vercel project: `buurtheld` (team `dlg03s-projects`)
- GitHub repo: `https://github.com/janluijk/buurtheld-app` (public, `main`)
- Default branch `main`. Commits to `main` auto-deploy to production once GitHub integration is connected.

## Out of scope (deliberately)

- Course Record mode
- Ride/cycling activities
- Multi-language (UI English; brand name Dutch)
- Strava webhooks (v2)
- Group/club features

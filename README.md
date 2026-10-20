# ORBIT — your travel companion for the time before you leave

ORBIT helps travellers make the most of the hours before a departure, and makes sure they leave with everything they need.

It brings two experiences together in one app:

1. **Turn waiting time into an adventure.** Tell ORBIT how much free time you have before your train, bus or flight. It suggests things to do nearby that fit that time, with travel there and back included, and it reminds you to head back so you don't miss your departure.
2. **Did I forget something?** Create a trip and get a personalised packing and documents checklist. Track your progress as you pack, and get reminders on your phone 24 hours and 3 hours before you leave.

---

## Why ORBIT matters

- **Waiting time is wasted time.** Layovers, early arrivals at stations and gaps between connections add up to hours. ORBIT turns that time into a short, safe experience: a café, a beach, a heritage site.
- **Missing a departure is costly.** Every suggestion includes travel time both ways and a safety buffer. While you're out, a live timer and return reminders keep you on schedule.
- **Forgetting documents ruins trips.** A structured checklist covers documents, tickets, health, money, electronics, clothing and destination prep. Weighted progress shows what really matters (a passport counts for more than headphones).
- **It's honest about what it doesn't know.**
  - ORBIT never claims a visa, permit or vaccination is or isn't required. Those items stay *"needs confirmation"* until you check the official source.
  - Distances are labelled straight-line, and travel times are labelled estimates.
  - Prices and opening hours are never invented.
- **It respects privacy.**
  - No sign-up, phone number or passport numbers are needed. The server rejects item text that looks like a document or account number.
  - Notifications never show checklist item names on the lock screen.

---

## Features

### Adventure finder
- **Plan your spare time** (`/adventure`): set how much time you have, your budget, your mood (hungry, tired, curious…), your interests, your starting point and when you need to be back.
- **Return-time safety meter:** shows how much buffer you have once you add up travel out, the activity, travel back and your safety margin.
- **Kozhikode tourist and food spots** (`/adventure/results`): every named attraction, beach, park, heritage site, restaurant, café and market in Kozhikode.
  - It's loaded live from OpenStreetMap, cached for 24 hours, and falls back to ORBIT's curated places if the service is down.
  - You can filter, search, sort by nearest or A–Z, and switch between a list and a map.
- **Discover Kerala** (`/adventure/discover`): real places near your current location, a chosen city or a searched place, within a radius you pick. There's also a Kerala-wide catalogue of beaches, hill stations, backwaters and culture.
- **Adventure details** (`/adventure/:id`): a timed plan (leave, arrive, enjoy, head back, deadline), the cost breakdown, a map, and a **Start Adventure** button.
- **Live adventure** (`/adventure/live`): a countdown timer with in-app reminders when it's time to head back. They work on any page.
- **Saved** (`/saved`): your shortlist of adventures, kept in the browser.

### "Did I forget something?" trip checklists
- **Three-step trip setup** (`/trips/new`): destination, then date and purpose, then reminders.
- **Personalised checklist:** generated on the server from built-in travel rules.
  - The rules are tailored to the trip's purpose: business, study, work, medical and so on.
  - With a Gemini API key, Gemini adds up to 12 suggestions specific to the destination and purpose.
  - AI output is treated as untrusted: links are stripped, duplicates are removed, and requirements stay unverified.
- **Animated checklist** (`/trips/:id`): check items off, add your own, edit, reorder, mark items "not needed", and confirm entry requirements against official sources.
- **Progress ring and requirement status:** shown separately, so a 100% checklist is never presented as "legally ready".
- **Push notification reminders:** sent 24 h and 3 h before departure, plus optional batched updates while you pack.
  - They appear in the notification bar of every device you turn on; tapping one opens the trip.
- **Dashboard** (`/trips`): your next trip, how prepared you are, all your trips and recent packing activity.

### Across the app
- **Orbi**, an animated suitcase mascot that reacts to your progress.
- **Accessibility:**
  - keyboard-accessible controls
  - the OS "reduce motion" setting is respected
  - 44 px touch targets
  - screen-reader live regions
- **Responsive layout** with a mobile bottom navigation bar.
- **Sessions:** no sign-up needed. A secure guest session is created automatically.

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite 8, Tailwind CSS 4, React Router 8, Zustand (state), Motion (animation), Leaflet / React Leaflet (maps), lucide-react (icons), axios |
| Backend | Node.js 22.13+, Express 5, built-in `node:sqlite` (SQLite), Zod validation, `web-push` (VAPID), Google GenAI SDK (optional AI) |
| Data sources | OpenStreetMap via the Overpass API (live places), Nominatim (place search, on submit only), ORBIT's curated Kerala data |
| Tests | `node:test` (backend) and ESLint |

---

## Getting started

### Prerequisites
- **Node.js 22.13 or newer.** ORBIT uses the built-in `node:sqlite`. Node 24 is recommended.
- npm (comes with Node).

### 1. Install
```bash
git clone https://github.com/Adil-ms/Orbit.git
cd Orbit
npm install
```

### 2. Configure (optional for local development)
```bash
cp .env.example server/.env
```
Everything works with the defaults. To enable phone notifications, generate push keys once and add them to `server/.env`:
```bash
npx web-push generate-vapid-keys
# then in server/.env:
# VAPID_PUBLIC_KEY=...
# VAPID_PRIVATE_KEY=...
# VAPID_SUBJECT=mailto:you@example.com
```
The server reads `server/.env` first and then a project-root `.env`, so values in the root `.env` win.

### 3. Run in development
```bash
npm run dev:full
```
This starts:
- the **API** on http://localhost:8787 (it restarts automatically when server files change)
- the **web app** on http://localhost:5173 (Vite's default port; it forwards `/api` requests to the API)

Or run them in two terminals with `npm run server` and `npm run dev`.

To open it from a phone on the same Wi-Fi, run Vite with `npx vite --host 0.0.0.0` and visit `http://<your-computer-ip>:5173`.

> Push notifications and location only work over **HTTPS** or on `localhost`. To test them on a phone, put the dev server behind an HTTPS tunnel (for example ngrok). Then add the tunnel's hostname to `server.allowedHosts` in `vite.config.js`, and set `APP_BASE_URL` to the tunnel URL.

### 4. Run in production
```bash
npm run build                      # builds the web app into dist/
NODE_ENV=production npm start      # API + the built app on one port (8787 by default)
```
In production:
- `LINK_SIGNING_SECRET` **must** be set (to a long random string).
- Cookies are marked `Secure`, so serve the app over HTTPS.
- Keep `server/data/` on persistent storage. It holds the SQLite database.

### Scripts

| Script | What it does |
|---|---|
| `npm run dev:full` | API (watch mode) and Vite dev server together |
| `npm run dev` | Vite dev server only |
| `npm run server` | API server only (loads `server/.env` then `.env`) |
| `npm run build` | Production build of the web app into `dist/` |
| `npm start` | API server; also serves `dist/` when it exists |
| `npm test` | Backend test suites (`node --test`) |
| `npm run lint` | ESLint for the frontend and the server |
| `npm run preview` | Preview the production build with Vite |

---

## Web app routes (pages)

| Route | Page | What it's for |
|---|---|---|
| `/` | Home | Landing page. It has the **Journey Hub** (add your next departure to see how much free time you have), **Quick start** (explore nearby places without setting up a trip), a link to the checklist feature, and "How it works". |
| `/adventure` | Adventure preferences | Set your time window, budget, mood, interests, starting point and return deadline. This is the starting point for planning spare time. |
| `/adventure/results` | Kozhikode spots | Every tourist and food spot in Kozhikode, live from OpenStreetMap, with filters, search, sort and a map. Helps you pick somewhere to go. |
| `/adventure/discover` | Discover Kerala | Real places near you, or near a chosen or searched place, plus a Kerala-wide catalogue. Explores beyond the curated list. |
| `/adventure/:id` | Adventure details | Plan for one place or activity: timeline, travel estimate, cost, map and safety check. Lets you start the adventure. |
| `/adventure/live` | Live adventure | Countdown timer and return reminders while you're out, so you're back before your departure. |
| `/saved` | Saved | Your shortlist of adventures. |
| `/trips` | Trips dashboard | Your next trip, preparation progress, all trips and recent activity. The home of the checklist feature. |
| `/trips/new` | Trip setup | Three steps: destination, date and purpose, reminders. Creates the trip and its personalised checklist. |
| `/trips/:id` | Trip checklist | Check, add, edit, reorder and confirm items; follow progress; manage reminders and phone notifications. Also opens from a signed notification link (`?access=…`). |
| `/profile` | Profile | Your display name and a summary of what ORBIT stores about you. |
| `*` | Not found | Friendly 404 with a way back. |

---

## API routes

All endpoints live under `/api` and return JSON.
- **Session:** a guest session is held in an httpOnly cookie, created by `POST /api/session`.
- **CSRF protection:** every request must send the header `X-Orbit-Client: 1`.
- **Errors:** responses use the shape `{ "error": "message" }`. Validation errors also include `details.fields`.

**Access levels**
- **Public:** no session needed.
- **Session:** a guest session is required.
- **Owner:** the session must own the trip.
- **Owner or link:** the trip owner, or anyone with a valid signed trip link (header `X-Trip-Access`).

### Health and session

| Method | Route | Access | Purpose |
|---|---|---|---|
| GET | `/api/health` | Public | Liveness check. Also reports whether push notifications and AI suggestions are enabled. |
| GET | `/api/rules` | Public | Scoring rules used by the server-side reward ledger. |
| POST | `/api/session` | Public | Returns the current guest user, or creates a new guest account and session cookie. Rate-limited. |
| GET | `/api/me` | Session | Current user and their progress summary. |
| PATCH | `/api/me` | Session | Update the display name: `{ displayName }`. |
| GET | `/api/dashboard` | Session | Everything the trips dashboard needs: trips, next trip and recent activity. |

### Trips

| Method | Route | Access | Purpose |
|---|---|---|---|
| GET | `/api/trips` | Session | List your trips, each with its readiness. |
| POST | `/api/trips` | Session | Create a trip and generate its checklist (rules, plus AI when configured). Body: destination, country, purpose, departure date/time, time zone, and optionally `notifications: { remindersEnabled, updatesEnabled }`. Rate-limited. |
| GET | `/api/trips/:id` | Owner or link | Trip, checklist items, readiness, and (owner only) reminder settings. |
| PATCH | `/api/trips/:id` | Owner | Rename the trip or change its departure. Reminders are rescheduled automatically, time-zone aware. |
| DELETE | `/api/trips/:id` | Owner | Delete the trip, its checklist and any scheduled reminders. |

### Checklist items

| Method | Route | Access | Purpose |
|---|---|---|---|
| POST | `/api/trips/:id/items` | Owner or link | Add your own item to a category. Text that looks like a document or account number is rejected. |
| PATCH | `/api/trips/:id/items/:itemId` | Owner or link | Check or uncheck an item, edit it, mark it not needed, or confirm a requirement (`requirementStatus: "verified"`). Returns the updated readiness. |
| DELETE | `/api/trips/:id/items/:itemId` | Owner or link | Remove an item. |
| POST | `/api/trips/:id/reorder` | Owner or link | Save the item order in a category: `{ category, orderedIds }`. |

### Reminders and push notifications

| Method | Route | Access | Purpose |
|---|---|---|---|
| PUT | `/api/trips/:id/notifications` | Owner | Turn this trip's reminders and checklist updates on or off: `{ remindersEnabled, updatesEnabled }`. The schedule (24 h and 3 h before departure) is fixed on the server. |
| GET | `/api/trips/:id/messages` | Owner | Scheduled reminders and the log of recent notifications. |
| GET | `/api/push/key` | Public | The VAPID public key the browser needs to subscribe. |
| POST | `/api/push/subscriptions` | Session | Register this browser or phone for notifications: `{ endpoint, keys: { p256dh, auth } }`. Idempotent. |
| DELETE | `/api/push/subscriptions` | Session | Unregister a device: `{ endpoint }`. |
| POST | `/api/push/test` | Session | Send a test notification to your devices. |

In production, every other (non-`/api`) path serves the built web app (`dist/index.html`).

---

## How reminders work

1. When reminders are on for a trip, the server schedules jobs 24 h and 3 h before departure in a durable SQLite job queue. Times are time-zone aware, and past times are skipped.
2. Checking items queues **one** batched update (at most one every 2 minutes) when updates are on.
3. A scheduler checks for due jobs every 15 seconds. It sends the notification to every device where the trip owner turned notifications on.
4. If every device fails, the job retries after 1, 5, 15 and then 60 minutes. Devices the push service reports as gone are forgotten. With no devices, the reminder is skipped.
5. A notification shows the destination, departure time and progress only, for example: *"Your trip to Dubai departs Tue 1 Dec, 14:00 · 3 items still to check · 75% prepared"*.

**Device support:**
- **Android and desktop browsers:** work directly.
- **iPhone (iOS 16.4+):** add ORBIT to the Home Screen and open it from there.

---

## Environment variables

See `.env.example`. Nothing is required for local development.

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `8787` | API port |
| `APP_BASE_URL` | `http://localhost:5174` | Public URL of the web app. Used for trip links in notifications, and as the default VAPID subject when it's https. |
| `LINK_SIGNING_SECRET` | random per process (dev) | **Required in production.** Signs trip links. |
| `LINK_TTL_HOURS` | `72` | How long a trip link in a notification stays valid |
| `ORBIT_DB_PATH` | `server/data/orbit.db` | SQLite database file |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | — | Web push keys (`npx web-push generate-vapid-keys`). Without them, no notifications are sent. |
| `VAPID_SUBJECT` | `APP_BASE_URL` if https | Contact for push services: `mailto:…` or an https URL |
| `REMINDER_OFFSETS_HOURS` | `24,3` | When reminders are sent, in hours before departure |
| `UPDATE_BATCH_SECONDS` | `120` | Batching window for checklist-update notifications |
| `GEMINI_API_KEY` | — | Enables AI checklist suggestions (Google Gemini) |
| `ORBIT_AI_MODEL` | `gemini-2.5-flash` | Model used for suggestions |
| `ORBIT_AI_ENABLED` | `true` | Set `false` to always use rule-based checklists |
| `ORBIT_SCORING_JSON` | — | Override the server-side reward values and limits |

---

## Project structure

```
src/                      React web app
  pages/                  one file per route (see "Web app routes")
  components/             UI building blocks: adventure, discover, trips, home, layout, map, mascot, ui
  services/               API client (orbitApi), OpenStreetMap places, location, local cache
  lib/                    planner (time windows and travel estimates), push helpers, formatting
  store/                  Zustand store (preferences, saved items, live adventure), persisted in localStorage
  data/                   curated adventures, Kerala places, form options
public/sw.js              service worker that shows push notifications
server/                   Express API
  app.js                  routes and middleware
  services/               trips, checklist rules, AI suggestions, readiness, notifications scheduler, push, links
  migrations/             numbered SQL migrations, applied automatically on start
  data/                   SQLite database (git-ignored) and official entry-requirement sources
  tests/                  node:test suites
design-system/orbit/      design decisions (colours, typography, components)
```

---

## Accuracy and safety rules

- ORBIT never states that a visa, permit or vaccination is or isn't required. Those items are created as **requirements to confirm**, with a link to an official government portal when one is known.
- **Preparation progress** (weighted by importance: critical 5, high 3, normal 2, optional 1) and **requirement status** (how many requirements you've confirmed) are shown separately.
- Distances are straight-line and labelled as such. Travel times are estimates, not routed times. Prices and opening hours from OpenStreetMap are never invented.
- OpenStreetMap is used responsibly:
  - live results are cached for 24 hours
  - only one request runs at a time, with a cooldown between requests
  - place search runs only when you submit, never as you type

## Security

- **Sessions:** guest sessions use a random token in an httpOnly, SameSite=Lax cookie. Only its SHA-256 hash is stored.
- **CSRF:** every API request needs the `X-Orbit-Client: 1` header.
- **Access control:** every trip and item operation checks ownership.
- **Trip links:** links in notifications are HMAC-signed, expiring and valid for one trip only.
- **Input checks:** all input is validated with Zod.
- **Rate limits:** there are general limits, plus limits on trip creation, item changes, preferences and push.
- **Secrets:** `.env` files and the database are git-ignored.

## Testing

```bash
npm test        # backend: sessions and CSRF, checklist rules, readiness, reminders scheduling, push delivery
npm run lint
npm run build   # also catches broken imports in the web app
```

## Known limitations

- **Accounts:** they're per-browser guest sessions. There's no email login or cross-device sync yet, so each browser is its own account.
- **Scaling:** the scheduler and rate limits run in-process. Use a shared queue and store before running more than one server instance.
- **Hosting:** the server must stay running for reminders to go out, and the database needs persistent storage. Serverless or "sleeping" free hosting won't work as-is.
- **Coverage:** curated adventure data covers a few demo cities and Kerala. The live Kozhikode list depends on OpenStreetMap's coverage.

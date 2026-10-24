# RapidRescue — Smart Ambulance Booking & Dynamic Dispatch (Frontend Demo)

> **Demo only — this does not contact emergency services.** In a real emergency call your local emergency number.

RapidRescue is an **academic software-engineering demonstration**: a complete React frontend for a patient booking journey, a driver trip workflow, an administrator console and a *simulated* ETA-based dispatch concept. Booking, dispatch and all other application data are fictional and stored in your browser.

## Phase 2 — Firebase Authentication
Email/password registration with a **verification email**, login, password-reset email, logout and session restore, all through Firebase Authentication. Setup: **[FIREBASE_AUTH_SETUP.md](FIREBASE_AUTH_SETUP.md)**.

## Phase 3 — Firestore profiles and Security Rules (this release)
Application **profiles** (`users/{uid}`: display name, phone, role, account status) now live in **Firestore**, protected by deny-by-default **Security Rules**; Auth credentials stay in Firebase Authentication and no secrets are stored in Firestore. The role used for routing now comes from the Firestore profile (not localStorage); `admin` can only be set by a privileged Console write. Docs: **[../backend/docs/FIRESTORE_SCHEMA.md](../backend/docs/FIRESTORE_SCHEMA.md)**, **[../backend/docs/FIRESTORE_SECURITY_RULES.md](../backend/docs/FIRESTORE_SECURITY_RULES.md)**, **[../backend/docs/PHASE3_SETUP.md](../backend/docs/PHASE3_SETUP.md)**.

**Important:** the Security Rules and their emulator tests are included but were **not executed** in the environment where they were written (the Firestore emulator could not be downloaded). Run `npm run test:rules` before deploying.

**Explicitly NOT implemented:** booking/ambulance/dispatch data in Firestore (those remain local demo data), Realtime Database, Cloud Functions, Firebase Admin SDK, live GPS/real ETAs, real dispatch, payments, server-side admin authority. **No Supabase** code, dependency or configuration exists.

## Phase 4 — Patient profile and dashboard integration (this release)
The patient **Profile** page and **Dashboard** now display the Firestore profile (name, phone) and the Firebase Auth email instead of the local demo cache, and saving the profile writes `displayName`/`phoneNumber` to Firestore first (success is shown only after Firestore confirms). Address and emergency contact stay **on this device only** (they are not in the approved Phase 3 schema) and are labelled as such; booking cards are labelled **Demo data**. No schema, rules, role or route changes. Details: **[../backend/docs/PATIENT_PROFILE.md](../backend/docs/PATIENT_PROFILE.md)**. Not implemented: bookings in Firestore, ambulances, dispatch, GPS, driver/admin integration, Phase 5.

## Phase 5 — Driver profile and dashboard integration (this release)
The driver **Profile** and **Dashboard** use the same Firestore profile and Auth email as patients (saves write to Firestore first; success only after confirmation) and now label the driver record, availability, requests and trip stats as **demo data on this device**. **Open decision:** there is no driver approval state and the `driver` role is self-declared at registration. It grants no Firestore privilege today, but it must be resolved before drivers get privileged data; options and a recommendation are in **[../backend/docs/DRIVER_PROFILE.md](../backend/docs/DRIVER_PROFILE.md)**. No schema, rules, role, route or dependency changes. Not implemented: ambulances/fleet, bookings, assignments, dispatch, GPS, earnings, admin features, Phase 6.

## Features
- **Public:** landing page, Firebase login, registration (Patient/Driver only) with email verification, `/verify-email` (resend / re-check / log out), forgot-password (Firebase reset email), 404, unauthorized page.
- **Patient:** dashboard (metrics derived from shared state), validated booking form with map/location picker + confirmation dialog, My Bookings (search, status filter, sort, details, cancel with confirmation), simulated tracking with timeline, profile editing.
- **Driver:** dashboard with online/offline toggle, request queue (accept / decline), active trip with only-valid lifecycle actions, trip history, profile.
- **Admin:** dashboard with Recharts, Users, Drivers, Ambulances (full CRUD), Bookings (valid status actions), Dispatch Monitoring, Demand Positioning, Reports (date filter + working CSV export), Settings (local display/notification prefs, reset demo data).

## Backend connection
The frontend calls the Node.js API through `src/lib/backendApi.ts`. During development, Vite proxies `/api` requests to `http://localhost:5000`. The API currently exposes health and integration-status endpoints; booking, fleet and dispatch workflows still use the existing browser-local store. See `../backend/README.md`.

## Stack
React 18, Vite 5, TypeScript (strict), React Router 6, Tailwind CSS 3.4, Lucide React, Recharts, React Hook Form + Zod, Sonner (toasts), Leaflet + OpenStreetMap tiles (no key), **Firebase Web SDK 13.0.0 (modular; only `firebase/app` and `firebase/auth` are imported)**. Vitest for unit tests.

## Prerequisites
Node.js 18+ (developed on Node 22) and npm.

## Install & run
Start the backend first in a separate terminal from the project root using `cd backend`, `npm install`, and `npm run dev`. Then run the frontend from this folder:
```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + production build into dist/
npm run preview    # serve the production build locally
npm run typecheck  # tsc only
npm test           # Vitest unit tests (domain logic, auth, profiles, static rules review)
npm run test:rules # Security Rules tests in the Firestore emulator (needs Java; see docs/PHASE3_SETUP.md)
```
There is **no lint script** (ESLint is not configured). For static hosting, configure an SPA fallback so deep links like `/admin/dashboard` resolve to `index.html` (the dev and preview servers already do).

## Configuration & accounts
Copy `.env.example` to `.env.local` and fill in your Firebase Web config (4 required variables; see FIREBASE_AUTH_SETUP.md). Without it the app still runs, but login/registration/reset are disabled with a clear message. There are **no built-in production accounts**: register through the app and verify your email.

**Developer demo mode (optional, dev builds only):** with `VITE_ENABLE_DEMO_MODE=true` and `npm run dev`, the login page shows offline seeded accounts (`patient@` / `driver@` / `admin@rapidrescue.demo`, password `Demo@1234`) so every screen, including the admin console, can be reviewed. This is **not Firebase**, bypasses email verification, and is ignored by production builds. Firebase sign-in always overrides a demo session.

## Routes
Public: `/`, `/login`, `/register`, `/forgot-password`, `/verify-email` (new), `/unauthorized`, `*` (404).
Patient: `/patient/dashboard`, `/patient/book-ambulance`, `/patient/bookings`, `/patient/track-ambulance`, `/patient/profile`.
Driver: `/driver/dashboard`, `/driver/requests`, `/driver/active-trip`, `/driver/trip-history`, `/driver/profile`.
Admin: `/admin/dashboard`, `/admin/users`, `/admin/drivers`, `/admin/ambulances`, `/admin/bookings`, `/admin/dispatch`, `/admin/demand-positioning`, `/admin/reports`, `/admin/settings`.
The guard distinguishes four states: *initializing* (spinner, nothing protected rendered), *signed out* (→ `/login`, remembering the intended page), *signed in but unverified* (→ `/verify-email`) and *verified* (role check; wrong role → `/unauthorized`). **Client-side guards are a UX layer, not server-side authorization.**

## Authentication behaviour
- **Register:** validates the form, creates the Firebase account, sets the Auth display name (best effort), requests the verification email, creates a local demo profile (name/phone/role) and opens `/verify-email`. If the email request fails, the account still exists and the page says so accurately and offers *Resend*. Public registration can only create Patient or Driver.
- **Unverified users** stay signed in (so they can resend / re-check / log out) but cannot open any dashboard.
- **Login:** Firebase email/password; wrong password and unknown email show the same generic message. Duplicate submits are blocked. `returnTo` is honoured for verified users.
- **Forgot password:** `sendPasswordResetEmail`; neutral wording ("If an account exists…"), unknown emails are not revealed; network/other errors are shown, never reported as success.
- **Logout:** Firebase `signOut`, then app state clears and you return to `/login`. Demo app data is **not** erased.
- **Session restore:** Firebase's default browser persistence; a single `onAuthStateChanged` observer (cleaned up on unmount) drives the shared auth context. The app never stores passwords or tokens itself (the legacy Phase 1 `rr.credentials` key is deleted on load).

## Roles
- **Source of truth:** the Firestore profile's `role`. Users self-declare `patient` or `driver` at registration; the rules make `role` immutable for clients and never allow `admin`. `driver` is a non-privileged label.
- **Admin:** only via a privileged write (Firebase Console), see docs/PHASE3_SETUP.md §4. A Console-provisioned admin can open the admin screens, which still operate on **local demo data**. The rules give admins **no** extra Firestore access in this phase.
- **Local storage is not authoritative:** the local demo store is only a cache for the booking/dispatch demo; editing it cannot change the role used for routing.
- **Missing profile** (e.g. accounts from Phase 2): a default `patient` profile is created on first verified sign-in.
- Client-side guards are a UX layer; the database rules are the security boundary for profile data.

## Workflows to try
*With Firebase login you can try the Patient and Driver screens (register one account per role and verify each email). To also review the Admin console, Dispatch Monitoring and the seeded multi-role scenario, use developer demo mode (`VITE_ENABLE_DEMO_MODE=true` + `npm run dev`).*

1. **Patient → Driver → Admin:** log in as patient, book (pick a demo location, add a condition) → log in as driver, accept it, step through *Start trip → Arrived → Start transport → Complete* → as patient see **Completed** in My Bookings; as admin see it in Bookings, Reports and the CSV.
2. **Smart dispatch:** as admin open *Dispatch Monitoring*. The seeded request at "Green Park Apartments" shows **RR-AMB-01 as nearest (1.1 km, ~12 min)** but **RR-AMB-02 recommended (2.6 km, ~7 min)** because of their mock route profiles. Assign it, then as the assigned driver accept or decline.
3. **Offline driver:** take a driver offline (driver dashboard or Admin → Drivers) and watch their ambulance drop out of dispatch candidates.

## Architecture
```
src/
  types/        domain types (User, Booking, Ambulance, Driver, ...)
  domain/       pure logic: status rules + transitions, engine (all mutations), dispatch, demand, selectors, reports, tracking
  services/     contracts.ts (interfaces), local.ts (mock impls), store.ts (single store + persistence), index.ts (composition root)
  data/         seed data + fictional places/route profiles
  lib/          firebase.ts + firebaseConfig.ts (Auth-only init, env validation), storage, csv, geo, ids, zod schemas
  contexts/ hooks/ components/ layouts/ pages/ routes/
```
Pages depend on `services` / hooks, never on localStorage or seed arrays directly. All mutations are pure functions in `domain/engine.ts` that validate relationships and status transitions and are applied atomically by the store, so related screens stay consistent.

**Booking lifecycle** (single source: `domain/status.ts`): `requested → assigned → accepted → on_the_way → arrived → in_progress → completed`; `cancelled` is allowed until transport starts; `rejected` is an admin outcome. Completed/cancelled/rejected are terminal. A patient can have one open booking; a driver/ambulance can have one active trip. Declining a request only hides it for that driver — it stays available for others.

## Data & persistence
Profiles live in Firestore (`users/{uid}`); all other application data (bookings, ambulances, dispatch, patient address/emergency contact, admin user list) lives in the browser's `localStorage` (keys `rr.state`, and `rr.session` for developer demo mode only) inside a versioned envelope; Firebase keeps its own session in the browser (IndexedDB). Corrupted or incompatible data is discarded and re-seeded. If storage is unavailable the app runs from memory. It is **not a database**, is per-browser, and is shared across tabs of the same browser. **Reset:** Admin → Settings → *Reset demo data* (confirmed), or clear site data.

## Dispatch / ETA simulation (deterministic, not real routing)
`routeKm = straightLineKm × detourFactor`; `ETA = ceil(routeKm / avgSpeedKmh × 60 + 2 min)` using each ambulance's mock *route profile*. Ineligible: not in service, no/offline/deactivated driver, offline or busy ambulance, type below the requested type (Basic < Advanced < ICU), driver declined, already on an active trip. Recommendation = lowest ETA (ties → shorter distance → id). Explanations and "no eligible ambulance" are shown in the UI. All values are labelled simulated.

**Demand positioning** (rule-based, no forecasting): zone score = base index + 4 × nearby bookings; fleet distributed by largest-remainder; available surplus ambulances are suggested to move to deficit zones (see the page for the exact rule).

**Tracking** is derived from status (base → halfway to pickup → pickup → halfway to destination → destination); no timers, no "live" indicator.

## Maps & network
Leaflet uses OpenStreetMap tiles (internet required). If tiles can't load (offline/blocked) after a short wait the map is replaced by a schematic SVG plot; a text list of locations is always shown. All coordinates are fictional. Device location is never requested.

## Accessibility & responsiveness
Semantic landmarks, skip links, labelled form fields with inline errors, native `<dialog>` (focus trap, Esc, focus return), status shown with icon + text, `prefers-reduced-motion` respected, sortable-table `aria-sort`, chart text summaries. Layouts use a collapsible sidebar and horizontally scrolling tables.

## Verification status (honest report)
| Check | Result |
|---|---|
| `npm run typecheck` (includes the emulator test sources and stand-in) and `npm run build` | **Passed** |
| Unit tests `npm test` (63: domain rules, auth error mapping, config validation, guard decisions, profile validation, engine sync, Firestore service with the SDK **mocked**, profile save wrapper, static review of `firestore.rules`) | **Passed** |
| **Security Rules runtime tests** (`npm run test:rules`, 57 emulator cases) | **NOT RUN** — written and type-checked, but the Firestore emulator could not be downloaded here. The rules have **not** been compiled or executed by Firebase tooling. The static review test is *not* a substitute. |
| Browser E2E (131 checks, incl. 25 for the patient and 25 for the driver profile/dashboard) — real Firebase Auth SDK against a **stubbed** identity backend, with the Firestore profile layer replaced by an in-browser **stand-in** (`e2e/fakeProfiles.ts`): profile-backed roles, Console-provisioned admin, role-spoofing attempt, profile error/retry/log-out, deactivated account, missing-profile default, remote edits, registration-failure retry, token refresh | **PARTIALLY VERIFIED** — app logic verified; the real Firestore SDK path and the rules were **not** exercised at runtime |
| Regression of earlier non-auth workflows (59/60 from the earlier suite, demo mode; the 1 difference is the intentionally renamed register heading) | **Passed** |
| Real Firestore database, deployed rules, real verification/reset emails, Firebase Console setup | **NOT RUN** |
| Real OpenStreetMap tiles; Firefox/Safari; real phones; keyboard-only/screen-reader testing | **NOT RUN** |
| ESLint | **Not configured** |

## Known limitations
- Mobile navigation drawer closes with Esc / backdrop but has no strict focus trap.
- Tables scroll horizontally on small screens rather than turning into cards.
- Bookings and all other demo data remain browser-local and user-editable (not in Firestore); only name/phone/role/status are remote. Patient address and emergency contact are device-local.
- The local demo cache keeps Firebase users' name/phone/address in localStorage after sign-out (not shown to other accounts); avoid real personal data on shared computers.
- `driver` is a self-declared, unprivileged label with **no approval state** (open decision, see docs/DRIVER_PROFILE.md); admin authority over data does not exist yet (needs custom claims / a trusted backend). Driver ID, licence, ambulance, availability and trips are local demo data.
- An unverified user can create (not read) their own bounded profile document before verifying.
- Admin screens, even for a Console-provisioned admin, act on local demo data only.
- Two browser tabs editing at once is last-write-wins.
- Bundle is code-split by page; Recharts and Leaflet chunks are the largest.

## Future work (not part of this phase)
Booking/ambulance/dispatch data, trusted admin/driver authority (e.g. custom claims) and anything else must be requested explicitly. `bookings/{id}` is documented as **design only** in docs/FIRESTORE_SCHEMA.md.

## Troubleshooting
- *`npm install` fails:* use Node 18+, delete `node_modules`, retry.
- *Blank page / stale data after upgrading:* clear site data for the origin (or use Reset demo data).
- *404 on refresh in production hosting:* add an SPA fallback to `index.html`.
- *Map is a grey/schematic plot:* tiles are blocked or offline; the app still works.
- *Auth problems:* see the troubleshooting table in FIREBASE_AUTH_SETUP.md.

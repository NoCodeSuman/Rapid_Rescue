# Patient profile and dashboard (Phase 4)

Phase 4 connects the existing patient **Profile** page and **Dashboard** to the Phase 3 profile (`users/{uid}`) and to Firebase Authentication. It changes **no schema, no Security Rules, no roles and no routes**.

## Data flow
1. `onAuthStateChanged` (Phase 2) reports the Firebase user. The guard requires a **verified** email.
2. `AuthContext` reads `users/{uid}` for **that UID only** (never from a URL, form or storage). If it is missing it creates the safe default (patient, no overwrite; see `FIRESTORE_SCHEMA.md`).
3. The app user shown everywhere is built from: **display name, phone, role, status ← Firestore profile**; **email ← Firebase Auth**. The local demo cache is no longer a display source; it only supplies a local id for the still-local booking demo.
4. Saving the Profile page: `displayName`/`phoneNumber` are written to Firestore **first** (self-editable fields only, UID from the authenticated user). Only after Firestore confirms are the header, dashboard and form updated and the local copy changed. If the write fails, an error is shown, nothing else changes and the entered values stay in the form.
5. If name and phone did not change (only address/emergency contact were edited) **no Firestore write happens**.
6. Sign-out or account switch clears the in-memory profile; a late response for a previous user is ignored.

## What is stored where
| Field on the Profile page | Stored in |
|---|---|
| Email | Firebase Authentication (read-only here) |
| Full name, Phone | Firestore `users/{uid}` (`displayName`, `phoneNumber`) |
| Address, Emergency contact name/phone | **This browser only** (local demo data). Not in the Phase 3 schema; persisting them would need a schema/rules change and your approval. The page labels these fields "Saved on this device only". |

## Dashboard honesty
Booking statistics, "Current active booking" and "Recent bookings" come from the **local demo booking flow**; nothing is seeded for a new Firebase patient (it starts at 0 / empty). These cards are labelled **Demo data**. No booking collection exists in Firestore.

## Security notes
- Authorization is enforced by the Firestore rules (owner-only, verified email, three editable fields, immutable role/status/uid/timestamps). Route guards are UX only.
- A patient cannot change their role or status, and cannot read or write another profile (rules; see `docs/FIRESTORE_SECURITY_RULES.md`).
- Known limitation: the local demo cache (`rr.state` in localStorage) keeps name/phone/address of Firebase users on this device after sign-out. It is not shown to other accounts, but on a shared computer do not enter real personal data; clearing site data removes it.

## Tests
- `npm test` includes `src/test/profilePersistence.test.ts` (save ordering, no write when unchanged, UID from auth, failure behaviour).
- `e2e/run_auth_e2e.py` (Phase 4 section, 25 checks): form population, read-only Auth email, tamper-proof display, refresh, one write per edit, local-only fields, validation, failed writes, sign-out/account switching, role/verification gates. These run against a **stand-in** for the Firestore profile layer, not real Firestore.
- Security Rules tests (`npm run test:rules`) are unchanged and still need the Firestore emulator on your machine.

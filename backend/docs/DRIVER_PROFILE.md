# Driver profile and dashboard (Phase 5)

Phase 5 connects the existing driver **Profile** and **Dashboard** to the same Firebase Authentication + Firestore profile used for patients. It changes **no schema, no Security Rules, no roles, no routes and no dependencies**, and adds **no approval or privileged behaviour** (see "Open decision" below).

## Data flow (same as patients; see PATIENT_PROFILE.md)
1. `onAuthStateChanged` → verified Firebase user → guard. Drivers use the identical login, verification and logout flow.
2. `AuthContext` reads `users/{uid}` for that UID only. Name, phone, role and status come from that document; email comes from Firebase Auth. The local demo cache is not a display source and cannot change the role used for routing.
3. `/driver/*` is reachable only when the Firestore role is `driver` (guard = navigation/UX; the database rules enforce data access).
4. Saving the driver Profile writes `displayName` / `phoneNumber` to Firestore **first**; success is shown only after Firestore confirms, otherwise the error is shown and the form keeps your input. Nothing is written if name/phone are unchanged.
5. Sign-out/account switch clears the in-memory profile; late responses for a previous user are ignored.

## What is stored where
| Item | Stored in |
|---|---|
| Email | Firebase Authentication (read-only) |
| Full name, Phone | Firestore `users/{uid}` (`displayName`, `phoneNumber`) |
| `role` (`driver`) | Firestore `users/{uid}`: self-declared at registration, immutable afterwards (see below) |
| Driver ID, licence, assigned ambulance, online/offline availability, current assignment, trip counts, requests | **Local demo data on this device only.** Not in the approved Firestore schema, not persisted remotely, not real operational data. The pages label them "Demo data". |

New Firebase drivers start with **no ambulance, offline, no trips**: nothing is seeded or invented.

## Role trust and approval: open decision (not implemented)
**Finding.** No driver-approval state exists anywhere in the approved architecture. The rules let any user choose `role: "driver"` when their profile is created (the role is immutable afterwards, but it is not vetted). Today this grants **no Firestore privilege**: a "driver" can read/update only their own profile, exactly like a patient (the rules tests in `tests/rules` pin this), and the driver screens operate on local demo data. It would become a real gap as soon as drivers get privileged data (assignments, trips, patient details).

**Not done in Phase 5** because each fix changes the schema/rules and/or registration UI and needs your approval:

| Option | What changes | Notes |
|---|---|---|
| 1. Keep as is for now | nothing | Acceptable only while drivers have no privileged data. |
| 2. Patient-only self-registration; drivers promoted in the Console | rules create allow-list becomes `patient`; registration "Driver" choice becomes a request | Simple, trusted promotion by you; changes registration behaviour. |
| 3. Add a system-managed `approvalStatus` (`pending`/`approved`/`rejected`) | schema + rules (client can only create `pending`, never change it) + a "pending approval" screen; you set `approved` in the Console | Smallest data change that supports real vetting. |
| 4. Custom claims set by a trusted Admin SDK process | needs a backend (out of scope so far) | Strongest; best long-term for admin/driver authority. |

Recommendation: Option 3 before any driver-specific data or privileges are introduced.

## Tests
- Browser E2E `e2e/run_auth_e2e.py` (Phase 5 section, 25 checks): form population, read-only Auth email, tamper-proof display, role spoofing, refresh, one write per edit, validation, failed writes, availability toggle is local-only, empty states, driver↔driver account switching, patient/driver/unverified gating, return-to-page. These use a stand-in for the Firestore profile layer, not real Firestore.
- Security Rules: `tests/rules/users.rules.test.ts` now includes 10 driver scenarios (own read/update, no role change, no approval/availability/ambulance/licence fields, no cross-driver or driver↔patient access, no list/other collections, no delete, deactivated and unverified cases). **Not run here** (no Firestore emulator available); run `npm run test:rules` on your machine.

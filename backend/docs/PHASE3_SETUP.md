# Phase 3 setup: Firestore profiles, rules and tests

## What Phase 3 adds
Firestore `users/{uid}` profiles (schema in `FIRESTORE_SCHEMA.md`), `firestore.rules`, `firebase.json` (rules path + emulator ports), an emulator rules test suite, and a minimal profile service wired into sign-in. **Not implemented:** booking workflow, dispatch, GPS, Realtime Database, Cloud Functions, Admin SDK, Supabase.

## 1. Create the Firestore database (Console)
Firebase Console → **Build → Firestore Database → Create database**. Choose **production mode** (the project's rules replace the defaults) and a location. **The location cannot be changed later.** No new environment variables are needed: Firestore uses the same Web app config as Authentication.

## 2. Run the emulator rules tests (required before deploying)
Requires **Java** (a recent JDK; check the current `firebase-tools` requirements) and network access so `firebase-tools` can download the Firestore emulator on first run.
```bash
npm install
npm run test:rules     # starts the Firestore emulator (demo project, no real project touched) and runs tests/rules/*.test.ts
npm run emulators      # optional: start the emulator only
```
The suite (57 cases) uses ordinary authenticated/unauthenticated contexts for every assertion. `withSecurityRulesDisabled` is used **only to seed** documents. All other unit tests: `npm test` (these include a *static review* of `firestore.rules`, which is not a runtime test).

## 3. Deploy the rules (only when you are ready)
```bash
npx firebase login
npx firebase deploy --only firestore:rules --project <YOUR_PROJECT_ID>
```
There is intentionally **no `.firebaserc`**: always pass `--project` explicitly and double-check the ID, so you never deploy to the wrong project. Never deploy permissive temporary rules. **Rollback:** Console → Firestore → Rules → history → republish the previous version (and keep `firestore.rules` in version control).

## 4. Provisioning an admin (Console only)
1. Register and verify the account normally; sign in once (this creates `users/{uid}` as `patient`).
2. Find the UID in **Authentication → Users**.
3. **Firestore → users → {uid}** → edit `role` to `admin` (Console writes bypass rules).
4. The user signs out and back in; the admin screens open (they still use local demo data).
To deactivate someone, set `accountStatus` to `inactive`. To correct a Phase 2 driver, set `role` to `driver`.

## 5. Behaviour to expect
- First sign-in after verification reads `users/{uid}`; if missing, a default `patient` profile is created.
- Registration writes the profile immediately (before verification) so the chosen role/phone are kept; if that fails, the choices are kept locally (no password/token) and retried after verification.
- After you verify, the app force-refreshes the ID token; otherwise Firestore would still see `email_verified: false` for up to an hour.
- If the profile cannot be loaded (permission denied, offline, malformed), a panel offers **Try again** and **Log out**.
- Editing your name/phone on the existing Profile pages also updates Firestore (self-editable fields only, skipped when unchanged); if that fails, nothing changes locally. See `PATIENT_PROFILE.md`.

## 6. Troubleshooting
| Symptom | Likely cause |
|---|---|
| "permission denied" panel right after verifying | stale token (retry), or rules not deployed / database not created |
| Panel says profile data is invalid | the document violates the schema (edit it in the Console) |
| `npm run test:rules` cannot start | Java missing, or the emulator download is blocked by your network |
| Registered as driver but see patient | the profile was missing/failed and defaulted to patient; correct `role` in the Console |

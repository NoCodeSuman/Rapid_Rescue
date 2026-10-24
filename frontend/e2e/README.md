# Optional browser checks (Python + Playwright; not npm scripts)

```
pip install playwright && python -m playwright install chromium
```

## 1. `run_auth_e2e.py` — Firebase Authentication, profile and patient profile/dashboard flows (Phases 2–5)
Drives the **real Firebase JS SDK** in Chromium against a **stubbed Identity Toolkit backend** (requests to
`identitytoolkit.googleapis.com` / `securetoken.googleapis.com` are intercepted and answered by a small in-script stub).
It verifies this app's code paths (registration, verification gating, login, reset, logout, session restore, error
mapping, route guards) but **not** Google's servers or real email delivery.

Phase 3 note: Firestore's streaming protocol is impractical to stub, so this suite builds with `vite.config.e2e.ts`, which
aliases `services/firestoreProfiles.ts` to the in-browser stand-in `e2e/fakeProfiles.ts` (same `ProfileService` interface,
profiles kept in localStorage, failure injection by flags). It verifies the guard/context/profile logic, **not** the real
Firestore SDK or the Security Rules (those need `npm run test:rules`).

It needs two production builds served locally:
```
# build WITH placeholder Firebase env + the profile stand-in, served on :4176
VITE_FIREBASE_API_KEY=test-key VITE_FIREBASE_AUTH_DOMAIN=test.firebaseapp.com \
VITE_FIREBASE_PROJECT_ID=test-project VITE_FIREBASE_APP_ID=1:1:web:1 npx vite build --config vite.config.e2e.ts --outDir dist-test
npx vite preview --outDir dist-test --port 4176 &
# build WITHOUT Firebase env, served on :4175
npm run build && npx vite preview --outDir dist --port 4175 &
python e2e/run_auth_e2e.py
```

## 2. `run_regression_demo_mode.py` — non-auth workflow regression
Runs the earlier workflow suite (booking, driver trip lifecycle, admin CRUD, dispatch, CSV, reset, responsive overflow)
against the dev server in developer demo mode (the only way to reach admin pages in this phase):
```
VITE_ENABLE_DEMO_MODE=true npx vite --port 5199 &
python e2e/run_regression_demo_mode.py
```
Screenshots go to `./e2e-out`. The scripts use throwaway browser profiles and may reset demo data.

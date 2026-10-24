# Firebase Authentication setup (Phase 2)

This phase integrates **Firebase Authentication only** (email + password, email verification, password reset, sign-out,
session restore). You must create and configure the Firebase project yourself; nothing here touches your Console.
**Never paste service-account keys or Admin SDK credentials into this project.**

## 1. Create the project and Web app
1. Open the [Firebase Console](https://console.firebase.google.com/) and create (or open) a project.
2. Project settings (gear icon) → **General** → **Your apps** → add a **Web** app (`</>`). No Firebase Hosting is needed.
3. Copy the `firebaseConfig` values shown for the Web app. This is *client-side web-app configuration*, not a secret key
   (it is visible to anyone who loads the site), so hiding it is not a security measure.

## 2. Enable the Email/Password provider
**Build → Authentication → Get started → Sign-in method → Email/Password → Enable → Save.**
(Leave "Email link (passwordless)" off; this app does not use it.)

## 3. Authorized domains
**Authentication → Settings → Authorized domains.** `localhost` is included by default for local development.
Add your deployed domain before deploying. Sign-in, verification and reset links can fail with an "unauthorized domain"
style error if the domain is not listed.

## 4. Email templates (optional but recommended)
**Authentication → Templates** lets you review the *Email address verification* and *Password reset* emails
(sender name, subject, language). Firebase sends these emails; this app does not. Delivery depends on your project's
configuration, quotas, spam filtering and network access.

## 5. Configure the app
```bash
cp .env.example .env.local
```
Edit `.env.local` and set the four required values (`VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`,
`VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID`). `VITE_FIREBASE_STORAGE_BUCKET` and
`VITE_FIREBASE_MESSAGING_SENDER_ID` are optional and unused. `.env.local` is git-ignored; it is not included in the ZIP.
**Restart the dev server after changing environment variables.** Production builds read the values at build time.

If a value is missing or still a placeholder, the app does not crash: Login/Register/Forgot-password show a message naming
the missing variables and disable submit.

## 6. Run and test manually
```bash
npm install
npm run dev          # http://localhost:5173
```
1. **Register** at `/register` (Patient or Driver). You land on `/verify-email`.
2. Check your inbox **and spam** for the Firebase verification email and open the link.
3. Back on `/verify-email` press **I've verified my email** → you are sent to your dashboard.
4. **Forgot password:** `/forgot-password` → enter your email → follow the emailed link.
5. **Logout** from the sidebar, then reload a protected URL → you are sent to `/login`.
6. **Session restore:** log in, refresh the page → you stay signed in (Firebase persists the session in the browser).

## What is and is not stored where
| Data | Where |
|---|---|
| Email, password hash, verification state | Firebase Authentication (Google). The app never sees/stores the password after sending it. |
| Display name | Firebase Auth user profile (best effort at registration). |
| Display name, phone, **role**, account status | **Firestore `users/{uid}`** (Phase 3; see docs/FIRESTORE_SCHEMA.md) |
| Bookings, ambulances, dispatch, everything else | Browser `localStorage` demo data only (no Firestore for these). |

## Roles (updated in Phase 3)
Roles now come from the Firestore profile (`users/{uid}.role`), which clients cannot change after creation and can never set to `admin`. Admin is provisioned only via a privileged Console write; see docs/PHASE3_SETUP.md. Rules and profile setup are described in the `docs/` folder. Client-side route guards remain a UX layer, not server-side authorization.

## Developer demo mode (optional)
Set `VITE_ENABLE_DEMO_MODE=true` in `.env.local` and run `npm run dev` to show a panel with offline seeded demo accounts
(password `Demo@1234`) so you can review the Patient/Driver/Admin screens. It is **not Firebase**, bypasses email
verification, is active **only in `vite dev`**, and is ignored by production builds. A real Firebase sign-in always
overrides a demo session.

## Troubleshooting
| Symptom | Likely cause / fix |
|---|---|
| "Firebase is not configured" | `.env.local` missing/placeholders; set the 4 variables and restart `npm run dev`. |
| "Email/password sign-in is not enabled" | Enable the provider (step 2). |
| "Firebase is not configured correctly…" | Wrong API key, or the current domain isn't in Authorized domains (step 3). |
| Verification/reset email doesn't arrive | Check spam; wait a few minutes; confirm the address; check Console → Authentication → Templates and quotas; use **Resend** (30 s cooldown). |
| "Too many attempts" | Firebase rate limiting; wait and retry later. |
| "Incorrect email or password" | Also shown for unknown emails (deliberately, to avoid revealing which emails are registered). |
| Stuck on verification page after clicking the link | Press **I've verified my email**; the app must reload your Firebase user to see the new status. |
| Registered as Driver but see Patient | The profile defaulted to patient (missing/failed profile); correct `role` in the Firestore Console. See docs/PHASE3_SETUP.md. |

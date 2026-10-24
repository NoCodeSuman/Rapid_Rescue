# RapidRescue Firebase connection

The provided Firebase Web app configuration is installed in `frontend/.env.local` for project `rapidrescue-8d1f6`.

## Required Firebase Console checks

1. Open https://console.firebase.google.com/ and select `rapidrescue-8d1f6`.
2. Go to **Build → Authentication → Get started → Sign-in method** and enable **Email/Password** (not Email link/passwordless).
3. In **Authentication → Settings → Authorized domains**, ensure `localhost` is present for local development. Add your real deployed website domain before production deployment.
4. Go to **Build → Firestore Database** and create the database if it does not exist.
5. Publish the rules from `backend/firebase/firestore.rules` to the project's Firestore Rules. These rules intentionally only allow a user to access their own `users/{uid}` profile; other collections are denied by default.
6. Email verification and password reset links require the correct authorized domain and Firebase Authentication email templates.

## Run locally

Use Node.js 24.12.0 or newer if required by the installed Firebase SDK version. Open two terminals from the extracted `rapidrescue_split` folder.

Terminal 1:

```powershell
cd backend
npm install
npm run dev
```

Terminal 2:

```powershell
cd frontend
npm install
npm run dev
```

Open the URL printed by Vite, usually `http://localhost:5173`.

## Verify Firebase

- Register using a real email address and password.
- Check **Firebase Console → Authentication → Users** for the new account.
- Open the verification email and verify the address.
- Sign in, then check **Firestore Database → Data → users → {your UID}** for the profile document.
- Test password reset and sign-out/sign-in.
- If registration succeeds but the profile does not appear, verify Firestore was created and the rules above were published.

## Security notes

The values in `.env.local` are Firebase Web app configuration, which is expected to be visible to browser clients; they are not service-account credentials. Never place a service-account JSON file, Admin SDK private key, or other server secret in `frontend/` or any `VITE_` variable. Restrict the Firebase API key in Google Cloud if appropriate, and configure Firebase Authentication and Firestore Security Rules.

The Node backend currently provides API health/info endpoints. The existing booking, fleet and dispatch demo workflows have not been migrated to Firestore/server persistence by this configuration step.

# RapidRescue Backend

This folder contains the Node.js/Express API and Firebase/Firestore deployment configuration.

## Start the backend

Requirements: Node.js 18+ and npm.

```bash
cd backend
npm install
npm run dev
```

The API runs at `http://localhost:5000` by default.

- `GET /api/health` — health check
- `GET /api/info` — current integration status

Copy `.env.example` to `.env` to customize `PORT` or `CORS_ORIGIN`.

## Firebase / Firestore rules

Firebase Authentication is currently initialized by the frontend Firebase Web SDK. Firestore rules are maintained in `firebase/firestore.rules`; deploy them from this folder with:

```bash
npx firebase-tools deploy --only firestore:rules --config firebase/firebase.json --project YOUR_FIREBASE_PROJECT_ID
```

Review the rules and project ID before deploying.

## Current implementation boundary

The Express API is connected to the frontend through the Vite `/api` proxy. It currently provides service health and integration information. The existing booking, ambulance fleet, driver and dispatch workflows still use the browser-local store, while Firebase Authentication and user profiles use Firebase. Those workflows have **not** been migrated to persistent server-side storage; doing so safely requires API endpoints, authorization and a database migration.

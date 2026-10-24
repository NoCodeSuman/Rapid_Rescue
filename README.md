# RapidRescue

RapidRescue is a React + TypeScript + Vite frontend, an Express API, and Firebase configuration/rules. The app includes patient, driver, and admin workflows. Some operational workflows still use browser-local demo data; see **Current deployment limits** before using it with real users.

## Project layout

- `frontend/` — React app, map/trip UI, payment UI, Firebase Web SDK integration
- `backend/` — Express API (`/api/health` and `/api/info`), Firebase rules and deployment config
- `.github/workflows/` — GitHub Actions checks and GitHub Pages frontend deployment

## Run locally (Windows PowerShell)

Install dependencies in both folders once:

```powershell
cd frontend
npm ci
Copy-Item .env.example .env.local
```

Fill in `frontend/.env.local` with your Firebase Web app values. Then, in one terminal, run the backend:

```powershell
cd ..\backend
npm ci
npm run dev
```

In a second terminal, run the frontend:

```powershell
cd ..\frontend
npm run dev
```

Open the Vite URL, normally `http://localhost:5173`. Vite proxies `/api` to the backend at port 5000.

## GitHub setup and deployment

### 1. Create a repository

On GitHub, create an empty repository named `RapidRescue` (do not add a README, license, or `.gitignore`, since this project already has those files). Choose **Private** if you do not want the source code public. Copy the repository's HTTPS URL.

### 2. Push this project

The working folder for this project is already a local Git repository. Open PowerShell here and add your new GitHub repository as the remote (replace the URL with the one GitHub gave you):

```powershell
git branch -M main
git remote add origin https://github.com/YOUR_GITHUB_NAME/RapidRescue.git
git push -u origin main
```

The initial project commit is already prepared locally. If you instead copied this folder without its hidden `.git` directory, first run `git init`, `git add .`, review `git status` to ensure `.env.local`, `node_modules`, `dist`, and debug logs are not listed, then create the initial commit with `git commit -m "Initial RapidRescue project"` before adding the remote and pushing.

If Git asks for a password, use GitHub's browser sign-in or a Personal Access Token; GitHub no longer accepts account passwords for HTTPS Git pushes.

### 3. Run checks on GitHub

The `CI` workflow runs on pushes and pull requests. A green run checks frontend types, unit tests, frontend production build, and backend JavaScript syntax.

### 4. Configure Firebase for GitHub Pages

In the GitHub repository, open **Settings → Secrets and variables → Actions → New repository secret** and add the Firebase Web app values from your own Firebase project:

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_APP_ID`
- `VITE_FIREBASE_STORAGE_BUCKET` (if enabled in your Firebase project)
- `VITE_FIREBASE_MESSAGING_SENDER_ID` (if enabled in your Firebase project)

These are browser app configuration values, not Admin SDK credentials. Never add a Firebase service-account JSON file or private key to GitHub or to a `VITE_*` variable.

In Firebase Console, add the published GitHub Pages hostname (for example, `YOUR_GITHUB_NAME.github.io`) under **Authentication → Settings → Authorized domains**. Confirm that Firestore rules are published for the Firebase project you use.

### 5. Turn on GitHub Pages

Open **Settings → Pages**, choose **GitHub Actions** as the build and deployment source, and save. The included `GitHub Pages` workflow builds and deploys `frontend/` whenever you push to `main`. The site will be available at `https://YOUR_GITHUB_NAME.github.io/RapidRescue/` (or the URL shown in the Pages settings). The workflow builds the Vite app for the repository subpath and includes SPA route fallback.

## Local checks

```powershell
cd frontend
npm ci
npm run typecheck
npm test
npm run build
npm run test:rules
```

In another terminal:

```powershell
cd backend
npm ci
npm run check
```

## Current deployment limits

- GitHub Pages hosts the static frontend only. It does not run the Express backend. The Express API currently provides only health and integration-status endpoints; deploy it separately on a Node.js host if you need those endpoints in production, and set `VITE_API_BASE_URL` to that API's HTTPS URL before building.
- Firebase Auth, user profiles, and bookings use Firebase. Other operational records and workflows have remaining local/demo storage, so data may not be shared across browsers or devices. Review the migration notes in `backend/README.md` and `backend/docs/` before production use.
- This is a prototype and does not dispatch a real ambulance or contact emergency services.

## Firestore rules

Rules and Firebase CLI config are in `backend/firebase/`. Review `backend/firebase/firestore.rules` and deploy to your own Firebase project only after signing in with an account authorized to deploy rules:

```powershell
cd backend
npx firebase-tools deploy --only firestore:rules --config firebase/firebase.json --project YOUR_FIREBASE_PROJECT_ID
```

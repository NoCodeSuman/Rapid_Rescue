# Firestore shared operational data

The frontend uses the Firebase Web SDK and the rules in `firebase/firestore.rules` for operational collections. Booking records remain in `bookings` and are managed by `firestoreBookings.ts`; the additional persistence layer handles the user directory, patient profiles, driver roster, ambulance inventory, zones, notifications, activity log, and application settings.

## Admin provisioning
The registration form must never create admins. After creating and verifying the admin account through Firebase Authentication, provision `users/{uid}` through a trusted admin process with fields matching the profile schema and `role: "admin"`, `accountStatus: "active"`. Do not expose service-account credentials in the browser.

## First-login data bootstrap
On the first admin session, local state is copied into Firestore collections only when each collection is empty. Existing non-empty collections are not overwritten. Inspect and reconcile demo/seed records before using this for production data.

## Deployment
Publish `firestore.rules` from the Firebase Console or deploy with Firebase CLI from the `backend/firebase` folder. Test rules with separate patient, driver, and admin accounts before production. For high-trust workflows, move admin operations to the Node.js API with Firebase Admin SDK and server-side authorization.

# Driver → Admin visibility fix

Deploy the updated rules first: `backend/firebase/firestore.rules` (Firebase Console → Firestore → Rules → Publish, or `firebase deploy --only firestore:rules`).

Root cause: a driver's name/phone/role were only saved in the driver's own browser (localStorage) and in `users/{uid}`.
The admin console read only `appUsers`/`drivers`, which a driver cannot write, so nobody appeared.

Changes: see the summary in chat. Key files:
- src/domain/adminSync.ts (new)         joins `users/{uid}` + shared records for the admin view
- src/services/firestoreAppData.ts      admin subscription (users, bookings, fleet), driver/patient self-publish, driver receives assignments
- src/services/index.ts                 admin actions carry the driver's Firebase uid; rollback on refused writes; safe reset
- backend/firebase/firestore.rules      admin can deactivate/edit profiles; driver can decline assigned requests; ambulance writes limited to its driver

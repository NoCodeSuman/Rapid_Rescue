# Firestore data schema (Phase 3)

Implemented collections currently include `users` and `bookings`. Driver, ambulance, admin-wide data, notifications, and settings still require a complete shared-storage migration before the entire app can be described as Firebase-backed.

## Architecture: identity vs profile
| Concern | Where it lives |
|---|---|
| UID, email, password credential, email-verification state, sessions | **Firebase Authentication** |
| Application profile (display name, phone, role, account status) | **Firestore `users/{uid}`** |
| Bookings | Firestore `bookings/{bookingId}` for signed-in patient requests and driver lifecycle updates; the local store remains a UI cache |
| Ambulances, dispatch, patient address / emergency contact, admin-managed user list | Browser localStorage demo data pending migration |

The Firestore document ID **is** the Firebase Auth UID. Never stored in Firestore: passwords, hashes, tokens, reset/verification codes, email (Auth already owns it), medical data, driver-licence data.

## `users/{uid}` — implemented
| Field | Type | Created as | Client may update? | Constraints (enforced by `firestore.rules`) |
|---|---|---|---|---|
| `uid` | string | Auth UID | **No** (immutable) | equals document ID and `request.auth.uid` |
| `displayName` | string | from registration / Auth / safe default | **Yes** | 2–60 characters |
| `phoneNumber` | string | from registration, or `""` | **Yes** | `""` (not provided) **or** 7–19 chars matching `^\+?[0-9][0-9 ()-]{6,17}$` |
| `role` | string | `patient` or `driver` | **No** (immutable) | create allow-list `patient`/`driver`; `admin` can never be written by a client |
| `accountStatus` | string | `active` | **No** (immutable) | must be `active` on create; set to `inactive` only by a privileged write |
| `createdAt` | timestamp | server time | **No** (immutable) | must equal `request.time` on create |
| `updatedAt` | timestamp | server time | set on every write | must equal `request.time` |
| `schemaVersion` | int | `1` | **No** (immutable) | must equal `1` on create |

Example (fictional):
```json
{ "uid": "k3JxExampleUid", "displayName": "Asha Verma", "phoneNumber": "+91 98000 10001",
  "role": "patient", "accountStatus": "active", "createdAt": "<server timestamp>", "updatedAt": "<server timestamp>", "schemaVersion": 1 }
```
No other keys are accepted (mass-assignment protection). A client can change only `displayName`, `phoneNumber` and `updatedAt`.

**Note on `phoneNumber`:** an empty string is allowed so a safe default profile can be auto-created for existing accounts that have no phone on record. (The Phase 3 proposal described the phone as required; allowing `""` is the one deliberate deviation, needed for the approved auto-create-default behaviour.)

### Who sets `role`?
- At registration the user **self-declares** `patient` or `driver`. `driver` is only a routing label: no rule or data path grants anything because of it.
- `admin` can only be written by a **privileged path** (you, in the Firebase Console, or a future Admin SDK process). See `FIRESTORE_SECURITY_RULES.md` → Trusted admin.
- Because the client can never change `role`, the app trusts the Firestore value for routing (not localStorage).

### Missing profile behaviour
A verified user with no document (for example every account created in Phase 2) gets a default profile created on first sign-in: `role: "patient"`, name from the registration intent / local record / Auth display name / email prefix, phone `""`. It never creates `driver` or `admin` by itself. A Phase 2 driver can be corrected by editing `role` in the Console.

### Schema versioning
`schemaVersion` is `1`. To evolve: add the new field, bump the version, make the rules accept both versions during migration, back-fill with a privileged script, then tighten the rules.

## `bookings/{bookingId}` — implemented partial workflow
Bookings are saved to Firestore and subscribed in real time for the authenticated patient's own records and verified driver's open/assigned requests. Documents include `patientFirebaseUid`, optional `driverFirebaseUid`, booking details, `status`, `history`, and timestamps. Driver status transitions follow `requested → accepted → on_the_way → arrived → in_progress → completed`; the patient-facing timeline uses these six milestones. This is still a prototype: ambulance/driver inventory, admin-wide queries, and notifications are not fully migrated, and this is not connected to a real emergency dispatch service.

## Indexes
None. The app reads a single document by ID (no queries), so `firestore.indexes.json` is intentionally absent.

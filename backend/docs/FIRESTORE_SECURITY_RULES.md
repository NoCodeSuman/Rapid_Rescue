# Firestore Security Rules (Phase 3)

File: `firestore.rules`. **Important:** these rules have been written and *statically reviewed* but, in the environment where they were authored, the Firestore emulator could not be downloaded, so they have **not been executed or compiled by Firebase tooling**. Run `npm run test:rules` on your machine before deploying (see `PHASE3_SETUP.md`). A passing frontend build does not prove the rules are correct.

## Behaviour
| Path / action | Rule |
|---|---|
| Everything not matched (including future collections, `users/{uid}/…` sub-paths) | **Denied** (`match /{document=**}` → `if false`) |
| `users/{uid}` **get** | Owner only (`request.auth.uid == uid`) **and** `email_verified == true` |
| `users/{uid}` **list** | Denied for everyone (no enumeration) |
| `users/{uid}` **create** | Owner only; exact key set; `uid` == doc ID == auth UID; `role` ∈ {patient, driver}; `accountStatus == 'active'`; `createdAt`/`updatedAt == request.time`; `schemaVersion == 1`; name/phone validated. **Allowed before email verification** (create-only; reads/updates still require verification) so registration choices are not lost. |
| `users/{uid}` **update** | Owner, verified, account `active`; only `displayName`, `phoneNumber`, `updatedAt` may change; values validated; `updatedAt == request.time` |
| `users/{uid}` **delete** | Denied for everyone |

## Permission matrix (`users/{uid}`)
| Actor | get own | list | create own | update own | delete | other users' docs |
|---|---|---|---|---|---|---|
| Visitor | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Signed in, unverified | ✗ | ✗ | ✓ (create-only) | ✗ | ✗ | ✗ |
| Verified patient / driver | ✓ | ✗ | ✓ if missing | ✓ name/phone only | ✗ | ✗ |
| Admin (role set via Console) | ✓ own | ✗ | as owner | name/phone only | ✗ | **✗** — no admin privileges in Phase 3 |
| Deactivated (`accountStatus: inactive`) | ✓ own (so the app can detect it) | ✗ | ✗ | ✗ | ✗ | ✗ |

## Trusted admin strategy and limits
A rule cannot trust a role the user could write. Here, **no client write path can ever put `admin` into a document**: create is limited to `patient`/`driver`, and `role` is immutable thereafter. The only way to make someone admin is a **privileged write** that bypasses rules (you editing the document in the Firebase Console, or a future Admin SDK process).
- In Phase 3 the app trusts that Firestore role **for UI routing only** (admin screens still operate on local demo data).
- **No rule grants admin anything extra** (least privilege): there is no admin UI backed by Firestore yet.
- Recommended future mechanism for real admin authority over data: **custom claims set by a trusted Admin SDK environment** (out of scope here). Email verification is **not** a role, and an email address/domain is never treated as proof of admin status.
- Anyone with Console access to the project is a trust anchor.

## Threat model summary
| Threat | Mitigation |
|---|---|
| Self-promotion to admin | create allow-list, immutable `role`, no admin paths |
| Cross-user read/write | `get` only on own doc; no `list`; ownership checks |
| Unverified abuse | reads/updates need `email_verified`; unverified may only create their own bounded document |
| Mass assignment / unexpected fields | `keys().hasOnly/hasAll` on create; `affectedKeys().hasOnly` on update |
| Immutable-field tampering | only three keys can change |
| Delete and recreate | deletes denied; `set` on an existing doc is an update and is rejected for trusted fields |
| localStorage role spoofing | routing role comes from the Firestore profile; local edits are ignored (browser-tested via the stand-in layer) |
| Wildcard overlap / future collections | only specific matches plus a final deny |
| Profile enumeration | no `list`; document ID is the UID |
| Forged `driver` | possible by design; grants nothing |
| Stale `email_verified` claim | client force-refreshes the ID token after verification and once on permission-denied |

## Known limitations
- Rules not executed by Firebase tooling in the authoring environment (see top).
- An unverified user can create a bounded profile document for their own UID (decision D4).
- `driver` is self-declared and unprivileged; real driver authority needs a trusted mechanism.
- A user who deliberately registers as `driver` stays `driver` (cannot self-change); fix via Console.
- Client-side route guards are a UX layer, not authorization. This phase does not make the future platform production-secure by itself.

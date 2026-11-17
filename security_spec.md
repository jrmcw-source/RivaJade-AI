# Firestore Security Specification (Phase 0 TDD)

## 1. Data Invariants
1. Every document in `tasks`, `documents`, and `voiceMemories` must belong to an authenticated, email-verified user (`request.auth.uid == data.userId`).
2. `userId`, `createdAt` are immutable once created; `updatedAt` must equal `request.time`.
3. `users/{userId}/private/info` isolates PII (`email`) and cannot be read or listed by any other user.
4. No document may accept unvalidated shadow fields (`data.keys().hasOnly(...)` on create, `affectedKeys().hasOnly(...)` on update).
5. All string fields enforce strict `.size()` bounds; all arrays enforce `.size() <= MAX` and first-element type validation.
6. Document IDs in single-doc operations must match `^[a-zA-Z0-9_\-]+$` and `<= 128` chars.
7. List queries on `tasks`, `documents`, and `voiceMemories` enforce `resource.data.userId == request.auth.uid` directly in rules without relying on client filtering.
8. Completed tasks cannot be mutated except via explicit reopen or deletion by the owner; terminal state locking prevents silent tampering of completed records without matching the `reopen` action.

## 2. Dirty Dozen Adversarial Payloads (Expected: PERMISSION_DENIED)
1. **Unauthenticated read/write** on `/tasks/t1` (`request.auth == null`).
2. **Unverified email write** (`request.auth.token.email_verified == false`) on `/tasks/t1`.
3. **Identity spoofing create** on `/tasks/t2` with `userId: "victim_uid"` while signed in as `"attacker_uid"`.
4. **Shadow field injection** on `/tasks/t3` including `"isAdmin": true` or `"ghostField": 123`.
5. **Cross-user list scraping** on `/documents` without `where("userId", "==", request.auth.uid)`.
6. **Cross-user PII get** on `/users/victim_uid/private/info` as `"attacker_uid"`.
7. **Timestamp forgery** on `/tasks/t4` with `createdAt` set to a past client timestamp instead of `request.time`.
8. **ID poisoning** creating `/tasks/bad..id..with..1500..chars` (`!isValidId`).
9. **Oversized OCR text DoS** on `/documents/d1` with `ocrText.size() > 100000`.
10. **Unbounded array injection** on `/documents/d2` with `tags` array containing 50 items (`> 20`).
11. **Owner transfer update** on `/tasks/t1` attempting to mutate `userId` to another UID.
12. **Terminal state silent mutation** on a `completed` task trying to alter `title` or `dueDate` while remaining `completed` (must only allow reopening to `pending` or explicit owner-controlled valid status transitions).

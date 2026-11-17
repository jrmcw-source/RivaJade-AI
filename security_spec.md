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

## 3. Household Sharing Invariants (added 2026-11-17)

9. A record in `tasks`, `documents`, `propertyEntries`, or `financeEntries` is either private (`householdId == ''`, `memberIds == [owner]`) or household-stamped. A household stamp is valid only when `memberIds` exactly equals the household's own `memberIds` and the writer is a household member (Master Gate: `households/{id}/members/{uid}` exists).
10. Household members may read and update household records; `userId` and `householdId` are immutable after creation. Deletion is reserved to the record owner or the household owner.
11. The only update that may change `memberIds` replaces it with the household's current `memberIds` (membership sync) and touches nothing else.
12. Joining a household requires the joiner's verified email to appear in the household's `invitedEmails`; the join adds exactly one member and must write the joiner's member record in the same batch.
13. A scanned document is born `verificationStatus == 'provisional'`. It may become `verified` only with a non-empty `verifiedAtIso`; the verifying member's name is recorded in `verifiedByName`. `paperLocation` records where the physical paper lives.
14. A household's `calendarToken` is a bearer secret for a read-only subscription feed of that household's open tasks. Only the household owner may set or regenerate it (regenerating invalidates every previously shared link); it is never part of a record stamp and confers no write access of any kind.
15. A scanned document's `driveFileId` points at the document photo's permanent home in the owner's Google Drive ("Steward Document Photos"). It is a pointer only: the Firestore record stays the source of truth, and a missing server-side photo can be restored from the Drive copy it names.
16. Every record may carry a `place` tag from the family's place tree (Mom is the trunk; Riva Jade branches to the homestead, its rental cabin, and the wildlife conservancy; Louisiana holds Oakleaf and Elephant Walk). The tag is a bounded string, empty when a record belongs to the desk generally; filtering by a branch includes everything under it. A finance entry's `careForJason` flag marks money spent taking care of Jason — a tracking flag only, with no effect on access.
17. Finance records older than their branch's longest agency limit (Riva Jade and the Conservancy 5 years, the Rental Cabin 4, the Homestead and the Louisiana places 3 — the current tax year plus the years before it up to that count) are archive: computed from `entryDate` and `place`, never a stored flag, and never a deletion. Archived entries leave ordinary totals, lists, AI context, and family exports unless the user deliberately includes the archive; backups keep everything. Any output addressed to an agency carries only that agency's own limit for the branch, per the agency table in `src/types.ts` — never the branch's longest, never another agency's. The most recent 3 years of any branch are the access floor: provided to a user asking, with no who's-asking question; that question applies only to outputs reaching beyond 3 years. A finance record 7 years old to the day or older is deep-archived automatically — computed from `entryDate` against today's date — and leaves the ledger, totals, exports, and AI context entirely, include-archive toggle notwithstanding; it remains in the data and in backups for deliberate family retrieval.

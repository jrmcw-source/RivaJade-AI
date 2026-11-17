# Steward — RivaJade Family Desk

A shared family desk: schedule and reminders, a camera-scanned document vault,
Wimberley property logs, and money records — one household, every member on
their own phone or computer.

## The household

- One person creates the household (Settings → Family Household) and invites
  family members by email.
- When an invited person signs in with that email, the invitation is waiting
  in their Settings and they can join.
- A person can belong to more than one household — say, the family desk and
  their own home's desk — and switch between them in Settings or the sidebar.
  Each household is private from the others: only its own members can see its
  records. Creating or joining a household lands you on it.
- Tasks, documents, property entries, and money records made while sharing is
  on are stamped with the household's member list: every member sees them,
  files them, and keeps them current. Voice memories stay private to the
  speaker.
- A "Share new records" switch in Settings keeps a new record private instead.
- When someone joins, existing household records pick up the new member
  automatically.

## Documents: checked against the paper

A scanned document starts out **provisional** — its words came from a
photograph and have not been trusted yet. In the document's detail view:

- **Where the paper lives** records which box or folder holds the original.
- **"I checked it against the paper"** stamps who compared the scan to the
  physical document, and when. Only then is the record marked checked.
- Editing the OCR text of a checked document returns it to unchecked — the
  words changed after the check.

## Backups

Settings / Drive Backup saves snapshots to a "Steward Backups" folder in the
signed-in user's Google Drive (the app only ever touches files it created):

- Full workspace snapshot (.json) — every record, ready to restore.
- Finances ledger (.csv), Wimberley report (.md), OCR vault archive (.md).
- **Document Photos** — copies the scanned page photos themselves into
  "Steward Backups / Document Photos", so the pictures live in Drive too.

## Calendar file

Schedule → **Calendar File** downloads a standard .ics file of open tasks and
appointments. Import it into Apple Calendar, Google Calendar, or Outlook to
see the desk's dates in the calendar you already use.

## Running it

- `npm run dev` / `bun run dev` — local dev server (Express + Vite).
- `npm run build` — production build; `npm run lint` — typecheck.
- Firebase project config lives in `firebase-applet-config.json`; the Gemini
  API key is supplied at runtime (`GEMINI_API_KEY`).

## Data & safety shape

- `firebase-blueprint.json` describes every record; `firestore.rules` (kept
  identical to `DRAFT_firestore.rules`) enforces it — per-record validation,
  no shadow fields, household access only through the members gate.
- `security_spec.md` lists the invariants; `firestore.rules.test.ts` is the
  adversarial payload catalog those rules must deny.
- Scanned page photos are stored by the app server under `/api/uploads/`
  (see `server.ts`). The Drive photo backup above is the second copy.

## Known next steps (deployment stage)

- A live calendar subscription feed (needs server-side Firestore credentials).
- A permanent home for page photos (Firebase Storage or Drive) in place of
  the app server's disk, and restoring photos from a Drive backup.

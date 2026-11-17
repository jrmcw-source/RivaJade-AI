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
- Each household can have a **calendar subscription link** (Settings → Family
  Household, created by the owner): calendar apps subscribe to it and keep
  the household's open tasks and appointments up to date on their own. The
  owner can replace the link at any time, which invalidates the old one.
- Tasks, documents, property entries, and money records made while sharing is
  on are stamped with the household's member list: every member sees them,
  files them, and keeps them current. Voice memories stay private to the
  speaker.
- A "Share new records" switch in Settings keeps a new record private instead.
- When someone joins, existing household records pick up the new member
  automatically.

## Places — the tree

The desk is Mom's — she is the trunk. Two main branches:

- **Texas** — **Riva Jade**, one property (5151 Wayside Dr, Wimberley),
  21.6 acres: the **Homestead** is 1 acre — the main house (Mom's official
  residence), the barn, the big shop, a little shop, a storage shed, and
  the **Rental Cabin**, which sits inside the homestead acre. The other
  20.6 acres are the **Wildlife Conservancy**: riverfront, windmills, bird
  houses and bat houses, and acreage left natural under its wildlife
  exemption. Its expenses are the exemption's own work — maintaining the
  land natively, supplemental water for wildlife, sanctuaries for birds,
  ducks, and bats, removing invasive species, supporting native species.
  Each place keeps its own expenses, upkeep, and tax treatment: the
  conservancy, the homestead, and the rental cabin each answer to their
  own Texas rules, and the Louisiana places to Louisiana's.
- **Louisiana** — **Oakleaf**, the Lafayette house (Jason's place, Mom's in
  reserve), and **Elephant Walk**, Derek and Dawn's place in Carencro,
  where Mom helps with some bills.

Every task, document, finance entry, and property entry can be marked with
its place, or left general. Pick a branch in the sidebar or in Settings and
every list shows just what's under it — Riva Jade shows the whole property,
the Homestead shows the homestead and the cabin under it. **All places** is
the master copy of everything. Money entries can also be flagged **For
Jason's care** — the expenses of looking after Jason at Oakleaf, kept
tracked apart.

## Retention — the legal minimum stays active, everything is kept

The desk's standing law: never offer more information than what is
legally obligated, wherever a record resides and whatever it is used
for. The family keeps everything, forever — but the active working
period for a finance record is the legal minimum for its branch:
Louisiana places, general records, and the Homestead run 3 years; the
Rental Cabin 4 (Texas Comptroller); the Wildlife Conservancy 5 (Hays
appraisal district's reach for wildlife reports). Older entries are the
archive: out of the totals, lists, assistant answers, and CSV exports
unless someone deliberately includes the archive from the ledger's
archive bar, and never deleted. Backups keep every year. For anything
prepared for an outside party, the assistant includes only the years
and records that party can properly ask about; a request reaching
further, or asking the family to sign away a deadline, gets flagged for
the family to decide. Deeds, titles, and purchase records stay active
as long as the family owns the property.

Disclosure limits are per agency, not per property: the same branch
owes the IRS 3 years, a Texas state agency 4, and the Hays appraisal
district 5. The full table — which agencies each branch may deal with,
and each one's minimal limit — lives in `src/types.ts` (`AGENCY_TABLE`),
is shown in the Finances view under "who can ask for records, and how
far back," and is carried in the assistant's brief. The CSV export has
an "Export for" choice: pick an agency and the file carries only that
agency's years for the branches under its authority; the family copy
carries the working set. Elephant Walk (Carencro) sits in Lafayette
Parish, the same parish as Oakleaf, so the Louisiana branches share one
agency table. The most recent 3 years of any branch are the access
floor — the smallest limit in the table — and are available to a user
asking with no who's-asking question; that question applies only when
an output would reach beyond 3 years. And at 7 years old to the day, a
finance record drops into the deep archive automatically: out of the
ledger, totals, exports, and the assistant's context entirely, though
still kept in the data and the backups for the family to retrieve.

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
- **Document Photos** — when a document is saved, its scanned photo is copied
  to a "Steward Document Photos" folder in Drive and linked to the record.
  That folder is the photos' permanent home: if the app server's copy is
  ever lost, the vault shows the Drive copy instead, and **Restore Photos
  from Drive** (in this same screen) writes any missing photos back to the
  server. The backup screen's Document Photos action brings older documents'
  photos home and links them the same way.

## Calendar file — and the live feed

Schedule → **Calendar File** downloads a standard .ics file of open tasks and
appointments. Import it into Apple Calendar, Google Calendar, or Outlook to
see the desk's dates in the calendar you already use.

For dates that keep themselves current, use the household's **subscription
link** instead (Settings → Family Household): the server answers
`/api/calendar/<householdId>/<token>` with a live .ics feed of that
household's open tasks, and calendar apps poll it on their own schedule.

**Turning the feed on:** the feed reads Firestore from the server, so the
server needs credentials. On Google Cloud Run that is usually the runtime's
own service account and it simply works. If the feed answers "not
configured," create a service-account key in the Firebase console (Project
settings → Service accounts → Generate new private key) and set it as the
`FIREBASE_SERVICE_ACCOUNT_JSON` environment variable where the app runs,
then restart the app.

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
  (see `server.ts`), with their permanent home in Drive as described above.

## Known next steps

- None outstanding from the original list: household sharing, document
  checking against the paper, the Drive photo home with restore, and the
  live calendar feed are all built. The feed's one operational step —
  server credentials — is covered under "Turning the feed on" above.

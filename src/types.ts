export const CATEGORIES = [
  'Tax & Finance',
  'Car Maintenance',
  'Household',
  'Church & Faith',
  'Community Service',
  'Social Events',
  'Hobbies',
  'Health & Medical',
  'Wimberley Property',
  'General',
] as const;

export type Category = (typeof CATEGORIES)[number];

// The family's places, as a tree. The trunk is Mom — officially Texas —
// and everything on the desk is hers. Two main branches: Texas and
// Louisiana. Texas holds Riva Jade: the homestead (with its own branch,
// the rental cabin) and the wildlife conservancy. Louisiana holds
// Oakleaf — the Lafayette house, Jason's place, with Mom in reserve —
// and Elephant Walk, Derek and Dawn's place in Carencro. A record's
// `place` is one of these names, or '' when it belongs to the desk
// generally.
export const PLACES = [
  'Riva Jade',
  'Riva Jade — Homestead',
  'Riva Jade — Rental Cabin',
  'Riva Jade — Wildlife Conservancy',
  'Oakleaf',
  'Elephant Walk',
] as const;
export type PlaceName = (typeof PLACES)[number];

// Extra values the place filter accepts that are not record tags:
// 'Louisiana' gathers both Louisiana branches; '' shows everything.
export const PLACE_FILTERS: Array<{ value: string; label: string }> = [
  { value: '', label: "All places — Mom's whole desk" },
  { value: 'Texas', label: 'Texas (all of Riva Jade)' },
  { value: 'Riva Jade', label: 'Riva Jade (the whole property)' },
  { value: 'Riva Jade — Homestead', label: 'Riva Jade — Homestead (incl. the cabin)' },
  { value: 'Riva Jade — Rental Cabin', label: 'Riva Jade — Rental Cabin' },
  { value: 'Riva Jade — Wildlife Conservancy', label: 'Riva Jade — Wildlife Conservancy' },
  { value: 'Louisiana', label: 'Louisiana (Oakleaf + Elephant Walk)' },
  { value: 'Oakleaf', label: 'Oakleaf' },
  { value: 'Elephant Walk', label: 'Elephant Walk' },
];

const PLACE_CHILDREN: Record<string, readonly string[]> = {
  Texas: [
    'Riva Jade',
    'Riva Jade — Homestead',
    'Riva Jade — Rental Cabin',
    'Riva Jade — Wildlife Conservancy',
  ],
  'Riva Jade': [
    'Riva Jade — Homestead',
    'Riva Jade — Rental Cabin',
    'Riva Jade — Wildlife Conservancy',
  ],
  'Riva Jade — Homestead': ['Riva Jade — Rental Cabin'],
  Louisiana: ['Oakleaf', 'Elephant Walk'],
};

// Does a record tagged `recordPlace` belong under the `filter` branch?
// A branch includes everything that grows under it.
export function placeMatches(recordPlace: string, filter: string): boolean {
  if (!filter) return true;
  if (recordPlace === filter) return true;
  return (PLACE_CHILDREN[filter] || []).includes(recordPlace);
}

// The law stack over each place (Jason, 2026-11-21): every household,
// by its physical legal address, answers upward — city if it sits in
// one, then county or regional regulation, then state, then federal.
// The model is country-general on purpose: Dan owns two properties
// outright in the Philippines and may join, and the desk is built to
// be sellable world-wide if it is built right. A sub-branch inherits
// its parent place's stack.
export interface JurisdictionStack {
  city: string | null; // null = outside any city's limits
  county: string; // county, parish, or the regional equivalent
  state: string; // state or province
  country: string; // the top of the stack
  note?: string;
}

export const PLACE_JURISDICTIONS: Record<string, JurisdictionStack> = {
  'Riva Jade': {
    city: null,
    county: 'Hays County',
    state: 'Texas',
    country: 'United States',
    note: 'The whole property, every sublevel included, rides completely outside Wimberley city limits.',
  },
  Oakleaf: {
    city: 'Lafayette',
    county: 'Lafayette Parish',
    state: 'Louisiana',
    country: 'United States',
  },
  'Elephant Walk': {
    city: 'Carencro',
    county: 'Lafayette Parish',
    state: 'Louisiana',
    country: 'United States',
    note: 'Carencro as Jason places it — the legal lines govern if they say otherwise.',
  },
};

// The head of a family as an account: the counted person whose
// name the headship resolves to, when that person holds an
// account; otherwise the family's owner (the family doc's creator
// is the standing fallback until the roster names the head's
// account). Used for gating head-only controls in the client; the
// rules carry the membership checks.
export function familyHeadUid(family: Family): string | null {
  const name = familyHeadName(family);
  const person = (family.people || []).find((p) => p.name === name && p.userId);
  return person?.userId || family.ownerId || null;
}

export function jurisdictionFor(place: string): JurisdictionStack | null {
  if (PLACE_JURISDICTIONS[place]) return PLACE_JURISDICTIONS[place];
  for (const parent of Object.keys(PLACE_JURISDICTIONS)) {
    if (place.startsWith(`${parent} — `)) return PLACE_JURISDICTIONS[parent];
  }
  if (place === 'Homestead' || place === 'Rental Cabin' || place === 'Wildlife Conservancy') {
    return PLACE_JURISDICTIONS['Riva Jade'];
  }
  return null;
}

export function jurisdictionLine(place: string): string {
  const j = jurisdictionFor(place);
  if (!j) return '';
  return `${j.city ? j.city : 'Outside city limits'} · ${j.county} · ${j.state} · ${j.country}`;
}

// The family's retention rule (Jason, 2026-11-17): everything is kept
// forever, but the ACTIVE working period for a finance record is the
// legal minimum its branch answers to — the standard reach of the
// authorities over that record, and nothing beyond it. Older entries
// are the archive: kept, never deleted for age, but outside ordinary
// totals, answers, and exports unless someone asks for the archive.
export function getFinanceActiveYears(place: string): number {
  // The desk's working set per branch = the LONGEST agency limit in that
  // branch's table below, so nothing any agency can still reach is ever
  // out of view. The cut to one agency's limit happens at output time.
  switch (place) {
    case 'Riva Jade':
    case 'Riva Jade — Wildlife Conservancy':
      return 5; // Hays appraisal district may request 5 years of wildlife reports
    case 'Riva Jade — Rental Cabin':
      return 4; // Texas Comptroller taxes, incl. hotel occupancy, run 4 years
    default:
      return 3; // federal and Louisiana standard reach is 3 years
  }
}

export interface AgencyLimit {
  agency: string;
  years: number | null; // null = no records window (property papers rule instead)
  note: string;
}

// Which agencies each branch may have to be dealt with, and each agency's
// minimal limit — its standard reach over that branch's records (Jason,
// 2026-11-17). An output prepared for an agency carries only that
// agency's years, for the branch it concerns.
export const AGENCY_TABLE: { place: string; agencies: AgencyLimit[] }[] = [
  {
    place: 'Riva Jade',
    agencies: [
      { agency: 'IRS (federal)', years: 3, note: 'Income tax, standard reach from filing' },
      { agency: 'Texas Comptroller (state)', years: 4, note: 'State taxes: assessment and records window' },
      { agency: 'Hays County Appraisal District', years: 5, note: 'May request up to 5 years of wildlife management reports' },
    ],
  },
  {
    place: 'Riva Jade — Homestead',
    agencies: [
      { agency: 'IRS (federal)', years: 3, note: 'Income tax, standard reach from filing' },
      { agency: 'Hays County Appraisal District', years: null, note: 'Appraisal and exemptions — property papers, kept while owned' },
    ],
  },
  {
    place: 'Riva Jade — Rental Cabin',
    agencies: [
      { agency: 'IRS (federal)', years: 3, note: 'Rental income, standard reach from filing' },
      { agency: 'Texas Comptroller (state)', years: 4, note: 'Hotel occupancy and state taxes' },
      { agency: 'Hays County Appraisal District', years: null, note: 'Appraisal — property papers, kept while owned' },
    ],
  },
  {
    place: 'Riva Jade — Wildlife Conservancy',
    agencies: [
      { agency: 'IRS (federal)', years: 3, note: 'Income tax, standard reach from filing' },
      { agency: 'Texas Comptroller (state)', years: 4, note: 'State taxes generally' },
      { agency: 'Hays County Appraisal District', years: 5, note: 'Wildlife management reports, up to 5 years back' },
    ],
  },
  {
    place: 'Oakleaf',
    agencies: [
      { agency: 'IRS (federal)', years: 3, note: 'Income tax, standard reach from filing' },
      { agency: 'Louisiana Dept. of Revenue (state)', years: 3, note: 'Prescription: 3 years from the end of the tax year' },
      { agency: 'Lafayette Parish / City — LCG (local)', years: 3, note: 'Local sales tax prescription, 3 years' },
    ],
  },
  {
    place: 'Elephant Walk',
    agencies: [
      { agency: 'IRS (federal)', years: 3, note: 'Income tax, standard reach from filing' },
      { agency: 'Louisiana Dept. of Revenue (state)', years: 3, note: 'Prescription: 3 years from the end of the tax year' },
      { agency: 'Lafayette Parish / City — LCG (local)', years: 3, note: 'Carencro is in Lafayette Parish — same local limit as Oakleaf' },
    ],
  },
];

export const AGENCY_NAMES: string[] = [
  'IRS (federal)',
  'Texas Comptroller (state)',
  'Hays County Appraisal District',
  'Louisiana Dept. of Revenue (state)',
  'Lafayette Parish / City — LCG (local)',
];

// The years an agency may reach for one place's records, or null when the
// agency has no claim on that branch (or no records window at all).
export function agencyLimitFor(agency: string, place: string): number | null {
  const group = AGENCY_TABLE.find((g) => g.place === place);
  if (group) {
    const hit = group.agencies.find((a) => a.agency === agency);
    return hit ? hit.years : null;
  }
  // General records: only the federal window is established.
  return agency === 'IRS (federal)' ? 3 : null;
}

export function isArchivedFinanceEntry(
  entry: { entryDate: string; place?: string },
  todayIso: string
): boolean {
  const years = getFinanceActiveYears(entry.place || '');
  const cutoffYear = Number(todayIso.slice(0, 4)) - (years - 1);
  return entry.entryDate < `${cutoffYear}-01-01`;
}

// The deep archive (Jason, 2026-11-17): a finance record 7 years old to
// the day, or older, is archived automatically — 7 years is the legal
// maximum, the longest any rule in the table reaches. It leaves the
// ledger, totals, exports, and the assistant's context entirely; it is
// still kept (backups hold it) for deliberate family retrieval.
export function isDeepArchivedFinanceEntry(entryDate: string, todayIso: string): boolean {
  const d = new Date(`${todayIso}T12:00:00`);
  d.setFullYear(d.getFullYear() - 7);
  const cutoff = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`;
  return entryDate <= cutoff;
}

export function isPlaceName(value: unknown): value is PlaceName {
  return typeof value === 'string' && (PLACES as readonly string[]).includes(value);
}
// Record kinds (Jason, 2026-11-21): the rigid list. A record is
// Financial, Medical, a Calendar Event, Personal, Customizable,
// or Official
// — the family's own kind, named in customKindLabel. Two kinds are
// rigid by nature: money records are Financial and tasks are
// Calendar Events. Papers and property records carry the filing
// choice, and Personal is the default. The topic categories above
// keep doing the fine sorting underneath (a doctor's visit is a
// Calendar Event whose topic is Health & Medical).
export type RecordKind = 'financial' | 'medical' | 'calendar' | 'personal' | 'custom' | 'official';

export const RECORD_KIND_LABELS: Record<RecordKind, string> = {
  financial: 'Financial',
  medical: 'Medical',
  calendar: 'Calendar Event',
  personal: 'Personal',
  custom: 'Customizable',
  official: 'Official',
};

// The kind a stored record carries, by where it lives: the rigid
// kinds by collection, the filed kinds by the record's own tag.
export function effectiveRecordKind(
  coll: 'tasks' | 'documents' | 'finances' | 'property' | 'notes',
  rec: { recordKind?: RecordKind }
): RecordKind {
  if (coll === 'tasks') return 'calendar';
  if (coll === 'finances') return 'financial';
  return rec.recordKind || 'personal';
}

// Which kinds are sealed — encrypted on the device before storage
// (Jason, 2026-11-21): Official is sealed from the start; every other
// kind can be switched on or off in Settings. The profile keeps the
// owner's list; absent a list, Official alone is sealed. Filing a
// record of a sealed kind requires the vault to be unlocked, and the
// record carries encrypted: true with its text fields as sealed
// envelopes (see services/vault.ts).
export function effectiveSealedKinds(profile: { sealedKinds?: RecordKind[] } | null | undefined): RecordKind[] {
  return profile?.sealedKinds ?? ['official'];
}

export type TaskType = 'task' | 'appointment';
export type TaskPriority = 'low' | 'medium' | 'high';
export type TaskStatus = 'pending' | 'completed';
export type TaskCompletionState = 'finished' | 'more';
export type FocusWindow = 'morning' | 'afternoon' | 'evening' | 'balanced';

export interface UserProfile {
  userId: string;
  displayName: string;
  username: string;
  photoURL: string;
  defaultReminderMinutes: number;
  notificationsEnabled: boolean;
  preferredFocusWindow: FocusWindow;
  prefersQuickWinsFirst: boolean;
  behaviorSignals: string[];
  // Front door (Jason, 2026-11-20): how the desk addresses this user out
  // loud and in text (for Mom: "Ms. Gini"), and whether the desk's spoken
  // voice is muted for her. Both optional — older profiles simply lack
  // them, and the door falls back to the display name and an unmuted
  // voice. Mute persists on the profile so it holds across opens and
  // devices (the church case: set it once, it stays set).
  addressName?: string;
  voiceMuted?: boolean;
  // Email in the morning briefing (Jason, 2026-11-20): each user's own
  // switch, on their own account — the desk reads that user's Gmail
  // (read-only) for the briefing only when the switch is on AND the
  // user has connected mail for the session. Default off; it is a
  // tested option, not a core principle, until Jason says otherwise.
  emailEnabled?: boolean;
  // The mail fence (Jason, 2026-11-20): each user also limits WHICH
  // mail the desk may use. Kind switches sort mail the way Gmail does —
  // people who write to you, bills/statements/notices, newsletters and
  // announcements (off unless allowed). Sender lists are plain text,
  // one per line: an "only" list narrows the desk to those senders, a
  // "never" list shuts a sender out entirely and wins over "only".
  // Absent kind fields mean the defaults: people and bills on,
  // newsletters off.
  mailFromPeople?: boolean;
  mailBills?: boolean;
  mailNewsletters?: boolean;
  mailOnlySenders?: string;
  mailNeverSenders?: string;
  // The sealed-records vault (Jason, 2026-11-21): a random salt and a
  // sealed check value for the owner's passphrase. The passphrase and
  // the key are never stored — the key lives in memory only while
  // the vault is unlocked. sealedKinds is the owner's list of record
  // kinds filed sealed; absent, Official alone (effectiveSealedKinds).
  vaultSalt?: string;
  vaultCheck?: string;
  // Recovery (Jason, 2026-11-21): the vault key wrapped under a
  // random recovery key, plus a check value sealed under that key.
  // The recovery key itself lives only in a file in the owner's own
  // Drive; a forgotten passphrase does not lock the depositor out.
  vaultRecoveryWrap?: string;
  vaultRecoveryCheck?: string;
  // Family recovery (Jason, 2026-11-21): an RSA wrap keypair. The
  // public half is public by design; the private half is sealed
  // under the owner's vault key and never leaves the profile in
  // the clear.
  wrapPublicKey?: string;
  wrapPrivateSealed?: string;
  // The assistant's authority (Jason, 2026-11-21): three switches,
  // each the account holder's own. aiAccess absent = the assistant
  // may work; aiConnectors absent = it may use the connected
  // services (mail, Drive) the person turned on; aiWrite absent =
  // it may read and suggest only, never change a record.
  aiAccess?: boolean;
  aiConnectors?: boolean;
  aiWrite?: boolean;
  sealedKinds?: RecordKind[];
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface ScheduleTask {
  id: string;
  userId: string;
  householdId: string;
  memberIds: string[];
  ownerIds?: string[];
  giftLog?: GiftEntry[];
  // Visibility (Jason, 2026-11-20): the tags carry access. scope names
  // the ring (absent = household); circleIds name custom circles whose
  // members join the audience; memberIds is the computed audience
  // snapshot the rules check. The depositor (userId) owns the record
  // always — a household, the family, or a circle only holds it.
  scope?: 'private' | 'household' | 'family' | 'circles';
  familyId?: string;
  circleIds?: string[];
  title: string;
  type: TaskType;
  category: Category;
  place: string;
  dueDate: string; // YYYY-MM-DD
  dueTime: string; // HH:MM or ''
  estimatedMinutes: number;
  reminderMinutes: number;
  status: TaskStatus;
  priority: TaskPriority;
  notes: string;
  helpSteps: string[];
  encrypted?: boolean;
  linkedDocumentId: string;
  completedAtIso: string;
  completionState?: TaskCompletionState;
  remainderNote?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type DocVerificationStatus = 'provisional' | 'verified';

export interface ScannedDocument {
  id: string;
  userId: string;
  householdId: string;
  memberIds: string[];
  ownerIds?: string[];
  giftLog?: GiftEntry[];
  // Visibility (Jason, 2026-11-20): the tags carry access. scope names
  // the ring (absent = household); circleIds name custom circles whose
  // members join the audience; memberIds is the computed audience
  // snapshot the rules check. The depositor (userId) owns the record
  // always — a household, the family, or a circle only holds it.
  scope?: 'private' | 'household' | 'family' | 'circles';
  familyId?: string;
  circleIds?: string[];
  // The record kind (Jason, 2026-11-21): how this paper is filed —
  // Financial, Medical, Personal, or the family's own Custom kind
  // (named in customKindLabel). Absent means Personal.
  recordKind?: RecordKind;
  customKindLabel?: string;
  encrypted?: boolean;
  title: string;
  category: Category;
  place: string;
  ocrText: string;
  summary: string;
  tags: string[];
  keyDetails: string[];
  detectedDate: string;
  imageUrl: string;
  fileName: string;
  notes: string;
  verificationStatus: DocVerificationStatus;
  verifiedByName: string;
  verifiedAtIso: string;
  paperLocation: string;
  // Where the digitized account itself lives (Jason, 2026-11-21):
  // Official and Financial ownership records name the physical
  // location of the account — the bank or office that holds it —
  // alongside where the paper is kept.
  accountLocation?: string;
  driveFileId: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface VoiceMemory {
  id: string;
  userId: string;
  summary: string;
  followUpSteps: string[];
  completedTaskTitles: string[];
  transcriptExcerpt: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

// A note for Jason (Jason's ruling, 2026-11-20): when the desk cannot do
// something the user asked for, it never dead-ends. It apologizes in
// plain words, says it cannot do that right now, and says it has noted
// the request and will talk to Jason about fixing it — and the request
// lands here, in the household's shared records, where Jason sees it.
// `handled` is Jason's own check-off once he has dealt with one.
export interface JasonNote {
  id: string;
  userId: string;
  householdId: string;
  memberIds: string[];
  ownerIds?: string[];
  giftLog?: GiftEntry[];
  // Visibility (Jason, 2026-11-20): the tags carry access. scope names
  // the ring (absent = household); circleIds name custom circles whose
  // members join the audience; memberIds is the computed audience
  // snapshot the rules check. The depositor (userId) owns the record
  // always — a household, the family, or a circle only holds it.
  scope?: 'private' | 'household' | 'family' | 'circles';
  familyId?: string;
  circleIds?: string[];
  text: string;
  source: string; // 'front_door' | 'assistant' | 'voice'
  handled: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

// The morning briefing (Jason, 2026-11-20): one briefing per household
// per day, written by the desk model from the day's own records and
// saved, so the whole household reads or hears the same one and the
// paid API tier is only sipped — one model call a day. dateKey is the
// household's local day, YYYY-MM-DD.
export interface MorningBriefing {
  id: string;
  userId: string;
  householdId: string;
  memberIds: string[];
  // Visibility (Jason, 2026-11-20): the tags carry access. scope names
  // the ring (absent = household); circleIds name custom circles whose
  // members join the audience; memberIds is the computed audience
  // snapshot the rules check. The depositor (userId) owns the record
  // always — a household, the family, or a circle only holds it.
  scope?: 'private' | 'household' | 'family' | 'circles';
  familyId?: string;
  circleIds?: string[];
  dateKey: string;
  text: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

// One reader's personal mail add-on to the morning briefing (Jason,
// 2026-11-20). The fence is structural: this doc carries no memberIds
// and its rules are owner-only — nobody else in the household can read
// it, and its contents never enter the shared briefing.
export interface MailBriefing {
  id: string;
  userId: string;
  householdId: string;
  dateKey: string;
  text: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

// One reader's circle add-on (Jason, 2026-11-21): drawn from the
// records that reader's family ring and circles hold, saved where
// only that reader can see it — the same privacy shape as the mail
// add-on, a different well.
export interface CircleBriefing {
  id: string;
  userId: string;
  householdId: string;
  dateKey: string;
  text: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface SharedProject {
  id: string;
  projectId: string;
  name: string;
  description: string;
  category: Category;
  ownerId: string;
  ownerName: string;
  participantIds: string[];
  lastInviteId: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface ProjectMember {
  id: string;
  userId: string;
  projectId: string;
  projectOwnerId: string;
  displayName: string;
  username: string;
  role: 'owner' | 'member';
  participantIds: string[];
}

export interface ProjectTask {
  id: string;
  projectId: string;
  projectOwnerId: string;
  createdBy: string;
  assigneeId: string;
  assigneeName: string;
  title: string;
  dueDate: string;
  estimatedMinutes: number;
  priority: TaskPriority;
  status: TaskStatus;
  notes: string;
  completedBy: string;
  completedAtIso: string;
  participantIds: string[];
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Household {
  id: string;
  householdId: string;
  name: string;
  ownerId: string;
  ownerName: string;
  memberIds: string[];
  invitedEmails: string[];
  calendarToken?: string;
  // The family this household belongs to, if any (Jason, 2026-11-20).
  familyId?: string;
  // Money and circles (Jason, 2026-11-21): the head of household's
  // switch for letting this household's finance records be seen
  // through circles at all. Caution is the default — absent or
  // false means finances stay inside the household and family rings.
  allowPartnerFinances?: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface HouseholdMember {
  id: string;
  userId: string;
  householdId: string;
  householdOwnerId: string;
  displayName: string;
  username: string;
  role: 'owner' | 'member';
  memberIds: string[];
}

// The family (Jason, 2026-11-20): the widest ring. A roster of people
// above the households; households link to it, and family-scoped
// records carry the family roster as their audience. People can be
// family before they run a household of their own.
export interface RestoreDirective {
  snapshotExportedAtIso: string;
  atIso: string;
  byName: string;
}

export interface FamilyStorage {
  rootChoice?: 'default' | 'custom';
  rootId?: string;
  rootLabel?: string;
  backupsEnabled?: boolean;
  backupFrequency?: 'daily' | 'weekly' | 'manual';
  backupScope?: 'everything' | 'finances-official' | 'documents';
}

export interface Family {
  id: string;
  name: string;
  ownerId: string;
  ownerName: string;
  memberIds: string[];
  // How the head is settled (Jason, 2026-11-21): 'seniority' derives
  // it by age and blood from the counted people; 'chosen' records
  // the family's own choice in headNames (one name, or two for
  // co-heads — a couple heading together). The app records the
  // choice; it does not run the ballot.
  headMode?: 'seniority' | 'chosen';
  headNames?: string[];
  // The responsible age (Jason, 2026-11-21): the age at which a
  // family member becomes an adult in the app's eyes and enters the
  // family's read/write stream on their own. The law's number is
  // 18 and that is the default; a family may choose otherwise, in
  // general here or for one person on the roster. Birthdates are a
  // record with consequences: reaching the age is what turns the
  // stream on, unless the head has said otherwise for that person.
  responsibleAge?: number;
  // Maintained by the family's owner from the roster (the rules
  // mirror against these lists; they are recomputed whenever the
  // roster, the setting, or the calendar changes a person's
  // standing): members not yet in the full stream, and the subset
  // of them a parent has said may write to the family calendar.
  // Children — anyone not yet responsible — can always SEE the
  // family calendar; they cannot see finances, and they cannot
  // write to the calendar unless a parent grants it.
  notYetIds?: string[];
  childWriterIds?: string[];
  // Family recovery (Jason, 2026-11-21): the family's recovery key,
  // set up by its head. check is the standing check text sealed
  // under the family key; wraps carries the family key wrapped to
  // each account member's public wrap key; headKeyWrap is the
  // head's own vault key sealed under the family key — the thing a
  // members' vote can hand back after a lost passphrase.
  recovery?: FamilyRecovery;
  // Storage & backups (Jason, 2026-11-21): the family head's
  // choices. The default is one host root folder — the Steward
  // folder the desk sets up — because one root keeps everything
  // inside the protection, the sharing, and the backup at once;
  // the files are held in the vault and the tags do the work, so
  // a record's tier never requires its file to move. A head may
  // point the desk at a different root folder instead, knowing
  // what that splits. Backups are the head's toggle: whether they
  // run, how often, and what they carry.
  storage?: FamilyStorage;
  // The head-head's restore directive (Jason, 2026-11-21): when
  // the head of the whole family restores, the restore reaches
  // everything underneath her tier — no sub-head's setting or
  // wish blocks it. Her restore writes this directive; members'
  // devices surface it and restore their own records from the
  // same backup. The family's remedy for a head it disagrees
  // with is to evict the head and take over — the desk does not
  // second-guess her.
  restoreDirective?: RestoreDirective;
  // The counted people (Jason, 2026-11-20): the family roster holds
  // people, not just accounts — cousins who never open the app are
  // family too. Headship of the giant circle descends by seniority
  // among the living counted people, and the roster doesn't forget:
  // a person who has died stays on it, marked.
  people?: FamilyPerson[];
  createdAt?: unknown;
  updatedAt?: unknown;
}

// One counted person on a family's roster. birthYear is what
// seniority is figured from; living=false marks someone the family
// has lost (they stay on the roster — the circle doesn't forget).
// One entry in a record's gift log: ownership moved, and the log
// says from whom, to whom, and by what decision.
export interface GiftEntry {
  fromUid: string;
  fromName: string;
  toLabel: string;
  atIso: string;
  decision: 'owner' | 'majority' | 'eldest';
}

// A proposed give of a co-owned record (collection: giveProposals).
// The owners vote; a majority carries it; a tie at full turnout
// goes to the eldest of the owners. Period. (Jason, 2026-11-20.)
export interface GiveProposal {
  id: string;
  collectionName: 'documents' | 'tasks' | 'propertyEntries' | 'financeEntries' | 'jasonNotes' | 'accountRecords';
  recordId: string;
  recordTitle: string;
  ownerIds: string[];
  proposedBy: string;
  proposedByName: string;
  toUid: string;
  toFamilyId: string;
  toLabel: string;
  approvals: string[];
  declines: string[];
  status: 'open' | 'approved' | 'declined' | 'done';
  decision?: 'majority' | 'eldest';
  createdAt?: unknown;
  updatedAt?: unknown;
}

// One person's family-directory entry (Jason, 2026-11-21): the
// full addresses record and every contact slot, shared only as
// far as the person chooses under the hierarchy. A Physical
// Address is where the building is; a Billing Address is only
// where billing mail goes — the two are never merged.
export interface DirectoryEntry {
  id: string;
  userId: string;
  householdId: string;
  memberIds: string[];
  scope?: 'private' | 'household' | 'family' | 'circles';
  familyId?: string;
  circleIds?: string[];
  displayName: string;
  // Occasions (Jason, 2026-11-21): birthdays and anniversaries
  // ride on the directory entry, so planning can surface them.
  // Written as YYYY-MM-DD when the year is known, MM-DD when it
  // is not.
  birthday?: string;
  anniversary?: string;
  anniversaryLabel?: string;
  physicalAddress?: string;
  billingAddress?: string;
  phones?: string[];
  emails?: string[];
  notes?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

// An account record (Jason, 2026-11-21): a login the desk keeps —
// a bank, a medical portal, a personal account. Scoped exactly
// like every other record (owner, household, memberIds audience,
// scope ring, family, circles). The record itself carries NO
// password: it names the account and points at a credential in
// the credentials box (credentialId). The box is a separate store
// with its own rules — the way Jason's own passwords work with
// Moose: apart from the records, reached only through the box.

export interface Occasion {
  name: string;
  label: string;
  dateKey: string;
  daysAway: number;
  turningYears?: number;
}

// The next birthdays and anniversaries among the directory
// entries a reader may see, soonest first.
export function upcomingOccasions(entries: DirectoryEntry[], withinDays = 60): Occasion[] {
  const out: Occasion[] = [];
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const consider = (entry: DirectoryEntry, raw: string | undefined, kind: 'birthday' | 'anniversary') => {
    if (!raw) return;
    const m = /^(?:(\d{4})-)?(\d{2})-(\d{2})$/.exec(raw.trim());
    if (!m) return;
    const year = m[1] ? parseInt(m[1], 10) : undefined;
    const month = parseInt(m[2], 10) - 1;
    const day = parseInt(m[3], 10);
    let next = new Date(today.getFullYear(), month, day);
    if (next.getTime() < today.getTime()) {
      next = new Date(today.getFullYear() + 1, month, day);
    }
    const daysAway = Math.round((next.getTime() - today.getTime()) / 86400000);
    if (daysAway > withinDays) return;
    const label =
      kind === 'birthday'
        ? 'Birthday'
        : entry.anniversaryLabel?.trim() || 'Anniversary';
    out.push({
      name: entry.displayName,
      label,
      dateKey: `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`,
      daysAway,
      turningYears: year ? next.getFullYear() - year : undefined,
    });
  };
  for (const entry of entries) {
    consider(entry, entry.birthday, 'birthday');
    consider(entry, entry.anniversary, 'anniversary');
  }
  out.sort((a, b) => a.daysAway - b.daysAway);
  return out;
}

export interface EmergencySheet {
  id: string;
  userId: string;
  householdId: string;
  memberIds: string[];
  scope?: 'private' | 'household' | 'family';
  familyId?: string;
  circleIds?: string[];
  // The sheet is the person's own words, held by the desk for
  // the day somebody needs it fast: who to call, who their
  // doctors are, what responders should know. The desk holds the
  // sheet; it never advises on medical matters.
  forName: string;
  contacts?: string;
  doctors?: string;
  allergies?: string;
  medicationsNote?: string;
  bloodType?: string;
  conditionsNote?: string;
  wishes?: string;
  notes?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface AccountRecord {
  id: string;
  userId: string;
  householdId: string;
  memberIds: string[];
  ownerIds?: string[];
  giftLog?: GiftEntry[];
  scope?: 'private' | 'household' | 'family' | 'circles';
  familyId?: string;
  circleIds?: string[];
  title: string;
  username: string;
  url: string;
  credentialId?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

// A credential in the box (collection: credentials). The sealed
// password and its notes live here and nowhere else. passwordSealed
// is under the owner's vault key; when the account is held by a
// family whose recovery is set up, passwordFamilyWrap seals it
// under the family key too, so the family can open what it holds
// together — through the box, by the box's read rule (owner, or a
// member of the account's audience). aiUse is the allowance,
// decided here in the box, per credential: whether the assistant
// may use this credential at all. In this build the assistant is
// never handed the value either way — the allowance records the
// owner's word, the way Moose's own vault allowance does.
export interface Credential {
  id: string;
  ownerId: string;
  accountRecordId: string;
  memberIds: string[];
  familyId?: string;
  passwordSealed: string;
  passwordFamilyWrap?: string;
  notesSealed?: string;
  aiUse?: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface FamilyRecovery {
  check: string;
  wraps: Record<string, string>;
  headKeyWrap?: string;
}

// A head's reset request (collection: resetRequests). The head,
// locked out of their vault but signed in as themselves, posts a
// request carrying a one-time public key. Members approve by
// adding their own uid; past half of the family's account holders,
// an approver delivers the head's vault key and the family key,
// each wrapped to that one-time key. The head unwraps, adopts the
// key, and sets a new passphrase.
export interface ResetRequest {
  id: string;
  familyId: string;
  familyName: string;
  forUid: string;
  forName: string;
  headPublicKey: string;
  approvals: string[];
  deliveryVaultKey?: string;
  deliveryFamilyKey?: string;
  status: 'open' | 'delivered' | 'done';
  createdAt?: unknown;
  updatedAt?: unknown;
}

// A member's public wrap key in the directory (collection:
// wrapKeys/{uid}) — public by design, so a family head can wrap
// the family recovery key to every member.
export interface WrapKeyDoc {
  userId: string;
  displayName: string;
  publicKey: string;
  updatedAt?: unknown;
}

export interface FamilyPerson {
  name: string;
  birthYear?: number;
  // The full birthdate when the family knows it (YYYY-MM-DD). The
  // responsible age is figured from this when present, else from
  // January 1 of the birth year.
  birthDate?: string;
  living?: boolean;
  userId?: string;
  // This person's standing (Jason, 2026-11-21): absent or 'auto'
  // means the age decides; 'yes' puts them in the stream whatever
  // their age; 'no' holds them out whatever their age — the head
  // choosing otherwise. responsibleAge overrides the family's age
  // for this one person. canWriteCalendar is a parent's narrower
  // grant: a child who may add to the family calendar while still
  // outside the full stream.
  responsibility?: 'auto' | 'yes' | 'no';
  responsibleAge?: number;
  canWriteCalendar?: boolean;
  // Headship ranks by age and blood (Jason, 2026-11-21): blood is
  // the default (undefined counts as blood); blood=false marks
  // someone family by marriage or by choice. A courtesy member is
  // present in the circle but unranked — they never take the head
  // by seniority (Mom in Derek's circle; Derek still heads his own).
  blood?: boolean;
  courtesy?: boolean;
}

// The head of a family, derived — never appointed by a button: the
// eldest living counted person. Falls back to the family's owner
// name when no counted people carry a birth year yet.
export function familyHeadName(family: Family): string {
  if (family.headMode === 'chosen' && family.headNames && family.headNames.length > 0) {
    return family.headNames.join(' & ');
  }
  const ranked = (family.people || []).filter(
    (p) => p.living !== false && !p.courtesy && typeof p.birthYear === 'number'
  );
  const blood = ranked.filter((p) => p.blood !== false);
  const pool = blood.length > 0 ? blood : ranked;
  if (pool.length === 0) return family.ownerName || '';
  return pool.reduce((a, b) => ((a.birthYear || 9999) <= (b.birthYear || 9999) ? a : b)).name;
}

// The family's responsible age: the family's own number when it
// has chosen one, else the legal default of 18.
export function familyResponsibleAge(family: Family): number {
  return typeof family.responsibleAge === 'number' && family.responsibleAge > 0
    ? family.responsibleAge
    : 18;
}

// The day a person enters the stream under the age rule alone, as
// an ISO date, or null when their birth isn't recorded well enough
// to say. A February 29 birthday lands on February 28 in years
// without one.
export function personResponsibleDate(family: Family, person: FamilyPerson): string | null {
  const birth =
    person.birthDate ||
    (typeof person.birthYear === 'number' ? `${person.birthYear}-01-01` : '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birth)) return null;
  const age =
    typeof person.responsibleAge === 'number' && person.responsibleAge > 0
      ? person.responsibleAge
      : familyResponsibleAge(family);
  const year = Number(birth.slice(0, 4)) + age;
  let monthDay = birth.slice(5);
  if (monthDay === '02-29') {
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    if (!leap) monthDay = '02-28';
  }
  return `${year}-${monthDay}`;
}

// Is this counted person in the family's read/write stream today?
// The head's word for the person beats the calendar; the calendar
// beats everything else. No recorded birth means the age can't
// speak — the head's 'yes' is the way in.
export function personIsResponsible(
  family: Family,
  person: FamilyPerson,
  todayKey: string
): boolean {
  if (person.responsibility === 'yes') return true;
  if (person.responsibility === 'no') return false;
  const on = personResponsibleDate(family, person);
  return on !== null && todayKey >= on;
}

// The maintained lists on the family doc, figured from the roster:
// members whose linked person is not yet responsible, and which of
// them a parent has granted the family calendar. A member with no
// linked person on the roster is treated as grown — the roster is
// where childhood is recorded.
export function computeStreamLists(
  family: Family,
  todayKey: string
): { notYetIds: string[]; childWriterIds: string[] } {
  const notYetIds: string[] = [];
  const childWriterIds: string[] = [];
  for (const uid of family.memberIds || []) {
    const person = (family.people || []).find((x) => x.userId === uid);
    if (!person) continue;
    if (personIsResponsible(family, person, todayKey)) continue;
    notYetIds.push(uid);
    if (person.canWriteCalendar) childWriterIds.push(uid);
  }
  return { notYetIds, childWriterIds };
}

// A circle (Jason, 2026-11-20): a set of people, drawn by a user —
// the boat circle. Permanent or temporary (expiresAtKey is the local
// date it closes). Visible only to its members. The rings are the
// circles the system draws; these are the ones people draw.
export interface Circle {
  id: string;
  name: string;
  ownerId: string;
  memberIds: string[];
  temporary: boolean;
  expiresAtKey?: string;
  // Headship (Jason, 2026-11-21): 'seniority' leaves the head as
  // the circle's owner unless the family roster says otherwise;
  // 'chosen' names the head(s) in headIds — one person, or two
  // co-heads. The head(s) hold the omission switches below.
  headMode?: 'seniority' | 'chosen';
  headIds?: string[];
  // The head's omissions (Jason, 2026-11-21): access inside a
  // circle is even by default — default on — and the head can omit
  // people from seeing (omitViewIds), from writing or submitting
  // (omitWriteIds), or whole kinds of records from the circle's
  // views (omitKinds speaks the record kinds: 'financial' |
  // 'medical' | 'calendar' | 'personal' | 'custom').
  omitViewIds?: string[];
  omitWriteIds?: string[];
  omitKinds?: string[];
  createdAt?: unknown;
  updatedAt?: unknown;
  // The head's restore directive — same law as the family's
  // (Jason, 2026-11-21): a head's restore reaches every member
  // of the circle, across all circles, however they fit.
  restoreDirective?: RestoreDirective;
}

// Who heads a circle, as user ids: the chosen head(s) when the
// circle names them, otherwise its owner.
export function circleHeadIds(circle: Circle): string[] {
  if (circle.headMode === 'chosen' && circle.headIds && circle.headIds.length > 0) {
    return circle.headIds;
  }
  return [circle.ownerId];
}

export interface ProjectInvite {
  id: string;
  projectId: string;
  projectName: string;
  inviterId: string;
  inviterName: string;
  targetEmailLower: string;
  targetUsername: string;
  targetUid: string;
  status: 'pending' | 'accepted' | 'declined';
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface AppNotification {
  id: string;
  recipientUid: string;
  actorUid: string;
  actorName: string;
  type: 'task_assigned' | 'task_completed' | 'project_invite' | 'invite_accepted';
  projectId: string;
  projectName: string;
  taskId: string;
  message: string;
  read: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface RankedTaskItem {
  taskId: string;
  rank: number;
  timeBlock: string;
  urgencyScore: number;
  reason: string;
  adaptiveNote: string;
}

export interface AIPriorityPlan {
  dailyStrategy: string;
  learnedInsight: string;
  rankedTasks: RankedTaskItem[];
  generatedAtIso: string;
}

export type PropertyEntryArea = 'conservancy' | 'cabin_maintenance' | 'cabin_stay';
export type PropertyEntryStatus =
  | 'nominal'
  | 'attention'
  | 'urgent'
  | 'upcoming'
  | 'ready'
  | 'completed';
export type PropertyCadence = 'once' | 'monthly' | 'quarterly' | 'seasonal' | 'annual';

export interface PropertyEntry {
  id: string;
  userId: string;
  householdId: string;
  memberIds: string[];
  ownerIds?: string[];
  giftLog?: GiftEntry[];
  // Visibility (Jason, 2026-11-20): the tags carry access. scope names
  // the ring (absent = household); circleIds name custom circles whose
  // members join the audience; memberIds is the computed audience
  // snapshot the rules check. The depositor (userId) owns the record
  // always — a household, the family, or a circle only holds it.
  scope?: 'private' | 'household' | 'family' | 'circles';
  familyId?: string;
  circleIds?: string[];
  // The record kind (Jason, 2026-11-21): how this entry is filed —
  // Financial, Medical, Personal, or the family's own Custom kind
  // (named in customKindLabel). Absent means Personal.
  recordKind?: RecordKind;
  customKindLabel?: string;
  encrypted?: boolean;
  area: PropertyEntryArea;
  place: string;
  title: string;
  status: PropertyEntryStatus;
  scheduledDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD or ''
  cadence: PropertyCadence;
  inspectorOrGuest: string;
  notes: string;
  linkedDocumentId: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface WimberleyWeatherAdvisory {
  title: string;
  severity: 'info' | 'watch' | 'alert';
  detail: string;
}

export interface WimberleyWeatherData {
  location: string;
  fetchedAtIso: string;
  current: {
    temperatureF: number;
    apparentTemperatureF: number;
    humidityPct: number;
    windMph: number;
    precipitationIn: number;
    conditionLabel: string;
  };
  daily: Array<{
    date: string;
    tempMaxF: number;
    tempMinF: number;
    precipIn: number;
    precipProbPct: number;
  }>;
  advisories: WimberleyWeatherAdvisory[];
}

export interface PropertyAdvisoryRecommendation {
  title: string;
  area: PropertyEntryArea;
  cadence: PropertyCadence;
  priority: TaskPriority;
  suggestedDate: string;
  reason: string;
}

export interface PropertyAdvisoryPlan {
  seasonalSummary: string;
  conservancyFocus: string;
  cabinReadinessFocus: string;
  recommendations: PropertyAdvisoryRecommendation[];
}

export type FinanceKind = 'expense' | 'income';
// Finance entries used to carry their own scope list; they now use the
// shared place tree (PLACES above), like every other record.

export const DEFAULT_EXPENDITURE_GROUPS = [
  'Conservancy',
  'Home Repairs',
  'Rental Upkeep',
  'Groceries',
  'Medical - Mom',
  'Medical - Jason',
  'Utilities & Propane',
  'Taxes & Insurance',
  'Car & Maintenance',
  'Church & Community',
  'Rental Income',
  'General',
] as const;

export interface FinanceEntry {
  id: string;
  userId: string;
  householdId: string;
  memberIds: string[];
  ownerIds?: string[];
  giftLog?: GiftEntry[];
  // Visibility (Jason, 2026-11-20): the tags carry access. scope names
  // the ring (absent = household); circleIds name custom circles whose
  // members join the audience; memberIds is the computed audience
  // snapshot the rules check. The depositor (userId) owns the record
  // always — a household, the family, or a circle only holds it.
  scope?: 'private' | 'household' | 'family' | 'circles';
  familyId?: string;
  circleIds?: string[];
  kind: FinanceKind;
  group: string;
  title: string;
  amount: number;
  entryDate: string; // YYYY-MM-DD
  vendor: string;
  accountLocation?: string;
  taxDeductible: boolean;
  place: string;
  careForJason: boolean;
  notes: string;
  encrypted?: boolean;
  linkedDocumentId: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export const REMINDER_OPTIONS = [
  { label: 'At scheduled time', minutes: 0 },
  { label: '15 minutes before', minutes: 15 },
  { label: '1 hour before', minutes: 60 },
  { label: '1 day before', minutes: 1440 },
  { label: '3 days before', minutes: 4320 },
  { label: '1 week before', minutes: 10080 },
] as const;

export function formatReminderLabel(minutes: number): string {
  const match = REMINDER_OPTIONS.find((opt) => opt.minutes === minutes);
  if (match) return match.label;
  if (minutes < 60) return `${minutes} min before`;
  if (minutes < 1440) return `${Math.round(minutes / 60)} hr before`;
  return `${Math.round(minutes / 1440)} days before`;
}

export function getLocalTodayIso(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function createSafeId(prefix = 'id'): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now()}_${rand}`.replace(/[^a-zA-Z0-9_-]/g, '');
}

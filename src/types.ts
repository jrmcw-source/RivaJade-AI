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

export function isPlaceName(value: unknown): value is PlaceName {
  return typeof value === 'string' && (PLACES as readonly string[]).includes(value);
}
export type TaskType = 'task' | 'appointment';
export type TaskPriority = 'low' | 'medium' | 'high';
export type TaskStatus = 'pending' | 'completed';
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
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface ScheduleTask {
  id: string;
  userId: string;
  householdId: string;
  memberIds: string[];
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
  linkedDocumentId: string;
  completedAtIso: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type DocVerificationStatus = 'provisional' | 'verified';

export interface ScannedDocument {
  id: string;
  userId: string;
  householdId: string;
  memberIds: string[];
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
  kind: FinanceKind;
  group: string;
  title: string;
  amount: number;
  entryDate: string; // YYYY-MM-DD
  vendor: string;
  taxDeductible: boolean;
  place: string;
  careForJason: boolean;
  notes: string;
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

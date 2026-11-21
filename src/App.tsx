import React, { useEffect, useMemo, useRef, useState } from 'react';
import { User, onAuthStateChanged } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  addDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  Calendar,
  FileSearch,
  Users,
  Mic,
  BarChart3,
  Plus,
  LogOut,
  Bell,
  Moon,
  Sun,
  X,
  UserCheck,
  Mail,
  WifiOff,
  Trees,
  Network,
  Wallet,
  Download,
  HardDrive,
  Sparkles,
  Home,
  Check,
  Trash2,
} from 'lucide-react';
import {
  OperationType,
  auth,
  db,
  handleFirestoreError,
  signInWithGoogle,
  signOutUser,
  subscribeDriveAccessToken,
  getDriveAccessToken,
  connectGmail,
  getGmailAccessToken,
} from './firebase';
import { fetchRecentMailSummary, fetchMailForFiling, type MailFilingEntry } from './gmail';
import {
  AppNotification,
  CATEGORIES,
  PLACES,
  PLACE_FILTERS,
  placeMatches,
  isPlaceName,
  Category,
  FinanceEntry,
  FocusWindow,
  Household,
  HouseholdMember,
  JasonNote,
  MorningBriefing,
  MailBriefing,
  RecordKind,
  CircleBriefing,
  circleHeadIds,
  upcomingOccasions,
  computeStreamLists,
  effectiveRecordKind,
  effectiveSealedKinds,
  RECORD_KIND_LABELS,
  familyResponsibleAge,
  personIsResponsible,
  Family,
  FamilyPerson,
  Circle,
  familyHeadName,
  familyHeadUid,
  ResetRequest,
  AccountRecord,
  Credential,
  GiveProposal,
  GiftEntry,
  DirectoryEntry,
  EmergencySheet,
  FamilyStorage,
  ProjectInvite,
  ProjectMember,
  ProjectTask,
  PropertyEntry,
  ScannedDocument,
  ScheduleTask,
  SharedProject,
  TaskPriority,
  UserProfile,
  createSafeId,
  getLocalTodayIso,
} from './types';
import { ErrorBoundary } from './components/ErrorBoundary';
import { WelcomeSignInView } from './components/WelcomeSignInView';
import { ScheduleAndCalendarView } from './components/ScheduleAndCalendarView';
import { DocumentScannerVaultView } from './components/DocumentScannerVaultView';
import { CollaborativeProjectsView } from './components/CollaborativeProjectsView';
import { GeminiLiveVoiceView } from './components/GeminiLiveVoiceView';
import { AnalyticsDashboardView } from './components/AnalyticsDashboardView';
import { WimberleyPropertyView } from './components/WimberleyPropertyView';
import { FinancesView } from './components/FinancesView';
import { GoogleDriveBackupModal } from './components/GoogleDriveBackupModal';
import { AIAssistantDrawer } from './components/AIAssistantDrawer';
import { FrontDoorView, FrontDoorDeskId } from './components/FrontDoorView';
import { TreeView } from './components/TreeView';
import {
  buildWorkspaceJsonBackup,
  createDriveBackupFile,
  ensureStewardBackupFolder,
  ensureStewardSubfolder,
  ensureStewardPhotosFolder,
  downloadDriveBackupContent,
  listDriveBackups,
  overwriteDriveBackupFile,
  uploadDriveBinaryFile,
  WorkspaceBackupSnapshot,
} from './services/googleDriveBackup';
import {
  commitStagedPassphrase,
  createVault,
  discardStagedPassphrase,
  getRecoveryKeyB64,
  isRecoveryPendingSave,
  isSealedValue,
  isVaultUnlocked,
  lockVault,
  markRecoveryKeySaved,
  prepareRecovery,
  recoverWithKeyFile,
  sealText,
  sealTextStaged,
  stageNewPassphrase,
  subscribeVault,
  unlockVault,
  unsealText,
  adoptVaultKeyBytes,
  b64ToBytesPublic,
  bytesToB64Public,
  clearEphemeral,
  ensureWrapKeypair,
  exportFamilyRecoveryKeyRaw,
  familyRecoveryCheck,
  getFamilyRecoveryKey,
  hasWrapKeypair,
  importFamilyRecoveryKey,
  loadFamilyRecoveryKeyFromWrap,
  loadWrapKeypair,
  newEphemeralKeypair,
  newFamilyRecoveryKey,
  rsaWrapTo,
  setFamilyRecoveryKey,
  unwrapEphemeral,
  unwrapVaultKeyWithFamily,
  wrapVaultKeyUnderFamily,
  sealTextWithKey,
  unsealTextWithKey,
} from './services/vault';
import { PWAInstallModalTrigger } from './components/PWAInstallModal';
import { useOnlineStatus } from './hooks/useOnlineStatus';

type NavTab =
  | 'frontdoor'
  | 'schedule'
  | 'property'
  | 'finances'
  | 'vault'
  | 'projects'
  | 'voice'
  | 'tree'
  | 'analytics';

function sanitizeHandle(raw: string, fallbackUid: string): string {
  const cleaned = raw
    .toLowerCase()
    .replace(/[^a-z0-9_.]/g, '')
    .slice(0, 28);
  if (cleaned.length >= 3) return cleaned;
  return `user_${fallbackUid.slice(0, 8).toLowerCase()}`;
}


function withHouseholdDefaults<
  T extends { userId: string; householdId?: string; memberIds?: string[]; place?: string },
>(rec: T): T {
  return {
    ...rec,
    householdId: rec.householdId || '',
    memberIds:
      Array.isArray(rec.memberIds) && rec.memberIds.length > 0 ? rec.memberIds : [rec.userId],
    place: rec.place || '',
  };
}

function withFinanceDefaults(
  rec: Omit<FinanceEntry, 'id'>
): Omit<FinanceEntry, 'id'> {
  const base = withHouseholdDefaults(rec);
  return {
    ...base,
    careForJason: Boolean(base.careForJason),
  };
}

function withDocumentDefaults(
  rec: Omit<ScannedDocument, 'id'>
): Omit<ScannedDocument, 'id'> {
  const base = withHouseholdDefaults(rec);
  return {
    ...base,
    verificationStatus: base.verificationStatus || 'provisional',
    verifiedByName: base.verifiedByName || '',
    verifiedAtIso: base.verifiedAtIso || '',
    paperLocation: base.paperLocation || '',
    driveFileId: base.driveFileId || '',
  };
}

function withJasonNoteDefaults(
  rec: Omit<JasonNote, 'id'>
): Omit<JasonNote, 'id'> {
  const base = withHouseholdDefaults(rec);
  return {
    ...base,
    text: base.text || '',
    source: base.source || 'front_door',
    handled: Boolean(base.handled),
  };
}

function withBriefingDefaults(
  rec: Omit<MorningBriefing, 'id'>
): Omit<MorningBriefing, 'id'> {
  const base = withHouseholdDefaults(rec);
  return {
    ...base,
    dateKey: base.dateKey || '',
    text: base.text || '',
  };
}

function withMailBriefingDefaults(
  rec: Omit<MailBriefing, 'id'>
): Omit<MailBriefing, 'id'> {
  return {
    ...rec,
    userId: rec.userId || '',
    householdId: rec.householdId || '',
    dateKey: rec.dateKey || '',
    text: rec.text || '',
  };
}

function withCircleBriefingDefaults(
  rec: Omit<CircleBriefing, 'id'>
): Omit<CircleBriefing, 'id'> {
  return {
    ...rec,
    userId: rec.userId || '',
    householdId: rec.householdId || '',
    dateKey: rec.dateKey || '',
    text: rec.text || '',
  };
}

function withFamilyDefaults(rec: Omit<Family, 'id'>): Omit<Family, 'id'> {
  return {
    ...rec,
    name: rec.name || 'Family',
    ownerId: rec.ownerId || '',
    ownerName: rec.ownerName || '',
    memberIds: rec.memberIds || [],
    people: rec.people || [],
  };
}

function withCircleDefaults(rec: Omit<Circle, 'id'>): Omit<Circle, 'id'> {
  return {
    ...rec,
    name: rec.name || 'Circle',
    ownerId: rec.ownerId || '',
    memberIds: rec.memberIds || [],
    temporary: Boolean(rec.temporary),
    expiresAtKey: rec.expiresAtKey || '',
    headIds: rec.headIds || [],
    omitViewIds: rec.omitViewIds || [],
    omitWriteIds: rec.omitWriteIds || [],
    omitKinds: rec.omitKinds || [],
  };
}

function localDateKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`;
}

function mergeRecordsById<T extends { id: string }>(own: T[], shared: T[]): T[] {
  const map = new Map<string, T>();
  shared.forEach((r) => map.set(r.id, r));
  own.forEach((r) => map.set(r.id, r));
  return Array.from(map.values());
}

function MainApp() {
  const isOnline = useOnlineStatus();
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<NavTab>('schedule');
  const [darkMode, setDarkMode] = useState(false);
  const [composerTriggerCount, setComposerTriggerCount] = useState(0);
  const [scannerTriggerCount, setScannerTriggerCount] = useState(0);
  const [dismissedReminders, setDismissedReminders] = useState<Record<string, boolean>>({});
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [driveBackupOpen, setDriveBackupOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [driveConnected, setDriveConnected] = useState(false);
  // Front door (2026-11-20): the big simple screen is the app's entrance.
  // It opens on arrival; her CLOSE button puts it away, and the Front
  // Desk nav item brings it back. The notice carries a spoken
  // confirmation into the door (a filing, after a picture is saved).
  const [frontDoorOpen, setFrontDoorOpen] = useState(true);
  const [frontDoorNotice, setFrontDoorNotice] = useState<{ id: number; text: string } | null>(null);
  const [scannerPresetPlace, setScannerPresetPlace] = useState('');
  const capturePresetArmedRef = useRef(false);
  const [showHandledNotes, setShowHandledNotes] = useState(false);

  // Cloud-synced Firestore state
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [ownTasks, setOwnTasks] = useState<ScheduleTask[]>([]);
  const [sharedTasks, setSharedTasks] = useState<ScheduleTask[]>([]);
  const [ownDocuments, setOwnDocuments] = useState<ScannedDocument[]>([]);
  const [sharedDocuments, setSharedDocuments] = useState<ScannedDocument[]>([]);
  const [voiceMemories, setVoiceMemories] = useState<VoiceMemoryState[]>([]);
  const [projects, setProjects] = useState<SharedProject[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [projectMembers, setProjectMembers] = useState<ProjectMember[]>([]);
  const [projectTasks, setProjectTasks] = useState<ProjectTask[]>([]);
  const [incomingInvites, setIncomingInvites] = useState<ProjectInvite[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [ownPropertyEntries, setOwnPropertyEntries] = useState<PropertyEntry[]>([]);
  const [sharedPropertyEntries, setSharedPropertyEntries] = useState<PropertyEntry[]>([]);
  const [ownFinanceEntries, setOwnFinanceEntries] = useState<FinanceEntry[]>([]);
  const [ownAccountRecords, setOwnAccountRecords] = useState<AccountRecord[]>([]);
  const [ownCredentials, setOwnCredentials] = useState<Credential[]>([]);
  const [sharedCredentials, setSharedCredentials] = useState<Credential[]>([]);
  const [boxFeedback, setBoxFeedback] = useState('');
  const [giveProposalsOwn, setGiveProposalsOwn] = useState<GiveProposal[]>([]);
  const [giveProposalsForMe, setGiveProposalsForMe] = useState<GiveProposal[]>([]);
  const [giveTarget, setGiveTarget] = useState('');
  const [giveFeedback, setGiveFeedback] = useState('');
  const [ownDirectoryEntries, setOwnDirectoryEntries] = useState<DirectoryEntry[]>([]);
  const [ownEmergencySheets, setOwnEmergencySheets] = useState<EmergencySheet[]>([]);
  const [sharedEmergencySheets, setSharedEmergencySheets] = useState<EmergencySheet[]>([]);
  const [sharedDirectoryEntries, setSharedDirectoryEntries] = useState<DirectoryEntry[]>([]);
  const [dirName, setDirName] = useState('');
  const [dirBirthday, setDirBirthday] = useState('');
  const [dirAnniversary, setDirAnniversary] = useState('');
  const [dirAnniversaryLabel, setDirAnniversaryLabel] = useState('');
  const [dirPhysical, setDirPhysical] = useState('');
  const [dirBilling, setDirBilling] = useState('');
  const [dirPhonesText, setDirPhonesText] = useState('');
  const [dirEmailsText, setDirEmailsText] = useState('');
  const [dirNotes, setDirNotes] = useState('');
  const [dirScope, setDirScope] = useState<'private' | 'household' | 'family'>('family');
  const [dirFamilyId, setDirFamilyId] = useState('');
  const [dirEditingId, setDirEditingId] = useState('');
  const [dirFeedback, setDirFeedback] = useState('');
  const [mailFileEntries, setMailFileEntries] = useState<MailFilingEntry[]>([]);
  const [mailFileScope, setMailFileScope] = useState<'private' | 'household' | 'family'>('private');
  const [mailFileFamilyId, setMailFileFamilyId] = useState('');
  const [mailFileKind, setMailFileKind] = useState<RecordKind>('personal');
  const [mailFiledIds, setMailFiledIds] = useState<string[]>([]);
  const [mailFileFeedback, setMailFileFeedback] = useState('');
  const [sheetForName, setSheetForName] = useState('');
  const [sheetContacts, setSheetContacts] = useState('');
  const [sheetDoctors, setSheetDoctors] = useState('');
  const [sheetAllergies, setSheetAllergies] = useState('');
  const [sheetMedications, setSheetMedications] = useState('');
  const [sheetBloodType, setSheetBloodType] = useState('');
  const [sheetConditions, setSheetConditions] = useState('');
  const [sheetWishes, setSheetWishes] = useState('');
  const [sheetNotes, setSheetNotes] = useState('');
  const [sheetScope, setSheetScope] = useState<'private' | 'household' | 'family'>('household');
  const [sheetFamilyId, setSheetFamilyId] = useState('');
  const [sheetFeedback, setSheetFeedback] = useState('');
  const [storageFamilyId, setStorageFamilyId] = useState('');
  const [stRootChoice, setStRootChoice] = useState<'default' | 'custom'>('default');
  const [stRootIdText, setStRootIdText] = useState('');
  const [stRootLabel, setStRootLabel] = useState('');
  const [stBackupsEnabled, setStBackupsEnabled] = useState(true);
  const [stFrequency, setStFrequency] = useState<'daily' | 'weekly' | 'manual'>('daily');
  const [stScope, setStScope] = useState<'everything' | 'finances-official' | 'documents'>('everything');
  const [stFeedback, setStFeedback] = useState('');
  const [restoreNoticeTick, setRestoreNoticeTick] = useState(0);
  const [sharedAccountRecords, setSharedAccountRecords] = useState<AccountRecord[]>([]);
  const [acctTitle, setAcctTitle] = useState('');
  const [acctUsername, setAcctUsername] = useState('');
  const [acctPassword, setAcctPassword] = useState('');
  const [acctUrl, setAcctUrl] = useState('');
  const [acctNotes, setAcctNotes] = useState('');
  const [acctScope, setAcctScope] = useState<'private' | 'household' | 'family' | 'circles'>('private');
  const [acctFamilyId, setAcctFamilyId] = useState('');
  const [acctCircleId, setAcctCircleId] = useState('');
  const [acctAiUse, setAcctAiUse] = useState(false);
  const [acctFeedback, setAcctFeedback] = useState('');
  const [revealedPasswords, setRevealedPasswords] = useState<Record<string, string>>({});
  const [sharedFinanceEntries, setSharedFinanceEntries] = useState<FinanceEntry[]>([]);
  const [ownJasonNotes, setOwnJasonNotes] = useState<JasonNote[]>([]);
  const [sharedJasonNotes, setSharedJasonNotes] = useState<JasonNote[]>([]);
  const [ownBriefings, setOwnBriefings] = useState<MorningBriefing[]>([]);
  const [sharedBriefings, setSharedBriefings] = useState<MorningBriefing[]>([]);
  const [ownMailBriefings, setOwnMailBriefings] = useState<MailBriefing[]>([]);
  const [ownCircleBriefings, setOwnCircleBriefings] = useState<CircleBriefing[]>([]);
  const [families, setFamilies] = useState<Family[]>([]);
  const [resetRequests, setResetRequests] = useState<ResetRequest[]>([]);
  const [wrapKeyMap, setWrapKeyMap] = useState<Record<string, string>>({});
  const [wrapReady, setWrapReady] = useState(false);
  const [familyRecoveryPass, setFamilyRecoveryPass] = useState('');
  const [familyRecoveryFeedback, setFamilyRecoveryFeedback] = useState('');
  const [familyRewrapId, setFamilyRewrapId] = useState('');
  const [resetToClose, setResetToClose] = useState('');
  const [circles, setCircles] = useState<Circle[]>([]);
  const [households, setHouseholds] = useState<Household[]>([]);
  const [selectedHouseholdId, setSelectedHouseholdId] = useState<string>('');
  const [selectedPlace, setSelectedPlace] = useState<string>('');
  const [joinableHouseholds, setJoinableHouseholds] = useState<Household[]>([]);
  const [householdMembers, setHouseholdMembers] = useState<HouseholdMember[]>([]);
  const [shareWithHousehold, setShareWithHousehold] = useState(true);
  const [householdNameDraft, setHouseholdNameDraft] = useState('');
  const [householdInviteDraft, setHouseholdInviteDraft] = useState('');
  const [householdFeedback, setHouseholdFeedback] = useState<string | null>(null);

  // Settings form state
  const [editUsername, setEditUsername] = useState('');
  const [usernameFeedback, setUsernameFeedback] = useState<string | null>(null);
  const [editAddressName, setEditAddressName] = useState('');
  const [addressNameFeedback, setAddressNameFeedback] = useState<string | null>(null);
  const [gmailConnected, setGmailConnected] = useState(false);
  const [emailFeedback, setEmailFeedback] = useState<string | null>(null);
  const [editMailOnly, setEditMailOnly] = useState('');
  const [editMailNever, setEditMailNever] = useState('');
  const [mailRulesFeedback, setMailRulesFeedback] = useState<string | null>(null);

  type VoiceMemoryState = {
    id: string;
    userId: string;
    summary: string;
    followUpSteps: string[];
    completedTaskTitles: string[];
    transcriptExcerpt: string;
    createdAt?: unknown;
    updatedAt?: unknown;
  };

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  useEffect(() => {
    return subscribeDriveAccessToken((tok) => {
      setDriveConnected(Boolean(tok));
    });
  }, []);

  // Auth listener & initial profile bootstrap
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser);
      setAuthReady(true);
      if (nextUser) {
        try {
          const userDocRef = doc(db, 'users', nextUser.uid);
          const snap = await getDoc(userDocRef);
          if (!snap.exists()) {
            const defaultHandle = sanitizeHandle(
              (nextUser.email || '').split('@')[0] || nextUser.displayName || 'member',
              nextUser.uid
            );
            // Check if handle exists; append short uid if taken
            const handleSnap = await getDoc(doc(db, 'userHandles', defaultHandle));
            const finalHandle = handleSnap.exists()
              ? `${defaultHandle.slice(0, 20)}_${nextUser.uid.slice(0, 5).toLowerCase()}`
              : defaultHandle;

            const batch = writeBatch(db);
            batch.set(userDocRef, {
              userId: nextUser.uid,
              displayName: nextUser.displayName || 'Steward User',
              username: finalHandle,
              photoURL: nextUser.photoURL || '',
              defaultReminderMinutes: 60,
              notificationsEnabled: true,
              preferredFocusWindow: 'balanced',
              prefersQuickWinsFirst: false,
              behaviorSignals: [],
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
            batch.set(doc(db, 'users', nextUser.uid, 'private', 'info'), {
              userId: nextUser.uid,
              email: (nextUser.email || '').toLowerCase(),
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
            batch.set(doc(db, 'userHandles', finalHandle), {
              userId: nextUser.uid,
              username: finalHandle,
              displayName: nextUser.displayName || 'Steward User',
              photoURL: nextUser.photoURL || '',
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
            await batch.commit();
          }
        } catch (err) {
          console.error('Profile bootstrap note:', err);
        }
      } else {
        setUserProfile(null);
        setOwnTasks([]);
        setSharedTasks([]);
        setOwnDocuments([]);
        setSharedDocuments([]);
        setVoiceMemories([]);
        setProjects([]);
        setProjectMembers([]);
        setProjectTasks([]);
        setIncomingInvites([]);
        setNotifications([]);
        setOwnPropertyEntries([]);
        setSharedPropertyEntries([]);
        setOwnFinanceEntries([]);
        setSharedFinanceEntries([]);
        setHouseholds([]);
        setFamilies([]);
        setCircles([]);
        setJoinableHouseholds([]);
        setHouseholdMembers([]);
      }
    });
    return () => unsub();
  }, []);

  // Real-time Firestore listeners when authenticated
  useEffect(() => {
    if (!authReady || !user) return;

    const unsubProfile = onSnapshot(
      doc(db, 'users', user.uid),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as UserProfile;
          setUserProfile(data);
          setEditUsername(data.username);
          setEditAddressName(data.addressName || '');
          setEditMailOnly(data.mailOnlySenders || '');
          setEditMailNever(data.mailNeverSenders || '');
        }
      },
      (err) => handleFirestoreError(err, OperationType.GET, `users/${user.uid}`)
    );

    const unsubTasks = onSnapshot(
      query(collection(db, 'tasks'), where('userId', '==', user.uid)),
      (snap) => {
        setOwnTasks(
          snap.docs.map((d) => ({
            id: d.id,
            ...withHouseholdDefaults(d.data() as Omit<ScheduleTask, 'id'>),
          }))
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'tasks')
    );

    const unsubTasksShared = onSnapshot(
      query(collection(db, 'tasks'), where('memberIds', 'array-contains', user.uid)),
      (snap) => {
        setSharedTasks(
          snap.docs.map((d) => ({
            id: d.id,
            ...withHouseholdDefaults(d.data() as Omit<ScheduleTask, 'id'>),
          }))
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'tasks')
    );

    const unsubDocs = onSnapshot(
      query(collection(db, 'documents'), where('userId', '==', user.uid)),
      (snap) => {
        setOwnDocuments(
          snap.docs.map((d) => ({
            id: d.id,
            ...withDocumentDefaults(d.data() as Omit<ScannedDocument, 'id'>),
          }))
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'documents')
    );

    const unsubDocsShared = onSnapshot(
      query(collection(db, 'documents'), where('memberIds', 'array-contains', user.uid)),
      (snap) => {
        setSharedDocuments(
          snap.docs.map((d) => ({
            id: d.id,
            ...withDocumentDefaults(d.data() as Omit<ScannedDocument, 'id'>),
          }))
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'documents')
    );

    const unsubAccounts = onSnapshot(
      query(collection(db, 'accountRecords'), where('userId', '==', user.uid)),
      (snap) => {
        setOwnAccountRecords(
          snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<AccountRecord, 'id'>) }))
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'accountRecords')
    );

    const unsubAccountsShared = onSnapshot(
      query(collection(db, 'accountRecords'), where('memberIds', 'array-contains', user.uid)),
      (snap) => {
        setSharedAccountRecords(
          snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<AccountRecord, 'id'>) }))
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'accountRecords')
    );

    const unsubCredentials = onSnapshot(
      query(collection(db, 'credentials'), where('ownerId', '==', user.uid)),
      (snap) => {
        setOwnCredentials(
          snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Credential, 'id'>) }))
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'credentials')
    );

    const unsubCredentialsShared = onSnapshot(
      query(collection(db, 'credentials'), where('memberIds', 'array-contains', user.uid)),
      (snap) => {
        setSharedCredentials(
          snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Credential, 'id'>) }))
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'credentials')
    );

    const unsubGiveOwn = onSnapshot(
      query(collection(db, 'giveProposals'), where('ownerIds', 'array-contains', user.uid)),
      (snap) => {
        setGiveProposalsOwn(
          snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<GiveProposal, 'id'>) }))
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'giveProposals')
    );

    const unsubGiveForMe = onSnapshot(
      query(collection(db, 'giveProposals'), where('toUid', '==', user.uid)),
      (snap) => {
        setGiveProposalsForMe(
          snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<GiveProposal, 'id'>) }))
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'giveProposals')
    );

    const unsubDirOwn = onSnapshot(
      query(collection(db, 'directoryEntries'), where('userId', '==', user.uid)),
      (snap) => {
        setOwnDirectoryEntries(
          snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<DirectoryEntry, 'id'>) }))
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'directoryEntries')
    );

    const unsubDirShared = onSnapshot(
      query(collection(db, 'directoryEntries'), where('memberIds', 'array-contains', user.uid)),
      (snap) => {
        setSharedDirectoryEntries(
          snap.docs
            .map((d) => ({ id: d.id, ...(d.data() as Omit<DirectoryEntry, 'id'>) }))
            .filter((e) => e.userId !== user.uid)
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'directoryEntries')
    );

    const unsubSheetOwn = onSnapshot(
      query(collection(db, 'emergencySheets'), where('userId', '==', user.uid)),
      (snap) => {
        setOwnEmergencySheets(
          snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<EmergencySheet, 'id'>) }))
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'emergencySheets')
    );

    const unsubSheetShared = onSnapshot(
      query(collection(db, 'emergencySheets'), where('memberIds', 'array-contains', user.uid)),
      (snap) => {
        setSharedEmergencySheets(
          snap.docs
            .map((d) => ({ id: d.id, ...(d.data() as Omit<EmergencySheet, 'id'>) }))
            .filter((e) => e.userId !== user.uid)
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'emergencySheets')
    );

    const unsubMemories = onSnapshot(
      query(collection(db, 'voiceMemories'), where('userId', '==', user.uid)),
      (snap) => {
        setVoiceMemories(
          snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<VoiceMemoryState, 'id'>) }))
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'voiceMemories')
    );

    const unsubJasonNotes = onSnapshot(
      query(collection(db, 'jasonNotes'), where('userId', '==', user.uid)),
      (snap) => {
        setOwnJasonNotes(
          snap.docs.map((d) => ({
            id: d.id,
            ...withJasonNoteDefaults(d.data() as Omit<JasonNote, 'id'>),
          }))
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'jasonNotes')
    );

    const unsubJasonNotesShared = onSnapshot(
      query(collection(db, 'jasonNotes'), where('memberIds', 'array-contains', user.uid)),
      (snap) => {
        setSharedJasonNotes(
          snap.docs.map((d) => ({
            id: d.id,
            ...withJasonNoteDefaults(d.data() as Omit<JasonNote, 'id'>),
          }))
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'jasonNotes')
    );

    const unsubBriefings = onSnapshot(
      query(collection(db, 'briefings'), where('userId', '==', user.uid)),
      (snap) => {
        setOwnBriefings(
          snap.docs.map((d) => ({
            id: d.id,
            ...withBriefingDefaults(d.data() as Omit<MorningBriefing, 'id'>),
          }))
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'briefings')
    );

    const unsubBriefingsShared = onSnapshot(
      query(collection(db, 'briefings'), where('memberIds', 'array-contains', user.uid)),
      (snap) => {
        setSharedBriefings(
          snap.docs.map((d) => ({
            id: d.id,
            ...withBriefingDefaults(d.data() as Omit<MorningBriefing, 'id'>),
          }))
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'briefings')
    );

    const unsubMailBriefings = onSnapshot(
      query(collection(db, 'mailBriefings'), where('userId', '==', user.uid)),
      (snap) => {
        setOwnMailBriefings(
          snap.docs.map((d) => ({
            id: d.id,
            ...withMailBriefingDefaults(d.data() as Omit<MailBriefing, 'id'>),
          }))
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'mailBriefings')
    );

    const unsubCircleBriefings = onSnapshot(
      query(collection(db, 'circleBriefings'), where('userId', '==', user.uid)),
      (snap) => {
        setOwnCircleBriefings(
          snap.docs.map((d) => ({
            id: d.id,
            ...withCircleBriefingDefaults(d.data() as Omit<CircleBriefing, 'id'>),
          }))
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'circleBriefings')
    );

    const unsubFamilies = onSnapshot(
      query(collection(db, 'families'), where('memberIds', 'array-contains', user.uid)),
      (snap) => {
        setFamilies(
          snap.docs.map((d) => ({
            id: d.id,
            ...withFamilyDefaults(d.data() as Omit<Family, 'id'>),
          }))
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'families')
    );

    const unsubCircles = onSnapshot(
      query(collection(db, 'circles'), where('memberIds', 'array-contains', user.uid)),
      (snap) => {
        setCircles(
          snap.docs.map((d) => ({
            id: d.id,
            ...withCircleDefaults(d.data() as Omit<Circle, 'id'>),
          }))
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'circles')
    );

    const unsubProjects = onSnapshot(
      query(collection(db, 'projects'), where('participantIds', 'array-contains', user.uid)),
      (snap) => {
        const list = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<SharedProject, 'id'>),
        }));
        setProjects(list);
        if (list.length > 0 && !selectedProjectId) {
          setSelectedProjectId(list[0].projectId);
        }
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'projects')
    );

    const userEmailLower = (user.email || '').toLowerCase();
    const unsubInvitesEmail = userEmailLower
      ? onSnapshot(
          query(
            collection(db, 'projectInvites'),
            where('targetEmailLower', '==', userEmailLower),
            where('status', '==', 'pending')
          ),
          (snap) => {
            const byEmail = snap.docs.map((d) => ({
              id: d.id,
              ...(d.data() as Omit<ProjectInvite, 'id'>),
            }));
            setIncomingInvites((prev) => {
              const map = new Map<string, ProjectInvite>();
              prev.filter((p) => p.targetUid === user.uid).forEach((p) => map.set(p.id, p));
              byEmail.forEach((p) => map.set(p.id, p));
              return Array.from(map.values());
            });
          },
          (err) => handleFirestoreError(err, OperationType.LIST, 'projectInvites')
        )
      : () => {};

    const unsubInvitesUid = onSnapshot(
      query(
        collection(db, 'projectInvites'),
        where('targetUid', '==', user.uid),
        where('status', '==', 'pending')
      ),
      (snap) => {
        const byUid = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<ProjectInvite, 'id'>),
        }));
        setIncomingInvites((prev) => {
          const map = new Map<string, ProjectInvite>();
          prev.filter((p) => p.targetEmailLower === userEmailLower).forEach((p) => map.set(p.id, p));
          byUid.forEach((p) => map.set(p.id, p));
          return Array.from(map.values());
        });
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'projectInvites')
    );

    const unsubNotifications = onSnapshot(
      query(collection(db, 'notifications'), where('recipientUid', '==', user.uid)),
      (snap) => {
        const items = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<AppNotification, 'id'>),
        }));
        setNotifications(items.reverse());
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'notifications')
    );

    const unsubPropertyEntries = onSnapshot(
      query(collection(db, 'propertyEntries'), where('userId', '==', user.uid)),
      (snap) => {
        setOwnPropertyEntries(
          snap.docs.map((d) => ({
            id: d.id,
            ...withHouseholdDefaults(d.data() as Omit<PropertyEntry, 'id'>),
          }))
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'propertyEntries')
    );

    const unsubPropertyShared = onSnapshot(
      query(collection(db, 'propertyEntries'), where('memberIds', 'array-contains', user.uid)),
      (snap) => {
        setSharedPropertyEntries(
          snap.docs.map((d) => ({
            id: d.id,
            ...withHouseholdDefaults(d.data() as Omit<PropertyEntry, 'id'>),
          }))
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'propertyEntries')
    );

    const unsubFinanceEntries = onSnapshot(
      query(collection(db, 'financeEntries'), where('userId', '==', user.uid)),
      (snap) => {
        setOwnFinanceEntries(
          snap.docs.map((d) => ({
            id: d.id,
            ...withFinanceDefaults(d.data() as Omit<FinanceEntry, 'id'>),
          }))
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'financeEntries')
    );

    const unsubFinanceShared = onSnapshot(
      query(collection(db, 'financeEntries'), where('memberIds', 'array-contains', user.uid)),
      (snap) => {
        setSharedFinanceEntries(
          snap.docs.map((d) => ({
            id: d.id,
            ...withFinanceDefaults(d.data() as Omit<FinanceEntry, 'id'>),
          }))
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'financeEntries')
    );

    const unsubHouseholds = onSnapshot(
      query(collection(db, 'households'), where('memberIds', 'array-contains', user.uid)),
      (snap) => {
        setHouseholds(
          snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Household, 'id'>) }))
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'households')
    );

    const unsubJoinableHouseholds = userEmailLower
      ? onSnapshot(
          query(
            collection(db, 'households'),
            where('invitedEmails', 'array-contains', userEmailLower)
          ),
          (snap) => {
            setJoinableHouseholds(
              snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Household, 'id'>) }))
            );
          },
          (err) => handleFirestoreError(err, OperationType.LIST, 'households')
        )
      : () => {};

    return () => {
      unsubProfile();
      unsubTasks();
      unsubTasksShared();
      unsubDocs();
      unsubDocsShared();
      unsubAccounts();
      unsubAccountsShared();
      unsubCredentials();
      unsubCredentialsShared();
      unsubGiveOwn();
      unsubGiveForMe();
      unsubDirOwn();
      unsubSheetOwn();
      unsubSheetShared();
      unsubDirShared();
      unsubMemories();
      unsubJasonNotes();
      unsubJasonNotesShared();
      unsubBriefings();
      unsubBriefingsShared();
      unsubMailBriefings();
      unsubCircleBriefings();
      unsubFamilies();
      unsubCircles();

  // Family recovery (Jason, 2026-11-21): reset requests for my
  // families, and the public wrap keys of their account holders.
  useEffect(() => {
    if (!user || families.length === 0) {
      setResetRequests([]);
      return;
    }
    const ids = families.map((f) => f.id).slice(0, 10);
    const unsub = onSnapshot(
      query(collection(db, 'resetRequests'), where('familyId', 'in', ids)),
      (snap) => {
        setResetRequests(
          snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ResetRequest, 'id'>) }))
        );
      },
      () => {}
    );
    return () => unsub();
  }, [user, families]);

  useEffect(() => {
    if (!user || families.length === 0) return;
    const memberUids = Array.from(new Set(families.flatMap((f) => f.memberIds))).slice(0, 30);
    if (memberUids.length === 0) return;
    const unsub = onSnapshot(
      query(collection(db, 'wrapKeys'), where('userId', 'in', memberUids)),
      (snap) => {
        const map: Record<string, string> = {};
        snap.docs.forEach((d) => {
          const data = d.data() as { userId?: string; publicKey?: string };
          if (data.userId && data.publicKey) map[data.userId] = data.publicKey;
        });
        setWrapKeyMap(map);
      },
      () => {}
    );
    return () => unsub();
  }, [user, families]);

  // Once the vault opens, this device's wrap keypair exists and is
  // loaded — family recovery rides on it.
  useEffect(() => {
    if (vaultUnlockedState && userProfile?.vaultSalt) {
      void ensureWrapKeypairPersisted();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vaultUnlockedState]);

  useEffect(() => {
    if (!vaultUnlockedState) setRevealedPasswords({});
  }, [vaultUnlockedState]);

  // Load my families' recovery keys from my wraps when possible.
  useEffect(() => {
    if (!user || !wrapReady) return;
    for (const f of families) {
      const wrap = f.recovery?.wraps?.[user.uid];
      if (wrap && !getFamilyRecoveryKey(f.id)) {
        void loadFamilyRecoveryKeyFromWrap(f.id, wrap);
      }
    }
  }, [user, families, wrapReady]);
      unsubProjects();
      unsubInvitesEmail();
      unsubInvitesUid();
      unsubNotifications();
      unsubPropertyEntries();
      unsubPropertyShared();
      unsubFinanceEntries();
      unsubFinanceShared();
      unsubHouseholds();
      unsubJoinableHouseholds();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authReady, user]);

  // Listen to selected project members and tasks
  useEffect(() => {
    if (!authReady || !user || !selectedProjectId) {
      setProjectMembers([]);
      setProjectTasks([]);
      return;
    }

    const unsubMembers = onSnapshot(
      query(
        collection(db, 'projects', selectedProjectId, 'members'),
        where('participantIds', 'array-contains', user.uid)
      ),
      (snap) => {
        setProjectMembers(
          snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ProjectMember, 'id'>) }))
        );
      },
      (err) =>
        handleFirestoreError(err, OperationType.LIST, `projects/${selectedProjectId}/members`)
    );

    const unsubProjectTasks = onSnapshot(
      query(
        collection(db, 'projects', selectedProjectId, 'tasks'),
        where('participantIds', 'array-contains', user.uid)
      ),
      (snap) => {
        setProjectTasks(
          snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ProjectTask, 'id'>) }))
        );
      },
      (err) =>
        handleFirestoreError(err, OperationType.LIST, `projects/${selectedProjectId}/tasks`)
    );

    return () => {
      unsubMembers();
      unsubProjectTasks();
    };
  }, [authReady, user, selectedProjectId]);

  // Household: merged views (own records + records shared with me)
  const activeHousehold =
    households.find((h) => h.householdId === selectedHouseholdId) ??
    households[0] ??
    null;

  function switchHousehold(householdId: string) {
    setSelectedHouseholdId(householdId);
    if (user) {
      try {
        localStorage.setItem(`steward-active-household-${user.uid}`, householdId);
      } catch {
        // Storage unavailable; the choice still holds for this session.
      }
    }
  }

  function switchPlace(place: string) {
    setSelectedPlace(place);
    if (user) {
      try {
        localStorage.setItem(`steward-place-${user.uid}`, place);
      } catch {
        // Storage unavailable; the choice still holds for this session.
      }
    }
  }

  // Restore the household this person was last viewing on this device.
  useEffect(() => {
    if (!user) return;
    try {
      const saved = localStorage.getItem(`steward-active-household-${user.uid}`);
      if (saved) setSelectedHouseholdId(saved);
    } catch {
      // Storage unavailable; fall back to the first household.
    }
  }, [user]);
  // Restore the place this person was last viewing on this device.
  useEffect(() => {
    if (!user) return;
    try {
      const saved = localStorage.getItem(`steward-place-${user.uid}`);
      if (saved !== null) setSelectedPlace(saved);
    } catch {
      // Storage unavailable; show all places.
    }
  }, [user]);

  const tasks = useMemo(
    () => mergeRecordsById(ownTasks, sharedTasks),
    [ownTasks, sharedTasks]
  );
  const documents = useMemo(
    () => mergeRecordsById(ownDocuments, sharedDocuments),
    [ownDocuments, sharedDocuments]
  );
  const accountRecords = useMemo(
    () => mergeRecordsById(ownAccountRecords, sharedAccountRecords),
    [ownAccountRecords, sharedAccountRecords]
  );
  const credentials = useMemo(
    () => mergeRecordsById(ownCredentials, sharedCredentials),
    [ownCredentials, sharedCredentials]
  );
  const giveProposals = useMemo(
    () => mergeRecordsById(giveProposalsOwn, giveProposalsForMe),
    [giveProposalsOwn, giveProposalsForMe]
  );
  const directoryEntries = useMemo(
    () => mergeRecordsById(ownDirectoryEntries, sharedDirectoryEntries),
    [ownDirectoryEntries, sharedDirectoryEntries]
  );

  const emergencySheets = useMemo(
    () => mergeRecordsById(ownEmergencySheets, sharedEmergencySheets),
    [ownEmergencySheets, sharedEmergencySheets]
  );

  const propertyEntries = useMemo(
    () => mergeRecordsById(ownPropertyEntries, sharedPropertyEntries),
    [ownPropertyEntries, sharedPropertyEntries]
  );
  const financeEntries = useMemo(
    () => mergeRecordsById(ownFinanceEntries, sharedFinanceEntries),
    [ownFinanceEntries, sharedFinanceEntries]
  );
  const jasonNotes = useMemo(
    () => mergeRecordsById(ownJasonNotes, sharedJasonNotes),
    [ownJasonNotes, sharedJasonNotes]
  );
  const giveRows = useMemo(() => {
    if (!user) return [];
    const rows: Array<{
      collectionName: GiveProposal['collectionName'];
      rec: GiveRecordShape;
      title: string;
      kind: string;
    }> = [
      ...documents.map((d) => ({
        collectionName: 'documents' as const,
        rec: d as unknown as GiveRecordShape,
        title: d.title,
        kind: 'Paper',
      })),
      ...tasks.map((t) => ({
        collectionName: 'tasks' as const,
        rec: t as unknown as GiveRecordShape,
        title: t.title,
        kind: 'Task',
      })),
      ...propertyEntries.map((e) => ({
        collectionName: 'propertyEntries' as const,
        rec: e as unknown as GiveRecordShape,
        title: e.title,
        kind: 'Property record',
      })),
      ...financeEntries.map((e) => ({
        collectionName: 'financeEntries' as const,
        rec: e as unknown as GiveRecordShape,
        title: e.title,
        kind: 'Money record',
      })),
      ...jasonNotes.map((n) => ({
        collectionName: 'jasonNotes' as const,
        rec: n as unknown as GiveRecordShape,
        title: n.text.slice(0, 60),
        kind: 'Note',
      })),
      ...accountRecords.map((a) => ({
        collectionName: 'accountRecords' as const,
        rec: a as unknown as GiveRecordShape,
        title: a.title,
        kind: 'Account',
      })),
    ];
    return rows.filter((row) => ownersOf(row.rec).includes(user.uid));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, documents, tasks, propertyEntries, financeEntries, jasonNotes, accountRecords]);
  const briefings = useMemo(
    () => mergeRecordsById(ownBriefings, sharedBriefings),
    [ownBriefings, sharedBriefings]
  );

  // What the views show: my private records plus the active household's.
  // The full merged lists above still feed Drive backup, restore, and the
  // membership sync, which work across every household I belong to.
  const householdInScope = (hid: string) =>
    !hid ||
    !activeHousehold ||
    hid === activeHousehold.householdId ||
    !households.some((h) => h.householdId === hid);
  // Whether a circle-scoped record reaches me through its circles
  // (Jason, 2026-11-21): the head's omissions bind here — a circle
  // that omitted me from its views, or omitted this kind of record,
  // does not carry the record to me. My own deposits always reach
  // me. New stamps already leave omitted viewers out; this covers
  // stamps written before an omission existed.
  function memberDisplayName(uid: string): string {
    if (user && uid === user.uid) return 'You';
    return householdMembers.find((m) => m.userId === uid)?.displayName || 'A member';
  }

  function circleRecordVisible(
    rec: { userId: string; circleIds?: string[]; recordKind?: RecordKind },
    kind: 'tasks' | 'documents' | 'finances' | 'property' | 'notes'
  ): boolean {
    if (!user || rec.userId === user.uid) return true;
    const ids = rec.circleIds || [];
    if (ids.length === 0) return true;
    // Omissions speak the record kinds (Jason, 2026-11-21):
    // Financial, Medical, Calendar Event, Personal, Customizable.
    const effKind = effectiveRecordKind(kind, rec);
    return ids.some((cid) => {
      const c = circles.find((x) => x.id === cid);
      if (!c || !c.memberIds.includes(user.uid)) return false;
      if ((c.omitViewIds || []).includes(user.uid)) return false;
      if ((c.omitKinds || []).includes(effKind)) return false;
      return true;
    });
  }

  // Whether a family-scoped record reaches me (Jason, 2026-11-21):
  // outside the calendar, the family stream is the gate — a member
  // on the family's not-yet list does not see money, papers,
  // property, or notes aimed at the family. The calendar itself is
  // the exception: children see it. My own deposits always reach me.
  function familyRecordVisible(rec: { userId: string; familyId?: string }): boolean {
    if (!user || rec.userId === user.uid) return true;
    const fam = families.find((f) => f.id === (rec.familyId || ''));
    if (!fam) return true;
    return !(fam.notYetIds || []).includes(user.uid);
  }

  // Sealed records (Jason, 2026-11-21): while the owner's vault is
  // unlocked on this device, sealed text is opened for display; while
  // it is locked, display copies carry the envelope only — title,
  // kind, place, date — with the words blanked, so no screen and no
  // briefing ever shows sealed gibberish. Stored records are never
  // touched by this; it is a display layer only, and every list below
  // reads from it.
  const [vaultUnlockedState, setVaultUnlockedState] = useState(isVaultUnlocked());
  useEffect(() => subscribeVault(() => setVaultUnlockedState(isVaultUnlocked())), []);
  const [vaultPass, setVaultPass] = useState('');
  const [vaultPassConfirm, setVaultPassConfirm] = useState('');
  const [vaultFeedback, setVaultFeedback] = useState<string | null>(null);
  const [vaultRecovered, setVaultRecovered] = useState(false);
  const [recoverySaved, setRecoverySaved] = useState(false);
  const [recoveryKeyInHand, setRecoveryKeyInHand] = useState(false);
  const [recoveryBusy, setRecoveryBusy] = useState(false);
  const [vaultNewPass, setVaultNewPass] = useState('');
  const [vaultNewPassConfirm, setVaultNewPassConfirm] = useState('');
  const [showChangePass, setShowChangePass] = useState(false);
  const [vaultReplacePass, setVaultReplacePass] = useState('');
  const sealedKindsNow = effectiveSealedKinds(userProfile);
  const sealIfText = async (v: string) => (v && !isSealedValue(v) ? await sealText(v) : v);
  const [unsealedTasks, setUnsealedTasks] = useState<ScheduleTask[]>([]);
  const [unsealedDocuments, setUnsealedDocuments] = useState<ScannedDocument[]>([]);
  const [unsealedPropertyEntries, setUnsealedPropertyEntries] = useState<PropertyEntry[]>([]);
  const [unsealedFinanceEntries, setUnsealedFinanceEntries] = useState<FinanceEntry[]>([]);
  useEffect(() => {
    let live = true;
    void (async () => {
      if (!vaultUnlockedState) {
        if (live) {
          setUnsealedTasks(tasks);
          setUnsealedDocuments(
            documents.map((d) =>
              d.encrypted ? { ...d, ocrText: '', summary: '', keyDetails: [], notes: '' } : d
            )
          );
          setUnsealedPropertyEntries(
            propertyEntries.map((e) => (e.encrypted ? { ...e, notes: '' } : e))
          );
          setUnsealedFinanceEntries(
            financeEntries.map((e) => (e.encrypted ? { ...e, notes: '' } : e))
          );
        }
        return;
      }
      const unsealField = async (v: string) =>
        isSealedValue(v) ? await unsealText(v).catch(() => v) : v;
      const [t, d, pe, fe] = await Promise.all([
        Promise.all(
          tasks.map(async (r) => (r.encrypted ? { ...r, notes: await unsealField(r.notes) } : r))
        ),
        Promise.all(
          documents.map(async (r) =>
            r.encrypted
              ? {
                  ...r,
                  ocrText: await unsealField(r.ocrText),
                  summary: await unsealField(r.summary),
                  keyDetails: await Promise.all(r.keyDetails.map(unsealField)),
                  notes: await unsealField(r.notes),
                }
              : r
          )
        ),
        Promise.all(
          propertyEntries.map(async (r) =>
            r.encrypted ? { ...r, notes: await unsealField(r.notes) } : r
          )
        ),
        Promise.all(
          financeEntries.map(async (r) =>
            r.encrypted ? { ...r, notes: await unsealField(r.notes) } : r
          )
        ),
      ]);
      if (live) {
        setUnsealedTasks(t);
        setUnsealedDocuments(d);
        setUnsealedPropertyEntries(pe);
        setUnsealedFinanceEntries(fe);
      }
    })();
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, documents, propertyEntries, financeEntries, vaultUnlockedState]);

  const visibleTasks = useMemo(
    () =>
      unsealedTasks.filter(
        (t) =>
          householdInScope(t.householdId) ||
          (t.scope &&
            t.scope !== 'household' &&
            (t.scope !== 'circles' || circleRecordVisible(t, 'tasks')))
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [unsealedTasks, activeHousehold, households]
  );
  const visibleDocuments = useMemo(
    () =>
      unsealedDocuments.filter(
        (d) =>
          householdInScope(d.householdId) ||
          (d.scope &&
            d.scope !== 'household' &&
            (d.scope !== 'circles' || circleRecordVisible(d, 'documents')) &&
            (d.scope !== 'family' || familyRecordVisible(d)))
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [unsealedDocuments, activeHousehold, households]
  );
  const visiblePropertyEntries = useMemo(
    () =>
      unsealedPropertyEntries.filter(
        (e) =>
          householdInScope(e.householdId) ||
          (e.scope &&
            e.scope !== 'household' &&
            (e.scope !== 'circles' || circleRecordVisible(e, 'property')) &&
            (e.scope !== 'family' || familyRecordVisible(e)))
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [unsealedPropertyEntries, activeHousehold, households]
  );
  const visibleFinanceEntries = useMemo(
    () =>
      unsealedFinanceEntries.filter((e) => {
        if (householdInScope(e.householdId)) return true;
        if (!e.scope || e.scope === 'household') return false;
        if (e.scope === 'family') return familyRecordVisible(e);
        if (e.scope !== 'circles') return true;
        if (!circleRecordVisible(e, 'finances')) return false;
        // Money through circles needs the origin household head's
        // switch (Jason, 2026-11-21): caution is the default, and an
        // unknown origin household counts as off. My own entries
        // always reach me.
        if (user && e.userId === user.uid) return true;
        const origin = households.find((h) => h.householdId === e.householdId);
        return Boolean(origin?.allowPartnerFinances);
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [unsealedFinanceEntries, activeHousehold, households]
  );
  const visibleJasonNotes = useMemo(
    () =>
      jasonNotes.filter(
        (n) =>
          householdInScope(n.householdId) ||
          (n.scope &&
            n.scope !== 'household' &&
            (n.scope !== 'circles' || circleRecordVisible(n, 'notes')) &&
            (n.scope !== 'family' || familyRecordVisible(n)))
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [jasonNotes, activeHousehold, households]
  );
  const visibleBriefings = useMemo(
    () => briefings.filter((b) => householdInScope(b.householdId)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [briefings, activeHousehold, households]
  );
  const todaysBriefing = useMemo(
    () => visibleBriefings.find((b) => b.dateKey === localDateKey()) || null,
    [visibleBriefings]
  );
  const todaysMailBriefing = useMemo(
    () => ownMailBriefings.find((b) => b.dateKey === localDateKey()) || null,
    [ownMailBriefings]
  );
  const todaysCircleBriefing = useMemo(
    () => ownCircleBriefings.find((b) => b.dateKey === localDateKey()) || null,
    [ownCircleBriefings]
  );
  const activeFamily = useMemo(
    () =>
      activeHousehold?.familyId
        ? families.find((f) => f.id === activeHousehold.familyId) || null
        : null,
    [families, activeHousehold]
  );
  const visibilityOptions = useMemo(() => {
    const opts: Array<{ value: string; label: string }> = [
      { value: 'household', label: 'Household' },
      { value: 'private', label: 'Just me' },
    ];
    if (activeFamily) {
      opts.push({ value: `family:${activeFamily.id}`, label: `Family — ${activeFamily.name}` });
    }
    circles
      .filter((c) => !c.temporary || !c.expiresAtKey || c.expiresAtKey >= localDateKey())
      .forEach((c) => opts.push({ value: `circle:${c.id}`, label: `Circle — ${c.name}` }));
    return opts;
  }, [activeFamily, circles]);

  // The place filter: choosing a branch shows that branch and everything
  // under it; '' is Mom's whole desk, the master copy. Backup, restore,
  // and the membership sync keep the wider lists above.
  const displayTasks = useMemo(
    () => visibleTasks.filter((t) => placeMatches(t.place || '', selectedPlace)),
    [visibleTasks, selectedPlace]
  );
  const displayDocuments = useMemo(
    () => visibleDocuments.filter((d) => placeMatches(d.place || '', selectedPlace)),
    [visibleDocuments, selectedPlace]
  );
  const displayPropertyEntries = useMemo(
    () => visiblePropertyEntries.filter((e) => placeMatches(e.place || '', selectedPlace)),
    [visiblePropertyEntries, selectedPlace]
  );
  const displayFinanceEntries = useMemo(
    () => visibleFinanceEntries.filter((e) => placeMatches(e.place || '', selectedPlace)),
    [visibleFinanceEntries, selectedPlace]
  );

  const activeHouseholdId = activeHousehold?.householdId ?? null;

  // Household members of the active household
  useEffect(() => {
    if (!authReady || !user || !activeHouseholdId) {
      setHouseholdMembers([]);
      return;
    }
    const unsub = onSnapshot(
      query(
        collection(db, 'households', activeHouseholdId, 'members'),
        where('memberIds', 'array-contains', user.uid)
      ),
      (snap) => {
        setHouseholdMembers(
          snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<HouseholdMember, 'id'>) }))
        );
      },
      (err) =>
        handleFirestoreError(err, OperationType.LIST, `households/${activeHouseholdId}/members`)
    );
    return () => unsub();
  }, [authReady, user, activeHouseholdId]);

  // Membership sync: when the household member list changes, bring every
  // household record's stamped member list up to date (rules allow only this
  // exact replacement, and only for household members).
  const lastHouseholdSyncRef = useRef<string>('');
  useEffect(() => {
    if (!user || !activeHousehold) return;
    const hid = activeHousehold.householdId;
    const members = activeHousehold.memberIds;
    const signature = `${hid}|${members.join(',')}`;
    if (lastHouseholdSyncRef.current === signature) return;
    const stale = (
      recs: Array<{ id: string; householdId?: string; memberIds?: string[] }>
    ) =>
      recs.filter(
        (r) => r.householdId === hid && (r.memberIds || []).join(',') !== members.join(',')
      );
    const staleTasks = stale(tasks);
    const staleDocs = stale(documents);
    const staleProps = stale(propertyEntries);
    const staleFins = stale(financeEntries);
    const staleMembers = householdMembers.filter(
      (m) => (m.memberIds || []).join(',') !== members.join(',')
    );
    if (
      staleTasks.length === 0 &&
      staleDocs.length === 0 &&
      staleProps.length === 0 &&
      staleFins.length === 0 &&
      staleMembers.length === 0
    ) {
      lastHouseholdSyncRef.current = signature;
      return;
    }
    lastHouseholdSyncRef.current = signature;
    (async () => {
      const jobs: Array<Promise<unknown>> = [];
      staleTasks.forEach((r) =>
        jobs.push(
          updateDoc(doc(db, 'tasks', r.id), {
            memberIds: members,
            updatedAt: serverTimestamp(),
          })
        )
      );
      staleDocs.forEach((r) =>
        jobs.push(
          updateDoc(doc(db, 'documents', r.id), {
            memberIds: members,
            updatedAt: serverTimestamp(),
          })
        )
      );
      staleProps.forEach((r) =>
        jobs.push(
          updateDoc(doc(db, 'propertyEntries', r.id), {
            memberIds: members,
            updatedAt: serverTimestamp(),
          })
        )
      );
      staleFins.forEach((r) =>
        jobs.push(
          updateDoc(doc(db, 'financeEntries', r.id), {
            memberIds: members,
            updatedAt: serverTimestamp(),
          })
        )
      );
      staleMembers.forEach((m) =>
        jobs.push(
          updateDoc(doc(db, 'households', hid, 'members', m.id), {
            memberIds: members,
            updatedAt: serverTimestamp(),
          })
        )
      );
      await Promise.allSettled(jobs);
    })();
  }, [user, activeHousehold, tasks, documents, propertyEntries, financeEntries, householdMembers]);

  // Active Reminder Banner computation
  const activeReminders = useMemo(() => {
    const todayIso = getLocalTodayIso();
    const now = new Date();
    return displayTasks.filter((t) => {
      if (t.status !== 'pending' || dismissedReminders[t.id]) return false;
      if (t.dueDate < todayIso) return true;
      if (t.dueDate === todayIso) {
        if (!t.dueTime) return true;
        const [hh, mm] = t.dueTime.split(':').map(Number);
        const dueDt = new Date();
        dueDt.setHours(hh || 9, mm || 0, 0, 0);
        const remindAt = new Date(dueDt.getTime() - t.reminderMinutes * 60000);
        return now >= remindAt;
      }
      // Also surface upcoming tasks with >= 1 day reminder whose reminder window starts today
      const [y, m, d] = t.dueDate.split('-').map(Number);
      const dueDateObj = new Date(y, m - 1, d, 9, 0, 0);
      const remindAt = new Date(dueDateObj.getTime() - t.reminderMinutes * 60000);
      return now >= remindAt;
    });
  }, [displayTasks, dismissedReminders]);

  // ---------------------------------------------------------------------------
  // Firestore CRUD Handlers (strictly matching firebase-blueprint.json & rules)
  // ---------------------------------------------------------------------------
  function householdStamp(): { householdId: string; memberIds: string[] } {
    if (activeHousehold && shareWithHousehold) {
      return {
        householdId: activeHousehold.householdId,
        memberIds: activeHousehold.memberIds.slice(0, 25),
      };
    }
    return { householdId: '', memberIds: user ? [user.uid] : [] };
  }

  // The audience for a set of visibility tags (Jason, 2026-11-20):
  // computes the memberIds snapshot the rules will check, for the
  // ring or circles named. Returns null when the tags name something
  // the writer can't use — a family they're not counted in, a circle
  // they don't hold — and the caller keeps the existing stamp. The
  // depositor is always in the audience and always the owner.
  function audienceFor(
    scope: string | undefined,
    familyId: string | undefined,
    circleIds: string[] | undefined,
    originHouseholdId: string,
    kind: string = 'tasks'
  ): { householdId: string; memberIds: string[]; scopeFields: Record<string, unknown> } | null {
    if (!user) return null;
    if (scope === 'private') {
      return {
        householdId: originHouseholdId,
        memberIds: [user.uid],
        scopeFields: { scope: 'private', familyId: '', circleIds: [] },
      };
    }
    if (scope === 'family') {
      const fam = families.find((f) => f.id === (familyId || '')) || activeFamily;
      if (!fam || !fam.memberIds.includes(user.uid)) return null;
      // The responsible age at work (Jason, 2026-11-21): children
      // see the family calendar, so a task is stamped to the whole
      // roster — but a child writes one only when a parent has
      // granted it. Everything else is stamped to the stream alone
      // (the roster minus the not-yet list), and a not-yet member
      // cannot write it at all.
      const notYet = fam.notYetIds || [];
      const iAmNotYet = notYet.includes(user.uid);
      if (kind === 'tasks') {
        if (iAmNotYet && !(fam.childWriterIds || []).includes(user.uid)) return null;
        return {
          householdId: originHouseholdId,
          memberIds: fam.memberIds.slice(0, 100),
          scopeFields: { scope: 'family', familyId: fam.id, circleIds: [] },
        };
      }
      if (iAmNotYet) return null;
      return {
        householdId: originHouseholdId,
        memberIds: fam.memberIds.filter((id) => !notYet.includes(id)).slice(0, 100),
        scopeFields: { scope: 'family', familyId: fam.id, circleIds: [] },
      };
    }
    if (scope === 'circles' && circleIds?.length) {
      const ids = circleIds.slice(0, 4);
      const audience = new Set<string>([user.uid]);
      for (const cid of ids) {
        const c = circles.find((x) => x.id === cid);
        if (!c || !c.memberIds.includes(user.uid)) return null;
        // The head's omissions (Jason, 2026-11-21): a circle that
        // omits my writes takes no submissions from me, and people
        // omitted from its views are left out of the stamp. My own
        // deposit always stays visible to me — ownership first.
        if ((c.omitWriteIds || []).includes(user.uid)) return null;
        c.memberIds.forEach((m) => audience.add(m));
        (c.omitViewIds || []).forEach((m) => {
          if (m !== user.uid) audience.delete(m);
        });
      }
      return {
        householdId: originHouseholdId,
        memberIds: [...audience].slice(0, 100),
        scopeFields: { scope: 'circles', familyId: '', circleIds: ids },
      };
    }
    if (scope === 'household') {
      const stamp = householdStamp();
      return {
        householdId: stamp.householdId,
        memberIds: stamp.memberIds,
        scopeFields: { scope: 'household', familyId: '', circleIds: [] },
      };
    }
    return null;
  }

  async function handleCreateTask(
    payload: Omit<
      ScheduleTask,
      | 'id'
      | 'userId'
      | 'createdAt'
      | 'updatedAt'
      | 'completedAtIso'
      | 'status'
      | 'householdId'
      | 'memberIds'
    >
  ) {
    if (!user) return;
    const id = createSafeId('task');
    let stamp = householdStamp();
    let scopeFields: Record<string, unknown> = {};
    if (payload.scope) {
      const aimed = audienceFor(
        payload.scope,
        payload.familyId,
        payload.circleIds,
        activeHousehold?.householdId || ''
      );
      if (aimed) {
        stamp = { householdId: aimed.householdId, memberIds: aimed.memberIds };
        scopeFields = aimed.scopeFields;
      }
    }
    const taskSealed = sealedKindsNow.includes('calendar') && isVaultUnlocked();
    const taskNotes = taskSealed
      ? await sealIfText((payload.notes || '').slice(0, 2000))
      : (payload.notes || '').slice(0, 2000);
    try {
      await setDoc(doc(db, 'tasks', id), {
        userId: user.uid,
        householdId: stamp.householdId,
        memberIds: stamp.memberIds,
        ...scopeFields,
        title: payload.title.slice(0, 200),
        type: payload.type,
        category: payload.category,
        place: (payload.place || '').slice(0, 60),
        dueDate: payload.dueDate,
        dueTime: (payload.dueTime || '').slice(0, 10),
        estimatedMinutes: Math.max(5, Math.min(1440, payload.estimatedMinutes || 30)),
        reminderMinutes: Math.max(0, Math.min(43200, payload.reminderMinutes ?? 60)),
        status: 'pending',
        priority: payload.priority,
        notes: taskNotes,
        helpSteps: (payload.helpSteps || []).slice(0, 15).map((s) => s.slice(0, 400)),
        ...(taskSealed ? { encrypted: true } : {}),
        linkedDocumentId: (payload.linkedDocumentId || '').slice(0, 128),
        completedAtIso: '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `tasks/${id}`);
    }
  }

  async function handleUpdateTask(taskId: string, updates: Partial<ScheduleTask>) {
    if (!user) return;
    try {
      const clean: Record<string, unknown> = { updatedAt: serverTimestamp() };
      const existingRec = tasks.find((r) => r.id === taskId);
      if (existingRec) {
        clean.householdId = existingRec.householdId || '';
        clean.memberIds =
          existingRec.memberIds && existingRec.memberIds.length > 0
            ? existingRec.memberIds
            : [existingRec.userId];
      }

      // Re-aiming a record (Jason, 2026-11-20): only its owner can
      // change who can see it. The audience is recomputed from the
      // tags; the record stays the owner's throughout.
      if (
        existingRec &&
        existingRec.userId === user.uid &&
        (updates.scope !== undefined ||
          updates.circleIds !== undefined ||
          updates.familyId !== undefined)
      ) {
        const aimed = audienceFor(
          updates.scope ?? existingRec.scope,
          updates.familyId ?? existingRec.familyId,
          updates.circleIds ?? existingRec.circleIds,
          existingRec.householdId || ''
        );
        // Only a real change of tags re-aims the record — an edit
        // that leaves the picker where it was must not move the
        // record (the household stamp, for one, follows whichever
        // household is on screen today).
        const tagsChanged =
          (updates.scope ?? existingRec.scope ?? 'household') !==
            (existingRec.scope ?? 'household') ||
          (updates.familyId ?? existingRec.familyId ?? '') !==
            (existingRec.familyId ?? '') ||
          JSON.stringify(updates.circleIds ?? existingRec.circleIds ?? []) !==
            JSON.stringify(existingRec.circleIds ?? []);
        if (aimed && tagsChanged) {
          clean.householdId = aimed.householdId;
          clean.memberIds = aimed.memberIds;
          clean.scope = aimed.scopeFields.scope;
          clean.familyId = aimed.scopeFields.familyId;
          clean.circleIds = aimed.scopeFields.circleIds;
        }
      }

      if (updates.title !== undefined) clean.title = updates.title.slice(0, 200);
      if (updates.type !== undefined) clean.type = updates.type;
      if (updates.category !== undefined) clean.category = updates.category;
      if (updates.dueDate !== undefined) clean.dueDate = updates.dueDate;
      if (updates.dueTime !== undefined) clean.dueTime = updates.dueTime.slice(0, 10);
      if (updates.estimatedMinutes !== undefined)
        clean.estimatedMinutes = Math.max(5, Math.min(1440, updates.estimatedMinutes));
      if (updates.reminderMinutes !== undefined)
        clean.reminderMinutes = Math.max(0, Math.min(43200, updates.reminderMinutes));
      if (updates.priority !== undefined) clean.priority = updates.priority;
      if (updates.notes !== undefined) clean.notes = updates.notes.slice(0, 2000);
      // Sealed note (Jason, 2026-11-21): a sealed record's note is
      // never written from a locked edit, is sealed again on save
      // while the vault is unlocked, and returns to plain when its
      // kind is no longer sealed.
      if (clean.notes !== undefined) {
        if (existingRec?.encrypted && !isVaultUnlocked()) {
          delete clean.notes;
        } else if (isSealedValue(clean.notes as string)) {
          delete clean.notes;
        } else if (sealedKindsNow.includes('calendar')) {
          if (isVaultUnlocked()) {
            clean.notes = await sealIfText(clean.notes as string);
            clean.encrypted = true;
          } else {
            delete clean.notes;
          }
        } else if (existingRec?.encrypted) {
          clean.encrypted = false;
        }
      }
      if (updates.helpSteps !== undefined)
        clean.helpSteps = updates.helpSteps.slice(0, 15).map((s) => s.slice(0, 400));
      if (updates.linkedDocumentId !== undefined)
        clean.linkedDocumentId = updates.linkedDocumentId.slice(0, 128);
      if (updates.place !== undefined) clean.place = updates.place.slice(0, 60);

      await updateDoc(doc(db, 'tasks', taskId), clean);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `tasks/${taskId}`);
    }
  }

  async function handleToggleTaskComplete(task: ScheduleTask) {
    if (!user) return;
    try {
      if (task.status === 'pending') {
        const nowIso = new Date().toISOString();
        await updateDoc(doc(db, 'tasks', task.id), {
          status: 'completed',
          completedAtIso: nowIso,
          householdId: task.householdId || '',
          memberIds:
            task.memberIds && task.memberIds.length > 0 ? task.memberIds : [task.userId],
          updatedAt: serverTimestamp(),
        });
        await handleRecordBehaviorSignal(
          `Completed "${task.title}" (${task.category}, ${task.estimatedMinutes}m, due ${task.dueDate}) on ${getLocalTodayIso()}.`
        );
      } else {
        await updateDoc(doc(db, 'tasks', task.id), {
          status: 'pending',
          completedAtIso: '',
          completionState: deleteField(),
          remainderNote: deleteField(),
          householdId: task.householdId || '',
          memberIds:
            task.memberIds && task.memberIds.length > 0 ? task.memberIds : [task.userId],
          updatedAt: serverTimestamp(),
        });
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `tasks/${task.id}`);
    }
  }

  // Completion with the finished-or-more answer recorded. "More" keeps
  // the remainder on the books: a fresh open item for today, named for
  // what is left, so it surfaces in the ticker and the Today lists
  // instead of vanishing with the done item.
  async function handleCompleteTask(
    task: ScheduleTask,
    completionState: 'finished' | 'more',
    remainderNote: string
  ) {
    if (!user) return;
    try {
      const nowIso = new Date().toISOString();
      await updateDoc(doc(db, 'tasks', task.id), {
        status: 'completed',
        completedAtIso: nowIso,
        completionState,
        remainderNote: completionState === 'more' ? remainderNote.slice(0, 300) : '',
        householdId: task.householdId || '',
        memberIds:
          task.memberIds && task.memberIds.length > 0 ? task.memberIds : [task.userId],
        updatedAt: serverTimestamp(),
      });
      await handleRecordBehaviorSignal(
        `Completed "${task.title}" (${task.category}) on ${getLocalTodayIso()} — ${
          completionState === 'more'
            ? `more to do: ${remainderNote || 'unspecified'}`
            : 'finished'
        }.`
      );
      if (completionState === 'more') {
        await handleCreateTask({
          title: (remainderNote || `More on: ${task.title}`).slice(0, 200),
          category: task.category,
          type: task.type,
          place: task.place || '',
          dueDate: getLocalTodayIso(),
          dueTime: '',
          estimatedMinutes: task.estimatedMinutes,
          reminderMinutes: task.reminderMinutes,
          priority: task.priority,
          notes: `What is left of "${task.title}" — marked done ${getLocalTodayIso()} with more to do.`,
          helpSteps: [],
          linkedDocumentId: '',
        });
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `tasks/${task.id}`);
    }
  }

  async function handleDeleteTask(taskId: string) {
    try {
      await deleteDoc(doc(db, 'tasks', taskId));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `tasks/${taskId}`);
    }
  }

  async function handleRecordBehaviorSignal(signal: string) {
    if (!user || !userProfile) return;
    try {
      const nextSignals = [...userProfile.behaviorSignals, signal.slice(0, 290)].slice(-25);
      await updateDoc(doc(db, 'users', user.uid), {
        behaviorSignals: nextSignals,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${user.uid}`);
    }
  }

  async function handleUpdateFocusPrefs(
    preferredFocusWindow: FocusWindow,
    prefersQuickWinsFirst: boolean
  ) {
    if (!user) return;
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        preferredFocusWindow,
        prefersQuickWinsFirst,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${user.uid}`);
    }
  }

  // Front door handlers (2026-11-20)
  async function handleCreateJasonNote(text: string, source: string) {
    if (!user) return;
    const id = createSafeId('note');
    const stamp = householdStamp();
    try {
      await setDoc(doc(db, 'jasonNotes', id), {
        userId: user.uid,
        householdId: stamp.householdId,
        memberIds: stamp.memberIds,
        text: text.slice(0, 2000),
        source: source.slice(0, 40),
        handled: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `jasonNotes/${id}`);
    }
  }

  // The morning briefing (Jason, 2026-11-20): generated once per
  // household per day — the first person in hears the need, the server
  // makes the one paid-tier call, and the saved briefing serves the
  // whole household from then on. Returns the briefing text, or null
  // when it could not be prepared.
  const briefingInFlightRef = useRef<string>('');
  async function handleEnsureBriefing(): Promise<string | null> {
    if (!user) return null;
    const dateKey = localDateKey();
    const existing = briefings.find(
      (b) => b.dateKey === dateKey && householdInScope(b.householdId)
    );
    if (existing) return existing.text;
    if (briefingInFlightRef.current === dateKey) return null;
    briefingInFlightRef.current = dateKey;
    try {
      const todayK = localDateKey();
      const tomorrowK = localDateKey(new Date(Date.now() + 86400000));
      const keyOf = (iso: string) => (iso || '').slice(0, 10);
      const fmtDay = (key: string) =>
        new Date(`${key}T12:00:00`).toLocaleDateString('en-US', {
          weekday: 'long',
          month: 'long',
          day: 'numeric',
        });
      const line = (t: ScheduleTask) =>
        `- ${t.title}${t.dueTime ? ` at ${t.dueTime}` : ''} (due ${fmtDay(keyOf(t.dueDate))})${
          t.place ? ` — ${t.place}` : ''
        }`;
      const pending = visibleTasks.filter((t) => t.status !== 'completed');
      const overdue = pending
        .filter((t) => keyOf(t.dueDate) < todayK)
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
      const dueToday = pending.filter((t) => keyOf(t.dueDate) === todayK);
      const dueTomorrow = pending.filter((t) => keyOf(t.dueDate) === tomorrowK);
      const upcoming = pending
        .filter((t) => keyOf(t.dueDate) > tomorrowK)
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
        .slice(0, 4);
      const threeDaysAgo = Date.now() - 3 * 86400000;
      const recentDone = visibleTasks
        .filter(
          (t) =>
            t.status === 'completed' &&
            t.completedAtIso &&
            new Date(t.completedAtIso).getTime() >= threeDaysAgo
        )
        .sort((a, b) => (b.completedAtIso || '').localeCompare(a.completedAtIso || ''))
        .slice(0, 6);
      const waitingNotes = visibleJasonNotes.filter((n) => !n.handled).length;
      const sections: string[] = [];
      if (overdue.length) sections.push(`OVERDUE:\n${overdue.slice(0, 8).map(line).join('\n')}`);
      if (dueToday.length) sections.push(`DUE TODAY:\n${dueToday.map(line).join('\n')}`);
      if (dueTomorrow.length)
        sections.push(`DUE TOMORROW:\n${dueTomorrow.map(line).join('\n')}`);
      if (upcoming.length) sections.push(`COMING UP:\n${upcoming.map(line).join('\n')}`);
      if (recentDone.length)
        sections.push(
          `DONE IN THE LAST FEW DAYS:\n${recentDone
            .map(
              (t) =>
                `- ${t.title} (done ${
                  t.completedAtIso ? fmtDay(keyOf(t.completedAtIso)) : 'recently'
                }${
                  t.completionState === 'more'
                    ? `, more to do${t.remainderNote ? `: ${t.remainderNote}` : ''}`
                    : ', finished'
                })`
            )
            .join('\n')}`
        );
      if (waitingNotes > 0) sections.push(`NOTES WAITING FOR JASON: ${waitingNotes}`);
      const briefingSummary = sections.length
        ? sections.join('\n\n')
        : 'Nothing is overdue, nothing is due today or tomorrow, and nothing was finished in the last few days. The desk is clear.';


      const resp = await fetch('/api/assistant/briefing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          context: {
            userName: userProfile?.displayName || user.displayName || 'Steward User',
            addressName: userProfile?.addressName || '',
            aiAccess: userProfile?.aiAccess !== false,
            currentDateTime: new Date().toLocaleString('en-US', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
            }),
            briefingSummary,
          },
        }),
      });
      if (!resp.ok) return null;
      const data = (await resp.json()) as { briefing?: string };
      const text = String(data.briefing || '').trim();
      if (!text) return null;
      const stamp = householdStamp();
      const id = `brief-${(stamp.householdId || user.uid).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40)}-${dateKey}`;
      await setDoc(doc(db, 'briefings', id), {
        userId: user.uid,
        householdId: stamp.householdId,
        memberIds: stamp.memberIds,
        dateKey,
        text: text.slice(0, 4000),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return text;
    } catch (err) {
      console.error('Morning briefing failed', err);
      return null;
    } finally {
      briefingInFlightRef.current = '';
    }
  }

  async function handleToggleJasonNoteHandled(note: JasonNote) {
    try {
      await updateDoc(doc(db, 'jasonNotes', note.id), {
        handled: !note.handled,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `jasonNotes/${note.id}`);
    }
  }

  async function handleDeleteJasonNote(noteId: string) {
    try {
      await deleteDoc(doc(db, 'jasonNotes', noteId));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `jasonNotes/${noteId}`);
    }
  }

  async function handleUpdateDeskPrefs(updates: {
    addressName?: string;
    voiceMuted?: boolean;
    emailEnabled?: boolean;
    mailFromPeople?: boolean;
    mailBills?: boolean;
    mailNewsletters?: boolean;
    mailOnlySenders?: string;
    mailNeverSenders?: string;
    vaultSalt?: string;
    vaultCheck?: string;
    vaultRecoveryWrap?: string;
    vaultRecoveryCheck?: string;
    wrapPublicKey?: string;
    wrapPrivateSealed?: string;
    aiAccess?: boolean;
    aiConnectors?: boolean;
    aiWrite?: boolean;
    sealedKinds?: RecordKind[];
  }) {
    if (!user) return;
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        ...updates,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${user.uid}`);
    }
  }

  // The sealed-records vault (Jason, 2026-11-21): the passphrase is
  // never stored; making a vault stores only a random salt and a
  // sealed check value on the profile, and the key lives in memory
  // on this device until it is locked or the app closes.
  async function handleCreateVault() {
    if (!user || !userProfile) return;
    if (vaultPass.length < 8) {
      setVaultFeedback(
        'Use at least 8 characters — a few words you will remember.'
      );
      return;
    }
    if (vaultPass !== vaultPassConfirm) {
      setVaultFeedback('The two passphrases do not match. Type the same one twice.');
      return;
    }
    try {
      const made = await createVault(vaultPass);
      await handleUpdateDeskPrefs({
        vaultSalt: made.salt,
        vaultCheck: made.check,
        vaultRecoveryWrap: made.recoveryWrap,
        vaultRecoveryCheck: made.recoveryCheck,
      });
      setVaultPass('');
      setVaultPassConfirm('');
      setRecoveryKeyInHand(true);
      setRecoverySaved(false);
      setVaultFeedback(
        'Your vault is made, and it is unlocked on this device. Save your recovery key below — it opens the vault again if you forget the passphrase.'
      );
    } catch {
      setVaultFeedback('The vault could not be made just now. Try again.');
    }
  }

  async function handleUnlockVault() {
    if (!userProfile?.vaultSalt || !userProfile?.vaultCheck) return;
    const pass = vaultPass;
    const ok = await unlockVault(pass, userProfile.vaultSalt, userProfile.vaultCheck);
    if (ok) {
      setVaultPass('');
      if (!userProfile.vaultRecoveryWrap) {
        try {
          const rec = await prepareRecovery(pass, userProfile.vaultSalt);
          await handleUpdateDeskPrefs({
            vaultRecoveryWrap: rec.recoveryWrap,
            vaultRecoveryCheck: rec.recoveryCheck,
          });
          setRecoveryKeyInHand(true);
          setRecoverySaved(false);
        } catch {
          // The vault is open either way; a recovery key can be
          // prepared again from the sealed-records settings.
        }
      }
      setVaultFeedback(
        'Unlocked on this device. Sealed records can be read and filed until you lock the vault or close the app.'
      );
    } else {
      setVaultFeedback(
        'That passphrase did not open the vault. If you have forgotten it, your Drive recovery key below can open it instead.'
      );
    }
  }

  function handleLockVault() {
    lockVault();
    setRecoveryKeyInHand(false);
    setVaultRecovered(false);
    setShowChangePass(false);
    setVaultFeedback('Locked. Sealed records stay sealed until you unlock the vault again.');
  }

  // Vault recovery (Jason, 2026-11-21): the recovery key lives as a
  // small file in the owner's own Drive, in the Steward Backups
  // folder. Saving writes or replaces that one file; recovering
  // reads it back and opens the vault with it — the records belong
  // to their depositor, and the owner's own sign-in is the proof.
  const RECOVERY_KEY_FILE_NAME = 'Steward-Recovery-Key.json';

  async function handleSaveRecoveryKey() {
    const keyB64 = getRecoveryKeyB64();
    if (!keyB64) {
      setVaultFeedback(
        'The recovery key is in hand only while the vault is open on this device. Unlock it first.'
      );
      return;
    }
    const token = getDriveAccessToken();
    if (!token) {
      setVaultFeedback('Connect Google Drive first (see Backups), then save the key.');
      return;
    }
    setRecoveryBusy(true);
    try {
      const folderId = await resolveBackupFolderId(token);
      const files = await listDriveBackups(token, folderId);
      const existing = files.find((f) => f.name === RECOVERY_KEY_FILE_NAME);
      const content = JSON.stringify(
        {
          app: 'Steward',
          kind: 'vault-recovery-key',
          version: 1,
          recoveryKey: keyB64,
          savedAtIso: new Date().toISOString(),
        },
        null,
        2
      );
      if (existing) {
        await overwriteDriveBackupFile(token, existing.id, {
          name: RECOVERY_KEY_FILE_NAME,
          mimeType: 'application/json',
          content,
        });
      } else {
        await createDriveBackupFile(token, {
          folderId,
          name: RECOVERY_KEY_FILE_NAME,
          mimeType: 'application/json',
          content,
        });
      }
      markRecoveryKeySaved();
      setRecoverySaved(true);
      setVaultFeedback('Your recovery key is saved in your Drive, in the Steward Backups folder.');
    } catch {
      setVaultFeedback('The recovery key could not be saved just now. Try again.');
    } finally {
      setRecoveryBusy(false);
    }
  }

  async function handleRecoverVault() {
    if (!userProfile?.vaultRecoveryWrap || !userProfile?.vaultRecoveryCheck) {
      setVaultFeedback(
        'This vault has no recovery key yet. Unlock with your passphrase once, and the desk will make one.'
      );
      return;
    }
    const token = getDriveAccessToken();
    if (!token) {
      setVaultFeedback('Connect Google Drive first (see Backups), then recover the vault.');
      return;
    }
    setRecoveryBusy(true);
    try {
      const folderId = await resolveBackupFolderId(token);
      const files = await listDriveBackups(token, folderId);
      const file = files.find((f) => f.name === RECOVERY_KEY_FILE_NAME);
      if (!file) {
        setVaultFeedback(
          'No recovery key file was found in your Drive. If it was saved, it sits in the Steward Backups folder.'
        );
        return;
      }
      const text = await downloadDriveBackupContent(token, file.id);
      let parsed: { recoveryKey?: string } = {};
      try {
        parsed = JSON.parse(text) as { recoveryKey?: string };
      } catch {
        parsed = {};
      }
      if (!parsed.recoveryKey) {
        setVaultFeedback('That file is not a recovery key.');
        return;
      }
      const ok = await recoverWithKeyFile(parsed.recoveryKey, {
        vaultRecoveryWrap: userProfile.vaultRecoveryWrap,
        vaultRecoveryCheck: userProfile.vaultRecoveryCheck,
        vaultCheck: userProfile.vaultCheck,
      });
      if (ok) {
        setVaultRecovered(true);
        setRecoverySaved(true);
        setRecoveryKeyInHand(true);
        setVaultFeedback(
          'Your vault is open again — your records are yours. Set a new passphrase below so you can unlock the usual way.'
        );
      } else {
        setVaultFeedback(
          'That recovery key did not open this vault. It may be an older key, saved before the vault was remade.'
        );
      }
    } catch {
      setVaultFeedback('The recovery could not be finished just now. Try again.');
    } finally {
      setRecoveryBusy(false);
    }
  }



  // ---- Account records (Jason, 2026-11-21) ----

  // File a login. The password is always sealed under the owner's
  // vault key; held by a family with recovery set up, it is also
  // sealed under the family key so the family can open it together.
  async function handleAddAccountRecord() {
    if (!user || !activeHousehold) return;
    if (!acctTitle.trim() || !acctPassword) {
      setAcctFeedback('An account needs at least a name and a password.');
      return;
    }
    if (!isVaultUnlocked()) {
      setAcctFeedback('Unlock your vault first — the password is sealed in the box before anything is filed.');
      return;
    }
    try {
      const aimed = audienceFor(
        acctScope,
        acctScope === 'family' ? acctFamilyId || activeFamily?.id || '' : '',
        acctScope === 'circles' && acctCircleId ? [acctCircleId] : [],
        activeHousehold.id,
        'documents'
      );
      if (!aimed) {
        setAcctFeedback('That audience could not be worked out — check the family or circle you picked.');
        return;
      }
      const familyId = typeof aimed.scopeFields.familyId === 'string' ? aimed.scopeFields.familyId : '';
      let passwordFamilyWrap: string | undefined;
      if (acctScope === 'family' && familyId) {
        const famKey = getFamilyRecoveryKey(familyId);
        if (famKey) passwordFamilyWrap = await sealTextWithKey(famKey, acctPassword);
      }
      // The password goes in the box first; the record only points
      // at it. The record itself never carries a password.
      const recordId = createSafeId('acct');
      const credentialId = createSafeId('cred');
      await setDoc(doc(db, 'credentials', credentialId), {
        ownerId: user.uid,
        accountRecordId: recordId,
        memberIds: aimed.memberIds,
        ...(familyId ? { familyId } : {}),
        passwordSealed: await sealText(acctPassword),
        ...(passwordFamilyWrap ? { passwordFamilyWrap } : {}),
        ...(acctNotes.trim() ? { notesSealed: await sealText(acctNotes.trim()) } : {}),
        aiUse: acctAiUse,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await setDoc(doc(db, 'accountRecords', recordId), {
        userId: user.uid,
        householdId: aimed.householdId,
        memberIds: aimed.memberIds,
        ...aimed.scopeFields,
        title: acctTitle.trim().slice(0, 120),
        username: acctUsername.trim().slice(0, 200),
        url: acctUrl.trim().slice(0, 500),
        credentialId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setAcctTitle('');
      setAcctUsername('');
      setAcctPassword('');
      setAcctUrl('');
      setAcctNotes('');
      setAcctAiUse(false);
      setAcctFeedback('Filed. The password sits in your credentials box, sealed — the record only points at it.');
    } catch (err) {
      setAcctFeedback(err instanceof Error ? err.message : 'The account could not be filed.');
    }
  }

  // Opening a password always goes through the box: the record
  // names the credential, the box holds the sealed value.
  async function handleRevealAccountPassword(rec: AccountRecord) {
    if (revealedPasswords[rec.id]) {
      setRevealedPasswords((prev) => {
        const next = { ...prev };
        delete next[rec.id];
        return next;
      });
      return;
    }
    const cred = rec.credentialId ? credentials.find((c) => c.id === rec.credentialId) : undefined;
    if (!cred) {
      setAcctFeedback('No credential is linked to this record in the box.');
      return;
    }
    try {
      if (user && cred.ownerId === user.uid) {
        if (!isVaultUnlocked()) {
          setAcctFeedback('Unlock your vault to open a password from the box.');
          return;
        }
        const opened = await unsealText(cred.passwordSealed);
        setRevealedPasswords((prev) => ({ ...prev, [rec.id]: opened }));
        return;
      }
      if (cred.passwordFamilyWrap && cred.familyId) {
        const famKey = getFamilyRecoveryKey(cred.familyId);
        if (famKey) {
          const opened = await unsealTextWithKey(famKey, cred.passwordFamilyWrap);
          setRevealedPasswords((prev) => ({ ...prev, [rec.id]: opened }));
          return;
        }
      }
      setAcctFeedback(
        'Only the owner can open this password — it sits in their box, sealed under their vault key, and it was not wrapped for the family.'
      );
    } catch {
      setAcctFeedback('That password could not be opened on this device.');
    }
  }

  async function handleDeleteAccountRecord(rec: AccountRecord) {
    try {
      await deleteDoc(doc(db, 'accountRecords', rec.id));
      // The box does not keep a password for a record that is gone.
      if (rec.credentialId && user) {
        const cred = ownCredentials.find((c) => c.id === rec.credentialId);
        if (cred) await deleteDoc(doc(db, 'credentials', cred.id));
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `accountRecords/${rec.id}`);
    }
  }

  async function handleRevealCredential(cred: Credential) {
    if (revealedPasswords[cred.id]) {
      setRevealedPasswords((prev) => {
        const next = { ...prev };
        delete next[cred.id];
        return next;
      });
      return;
    }
    if (!isVaultUnlocked()) {
      setBoxFeedback('Unlock your vault to open a password from the box.');
      return;
    }
    try {
      const opened = await unsealText(cred.passwordSealed);
      setRevealedPasswords((prev) => ({ ...prev, [cred.id]: opened }));
    } catch {
      setBoxFeedback('That password could not be opened on this device.');
    }
  }

  async function handleRemoveCredential(cred: Credential) {
    try {
      await deleteDoc(doc(db, 'credentials', cred.id));
      const rec = ownAccountRecords.find((a) => a.id === cred.accountRecordId);
      if (rec) {
        await updateDoc(doc(db, 'accountRecords', rec.id), {
          credentialId: '',
          updatedAt: serverTimestamp(),
        });
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `credentials/${cred.id}`);
    }
  }


  // ---- The Give (Jason, 2026-11-21) ----
  // Ownership never moves by deposit — only by a gift. A sole
  // owner gives outright. Co-owners decide by majority; a tie at
  // full turnout goes to the eldest of the owners. Period.

  type GiveRecordShape = {
    id: string;
    userId: string;
    memberIds: string[];
    ownerIds?: string[];
    giftLog?: GiftEntry[];
    credentialId?: string;
  };

  function ownersOf(rec: GiveRecordShape): string[] {
    return rec.ownerIds && rec.ownerIds.length > 0 ? rec.ownerIds : [rec.userId];
  }

  function eldestOwnerUid(ownerIds: string[]): string {
    let best: { uid: string; birthYear: number } | null = null;
    for (const fam of families) {
      for (const person of fam.people || []) {
        if (person.userId && ownerIds.includes(person.userId) && person.birthYear) {
          if (!best || person.birthYear < best.birthYear) {
            best = { uid: person.userId, birthYear: person.birthYear };
          }
        }
      }
    }
    if (best) return best.uid;
    for (const fam of families) {
      const head = familyHeadUid(fam);
      if (head && ownerIds.includes(head)) return head;
    }
    return ownerIds[0];
  }

  function findGiveRecord(
    collectionName: GiveProposal['collectionName'],
    recordId: string
  ): GiveRecordShape | null {
    const lists: Record<string, GiveRecordShape[]> = {
      documents: documents as unknown as GiveRecordShape[],
      tasks: tasks as unknown as GiveRecordShape[],
      propertyEntries: propertyEntries as unknown as GiveRecordShape[],
      financeEntries: financeEntries as unknown as GiveRecordShape[],
      jasonNotes: jasonNotes as unknown as GiveRecordShape[],
      accountRecords: accountRecords as unknown as GiveRecordShape[],
    };
    return lists[collectionName]?.find((r) => r.id === recordId) || null;
  }

  async function executeGive(
    collectionName: GiveProposal['collectionName'],
    rec: GiveRecordShape,
    toUid: string,
    toFamilyId: string,
    toLabel: string,
    decision: 'owner' | 'majority' | 'eldest'
  ): Promise<boolean> {
    if (!user) return false;
    let newOwners: string[];
    let newPrimary: string;
    if (toFamilyId) {
      const fam = families.find((f) => f.id === toFamilyId);
      if (!fam) return false;
      newOwners = fam.memberIds.slice(0, 20);
      newPrimary = familyHeadUid(fam) || newOwners[0];
    } else {
      if (!toUid) return false;
      newOwners = [toUid];
      newPrimary = toUid;
    }
    const memberIds = Array.from(new Set([...(rec.memberIds || []), ...newOwners])).slice(0, 100);
    const entry: GiftEntry = {
      fromUid: user.uid,
      fromName: userProfile?.displayName || user.displayName || 'The owner',
      toLabel,
      atIso: new Date().toISOString(),
      decision,
    };
    const giftLog = [...(rec.giftLog || []), entry].slice(-20);
    await updateDoc(doc(db, collectionName, rec.id), {
      userId: newPrimary,
      ownerIds: newOwners,
      memberIds,
      giftLog,
      updatedAt: serverTimestamp(),
    });
    if (collectionName === 'accountRecords' && rec.credentialId) {
      const cred = credentials.find((c) => c.id === rec.credentialId);
      if (cred && cred.ownerId === user.uid) {
        await updateDoc(doc(db, 'credentials', cred.id), {
          ownerId: newPrimary,
          memberIds,
          updatedAt: serverTimestamp(),
        });
      }
    }
    return true;
  }

  async function handleGive(
    collectionName: GiveProposal['collectionName'],
    rec: GiveRecordShape,
    recordTitle: string
  ) {
    if (!user) return;
    if (!giveTarget) {
      setGiveFeedback('Pick who receives it first — a person, or a family.');
      return;
    }
    const [kind, targetId] = giveTarget.split(':');
    const toFamilyId = kind === 'family' ? targetId : '';
    const toUid = kind === 'person' ? targetId : '';
    const toLabel =
      kind === 'family'
        ? families.find((f) => f.id === targetId)?.name || 'The family'
        : givePeopleName(targetId);
    try {
      const owners = ownersOf(rec);
      if (owners.length <= 1) {
        const ok = await executeGive(collectionName, rec, toUid, toFamilyId, toLabel, 'owner');
        setGiveFeedback(
          ok ? `Given. ${recordTitle} now belongs to ${toLabel}.` : 'That give could not be made.'
        );
        return;
      }
      const id = createSafeId('give');
      await setDoc(doc(db, 'giveProposals', id), {
        collectionName,
        recordId: rec.id,
        recordTitle,
        ownerIds: owners,
        proposedBy: user.uid,
        proposedByName: userProfile?.displayName || user.displayName || 'An owner',
        toUid,
        toFamilyId,
        toLabel,
        approvals: [user.uid],
        declines: [],
        status: 'open',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setGiveFeedback(
        `Proposed. ${recordTitle} has ${owners.length} owners — the others vote below, a majority carries it, and a tie goes to the eldest.`
      );
    } catch (err) {
      setGiveFeedback(err instanceof Error ? err.message : 'The give could not be started.');
    }
  }

  function givePeopleName(uid: string): string {
    const member = householdMembers.find((m) => m.userId === uid);
    if (member) return member.displayName;
    for (const fam of families) {
      const person = (fam.people || []).find((pp) => pp.userId === uid);
      if (person) return person.name;
    }
    return 'A family member';
  }

  async function handleVoteGive(p: GiveProposal, approve: boolean) {
    if (!user) return;
    const approvals = approve
      ? Array.from(new Set([...(p.approvals || []), user.uid]))
      : (p.approvals || []).filter((a) => a !== user.uid);
    const declines = approve
      ? (p.declines || []).filter((d) => d !== user.uid)
      : Array.from(new Set([...(p.declines || []), user.uid]));
    const total = p.ownerIds.length;
    const updates: Record<string, unknown> = { approvals, declines, updatedAt: serverTimestamp() };
    if (approvals.length * 2 > total) {
      updates.status = 'approved';
      updates.decision = 'majority';
    } else if (declines.length * 2 > total) {
      updates.status = 'declined';
      updates.decision = 'majority';
    } else if (approvals.length + declines.length >= total) {
      const eldest = eldestOwnerUid(p.ownerIds);
      updates.status = approvals.includes(eldest) ? 'approved' : 'declined';
      updates.decision = 'eldest';
    }
    try {
      await updateDoc(doc(db, 'giveProposals', p.id), updates);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `giveProposals/${p.id}`);
    }
  }

  async function handleCompleteGive(p: GiveProposal) {
    const rec = findGiveRecord(p.collectionName, p.recordId);
    if (!rec) {
      setGiveFeedback('That record could not be found on this device.');
      return;
    }
    try {
      const ok = await executeGive(
        p.collectionName,
        rec,
        p.toUid,
        p.toFamilyId,
        p.toLabel,
        p.decision || 'majority'
      );
      if (ok) {
        await updateDoc(doc(db, 'giveProposals', p.id), {
          status: 'done',
          updatedAt: serverTimestamp(),
        });
        setGiveFeedback(`Given. ${p.recordTitle} now belongs to ${p.toLabel}.`);
      }
    } catch (err) {
      setGiveFeedback(err instanceof Error ? err.message : 'The give could not be completed.');
    }
  }


  // ---- Family directory (Jason, 2026-11-21) ----

  function handleEditDirectoryEntry(entry: DirectoryEntry) {
    setDirEditingId(entry.id);
    setDirName(entry.displayName || '');
    setDirBirthday(entry.birthday || '');
    setDirAnniversary(entry.anniversary || '');
    setDirAnniversaryLabel(entry.anniversaryLabel || '');
    setDirPhysical(entry.physicalAddress || '');
    setDirBilling(entry.billingAddress || '');
    setDirPhonesText((entry.phones || []).join('\n'));
    setDirEmailsText((entry.emails || []).join('\n'));
    setDirNotes(entry.notes || '');
    setDirScope(entry.scope === 'private' || entry.scope === 'household' ? entry.scope : 'family');
    setDirFamilyId(entry.familyId || '');
    setDirFeedback('Editing your directory entry below.');
  }

  async function handleSaveDirectoryEntry() {
    if (!user) return;
    const displayName = dirName.trim();
    if (!displayName) {
      setDirFeedback('The entry needs the name the family knows you by.');
      return;
    }
    const phones = dirPhonesText.split('\n').map((x) => x.trim()).filter(Boolean).slice(0, 6);
    const emails = dirEmailsText.split('\n').map((x) => x.trim()).filter(Boolean).slice(0, 6);
    const memberIds = audienceFor(dirScope, dirFamilyId, [], activeHousehold?.householdId || '', 'documents');
    const payload: Record<string, unknown> = {
      displayName,
      birthday: dirBirthday.trim(),
      anniversary: dirAnniversary.trim(),
      anniversaryLabel: dirAnniversaryLabel.trim(),
      physicalAddress: dirPhysical.trim(),
      billingAddress: dirBilling.trim(),
      phones,
      emails,
      notes: dirNotes.trim(),
      scope: dirScope,
      familyId: dirScope === 'family' ? dirFamilyId : '',
      circleIds: [],
      memberIds,
      updatedAt: serverTimestamp(),
    };
    try {
      if (dirEditingId) {
        await updateDoc(doc(db, 'directoryEntries', dirEditingId), payload);
        setDirFeedback('Your directory entry is updated.');
      } else {
        const id = createSafeId('dir');
        await setDoc(doc(db, 'directoryEntries', id), {
          ...payload,
          userId: user.uid,
          householdId: activeHousehold?.householdId || '',
          createdAt: serverTimestamp(),
        });
        setDirEditingId(id);
        setDirFeedback('Your directory entry is in. The family sees exactly the reach you picked.');
      }
    } catch (err) {
      setDirFeedback(err instanceof Error ? err.message : 'The entry could not be saved.');
    }
  }

  async function handleDeleteDirectoryEntry(entry: DirectoryEntry) {
    try {
      await deleteDoc(doc(db, 'directoryEntries', entry.id));
      if (dirEditingId === entry.id) setDirEditingId('');
      setDirFeedback('Your directory entry is removed.');
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `directoryEntries/${entry.id}`);
    }
  }


  // ---- Email filing (Jason, 2026-11-21) ----
  // The owner of the mailbox files a message as a record, under
  // privacy settings they pick. The fence runs first, on this
  // device: what the mail rules shut out cannot be filed. The
  // record holds the message's heading details and the preview
  // Gmail shows; the original stays in the mailbox.

  async function handleLoadMailForFiling() {
    if (!userProfile) return;
    const token = getGmailAccessToken();
    if (!token) {
      setMailFileFeedback('Connect your mail for this session first — the Connect mail button is on the front door — then come back here.');
      return;
    }
    setMailFileFeedback('Reading your recent mail…');
    try {
      const entries = await fetchMailForFiling(token, {
        fromPeople: userProfile.mailFromPeople !== false,
        billsAndNotices: userProfile.mailBills !== false,
        newsletters: Boolean(userProfile.mailNewsletters),
        onlySenders: userProfile.mailOnlySenders || '',
        neverSenders: userProfile.mailNeverSenders || '',
      });
      setMailFileEntries(entries);
      setMailFileFeedback(
        entries.length
          ? 'Pick the reach and the kind, then file any message below.'
          : 'No recent messages passed your mail rules.'
      );
    } catch (err) {
      setMailFileFeedback(err instanceof Error ? err.message : 'The mail could not be read.');
    }
  }

  async function handleFileMailMessage(entry: MailFilingEntry) {
    if (!user) return;
    const parsed = new Date(entry.date);
    const detectedDate = Number.isNaN(parsed.getTime())
      ? new Date().toISOString().slice(0, 10)
      : parsed.toISOString().slice(0, 10);
    try {
      const id = await handleSaveDocument({
        title: entry.subject || '(no subject)',
        category: 'General',
        place: '',
        ocrText: [
          `From: ${entry.from}`,
          `Date: ${entry.date}`,
          `Subject: ${entry.subject}`,
          '',
          entry.snippet,
          '',
          'Filed from the mailbox by its owner. The original message stays in the mailbox; this record holds its heading details and the preview Gmail shows.',
        ].join('\n'),
        summary: `Email from ${entry.from} — ${entry.subject}`.slice(0, 1000),
        tags: ['email'],
        keyDetails: [`From: ${entry.from}`, `Date: ${entry.date}`],
        detectedDate,
        imageUrl: '',
        fileName: 'Email message',
        notes: 'Filed from email.',
        recordKind: mailFileKind,
        customKindLabel: '',
        accountLocation: '',
      } as Omit<ScannedDocument, 'id' | 'userId' | 'createdAt' | 'updatedAt' | 'householdId' | 'memberIds' | 'verificationStatus' | 'verifiedByName' | 'verifiedAtIso' | 'paperLocation' | 'driveFileId'> & { paperLocation?: string });
      if (!id) {
        setMailFileFeedback('That message could not be filed.');
        return;
      }
      if (mailFileScope !== 'household') {
        const memberIds = audienceFor(
          mailFileScope,
          mailFileScope === 'family' ? mailFileFamilyId || activeFamily?.id || '' : '',
          [],
          activeHousehold?.householdId || '',
          'documents'
        );
        await updateDoc(doc(db, 'documents', id), {
          scope: mailFileScope,
          familyId: mailFileScope === 'family' ? mailFileFamilyId || activeFamily?.id || '' : '',
          circleIds: [],
          memberIds,
          updatedAt: serverTimestamp(),
        });
      }
      setMailFiledIds((prev) => [...prev, entry.id]);
      setMailFileFeedback(`Filed. "${entry.subject}" is now a record, ${mailFileScope === 'private' ? 'yours alone' : mailFileScope === 'family' ? 'shared with the family' : 'shared with your household'}.`);
    } catch (err) {
      setMailFileFeedback(err instanceof Error ? err.message : 'That message could not be filed.');
    }
  }


  function handlePickStorageFamily(familyId: string) {
    setStorageFamilyId(familyId);
    const fam = families.find((f) => f.id === familyId);
    const st = fam?.storage;
    setStRootChoice(st?.rootChoice === 'custom' ? 'custom' : 'default');
    setStRootIdText(st?.rootId || '');
    setStRootLabel(st?.rootLabel || '');
    setStBackupsEnabled(st?.backupsEnabled !== false);
    setStFrequency(st?.backupFrequency || 'daily');
    setStScope(st?.backupScope || 'everything');
    setStFeedback('');
  }

  async function handleSaveStorageSettings() {
    const fam = families.find((f) => f.id === storageFamilyId);
    if (!fam || !user) {
      setStFeedback('Pick the family first.');
      return;
    }
    let rootId = stRootIdText.trim();
    const foldersAt = rootId.indexOf('folders/');
    if (foldersAt >= 0) rootId = rootId.slice(foldersAt + 'folders/'.length).split(/[/?#]/)[0];
    const storage: FamilyStorage = {
      rootChoice: stRootChoice,
      rootId: stRootChoice === 'custom' ? rootId : '',
      rootLabel: stRootChoice === 'custom' ? stRootLabel.trim().slice(0, 120) : '',
      backupsEnabled: stBackupsEnabled,
      backupFrequency: stFrequency,
      backupScope: stScope,
    };
    if (stRootChoice === 'custom' && !rootId) {
      setStFeedback('A different root needs its folder ID or its Drive link — or keep the one root folder.');
      return;
    }
    try {
      await updateDoc(doc(db, 'families', fam.id), {
        storage,
        updatedAt: serverTimestamp(),
      });
      setStFeedback('Saved. The desk follows these storage and backup choices for this family.');
    } catch (err) {
      setStFeedback(err instanceof Error ? err.message : 'The settings could not be saved.');
    }
  }

  // ---- Family recovery (Jason, 2026-11-21) ----

  // After the vault opens: this account's wrap keypair exists (the
  // private half sealed under the vault key on the profile), the
  // public half sits in the directory, and the pair is loaded.
  async function ensureWrapKeypairPersisted() {
    if (!user || !userProfile) return;
    try {
      if (!userProfile.wrapPublicKey || !userProfile.wrapPrivateSealed) {
        const made = await ensureWrapKeypair();
        await handleUpdateDeskPrefs({
          wrapPublicKey: made.publicKeyB64,
          wrapPrivateSealed: made.privateSealed,
        });
        await setDoc(doc(db, 'wrapKeys', user.uid), {
          userId: user.uid,
          displayName: userProfile.displayName || user.displayName || 'Member',
          publicKey: made.publicKeyB64,
          updatedAt: serverTimestamp(),
        });
      } else if (!hasWrapKeypair()) {
        await loadWrapKeypair(userProfile.wrapPrivateSealed, userProfile.wrapPublicKey);
      }
      setWrapReady(true);
    } catch {
      // The keypair can be made again on the next unlock.
    }
  }

  // The head sets family recovery up: a fresh family key, checked,
  // wrapped to every account holder's public key, with the head's
  // own vault key wrapped under it. Needs the head's passphrase
  // once, typed here.
  async function handleSetupFamilyRecovery(family: Family) {
    if (!user || !userProfile?.vaultSalt) return;
    if (!familyRecoveryPass) {
      setFamilyRecoveryFeedback('Type your vault passphrase once so your key can be wrapped for the family.');
      return;
    }
    if (!hasWrapKeypair()) {
      setFamilyRecoveryFeedback('Unlock your vault first — your wrap keypair loads with it.');
      return;
    }
    try {
      const { key, rawB64 } = await newFamilyRecoveryKey();
      const check = await familyRecoveryCheck(key);
      const raw = b64ToBytesPublic(rawB64);
      const wraps: Record<string, string> = {};
      for (const memberUid of family.memberIds) {
        const pub = memberUid === user.uid ? userProfile.wrapPublicKey : wrapKeyMap[memberUid];
        if (pub) wraps[memberUid] = await rsaWrapTo(pub, raw);
      }
      if (!wraps[user.uid]) {
        setFamilyRecoveryFeedback('Your own wrap key is not ready yet. Lock and unlock your vault, then try again.');
        return;
      }
      const headKeyWrap = await wrapVaultKeyUnderFamily(familyRecoveryPass, userProfile.vaultSalt, key);
      await updateDoc(doc(db, 'families', family.id), {
        recovery: { check, wraps, headKeyWrap },
        updatedAt: serverTimestamp(),
      });
      setFamilyRecoveryKey(family.id, key);
      setFamilyRecoveryPass('');
      setFamilyRecoveryFeedback(
        `Family recovery is set up for ${family.name}. If you ever lose your passphrase, the family can vote to hand your key back.`
      );
    } catch (err) {
      setFamilyRecoveryFeedback(
        err instanceof Error ? err.message : 'Family recovery could not be set up.'
      );
    }
  }

  // The head, locked out, asks the family for a reset. The one-time
  // public key rides on the request; its private half stays here.
  async function handleRequestReset(family: Family) {
    if (!user || !userProfile) return;
    try {
      const headPublicKey = await newEphemeralKeypair();
      const id = createSafeId('reset');
      await setDoc(doc(db, 'resetRequests', id), {
        familyId: family.id,
        familyName: family.name,
        forUid: user.uid,
        forName: userProfile.displayName || user.displayName || 'The head of the family',
        headPublicKey,
        approvals: [],
        status: 'open',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setVaultFeedback(
        `Your family has your reset request for ${family.name}. When more than half of the account holders approve it, the desk will hand your key back to this device.`
      );
    } catch (err) {
      setVaultFeedback(err instanceof Error ? err.message : 'The reset request could not be sent.');
    }
  }

  // A member approves. Past half of the account holders, an
  // approver holding the family key delivers the head's vault key
  // and the family key, each wrapped to the request's one-time key.
  async function handleApproveReset(req: ResetRequest) {
    if (!user) return;
    const family = families.find((f) => f.id === req.familyId);
    if (!family) return;
    try {
      const approvals = Array.from(new Set([...(req.approvals || []), user.uid]));
      const updates: Record<string, unknown> = { approvals, updatedAt: serverTimestamp() };
      const famKey = getFamilyRecoveryKey(family.id);
      if (
        approvals.length * 2 > family.memberIds.length &&
        famKey &&
        family.recovery?.headKeyWrap &&
        req.status === 'open'
      ) {
        const headRaw = await unwrapVaultKeyWithFamily(family.recovery.headKeyWrap, famKey);
        const famRawB64 = await exportFamilyRecoveryKeyRaw(family.id);
        if (famRawB64) {
          updates.deliveryVaultKey = await rsaWrapTo(req.headPublicKey, headRaw);
          updates.deliveryFamilyKey = await rsaWrapTo(req.headPublicKey, b64ToBytesPublic(famRawB64));
          updates.status = 'delivered';
        }
      }
      await updateDoc(doc(db, 'resetRequests', req.id), updates);
    } catch {
      // The vote can be tapped again.
    }
  }

  // The head takes the delivery: unwrap, adopt the key (it must
  // open the vault check), take the family key too, then the
  // change-passphrase form below finishes the reset and re-wraps.
  async function handleFinishReset(req: ResetRequest) {
    if (!userProfile?.vaultCheck) return;
    try {
      if (!req.deliveryVaultKey || !req.deliveryFamilyKey) return;
      const headRaw = await unwrapEphemeral(req.deliveryVaultKey);
      const ok = await adoptVaultKeyBytes(headRaw, userProfile.vaultCheck);
      if (!ok) {
        setVaultFeedback('That delivery did not open your vault. Ask the family to send it again.');
        return;
      }
      const famRaw = await unwrapEphemeral(req.deliveryFamilyKey);
      await importFamilyRecoveryKey(req.familyId, bytesToB64Public(famRaw));
      clearEphemeral();
      setVaultRecovered(true);
      setFamilyRewrapId(req.familyId);
      setResetToClose(req.id);
      setVaultFeedback(
        'Your vault is open again. Set a new passphrase below — the desk re-seals your records and wraps your new key for the family.'
      );
    } catch {
      setVaultFeedback('The delivery could not be unwrapped on this device.');
    }
  }

  async function handleReplaceRecoveryKey() {
    if (!userProfile?.vaultSalt || !userProfile?.vaultCheck) return;
    const ok = await unlockVault(vaultReplacePass, userProfile.vaultSalt, userProfile.vaultCheck);
    if (!ok) {
      setVaultFeedback('That passphrase did not open the vault, so no new key was made.');
      return;
    }
    try {
      const rec = await prepareRecovery(vaultReplacePass, userProfile.vaultSalt);
      await handleUpdateDeskPrefs({
        vaultRecoveryWrap: rec.recoveryWrap,
        vaultRecoveryCheck: rec.recoveryCheck,
      });
      setVaultReplacePass('');
      setRecoveryKeyInHand(true);
      setRecoverySaved(false);
      setVaultFeedback(
        'A new recovery key is made. Save it below — any key file saved before no longer matches this vault.'
      );
    } catch {
      setVaultFeedback('The new recovery key could not be made just now. Try again.');
    }
  }

  // Passphrase reset: stage the new key, re-seal every sealed record
  // the owner holds, and write the records and the new profile
  // fields in ONE batch — the vault never sits half-moved. Only when
  // the batch lands does the staged key become the vault key.
  async function handleResetPassphrase() {
    if (!user || !isVaultUnlocked()) return;
    if (vaultNewPass.length < 8) {
      setVaultFeedback(
        'Use at least 8 characters for the new passphrase — a few words you will remember.'
      );
      return;
    }
    if (vaultNewPass !== vaultNewPassConfirm) {
      setVaultFeedback('The two new passphrases do not match. Type the same one twice.');
      return;
    }
    setRecoveryBusy(true);
    try {
      const stage = await stageNewPassphrase(vaultNewPass);
      const reseal = async (v: string) =>
        v && isSealedValue(v) ? await sealTextStaged(await unsealText(v)) : v;
      const batch = writeBatch(db);
      let count = 0;
      for (const d of ownDocuments.filter((r) => r.encrypted)) {
        batch.update(doc(db, 'documents', d.id), {
          ocrText: await reseal(d.ocrText),
          summary: await reseal(d.summary),
          notes: await reseal(d.notes),
          keyDetails: await Promise.all(d.keyDetails.map(reseal)),
          updatedAt: serverTimestamp(),
        });
        count++;
      }
      for (const r of ownPropertyEntries.filter((e) => e.encrypted)) {
        batch.update(doc(db, 'propertyEntries', r.id), {
          notes: await reseal(r.notes),
          updatedAt: serverTimestamp(),
        });
        count++;
      }
      for (const r of ownFinanceEntries.filter((e) => e.encrypted)) {
        batch.update(doc(db, 'financeEntries', r.id), {
          notes: await reseal(r.notes),
          updatedAt: serverTimestamp(),
        });
        count++;
      }
      for (const r of ownTasks.filter((e) => e.encrypted)) {
        batch.update(doc(db, 'tasks', r.id), {
          notes: await reseal(r.notes),
          updatedAt: serverTimestamp(),
        });
        count++;
      }
      batch.update(doc(db, 'users', user.uid), {
        vaultSalt: stage.salt,
        vaultCheck: stage.check,
        vaultRecoveryWrap: stage.recoveryWrap,
        vaultRecoveryCheck: stage.recoveryCheck,
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
      commitStagedPassphrase();
      // Family recovery: re-wrap the new key for the family and
      // close the reset request that brought us here.
      if (familyRewrapId) {
        try {
          const fam = families.find((f) => f.id === familyRewrapId);
          const famKey = getFamilyRecoveryKey(familyRewrapId);
          if (fam && famKey && fam.recovery) {
            const newWrap = await wrapVaultKeyUnderFamily(vaultNewPass, stage.salt, famKey);
            await updateDoc(doc(db, 'families', fam.id), {
              'recovery.headKeyWrap': newWrap,
              updatedAt: serverTimestamp(),
            });
          }
          if (resetToClose) {
            await updateDoc(doc(db, 'resetRequests', resetToClose), {
              status: 'done',
              updatedAt: serverTimestamp(),
            });
          }
        } catch {
          // The passphrase reset itself already landed; the family
          // wrap can be refreshed by setting recovery up again.
        }
        setFamilyRewrapId('');
        setResetToClose('');
      }
      setVaultRecovered(false);
      setShowChangePass(false);
      setVaultNewPass('');
      setVaultNewPassConfirm('');
      if (isRecoveryPendingSave()) setRecoverySaved(false);
      setVaultFeedback(
        count > 0
          ? `Your new passphrase is set, and ${count} sealed record${count === 1 ? '' : 's'} re-sealed under it.`
          : 'Your new passphrase is set.'
      );
    } catch {
      discardStagedPassphrase();
      setVaultFeedback(
        'The new passphrase could not be set just now. Nothing was changed — try again.'
      );
    } finally {
      setRecoveryBusy(false);
    }
  }

  // The family and the circles (Jason, 2026-11-20): the widest ring
  // and the hand-drawn ones. Creating a family makes the creator its
  // owner; linking a household (owner to owner) folds the household's
  // members into the family roster. A circle is drawn from the active
  // household's people; its creator owns it and can end it.
  const [familyNameDraft, setFamilyNameDraft] = useState('');
  const [familyFeedback, setFamilyFeedback] = useState<string | null>(null);
  const [circleNameDraft, setCircleNameDraft] = useState('');
  const [circleTemporary, setCircleTemporary] = useState(false);
  const [circleExpiry, setCircleExpiry] = useState('');
  const [circlePicks, setCirclePicks] = useState<string[]>([]);
  const [circleFeedback, setCircleFeedback] = useState<string | null>(null);

  async function handleCreateFamily(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !userProfile) return;
    const name = familyNameDraft.trim().slice(0, 120);
    if (!name) return;
    try {
      await addDoc(collection(db, 'families'), {
        name,
        ownerId: user.uid,
        ownerName: userProfile.displayName || user.displayName || 'Steward User',
        memberIds: [user.uid],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setFamilyNameDraft('');
      setFamilyFeedback('Family created. Link a household to it below.');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'families');
    }
  }

  // The family's stream lists, figured from a candidate roster and
  // membership — written alongside every change that could move a
  // person's standing, so the rules mirror against fresh lists.
  function streamFieldsFor(
    fam: Family,
    people: FamilyPerson[],
    memberIds?: string[],
    responsibleAge?: number
  ): { notYetIds: string[]; childWriterIds: string[] } {
    return computeStreamLists(
      {
        ...fam,
        people,
        memberIds: memberIds || fam.memberIds,
        ...(typeof responsibleAge === 'number' ? { responsibleAge } : {}),
      },
      localDateKey()
    );
  }

  async function handleLinkHouseholdToFamily(family: Family) {
    if (!user || !activeHousehold) return;
    try {
      const merged = [...new Set([...family.memberIds, ...activeHousehold.memberIds])].slice(0, 100);
      await updateDoc(doc(db, 'families', family.id), {
        memberIds: merged,
        ...streamFieldsFor(family, family.people || [], merged),
        updatedAt: serverTimestamp(),
      });
      await updateDoc(doc(db, 'households', activeHousehold.householdId), {
        familyId: family.id,
        updatedAt: serverTimestamp(),
      });
      setFamilyFeedback(`"${activeHousehold.name}" is linked to ${family.name}.`);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'families/households');
    }
  }

  const [personNameDraft, setPersonNameDraft] = useState('');
  const [personYearDraft, setPersonYearDraft] = useState('');
  const [personKindDraft, setPersonKindDraft] = useState<'blood' | 'marriage' | 'courtesy'>('blood');
  const [personDateDraft, setPersonDateDraft] = useState('');
  const [personLinkDraft, setPersonLinkDraft] = useState('');
  const [headDrafts, setHeadDrafts] = useState<Record<string, string>>({});
  const [responsibleAgeDrafts, setResponsibleAgeDrafts] = useState<Record<string, string>>({});

  async function handleAddFamilyPerson(family: Family) {
    const name = personNameDraft.trim().slice(0, 80);
    if (!name) return;
    // A birthdate is a record with consequences (Jason, 2026-11-21):
    // it is what the responsible age is figured from. The year alone
    // still counts — the age then turns on January 1 of that year.
    const birthDate = /^\d{4}-\d{2}-\d{2}$/.test(personDateDraft) ? personDateDraft : '';
    const year = birthDate ? Number(birthDate.slice(0, 4)) : Number(personYearDraft);
    const person: FamilyPerson = {
      name,
      ...(year >= 1850 && year <= 2100 ? { birthYear: year } : {}),
      ...(birthDate ? { birthDate } : {}),
      ...(personLinkDraft ? { userId: personLinkDraft } : {}),
      living: true,
      // Standing (Jason, 2026-11-21): blood is the default; the
      // toggles mark family by marriage or choice, and courtesy
      // members, who are present but unranked for headship.
      ...(personKindDraft === 'marriage' ? { blood: false } : {}),
      ...(personKindDraft === 'courtesy' ? { courtesy: true } : {}),
    };
    const people = [...(family.people || []), person].slice(0, 100);
    try {
      await updateDoc(doc(db, 'families', family.id), {
        people,
        ...streamFieldsFor(family, people),
        updatedAt: serverTimestamp(),
      });
      setPersonNameDraft('');
      setPersonYearDraft('');
      setPersonDateDraft('');
      setPersonLinkDraft('');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `families/${family.id}`);
    }
  }

  // One person's standing, changed by the family's owner: the age
  // override, the head's hold or grant, the calendar grant.
  async function handleUpdateFamilyPerson(
    family: Family,
    idx: number,
    patch: Partial<FamilyPerson>,
    clearKeys: Array<keyof FamilyPerson> = []
  ) {
    const people = (family.people || []).map((person, i) => {
      if (i !== idx) return person;
      const next: FamilyPerson = { ...person, ...patch };
      clearKeys.forEach((k) => delete next[k]);
      return next;
    });
    try {
      await updateDoc(doc(db, 'families', family.id), {
        people,
        ...streamFieldsFor(family, people),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `families/${family.id}`);
    }
  }

  async function handleSaveResponsibleAge(family: Family) {
    const raw = responsibleAgeDrafts[family.id];
    const parsed = raw === undefined ? NaN : Number(raw);
    const age = Number.isFinite(parsed) && parsed >= 1 && parsed <= 120 ? Math.floor(parsed) : 18;
    try {
      await updateDoc(doc(db, 'families', family.id), {
        responsibleAge: age,
        ...streamFieldsFor(family, family.people || [], undefined, age),
        updatedAt: serverTimestamp(),
      });
      setFamilyFeedback(
        `In ${family.name}, a member becomes responsible at ${age}. The stream lists have been refigured.`
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `families/${family.id}`);
    }
  }

  async function handleSetFamilyPersonLiving(family: Family, idx: number, living: boolean) {
    const people = (family.people || []).map((person, i) =>
      i === idx ? { ...person, living } : person
    );
    try {
      await updateDoc(doc(db, 'families', family.id), {
        people,
        ...streamFieldsFor(family, people),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `families/${family.id}`);
    }
  }

  async function handleRemoveFamilyPerson(family: Family, idx: number) {
    const people = (family.people || []).filter((_, i) => i !== idx);
    try {
      await updateDoc(doc(db, 'families', family.id), {
        people,
        ...streamFieldsFor(family, people),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `families/${family.id}`);
    }
  }

  async function handleUpdateCircleFields(circle: Circle, fields: Record<string, unknown>) {
    try {
      await updateDoc(doc(db, 'circles', circle.id), {
        ...fields,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `circles/${circle.id}`);
    }
  }

  function handleToggleCircleOmit(
    circle: Circle,
    field: 'omitViewIds' | 'omitWriteIds',
    memberId: string,
    omitted: boolean
  ) {
    const current = circle[field] || [];
    const next = omitted
      ? [...new Set([...current, memberId])]
      : current.filter((x) => x !== memberId);
    void handleUpdateCircleFields(circle, { [field]: next });
  }

  function handleToggleCircleKind(circle: Circle, kind: string, omitted: boolean) {
    const current = circle.omitKinds || [];
    const next = omitted
      ? [...new Set([...current, kind])]
      : current.filter((x) => x !== kind);
    void handleUpdateCircleFields(circle, { omitKinds: next });
  }

  function handleToggleCircleHead(circle: Circle, memberId: string, on: boolean) {
    const current = circle.headIds || [];
    let next = on ? [...new Set([...current, memberId])] : current.filter((x) => x !== memberId);
    next = next.slice(0, 2);
    void handleUpdateCircleFields(circle, {
      headMode: next.length > 0 ? 'chosen' : 'seniority',
      headIds: next,
    });
  }

  // Eviction (Jason, 2026-11-21): the head of household can remove a
  // member. Their access to the household's records ends with the
  // roster; records carrying the old roster are re-stamped where the
  // rules allow it, and their own deposits stay theirs, always.
  async function handleEvictMember(member: HouseholdMember) {
    if (!user || !activeHousehold || activeHousehold.ownerId !== user.uid) return;
    if (member.userId === user.uid) return;
    const hid = activeHousehold.householdId;
    const oldRoster = activeHousehold.memberIds;
    const newRoster = oldRoster.filter((id) => id !== member.userId);
    const restamp = async (
      coll: string,
      recs: Array<{ id: string; householdId?: string; scope?: string; memberIds?: string[] }>
    ) => {
      for (const rec of recs) {
        if (rec.householdId !== hid) continue;
        if (rec.scope && rec.scope !== 'household') continue;
        if (!rec.memberIds || rec.memberIds.length !== oldRoster.length) continue;
        try {
          await updateDoc(doc(db, coll, rec.id), {
            memberIds: newRoster,
            updatedAt: serverTimestamp(),
          });
        } catch {
          // Another owner's record keeps its stamp until they touch
          // it; the roster change still ends household access.
        }
      }
    };
    await restamp('tasks', tasks);
    await restamp('documents', documents);
    await restamp('financeEntries', financeEntries);
    await restamp('propertyEntries', propertyEntries);
    try {
      await updateDoc(doc(db, 'households', hid), {
        memberIds: newRoster,
        updatedAt: serverTimestamp(),
      });
      try {
        await deleteDoc(doc(db, 'households', hid, 'members', member.id));
      } catch {
        // The roster is the operative list; a lingering member card
        // grants nothing on its own.
      }
      setHouseholdFeedback(
        `${member.displayName} has been removed from this household. Their own records stay theirs.`
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `households/${hid}`);
    }
  }

  async function handleTogglePartnerFinances(household: Household, on: boolean) {
    try {
      await updateDoc(doc(db, 'households', household.householdId), {
        allowPartnerFinances: on,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `households/${household.householdId}`);
    }
  }

  async function handleCreateCircle(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    const name = circleNameDraft.trim().slice(0, 80);
    if (!name) return;
    const memberIds = [...new Set([user.uid, ...circlePicks])].slice(0, 50);
    try {
      await addDoc(collection(db, 'circles'), {
        name,
        ownerId: user.uid,
        memberIds,
        temporary: circleTemporary,
        ...(circleTemporary && circleExpiry ? { expiresAtKey: circleExpiry } : {}),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setCircleNameDraft('');
      setCirclePicks([]);
      setCircleTemporary(false);
      setCircleExpiry('');
      setCircleFeedback(`Circle "${name}" drawn. Only its members can see it, or anything tagged to it.`);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'circles');
    }
  }

  async function handleDeleteCircle(circle: Circle) {
    if (!user) return;
    // Ending a circle (Jason, 2026-11-20): records I tagged to it
    // fall back — to their remaining circles, or to me alone when
    // this was the only tag. Nobody can re-stamp another person's
    // deposit, so other owners' records keep the audience they were
    // given until their owners touch them.
    const sweep = async (
      coll: string,
      recs: Array<{ id: string; userId: string; circleIds?: string[] }>
    ) => {
      for (const rec of recs) {
        if (rec.userId !== user.uid || !rec.circleIds?.includes(circle.id)) continue;
        const remaining = rec.circleIds.filter((c) => c !== circle.id);
        try {
          if (remaining.length === 0) {
            await updateDoc(doc(db, coll, rec.id), {
              scope: 'private',
              circleIds: [],
              memberIds: [user.uid],
              updatedAt: serverTimestamp(),
            });
          } else {
            const aimed = audienceFor('circles', '', remaining, '');
            if (aimed) {
              await updateDoc(doc(db, coll, rec.id), {
                scope: 'circles',
                circleIds: remaining,
                memberIds: aimed.memberIds,
                updatedAt: serverTimestamp(),
              });
            }
          }
        } catch {
          // A refused re-stamp leaves the record as it was; ending
          // the circle still proceeds.
        }
      }
    };
    await sweep('tasks', tasks);
    await sweep('documents', documents);
    await sweep('financeEntries', financeEntries);
    await sweep('propertyEntries', propertyEntries);
    try {
      await deleteDoc(doc(db, 'circles', circle.id));
      setCircleFeedback(`Circle "${circle.name}" ended. Your records tagged to it fell back to their other tags, or to you alone.`);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `circles/${circle.id}`);
    }
  }

  // Email connect (Jason, 2026-11-20): the reader's own tap grants a
  // read-only Gmail token for this session. Nothing is stored; when
  // Google ends the token (about an hour), the briefing simply goes
  // back to records-only until the reader reconnects here.
  async function handleConnectGmail() {
    try {
      await connectGmail();
      setGmailConnected(true);
      setEmailFeedback(
        todaysBriefing
          ? 'Email connected. Today’s briefing was already prepared, so mail joins from tomorrow’s.'
          : 'Email connected. The next morning briefing will include it.'
      );
    } catch (err) {
      console.error('Gmail connect failed', err);
      setGmailConnected(false);
      setEmailFeedback('Email did not connect. Please try again.');
    }
  }

  // The personal mail add-on (Jason, 2026-11-20): generated once per
  // reader per day, only when the reader's own toggle is on and mail
  // is connected, with the reader's own fence applied on this device
  // before anything reaches the model. It is saved to mailBriefings —
  // owner-only by rule — and never enters the shared briefing.
  const mailBriefingInFlightRef = useRef<string>('');
  async function handleEnsureMailBriefing(): Promise<string | null> {
    if (!user || !userProfile?.emailEnabled || userProfile.aiConnectors === false) return null;
    const dateKey = localDateKey();
    const existing = ownMailBriefings.find((b) => b.dateKey === dateKey);
    if (existing) return existing.text;
    const mailToken = getGmailAccessToken();
    if (!mailToken) return null;
    if (mailBriefingInFlightRef.current === dateKey) return null;
    mailBriefingInFlightRef.current = dateKey;
    try {
      const mailSummary = await fetchRecentMailSummary(mailToken, {
        fromPeople: userProfile.mailFromPeople !== false,
        billsAndNotices: userProfile.mailBills !== false,
        newsletters: Boolean(userProfile.mailNewsletters),
        onlySenders: userProfile.mailOnlySenders || '',
        neverSenders: userProfile.mailNeverSenders || '',
      });
      if (!mailSummary) return null;
      const resp = await fetch('/api/assistant/briefing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'mail',
          context: {
            userName: userProfile.displayName || user.displayName || 'Steward User',
            addressName: userProfile.addressName || '',
            aiAccess: userProfile.aiAccess !== false,
            currentDateTime: new Date().toLocaleString('en-US', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
            }),
            mailSummary,
          },
        }),
      });
      if (!resp.ok) return null;
      const data = (await resp.json()) as { briefing?: string };
      const text = String(data.briefing || '').trim();
      if (!text) return null;
      const stamp = householdStamp();
      const id = `mailbrief-${user.uid.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40)}-${dateKey}`;
      await setDoc(doc(db, 'mailBriefings', id), {
        userId: user.uid,
        householdId: stamp.householdId,
        dateKey,
        text: text.slice(0, 4000),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return text;
    } catch (err) {
      console.error('Mail briefing failed', err);
      return null;
    } finally {
      mailBriefingInFlightRef.current = '';
    }
  }

  // Keeping the stream lists fresh (Jason, 2026-11-21): standing
  // changes on its own as birthdays pass, so whenever a family I
  // own is on screen, I refigure its lists from the roster. When
  // the lists move — someone enters the stream, or is held back —
  // that family's records are re-stamped to match: tasks to the
  // whole roster (children see the calendar), everything else to
  // the stream. Only my own deposits can be re-stamped by me;
  // another owner's records are re-aimed when they next edit them.
  const streamRefreshRef = useRef<Record<string, string>>({});
  useEffect(() => {
    if (!user) return;
    const sameSet = (a: string[], b: string[]) =>
      JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
    for (const fam of families) {
      if (fam.ownerId !== user.uid) continue;
      const lists = computeStreamLists(fam, localDateKey());
      if (
        sameSet(lists.notYetIds, fam.notYetIds || []) &&
        sameSet(lists.childWriterIds, fam.childWriterIds || [])
      ) {
        continue;
      }
      const key = `${lists.notYetIds.join(',')}|${lists.childWriterIds.join(',')}`;
      if (streamRefreshRef.current[fam.id] === key) continue;
      streamRefreshRef.current[fam.id] = key;
      void (async () => {
        try {
          await updateDoc(doc(db, 'families', fam.id), {
            notYetIds: lists.notYetIds,
            childWriterIds: lists.childWriterIds,
            updatedAt: serverTimestamp(),
          });
        } catch {
          return; // a later open tries again
        }
        const stream = fam.memberIds.filter((id) => !lists.notYetIds.includes(id));
        const restamp = async (
          coll: string,
          recs: Array<{
            id: string;
            userId: string;
            scope?: string;
            familyId?: string;
            memberIds?: string[];
          }>,
          kind: string
        ) => {
          const target = (kind === 'tasks' ? fam.memberIds : stream).slice(0, 100);
          for (const rec of recs) {
            if (rec.scope !== 'family' || rec.familyId !== fam.id) continue;
            if (rec.userId !== user.uid) continue;
            if (sameSet(rec.memberIds || [], target)) continue;
            try {
              await updateDoc(doc(db, coll, rec.id), {
                memberIds: target,
                updatedAt: serverTimestamp(),
              });
            } catch {
              // A refused re-stamp leaves the record as it was.
            }
          }
        };
        await restamp('tasks', tasks, 'tasks');
        await restamp('documents', documents, 'documents');
        await restamp('financeEntries', financeEntries, 'finances');
        await restamp('propertyEntries', propertyEntries, 'property');
        await restamp('jasonNotes', jasonNotes, 'notes');
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [families, user]);



  function handleLoadOwnSheet() {
    const mine = ownEmergencySheets[0];
    if (!mine) {
      setSheetFeedback('No sheet of yours is on file yet — the form below starts one.');
      return;
    }
    setSheetForName(mine.forName || '');
    setSheetContacts(mine.contacts || '');
    setSheetDoctors(mine.doctors || '');
    setSheetAllergies(mine.allergies || '');
    setSheetMedications(mine.medicationsNote || '');
    setSheetBloodType(mine.bloodType || '');
    setSheetConditions(mine.conditionsNote || '');
    setSheetWishes(mine.wishes || '');
    setSheetNotes(mine.notes || '');
    setSheetScope(mine.scope === 'private' || mine.scope === 'family' ? mine.scope : 'household');
    setSheetFamilyId(mine.familyId || '');
    setSheetFeedback('Your sheet is loaded below. Saving replaces it.');
  }

  async function handleSaveEmergencySheet() {
    if (!user) return;
    const forName = sheetForName.trim();
    if (!forName) {
      setSheetFeedback('The sheet needs the name responders will know.');
      return;
    }
    const memberIds = audienceFor(sheetScope, sheetFamilyId, [], activeHousehold?.householdId || '', 'documents');
    const payload: Record<string, unknown> = {
      forName,
      contacts: sheetContacts.trim(),
      doctors: sheetDoctors.trim(),
      allergies: sheetAllergies.trim(),
      medicationsNote: sheetMedications.trim(),
      bloodType: sheetBloodType.trim(),
      conditionsNote: sheetConditions.trim(),
      wishes: sheetWishes.trim(),
      notes: sheetNotes.trim(),
      scope: sheetScope,
      familyId: sheetScope === 'family' ? sheetFamilyId : '',
      circleIds: [],
      memberIds,
      updatedAt: serverTimestamp(),
    };
    try {
      const mine = ownEmergencySheets[0];
      if (mine) {
        await updateDoc(doc(db, 'emergencySheets', mine.id), payload);
        setSheetFeedback('Your emergency sheet is updated.');
      } else {
        const id = createSafeId('emg');
        await setDoc(doc(db, 'emergencySheets', id), {
          ...payload,
          userId: user.uid,
          householdId: activeHousehold?.householdId || '',
          createdAt: serverTimestamp(),
        });
        setSheetFeedback('Your emergency sheet is on file, at the reach you picked.');
      }
    } catch (err) {
      setSheetFeedback(err instanceof Error ? err.message : 'The sheet could not be saved.');
    }
  }

  // ---- Storage & backups (Jason, 2026-11-21) ----
  // The family head's storage choices live on the family record.
  // One host root folder is the default and the recommendation:
  // everything the desk holds stays inside one root, so the
  // protection, the sharing, and the backup all cover all of it
  // at once. The files are held in the vault and the tags do the
  // work — a record's tier never requires its file to move.

  function headedFamily(): Family | undefined {
    if (!user) return undefined;
    return families.find((f) => f.ownerId === user.uid || familyHeadUid(f) === user.uid);
  }

  function headedStorage(): FamilyStorage | undefined {
    return headedFamily()?.storage;
  }

  async function resolveBackupFolderId(token: string): Promise<string> {
    const st = headedStorage();
    if (st?.rootChoice === 'custom' && st.rootId) {
      return ensureStewardSubfolder(token, st.rootId, 'Steward Backups');
    }
    return ensureStewardBackupFolder(token);
  }

  // Backup everything, every day (Jason, 2026-11-21): while Drive
  // is connected, the desk writes one whole-desk snapshot a day to
  // the Steward Backups folder on its own — records, families,
  // circles, households, notes, briefings, finances above all. The
  // day stamp lives in this browser; a day with no open desk gets
  // its snapshot on the next open instead.
  const autoBackupDataRef = useRef<Parameters<typeof buildWorkspaceJsonBackup>[0] | null>(null);
  autoBackupDataRef.current = {
    tasks,
    documents,
    propertyEntries,
    financeEntries,
    voiceMemories,
    households,
    householdMembers,
    families,
    circles,
    jasonNotes,
    briefings,
    mailBriefings: ownMailBriefings,
    circleBriefings: ownCircleBriefings,
    accountRecords,
    credentials,
    directoryEntries,
    emergencySheets,
  };
  const autoBackupBusyRef = useRef(false);
  useEffect(() => {
    if (!user || !driveConnected) return;
    const key = `steward-auto-backup-${user.uid}`;
    if (localStorage.getItem(key) === localDateKey()) return;
    const timer = setTimeout(() => {
      void (async () => {
        if (autoBackupBusyRef.current) return;
        if (localStorage.getItem(key) === localDateKey()) return;
        const token = getDriveAccessToken();
        const rawData = autoBackupDataRef.current;
        if (!token || !rawData) return;
        // The family head's backup toggle governs the automatic
        // backups: off means off, manual means the button only,
        // weekly means a week between snapshots. Families whose
        // head turned their backups off contribute no records.
        const myFams = (rawData.families || []).filter(
          (f) => f.ownerId === user.uid || familyHeadUid(f) === user.uid
        );
        const st = myFams.find((f) => f.storage)?.storage;
        if (st?.backupsEnabled === false || st?.backupFrequency === 'manual') return;
        if (st?.backupFrequency === 'weekly') {
          const last = localStorage.getItem(key);
          if (last) {
            const days = Math.floor(
              (new Date(localDateKey()).getTime() - new Date(last).getTime()) / 86400000
            );
            if (Number.isFinite(days) && days < 7) return;
          }
        }
        const offFamilyIds = new Set(
          myFams.filter((f) => f.storage?.backupsEnabled === false).map((f) => f.id)
        );
        const dropOff = <T extends { familyId?: string }>(items: T[]): T[] =>
          items.filter((r) => !r.familyId || !offFamilyIds.has(r.familyId));
        let data = {
          ...rawData,
          tasks: dropOff(rawData.tasks),
          documents: dropOff(rawData.documents),
          propertyEntries: dropOff(rawData.propertyEntries),
          financeEntries: dropOff(rawData.financeEntries),
          jasonNotes: dropOff(rawData.jasonNotes || []),
          accountRecords: dropOff(rawData.accountRecords || []),
          directoryEntries: dropOff(rawData.directoryEntries || []),
          emergencySheets: dropOff(rawData.emergencySheets || []),
        };
        if (st?.backupScope === 'documents') {
          data = {
            ...data,
            tasks: [],
            propertyEntries: [],
            financeEntries: [],
            voiceMemories: [],
            jasonNotes: [],
            accountRecords: [],
            credentials: [],
            directoryEntries: [],
            emergencySheets: [],
          };
        } else if (st?.backupScope === 'finances-official') {
          data = {
            ...data,
            tasks: [],
            propertyEntries: [],
            voiceMemories: [],
            jasonNotes: [],
            accountRecords: [],
            directoryEntries: [],
            emergencySheets: [],
            documents: data.documents.filter(
              (d) => d.recordKind === 'official' || d.recordKind === 'financial'
            ),
          };
        }
        autoBackupBusyRef.current = true;
        try {
          const folderId =
            st?.rootChoice === 'custom' && st.rootId
              ? await ensureStewardSubfolder(token, st.rootId, 'Steward Backups')
              : await ensureStewardBackupFolder(token);
          await createDriveBackupFile(token, {
            folderId,
            name: `steward-auto-backup-${localDateKey()}.json`,
            mimeType: 'application/json',
            content: buildWorkspaceJsonBackup(data),
          });
          localStorage.setItem(key, localDateKey());
        } catch {
          // A failed snapshot tries again on the next open; the
          // manual backup in Settings remains as it was.
        } finally {
          autoBackupBusyRef.current = false;
        }
      })();
    }, 6000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, driveConnected]);

  // The circle add-on (Jason, 2026-11-21): briefings are drawn by
  // circles of contact. Once per reader per day, the desk writes a
  // personal add-on from the records this reader's family ring and
  // circles hold — visible lists only, so the head's omissions and
  // the finance switch have already done their work before a line
  // is picked. Saved to circleBriefings, owner-only, and never
  // folded into the household's shared briefing.
  const circleBriefingInFlightRef = useRef<string>('');
  async function handleEnsureCircleBriefing(): Promise<string | null> {
    if (!user) return null;
    const dateKey = localDateKey();
    const existing = ownCircleBriefings.find((b) => b.dateKey === dateKey);
    if (existing) return existing.text;
    if (circleBriefingInFlightRef.current === dateKey) return null;

    const where = (rec: { scope?: string; familyId?: string; circleIds?: string[] }) => {
      if (rec.scope === 'family') {
        return families.find((f) => f.id === rec.familyId)?.name || 'the family';
      }
      if (rec.scope === 'circles') {
        return (rec.circleIds || [])
          .map((cid) => circles.find((c) => c.id === cid)?.name || 'a circle')
          .join(', ');
      }
      return '';
    };
    const lines: string[] = [];
    visibleTasks
      .filter((t) => t.status === 'pending' && (t.scope === 'family' || t.scope === 'circles'))
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
      .slice(0, 15)
      .forEach((t) =>
        lines.push(
          `TASK [${where(t)}]: ${t.title} — due ${t.dueDate}${t.dueTime ? ` at ${t.dueTime}` : ''}${t.place ? ` (${t.place})` : ''}`
        )
      );
    visibleDocuments
      .filter((d) => d.scope === 'family' || d.scope === 'circles')
      .slice(0, 8)
      .forEach((d) => lines.push(`PAPER [${where(d)}]: ${d.title}${d.place ? ` (${d.place})` : ''}`));
    visibleFinanceEntries
      .filter((e) => e.scope === 'family' || e.scope === 'circles')
      .slice(0, 8)
      .forEach((e) =>
        lines.push(
          `MONEY [${where(e)}]: ${e.title} — $${e.amount.toFixed(2)} on ${e.entryDate}${e.place ? ` (${e.place})` : ''}`
        )
      );
    visiblePropertyEntries
      .filter((e) => e.scope === 'family' || e.scope === 'circles')
      .slice(0, 6)
      .forEach((e) => lines.push(`PROPERTY [${where(e)}]: ${e.title} — ${e.scheduledDate}`));
    if (lines.length === 0) return null;

    circleBriefingInFlightRef.current = dateKey;
    try {
      const resp = await fetch('/api/assistant/briefing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'circles',
          context: {
            userName: userProfile?.displayName || user.displayName || 'Steward User',
            addressName: userProfile?.addressName || '',
            aiAccess: userProfile?.aiAccess !== false,
            currentDateTime: new Date().toLocaleString('en-US', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
            }),
            circleSummary: lines.join('\n'),
          },
        }),
      });
      if (!resp.ok) return null;
      const data = (await resp.json()) as { briefing?: string };
      const text = String(data.briefing || '').trim();
      if (!text) return null;
      const stamp = householdStamp();
      const id = `circlebrief-${user.uid.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40)}-${dateKey}`;
      await setDoc(doc(db, 'circleBriefings', id), {
        userId: user.uid,
        householdId: stamp.householdId,
        dateKey,
        text: text.slice(0, 4000),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return text;
    } catch (err) {
      console.error('Circle briefing failed', err);
      return null;
    } finally {
      circleBriefingInFlightRef.current = '';
    }
  }

  // The answering desk's screen opens behind the front door panel.
  function handleDeskEngaged(desk: FrontDoorDeskId) {
    if (desk === 'records') setActiveTab('vault');
    else if (desk === 'appointments') setActiveTab('schedule');
    else if (desk === 'finance') setActiveTab('finances');
  }

  // She asked the desk to file a paper and the branch is settled: close
  // the door so the camera has the whole screen, open the vault scanner
  // with the place already chosen.
  function handleCaptureDocument(place: string) {
    capturePresetArmedRef.current = true;
    setScannerPresetPlace(place);
    setActiveTab('vault');
    setScannerTriggerCount((c) => c + 1);
    setFrontDoorOpen(false);
  }

  // The vault saved a paper that came from the front door's camera: the
  // door comes back and tells her, in words, exactly what was filed.
  function handleFrontDoorDocumentSaved(info: { title: string; place: string }) {
    if (!capturePresetArmedRef.current) return;
    capturePresetArmedRef.current = false;
    const p = info.place || scannerPresetPlace;
    const placePhrase = p.startsWith('Riva Jade — ')
      ? `the ${p.replace('Riva Jade — ', '').toLowerCase()} in Wimberley`
      : p === 'Riva Jade'
        ? 'Wimberley'
        : p || 'the desk';
    setScannerPresetPlace('');
    setFrontDoorNotice({
      id: Date.now(),
      text: `We're done. I've filed "${info.title}" under ${placePhrase}. I've read it and added it to the records for you.`,
    });
    setFrontDoorOpen(true);
  }

  // Document Vault Handlers
  async function handleSaveDocument(
    payload: Omit<
      ScannedDocument,
      | 'id'
      | 'userId'
      | 'createdAt'
      | 'updatedAt'
      | 'householdId'
      | 'memberIds'
      | 'verificationStatus'
      | 'verifiedByName'
      | 'verifiedAtIso'
      | 'paperLocation'
      | 'driveFileId'
    > & { paperLocation?: string }
  ): Promise<string> {
    if (!user) return '';
    const id = createSafeId('doc');
    const stamp = householdStamp();
    // The photo's permanent home is Google Drive: copy it there now and
    // remember the Drive file id on the record. If Drive is not connected
    // or the copy fails, the document still saves — the Drive Backups
    // screen can make the Drive copy later and link it then.
    let driveFileId = '';
    if (payload.imageUrl && payload.imageUrl.startsWith('/api/uploads/')) {
      try {
        const token = getDriveAccessToken();
        if (token) {
          const fileName = payload.imageUrl.split('/').pop() || '';
          if (fileName) {
            const photosFolderId = await ensureStewardPhotosFolder(token);
            const existing = await listDriveBackups(token, photosFolderId);
            const found = existing.find((f) => f.name === fileName);
            if (found) {
              driveFileId = found.id;
            } else {
              const photoRes = await fetch(payload.imageUrl);
              if (photoRes.ok) {
                const blob = await photoRes.blob();
                const uploaded = await uploadDriveBinaryFile(token, {
                  folderId: photosFolderId,
                  name: fileName,
                  mimeType: blob.type || 'image/jpeg',
                  blob,
                });
                driveFileId = uploaded.id;
              }
            }
          }
        }
      } catch {
        driveFileId = '';
      }
    }
    // Sealed kinds (Jason, 2026-11-21): the words of a record whose
    // kind is set to be sealed are encrypted on this device before
    // the record is stored — Official papers from the start. Filing
    // one while the vault is locked refuses plainly rather than
    // storing the words unsealed.
    const docKind = payload.recordKind || 'personal';
    const docSealed = sealedKindsNow.includes(docKind);
    if (docSealed && !isVaultUnlocked()) {
      throw new Error('This kind of record is set to be sealed, but your vault is locked. Open Settings, unlock your vault, then file it again — or file it under a kind that is not sealed.');
    }
    const sealedOcrText = docSealed
      ? await sealIfText(payload.ocrText.slice(0, 99000))
      : payload.ocrText.slice(0, 99000);
    const sealedSummary = docSealed
      ? await sealIfText(payload.summary.slice(0, 1000))
      : payload.summary.slice(0, 1000);
    const sealedKeyDetails = docSealed
      ? await Promise.all(payload.keyDetails.slice(0, 25).map((k) => sealIfText(k.slice(0, 240))))
      : payload.keyDetails.slice(0, 25).map((k) => k.slice(0, 240));
    const sealedNotes = docSealed
      ? await sealIfText((payload.notes || '').slice(0, 2000))
      : (payload.notes || '').slice(0, 2000);
    try {
      await setDoc(doc(db, 'documents', id), {
        userId: user.uid,
        householdId: stamp.householdId,
        memberIds: stamp.memberIds,
        title: payload.title.slice(0, 200),
        category: payload.category,
        ocrText: sealedOcrText,
        summary: sealedSummary,
        tags: payload.tags.slice(0, 20).map((t) => t.slice(0, 40)),
        keyDetails: sealedKeyDetails,
        detectedDate: payload.detectedDate.slice(0, 20),
        imageUrl: payload.imageUrl.slice(0, 500),
        fileName: payload.fileName.slice(0, 200),
        notes: sealedNotes,
        verificationStatus: 'provisional',
        verifiedByName: '',
        verifiedAtIso: '',
        paperLocation: (payload.paperLocation || '').slice(0, 200),
        accountLocation: (payload.accountLocation || '').slice(0, 200),
        recordKind: payload.recordKind || 'personal',
        customKindLabel:
          payload.recordKind === 'custom' ? (payload.customKindLabel || '').slice(0, 60) : '',
        ...(docSealed ? { encrypted: true } : {}),
        driveFileId,
        place: (payload.place || '').slice(0, 60),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return id;
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `documents/${id}`);
    }
  }

  async function handleUpdateDocument(docId: string, updates: Partial<ScannedDocument>) {
    try {
      const clean: Record<string, unknown> = { updatedAt: serverTimestamp() };
      if (updates.title !== undefined) clean.title = updates.title.slice(0, 200);
      if (updates.category !== undefined) clean.category = updates.category;
      if (updates.ocrText !== undefined) clean.ocrText = updates.ocrText.slice(0, 99000);
      if (updates.summary !== undefined) clean.summary = updates.summary.slice(0, 1000);
      if (updates.tags !== undefined)
        clean.tags = updates.tags.slice(0, 20).map((t) => t.slice(0, 40));
      if (updates.keyDetails !== undefined)
        clean.keyDetails = updates.keyDetails.slice(0, 25).map((k) => k.slice(0, 240));
      if (updates.detectedDate !== undefined) clean.detectedDate = updates.detectedDate.slice(0, 20);
      if (updates.notes !== undefined) clean.notes = updates.notes.slice(0, 2000);
      if (updates.verificationStatus !== undefined)
        clean.verificationStatus = updates.verificationStatus;
      if (updates.recordKind !== undefined) clean.recordKind = updates.recordKind;
      if (updates.customKindLabel !== undefined)
        clean.customKindLabel = updates.customKindLabel.slice(0, 60);
      if (updates.verifiedByName !== undefined)
        clean.verifiedByName = updates.verifiedByName.slice(0, 120);
      if (updates.verifiedAtIso !== undefined)
        clean.verifiedAtIso = updates.verifiedAtIso.slice(0, 40);
      if (updates.paperLocation !== undefined)
        clean.paperLocation = updates.paperLocation.slice(0, 200);
      if (updates.accountLocation !== undefined)
        clean.accountLocation = updates.accountLocation.slice(0, 200);
      if (updates.driveFileId !== undefined)
        clean.driveFileId = updates.driveFileId.slice(0, 128);
      if (updates.place !== undefined) clean.place = updates.place.slice(0, 60);
      const existingDoc = documents.find((r) => r.id === docId);
      if (existingDoc) {
        clean.householdId = existingDoc.householdId || '';
        clean.memberIds =
          existingDoc.memberIds && existingDoc.memberIds.length > 0
            ? existingDoc.memberIds
            : [existingDoc.userId];
        if (clean.verificationStatus === undefined)
          clean.verificationStatus = existingDoc.verificationStatus || 'provisional';
        if (clean.verifiedByName === undefined)
          clean.verifiedByName = existingDoc.verifiedByName || '';
        if (clean.verifiedAtIso === undefined)
          clean.verifiedAtIso = existingDoc.verifiedAtIso || '';
        if (clean.paperLocation === undefined)
          clean.paperLocation = existingDoc.paperLocation || '';
        if (clean.driveFileId === undefined)
          clean.driveFileId = existingDoc.driveFileId || '';
        if (clean.place === undefined) clean.place = existingDoc.place || '';
      }

      // Sealed records (Jason, 2026-11-21): while the vault is
      // locked, a sealed paper's words are never written from an
      // edit — the stored envelopes stay untouched. While it is
      // unlocked, words saved for a sealed kind are sealed again;
      // words saved under a kind no longer sealed go back to plain
      // and the record stops being marked sealed.
      const docKindNow = (updates.recordKind ?? existingDoc?.recordKind) || 'personal';
      const docTextTouched =
        updates.ocrText !== undefined ||
        updates.summary !== undefined ||
        updates.keyDetails !== undefined ||
        updates.notes !== undefined;
      if (docTextTouched && existingDoc?.encrypted && !isVaultUnlocked()) {
        delete clean.ocrText;
        delete clean.summary;
        delete clean.keyDetails;
        delete clean.notes;
      } else if (docTextTouched && sealedKindsNow.includes(docKindNow)) {
        if (isVaultUnlocked()) {
          if (clean.ocrText !== undefined) clean.ocrText = await sealIfText(clean.ocrText as string);
          if (clean.summary !== undefined) clean.summary = await sealIfText(clean.summary as string);
          if (clean.notes !== undefined) clean.notes = await sealIfText(clean.notes as string);
          if (Array.isArray(clean.keyDetails))
            clean.keyDetails = await Promise.all(
              (clean.keyDetails as string[]).map((k) => sealIfText(k))
            );
          clean.encrypted = true;
        } else {
          delete clean.ocrText;
          delete clean.summary;
          delete clean.keyDetails;
          delete clean.notes;
        }
      } else if (docTextTouched && existingDoc?.encrypted) {
        clean.encrypted = false;
      }

      await updateDoc(doc(db, 'documents', docId), clean);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `documents/${docId}`);
    }
  }

  async function handleDeleteDocument(docId: string) {
    try {
      await deleteDoc(doc(db, 'documents', docId));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `documents/${docId}`);
    }
  }

  // Collaborative Projects Handlers
  async function handleCreateProject(name: string, description: string, category: Category) {
    if (!user) return;
    const projectId = createSafeId('proj');
    const displayName = userProfile?.displayName || user.displayName || 'Project Owner';
    const username = userProfile?.username || sanitizeHandle('owner', user.uid);
    try {
      const batch = writeBatch(db);
      batch.set(doc(db, 'projects', projectId), {
        projectId,
        name: name.slice(0, 120),
        description: description.slice(0, 600),
        category,
        ownerId: user.uid,
        ownerName: displayName.slice(0, 120),
        participantIds: [user.uid],
        lastInviteId: '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      batch.set(doc(db, 'projects', projectId, 'members', user.uid), {
        userId: user.uid,
        projectId,
        projectOwnerId: user.uid,
        displayName: displayName.slice(0, 120),
        username,
        role: 'owner',
        participantIds: [user.uid],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
      setSelectedProjectId(projectId);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `projects/${projectId}`);
    }
  }

  async function handleInviteUser(project: SharedProject, targetInput: string): Promise<string> {
    if (!user) return '';
    const cleaned = targetInput.trim();
    const isEmail = cleaned.includes('@') && !cleaned.startsWith('@');
    let targetEmailLower = '';
    let targetUsername = '';
    let targetUid = '';

    if (isEmail) {
      targetEmailLower = cleaned.toLowerCase();
    } else {
      const handle = cleaned.replace(/^@/, '').toLowerCase();
      if (!/^[a-z0-9_.]{3,40}$/.test(handle)) {
        throw new Error('Enter a valid email address or username handle (e.g., @alex_m).');
      }
      const handleSnap = await getDoc(doc(db, 'userHandles', handle));
      if (!handleSnap.exists()) {
        throw new Error(`No user found with username @${handle}. Try inviting by their email instead.`);
      }
      const handleData = handleSnap.data() as { userId: string; username: string };
      targetUid = handleData.userId;
      targetUsername = handleData.username;
    }

    const inviteId = createSafeId('inv');
    const inviterName = userProfile?.displayName || user.displayName || 'Collaborator';
    try {
      await setDoc(doc(db, 'projectInvites', inviteId), {
        projectId: project.projectId,
        projectName: project.name.slice(0, 120),
        inviterId: user.uid,
        inviterName: inviterName.slice(0, 120),
        targetEmailLower,
        targetUsername,
        targetUid,
        status: 'pending',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      if (targetUid && targetUid !== user.uid) {
        const notifId = createSafeId('notif');
        await setDoc(doc(db, 'notifications', notifId), {
          recipientUid: targetUid,
          actorUid: user.uid,
          actorName: inviterName.slice(0, 120),
          type: 'project_invite',
          projectId: project.projectId,
          projectName: project.name.slice(0, 120),
          taskId: '',
          message: `${inviterName} invited you to join "${project.name}"`,
          read: false,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      return isEmail
        ? `Invitation sent to ${targetEmailLower}. They will see it immediately when they sign in.`
        : `Invitation sent to @${targetUsername}.`;
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `projectInvites/${inviteId}`);
    }
  }

  async function handleRespondInvite(invite: ProjectInvite, accept: boolean) {
    if (!user) return;
    try {
      if (!accept) {
        await updateDoc(doc(db, 'projectInvites', invite.id), {
          status: 'declined',
          targetUid: user.uid,
          updatedAt: serverTimestamp(),
        });
        return;
      }

      const projRef = doc(db, 'projects', invite.projectId);
      const projSnap = await getDoc(projRef);
      if (!projSnap.exists()) return;
      const projData = projSnap.data() as SharedProject;
      const nextParticipants = projData.participantIds.includes(user.uid)
        ? projData.participantIds
        : [...projData.participantIds, user.uid].slice(0, 25);

      const displayName = userProfile?.displayName || user.displayName || 'Collaborator';
      const username = userProfile?.username || sanitizeHandle('member', user.uid);

      const batch = writeBatch(db);
      batch.update(doc(db, 'projectInvites', invite.id), {
        status: 'accepted',
        targetUid: user.uid,
        updatedAt: serverTimestamp(),
      });
      if (!projData.participantIds.includes(user.uid)) {
        batch.update(projRef, {
          participantIds: nextParticipants,
          lastInviteId: invite.id,
          updatedAt: serverTimestamp(),
        });
      }
      batch.set(doc(db, 'projects', invite.projectId, 'members', user.uid), {
        userId: user.uid,
        projectId: invite.projectId,
        projectOwnerId: projData.ownerId,
        displayName: displayName.slice(0, 120),
        username,
        role: 'member',
        participantIds: nextParticipants,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      const notifId = createSafeId('notif');
      batch.set(doc(db, 'notifications', notifId), {
        recipientUid: invite.inviterId,
        actorUid: user.uid,
        actorName: displayName.slice(0, 120),
        type: 'invite_accepted',
        projectId: invite.projectId,
        projectName: invite.projectName.slice(0, 120),
        taskId: '',
        message: `${displayName} joined shared project "${invite.projectName}"`,
        read: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
      setSelectedProjectId(invite.projectId);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `projectInvites/${invite.id}`);
    }
  }

  async function handleCreateProjectTask(
    project: SharedProject,
    payload: {
      title: string;
      assigneeId: string;
      assigneeName: string;
      dueDate: string;
      estimatedMinutes: number;
      priority: TaskPriority;
      notes: string;
    }
  ) {
    if (!user) return;
    const taskId = createSafeId('ptask');
    const actorName = userProfile?.displayName || user.displayName || 'Teammate';
    try {
      const batch = writeBatch(db);
      batch.set(doc(db, 'projects', project.projectId, 'tasks', taskId), {
        projectId: project.projectId,
        projectOwnerId: project.ownerId,
        createdBy: user.uid,
        assigneeId: payload.assigneeId,
        assigneeName: payload.assigneeName.slice(0, 120),
        title: payload.title.slice(0, 200),
        dueDate: payload.dueDate,
        estimatedMinutes: Math.max(5, Math.min(1440, payload.estimatedMinutes || 30)),
        priority: payload.priority,
        status: 'pending',
        notes: (payload.notes || '').slice(0, 1500),
        completedBy: '',
        completedAtIso: '',
        participantIds: project.participantIds.slice(0, 25),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      if (payload.assigneeId && payload.assigneeId !== user.uid) {
        const notifId = createSafeId('notif');
        batch.set(doc(db, 'notifications', notifId), {
          recipientUid: payload.assigneeId,
          actorUid: user.uid,
          actorName: actorName.slice(0, 120),
          type: 'task_assigned',
          projectId: project.projectId,
          projectName: project.name.slice(0, 120),
          taskId,
          message: `${actorName} assigned you "${payload.title}" in ${project.name}`,
          read: false,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      await batch.commit();
    } catch (err) {
      handleFirestoreError(
        err,
        OperationType.CREATE,
        `projects/${project.projectId}/tasks/${taskId}`
      );
    }
  }

  async function handleToggleProjectTask(project: SharedProject, task: ProjectTask) {
    if (!user) return;
    const actorName = userProfile?.displayName || user.displayName || 'Teammate';
    try {
      const batch = writeBatch(db);
      const taskRef = doc(db, 'projects', project.projectId, 'tasks', task.id);
      if (task.status === 'pending') {
        batch.update(taskRef, {
          status: 'completed',
          completedBy: actorName.slice(0, 120),
          completedAtIso: new Date().toISOString(),
          updatedAt: serverTimestamp(),
        });

        // Notify project owner / creator / other participants
        const recipients = Array.from(
          new Set([project.ownerId, task.createdBy, ...project.participantIds])
        ).filter((uid) => uid && uid !== user.uid);

        for (const recipientUid of recipients.slice(0, 10)) {
          const notifId = createSafeId('notif');
          batch.set(doc(db, 'notifications', notifId), {
            recipientUid,
            actorUid: user.uid,
            actorName: actorName.slice(0, 120),
            type: 'task_completed',
            projectId: project.projectId,
            projectName: project.name.slice(0, 120),
            taskId: task.id,
            message: `${actorName} completed "${task.title}" in ${project.name}`,
            read: false,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
      } else {
        batch.update(taskRef, {
          status: 'pending',
          completedBy: '',
          completedAtIso: '',
          updatedAt: serverTimestamp(),
        });
      }
      await batch.commit();
    } catch (err) {
      handleFirestoreError(
        err,
        OperationType.UPDATE,
        `projects/${project.projectId}/tasks/${task.id}`
      );
    }
  }

  async function handleDeleteProjectTask(projectId: string, taskId: string) {
    try {
      await deleteDoc(doc(db, 'projects', projectId, 'tasks', taskId));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `projects/${projectId}/tasks/${taskId}`);
    }
  }

  async function handleMarkNotificationRead(notificationId: string) {
    try {
      await updateDoc(doc(db, 'notifications', notificationId), {
        read: true,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `notifications/${notificationId}`);
    }
  }

  // Voice Memory Handlers
  async function handleCompleteTaskByTitle(
    titleQuery: string,
    completionState: 'finished' | 'more' = 'finished',
    remainderNote = ''
  ): Promise<string | null> {
    const q = titleQuery.trim().toLowerCase();
    const match = tasks.find(
      (t) => t.status === 'pending' && t.title.toLowerCase().includes(q)
    );
    if (!match) return null;
    await handleCompleteTask(match, completionState, remainderNote);
    return match.title;
  }

  // Browsing is its own request: the calendar comes forward and the
  // short version is read aloud from here, because the front door has
  // stepped aside by the time the words are spoken.
  function handleShowCalendar(summary: string) {
    setActiveTab('schedule');
    setFrontDoorOpen(false);
    if (userProfile?.voiceMuted) return;
    try {
      if (!('speechSynthesis' in window)) return;
      const clean = summary.replace(/[*#`_>]/g, '').replace(/\s+/g, ' ').trim();
      if (!clean) return;
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(clean.slice(0, 600));
      utterance.rate = 1;
      window.speechSynthesis.speak(utterance);
    } catch {
      // Speech is a courtesy layer; the calendar is already on screen.
    }
  }

  async function handleSaveVoiceMemory(payload: {
    summary: string;
    followUpSteps: string[];
    completedTaskTitles: string[];
    transcriptExcerpt: string;
  }) {
    if (!user) return;
    const id = createSafeId('mem');
    try {
      await setDoc(doc(db, 'voiceMemories', id), {
        userId: user.uid,
        summary: payload.summary.slice(0, 1500),
        followUpSteps: payload.followUpSteps.slice(0, 15).map((s) => s.slice(0, 300)),
        completedTaskTitles: payload.completedTaskTitles.slice(0, 20).map((s) => s.slice(0, 200)),
        transcriptExcerpt: payload.transcriptExcerpt.slice(0, 15000),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `voiceMemories/${id}`);
    }
  }

  async function handleDeleteVoiceMemory(memoryId: string) {
    try {
      await deleteDoc(doc(db, 'voiceMemories', memoryId));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `voiceMemories/${memoryId}`);
    }
  }

  // Wimberley Property Monitor Handlers
  async function handleCreatePropertyEntry(
    payload: Omit<PropertyEntry, 'id' | 'userId' | 'createdAt' | 'updatedAt' | 'householdId' | 'memberIds'>
  ) {
    if (!user) return;
    const id = createSafeId('prop');
    const stamp = householdStamp();
    const propKind = payload.recordKind || 'personal';
    const propSealed = sealedKindsNow.includes(propKind);
    if (propSealed && !isVaultUnlocked()) {
      throw new Error('This kind of record is set to be sealed, but your vault is locked. Open Settings, unlock your vault, then file it again — or file it under a kind that is not sealed.');
    }
    const propNotes = propSealed
      ? await sealIfText((payload.notes || '').slice(0, 2000))
      : (payload.notes || '').slice(0, 2000);
    try {
      await setDoc(doc(db, 'propertyEntries', id), {
        userId: user.uid,
        householdId: stamp.householdId,
        memberIds: stamp.memberIds,
        area: payload.area,
        place: (payload.place || '').slice(0, 60),
        title: payload.title.slice(0, 200),
        status: payload.status,
        scheduledDate: payload.scheduledDate,
        endDate: payload.endDate || '',
        cadence: payload.cadence,
        inspectorOrGuest: (payload.inspectorOrGuest || '').slice(0, 120),
        notes: propNotes,
        linkedDocumentId: (payload.linkedDocumentId || '').slice(0, 128),
        recordKind: payload.recordKind || 'personal',
        customKindLabel:
          payload.recordKind === 'custom' ? (payload.customKindLabel || '').slice(0, 60) : '',
        ...(propSealed ? { encrypted: true } : {}),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `propertyEntries/${id}`);
    }
  }

  async function handleUpdatePropertyEntry(entryId: string, updates: Partial<PropertyEntry>) {
    if (!user) return;
    try {
      const clean: Record<string, unknown> = { updatedAt: serverTimestamp() };
      const existingRec = propertyEntries.find((r) => r.id === entryId);
      if (existingRec) {
        clean.householdId = existingRec.householdId || '';
        clean.memberIds =
          existingRec.memberIds && existingRec.memberIds.length > 0
            ? existingRec.memberIds
            : [existingRec.userId];
      }

      if (updates.area !== undefined) clean.area = updates.area;
      if (updates.title !== undefined) clean.title = updates.title.slice(0, 200);
      if (updates.status !== undefined) clean.status = updates.status;
      if (updates.scheduledDate !== undefined) clean.scheduledDate = updates.scheduledDate;
      if (updates.endDate !== undefined) clean.endDate = updates.endDate;
      if (updates.cadence !== undefined) clean.cadence = updates.cadence;
      if (updates.inspectorOrGuest !== undefined)
        clean.inspectorOrGuest = updates.inspectorOrGuest.slice(0, 120);
      if (updates.notes !== undefined) clean.notes = updates.notes.slice(0, 2000);
      if (updates.linkedDocumentId !== undefined)
        clean.linkedDocumentId = updates.linkedDocumentId.slice(0, 128);
      if (updates.place !== undefined) clean.place = updates.place.slice(0, 60);
      if (updates.recordKind !== undefined) clean.recordKind = updates.recordKind;
      // Sealed note (Jason, 2026-11-21): a sealed record's note is
      // never written from a locked edit, is sealed again on save
      // while the vault is unlocked, and returns to plain when its
      // kind is no longer sealed.
      if (clean.notes !== undefined) {
        if (existingRec?.encrypted && !isVaultUnlocked()) {
          delete clean.notes;
        } else if (isSealedValue(clean.notes as string)) {
          delete clean.notes;
        } else if (sealedKindsNow.includes((updates.recordKind ?? existingRec?.recordKind) || 'personal')) {
          if (isVaultUnlocked()) {
            clean.notes = await sealIfText(clean.notes as string);
            clean.encrypted = true;
          } else {
            delete clean.notes;
          }
        } else if (existingRec?.encrypted) {
          clean.encrypted = false;
        }
      }
      if (updates.customKindLabel !== undefined)
        clean.customKindLabel = updates.customKindLabel.slice(0, 60);

      await updateDoc(doc(db, 'propertyEntries', entryId), clean);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `propertyEntries/${entryId}`);
    }
  }

  async function handleDeletePropertyEntry(entryId: string) {
    try {
      await deleteDoc(doc(db, 'propertyEntries', entryId));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `propertyEntries/${entryId}`);
    }
  }

  // Finance & Expenditure Grouping Handlers
  async function handleCreateFinanceEntry(
    payload: Omit<FinanceEntry, 'id' | 'userId' | 'createdAt' | 'updatedAt' | 'householdId' | 'memberIds'>
  ) {
    if (!user) return;
    const id = createSafeId('fin');
    const stamp = householdStamp();
    const finSealed = sealedKindsNow.includes('financial') && isVaultUnlocked();
    const finNotes = finSealed
      ? await sealIfText((payload.notes || '').slice(0, 2000))
      : (payload.notes || '').slice(0, 2000);
    try {
      await setDoc(doc(db, 'financeEntries', id), {
        userId: user.uid,
        householdId: stamp.householdId,
        memberIds: stamp.memberIds,
        kind: payload.kind,
        group: payload.group.slice(0, 80),
        title: payload.title.slice(0, 200),
        amount: Math.max(0, Math.min(10000000, Number(payload.amount) || 0)),
        entryDate: payload.entryDate,
        vendor: (payload.vendor || '').slice(0, 120),
        accountLocation: (payload.accountLocation || '').slice(0, 200),
        place: (payload.place || '').slice(0, 60),
        careForJason: Boolean(payload.careForJason),
        taxDeductible: Boolean(payload.taxDeductible),
        notes: finNotes,
        linkedDocumentId: (payload.linkedDocumentId || '').slice(0, 128),
        ...(finSealed ? { encrypted: true } : {}),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `financeEntries/${id}`);
    }
  }

  async function handleUpdateFinanceEntry(entryId: string, updates: Partial<FinanceEntry>) {
    if (!user) return;
    try {
      const clean: Record<string, unknown> = { updatedAt: serverTimestamp() };
      const existingRec = financeEntries.find((r) => r.id === entryId);
      if (existingRec) {
        clean.householdId = existingRec.householdId || '';
        clean.memberIds =
          existingRec.memberIds && existingRec.memberIds.length > 0
            ? existingRec.memberIds
            : [existingRec.userId];
      }

      if (updates.kind !== undefined) clean.kind = updates.kind;
      if (updates.group !== undefined) clean.group = updates.group.slice(0, 80);
      if (updates.title !== undefined) clean.title = updates.title.slice(0, 200);
      if (updates.amount !== undefined)
        clean.amount = Math.max(0, Math.min(10000000, Number(updates.amount) || 0));
      if (updates.entryDate !== undefined) clean.entryDate = updates.entryDate;
      if (updates.vendor !== undefined) clean.vendor = updates.vendor.slice(0, 120);
      if (updates.accountLocation !== undefined)
        clean.accountLocation = updates.accountLocation.slice(0, 200);
      if (updates.place !== undefined) clean.place = updates.place.slice(0, 60);
      if (updates.careForJason !== undefined) clean.careForJason = Boolean(updates.careForJason);
      if (updates.taxDeductible !== undefined) clean.taxDeductible = Boolean(updates.taxDeductible);
      if (updates.notes !== undefined) clean.notes = updates.notes.slice(0, 2000);
      // Sealed note (Jason, 2026-11-21): a sealed record's note is
      // never written from a locked edit, is sealed again on save
      // while the vault is unlocked, and returns to plain when its
      // kind is no longer sealed.
      if (clean.notes !== undefined) {
        if (existingRec?.encrypted && !isVaultUnlocked()) {
          delete clean.notes;
        } else if (isSealedValue(clean.notes as string)) {
          delete clean.notes;
        } else if (sealedKindsNow.includes('financial')) {
          if (isVaultUnlocked()) {
            clean.notes = await sealIfText(clean.notes as string);
            clean.encrypted = true;
          } else {
            delete clean.notes;
          }
        } else if (existingRec?.encrypted) {
          clean.encrypted = false;
        }
      }
      if (updates.linkedDocumentId !== undefined)
        clean.linkedDocumentId = updates.linkedDocumentId.slice(0, 128);

      await updateDoc(doc(db, 'financeEntries', entryId), clean);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `financeEntries/${entryId}`);
    }
  }

  async function handleDeleteFinanceEntry(entryId: string) {
    try {
      await deleteDoc(doc(db, 'financeEntries', entryId));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `financeEntries/${entryId}`);
    }
  }

  // Family Household Handlers
  async function handleCreateHousehold(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    const name = householdNameDraft.trim().slice(0, 120);
    if (!name) {
      setHouseholdFeedback('Give the household a name first.');
      return;
    }
    const householdId = createSafeId('hh');
    const displayName = userProfile?.displayName || user.displayName || 'Household Owner';
    const username = userProfile?.username || sanitizeHandle('owner', user.uid);
    try {
      const batch = writeBatch(db);
      batch.set(doc(db, 'households', householdId), {
        householdId,
        name,
        ownerId: user.uid,
        ownerName: displayName.slice(0, 120),
        memberIds: [user.uid],
        invitedEmails: [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      batch.set(doc(db, 'households', householdId, 'members', user.uid), {
        userId: user.uid,
        householdId,
        householdOwnerId: user.uid,
        displayName: displayName.slice(0, 120),
        username,
        role: 'owner',
        memberIds: [user.uid],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
      switchHousehold(householdId);
      setHouseholdNameDraft('');
      setHouseholdFeedback(
        `Household "${name}" is ready. Invite your family by email and their records will join yours here.`
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `households/${householdId}`);
    }
  }

  async function handleInviteToHousehold(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !activeHousehold) return;
    const email = householdInviteDraft.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setHouseholdFeedback('Enter a valid email address to invite.');
      return;
    }
    if (activeHousehold.invitedEmails.includes(email)) {
      setHouseholdFeedback(`${email} is already invited.`);
      return;
    }
    try {
      await updateDoc(doc(db, 'households', activeHousehold.householdId), {
        invitedEmails: [...activeHousehold.invitedEmails, email].slice(0, 25),
        updatedAt: serverTimestamp(),
      });
      setHouseholdInviteDraft('');
      setHouseholdFeedback(
        `Invited ${email}. When they sign in with that email, the invitation will be waiting here.`
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `households/${activeHousehold.householdId}`);
    }
  }

  async function handleJoinHousehold(household: Household) {
    if (!user) return;
    const displayName = userProfile?.displayName || user.displayName || 'Family Member';
    const username = userProfile?.username || sanitizeHandle('member', user.uid);
    const alreadyMember = household.memberIds.includes(user.uid);
    const nextMembers = alreadyMember
      ? household.memberIds
      : [...household.memberIds, user.uid].slice(0, 25);
    try {
      const batch = writeBatch(db);
      if (!alreadyMember) {
        batch.update(doc(db, 'households', household.householdId), {
          memberIds: nextMembers,
          updatedAt: serverTimestamp(),
        });
      }
      batch.set(doc(db, 'households', household.householdId, 'members', user.uid), {
        userId: user.uid,
        householdId: household.householdId,
        householdOwnerId: household.ownerId,
        displayName: displayName.slice(0, 120),
        username,
        role: 'member',
        memberIds: nextMembers,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
      switchHousehold(household.householdId);
      setHouseholdFeedback(`You joined "${household.name}".`);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `households/${household.householdId}`);
    }
  }

  async function handleLinkDocumentDrivePhoto(docId: string, driveFileId: string) {
    const existingDoc = documents.find((r) => r.id === docId);
    if (!existingDoc) return;
    try {
      await updateDoc(doc(db, 'documents', docId), {
        driveFileId: driveFileId.slice(0, 128),
        householdId: existingDoc.householdId || '',
        memberIds:
          existingDoc.memberIds && existingDoc.memberIds.length > 0
            ? existingDoc.memberIds
            : [existingDoc.userId],
        verificationStatus: existingDoc.verificationStatus || 'provisional',
        verifiedByName: existingDoc.verifiedByName || '',
        verifiedAtIso: existingDoc.verifiedAtIso || '',
        paperLocation: existingDoc.paperLocation || '',
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `documents/${docId}`);
    }
  }

  async function handleGenerateCalendarToken() {
    if (!user || !activeHousehold) return;
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    const token = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    try {
      await updateDoc(doc(db, 'households', activeHousehold.householdId), {
        calendarToken: token,
        updatedAt: serverTimestamp(),
      });
      setHouseholdFeedback(
        activeHousehold.calendarToken
          ? 'New subscription link created. The old link no longer works.'
          : "Subscription link created. Calendar apps that have it will keep this household's dates up to date on their own."
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `households/${activeHousehold.householdId}`);
    }
  }

  async function handleVerifyDocument(docRecord: ScannedDocument) {
    if (!user) return;
    const verifierName = userProfile?.displayName || user.displayName || 'Family member';
    try {
      await updateDoc(doc(db, 'documents', docRecord.id), {
        verificationStatus: 'verified',
        verifiedByName: verifierName.slice(0, 120),
        verifiedAtIso: new Date().toISOString(),
        householdId: docRecord.householdId || '',
        memberIds:
          docRecord.memberIds && docRecord.memberIds.length > 0
            ? docRecord.memberIds
            : [docRecord.userId],
        paperLocation: docRecord.paperLocation || '',
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `documents/${docRecord.id}`);
    }
  }

  async function handleRestoreSnapshot(
    snapshot: WorkspaceBackupSnapshot
  ): Promise<{ importedCount: number }> {
    if (!user) return { importedCount: 0 };
    let importedCount = 0;

    const existingTaskKeys = new Set(
      tasks.map((t) => `${t.title.trim().toLowerCase()}|${t.dueDate}`)
    );
    const existingDocKeys = new Set(
      documents.map((d) => `${d.title.trim().toLowerCase()}|${d.fileName.trim().toLowerCase()}`)
    );
    const existingPropKeys = new Set(
      propertyEntries.map((p) => `${p.title.trim().toLowerCase()}|${p.scheduledDate}`)
    );
    const existingFinKeys = new Set(
      financeEntries.map(
        (f) => `${f.title.trim().toLowerCase()}|${f.entryDate}|${Number(f.amount).toFixed(2)}`
      )
    );
    const existingMemKeys = new Set(
      voiceMemories.map((m) => m.summary.trim().toLowerCase())
    );

    const safeDate = (d: unknown) =>
      typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : getLocalTodayIso();
    const safeCategory = (c: unknown): Category =>
      (CATEGORIES as readonly string[]).includes(String(c)) ? (c as Category) : 'General';

    for (const t of Array.isArray(snapshot.tasks) ? snapshot.tasks : []) {
      const title = String(t.title || '').trim();
      const dueDate = safeDate(t.dueDate);
      if (!title || existingTaskKeys.has(`${title.toLowerCase()}|${dueDate}`)) continue;
      existingTaskKeys.add(`${title.toLowerCase()}|${dueDate}`);
      await handleCreateTask({
        title,
        type: t.type === 'appointment' ? 'appointment' : 'task',
        category: safeCategory(t.category),
        place: isPlaceName(t.place) ? t.place : '',
        dueDate,
        dueTime: typeof t.dueTime === 'string' ? t.dueTime : '',
        estimatedMinutes: Number(t.estimatedMinutes) || 30,
        reminderMinutes: Number(t.reminderMinutes ?? 60),
        priority: t.priority === 'high' || t.priority === 'low' ? t.priority : 'medium',
        notes: typeof t.notes === 'string' ? t.notes : '',
        helpSteps: Array.isArray(t.helpSteps) ? t.helpSteps.map(String) : [],
        linkedDocumentId: typeof t.linkedDocumentId === 'string' ? t.linkedDocumentId : '',
      });
      importedCount += 1;
    }

    for (const d of Array.isArray(snapshot.documents) ? snapshot.documents : []) {
      const title = String(d.title || '').trim();
      const fileName = String(d.fileName || 'restored-scan').trim();
      if (!title || existingDocKeys.has(`${title.toLowerCase()}|${fileName.toLowerCase()}`)) continue;
      existingDocKeys.add(`${title.toLowerCase()}|${fileName.toLowerCase()}`);
      await handleSaveDocument({
        title,
        category: safeCategory(d.category),
        place: isPlaceName(d.place) ? d.place : '',
        ocrText: typeof d.ocrText === 'string' ? d.ocrText : '',
        summary: typeof d.summary === 'string' ? d.summary : '',
        tags: Array.isArray(d.tags) ? d.tags.map(String) : [],
        keyDetails: Array.isArray(d.keyDetails) ? d.keyDetails.map(String) : [],
        detectedDate: typeof d.detectedDate === 'string' ? d.detectedDate : '',
        imageUrl: typeof d.imageUrl === 'string' ? d.imageUrl : '',
        fileName,
        notes: typeof d.notes === 'string' ? d.notes : '',
      });
      importedCount += 1;
    }

    for (const p of Array.isArray(snapshot.propertyEntries) ? snapshot.propertyEntries : []) {
      const title = String(p.title || '').trim();
      const scheduledDate = safeDate(p.scheduledDate);
      if (!title || existingPropKeys.has(`${title.toLowerCase()}|${scheduledDate}`)) continue;
      existingPropKeys.add(`${title.toLowerCase()}|${scheduledDate}`);
      const area =
        p.area === 'conservancy' || p.area === 'cabin_maintenance' || p.area === 'cabin_stay'
          ? p.area
          : 'cabin_maintenance';
      const status =
        p.status === 'nominal' ||
        p.status === 'attention' ||
        p.status === 'urgent' ||
        p.status === 'upcoming' ||
        p.status === 'ready' ||
        p.status === 'completed'
          ? p.status
          : 'upcoming';
      const cadence =
        p.cadence === 'once' ||
        p.cadence === 'monthly' ||
        p.cadence === 'quarterly' ||
        p.cadence === 'seasonal' ||
        p.cadence === 'annual'
          ? p.cadence
          : 'once';
      await handleCreatePropertyEntry({
        area,
        place: isPlaceName(p.place) ? p.place : '',
        title,
        status,
        scheduledDate,
        endDate:
          typeof p.endDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(p.endDate)
            ? p.endDate
            : '',
        cadence,
        inspectorOrGuest: typeof p.inspectorOrGuest === 'string' ? p.inspectorOrGuest : '',
        notes: typeof p.notes === 'string' ? p.notes : '',
        linkedDocumentId: typeof p.linkedDocumentId === 'string' ? p.linkedDocumentId : '',
      });
      importedCount += 1;
    }

    for (const f of Array.isArray(snapshot.financeEntries) ? snapshot.financeEntries : []) {
      const title = String(f.title || '').trim();
      const entryDate = safeDate(f.entryDate);
      const amount = Math.max(0, Number(f.amount) || 0);
      const key = `${title.toLowerCase()}|${entryDate}|${amount.toFixed(2)}`;
      if (!title || existingFinKeys.has(key)) continue;
      existingFinKeys.add(key);
      const legacyScopePlaces: Record<string, string> = {
        wimberley_conservancy: 'Riva Jade — Wildlife Conservancy',
        wimberley_cabin: 'Riva Jade — Rental Cabin',
      };
      const place = isPlaceName(f.place)
        ? f.place
        : legacyScopePlaces[String((f as unknown as { propertyScope?: string }).propertyScope || '')] || '';
      await handleCreateFinanceEntry({
        kind: f.kind === 'income' ? 'income' : 'expense',
        group: String(f.group || 'General').trim() || 'General',
        title,
        amount,
        entryDate,
        vendor: typeof f.vendor === 'string' ? f.vendor : '',
        place,
        careForJason: Boolean(f.careForJason),
        taxDeductible: Boolean(f.taxDeductible),
        notes: typeof f.notes === 'string' ? f.notes : '',
        linkedDocumentId: typeof f.linkedDocumentId === 'string' ? f.linkedDocumentId : '',
      });
      importedCount += 1;
    }

    for (const m of Array.isArray(snapshot.voiceMemories) ? snapshot.voiceMemories : []) {
      const summary = String(m.summary || '').trim();
      if (!summary || existingMemKeys.has(summary.toLowerCase())) continue;
      existingMemKeys.add(summary.toLowerCase());
      await handleSaveVoiceMemory({
        summary,
        followUpSteps: Array.isArray(m.followUpSteps) ? m.followUpSteps.map(String) : [],
        completedTaskTitles: Array.isArray(m.completedTaskTitles)
          ? m.completedTaskTitles.map(String)
          : [],
        transcriptExcerpt: typeof m.transcriptExcerpt === 'string' ? m.transcriptExcerpt : '',
      });
      importedCount += 1;
    }


    // Pass 13 (Jason, 2026-11-21): a restore restores everything
    // within its family circle — every document, every category,
    // every relationship, fit to the tree. What follows brings
    // back the rest of the desk for the records the restorer owns:
    // notes, accounts with their credentials, the directory, and
    // the structure itself — families and circles. Another
    // member's own records are theirs: they come back on that
    // member's own device, from the same backup, under their own
    // sign-in. A restore never writes outside the restorer's own
    // authority.
    const existingNoteKeys = new Set(
      jasonNotes.filter((n) => n.userId === user.uid).map((n) => n.text.trim().toLowerCase())
    );
    for (const n of Array.isArray(snapshot.jasonNotes) ? snapshot.jasonNotes : []) {
      if (n.userId !== user.uid) continue;
      const text = String(n.text || '').trim();
      if (!text || existingNoteKeys.has(text.toLowerCase())) continue;
      existingNoteKeys.add(text.toLowerCase());
      await handleCreateJasonNote(text, 'assistant');
      importedCount += 1;
    }

    const restoreOwnDoc = async (
      collectionName: string,
      raw: Record<string, unknown>,
      ownerValue: unknown
    ): Promise<boolean> => {
      if (ownerValue !== user.uid) return false;
      const id = raw.id;
      if (typeof id !== 'string' || !id) return false;
      try {
        const ref = doc(db, collectionName, id);
        const existing = await getDoc(ref);
        if (existing.exists()) return false;
        const fields: Record<string, unknown> = { ...raw };
        delete fields.createdAt;
        delete fields.updatedAt;
        await setDoc(ref, {
          ...fields,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        return true;
      } catch {
        return false;
      }
    };

    for (const c of Array.isArray(snapshot.credentials) ? snapshot.credentials : []) {
      if (await restoreOwnDoc('credentials', c as Record<string, unknown>, (c as { ownerId?: string }).ownerId)) {
        importedCount += 1;
      }
    }
    for (const a of Array.isArray(snapshot.accountRecords) ? snapshot.accountRecords : []) {
      if (await restoreOwnDoc('accountRecords', a as Record<string, unknown>, (a as { userId?: string }).userId)) {
        importedCount += 1;
      }
    }
    for (const d of Array.isArray(snapshot.directoryEntries) ? snapshot.directoryEntries : []) {
      if (await restoreOwnDoc('directoryEntries', d as Record<string, unknown>, (d as { userId?: string }).userId)) {
        importedCount += 1;
      }
    }
    for (const sh of Array.isArray(snapshot.emergencySheets) ? snapshot.emergencySheets : []) {
      if (await restoreOwnDoc('emergencySheets', sh as Record<string, unknown>, (sh as { userId?: string }).userId)) {
        importedCount += 1;
      }
    }
    for (const f of Array.isArray(snapshot.families) ? snapshot.families : []) {
      if (await restoreOwnDoc('families', f as Record<string, unknown>, (f as { ownerId?: string }).ownerId)) {
        importedCount += 1;
      }
    }
    for (const c of Array.isArray(snapshot.circles) ? snapshot.circles : []) {
      if (await restoreOwnDoc('circles', c as Record<string, unknown>, (c as { ownerId?: string }).ownerId)) {
        importedCount += 1;
      }
    }

    // The head-head's restore reaches the whole tier (Jason,
    // 2026-11-21): if the restorer heads a family, the restore
    // writes its directive there, and the members' devices will
    // restore their own records from this same backup. No
    // sub-head's setting blocks it.
    if (user) {
      const headed = families.filter(
        (f) => f.ownerId === user.uid || familyHeadUid(f) === user.uid
      );
      const directive = {
        snapshotExportedAtIso: String(snapshot.exportedAtIso || ''),
        atIso: new Date().toISOString(),
        byName: userProfile?.displayName || user.displayName || 'The family head',
      };
      for (const fam of headed) {
        try {
          await updateDoc(doc(db, 'families', fam.id), {
            restoreDirective: directive,
            updatedAt: serverTimestamp(),
          });
        } catch {
          // The restore itself already landed; a directive that
          // fails to write is retried by the next restore.
        }
      }
      // Of all circles, however they fit (Jason, 2026-11-21):
      // the same directive lands on every circle the restorer
      // heads, and its members restore their own records from
      // the same backup.
      const headedCircles = circles.filter(
        (c) => c.ownerId === user.uid || circleHeadIds(c).includes(user.uid)
      );
      for (const circle of headedCircles) {
        try {
          await updateDoc(doc(db, 'circles', circle.id), {
            restoreDirective: directive,
            updatedAt: serverTimestamp(),
          });
        } catch {
          // Same as above — the restore landed; the directive
          // is retried by the next one.
        }
      }
    }

    return { importedCount };
  }

  async function handleUpdateUsername(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !userProfile) return;
    const clean = editUsername.trim().toLowerCase().replace(/^@/, '');
    if (!/^[a-z0-9_.]{3,40}$/.test(clean)) {
      setUsernameFeedback('Username must be 3–40 characters (a-z, 0-9, _, .).');
      return;
    }
    if (clean === userProfile.username) {
      setUsernameFeedback('That is already your active username.');
      return;
    }
    try {
      const existingSnap = await getDoc(doc(db, 'userHandles', clean));
      if (existingSnap.exists()) {
        setUsernameFeedback('That username is already taken.');
        return;
      }
      const batch = writeBatch(db);
      batch.set(doc(db, 'userHandles', clean), {
        userId: user.uid,
        username: clean,
        displayName: userProfile.displayName,
        photoURL: userProfile.photoURL,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      batch.update(doc(db, 'users', user.uid), {
        username: clean,
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
      setUsernameFeedback(`Updated handle to @${clean}`);
    } catch (err) {
      setUsernameFeedback(err instanceof Error ? err.message : 'Unable to update username.');
    }
  }

  const unreadAlertsCount =
    notifications.filter((n) => !n.read).length + incomingInvites.length;

  const sharedTasksWithProject = useMemo(() => {
    const activeProj = projects.find((p) => p.projectId === selectedProjectId) || projects[0];
    return projectTasks.map((pt) => ({
      ...pt,
      projectName: activeProj?.name || 'Shared Project',
    }));
  }, [projectTasks, projects, selectedProjectId]);

  if (!authReady) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center">
        <div className="text-sm font-medium text-slate-600 dark:text-slate-400">
          Loading Steward workspace...
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <WelcomeSignInView
        authError={authError}
        onSignIn={async () => {
          setAuthError(null);
          try {
            await signInWithGoogle();
          } catch (err) {
            setAuthError(err instanceof Error ? err.message : 'Sign-in cancelled or failed.');
          }
        }}
      />
    );
  }

  const propertyAlertCount = propertyEntries.filter(
    (e) => e.status === 'attention' || e.status === 'urgent'
  ).length;

  const navItems: Array<{
    id: NavTab;
    label: string;
    mobileLabel?: string;
    icon: React.ReactNode;
    badge?: number;
  }> = [
    { id: 'frontdoor', label: 'Front Desk', mobileLabel: 'Front Desk', icon: <Home className="w-4 h-4" /> },
    { id: 'schedule', label: 'Schedule', icon: <Calendar className="w-4 h-4" /> },
    {
      id: 'property',
      label: 'Wimberley Property',
      mobileLabel: 'Wimberley',
      icon: <Trees className="w-4 h-4" />,
      badge: propertyAlertCount > 0 ? propertyAlertCount : undefined,
    },
    { id: 'finances', label: 'Finances', icon: <Wallet className="w-4 h-4" /> },
    { id: 'vault', label: 'OCR Vault', mobileLabel: 'Vault', icon: <FileSearch className="w-4 h-4" /> },
    {
      id: 'projects',
      label: 'Shared Lists',
      icon: <Users className="w-4 h-4" />,
      badge: unreadAlertsCount > 0 ? unreadAlertsCount : undefined,
    },
    { id: 'voice', label: 'Voice Live', mobileLabel: 'Voice', icon: <Mic className="w-4 h-4" /> },
    { id: 'tree', label: 'The Tree', icon: <Network className="w-4 h-4" /> },
    { id: 'analytics', label: 'Analytics', icon: <BarChart3 className="w-4 h-4" /> },
  ];

  const mobileBottomItems = navItems.filter((item) =>
    ['frontdoor', 'schedule', 'property', 'finances', 'vault', 'voice'].includes(item.id)
  );

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col lg:flex-row">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 p-5 justify-between">
        <div className="space-y-6">
          <div className="px-2">
            <span className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100 font-display">
              Steward
            </span>
            {activeHousehold &&
              (households.length > 1 ? (
                <select
                  value={activeHousehold.householdId}
                  onChange={(e) => switchHousehold(e.target.value)}
                  aria-label="Switch household"
                  className="mt-1 w-full text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-2 py-1.5 text-slate-700 dark:text-slate-200"
                >
                  {households.map((h) => (
                    <option key={h.householdId} value={h.householdId}>
                      {h.name}
                    </option>
                  ))}
                </select>
              ) : (
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {activeHousehold.name}
                </p>
              ))}
          </div>
          <div className="px-2">
            <label
              className="text-[11px] font-medium text-slate-500 dark:text-slate-400"
              htmlFor="sidebar-place"
            >
              Place
            </label>
            <select
              id="sidebar-place"
              value={selectedPlace}
              onChange={(e) => switchPlace(e.target.value)}
              aria-label="Show one place"
              className="mt-1 w-full text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-2 py-1.5 text-slate-700 dark:text-slate-200"
            >
              {PLACE_FILTERS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>


          <nav className="space-y-1">
            {navItems.map((item) => {
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`w-full min-h-[44px] flex items-center justify-between px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                    active
                      ? 'bg-teal-50 dark:bg-teal-950/50 text-teal-800 dark:text-teal-300'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100'
                  }`}
                >
                  <span className="flex items-center gap-3">
                    {item.icon}
                    <span>{item.label}</span>
                  </span>
                  {item.badge !== undefined && (
                    <span className="text-xs font-mono font-semibold text-teal-700 dark:text-teal-400 tabular-nums">
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="space-y-3 border-t border-slate-200 dark:border-slate-800 pt-4">
          <PWAInstallModalTrigger />

          <div className="flex items-center justify-between gap-2 px-1">
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              className="text-left min-w-0 flex-1 py-1 hover:opacity-80"
            >
              <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                {userProfile?.displayName || user.displayName}
              </p>
              <p className="text-xs font-mono text-slate-500 dark:text-slate-400 truncate">
                @{userProfile?.username || 'account'}
              </p>
            </button>
            <button
              type="button"
              aria-label="Toggle color theme"
              onClick={() => setDarkMode((d) => !d)}
              className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <button
              type="button"
              aria-label="Sign out"
              onClick={() => signOutUser()}
              className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-slate-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 lg:pl-64 flex flex-col min-w-0 pb-20 lg:pb-8">
        {/* Top Bar Contract (3 zones) */}
        <header className="sticky top-0 z-30 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-8">
            <div className="flex items-center gap-3 min-w-0">
              <span className="lg:hidden text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100 font-display whitespace-nowrap shrink-0">
                Steward
              </span>
              <span className="hidden lg:inline text-sm text-slate-500 dark:text-slate-400 whitespace-nowrap shrink-0">
                {navItems.find((i) => i.id === activeTab)?.label}
              </span>
            </div>

            <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap shrink-0">
              <button
                type="button"
                onClick={() => setActiveTab('projects')}
                className={`lg:hidden hover:text-slate-900 dark:hover:text-slate-100 transition-colors whitespace-nowrap shrink-0 ${
                  activeTab === 'projects' ? 'text-teal-700 dark:text-teal-400 font-semibold' : ''
                }`}
              >
                Shared{unreadAlertsCount > 0 ? ` (${unreadAlertsCount})` : ''}
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('analytics')}
                className={`lg:hidden hover:text-slate-900 dark:hover:text-slate-100 transition-colors whitespace-nowrap shrink-0 ${
                  activeTab === 'analytics' ? 'text-teal-700 dark:text-teal-400 font-semibold' : ''
                }`}
              >
                Analytics
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTab('vault');
                  setScannerTriggerCount((c) => c + 1);
                }}
                className="hidden sm:inline hover:text-slate-900 dark:hover:text-slate-100 transition-colors whitespace-nowrap shrink-0"
              >
                Scan Doc
              </button>
              <button
                type="button"
                onClick={() => setDriveBackupOpen(true)}
                className={`inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-slate-100 transition-colors whitespace-nowrap shrink-0 ${
                  driveConnected ? 'text-teal-700 dark:text-teal-400 font-medium' : ''
                }`}
              >
                <HardDrive className="w-3.5 h-3.5" />
                <span>Drive Backup</span>
              </button>
              <button
                type="button"
                onClick={() => setAssistantOpen(true)}
                className="inline-flex items-center gap-1 text-slate-700 dark:text-slate-200 hover:text-teal-700 dark:hover:text-teal-400 font-medium transition-colors whitespace-nowrap shrink-0"
              >
                <Sparkles className="w-3.5 h-3.5 text-teal-700 dark:text-teal-400" />
                <span>AI Assistant</span>
              </button>
              <button
                type="button"
                onClick={() => setSettingsOpen(true)}
                className="hidden md:inline hover:text-slate-900 dark:hover:text-slate-100 transition-colors whitespace-nowrap shrink-0"
              >
                Settings
              </button>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setActiveTab('schedule');
                  setComposerTriggerCount((c) => c + 1);
                }}
                className="min-h-[40px] inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>New Task</span>
              </button>
            </div>
          </div>
        </header>

        <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-6 space-y-6">
          {/* Active Due Reminders Banner */}
          {activeReminders.length > 0 && (
            <div className="bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-800 rounded-xl p-4 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-amber-800 dark:text-amber-300">
                  <Bell className="w-4 h-4" />
                  <span>Active Schedule Reminders ({activeReminders.length})</span>
                </div>
              </div>
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {activeReminders.slice(0, 3).map((rem) => (
                  <div
                    key={rem.id}
                    className="py-2 flex items-center justify-between gap-3 text-sm"
                  >
                    <div className="min-w-0">
                      <span className="font-medium text-slate-900 dark:text-slate-100">
                        {rem.title}
                      </span>{' '}
                      <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                        · {rem.category} · Due {rem.dueDate}
                        {rem.dueTime ? ` ${rem.dueTime}` : ''}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleToggleTaskComplete(rem)}
                        className="min-h-[34px] px-2.5 text-xs font-medium text-teal-700 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-950/40 rounded-md"
                      >
                        Complete
                      </button>
                      <button
                        type="button"
                        aria-label="Dismiss reminder"
                        onClick={() =>
                          setDismissedReminders((prev) => ({ ...prev, [rem.id]: true }))
                        }
                        className="min-h-[34px] min-w-[34px] flex items-center justify-center text-slate-400 hover:text-slate-600"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {todaysBriefing && (
            <div className="mb-6 bg-white dark:bg-slate-900 border border-teal-300 dark:border-teal-800 rounded-xl p-5 space-y-3">
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                This morning's briefing
              </h2>
              <div className="space-y-2">
                {todaysBriefing.text.split(/\n\s*\n/).map((para, i) => (
                  <p
                    key={i}
                    className="text-sm leading-relaxed text-slate-700 dark:text-slate-200"
                  >
                    {para}
                  </p>
                ))}
              </div>
            </div>
          )}

          {todaysMailBriefing && (
            <div className="mb-6 bg-white dark:bg-slate-900 border border-violet-300 dark:border-violet-800 rounded-xl p-5 space-y-3">
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                From your mail — only you see this
              </h2>
              <div className="space-y-2">
                {todaysMailBriefing.text.split(/\n\s*\n/).map((para, i) => (
                  <p
                    key={i}
                    className="text-sm leading-relaxed text-slate-700 dark:text-slate-200"
                  >
                    {para}
                  </p>
                ))}
              </div>
            </div>
          )}

          {todaysCircleBriefing && (
            <div className="mb-6 bg-white dark:bg-slate-900 border border-sky-300 dark:border-sky-800 rounded-xl p-5 space-y-3">
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                From your wider circles — only you see this
              </h2>
              <div className="space-y-2">
                {todaysCircleBriefing.text.split(/\n\s*\n/).map((para, i) => (
                  <p
                    key={i}
                    className="text-sm leading-relaxed text-slate-700 dark:text-slate-200"
                  >
                    {para}
                  </p>
                ))}
              </div>
            </div>
          )}

          {visibleJasonNotes.length > 0 && (
            <div className="mb-6 bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-800 rounded-xl p-5 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  Notes for Jason ({visibleJasonNotes.filter((n) => !n.handled).length} waiting)
                </h2>
                {visibleJasonNotes.some((n) => n.handled) && (
                  <button
                    type="button"
                    onClick={() => setShowHandledNotes((s) => !s)}
                    className="text-xs font-medium text-teal-700 dark:text-teal-400 hover:underline"
                  >
                    {showHandledNotes ? 'Hide handled' : 'Show handled'}
                  </button>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Requests the desk could not fill, written down instead of dead-ending.
              </p>
              <ul className="space-y-2">
                {visibleJasonNotes
                  .filter((n) => showHandledNotes || !n.handled)
                  .map((note) => (
                    <li
                      key={note.id}
                      className="flex items-start justify-between gap-3 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900"
                    >
                      <span
                        className={`text-sm leading-relaxed ${
                          note.handled
                            ? 'line-through text-slate-400 dark:text-slate-500'
                            : 'text-slate-800 dark:text-slate-100'
                        }`}
                      >
                        {note.text}
                      </span>
                      <span className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => void handleToggleJasonNoteHandled(note)}
                          title={note.handled ? 'Mark as waiting' : 'Mark as handled'}
                          aria-label={note.handled ? 'Mark note as waiting' : 'Mark note as handled'}
                          className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center rounded-lg text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/40"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDeleteJasonNote(note.id)}
                          title="Remove note"
                          aria-label="Remove note"
                          className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </span>
                    </li>
                  ))}
              </ul>
            </div>
          )}

          {(activeTab === 'schedule' || activeTab === 'frontdoor') && (
            <ScheduleAndCalendarView
              occasions={upcomingOccasions(directoryEntries)}
              userProfile={userProfile}
              tasks={displayTasks}
              allTasks={visibleTasks}
              sharedTasks={sharedTasksWithProject}
              documents={displayDocuments}
              onCreateTask={handleCreateTask}
              onUpdateTask={handleUpdateTask}
              onToggleTaskComplete={handleToggleTaskComplete}
              onCompleteTask={handleCompleteTask}
              onDeleteTask={handleDeleteTask}
              onRecordBehaviorSignal={handleRecordBehaviorSignal}
              onUpdateFocusPrefs={handleUpdateFocusPrefs}
              composerTriggerCount={composerTriggerCount}
              visibilityOptions={visibilityOptions}
            />
          )}

          {activeTab === 'property' && (
            <WimberleyPropertyView
              entries={displayPropertyEntries}
              documents={displayDocuments}
              propertyTasks={displayTasks.filter((t) => t.category === 'Wimberley Property')}
              onCreateEntry={handleCreatePropertyEntry}
              onUpdateEntry={handleUpdatePropertyEntry}
              onDeleteEntry={handleDeletePropertyEntry}
              onScheduleReminderTask={handleCreateTask}
              onToggleTaskComplete={handleToggleTaskComplete}
            />
          )}

          {activeTab === 'tree' && (
            <TreeView
              families={families}
              households={households}
              circles={circles}
              activeHousehold={activeHousehold}
            />
          )}

          {activeTab === 'finances' && (
            <FinancesView
              entries={displayFinanceEntries}
              documents={displayDocuments}
              onCreateEntry={handleCreateFinanceEntry}
              onUpdateEntry={handleUpdateFinanceEntry}
              onDeleteEntry={handleDeleteFinanceEntry}
            />
          )}

          {activeTab === 'vault' && (
            <DocumentScannerVaultView
              documents={displayDocuments}
              onSaveDocument={handleSaveDocument}
              onUpdateDocument={handleUpdateDocument}
              onVerifyDocument={handleVerifyDocument}
              onDeleteDocument={handleDeleteDocument}
              onCreateTaskFromDoc={handleCreateTask}
              scannerTriggerCount={scannerTriggerCount}
              scannerPresetPlace={scannerPresetPlace}
              onDocumentSaved={handleFrontDoorDocumentSaved}
            />
          )}

          {activeTab === 'projects' && (
            <CollaborativeProjectsView
              currentUserId={user.uid}
              userProfile={userProfile}
              projects={projects}
              selectedProjectId={selectedProjectId}
              onSelectProject={setSelectedProjectId}
              projectMembers={projectMembers}
              projectTasks={projectTasks}
              incomingInvites={incomingInvites}
              notifications={notifications}
              onCreateProject={handleCreateProject}
              onInviteUser={handleInviteUser}
              onRespondInvite={handleRespondInvite}
              onCreateProjectTask={handleCreateProjectTask}
              onToggleProjectTask={handleToggleProjectTask}
              onDeleteProjectTask={handleDeleteProjectTask}
              onMarkNotificationRead={handleMarkNotificationRead}
            />
          )}

          {activeTab === 'voice' && (
            <GeminiLiveVoiceView
              userName={userProfile?.displayName || user.displayName || 'User'}
              addressName={userProfile?.addressName || ''}
              onCreateJasonNote={(text) => handleCreateJasonNote(text, 'voice')}
              tasks={displayTasks}
              documents={displayDocuments}
              memories={voiceMemories}
              propertyEntries={displayPropertyEntries}
              financeEntries={displayFinanceEntries}
              onCreateTask={handleCreateTask}
              onCompleteTaskByTitle={handleCompleteTaskByTitle}
              onSaveMemory={handleSaveVoiceMemory}
              onDeleteMemory={handleDeleteVoiceMemory}
              onLogFinanceEntry={handleCreateFinanceEntry}
            />
          )}

          {activeTab === 'analytics' && (
            <AnalyticsDashboardView
              tasks={displayTasks}
              documents={displayDocuments}
              projects={projects}
              sharedTasks={sharedTasksWithProject}
              onNavigate={setActiveTab}
            />
          )}
        </main>
      </div>

      {/* Mobile Bottom Tab Bar (iOS & Android thumb zone <= 15% height) */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 pb-safe">
        <div className="grid grid-cols-6 h-16 items-center">
          {mobileBottomItems.map((item) => {
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`min-h-[48px] flex flex-col items-center justify-center gap-1 transition-colors ${
                  active
                    ? 'text-teal-700 dark:text-teal-400 font-semibold'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                {item.icon}
                <span className="text-[10px] tracking-tight leading-none">
                  {item.mobileLabel || item.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Account & Mobile Settings Modal */}
      {settingsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-5 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                Account & Mobile Settings
              </h2>
              <button
                type="button"
                onClick={() => setSettingsOpen(false)}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-1 text-sm">
              <p className="font-medium text-slate-900 dark:text-slate-100">
                {userProfile?.displayName || user.displayName}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">{user.email}</p>
            </div>

            <form onSubmit={handleUpdateUsername} className="space-y-2">
              <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                Collaborative Username Handle (for project invites)
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={editUsername}
                  onChange={(e) => setEditUsername(e.target.value)}
                  className="flex-1 min-h-[42px] px-3 text-sm font-mono bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100"
                />
                <button
                  type="submit"
                  className="min-h-[42px] inline-flex items-center gap-1.5 px-3.5 text-xs font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg"
                >
                  <UserCheck className="w-3.5 h-3.5" />
                  <span>Save</span>
                </button>
              </div>
              {usernameFeedback && (
                <p className="text-xs text-teal-700 dark:text-teal-400">{usernameFeedback}</p>
              )}
            </form>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                void handleUpdateDeskPrefs({
                  addressName: editAddressName.trim().slice(0, 80),
                }).then(() => {
                  setAddressNameFeedback('Saved.');
                  window.setTimeout(() => setAddressNameFeedback(null), 2500);
                });
              }}
              className="space-y-2"
            >
              <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                How Steward addresses you (the front door greeting — for example, Ms. Gini)
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={editAddressName}
                  onChange={(e) => setEditAddressName(e.target.value)}
                  placeholder="Leave blank to use your name"
                  className="flex-1 min-h-[42px] px-3 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100"
                />
                <button
                  type="submit"
                  className="min-h-[42px] inline-flex items-center gap-1.5 px-3.5 text-xs font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg"
                >
                  <UserCheck className="w-3.5 h-3.5" />
                  <span>Save</span>
                </button>
              </div>
              {addressNameFeedback && (
                <p className="text-xs text-teal-700 dark:text-teal-400">{addressNameFeedback}</p>
              )}
              <label className="flex items-start gap-2 text-xs text-slate-600 dark:text-slate-400 pt-1">
                <input
                  type="checkbox"
                  checked={Boolean(userProfile?.voiceMuted)}
                  onChange={(e) =>
                    void handleUpdateDeskPrefs({ voiceMuted: e.target.checked })
                  }
                  className="mt-0.5"
                />
                <span>
                  Keep the front door's spoken voice muted. It stays muted — in church, say —
                  until it is turned back on here or on the front door itself.
                </span>
              </label>
              <label className="flex items-start gap-2 text-xs text-slate-600 dark:text-slate-400 pt-1">
                <input
                  type="checkbox"
                  checked={Boolean(userProfile?.emailEnabled)}
                  onChange={(e) =>
                    void handleUpdateDeskPrefs({ emailEnabled: e.target.checked })
                  }
                  className="mt-0.5"
                />
                <span>
                  Include my email in the morning briefing. Steward reads my Gmail —
                  read-only, it never sends — and the briefing names what needs me and
                  what I am waiting on. This switch is mine alone: it covers only my
                  account, on my word.
                </span>
              </label>
              {userProfile?.emailEnabled && (
                <div className="pt-1 space-y-1.5">
                  <label className="flex items-start gap-2 text-xs text-slate-600 dark:text-slate-400">
                    <input
                      type="checkbox"
                      checked={userProfile?.mailFromPeople !== false}
                      onChange={(e) =>
                        void handleUpdateDeskPrefs({ mailFromPeople: e.target.checked })
                      }
                      className="mt-0.5"
                    />
                    <span>People who write to me</span>
                  </label>
                  <label className="flex items-start gap-2 text-xs text-slate-600 dark:text-slate-400">
                    <input
                      type="checkbox"
                      checked={userProfile?.mailBills !== false}
                      onChange={(e) =>
                        void handleUpdateDeskPrefs({ mailBills: e.target.checked })
                      }
                      className="mt-0.5"
                    />
                    <span>Bills, statements, and notices</span>
                  </label>
                  <label className="flex items-start gap-2 text-xs text-slate-600 dark:text-slate-400">
                    <input
                      type="checkbox"
                      checked={Boolean(userProfile?.mailNewsletters)}
                      onChange={(e) =>
                        void handleUpdateDeskPrefs({ mailNewsletters: e.target.checked })
                      }
                      className="mt-0.5"
                    />
                    <span>Newsletters and announcements</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => void handleConnectGmail()}
                    className="min-h-[42px] inline-flex items-center gap-1.5 px-3.5 text-xs font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg"
                  >
                    <Mail className="w-3.5 h-3.5" />
                    <span>{gmailConnected ? 'Reconnect my email' : 'Connect my email'}</span>
                  </button>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {gmailConnected
                      ? 'Connected for this session. Google ends the connection after about an hour; reconnect here when the briefing stops including mail.'
                      : 'Not connected right now. Connecting lasts about an hour at a time, on Google’s rules.'}
                  </p>
                  {emailFeedback && (
                    <p className="text-xs text-teal-700 dark:text-teal-400">{emailFeedback}</p>
                  )}
                </div>
              )}
              {userProfile?.emailEnabled && (
                <div className="space-y-2 pt-1">
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Only use mail from these senders (one per line — leave empty to allow
                    everyone the switches above let through)
                  </label>
                  <textarea
                    value={editMailOnly}
                    onChange={(e) => setEditMailOnly(e.target.value)}
                    rows={2}
                    placeholder={'bank@example.com\nsister@example.com'}
                    className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100"
                  />
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Never use mail from these senders (one per line — this wins over the
                    list above)
                  </label>
                  <textarea
                    value={editMailNever}
                    onChange={(e) => setEditMailNever(e.target.value)}
                    rows={2}
                    className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      void handleUpdateDeskPrefs({
                        mailOnlySenders: editMailOnly.trim().slice(0, 500),
                        mailNeverSenders: editMailNever.trim().slice(0, 500),
                      }).then(() => {
                        setMailRulesFeedback('Saved.');
                        window.setTimeout(() => setMailRulesFeedback(null), 2500);
                      })
                    }
                    className="min-h-[42px] inline-flex items-center gap-1.5 px-3.5 text-xs font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg"
                  >
                    <span>Save mail rules</span>
                  </button>
                  {mailRulesFeedback && (
                    <p className="text-xs text-teal-700 dark:text-teal-400">{mailRulesFeedback}</p>
                  )}
                  <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                    <p className="text-xs font-medium text-slate-700 dark:text-slate-300">
                      File a message as a record
                    </p>
                    <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                      A message worth keeping becomes a record on the desk, under privacy
                      settings you pick. Your mail rules above run first — a sender they
                      shut out cannot be filed. The record holds the message's heading
                      details and the preview Gmail shows; the original stays in your
                      mailbox.
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        value={mailFileScope}
                        onChange={(e) => setMailFileScope(e.target.value as 'private' | 'household' | 'family')}
                        className="min-h-[34px] px-2 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-md text-slate-900 dark:text-slate-100"
                      >
                        <option value="private">Only me</option>
                        <option value="household">My household</option>
                        <option value="family">My family</option>
                      </select>
                      {mailFileScope === 'family' && (
                        <select
                          value={mailFileFamilyId}
                          onChange={(e) => setMailFileFamilyId(e.target.value)}
                          className="min-h-[34px] px-2 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-md text-slate-900 dark:text-slate-100"
                        >
                          <option value="">Pick the family</option>
                          {families.map((f) => (
                            <option key={f.id} value={f.id}>
                              {f.name}
                            </option>
                          ))}
                        </select>
                      )}
                      <select
                        value={mailFileKind}
                        onChange={(e) => setMailFileKind(e.target.value as RecordKind)}
                        className="min-h-[34px] px-2 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-md text-slate-900 dark:text-slate-100"
                      >
                        <option value="personal">Personal</option>
                        <option value="financial">Financial</option>
                        <option value="medical">Medical</option>
                        <option value="official">Official</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => void handleLoadMailForFiling()}
                        className="min-h-[34px] px-3 text-xs font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-md"
                      >
                        Show recent messages
                      </button>
                    </div>
                    {mailFileFeedback && (
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">{mailFileFeedback}</p>
                    )}
                    {mailFileEntries.length > 0 && (
                      <div className="space-y-1.5">
                        {mailFileEntries.map((entry) => (
                          <div
                            key={entry.id}
                            className="flex items-start justify-between gap-2 px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                          >
                            <div className="min-w-0">
                              <p className="text-xs font-medium text-slate-900 dark:text-slate-100 truncate">
                                {entry.subject}
                              </p>
                              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                                {entry.from} · {entry.date}
                              </p>
                              {entry.snippet && (
                                <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-2">
                                  {entry.snippet}
                                </p>
                              )}
                            </div>
                            <button
                              type="button"
                              disabled={mailFiledIds.includes(entry.id)}
                              onClick={() => void handleFileMailMessage(entry)}
                              className="shrink-0 min-h-[30px] px-2.5 text-[11px] font-medium text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800 hover:bg-teal-50 dark:hover:bg-teal-950/40 rounded-md disabled:opacity-50"
                            >
                              {mailFiledIds.includes(entry.id) ? 'Filed' : 'File'}
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
              <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                <p className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  Sealed records
                </p>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  A sealed record is locked with a passphrase only you know, on this
                  device, before it is stored. The desk keeps the envelope — the title,
                  the kind, the place, the date — but the words inside can only be read
                  while your vault is unlocked. Official papers are sealed from the
                  start; any other kind can be sealed too. If you forget the
                  passphrase, you are not locked out of your own records: a
                  recovery key kept as a small file in your own Google Drive
                  opens your vault again, because the records are yours and
                  your own sign-in is the proof. Inside a family, the family's
                  shared sealed records follow the family's own law — the
                  head's standing control, and the members' vote.
                </p>
                {!userProfile?.vaultCheck ? (
                  <div className="space-y-2">
                    <input
                      type="password"
                      value={vaultPass}
                      onChange={(e) => setVaultPass(e.target.value)}
                      placeholder="Choose a passphrase"
                      autoComplete="new-password"
                      className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100"
                    />
                    <input
                      type="password"
                      value={vaultPassConfirm}
                      onChange={(e) => setVaultPassConfirm(e.target.value)}
                      placeholder="Type it again"
                      autoComplete="new-password"
                      className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100"
                    />
                    <button
                      type="button"
                      onClick={() => void handleCreateVault()}
                      className="min-h-[42px] inline-flex items-center gap-1.5 px-3.5 text-xs font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg"
                    >
                      <span>Make my vault</span>
                    </button>
                  </div>
                ) : vaultUnlockedState ? (
                  <div className="space-y-2">
                    <p className="text-xs text-teal-700 dark:text-teal-400">
                      Your vault is unlocked on this device.
                    </p>
                    <button
                      type="button"
                      onClick={handleLockVault}
                      className="min-h-[42px] inline-flex items-center gap-1.5 px-3.5 text-xs font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg"
                    >
                      <span>Lock the vault</span>
                    </button>
                    {userProfile?.vaultRecoveryWrap ? (
                      recoveryKeyInHand ? (
                        recoverySaved ? (
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            Your recovery key is saved in your Drive, in the Steward
                            Backups folder. If you forget your passphrase, it opens
                            your vault again.
                          </p>
                        ) : (
                          <div className="space-y-2 pt-1">
                            <p className="text-xs text-slate-600 dark:text-slate-400">
                              Your recovery key is not saved yet. Save it in your
                              Google Drive — if you ever forget your passphrase, that
                              key is what opens your vault again.
                            </p>
                            <button
                              type="button"
                              disabled={recoveryBusy}
                              onClick={() => void handleSaveRecoveryKey()}
                              className="min-h-[42px] inline-flex items-center gap-1.5 px-3.5 text-xs font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg"
                            >
                              <span>Save my recovery key to my Drive</span>
                            </button>
                          </div>
                        )
                      ) : (
                        <div className="space-y-2 pt-1">
                          <p className="text-xs text-slate-600 dark:text-slate-400">
                            A recovery key was made for this vault on another day or
                            device. If you saved it in your Drive, a forgotten
                            passphrase can be recovered from this page while the vault
                            is locked. To make a fresh key on this device instead,
                            type your passphrase once more:
                          </p>
                          <input
                            type="password"
                            value={vaultReplacePass}
                            onChange={(e) => setVaultReplacePass(e.target.value)}
                            placeholder="Your passphrase"
                            autoComplete="current-password"
                            className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100"
                          />
                          <button
                            type="button"
                            onClick={() => void handleReplaceRecoveryKey()}
                            className="min-h-[42px] inline-flex items-center gap-1.5 px-3.5 text-xs font-medium text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-lg"
                          >
                            <span>Make a new recovery key</span>
                          </button>
                        </div>
                      )
                    ) : null}
                    <div className="pt-1">
                      {showChangePass || vaultRecovered ? (
                        <div className="space-y-2">
                          <input
                            type="password"
                            value={vaultNewPass}
                            onChange={(e) => setVaultNewPass(e.target.value)}
                            placeholder="New passphrase"
                            autoComplete="new-password"
                            className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100"
                          />
                          <input
                            type="password"
                            value={vaultNewPassConfirm}
                            onChange={(e) => setVaultNewPassConfirm(e.target.value)}
                            placeholder="Type it again"
                            autoComplete="new-password"
                            className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100"
                          />
                          <button
                            type="button"
                            disabled={recoveryBusy}
                            onClick={() => void handleResetPassphrase()}
                            className="min-h-[42px] inline-flex items-center gap-1.5 px-3.5 text-xs font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg"
                          >
                            <span>Set the new passphrase</span>
                          </button>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            Your sealed records are re-sealed under the new
                            passphrase. Nothing else changes.
                          </p>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setShowChangePass(true)}
                          className="min-h-[42px] inline-flex items-center gap-1.5 px-3.5 text-xs font-medium text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-lg"
                        >
                          <span>Change my passphrase</span>
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <input
                      type="password"
                      value={vaultPass}
                      onChange={(e) => setVaultPass(e.target.value)}
                      placeholder="Your passphrase"
                      autoComplete="current-password"
                      className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100"
                    />
                    <button
                      type="button"
                      onClick={() => void handleUnlockVault()}
                      className="min-h-[42px] inline-flex items-center gap-1.5 px-3.5 text-xs font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg"
                    >
                      <span>Unlock the vault</span>
                    </button>
                    <div className="space-y-2 pt-1">
                      <p className="text-xs font-medium text-slate-700 dark:text-slate-300">
                        Forgot your passphrase?
                      </p>
                      <button
                        type="button"
                        disabled={recoveryBusy}
                        onClick={() => void handleRecoverVault()}
                        className="min-h-[42px] inline-flex items-center gap-1.5 px-3.5 text-xs font-medium text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-lg"
                      >
                        <span>Open my vault with my Drive key</span>
                      </button>
                    </div>
                  </div>
                )}
                {!vaultUnlockedState &&
                  families
                    .filter((f) => familyHeadUid(f) === user.uid && f.recovery)
                    .map((f) => {
                      const mine = resetRequests.find(
                        (r) => r.familyId === f.id && r.forUid === user.uid && r.status !== 'done'
                      );
                      return (
                        <div
                          key={f.id}
                          className="space-y-2 pt-1 border-t border-slate-100 dark:border-slate-800"
                        >
                          <p className="text-xs font-medium text-slate-700 dark:text-slate-200">
                            Family reset — {f.name}
                          </p>
                          {!mine ? (
                            <>
                              <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                                You head this family, and its recovery is set up. If the
                                passphrase is gone for good, the family can vote to hand your
                                key back to this device. More than half of the account holders
                                have to approve. Without the vote, your sealed records stay
                                sealed.
                              </p>
                              <button
                                type="button"
                                onClick={() => void handleRequestReset(f)}
                                className="min-h-[42px] px-3.5 text-xs font-medium text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-lg"
                              >
                                Ask my family to reset my passphrase
                              </button>
                            </>
                          ) : mine.status === 'delivered' ? (
                            <>
                              <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                                The family voted yes, and your key has been delivered to this
                                device.
                              </p>
                              <button
                                type="button"
                                onClick={() => void handleFinishReset(mine)}
                                className="min-h-[42px] px-3.5 text-xs font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg"
                              >
                                Take back my vault
                              </button>
                            </>
                          ) : (
                            <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                              Your family is voting — {mine.approvals.length} of{' '}
                              {f.memberIds.length} account holders have approved. It takes
                              more than half.
                            </p>
                          )}
                        </div>
                      );
                    })}
                <div className="space-y-1.5 pt-1">
                  {(Object.keys(RECORD_KIND_LABELS) as RecordKind[]).map((kind) => (
                    <label
                      key={kind}
                      className="flex items-start gap-2 text-xs text-slate-600 dark:text-slate-400"
                    >
                      <input
                        type="checkbox"
                        checked={sealedKindsNow.includes(kind)}
                        onChange={(e) => {
                          const next = e.target.checked
                            ? [...sealedKindsNow, kind]
                            : sealedKindsNow.filter((k) => k !== kind);
                          void handleUpdateDeskPrefs({ sealedKinds: next });
                        }}
                        className="mt-0.5"
                      />
                      <span>
                        Seal {RECORD_KIND_LABELS[kind]} records
                        {kind === 'official' ? ' — on from the start' : ''}
                        {kind === 'financial' || kind === 'calendar'
                          ? ' (the note is sealed; the entry itself stays on the ledger or the calendar)'
                          : ''}
                      </span>
                    </label>
                  ))}
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Records already filed keep the sealing they were filed with.
                    Changing a switch changes what happens the next time a record is
                    filed or its words are saved.
                  </p>
                </div>
                {vaultFeedback && (
                  <p className="text-xs text-teal-700 dark:text-teal-400">{vaultFeedback}</p>
                )}
              </div>
            </form>

            <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-slate-800">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Accounts &amp; passwords
              </h3>
              <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                Logins the desk keeps — a bank, a medical portal, any account. The record
                here names the account and who holds it; the password itself never sits on
                the record. It goes in the credentials box below, sealed, and is reached
                only through the box.
              </p>
              {accountRecords.length > 0 && (
                <div className="space-y-2">
                  {accountRecords
                    .slice()
                    .sort((a, b) => a.title.localeCompare(b.title))
                    .map((rec) => (
                      <div
                        key={rec.id}
                        className="px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg space-y-1"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-medium text-slate-900 dark:text-slate-100">
                            {rec.title}
                            <span className="text-slate-500 dark:text-slate-400">
                              {' '}
                              — {rec.scope === 'family' ? 'held by the family' : rec.scope === 'circles' ? 'held by a circle' : rec.scope === 'household' ? 'this household' : 'just the owner'}
                              {rec.userId !== user.uid ? ' · filed by another member' : ''}
                            </span>
                          </span>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => void handleRevealAccountPassword(rec)}
                              className="min-h-[30px] px-2.5 text-[11px] font-medium text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800 hover:bg-teal-50 dark:hover:bg-teal-950/40 rounded-md"
                            >
                              {revealedPasswords[rec.id] ? 'Hide password' : 'Show password'}
                            </button>
                            {rec.userId === user.uid && (
                              <button
                                type="button"
                                onClick={() => void handleDeleteAccountRecord(rec)}
                                className="min-h-[30px] px-2.5 text-[11px] font-medium text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-md"
                              >
                                Remove
                              </button>
                            )}
                          </div>
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          {rec.username ? `Sign-in name: ${rec.username} · ` : ''}
                          {rec.url ? rec.url : 'No address on file'}
                        </p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          {rec.credentialId
                            ? 'Password: kept in the credentials box.'
                            : 'No credential linked in the box.'}
                        </p>
                        {revealedPasswords[rec.id] && (
                          <p className="text-xs font-mono text-slate-900 dark:text-slate-100 break-all">
                            {revealedPasswords[rec.id]}
                          </p>
                        )}
                      </div>
                    ))}
                </div>
              )}
              <div className="space-y-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={acctTitle}
                    onChange={(e) => setAcctTitle(e.target.value)}
                    placeholder="Account name — the bank, the portal"
                    className="min-h-[38px] px-3 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
                  />
                  <input
                    type="text"
                    value={acctUsername}
                    onChange={(e) => setAcctUsername(e.target.value)}
                    placeholder="Sign-in name"
                    className="min-h-[38px] px-3 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
                  />
                  <input
                    type="password"
                    value={acctPassword}
                    onChange={(e) => setAcctPassword(e.target.value)}
                    placeholder="Password"
                    autoComplete="new-password"
                    className="min-h-[38px] px-3 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
                  />
                  <input
                    type="text"
                    value={acctUrl}
                    onChange={(e) => setAcctUrl(e.target.value)}
                    placeholder="Web address (optional)"
                    className="min-h-[38px] px-3 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
                  />
                </div>
                <input
                  type="text"
                  value={acctNotes}
                  onChange={(e) => setAcctNotes(e.target.value)}
                  placeholder="Notes (optional, sealed with the password)"
                  className="w-full min-h-[38px] px-3 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
                />
                <div className="flex flex-wrap items-center gap-2">
                  <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
                    <span>Who holds it:</span>
                    <select
                      value={acctScope}
                      onChange={(e) => setAcctScope(e.target.value as typeof acctScope)}
                      className="min-h-[34px] px-2 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-md text-slate-900 dark:text-slate-100"
                    >
                      <option value="private">Just me</option>
                      <option value="household">This household</option>
                      <option value="family">A family</option>
                      <option value="circles">A circle</option>
                    </select>
                  </label>
                  {acctScope === 'family' && (
                    <select
                      value={acctFamilyId || activeFamily?.id || ''}
                      onChange={(e) => setAcctFamilyId(e.target.value)}
                      className="min-h-[34px] px-2 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-md text-slate-900 dark:text-slate-100"
                    >
                      {families.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.name}
                        </option>
                      ))}
                    </select>
                  )}
                  {acctScope === 'circles' && (
                    <select
                      value={acctCircleId}
                      onChange={(e) => setAcctCircleId(e.target.value)}
                      className="min-h-[34px] px-2 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-md text-slate-900 dark:text-slate-100"
                    >
                      <option value="">Pick a circle</option>
                      {circles.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  )}
                  <button
                    type="button"
                    onClick={() => void handleAddAccountRecord()}
                    className="min-h-[38px] px-3 text-xs font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg"
                  >
                    File this account
                  </button>
                </div>
                {acctFeedback && (
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">{acctFeedback}</p>
                )}
              </div>
            </div>

            <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-slate-800">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Credentials box
              </h3>
              <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                Your passwords live here, in a box of their own — apart from the records,
                sealed under your vault key, reached only through this box. A password for an
                account your family holds together is also sealed under the family key, so
                the family can open it here too. Whether the assistant may use a credential
                is decided here, per credential — and the assistant is never handed the value
                itself; the allowance records your word.
              </p>
              {ownCredentials.length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  The box is empty. File an account above and its password lands here.
                </p>
              ) : (
                <div className="space-y-2">
                  {ownCredentials
                    .slice()
                    .sort((a, b) => a.accountRecordId.localeCompare(b.accountRecordId))
                    .map((cred) => {
                      const rec = accountRecords.find((a) => a.id === cred.accountRecordId);
                      return (
                        <div
                          key={cred.id}
                          className="px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg space-y-1"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-medium text-slate-900 dark:text-slate-100">
                              {rec ? rec.title : 'An account'}
                              {rec?.username ? (
                                <span className="text-slate-500 dark:text-slate-400">
                                  {' '}
                                  — {rec.username}
                                </span>
                              ) : null}
                            </span>
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => void handleRevealCredential(cred)}
                                className="min-h-[30px] px-2.5 text-[11px] font-medium text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800 hover:bg-teal-50 dark:hover:bg-teal-950/40 rounded-md"
                              >
                                {revealedPasswords[cred.id] ? 'Hide password' : 'Show password'}
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleRemoveCredential(cred)}
                                className="min-h-[30px] px-2.5 text-[11px] font-medium text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-md"
                              >
                                Remove
                              </button>
                            </div>
                          </div>
                          {revealedPasswords[cred.id] && (
                            <p className="text-xs font-mono text-slate-900 dark:text-slate-100 break-all">
                              {revealedPasswords[cred.id]}
                            </p>
                          )}
                          <label className="flex items-start gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                            <input
                              type="checkbox"
                              checked={cred.aiUse === true}
                              onChange={(e) =>
                                void updateDoc(doc(db, 'credentials', cred.id), {
                                  aiUse: e.target.checked,
                                  updatedAt: serverTimestamp(),
                                }).catch((err) =>
                                  handleFirestoreError(err, OperationType.UPDATE, `credentials/${cred.id}`)
                                )
                              }
                            />
                            <span>
                              The assistant may use this credential when I ask it to. The
                              value itself is never handed to the assistant — this switch
                              records your allowance, here in the box.
                            </span>
                          </label>
                        </div>
                      );
                    })}
                </div>
              )}
              {boxFeedback && (
                <p className="text-[11px] text-slate-500 dark:text-slate-400">{boxFeedback}</p>
              )}
            </div>

            <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-slate-800">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Giving
              </h3>
              <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                Depositing a record never moves its ownership — a household, a family, or a
                circle only holds what you file. The one way ownership moves is a gift: you
                give a record to a person, or to a family, and then it is theirs. A record
                with several owners is given by majority vote of its owners; a tie goes to
                the eldest of them. Every give is written in the record's gift log.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
                  <span>Give to:</span>
                  <select
                    value={giveTarget}
                    onChange={(e) => setGiveTarget(e.target.value)}
                    className="min-h-[34px] px-2 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-md text-slate-900 dark:text-slate-100"
                  >
                    <option value="">Pick a person or a family</option>
                    {(() => {
                      const map = new Map<string, string>();
                      householdMembers.forEach((m) => map.set(m.userId, m.displayName));
                      families.forEach((f) =>
                        (f.people || []).forEach((pp) => {
                          if (pp.userId && !map.has(pp.userId)) map.set(pp.userId, pp.name);
                        })
                      );
                      return Array.from(map.entries())
                        .filter(([uid]) => uid !== user.uid)
                        .map(([uid, name]) => (
                          <option key={uid} value={`person:${uid}`}>
                            {name}
                          </option>
                        ));
                    })()}
                    {families.map((f) => (
                      <option key={f.id} value={`family:${f.id}`}>
                        The {f.name} family
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {giveRows.length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Nothing here is yours to give yet.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {giveRows.map((row) => {
                    const owners = ownersOf(row.rec);
                    return (
                      <div
                        key={`${row.collectionName}:${row.rec.id}`}
                        className="flex items-center justify-between gap-2 px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                      >
                        <span className="text-xs text-slate-900 dark:text-slate-100">
                          {row.title}
                          <span className="text-slate-500 dark:text-slate-400">
                            {' '}
                            — {row.kind} ·{' '}
                            {owners.length <= 1 ? 'yours alone' : `${owners.length} owners`}
                          </span>
                        </span>
                        <button
                          type="button"
                          onClick={() => void handleGive(row.collectionName, row.rec, row.title)}
                          className="min-h-[30px] px-2.5 text-[11px] font-medium text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800 hover:bg-teal-50 dark:hover:bg-teal-950/40 rounded-md"
                        >
                          Give
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
              {giveProposals
                .filter((p) => p.status !== 'done')
                .map((p) => (
                  <div
                    key={p.id}
                    className="px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg space-y-1.5"
                  >
                    <p className="text-xs text-slate-600 dark:text-slate-300">
                      {p.recordTitle} → {p.toLabel}: proposed by {p.proposedByName}.{' '}
                      {p.approvals.length} of {p.ownerIds.length} owners in favor
                      {p.declines.length > 0 ? `, ${p.declines.length} against` : ''}.
                      {p.status === 'approved'
                        ? ` Carried${p.decision === 'eldest' ? ' — the eldest decided the tie' : ''}.`
                        : p.status === 'declined'
                          ? ` Not carried${p.decision === 'eldest' ? ' — the eldest decided the tie' : ''}.`
                          : ''}
                    </p>
                    {p.status === 'open' &&
                      user &&
                      p.ownerIds.includes(user.uid) &&
                      !p.approvals.includes(user.uid) &&
                      !p.declines.includes(user.uid) && (
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => void handleVoteGive(p, true)}
                            className="min-h-[30px] px-2.5 text-[11px] font-medium text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800 hover:bg-teal-50 dark:hover:bg-teal-950/40 rounded-md"
                          >
                            In favor
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleVoteGive(p, false)}
                            className="min-h-[30px] px-2.5 text-[11px] font-medium text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-md"
                          >
                            Against
                          </button>
                        </div>
                      )}
                    {p.status === 'approved' && user && p.ownerIds.includes(user.uid) && (
                      <button
                        type="button"
                        onClick={() => void handleCompleteGive(p)}
                        className="min-h-[30px] px-2.5 text-[11px] font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-md"
                      >
                        Complete the give
                      </button>
                    )}
                  </div>
                ))}
              {giveFeedback && (
                <p className="text-[11px] text-slate-500 dark:text-slate-400">{giveFeedback}</p>
              )}
            </div>

            <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-slate-800">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Family directory
              </h3>
              <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                One entry per person: the full address record and every way to reach them.
                A Physical Address is where the building is. A Billing Address is only where
                billing mail goes — it says nothing about location, and the two are never
                merged. You choose how far your own entry reaches; leave yourself out
                entirely by not making one.
              </p>
              <div className="space-y-2">
                <input
                  type="text"
                  value={dirName}
                  onChange={(e) => setDirName(e.target.value)}
                  placeholder="Name the family knows you by"
                  className="w-full min-h-[38px] px-2.5 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-md text-slate-900 dark:text-slate-100"
                />
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <input
                    type="text"
                    value={dirBirthday}
                    onChange={(e) => setDirBirthday(e.target.value)}
                    placeholder="Birthday — 1985-06-14, or 06-14"
                    className="w-full min-h-[38px] px-2.5 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-md text-slate-900 dark:text-slate-100"
                  />
                  <input
                    type="text"
                    value={dirAnniversary}
                    onChange={(e) => setDirAnniversary(e.target.value)}
                    placeholder="Anniversary — 2010-09-03, or 09-03"
                    className="w-full min-h-[38px] px-2.5 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-md text-slate-900 dark:text-slate-100"
                  />
                  <input
                    type="text"
                    value={dirAnniversaryLabel}
                    onChange={(e) => setDirAnniversaryLabel(e.target.value)}
                    placeholder="What the anniversary marks — Wedding"
                    className="w-full min-h-[38px] px-2.5 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-md text-slate-900 dark:text-slate-100"
                  />
                </div>
                <textarea
                  value={dirPhysical}
                  onChange={(e) => setDirPhysical(e.target.value)}
                  placeholder={'Physical Address — where the building is\nStreet, city, state, ZIP'}
                  rows={2}
                  className="w-full px-2.5 py-2 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-md text-slate-900 dark:text-slate-100"
                />
                <textarea
                  value={dirBilling}
                  onChange={(e) => setDirBilling(e.target.value)}
                  placeholder={'Billing Address — only where billing mail goes\nStreet or PO box, city, state, ZIP'}
                  rows={2}
                  className="w-full px-2.5 py-2 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-md text-slate-900 dark:text-slate-100"
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <textarea
                    value={dirPhonesText}
                    onChange={(e) => setDirPhonesText(e.target.value)}
                    placeholder={'Phone numbers, one per line'}
                    rows={2}
                    className="w-full px-2.5 py-2 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-md text-slate-900 dark:text-slate-100"
                  />
                  <textarea
                    value={dirEmailsText}
                    onChange={(e) => setDirEmailsText(e.target.value)}
                    placeholder={'Email addresses, one per line'}
                    rows={2}
                    className="w-full px-2.5 py-2 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-md text-slate-900 dark:text-slate-100"
                  />
                </div>
                <input
                  type="text"
                  value={dirNotes}
                  onChange={(e) => setDirNotes(e.target.value)}
                  placeholder="Notes (gate code, best hours to call…) — optional"
                  className="w-full min-h-[38px] px-2.5 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-md text-slate-900 dark:text-slate-100"
                />
                <div className="flex flex-wrap items-center gap-2">
                  <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
                    <span>Who can see it:</span>
                    <select
                      value={dirScope}
                      onChange={(e) => setDirScope(e.target.value as 'private' | 'household' | 'family')}
                      className="min-h-[34px] px-2 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-md text-slate-900 dark:text-slate-100"
                    >
                      <option value="private">Only me</option>
                      <option value="household">My household</option>
                      <option value="family">My family</option>
                    </select>
                  </label>
                  {dirScope === 'family' && (
                    <select
                      value={dirFamilyId}
                      onChange={(e) => setDirFamilyId(e.target.value)}
                      className="min-h-[34px] px-2 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-md text-slate-900 dark:text-slate-100"
                    >
                      <option value="">Pick the family</option>
                      {families.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.name}
                        </option>
                      ))}
                    </select>
                  )}
                  <button
                    type="button"
                    onClick={() => void handleSaveDirectoryEntry()}
                    className="min-h-[34px] px-3 text-xs font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-md"
                  >
                    {dirEditingId ? 'Save my entry' : 'Add my entry'}
                  </button>
                </div>
                {dirFeedback && (
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">{dirFeedback}</p>
                )}
              </div>
              {directoryEntries.length > 0 && (
                <div className="space-y-1.5">
                  {directoryEntries.map((entry) => (
                    <div
                      key={entry.id}
                      className="px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg space-y-0.5"
                    >
                      <p className="text-xs font-medium text-slate-900 dark:text-slate-100">
                        {entry.displayName}
                        <span className="font-normal text-slate-500 dark:text-slate-400">
                          {' '}
                          —{' '}
                          {entry.userId === user.uid
                            ? 'your entry'
                            : entry.scope === 'family'
                              ? 'shared with the family'
                              : entry.scope === 'household'
                                ? 'shared with the household'
                                : 'shared with you'}
                        </span>
                      </p>
                      {entry.physicalAddress ? (
                        <p className="text-[11px] whitespace-pre-line text-slate-600 dark:text-slate-300">
                          Physical Address: {entry.physicalAddress}
                        </p>
                      ) : null}
                      {entry.billingAddress ? (
                        <p className="text-[11px] whitespace-pre-line text-slate-600 dark:text-slate-300">
                          Billing Address (mail only): {entry.billingAddress}
                        </p>
                      ) : null}
                      {(entry.phones || []).map((ph) => (
                        <p key={ph} className="text-[11px] text-slate-600 dark:text-slate-300">
                          Phone: {ph}
                        </p>
                      ))}
                      {(entry.emails || []).map((em) => (
                        <p key={em} className="text-[11px] text-slate-600 dark:text-slate-300">
                          Email: {em}
                        </p>
                      ))}
                      {entry.notes ? (
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">{entry.notes}</p>
                      ) : null}
                      {entry.userId === user.uid && (
                        <div className="flex items-center gap-1.5 pt-1">
                          <button
                            type="button"
                            onClick={() => handleEditDirectoryEntry(entry)}
                            className="min-h-[28px] px-2 text-[11px] font-medium text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-900 rounded-md"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDeleteDirectoryEntry(entry)}
                            className="min-h-[28px] px-2 text-[11px] font-medium text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-md"
                          >
                            Remove
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-slate-800">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Emergency sheet
              </h3>
              <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                One sheet per person, in your own words, for the day somebody needs it
                fast: who to call, who your doctors are, what the people helping you
                should know. You choose how far it reaches, like everything else on the
                desk. The desk holds the sheet exactly as you wrote it — it does not
                give medical advice, and it never changes a word.
              </p>
              <div className="space-y-2">
                <div className="flex flex-wrap gap-2">
                  <input
                    type="text"
                    value={sheetForName}
                    onChange={(e) => setSheetForName(e.target.value)}
                    placeholder="Your name, as responders know it"
                    className="flex-1 min-w-[200px] min-h-[38px] px-2.5 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-md text-slate-900 dark:text-slate-100"
                  />
                  <input
                    type="text"
                    value={sheetBloodType}
                    onChange={(e) => setSheetBloodType(e.target.value)}
                    placeholder="Blood type (if you want it on the sheet)"
                    className="w-[190px] min-h-[38px] px-2.5 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-md text-slate-900 dark:text-slate-100"
                  />
                </div>
                <textarea
                  value={sheetContacts}
                  onChange={(e) => setSheetContacts(e.target.value)}
                  placeholder={'Who to call — one per line\nName — relation — phone'}
                  rows={3}
                  className="w-full px-2.5 py-2 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-md text-slate-900 dark:text-slate-100"
                />
                <textarea
                  value={sheetDoctors}
                  onChange={(e) => setSheetDoctors(e.target.value)}
                  placeholder={'Your doctors and clinic — one per line\nName — practice — phone'}
                  rows={2}
                  className="w-full px-2.5 py-2 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-md text-slate-900 dark:text-slate-100"
                />
                <textarea
                  value={sheetAllergies}
                  onChange={(e) => setSheetAllergies(e.target.value)}
                  placeholder="Allergies — medicines, foods, anything that matters"
                  rows={2}
                  className="w-full px-2.5 py-2 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-md text-slate-900 dark:text-slate-100"
                />
                <textarea
                  value={sheetMedications}
                  onChange={(e) => setSheetMedications(e.target.value)}
                  placeholder="Medicines you take — in your own words, names and when you take them"
                  rows={2}
                  className="w-full px-2.5 py-2 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-md text-slate-900 dark:text-slate-100"
                />
                <textarea
                  value={sheetConditions}
                  onChange={(e) => setSheetConditions(e.target.value)}
                  placeholder="Conditions the people helping you should know about"
                  rows={2}
                  className="w-full px-2.5 py-2 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-md text-slate-900 dark:text-slate-100"
                />
                <textarea
                  value={sheetWishes}
                  onChange={(e) => setSheetWishes(e.target.value)}
                  placeholder="What you want done — your wishes, your words"
                  rows={2}
                  className="w-full px-2.5 py-2 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-md text-slate-900 dark:text-slate-100"
                />
                <textarea
                  value={sheetNotes}
                  onChange={(e) => setSheetNotes(e.target.value)}
                  placeholder="Anything else that belongs on the sheet"
                  rows={2}
                  className="w-full px-2.5 py-2 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-md text-slate-900 dark:text-slate-100"
                />
                <div className="flex flex-wrap items-center gap-2">
                  <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
                    <span>Who can see it:</span>
                    <select
                      value={sheetScope}
                      onChange={(e) => setSheetScope(e.target.value as 'private' | 'household' | 'family')}
                      className="min-h-[34px] px-2 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-md text-slate-900 dark:text-slate-100"
                    >
                      <option value="private">Just me</option>
                      <option value="household">My household</option>
                      <option value="family">The family</option>
                    </select>
                  </label>
                  {sheetScope === 'family' && (
                    <select
                      value={sheetFamilyId}
                      onChange={(e) => setSheetFamilyId(e.target.value)}
                      className="min-h-[34px] px-2 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-md text-slate-900 dark:text-slate-100"
                    >
                      <option value="">Pick the family</option>
                      {families.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.name}
                        </option>
                      ))}
                    </select>
                  )}
                  <button
                    type="button"
                    onClick={() => void handleSaveEmergencySheet()}
                    className="min-h-[34px] px-3 text-xs font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-md"
                  >
                    Save my sheet
                  </button>
                  <button
                    type="button"
                    onClick={() => handleLoadOwnSheet()}
                    className="min-h-[34px] px-3 text-xs font-medium text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-900 rounded-md"
                  >
                    Load my sheet into the form
                  </button>
                </div>
                {sheetFeedback && (
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">{sheetFeedback}</p>
                )}
              </div>
              {emergencySheets.length > 0 && (
                <div className="space-y-2">
                  {emergencySheets.map((sh) => (
                    <div
                      key={sh.id}
                      className="px-3 py-2 bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 rounded-lg"
                    >
                      <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                        {sh.forName}
                        {sh.bloodType ? ` · Blood type ${sh.bloodType}` : ''}
                        {user && sh.userId === user.uid ? ' · yours' : ''}
                      </p>
                      {sh.contacts && (
                        <p className="text-xs whitespace-pre-line text-slate-600 dark:text-slate-300 mt-1">
                          <span className="font-medium">Call:</span> {sh.contacts}
                        </p>
                      )}
                      {sh.doctors && (
                        <p className="text-xs whitespace-pre-line text-slate-600 dark:text-slate-300 mt-1">
                          <span className="font-medium">Doctors:</span> {sh.doctors}
                        </p>
                      )}
                      {sh.allergies && (
                        <p className="text-xs whitespace-pre-line text-slate-600 dark:text-slate-300 mt-1">
                          <span className="font-medium">Allergies:</span> {sh.allergies}
                        </p>
                      )}
                      {sh.medicationsNote && (
                        <p className="text-xs whitespace-pre-line text-slate-600 dark:text-slate-300 mt-1">
                          <span className="font-medium">Medicines:</span> {sh.medicationsNote}
                        </p>
                      )}
                      {sh.conditionsNote && (
                        <p className="text-xs whitespace-pre-line text-slate-600 dark:text-slate-300 mt-1">
                          <span className="font-medium">Know:</span> {sh.conditionsNote}
                        </p>
                      )}
                      {sh.wishes && (
                        <p className="text-xs whitespace-pre-line text-slate-600 dark:text-slate-300 mt-1">
                          <span className="font-medium">Wishes:</span> {sh.wishes}
                        </p>
                      )}
                      {sh.notes && (
                        <p className="text-xs whitespace-pre-line text-slate-600 dark:text-slate-300 mt-1">
                          {sh.notes}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-slate-800">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Storage & backups
              </h3>
              {families
                .filter(
                  (f) =>
                    user &&
                    f.ownerId !== user.uid &&
                    familyHeadUid(f) !== user.uid &&
                    f.restoreDirective &&
                    localStorage.getItem(`steward-restore-seen-${f.id}`) !== f.restoreDirective.atIso
                )
                .map((f) => (
                  <div
                    key={`${f.id}-${restoreNoticeTick}`}
                    className="px-3 py-2 bg-teal-50 dark:bg-teal-950/30 border border-teal-200 dark:border-teal-800 rounded-lg space-y-1.5"
                  >
                    <p className="text-xs text-slate-700 dark:text-slate-200">
                      {f.restoreDirective?.byName} restored the whole family's desk from the
                      backup of{' '}
                      {f.restoreDirective?.snapshotExportedAtIso
                        ? new Date(f.restoreDirective.snapshotExportedAtIso).toLocaleDateString()
                        : 'the family backup'}
                      . Open Backups and restore that same backup to bring your own records
                      back — the head's restore covers everything under her tier, and your
                      own records come back under your own sign-in.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        localStorage.setItem(
                          `steward-restore-seen-${f.id}`,
                          f.restoreDirective?.atIso || ''
                        );
                        setRestoreNoticeTick((t) => t + 1);
                      }}
                      className="min-h-[30px] px-2.5 text-[11px] font-medium text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800 hover:bg-teal-100 dark:hover:bg-teal-950/50 rounded-md"
                    >
                      Mark done
                    </button>
                  </div>
                ))}
              {circles
                .filter(
                  (c) =>
                    user &&
                    c.ownerId !== user.uid &&
                    !circleHeadIds(c).includes(user.uid) &&
                    c.memberIds.includes(user.uid) &&
                    c.restoreDirective &&
                    localStorage.getItem(`steward-restore-seen-${c.id}`) !== c.restoreDirective.atIso
                )
                .map((c) => (
                  <div
                    key={`${c.id}-${restoreNoticeTick}`}
                    className="px-3 py-2 bg-teal-50 dark:bg-teal-950/30 border border-teal-200 dark:border-teal-800 rounded-lg space-y-1.5"
                  >
                    <p className="text-xs text-slate-700 dark:text-slate-200">
                      {c.restoreDirective?.byName} restored the {c.name} circle's desk from
                      the backup of{' '}
                      {c.restoreDirective?.snapshotExportedAtIso
                        ? new Date(c.restoreDirective.snapshotExportedAtIso).toLocaleDateString()
                        : 'the family backup'}
                      . Open Backups and restore that same backup to bring your own records
                      back — a head's restore covers the whole circle, and your own records
                      come back under your own sign-in.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        localStorage.setItem(
                          `steward-restore-seen-${c.id}`,
                          c.restoreDirective?.atIso || ''
                        );
                        setRestoreNoticeTick((t) => t + 1);
                      }}
                      className="min-h-[30px] px-2.5 text-[11px] font-medium text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800 hover:bg-teal-100 dark:hover:bg-teal-950/50 rounded-md"
                    >
                      Mark done
                    </button>
                  </div>
                ))}
              <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                The family head chooses where this family's records are stored. The desk's
                own answer — and the common, safe one — is one host root folder: the
                Steward folder it sets up in Drive. One root keeps everything inside the
                protection, the sharing, and the backup at once, and there is one place
                to guard. The files are held in the vault and the tags do the work, so a
                record moving between private, household, and family never needs its
                file to move at all. And the head's word stands inside her tier: if you
                disagree with your head, the answer is the door — leave the app, or the
                family. Your own records leave with you. A different root is allowed, with open eyes: what
                sits outside the root sits outside the desk's backup and protection, and
                anyone you share the folder with can see what is in it.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
                  <span>Family:</span>
                  <select
                    value={storageFamilyId}
                    onChange={(e) => handlePickStorageFamily(e.target.value)}
                    className="min-h-[34px] px-2 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-md text-slate-900 dark:text-slate-100"
                  >
                    <option value="">Pick the family</option>
                    {families
                      .filter((f) => user && (f.ownerId === user.uid || familyHeadUid(f) === user.uid))
                      .map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.name}
                        </option>
                      ))}
                  </select>
                </label>
              </div>
              {storageFamilyId && (
                <div className="space-y-2">
                  <label className="flex items-start gap-2 text-xs text-slate-600 dark:text-slate-400">
                    <input
                      type="radio"
                      name="storage-root"
                      checked={stRootChoice === 'default'}
                      onChange={() => setStRootChoice('default')}
                      className="mt-0.5"
                    />
                    <span>
                      One root folder — the Steward folder the desk sets up (recommended).
                    </span>
                  </label>
                  <label className="flex items-start gap-2 text-xs text-slate-600 dark:text-slate-400">
                    <input
                      type="radio"
                      name="storage-root"
                      checked={stRootChoice === 'custom'}
                      onChange={() => setStRootChoice('custom')}
                      className="mt-0.5"
                    />
                    <span>A different root folder I choose.</span>
                  </label>
                  {stRootChoice === 'custom' && (
                    <div className="space-y-2 pl-5">
                      <input
                        type="text"
                        value={stRootIdText}
                        onChange={(e) => setStRootIdText(e.target.value)}
                        placeholder="The folder's Drive link or its folder ID"
                        className="w-full min-h-[36px] px-2.5 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-md text-slate-900 dark:text-slate-100"
                      />
                      <input
                        type="text"
                        value={stRootLabel}
                        onChange={(e) => setStRootLabel(e.target.value)}
                        placeholder="What the family calls it (optional)"
                        className="w-full min-h-[36px] px-2.5 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-md text-slate-900 dark:text-slate-100"
                      />
                    </div>
                  )}
                  <label className="flex items-start gap-2 text-xs text-slate-600 dark:text-slate-400 pt-1">
                    <input
                      type="checkbox"
                      checked={stBackupsEnabled}
                      onChange={(e) => setStBackupsEnabled(e.target.checked)}
                      className="mt-0.5"
                    />
                    <span>
                      Automatic backups for this family. The Backups button always works
                      either way — this switch governs the ones the desk makes on its own.
                    </span>
                  </label>
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
                      <span>How often:</span>
                      <select
                        value={stFrequency}
                        onChange={(e) => setStFrequency(e.target.value as 'daily' | 'weekly' | 'manual')}
                        className="min-h-[34px] px-2 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-md text-slate-900 dark:text-slate-100"
                      >
                        <option value="daily">Every day</option>
                        <option value="weekly">Every week</option>
                        <option value="manual">Only when I press the button</option>
                      </select>
                    </label>
                    <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
                      <span>What they carry:</span>
                      <select
                        value={stScope}
                        onChange={(e) => setStScope(e.target.value as 'everything' | 'finances-official' | 'documents')}
                        className="min-h-[34px] px-2 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-md text-slate-900 dark:text-slate-100"
                      >
                        <option value="everything">Everything</option>
                        <option value="finances-official">Finances & official papers</option>
                        <option value="documents">Documents only</option>
                      </select>
                    </label>
                    <button
                      type="button"
                      onClick={() => void handleSaveStorageSettings()}
                      className="min-h-[34px] px-3 text-xs font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-md"
                    >
                      Save storage choices
                    </button>
                  </div>
                  <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                    A restore brings back everything within the family circle — every
                    document, every category, every relationship — for the records you
                    own. Another member's own records restore on their own device, from
                    the same backup, under their own sign-in.
                  </p>
                  {stFeedback && (
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">{stFeedback}</p>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-slate-800">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                The assistant
              </h3>
              <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                What the assistant may do on this account. These are your switches — the desk
                and the assistant both answer to them.
              </p>
              <label className="flex items-start gap-2 text-xs text-slate-600 dark:text-slate-400">
                <input
                  type="checkbox"
                  checked={userProfile?.aiAccess !== false}
                  onChange={(e) => void handleUpdateDeskPrefs({ aiAccess: e.target.checked })}
                />
                <span>
                  The assistant may work for me. Off means no chat, no briefings, no voice
                  help — the desk keeps everything, the assistant does nothing.
                </span>
              </label>
              <label className="flex items-start gap-2 text-xs text-slate-600 dark:text-slate-400">
                <input
                  type="checkbox"
                  checked={userProfile?.aiConnectors !== false}
                  onChange={(e) => void handleUpdateDeskPrefs({ aiConnectors: e.target.checked })}
                />
                <span>
                  The assistant may use my connected services — the mail I turned on, my Drive
                  backups. Off keeps the assistant to what is already on the desk.
                </span>
              </label>
              <label className="flex items-start gap-2 text-xs text-slate-600 dark:text-slate-400">
                <input
                  type="checkbox"
                  checked={userProfile?.aiWrite === true}
                  onChange={(e) => void handleUpdateDeskPrefs({ aiWrite: e.target.checked })}
                />
                <span>
                  The assistant may make changes I approve — its suggestion buttons work. Off
                  means it can read and suggest in words, and every change is mine to make.
                </span>
              </label>
            </div>

            <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-slate-800">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Family Household
              </h3>
              {activeHousehold ? (
                <div className="space-y-3 text-sm">
                  <p className="text-slate-700 dark:text-slate-300">
                    <span className="font-medium">{activeHousehold.name}</span>
                    <span className="text-slate-500 dark:text-slate-400">
                      {' '}
                      · {activeHousehold.memberIds.length} member
                      {activeHousehold.memberIds.length === 1 ? '' : 's'}
                    </span>
                  </p>
                  {householdMembers.length > 0 && (
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {householdMembers.map((m) => m.displayName).join(', ')}
                    </p>
                  )}
                  {activeHousehold.ownerId === user.uid && (
                    <div className="space-y-2 pt-1">
                      <p className="text-xs font-medium text-slate-700 dark:text-slate-300">
                        Head of household
                      </p>
                      {householdMembers
                        .filter((m) => m.userId !== user.uid)
                        .map((m) => (
                          <div
                            key={m.id}
                            className="flex items-center justify-between gap-2"
                          >
                            <span className="text-xs text-slate-600 dark:text-slate-300">
                              {m.displayName}
                            </span>
                            <button
                              type="button"
                              onClick={() => void handleEvictMember(m)}
                              className="min-h-[30px] px-2.5 text-[11px] font-medium text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-md"
                            >
                              Remove from household
                            </button>
                          </div>
                        ))}
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        Removing someone ends their access to this household's records.
                        Anything they deposited stays theirs — a household only holds
                        records, it never owns them.
                      </p>
                      <label className="flex items-start gap-2 text-xs text-slate-600 dark:text-slate-400">
                        <input
                          type="checkbox"
                          checked={!!activeHousehold.allowPartnerFinances}
                          onChange={(e) =>
                            void handleTogglePartnerFinances(activeHousehold, e.target.checked)
                          }
                          className="mt-0.5"
                        />
                        <span>
                          Let this household's money records be seen through circles.
                          Off is the cautious setting, and it is the default — money
                          stays inside the household and family rings unless the head
                          of household turns this on.
                        </span>
                      </label>
                    </div>
                  )}
                  <label className="flex items-start gap-2 text-xs text-slate-600 dark:text-slate-400">
                    <input
                      type="checkbox"
                      checked={shareWithHousehold}
                      onChange={(e) => setShareWithHousehold(e.target.checked)}
                      className="mt-0.5"
                    />
                    <span>
                      Share new tasks, documents, property entries, and money records with the
                      household. Turn this off when something should stay private to you.
                    </span>
                  </label>
                  <div className="space-y-1.5 pt-1">
                    <p className="text-xs font-medium text-slate-700 dark:text-slate-300">
                      Calendar subscription link
                    </p>
                    {activeHousehold.calendarToken ? (
                      <>
                        <input
                          type="text"
                          readOnly
                          value={`${window.location.origin}/api/calendar/${activeHousehold.householdId}/${activeHousehold.calendarToken}`}
                          onFocus={(e) => e.target.select()}
                          className="w-full min-h-[42px] px-3 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100"
                        />
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          In your calendar app, choose Subscribe or Add calendar by URL and
                          paste this link. The calendar then keeps itself up to date with
                          this household's open tasks and appointments. Anyone who has the
                          link can see them, so treat it like a key.
                        </p>
                        {activeHousehold.ownerId === user.uid && (
                          <button
                            type="button"
                            onClick={handleGenerateCalendarToken}
                            className="min-h-[36px] px-3 text-xs font-medium text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800 hover:bg-teal-50 dark:hover:bg-teal-950/40 rounded-lg"
                          >
                            Make a new link (the old one stops working)
                          </button>
                        )}
                      </>
                    ) : activeHousehold.ownerId === user.uid ? (
                      <>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Create a link your calendar apps can subscribe to, so this
                          household's dates appear in the calendar you already use and
                          stay up to date on their own.
                        </p>
                        <button
                          type="button"
                          onClick={handleGenerateCalendarToken}
                          className="min-h-[36px] px-3 text-xs font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg"
                        >
                          Create subscription link
                        </button>
                      </>
                    ) : (
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        The household owner can create a subscription link here, so
                        everyone's calendar apps can follow this household's dates.
                      </p>
                    )}
                  </div>
                  {activeHousehold.ownerId === user.uid && (
                    <form onSubmit={handleInviteToHousehold} className="space-y-2">
                      <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                        Invite a family member by email
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="email"
                          value={householdInviteDraft}
                          onChange={(e) => setHouseholdInviteDraft(e.target.value)}
                          placeholder="name@example.com"
                          className="flex-1 min-h-[42px] px-3 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100"
                        />
                        <button
                          type="submit"
                          className="min-h-[42px] inline-flex items-center px-3.5 text-xs font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg"
                        >
                          Invite
                        </button>
                      </div>
                      {activeHousehold.invitedEmails.length > 0 && (
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Invited: {activeHousehold.invitedEmails.join(', ')}
                        </p>
                      )}
                    </form>
                  )}
                  {households.length > 1 && (
                    <div className="space-y-1.5">
                      <p className="text-xs font-medium text-slate-700 dark:text-slate-300">
                        Your households — tap one to view it
                      </p>
                      {households.map((h) => (
                        <button
                          key={h.householdId}
                          type="button"
                          onClick={() => switchHousehold(h.householdId)}
                          className="w-full min-h-[40px] flex items-center justify-between gap-2 px-3 py-2 text-xs font-medium bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-lg transition-colors"
                        >
                          <span>{h.name}</span>
                          <span className="text-slate-500 dark:text-slate-400">
                            {h.householdId === activeHousehold.householdId
                              ? 'Viewing now'
                              : `${h.memberIds.length} member${h.memberIds.length === 1 ? '' : 's'}`}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                    <p className="text-xs font-medium text-slate-700 dark:text-slate-300">
                      The family
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      The family is the widest circle — wider than any one household.
                      Anything aimed at the family reaches everyone in it, in every
                      household that belongs to it. A household joins the family when
                      its owner links it; the household's people join the family's
                      roster at the same time.
                    </p>
                    {families.length === 0 ? (
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        No family yet. Create one to draw the widest circle.
                      </p>
                    ) : (
                      families.map((f) => (
                        <div key={f.id} className="space-y-2">
                          <div className="flex items-center justify-between gap-2 px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg">
                            <span className="text-xs text-slate-900 dark:text-slate-100">
                              {f.name}
                              <span className="text-slate-500 dark:text-slate-400">
                                {' '}
                                — {f.memberIds.length} account{f.memberIds.length === 1 ? '' : 's'}
                                {activeFamily?.id === f.id ? ' · this household is linked' : ''}
                              </span>
                            </span>
                            {activeFamily?.id !== f.id &&
                              f.ownerId === user.uid &&
                              activeHousehold.ownerId === user.uid && (
                                <button
                                  type="button"
                                  onClick={() => void handleLinkHouseholdToFamily(f)}
                                  className="min-h-[36px] px-3 text-xs font-medium text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800 hover:bg-teal-50 dark:hover:bg-teal-950/40 rounded-lg"
                                >
                                  Link this household
                                </button>
                              )}
                          </div>
                          <div className="px-3 space-y-1.5">
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              Head of the family: {familyHeadName(f)} —{' '}
                              {f.headMode === 'chosen'
                                ? 'chosen by the family.'
                                : 'the eldest living counted person, blood first, then age.'}{' '}
                              The roster counts people, not just accounts:
                              cousins who never open the app are family too, and nobody is
                              taken off it when they die. The family doesn't forget.
                            </p>
                            {familyHeadUid(f) === user.uid &&
                              (!f.recovery ? (
                                <div className="space-y-2 pt-1">
                                  <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                                    Family recovery is not set up for this family yet. You
                                    head it, so the choice is yours: the desk makes a family
                                    recovery key, hands a wrapped copy to every account
                                    holder, and wraps your vault key under it. If you ever
                                    lose your passphrase, the family votes — more than half
                                    the account holders — and the desk hands your key back.
                                    Without the vote, your sealed records stay sealed.
                                  </p>
                                  <div className="flex flex-wrap items-center gap-2">
                                    <input
                                      type="password"
                                      value={familyRecoveryPass}
                                      onChange={(e) => setFamilyRecoveryPass(e.target.value)}
                                      placeholder="Your vault passphrase, once"
                                      className="min-h-[38px] px-3 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => void handleSetupFamilyRecovery(f)}
                                      className="min-h-[38px] px-3 text-xs font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg"
                                    >
                                      Set up family recovery
                                    </button>
                                  </div>
                                  {familyRecoveryFeedback && (
                                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                      {familyRecoveryFeedback}
                                    </p>
                                  )}
                                </div>
                              ) : (
                                <p className="text-xs text-slate-500 dark:text-slate-400 pt-1">
                                  Family recovery is set up — wrapped for{' '}
                                  {Object.keys(f.recovery.wraps || {}).length} of{' '}
                                  {f.memberIds.length} account holders. If you lose your
                                  passphrase, the family can vote your key back from the
                                  sealed-records section above.
                                </p>
                              ))}
                            {resetRequests
                              .filter((r) => r.familyId === f.id && r.status !== 'done')
                              .map((r) => (
                                <div
                                  key={r.id}
                                  className="space-y-1.5 pt-1 border-t border-slate-100 dark:border-slate-800"
                                >
                                  {r.forUid === user.uid ? (
                                    <p className="text-xs text-slate-500 dark:text-slate-400">
                                      Your reset request is with the family — {r.approvals.length}{' '}
                                      approval{r.approvals.length === 1 ? '' : 's'} so far
                                      {r.status === 'delivered'
                                        ? ', and your key has been delivered. Take it back from the sealed-records section above.'
                                        : '.'}
                                    </p>
                                  ) : (
                                    <>
                                      <p className="text-xs text-slate-600 dark:text-slate-300">
                                        {r.forName}, head of this family, has lost their vault
                                        passphrase and asks the family for a reset.{' '}
                                        {r.approvals.length} of {f.memberIds.length} account
                                        holders have approved; it takes more than half.
                                        {r.status === 'delivered'
                                          ? ' The key has been delivered.'
                                          : ''}
                                      </p>
                                      {!r.approvals.includes(user.uid) && r.status === 'open' && (
                                        <button
                                          type="button"
                                          onClick={() => void handleApproveReset(r)}
                                          className="min-h-[38px] px-3 text-xs font-medium text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800 hover:bg-teal-50 dark:hover:bg-teal-950/40 rounded-lg"
                                        >
                                          Approve the reset
                                        </button>
                                      )}
                                    </>
                                  )}
                                </div>
                              ))}
                            {f.ownerId === user.uid && (
                              <div className="flex flex-wrap items-center gap-2 pt-1">
                                <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
                                  <span>Headship:</span>
                                  <select
                                    value={f.headMode === 'chosen' ? 'chosen' : 'seniority'}
                                    onChange={(e) =>
                                      void updateDoc(doc(db, 'families', f.id), {
                                        headMode: e.target.value === 'chosen' ? 'chosen' : 'seniority',
                                        updatedAt: serverTimestamp(),
                                      }).catch((err) =>
                                        handleFirestoreError(err, OperationType.UPDATE, `families/${f.id}`)
                                      )
                                    }
                                    className="min-h-[34px] px-2 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-md text-slate-900 dark:text-slate-100"
                                  >
                                    <option value="seniority">Rank by age and blood</option>
                                    <option value="chosen">Chosen by the family</option>
                                  </select>
                                </label>
                                {f.headMode === 'chosen' && (
                                  <>
                                    <input
                                      type="text"
                                      value={headDrafts[`${f.id}:0`] ?? f.headNames?.[0] ?? ''}
                                      onChange={(e) =>
                                        setHeadDrafts((prev) => ({ ...prev, [`${f.id}:0`]: e.target.value }))
                                      }
                                      placeholder="Head's name"
                                      className="w-36 min-h-[34px] px-2 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-md text-slate-900 dark:text-slate-100"
                                    />
                                    <input
                                      type="text"
                                      value={headDrafts[`${f.id}:1`] ?? f.headNames?.[1] ?? ''}
                                      onChange={(e) =>
                                        setHeadDrafts((prev) => ({ ...prev, [`${f.id}:1`]: e.target.value }))
                                      }
                                      placeholder="Co-head (optional)"
                                      className="w-36 min-h-[34px] px-2 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-md text-slate-900 dark:text-slate-100"
                                    />
                                    <button
                                      type="button"
                                      onClick={() =>
                                        void updateDoc(doc(db, 'families', f.id), {
                                          headNames: [
                                            (headDrafts[`${f.id}:0`] ?? f.headNames?.[0] ?? '').trim(),
                                            (headDrafts[`${f.id}:1`] ?? f.headNames?.[1] ?? '').trim(),
                                          ]
                                            .filter(Boolean)
                                            .slice(0, 2),
                                          updatedAt: serverTimestamp(),
                                        }).catch((err) =>
                                          handleFirestoreError(err, OperationType.UPDATE, `families/${f.id}`)
                                        )
                                      }
                                      className="min-h-[34px] px-3 text-xs font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-md"
                                    >
                                      Save heads
                                    </button>
                                  </>
                                )}
                              </div>
                            )}
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              Becoming responsible: at the age this family sets — 18
                              unless the family chooses otherwise — a member enters the
                              family's read/write stream on their own, figured from
                              their birthdate on the roster. Children see the family
                              calendar, but not the family's money, papers, or property
                              records, and they can add to the calendar only when a
                              parent says so. The head can bring someone in early or
                              hold someone back. These rules are this family's own,
                              set at the top and working down; where rules conflict,
                              the elder head's word stands.
                            </p>
                            {f.ownerId === user.uid && (
                              <div className="flex flex-wrap items-center gap-2">
                                <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
                                  <span>Responsible at age:</span>
                                  <input
                                    type="number"
                                    min={1}
                                    max={120}
                                    value={
                                      responsibleAgeDrafts[f.id] ??
                                      String(familyResponsibleAge(f))
                                    }
                                    onChange={(e) =>
                                      setResponsibleAgeDrafts((prev) => ({
                                        ...prev,
                                        [f.id]: e.target.value,
                                      }))
                                    }
                                    className="w-20 min-h-[34px] px-2 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-md text-slate-900 dark:text-slate-100"
                                  />
                                </label>
                                <button
                                  type="button"
                                  onClick={() => void handleSaveResponsibleAge(f)}
                                  className="min-h-[34px] px-3 text-xs font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-md"
                                >
                                  Save age
                                </button>
                              </div>
                            )}
                            {(f.people || []).map((person, idx) => (
                              <div
                                key={idx}
                                className="flex items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-400"
                              >
                                <span>
                                  {person.name}
                                  {person.birthDate
                                    ? ` · born ${person.birthDate}`
                                    : person.birthYear
                                      ? ` · born ${person.birthYear}`
                                      : ''}
                                  {person.userId
                                    ? personIsResponsible(f, person, localDateKey())
                                      ? ' · in the stream'
                                      : ' · not yet responsible'
                                    : ''}
                                  {person.blood === false ? ' · by marriage or choice' : ''}
                                  {person.courtesy ? ' · courtesy' : ''}
                                  {person.living === false ? ' · remembered' : ''}
                                  {familyHeadName(f) === person.name && person.living !== false
                                    ? ' · head'
                                    : ''}
                                </span>
                                {f.ownerId === user.uid && (
                                  <span className="flex gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        void handleSetFamilyPersonLiving(f, idx, person.living === false)
                                      }
                                      className="min-h-[30px] px-2 text-[11px] font-medium text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded-md"
                                    >
                                      {person.living === false ? 'Mark living' : 'Mark as passed'}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => void handleRemoveFamilyPerson(f, idx)}
                                      className="min-h-[30px] px-2 text-[11px] font-medium text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800 rounded-md"
                                    >
                                      Remove
                                    </button>
                                  </span>
                                )}
                              </div>
                            ))}
                            {(f.people || []).map((person, idx) =>
                              f.ownerId === user.uid ? (
                                <div
                                  key={`standing-${idx}`}
                                  className="flex flex-wrap items-center gap-x-3 gap-y-1 pl-1 text-[11px] text-slate-500 dark:text-slate-400"
                                >
                                  <span>{person.name}:</span>
                                  <label className="flex items-center gap-1.5">
                                    <span>Standing</span>
                                    <select
                                      value={person.responsibility || 'auto'}
                                      onChange={(e) =>
                                        void handleUpdateFamilyPerson(f, idx, {
                                          responsibility: e.target.value as
                                            | 'auto'
                                            | 'yes'
                                            | 'no',
                                        })
                                      }
                                      className="min-h-[28px] px-1.5 text-[11px] bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-md text-slate-900 dark:text-slate-100"
                                    >
                                      <option value="auto">By age</option>
                                      <option value="yes">In the stream now</option>
                                      <option value="no">Held back</option>
                                    </select>
                                  </label>
                                  <label className="flex items-center gap-1.5">
                                    <span>At age</span>
                                    <input
                                      type="number"
                                      min={1}
                                      max={120}
                                      defaultValue={person.responsibleAge ?? ''}
                                      placeholder={String(familyResponsibleAge(f))}
                                      onBlur={(e) => {
                                        const v = e.target.value.trim();
                                        if (v === '') {
                                          if (person.responsibleAge !== undefined) {
                                            void handleUpdateFamilyPerson(f, idx, {}, [
                                              'responsibleAge',
                                            ]);
                                          }
                                          return;
                                        }
                                        const n = Number(v);
                                        if (Number.isFinite(n) && n >= 1 && n <= 120) {
                                          void handleUpdateFamilyPerson(f, idx, {
                                            responsibleAge: Math.floor(n),
                                          });
                                        }
                                      }}
                                      className="w-16 min-h-[28px] px-1.5 text-[11px] bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-md text-slate-900 dark:text-slate-100"
                                    />
                                  </label>
                                  <label className="flex items-center gap-1.5">
                                    <input
                                      type="checkbox"
                                      checked={!!person.canWriteCalendar}
                                      onChange={(e) =>
                                        void handleUpdateFamilyPerson(f, idx, {
                                          canWriteCalendar: e.target.checked,
                                        })
                                      }
                                    />
                                    <span>May add to the calendar</span>
                                  </label>
                                </div>
                              ) : null
                            )}
                            {f.ownerId === user.uid && (
                              <div className="flex gap-2 pt-1">
                                <input
                                  type="text"
                                  value={personNameDraft}
                                  onChange={(e) => setPersonNameDraft(e.target.value)}
                                  placeholder="Count a person — name"
                                  className="flex-1 min-h-[38px] px-3 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100"
                                />
                                <input
                                  type="number"
                                  value={personYearDraft}
                                  onChange={(e) => setPersonYearDraft(e.target.value)}
                                  placeholder="Born (year)"
                                  className="w-28 min-h-[38px] px-3 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100"
                                />
                                <select
                                  value={personKindDraft}
                                  onChange={(e) =>
                                    setPersonKindDraft(
                                      e.target.value as 'blood' | 'marriage' | 'courtesy'
                                    )
                                  }
                                  className="min-h-[38px] px-2 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100"
                                >
                                  <option value="blood">Blood</option>
                                  <option value="marriage">By marriage or choice</option>
                                  <option value="courtesy">Courtesy</option>
                                </select>
                                <button
                                  type="button"
                                  onClick={() => void handleAddFamilyPerson(f)}
                                  className="min-h-[38px] px-3 text-xs font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg"
                                >
                                  Add
                                </button>
                              </div>
                            )}
                            {f.ownerId === user.uid && (
                              <div className="flex flex-wrap gap-2">
                                <label className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                                  <span>Birthdate, if known</span>
                                  <input
                                    type="date"
                                    value={personDateDraft}
                                    onChange={(e) => setPersonDateDraft(e.target.value)}
                                    className="min-h-[38px] px-2 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100"
                                  />
                                </label>
                                <label className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                                  <span>Their account, if they use the app</span>
                                  <select
                                    value={personLinkDraft}
                                    onChange={(e) => setPersonLinkDraft(e.target.value)}
                                    className="min-h-[38px] px-2 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100"
                                  >
                                    <option value="">No account link</option>
                                    {householdMembers.map((m) => (
                                      <option key={m.userId} value={m.userId}>
                                        {m.displayName}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                              </div>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                    <form onSubmit={handleCreateFamily} className="flex gap-2">
                      <input
                        type="text"
                        value={familyNameDraft}
                        onChange={(e) => setFamilyNameDraft(e.target.value)}
                        placeholder="Family name — for example, McWhirter"
                        className="flex-1 min-h-[42px] px-3 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100"
                      />
                      <button
                        type="submit"
                        className="min-h-[42px] inline-flex items-center px-3.5 text-xs font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg"
                      >
                        Create family
                      </button>
                    </form>
                    {familyFeedback && (
                      <p className="text-xs text-teal-700 dark:text-teal-400">{familyFeedback}</p>
                    )}
                  </div>

                  <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                    <p className="text-xs font-medium text-slate-700 dark:text-slate-300">
                      Circles
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      A circle is a set of people you draw yourself — any shape at all.
                      Only its members can see the circle, or anything aimed at it.
                      A circle can be permanent, or temporary with a closing date;
                      when it closes, its records keep their owner and their other
                      tags.
                    </p>
                    {circles.length === 0 ? (
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        No circles yet.
                      </p>
                    ) : (
                      circles.map((c) => {
                        const iGovern =
                          c.ownerId === user.uid || circleHeadIds(c).includes(user.uid);
                        return (
                          <div
                            key={c.id}
                            className="px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg space-y-2"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs text-slate-900 dark:text-slate-100">
                                {c.name}
                                <span className="text-slate-500 dark:text-slate-400">
                                  {' '}
                                  — {c.memberIds.length} people
                                  {c.temporary
                                    ? ` · temporary${c.expiresAtKey ? `, closes ${c.expiresAtKey}` : ''}`
                                    : ' · permanent'}
                                  {' · head: '}
                                  {circleHeadIds(c).map(memberDisplayName).join(' & ')}
                                </span>
                              </span>
                              {c.ownerId === user.uid && (
                                <button
                                  type="button"
                                  onClick={() => void handleDeleteCircle(c)}
                                  className="min-h-[36px] px-3 text-xs font-medium text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg"
                                >
                                  End circle
                                </button>
                              )}
                            </div>
                            {iGovern && (
                              <div className="space-y-2 pt-1 border-t border-slate-200 dark:border-slate-800">
                                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                  Everyone in the circle sees everything by default —
                                  default on. The head can leave a person or a kind of
                                  record out of this circle's views, writes, or
                                  submissions.
                                </p>
                                {c.ownerId === user.uid && (
                                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                                    <span className="text-[11px] text-slate-500 dark:text-slate-400">
                                      Heads (up to two — a couple can head together):
                                    </span>
                                    {c.memberIds.map((mid) => (
                                      <label
                                        key={mid}
                                        className="flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-300"
                                      >
                                        <input
                                          type="checkbox"
                                          checked={(c.headIds || []).includes(mid)}
                                          disabled={
                                            !(c.headIds || []).includes(mid) &&
                                            (c.headIds || []).length >= 2
                                          }
                                          onChange={(e) =>
                                            handleToggleCircleHead(c, mid, e.target.checked)
                                          }
                                        />
                                        <span>{memberDisplayName(mid)}</span>
                                      </label>
                                    ))}
                                  </div>
                                )}
                                {c.memberIds
                                  .filter((mid) => mid !== user.uid)
                                  .map((mid) => (
                                    <div
                                      key={mid}
                                      className="flex flex-wrap items-center gap-x-3 gap-y-1"
                                    >
                                      <span className="text-[11px] text-slate-600 dark:text-slate-300">
                                        {memberDisplayName(mid)}:
                                      </span>
                                      <label className="flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-300">
                                        <input
                                          type="checkbox"
                                          checked={!(c.omitViewIds || []).includes(mid)}
                                          onChange={(e) =>
                                            handleToggleCircleOmit(
                                              c,
                                              'omitViewIds',
                                              mid,
                                              !e.target.checked
                                            )
                                          }
                                        />
                                        <span>Sees the records</span>
                                      </label>
                                      <label className="flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-300">
                                        <input
                                          type="checkbox"
                                          checked={!(c.omitWriteIds || []).includes(mid)}
                                          onChange={(e) =>
                                            handleToggleCircleOmit(
                                              c,
                                              'omitWriteIds',
                                              mid,
                                              !e.target.checked
                                            )
                                          }
                                        />
                                        <span>Can add records</span>
                                      </label>
                                    </div>
                                  ))}
                                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                                    Shown in this circle:
                                  </span>
                                  {(
                                    [
                                      ['financial', 'Financial'],
                                      ['medical', 'Medical'],
                                      ['calendar', 'Calendar events'],
                                      ['personal', 'Personal'],
                                      ['custom', 'Custom kinds'],
                                    ] as Array<[string, string]>
                                  ).map(([kind, label]) => (
                                    <label
                                      key={kind}
                                      className="flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-300"
                                    >
                                      <input
                                        type="checkbox"
                                        checked={!(c.omitKinds || []).includes(kind)}
                                        onChange={(e) =>
                                          handleToggleCircleKind(c, kind, !e.target.checked)
                                        }
                                      />
                                      <span>{label}</span>
                                    </label>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                    <form onSubmit={handleCreateCircle} className="space-y-2">
                      <input
                        type="text"
                        value={circleNameDraft}
                        onChange={(e) => setCircleNameDraft(e.target.value)}
                        placeholder="Circle name — for example, Boat surprise"
                        className="w-full min-h-[42px] px-3 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100"
                      />
                      {householdMembers
                        .filter((m) => m.userId !== user.uid)
                        .map((m) => (
                          <label
                            key={m.userId}
                            className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400"
                          >
                            <input
                              type="checkbox"
                              checked={circlePicks.includes(m.userId)}
                              onChange={(e) =>
                                setCirclePicks((prev) =>
                                  e.target.checked
                                    ? [...prev, m.userId]
                                    : prev.filter((x) => x !== m.userId)
                                )
                              }
                            />
                            <span>{m.displayName}</span>
                          </label>
                        ))}
                      <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
                        <input
                          type="checkbox"
                          checked={circleTemporary}
                          onChange={(e) => setCircleTemporary(e.target.checked)}
                        />
                        <span>Temporary — it closes on a date</span>
                      </label>
                      {circleTemporary && (
                        <input
                          type="date"
                          value={circleExpiry}
                          onChange={(e) => setCircleExpiry(e.target.value)}
                          className="min-h-[42px] px-3 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100"
                        />
                      )}
                      <button
                        type="submit"
                        className="min-h-[42px] inline-flex items-center px-3.5 text-xs font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg"
                      >
                        Draw circle
                      </button>
                      {circleFeedback && (
                        <p className="text-xs text-teal-700 dark:text-teal-400">{circleFeedback}</p>
                      )}
                    </form>
                  </div>

                  <div className="space-y-1.5 pt-1">
                    <p className="text-xs font-medium text-slate-700 dark:text-slate-300">
                      Place
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      The trunk is Mom, and the desk grows in two main branches. Texas
                      holds Riva Jade — the homestead, its rental cabin, and the wildlife
                      conservancy. Louisiana holds Oakleaf (Jason's place, Mom's in
                      reserve) and Elephant Walk (Derek and Dawn's). Each record can be
                      marked with its place; pick one branch here and every list shows
                      just what's under it. All places is the master copy of everything.
                    </p>
                    <select
                      value={selectedPlace}
                      onChange={(e) => switchPlace(e.target.value)}
                      aria-label="Show one place"
                      className="w-full min-h-[42px] px-3 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100"
                    >
                      {PLACE_FILTERS.map((f) => (
                        <option key={f.value} value={f.value}>
                          {f.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <form onSubmit={handleCreateHousehold} className="space-y-2 pt-1">
                    <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                      Start another household
                    </label>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Each household is its own private desk. Only its own members can see its
                      records — a second household stays separate from this one.
                    </p>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={householdNameDraft}
                        onChange={(e) => setHouseholdNameDraft(e.target.value)}
                        placeholder="e.g., Derek and Dawn's House"
                        className="flex-1 min-h-[42px] px-3 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100"
                      />
                      <button
                        type="submit"
                        className="min-h-[42px] inline-flex items-center px-3.5 text-xs font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg"
                      >
                        Create
                      </button>
                    </div>
                  </form>
                </div>
              ) : (
                <div className="space-y-3 text-sm">
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    A household is how your family shares one desk — the same schedule,
                    documents, and records, on everyone's own phone or computer.
                  </p>
                  <form onSubmit={handleCreateHousehold} className="space-y-2">
                    <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                      Start your family's household
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={householdNameDraft}
                        onChange={(e) => setHouseholdNameDraft(e.target.value)}
                        placeholder="e.g., McWhirter Family"
                        className="flex-1 min-h-[42px] px-3 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100"
                      />
                      <button
                        type="submit"
                        className="min-h-[42px] inline-flex items-center px-3.5 text-xs font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg"
                      >
                        Create
                      </button>
                    </div>
                  </form>
                </div>
              )}
              {joinableHouseholds
                .filter((h) => !households.some((mine) => mine.householdId === h.householdId))
                .map((h) => (
                  <div
                    key={h.householdId}
                    className="flex items-center justify-between gap-2 rounded-lg border border-teal-200 dark:border-teal-800 bg-teal-50 dark:bg-teal-950/40 px-3 py-2"
                  >
                    <span className="text-xs text-teal-900 dark:text-teal-200">
                      {h.ownerName} invited you to join "{h.name}"
                    </span>
                    <button
                      type="button"
                      onClick={() => handleJoinHousehold(h)}
                      className="min-h-[36px] px-3 text-xs font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg"
                    >
                      Join
                    </button>
                  </div>
                ))}
              {householdFeedback && (
                <p className="text-xs text-teal-700 dark:text-teal-400">{householdFeedback}</p>
              )}
            </div>

            <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <PWAInstallModalTrigger compact />
                <button
                  type="button"
                  onClick={() => {
                    setSettingsOpen(false);
                    setDriveBackupOpen(true);
                  }}
                  className="min-h-[44px] inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800 hover:bg-teal-50 dark:hover:bg-teal-950/40 rounded-lg transition-colors"
                >
                  <HardDrive className="w-4 h-4" />
                  <span>Google Drive Backups</span>
                </button>
                <a
                  href="/api/project/download"
                  download="steward-project.zip"
                  className="min-h-[44px] inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800 hover:bg-teal-50 dark:hover:bg-teal-950/40 rounded-lg transition-colors"
                >
                  <Download className="w-4 h-4" />
                  <span>Download Source (.zip)</span>
                </a>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setDarkMode((d) => !d)}
                  className="min-h-[44px] inline-flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-lg"
                >
                  {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                  <span>{darkMode ? 'Light' : 'Dark'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => signOutUser()}
                  className="min-h-[44px] inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900 rounded-lg"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Sign Out</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Google Drive Backup Modal */}
      <GoogleDriveBackupModal
        accountRecords={accountRecords}
        credentials={credentials}
        directoryEntries={directoryEntries}
        emergencySheets={emergencySheets}
        storageRootParentId={
          headedStorage()?.rootChoice === 'custom' ? headedStorage()?.rootId || '' : ''
        }
        open={driveBackupOpen}
        onClose={() => setDriveBackupOpen(false)}
        tasks={tasks}
        documents={documents}
        propertyEntries={propertyEntries}
        financeEntries={financeEntries}
        voiceMemories={voiceMemories}
        households={households}
        householdMembers={householdMembers}
        families={families}
        circles={circles}
        jasonNotes={jasonNotes}
        briefings={briefings}
        mailBriefings={ownMailBriefings}
        circleBriefings={ownCircleBriefings}
        onRestoreSnapshot={handleRestoreSnapshot}
        onLinkDocumentPhoto={handleLinkDocumentDrivePhoto}
      />

      {/* Cross-App AI Assistant Slide-Over Drawer */}
      <AIAssistantDrawer
        open={assistantOpen}
        onClose={() => setAssistantOpen(false)}
        userName={userProfile?.displayName || user.displayName || 'User'}
        tasks={visibleTasks}
        propertyEntries={visiblePropertyEntries}
        financeEntries={visibleFinanceEntries}
        documents={visibleDocuments}
        driveConnected={driveConnected}
        aiAccess={userProfile?.aiAccess !== false}
        aiWrite={userProfile?.aiWrite === true}
        onCreateTask={handleCreateTask}
        onLogFinanceEntry={handleCreateFinanceEntry}
        onCreatePropertyEntry={handleCreatePropertyEntry}
        onOpenDriveBackup={() => setDriveBackupOpen(true)}
        onNavigate={setActiveTab}
        onCreateJasonNote={(text) => handleCreateJasonNote(text, 'assistant')}
        onCaptureDocument={handleCaptureDocument}
        onCompleteTaskByTitle={handleCompleteTaskByTitle}
      />

      {/* The Front Door — the big simple screen (2026-11-20) */}
      {frontDoorOpen && (
        <FrontDoorView
          userName={userProfile?.displayName || user.displayName || 'User'}
          addressName={userProfile?.addressName || ''}
          voiceMuted={Boolean(userProfile?.voiceMuted)}
          onToggleMuted={() =>
            void handleUpdateDeskPrefs({ voiceMuted: !userProfile?.voiceMuted })
          }
          onClose={() => setFrontDoorOpen(false)}
          tasks={visibleTasks}
          propertyEntries={visiblePropertyEntries}
          financeEntries={visibleFinanceEntries}
          documents={visibleDocuments}
          driveConnected={driveConnected}
        aiAccess={userProfile?.aiAccess !== false}
        aiWrite={userProfile?.aiWrite === true}
          notice={frontDoorNotice}
          onCreateTask={handleCreateTask}
          onLogFinanceEntry={handleCreateFinanceEntry}
          onCreatePropertyEntry={handleCreatePropertyEntry}
          onOpenDriveBackup={() => setDriveBackupOpen(true)}
          onNavigate={setActiveTab}
          onDeskEngaged={handleDeskEngaged}
          onCaptureDocument={handleCaptureDocument}
          onCreateJasonNote={handleCreateJasonNote}
          onCompleteTaskByTitle={handleCompleteTaskByTitle}
          onShowCalendar={handleShowCalendar}
          briefingText={todaysBriefing?.text || null}
          onRequestBriefing={handleEnsureBriefing}
          mailBriefingText={todaysMailBriefing?.text || null}
          onRequestMailBriefing={handleEnsureMailBriefing}
          circleBriefingText={todaysCircleBriefing?.text || null}
          onRequestCircleBriefing={handleEnsureCircleBriefing}
          onSaveMemory={handleSaveVoiceMemory}
          onRecordBehaviorSignal={handleRecordBehaviorSignal}
        />
      )}

      {/* Offline Mode Banner */}
      {!isOnline && (
        <div className="fixed bottom-20 lg:bottom-4 left-4 z-50 flex items-center gap-2 rounded-lg bg-amber-600 px-3 py-2 text-xs font-medium text-white shadow-lg">
          <WifiOff className="w-3.5 h-3.5" />
          <span>Offline Mode — Changes will sync when reconnected.</span>
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <MainApp />
    </ErrorBoundary>
  );
}

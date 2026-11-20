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
  WifiOff,
  Trees,
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
} from './firebase';
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
import {
  ensureStewardPhotosFolder,
  listDriveBackups,
  uploadDriveBinaryFile,
  WorkspaceBackupSnapshot,
} from './services/googleDriveBackup';
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
  const [sharedFinanceEntries, setSharedFinanceEntries] = useState<FinanceEntry[]>([]);
  const [ownJasonNotes, setOwnJasonNotes] = useState<JasonNote[]>([]);
  const [sharedJasonNotes, setSharedJasonNotes] = useState<JasonNote[]>([]);
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
      unsubMemories();
      unsubJasonNotes();
      unsubJasonNotesShared();
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

  // What the views show: my private records plus the active household's.
  // The full merged lists above still feed Drive backup, restore, and the
  // membership sync, which work across every household I belong to.
  const householdInScope = (hid: string) =>
    !hid ||
    !activeHousehold ||
    hid === activeHousehold.householdId ||
    !households.some((h) => h.householdId === hid);
  const visibleTasks = useMemo(
    () => tasks.filter((t) => householdInScope(t.householdId)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tasks, activeHousehold, households]
  );
  const visibleDocuments = useMemo(
    () => documents.filter((d) => householdInScope(d.householdId)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [documents, activeHousehold, households]
  );
  const visiblePropertyEntries = useMemo(
    () => propertyEntries.filter((p) => householdInScope(p.householdId)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [propertyEntries, activeHousehold, households]
  );
  const visibleFinanceEntries = useMemo(
    () => financeEntries.filter((f) => householdInScope(f.householdId)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [financeEntries, activeHousehold, households]
  );
  const visibleJasonNotes = useMemo(
    () => jasonNotes.filter((n) => householdInScope(n.householdId)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [jasonNotes, activeHousehold, households]
  );

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
    const stamp = householdStamp();
    try {
      await setDoc(doc(db, 'tasks', id), {
        userId: user.uid,
        householdId: stamp.householdId,
        memberIds: stamp.memberIds,
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
        notes: (payload.notes || '').slice(0, 2000),
        helpSteps: (payload.helpSteps || []).slice(0, 15).map((s) => s.slice(0, 400)),
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

  async function handleUpdateDeskPrefs(updates: { addressName?: string; voiceMuted?: boolean }) {
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
    try {
      await setDoc(doc(db, 'documents', id), {
        userId: user.uid,
        householdId: stamp.householdId,
        memberIds: stamp.memberIds,
        title: payload.title.slice(0, 200),
        category: payload.category,
        ocrText: payload.ocrText.slice(0, 99000),
        summary: payload.summary.slice(0, 1000),
        tags: payload.tags.slice(0, 20).map((t) => t.slice(0, 40)),
        keyDetails: payload.keyDetails.slice(0, 25).map((k) => k.slice(0, 240)),
        detectedDate: payload.detectedDate.slice(0, 20),
        imageUrl: payload.imageUrl.slice(0, 500),
        fileName: payload.fileName.slice(0, 200),
        notes: (payload.notes || '').slice(0, 2000),
        verificationStatus: 'provisional',
        verifiedByName: '',
        verifiedAtIso: '',
        paperLocation: (payload.paperLocation || '').slice(0, 200),
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
      if (updates.verifiedByName !== undefined)
        clean.verifiedByName = updates.verifiedByName.slice(0, 120);
      if (updates.verifiedAtIso !== undefined)
        clean.verifiedAtIso = updates.verifiedAtIso.slice(0, 40);
      if (updates.paperLocation !== undefined)
        clean.paperLocation = updates.paperLocation.slice(0, 200);
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
        notes: (payload.notes || '').slice(0, 2000),
        linkedDocumentId: (payload.linkedDocumentId || '').slice(0, 128),
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
        place: (payload.place || '').slice(0, 60),
        careForJason: Boolean(payload.careForJason),
        taxDeductible: Boolean(payload.taxDeductible),
        notes: (payload.notes || '').slice(0, 2000),
        linkedDocumentId: (payload.linkedDocumentId || '').slice(0, 128),
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
      if (updates.place !== undefined) clean.place = updates.place.slice(0, 60);
      if (updates.careForJason !== undefined) clean.careForJason = Boolean(updates.careForJason);
      if (updates.taxDeductible !== undefined) clean.taxDeductible = Boolean(updates.taxDeductible);
      if (updates.notes !== undefined) clean.notes = updates.notes.slice(0, 2000);
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
            </form>

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
        open={driveBackupOpen}
        onClose={() => setDriveBackupOpen(false)}
        tasks={tasks}
        documents={documents}
        propertyEntries={propertyEntries}
        financeEntries={financeEntries}
        voiceMemories={voiceMemories}
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

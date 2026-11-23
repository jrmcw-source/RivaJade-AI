import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Mic,
  MicOff,
  Send,
  X,
  Volume2,
  VolumeX,
  Camera,
  Calendar,
  Check,
  Loader2,
  Moon,
  Wallet,
  Trees,
  HardDrive,
  ArrowRight,
  Plus,
  Sunrise,
} from 'lucide-react';
import {
  CATEGORIES,
  Category,
  FinanceEntry,
  FinanceKind,
  isPlaceName,
  isArchivedFinanceEntry,
  PropertyCadence,
  PropertyEntry,
  PropertyEntryArea,
  PropertyEntryStatus,
  ScannedDocument,
  DeskPing,
  ScheduleTask,
  TaskPriority,
  TaskType,
  getLocalTodayIso,
} from '../types';
import { floatTo16BitPcmBase64, base64PcmToFloat32 } from './GeminiLiveVoiceView';
import type { AssistantNavTarget } from './AIAssistantDrawer';

// ---------------------------------------------------------------------------
// The Front Door (Jason's design, 2026-11-20)
//
// One big simple screen is the whole entrance: a greeting, one big talk
// button, a type field, a big CLOSE button, and a big MUTE button. Once
// she engages — by voice or by typing — the conversation continues in a
// large panel while the desk that is answering opens its own screen
// behind it. Everything is both, at least to start: the desk speaks out
// loud AND listens AND shows its words as text AND offers the expected
// answers as big buttons AND leaves a blank field. Voice or tap, either
// one answers. Left alone, the desk asks once if there is anything else,
// then says its goodnight and snoozes until she touches it again.
//
// The conversation itself runs through the supervisor and its desks
// (/api/assistant/chat), so the desk that replies is the desk whose
// screen shows. Speech is the input channel where the browser offers
// speech recognition; where it does not, the talk button opens the live
// voice session instead, and the desk says so in plain words.
// ---------------------------------------------------------------------------

export type FrontDoorDeskId = 'records' | 'appointments' | 'finance' | 'general';

interface SuggestedAction {
  type:
    | 'create_task'
    | 'log_expense'
    | 'create_property_entry'
    | 'open_drive_backup'
    | 'navigate'
    | 'note_for_jason'
    | 'capture_document'
    | 'complete_task'
    | 'show_calendar';
  label: string;
  payloadJson: string;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  choices?: string[];
  suggestedActions?: SuggestedAction[];
}

interface FrontDoorViewProps {
  userName: string;
  addressName: string;
  voiceMuted: boolean;
  onToggleMuted: () => void;
  onClose: () => void;
  tasks: ScheduleTask[];
  propertyEntries: PropertyEntry[];
  financeEntries: FinanceEntry[];
  documents: ScannedDocument[];
  pings?: DeskPing[];
  onMarkPingSeen?: (ping: DeskPing) => void;
  driveConnected: boolean;
  aiAccess?: boolean;
  aiWrite?: boolean;
  notice: { id: number; text: string } | null;
  onCreateTask: (
    payload: Omit<
      ScheduleTask,
      'id' | 'userId' | 'createdAt' | 'updatedAt' | 'completedAtIso' | 'status' | 'householdId' | 'memberIds'
    >
  ) => Promise<void>;
  onLogFinanceEntry: (
    payload: Omit<FinanceEntry, 'id' | 'userId' | 'createdAt' | 'updatedAt' | 'householdId' | 'memberIds'>
  ) => Promise<void>;
  onCreatePropertyEntry: (
    payload: Omit<PropertyEntry, 'id' | 'userId' | 'createdAt' | 'updatedAt' | 'householdId' | 'memberIds'>
  ) => Promise<void>;
  onOpenDriveBackup: () => void;
  onNavigate: (tab: AssistantNavTarget) => void;
  onDeskEngaged: (desk: FrontDoorDeskId) => void;
  onCaptureDocument: (place: string) => void;
  onCreateJasonNote: (text: string, source: string) => Promise<void>;
  onCompleteTaskByTitle: (
    titleQuery: string,
    completionState?: 'finished' | 'more',
    remainderNote?: string
  ) => Promise<string | null>;
  onShowCalendar: (summary: string) => void;
  briefingText: string | null;
  onRequestBriefing: () => Promise<string | null>;
  mailBriefingText: string | null;
  onRequestMailBriefing: () => Promise<string | null>;
  circleBriefingText: string | null;
  onRequestCircleBriefing: () => Promise<string | null>;
  onSaveMemory: (payload: {
    summary: string;
    followUpSteps: string[];
    completedTaskTitles: string[];
    transcriptExcerpt: string;
  }) => Promise<void>;
  onRecordBehaviorSignal: (signal: string) => void;
}

const DESK_LABELS: Record<FrontDoorDeskId, string> = {
  records: 'Records Desk',
  appointments: 'Appointments Desk',
  finance: 'Finance Desk',
  general: 'Front Desk',
};

const WIND_DOWN_LINE = 'Is there anything else I can help you with now?';
const GOODNIGHT_LINE = "Okay, I'll snooze until you need me.";

const VALID_NAV_TABS: readonly AssistantNavTarget[] = [
  'schedule',
  'property',
  'finances',
  'vault',
  'projects',
];

const VALID_PROPERTY_AREAS: readonly PropertyEntryArea[] = [
  'conservancy',
  'cabin_maintenance',
  'cabin_stay',
];

const VALID_PROPERTY_STATUSES: readonly PropertyEntryStatus[] = [
  'nominal',
  'attention',
  'urgent',
  'upcoming',
  'ready',
  'completed',
];

const VALID_PROPERTY_CADENCES: readonly PropertyCadence[] = [
  'once',
  'monthly',
  'quarterly',
  'seasonal',
  'annual',
];

function safeIsoDate(raw: unknown): string {
  if (typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.trim())) {
    return raw.trim();
  }
  return getLocalTodayIso();
}

// The short version of the calendar, in plain spoken words: anything
// overdue, what is on today, and what comes next. Built from the live
// task list at the moment she asks, so it is never stale.
function buildCalendarSummary(tasks: ScheduleTask[], addressName: string): string {
  const today = getLocalTodayIso();
  const name = (addressName || '').trim();
  const fmtDay = (iso: string) =>
    new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    });
  const fmtTime = (t: string) => {
    if (!t) return '';
    const [h, m] = t.split(':').map(Number);
    if (Number.isNaN(h)) return '';
    const d = new Date();
    d.setHours(h, m || 0);
    return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  };
  const byWhen = (a: ScheduleTask, b: ScheduleTask) =>
    a.dueDate.localeCompare(b.dueDate) ||
    (a.dueTime || '99:99').localeCompare(b.dueTime || '99:99');
  const pending = tasks.filter((t) => t.status === 'pending');
  const overdue = pending.filter((t) => t.dueDate < today).sort(byWhen);
  const todays = pending.filter((t) => t.dueDate === today).sort(byWhen);
  const next = pending.filter((t) => t.dueDate > today).sort(byWhen)[0];
  const parts: string[] = [name ? `Here's your calendar, ${name}.` : "Here's your calendar."];
  if (overdue.length > 0) {
    parts.push(
      `There ${overdue.length === 1 ? 'is' : 'are'} ${overdue.length} overdue — the oldest is "${overdue[0].title}," from ${fmtDay(overdue[0].dueDate)}.`
    );
  }
  if (todays.length > 0) {
    const list = todays
      .slice(0, 3)
      .map((t) => `${t.title}${t.dueTime ? ` at ${fmtTime(t.dueTime)}` : ''}`)
      .join('; ');
    parts.push(`Today: ${list}${todays.length > 3 ? `, and ${todays.length - 3} more` : ''}.`);
  } else {
    parts.push('Nothing is on the calendar for today.');
  }
  if (next) {
    parts.push(
      `Next is "${next.title}" on ${fmtDay(next.dueDate)}${next.dueTime ? ` at ${fmtTime(next.dueTime)}` : ''}.`
    );
  }
  return parts.join(' ');
}

export const FrontDoorView: React.FC<FrontDoorViewProps> = (props) => {
  const {
    userName,
    addressName,
    voiceMuted,
    onToggleMuted,
    onClose,
    tasks,
    propertyEntries,
    financeEntries,
    documents,
    pings,
    onMarkPingSeen,
    driveConnected,
    aiAccess,
    aiWrite,
    notice,
    onCreateTask,
    onLogFinanceEntry,
    onCreatePropertyEntry,
    onOpenDriveBackup,
    onNavigate,
    onDeskEngaged,
    onCaptureDocument,
    onCreateJasonNote,
    onCompleteTaskByTitle,
    onShowCalendar,
    briefingText,
    onRequestBriefing,
    mailBriefingText,
    onRequestMailBriefing,
    circleBriefingText,
    onRequestCircleBriefing,
    onSaveMemory,
    onRecordBehaviorSignal,
  } = props;

  const displayName = addressName || userName.split(' ')[0] || 'there';

  const [phase, setPhase] = useState<'door' | 'engaged' | 'snoozed'>('door');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [briefingBusy, setBriefingBusy] = useState(false);
  const [appliedActions, setAppliedActions] = useState<Record<string, boolean>>({});
  const [listening, setListening] = useState(false);
  const [liveStatus, setLiveStatus] = useState<'idle' | 'connecting' | 'connected' | 'error'>('idle');
  const [activeDesk, setActiveDesk] = useState<FrontDoorDeskId>('general');
  const [windingDown, setWindingDown] = useState(false);

  const scrollEndRef = useRef<HTMLDivElement | null>(null);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const mutedRef = useRef(voiceMuted);
  mutedRef.current = voiceMuted;
  const sendingRef = useRef(false);
  const speakingRef = useRef(false);
  const wantListeningRef = useRef(true);
  const recognitionRef = useRef<{ stop: () => void } | null>(null);
  const srBlockedRef = useRef(false);
  const greetedRef = useRef(false);
  const lastActivityRef = useRef(Date.now());
  const windingRef = useRef(false);
  const recordedChannelsRef = useRef<Set<string>>(new Set());
  const lastNoticeIdRef = useRef(0);
  const lastLiveSpeakerRef = useRef<'user' | 'assistant' | null>(null);

  // Live voice session refs (same wire protocol as the Voice tab)
  const wsRef = useRef<WebSocket | null>(null);
  const inputCtxRef = useRef<AudioContext | null>(null);
  const outputCtxRef = useRef<AudioContext | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const liveStatusRef = useRef(liveStatus);
  liveStatusRef.current = liveStatus;
  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;
  const documentsRef = useRef(documents);
  documentsRef.current = documents;
  const propertyEntriesRef = useRef(propertyEntries);
  propertyEntriesRef.current = propertyEntries;
  const financeEntriesRef = useRef(financeEntries);
  financeEntriesRef.current = financeEntries;

  const pendingTasksCount = useMemo(
    () => tasks.filter((t) => t.status === 'pending').length,
    [tasks]
  );

  // The same workspace snapshot the assistant drawer builds, plus the
  // address name the front door rules speak by.
  const workspaceContext = useMemo(() => {
    const pending = tasks
      .filter((t) => t.status === 'pending')
      .slice(0, 25)
      .map(
        (t) =>
          `- [${t.priority.toUpperCase()}] ${t.title} (${t.category}, due ${t.dueDate}${
            t.dueTime ? ` ${t.dueTime}` : ''
          }, ${t.estimatedMinutes}m)${t.place ? ` @ ${t.place}` : ''}`
      )
      .join('\n');
    const completed = tasks
      .filter((t) => t.status === 'completed')
      .slice(0, 12)
      .map(
        (t) =>
          `- ${t.title} (${t.category}, completed ${t.completedAtIso.slice(0, 10)}${
            t.completionState === 'more'
              ? `, MORE TO DO${t.remainderNote ? `: ${t.remainderNote}` : ''}`
              : t.completionState === 'finished'
                ? ', finished'
                : ''
          })`
      )
      .join('\n');
    const wimberleySummary = propertyEntries
      .slice(0, 25)
      .map(
        (p) =>
          `- [${p.status}] ${p.title} (${p.area}, date ${p.scheduledDate}${
            p.endDate ? ` to ${p.endDate}` : ''
          }, cadence ${p.cadence})${p.notes ? `: ${p.notes.slice(0, 120)}` : ''}`
      )
      .join('\n');
    const groupTotals = new Map<string, { expenses: number; income: number; count: number }>();
    const activeFinances = financeEntries.filter(
      (f) => !isArchivedFinanceEntry(f, getLocalTodayIso())
    );
    for (const f of activeFinances) {
      const curr = groupTotals.get(f.group) || { expenses: 0, income: 0, count: 0 };
      if (f.kind === 'income') curr.income += f.amount;
      else curr.expenses += f.amount;
      curr.count += 1;
      groupTotals.set(f.group, curr);
    }
    const groupLines = Array.from(groupTotals.entries())
      .map(
        ([grp, stats]) =>
          `- ${grp}: $${stats.expenses.toFixed(2)} expenses, $${stats.income.toFixed(
            2
          )} income (${stats.count} entries)`
      )
      .join('\n');
    const recentFinances = activeFinances
      .slice(0, 12)
      .map(
        (f) =>
          `- ${f.entryDate} | ${f.kind} | ${f.group} | ${f.title}: $${f.amount.toFixed(2)}${
            f.vendor ? ` (${f.vendor})` : ''
          }${f.place ? ` @ ${f.place}` : ''}${f.careForJason ? " (for Jason's care)" : ''}`
      )
      .join('\n');
    const documentsSummary = documents
      .slice(0, 20)
      .map(
        (d) =>
          `- ${d.title} (${d.category}, date ${d.detectedDate || 'n/a'}, tags: ${
            d.tags.join(', ') || 'none'
          })${d.place ? ` @ ${d.place}` : ''}${d.summary ? ` — ${d.summary.slice(0, 120)}` : ''}`
      )
      .join('\n');
    return {
      userName,
      addressName,
      currentDateTime: new Date().toLocaleString(),
      driveConnected,
      aiAccess: aiAccess !== false,
      aiWrite: aiWrite === true,
      tasksSummary: `Pending (${pendingTasksCount}):\n${pending || 'None'}\n\nRecent Completed:\n${
        completed || 'None'
      }`,
      wimberleySummary: wimberleySummary || 'No Wimberley property entries logged yet.',
      financesSummary: `Group Totals:\n${groupLines || 'None'}\n\nRecent Transactions:\n${
        recentFinances || 'None'
      }`,
      documentsSummary: documentsSummary || 'No scanned documents in vault.',
    };
  }, [userName, addressName, driveConnected, aiAccess, aiWrite, tasks, pendingTasksCount, propertyEntries, financeEntries, documents]);

  function bumpActivity() {
    lastActivityRef.current = Date.now();
    if (windingRef.current) {
      windingRef.current = false;
      setWindingDown(false);
    }
  }

  function recordChannel(via: 'voice' | 'typed' | 'button') {
    if (recordedChannelsRef.current.has(via)) return;
    recordedChannelsRef.current.add(via);
    onRecordBehaviorSignal(`frontdoor:${via}`);
  }

  // -- Spoken output ---------------------------------------------------------
  function speak(text: string) {
    // The family build is text-only (Jason, 2026-11-23): the desk never
    // speaks. Answers land on the screen as text; this keeps the call
    // sites working and the listening cycle turning, silently.
    void text;
    maybeRestartListening();
  }

  // -- Speech recognition input (the desks' ear) ------------------------------
  function srSupported(): boolean {
    return (
      typeof window !== 'undefined' &&
      ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)
    );
  }

  function startListening() {
    if (phaseRef.current === 'snoozed') return;
    // Never listen while the desk itself is speaking — it would hear
    // itself. speak()'s onend calls maybeRestartListening, which lands
    // back here once the words are done.
    if (speakingRef.current) return;
    if (liveStatusRef.current === 'connected' || liveStatusRef.current === 'connecting') return;
    if (srBlockedRef.current || !srSupported()) {
      void startLiveSession();
      return;
    }
    if (recognitionRef.current) return;
    const Ctor = (window as unknown as Record<string, unknown>).SpeechRecognition ||
      (window as unknown as Record<string, unknown>).webkitSpeechRecognition;
    if (typeof Ctor !== 'function') {
      void startLiveSession();
      return;
    }
    const rec = new (Ctor as new () => {
      lang: string;
      continuous: boolean;
      interimResults: boolean;
      onresult: ((e: { results?: ArrayLike<ArrayLike<{ transcript?: string }>> }) => void) | null;
      onerror: ((e: { error?: string }) => void) | null;
      onend: (() => void) | null;
      start: () => void;
      stop: () => void;
    })();
    rec.lang = 'en-US';
    rec.continuous = false;
    rec.interimResults = false;
    rec.onresult = (e) => {
      const transcript = e.results?.[0]?.[0]?.transcript || '';
      if (transcript.trim()) {
        bumpActivity();
        void sendMessage(transcript, 'voice');
      }
    };
    rec.onerror = (e) => {
      if (e?.error === 'not-allowed' || e?.error === 'service-not-allowed') {
        srBlockedRef.current = true;
        recognitionRef.current = null;
        setListening(false);
        void startLiveSession();
      }
    };
    rec.onend = () => {
      recognitionRef.current = null;
      setListening(false);
      maybeRestartListening();
    };
    recognitionRef.current = rec;
    setListening(true);
    try {
      rec.start();
    } catch {
      recognitionRef.current = null;
      setListening(false);
    }
  }

  function stopListening() {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // already stopped
      }
      recognitionRef.current = null;
    }
    setListening(false);
  }

  function maybeRestartListening() {
    if (!wantListeningRef.current) return;
    if (phaseRef.current === 'snoozed') return;
    if (speakingRef.current || sendingRef.current) return;
    if (liveStatusRef.current === 'connected' || liveStatusRef.current === 'connecting') return;
    window.setTimeout(() => {
      if (
        wantListeningRef.current &&
        !recognitionRef.current &&
        !speakingRef.current &&
        !sendingRef.current &&
        phaseRef.current !== 'snoozed'
      ) {
        startListening();
      }
    }, 350);
  }

  // -- Live voice session (the fallback ear and voice) ------------------------
  function clearAudioQueue() {
    for (const src of activeSourcesRef.current) {
      try {
        src.stop();
      } catch {
        // ignore already stopped
      }
    }
    activeSourcesRef.current.clear();
    if (outputCtxRef.current) {
      nextStartTimeRef.current = outputCtxRef.current.currentTime;
    }
  }

  function playPcmChunk(base64Audio: string) {
    if (mutedRef.current) return; // muted: the words still arrive as text
    const ctx = outputCtxRef.current;
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      void ctx.resume();
    }
    const samples = base64PcmToFloat32(base64Audio);
    if (samples.length === 0) return;
    const buffer = ctx.createBuffer(1, samples.length, 24000);
    buffer.getChannelData(0).set(samples);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    const startTime = Math.max(ctx.currentTime, nextStartTimeRef.current);
    source.start(startTime);
    nextStartTimeRef.current = startTime + buffer.duration;
    activeSourcesRef.current.add(source);
    source.onended = () => {
      activeSourcesRef.current.delete(source);
    };
  }

  function appendLiveTurn(speaker: 'user' | 'assistant', text: string) {
    if (!text.trim()) return;
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (last && last.role === speaker && lastLiveSpeakerRef.current === speaker) {
        const updated = [...prev];
        updated[updated.length - 1] = {
          ...last,
          text: `${last.text}${last.text.endsWith(' ') || text.startsWith(' ') ? '' : ' '}${text}`,
        };
        return updated;
      }
      return [...prev, { id: `live_${Date.now()}_${Math.random()}`, role: speaker, text }];
    });
    lastLiveSpeakerRef.current = speaker;
  }

  async function handleLiveToolCall(call: {
    id: string;
    name: string;
    args: Record<string, unknown>;
  }) {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    let resultPayload: Record<string, unknown> = { ok: true };
    try {
      if (call.name === 'createScheduleTask') {
        const args = call.args as {
          title?: string;
          category?: string;
          type?: 'task' | 'appointment';
          dueDate?: string;
          dueTime?: string;
          priority?: 'low' | 'medium' | 'high';
          estimatedMinutes?: number;
          notes?: string;
        };
        const cat = CATEGORIES.includes(args.category as Category)
          ? (args.category as Category)
          : 'General';
        const dueDate =
          args.dueDate && /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(args.dueDate)
            ? args.dueDate
            : getLocalTodayIso();
        await onCreateTask({
          title: args.title || 'Voice Scheduled Task',
          type: args.type === 'appointment' ? 'appointment' : 'task',
          category: cat,
          dueDate,
          dueTime: args.dueTime || '',
          estimatedMinutes: Number(args.estimatedMinutes) || 30,
          reminderMinutes: 60,
          priority: args.priority || 'medium',
          notes: args.notes || 'Created during a front door voice conversation',
          helpSteps: [],
          place: '',
          linkedDocumentId: '',
        });
        resultPayload = { created: true, title: args.title, dueDate, category: cat };
      } else if (call.name === 'markTaskCompleted') {
        const matched = await onCompleteTaskByTitle(
          String(call.args?.taskTitle || ''),
          call.args?.completionState === 'more' ? 'more' : 'finished',
          String(call.args?.remainderNote || '')
        );
        resultPayload = matched
          ? { completed: true, matchedTitle: matched }
          : { completed: false, reason: 'No matching pending task found.' };
      } else if (call.name === 'searchDocumentVault') {
        const q = String(call.args?.query || '').toLowerCase();
        const matches = documentsRef.current
          .filter((d) =>
            `${d.title} ${d.category} ${d.summary} ${d.ocrText} ${d.tags.join(' ')}`
              .toLowerCase()
              .includes(q)
          )
          .slice(0, 4)
          .map((d) => ({
            title: d.title,
            category: d.category,
            detectedDate: d.detectedDate,
            summary: d.summary,
            keyDetails: d.keyDetails,
          }));
        resultPayload = { matches };
      } else if (call.name === 'saveFollowUpMemory') {
        await onSaveMemory({
          summary: String(call.args?.summary || 'Voice session follow-up'),
          completedTaskTitles: Array.isArray(call.args?.completedTaskTitles)
            ? (call.args.completedTaskTitles as string[])
            : [],
          followUpSteps: Array.isArray(call.args?.followUpSteps)
            ? (call.args.followUpSteps as string[])
            : [],
          transcriptExcerpt: '',
        });
        resultPayload = { saved: true };
      } else if (call.name === 'logFinanceEntry') {
        const args = call.args as {
          title?: string;
          amount?: number;
          group?: string;
          kind?: FinanceKind;
          vendor?: string;
          entryDate?: string;
          place?: string;
          taxDeductible?: boolean;
        };
        const amount = Number(args.amount) || 0;
        await onLogFinanceEntry({
          kind: args.kind === 'income' ? 'income' : 'expense',
          group: String(args.group || 'General').slice(0, 80),
          title: String(args.title || 'Voice Expense').slice(0, 200),
          amount: Math.max(0, Math.min(10000000, amount)),
          entryDate:
            args.entryDate && /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(args.entryDate)
              ? args.entryDate
              : getLocalTodayIso(),
          vendor: String(args.vendor || '').slice(0, 120),
          place: isPlaceName(args.place) ? args.place : '',
          careForJason: false,
          taxDeductible: Boolean(args.taxDeductible),
          notes: 'Logged during a front door voice conversation',
          linkedDocumentId: '',
        });
        resultPayload = { logged: true, title: args.title, amount };
      } else if (call.name === 'noteForJason') {
        const request = String(call.args?.request || '').slice(0, 2000);
        if (request) {
          await onCreateJasonNote(request, 'front_door');
          resultPayload = { noted: true };
        } else {
          resultPayload = { noted: false, reason: 'Empty request.' };
        }
      }
    } catch (err) {
      resultPayload = { error: err instanceof Error ? err.message : 'Tool execution error' };
    }
    ws.send(
      JSON.stringify({
        toolResponse: { id: call.id, name: call.name, response: resultPayload },
      })
    );
  }

  async function startLiveSession() {
    if (liveStatusRef.current === 'connected' || liveStatusRef.current === 'connecting') return;
    stopListening();
    setLiveStatus('connecting');
    setErrorMsg(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;
      const inputCtx = new AudioContext({ sampleRate: 16000 });
      const outputCtx = new AudioContext({ sampleRate: 24000 });
      inputCtxRef.current = inputCtx;
      outputCtxRef.current = outputCtx;
      nextStartTimeRef.current = outputCtx.currentTime;

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${window.location.host}/live`);
      wsRef.current = ws;

      ws.onopen = () => {
        const pendingSummary = tasksRef.current
          .filter((t) => t.status === 'pending')
          .slice(0, 20)
          .map((t) => `- ${t.title} (${t.category}, due ${t.dueDate}${t.dueTime ? ' ' + t.dueTime : ''}, ${t.priority})`)
          .join('\n');
        const completedSummary = tasksRef.current
          .filter((t) => t.status === 'completed')
          .slice(0, 15)
          .map(
            (t) =>
              `- ${t.title} (${t.category}, completed ${t.completedAtIso || t.dueDate}${
                t.completionState === 'more'
                  ? `, MORE TO DO${t.remainderNote ? `: ${t.remainderNote}` : ''}`
                  : t.completionState === 'finished'
                    ? ', finished'
                    : ''
              })`
          )
          .join('\n');
        const docsSummary = documentsRef.current
          .slice(0, 15)
          .map((d) => `- ${d.title} [${d.category}] tags: ${d.tags.join(', ')}`)
          .join('\n');
        const propertySummary = propertyEntriesRef.current
          .slice(0, 15)
          .map(
            (p) =>
              `- [${p.area}] ${p.title}: ${p.status} (${p.scheduledDate}${p.endDate ? ' to ' + p.endDate : ''}, ${p.cadence})`
          )
          .join('\n');
        const groupTotals = new Map<string, number>();
        for (const f of financeEntriesRef.current) {
          if (isArchivedFinanceEntry(f, getLocalTodayIso())) continue;
          if (f.kind === 'expense') {
            groupTotals.set(f.group, (groupTotals.get(f.group) || 0) + f.amount);
          }
        }
        const financeSummary = Array.from(groupTotals.entries())
          .map(([grp, tot]) => `- ${grp}: $${tot.toFixed(2)}`)
          .join('\n');
        ws.send(
          JSON.stringify({
            type: 'init',
            context: {
              userName,
              addressName,
              currentDateTime: new Date().toLocaleString(),
              pendingTasks: pendingSummary,
              completedTasks: completedSummary,
              recentMemories: '',
              documentsSummary: docsSummary,
              propertySummary,
              financeSummary,
            },
          })
        );
      };

      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data) as {
          type?: string;
          audio?: string;
          text?: string;
          error?: string;
          call?: { id: string; name: string; args: Record<string, unknown> };
        };
        if (msg.type === 'ready') {
          setLiveStatus('connected');
          setPhase('engaged');
          bumpActivity();
          const source = inputCtx.createMediaStreamSource(stream);
          const processor = inputCtx.createScriptProcessor(4096, 1, 1);
          processorRef.current = processor;
          source.connect(processor);
          processor.connect(inputCtx.destination);
          processor.onaudioprocess = (e) => {
            if (ws.readyState !== WebSocket.OPEN) return;
            const pcm = floatTo16BitPcmBase64(e.inputBuffer.getChannelData(0));
            ws.send(JSON.stringify({ audio: pcm }));
          };
        } else if (msg.type === 'audio' && msg.audio) {
          bumpActivity();
          playPcmChunk(msg.audio);
        } else if (msg.type === 'inputTranscript' && msg.text) {
          bumpActivity();
          appendLiveTurn('user', msg.text);
        } else if (msg.type === 'outputTranscript' && msg.text) {
          bumpActivity();
          appendLiveTurn('assistant', msg.text);
        } else if (msg.type === 'turnComplete') {
          lastLiveSpeakerRef.current = null;
        } else if (msg.type === 'interrupted') {
          clearAudioQueue();
        } else if (msg.type === 'toolCall' && msg.call) {
          void handleLiveToolCall(msg.call);
        } else if (msg.type === 'error') {
          setErrorMsg(msg.error || 'Voice connection error');
          setLiveStatus('error');
        } else if (msg.type === 'closed') {
          setLiveStatus('idle');
        }
      };
      ws.onerror = () => {
        setErrorMsg('The voice connection failed. You can still type below.');
        setLiveStatus('error');
      };
      ws.onclose = () => {
        setLiveStatus((prev) => (prev === 'error' ? 'error' : 'idle'));
      };
    } catch {
      setErrorMsg('The microphone is not available. You can still type below.');
      setLiveStatus('error');
    }
  }

  function disconnectLive() {
    clearAudioQueue();
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
    }
    if (inputCtxRef.current) {
      void inputCtxRef.current.close();
      inputCtxRef.current = null;
    }
    if (outputCtxRef.current) {
      void outputCtxRef.current.close();
      outputCtxRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setLiveStatus('idle');
  }

  function stopAllAudio() {
    wantListeningRef.current = false;
    stopListening();
    disconnectLive();
    if ('speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // nothing to cancel
      }
    }
    speakingRef.current = false;
  }

  // -- The desks' conversation --------------------------------------------------
  async function sendMessage(textToSend: string, via: 'voice' | 'typed' | 'button') {
    const trimmed = textToSend.trim();
    if (!trimmed || sendingRef.current) return;

    // Just looking is its own request. "Show me the calendar" steps the
    // door aside and puts the calendar in front of her, with the short
    // version read aloud — no desk round-trip, nothing to answer.
    if (
      /\b(show me|let me see|take me to|open|bring up)\b.*\b(calendar|schedule)\b/i.test(trimmed) ||
      /\b(see|look at)\b.*\b(calendar|schedule)\b/i.test(trimmed) ||
      /^(the\s+)?(calendar|schedule)\.?$/i.test(trimmed)
    ) {
      bumpActivity();
      recordChannel(via);
      stopListening();
      onShowCalendar(buildCalendarSummary(tasksRef.current, addressName));
      return;
    }

    bumpActivity();
    recordChannel(via);
    setPhase('engaged');
    const userMsg: ChatMessage = { id: `u_${Date.now()}`, role: 'user', text: trimmed };
    const nextHistory = [...messages, userMsg];
    setMessages(nextHistory);
    setInput('');
    setErrorMsg(null);
    setSending(true);
    sendingRef.current = true;
    stopListening();

    try {
      const res = await fetch('/api/assistant/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: nextHistory.map((m) => ({ role: m.role, text: m.text })),
          context: workspaceContext,
        }),
      });
      const json = (await res.json()) as {
        reply?: string;
        choices?: string[];
        suggestedActions?: SuggestedAction[];
        desk?: FrontDoorDeskId;
        error?: string;
      };
      if (!res.ok) {
        throw new Error(json.error || `Assistant returned HTTP ${res.status}`);
      }
      const actions = Array.isArray(json.suggestedActions) ? json.suggestedActions : [];
      const assistantMsg: ChatMessage = {
        id: `a_${Date.now()}`,
        role: 'assistant',
        text: json.reply || 'Done.',
        choices: Array.isArray(json.choices) ? json.choices : [],
        suggestedActions: actions,
      };
      setMessages((prev) => [...prev, assistantMsg]);

      // A note for Jason is filed the moment the desk says it has noted
      // the request — her word for it is the desk's word, no tap needed.
      // Showing the calendar is the same: she asked to look, so the
      // calendar comes forward on the desk's say-so, and the short
      // version App reads aloud replaces this reply's speech.
      let calendarShown = false;
      for (let i = 0; i < actions.length; i++) {
        if (actions[i].type === 'show_calendar') {
          calendarShown = true;
          setAppliedActions((prev) => ({ ...prev, [`${assistantMsg.id}_${i}`]: true }));
          onShowCalendar(buildCalendarSummary(tasksRef.current, addressName));
        }
        if (actions[i].type === 'note_for_jason') {
          try {
            const payload = JSON.parse(actions[i].payloadJson || '{}') as { request?: string };
            const requestText = String(payload.request || trimmed).slice(0, 2000);
            await onCreateJasonNote(requestText, 'front_door');
            setAppliedActions((prev) => ({ ...prev, [`${assistantMsg.id}_${i}`]: true }));
          } catch {
            // the desk already told her it was noted; a failed write is
            // surfaced in the error line below rather than silently
            setErrorMsg('That note for Jason could not be saved just now.');
          }
        }
      }

      if (json.desk) {
        setActiveDesk(json.desk);
        onDeskEngaged(json.desk);
      }
      bumpActivity();
      if (!calendarShown) speak(assistantMsg.text);
      setTimeout(() => scrollEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 40);
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'I could not reach the desk just now.'
      );
      maybeRestartListening();
    } finally {
      setSending(false);
      sendingRef.current = false;
    }
  }

  async function handleApplyAction(actionKey: string, action: SuggestedAction) {
    if (appliedActions[actionKey]) return;
    bumpActivity();
    recordChannel('button');
    setErrorMsg(null);
    try {
      const payload = JSON.parse(action.payloadJson || '{}') as Record<string, unknown>;

      if (action.type === 'create_task') {
        const rawCat = String(payload.category || 'General');
        const category: Category = (CATEGORIES as readonly string[]).includes(rawCat)
          ? (rawCat as Category)
          : 'General';
        const type: TaskType = payload.type === 'appointment' ? 'appointment' : 'task';
        const rawPriority = String(payload.priority || 'medium');
        const priority: TaskPriority =
          rawPriority === 'high' || rawPriority === 'low' ? rawPriority : 'medium';
        await onCreateTask({
          title: String(payload.title || action.label || 'Follow-up task').slice(0, 200),
          category,
          type,
          dueDate: safeIsoDate(payload.dueDate),
          dueTime: typeof payload.dueTime === 'string' ? payload.dueTime.slice(0, 10) : '',
          estimatedMinutes: Math.max(5, Math.min(1440, Number(payload.estimatedMinutes) || 30)),
          reminderMinutes: 60,
          priority,
          notes: typeof payload.notes === 'string' ? payload.notes.slice(0, 2000) : '',
          helpSteps: [],
          place: isPlaceName(payload.place) ? payload.place : '',
          linkedDocumentId: '',
        });
      } else if (action.type === 'log_expense') {
        const kind: FinanceKind = payload.kind === 'income' ? 'income' : 'expense';
        const place = isPlaceName(payload.place) ? payload.place : '';
        await onLogFinanceEntry({
          kind,
          group: String(payload.group || 'General').slice(0, 80),
          title: String(payload.title || action.label || 'Recorded entry').slice(0, 200),
          amount: Math.max(0, Math.min(10000000, Number(payload.amount) || 0)),
          entryDate: safeIsoDate(payload.entryDate),
          vendor: typeof payload.vendor === 'string' ? payload.vendor.slice(0, 120) : '',
          place,
          careForJason: Boolean(payload.careForJason),
          taxDeductible: Boolean(payload.taxDeductible),
          notes: typeof payload.notes === 'string' ? payload.notes.slice(0, 2000) : '',
          linkedDocumentId: '',
        });
      } else if (action.type === 'create_property_entry') {
        const rawArea = String(payload.area || 'cabin_maintenance');
        const area: PropertyEntryArea = (VALID_PROPERTY_AREAS as readonly string[]).includes(rawArea)
          ? (rawArea as PropertyEntryArea)
          : 'cabin_maintenance';
        const rawStatus = String(payload.status || 'upcoming');
        const status: PropertyEntryStatus = (
          VALID_PROPERTY_STATUSES as readonly string[]
        ).includes(rawStatus)
          ? (rawStatus as PropertyEntryStatus)
          : 'upcoming';
        const rawCadence = String(payload.cadence || 'once');
        const cadence: PropertyCadence = (VALID_PROPERTY_CADENCES as readonly string[]).includes(
          rawCadence
        )
          ? (rawCadence as PropertyCadence)
          : 'once';
        await onCreatePropertyEntry({
          area,
          title: String(payload.title || action.label || 'Wimberley inspection').slice(0, 200),
          status,
          scheduledDate: safeIsoDate(payload.scheduledDate),
          endDate: '',
          cadence,
          inspectorOrGuest:
            typeof payload.inspectorOrGuest === 'string'
              ? payload.inspectorOrGuest.slice(0, 120)
              : '',
          notes: typeof payload.notes === 'string' ? payload.notes.slice(0, 2000) : '',
          place: isPlaceName(payload.place)
            ? payload.place
            : area === 'conservancy'
              ? 'Riva Jade — Wildlife Conservancy'
              : 'Riva Jade — Rental Cabin',
          linkedDocumentId: '',
        });
      } else if (action.type === 'open_drive_backup') {
        onOpenDriveBackup();
      } else if (action.type === 'navigate') {
        const rawTab = String(payload.tab || 'schedule');
        if ((VALID_NAV_TABS as readonly string[]).includes(rawTab)) {
          onNavigate(rawTab as AssistantNavTarget);
        }
      } else if (action.type === 'capture_document') {
        const place = isPlaceName(payload.place) ? payload.place : '';
        speak(`Okay, ${displayName}, take a picture of it and I will handle that.`);
        onCaptureDocument(place);
      } else if (action.type === 'note_for_jason') {
        await onCreateJasonNote(String(payload.request || action.label).slice(0, 2000), 'front_door');
      } else if (action.type === 'complete_task') {
        const matched = await onCompleteTaskByTitle(
          String(payload.titleQuery || action.label),
          payload.completionState === 'more' ? 'more' : 'finished',
          typeof payload.remainderNote === 'string' ? payload.remainderNote.slice(0, 300) : ''
        );
        if (!matched) throw new Error('I could not find that open item to mark done.');
      } else if (action.type === 'show_calendar') {
        onShowCalendar(buildCalendarSummary(tasksRef.current, addressName));
      }

      setAppliedActions((prev) => ({ ...prev, [actionKey]: true }));
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'That did not go through just now.');
    }
  }

  function renderActionIcon(type: SuggestedAction['type']) {
    if (type === 'create_task') return <Plus className="w-6 h-6 shrink-0" />;
    if (type === 'log_expense') return <Wallet className="w-6 h-6 shrink-0" />;
    if (type === 'create_property_entry') return <Trees className="w-6 h-6 shrink-0" />;
    if (type === 'open_drive_backup') return <HardDrive className="w-6 h-6 shrink-0" />;
    if (type === 'capture_document') return <Camera className="w-6 h-6 shrink-0" />;
    if (type === 'complete_task') return <Check className="w-6 h-6 shrink-0" />;
    if (type === 'show_calendar') return <Calendar className="w-6 h-6 shrink-0" />;
    return <ArrowRight className="w-6 h-6 shrink-0" />;
  }

  // -- Rest, snooze, wake -------------------------------------------------------
  function enterSnooze() {
    windingRef.current = false;
    setWindingDown(false);
    stopListening();
    disconnectLive();
    wantListeningRef.current = false;
    // The goodnight is spoken as the desk snoozes — unless she has muted
    // the voice, in which case the snooze screen says it in text only.
    speak(GOODNIGHT_LINE);
    setPhase('snoozed');
  }

  function wake() {
    setPhase('door');
    wantListeningRef.current = true;
    bumpActivity();
    greetedRef.current = true;
    speak(`Hello, ${displayName}. What can I help you with?`);
    startListening();
  }

  function handleClose() {
    stopAllAudio();
    onClose();
  }

  // Idle watch: left alone, the desk asks once whether there is anything
  // else; left alone a while longer, it says its goodnight and snoozes.
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (phaseRef.current === 'snoozed') return;
      if (sendingRef.current || speakingRef.current) {
        lastActivityRef.current = Date.now();
        return;
      }
      const idleMs = Date.now() - lastActivityRef.current;
      if (!windingRef.current && idleMs > 90000) {
        windingRef.current = true;
        setWindingDown(true);
        speak(WIND_DOWN_LINE);
      } else if (windingRef.current && idleMs > 130000) {
        enterSnooze();
      }
    }, 4000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Listen on open: the door tries to start listening by itself; the
  // first touch anywhere is the fallback that starts it (and unlocks the
  // spoken greeting) on phones that demand a touch first.
  useEffect(() => {
    wantListeningRef.current = true;
    const t = window.setTimeout(() => startListening(), 600);
    return () => {
      window.clearTimeout(t);
      stopAllAudio();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleAnyTouch() {
    bumpActivity();
    if (!greetedRef.current) {
      greetedRef.current = true;
      if (messages.length === 0 && phaseRef.current === 'door') {
        speak(`Hello, ${displayName}. What can I help you with?`);
      }
    }
    if (
      wantListeningRef.current &&
      !recognitionRef.current &&
      liveStatusRef.current !== 'connected' &&
      liveStatusRef.current !== 'connecting' &&
      !speakingRef.current
    ) {
      startListening();
    }
  }

  // A spoken notice from the app (for example, the filing confirmation
  // after a picture she took has been read and saved).
  useEffect(() => {
    if (notice && notice.id !== lastNoticeIdRef.current) {
      lastNoticeIdRef.current = notice.id;
      setPhase('engaged');
      setMessages((prev) => [
        ...prev,
        { id: `notice_${notice.id}`, role: 'assistant', text: notice.text },
      ]);
      bumpActivity();
      speak(notice.text);
      setTimeout(() => scrollEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 40);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notice]);

  const voiceActive = liveStatus === 'connected';
  const voiceConnecting = liveStatus === 'connecting';
  const hearing = listening || voiceActive;

  // The morning briefing (Jason, 2026-11-20): one big button on the
  // door. The saved briefing shows and speaks at once; if today has
  // none yet, App prepares it (one paid-tier call for the household's
  // day) and then it shows and speaks.
  async function handleBriefingButton() {
    bumpActivity();
    setBriefingBusy(true);
    try {
      const sharedText = briefingText || (await onRequestBriefing());
      if (!sharedText) {
        setErrorMsg(
          "I couldn't get this morning's briefing ready just now. Please try again in a little while."
        );
        return;
      }
      // The personal mail add-on follows the shared briefing when the
      // reader's own email switch is on — it is theirs alone, and it
      // never becomes part of the household's briefing.
      const mailText = mailBriefingText || (await onRequestMailBriefing());
      // The circle add-on follows — drawn from the reader's own
      // family ring and circles, theirs alone, like the mail.
      const circleText = circleBriefingText || (await onRequestCircleBriefing());
      const push = (text: string) =>
        setMessages((prev) => [
          ...prev,
          {
            id: `a_${Date.now()}_${Math.random()}`,
            role: 'assistant' as const,
            text,
            choices: [],
            suggestedActions: [],
          },
        ]);
      push(sharedText);
      if (mailText) push(mailText);
      if (circleText) push(circleText);
      setPhase('engaged');
      speak([sharedText, mailText, circleText].filter(Boolean).join('\n\n'));
    } finally {
      setBriefingBusy(false);
    }
  }

  function handleTalkButton() {
    bumpActivity();
    if (voiceActive || voiceConnecting) {
      disconnectLive();
      wantListeningRef.current = true;
      maybeRestartListening();
      return;
    }
    if (listening) {
      stopListening();
      return;
    }
    wantListeningRef.current = true;
    startListening();
  }

  // -- Render -------------------------------------------------------------------
  if (phase === 'snoozed') {
    return (
      <div
        className="fixed inset-0 z-50 bg-slate-950 text-white flex flex-col items-center justify-center px-8 text-center space-y-6 cursor-pointer"
        onPointerDown={wake}
        role="button"
        aria-label="Wake GiniApp"
      >
        <Moon className="w-14 h-14 text-teal-300" />
        <p className="text-3xl font-semibold leading-snug">{GOODNIGHT_LINE}</p>
        <p className="text-xl text-slate-300">Touch anywhere to wake me.</p>
      </div>
    );
  }

  const lastAssistantId = [...messages].reverse().find((m) => m.role === 'assistant')?.id;

  const conversation = (
    <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
      {(pings || []).length > 0 && (
        <div className="space-y-2">
          {(pings || []).map((ping) => (
            <div
              key={ping.id}
              className="w-full px-5 py-4 rounded-2xl bg-teal-50 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-900 text-slate-900 dark:text-slate-100"
            >
              <p className="text-sm font-medium">
                {ping.fromName} reached out ({ping.familyName}):
              </p>
              <p className="text-base leading-relaxed mt-1">{ping.message}</p>
              {onMarkPingSeen && (
                <button
                  type="button"
                  onClick={() => onMarkPingSeen(ping)}
                  className="mt-2 min-h-[36px] px-3 text-xs bg-teal-700 hover:bg-teal-600 text-white rounded-md"
                >
                  Seen
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {messages.map((msg) => (
        <div
          key={msg.id}
          className={msg.role === 'user' ? 'flex justify-end' : 'flex flex-col items-start space-y-3'}
        >
          <div
            className={
              msg.role === 'user'
                ? 'max-w-[85%] px-5 py-3 rounded-2xl bg-teal-700 text-white text-lg leading-relaxed'
                : 'w-full px-5 py-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 text-lg leading-relaxed whitespace-pre-wrap'
            }
          >
            {msg.text}
          </div>

          {msg.role === 'assistant' && msg.id === lastAssistantId && (
            <>
              {msg.choices && msg.choices.length > 0 && (
                <div className="w-full grid grid-cols-1 gap-3">
                  {msg.choices.map((choice) => (
                    <button
                      key={choice}
                      type="button"
                      onClick={() => void sendMessage(choice, 'button')}
                      className="min-h-[64px] w-full px-5 py-3 text-xl font-semibold rounded-2xl bg-teal-700 hover:bg-teal-800 text-white transition-colors"
                    >
                      {choice}
                    </button>
                  ))}
                </div>
              )}

              {msg.suggestedActions && msg.suggestedActions.length > 0 && (
                <div className="w-full grid grid-cols-1 gap-3">
                  {msg.suggestedActions
                    .map((act, idx) => ({ act, idx }))
                    .filter(({ act }) => act.type !== 'note_for_jason')
                    .map(({ act, idx }) => {
                      const actionKey = `${msg.id}_${idx}`;
                      const done = Boolean(appliedActions[actionKey]);
                      return (
                        <button
                          key={actionKey}
                          type="button"
                          disabled={done}
                          onClick={() => void handleApplyAction(actionKey, act)}
                          className={`min-h-[64px] w-full inline-flex items-center justify-center gap-3 px-5 py-3 text-xl font-semibold rounded-2xl border transition-colors ${
                            done
                              ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
                              : 'bg-white dark:bg-slate-900 border-teal-700 dark:border-teal-500 text-teal-800 dark:text-teal-200 hover:bg-teal-50 dark:hover:bg-teal-950/40'
                          }`}
                        >
                          {done ? <Check className="w-6 h-6 shrink-0" /> : renderActionIcon(act.type)}
                          <span>{done ? `${act.label} — Done` : act.label}</span>
                        </button>
                      );
                    })}
                </div>
              )}
            </>
          )}
        </div>
      ))}

      {sending && (
        <div className="flex items-center gap-2 text-base text-slate-500 dark:text-slate-400">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span>One moment…</span>
        </div>
      )}
      <div ref={scrollEndRef} />
    </div>
  );

  const inputRow = (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void sendMessage(input, 'typed');
      }}
      className="flex items-center gap-2"
    >
      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="Type here…"
        className="flex-1 min-h-[56px] px-4 text-lg bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-2xl text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-teal-600"
      />
      <button
        type="submit"
        disabled={sending || !input.trim()}
        aria-label="Send"
        className="min-h-[56px] min-w-[56px] inline-flex items-center justify-center bg-teal-700 hover:bg-teal-800 text-white rounded-2xl transition-colors disabled:opacity-50"
      >
        <Send className="w-6 h-6" />
      </button>
    </form>
  );


  const closeButton = (
    <button
      type="button"
      onClick={handleClose}
      aria-label="Close GiniApp"
      className="min-h-[64px] inline-flex items-center justify-center gap-3 px-5 text-xl font-semibold rounded-2xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 transition-colors"
    >
      <X className="w-7 h-7" />
      <span>Close</span>
    </button>
  );

  // The door itself: one big simple screen, before she has engaged.
  if (phase === 'door' && messages.length === 0) {
    return (
      <div
        className="fixed inset-0 z-50 bg-white dark:bg-slate-950 flex flex-col"
        onPointerDown={handleAnyTouch}
      >
        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center space-y-7 overflow-y-auto py-8">
          <p className="text-2xl text-slate-500 dark:text-slate-400">Hello, {displayName}.</p>
          <h1 className="text-4xl sm:text-5xl font-bold text-slate-900 dark:text-slate-100 leading-tight">
            What can I help you with?
          </h1>
          <p className="text-xl text-slate-500 dark:text-slate-400 max-w-md leading-relaxed">
            {voiceConnecting
              ? 'Connecting the voice…'
              : hearing
                ? "I'm listening — just say what you'd like to do. You don't have to press anything."
                : 'Tap the big button and talk, or type below.'}
          </p>

          <button
            type="button"
            onClick={handleTalkButton}
            aria-label={hearing ? 'Stop listening' : 'Talk to GiniApp'}
            className={`w-36 h-36 rounded-full inline-flex items-center justify-center text-white transition-colors ${
              hearing
                ? 'bg-emerald-600 hover:bg-emerald-700 animate-pulse'
                : 'bg-teal-700 hover:bg-teal-800'
            }`}
          >
            {hearing ? <Mic className="w-16 h-16" /> : <MicOff className="w-16 h-16" />}
          </button>

          <button
            type="button"
            onClick={() => void handleBriefingButton()}
            disabled={briefingBusy}
            className="w-full max-w-md min-h-[64px] inline-flex items-center justify-center gap-3 rounded-2xl border-2 border-teal-700 dark:border-teal-500 text-teal-800 dark:text-teal-200 text-xl font-semibold px-5 disabled:opacity-60"
          >
            <Sunrise className="w-7 h-7 shrink-0" />
            <span>{briefingBusy ? 'Getting your briefing ready…' : "This morning's briefing"}</span>
          </button>

          {errorMsg && (
            <div className="max-w-md p-3 rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 text-base text-red-700 dark:text-red-300">
              {errorMsg}
            </div>
          )}

          <div className="w-full max-w-md">{inputRow}</div>
        </div>

        <div className="p-4 grid grid-cols-2 gap-3 max-w-xl w-full mx-auto">
          {closeButton}
        </div>
      </div>
    );
  }

  // Engaged: the conversation panel, with the answering desk's own screen
  // open behind it (the app switches the tab when a desk replies).
  return (
    <div
      className="fixed z-50 inset-x-0 bottom-0 top-[30%] lg:inset-y-0 lg:left-auto lg:right-0 lg:top-0 lg:w-[30rem] bg-white dark:bg-slate-900 border-t lg:border-t-0 lg:border-l border-slate-300 dark:border-slate-700 shadow-2xl flex flex-col"
      onPointerDown={handleAnyTouch}
    >
      <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          {hearing && <span className="h-3 w-3 rounded-full bg-emerald-500 animate-pulse shrink-0" />}
          <p className="text-lg font-semibold text-slate-900 dark:text-slate-100 truncate">
            {DESK_LABELS[activeDesk]}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close GiniApp"
            className="min-h-[48px] inline-flex items-center gap-2 px-4 rounded-xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-base font-semibold"
          >
            <X className="w-5 h-5" />
            <span>Close</span>
          </button>
        </div>
      </div>

      {conversation}

      {windingDown && (
        <div className="mx-5 mb-3 p-4 rounded-2xl bg-teal-50 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-800 text-lg text-slate-900 dark:text-slate-100">
          {WIND_DOWN_LINE}
        </div>
      )}

      <div className="p-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
        {errorMsg && (
          <div className="p-3 rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 text-base text-red-700 dark:text-red-300">
            {errorMsg}
          </div>
        )}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleTalkButton}
            aria-label={hearing ? 'Stop listening' : 'Talk'}
            className={`min-h-[56px] min-w-[56px] inline-flex items-center justify-center rounded-2xl text-white transition-colors ${
              hearing ? 'bg-emerald-600 hover:bg-emerald-700 animate-pulse' : 'bg-teal-700 hover:bg-teal-800'
            }`}
          >
            {hearing ? <Mic className="w-6 h-6" /> : <MicOff className="w-6 h-6" />}
          </button>
          <div className="flex-1">{inputRow}</div>
        </div>
      </div>
    </div>
  );
};

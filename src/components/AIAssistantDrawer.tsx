import React, { useMemo, useRef, useState } from 'react';
import {
  Sparkles,
  X,
  Send,
  Trash2,
  Check,
  Plus,
  Wallet,
  Trees,
  HardDrive,
  ArrowRight,
  Loader2,
} from 'lucide-react';
import {
  CATEGORIES,
  Category,
  FinanceEntry,
  FinanceKind,
  FinancePropertyScope,
  PropertyCadence,
  PropertyEntry,
  PropertyEntryArea,
  PropertyEntryStatus,
  ScannedDocument,
  ScheduleTask,
  TaskPriority,
  TaskType,
  getLocalTodayIso,
} from '../types';

export type AssistantNavTarget =
  | 'schedule'
  | 'property'
  | 'finances'
  | 'vault'
  | 'projects'
  | 'voice'
  | 'analytics';

interface SuggestedAction {
  type:
    | 'create_task'
    | 'log_expense'
    | 'create_property_entry'
    | 'open_drive_backup'
    | 'navigate';
  label: string;
  payloadJson: string;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  suggestedActions?: SuggestedAction[];
}

interface AIAssistantDrawerProps {
  open: boolean;
  onClose: () => void;
  userName: string;
  tasks: ScheduleTask[];
  propertyEntries: PropertyEntry[];
  financeEntries: FinanceEntry[];
  documents: ScannedDocument[];
  driveConnected: boolean;
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
}

const STARTER_PROMPTS = [
  'Summarize my week and upcoming reminders',
  'Check Wimberley cabin and conservancy priorities',
  'Break down Medical and property spending totals',
  'Help me back up my workspace to Google Drive',
];

const VALID_NAV_TABS: readonly AssistantNavTarget[] = [
  'schedule',
  'property',
  'finances',
  'vault',
  'projects',
  'voice',
  'analytics',
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

const VALID_FINANCE_SCOPES: readonly FinancePropertyScope[] = [
  'general',
  'home',
  'wimberley_conservancy',
  'wimberley_cabin',
];

function safeIsoDate(raw: unknown): string {
  if (typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.trim())) {
    return raw.trim();
  }
  return getLocalTodayIso();
}

export const AIAssistantDrawer: React.FC<AIAssistantDrawerProps> = ({
  open,
  onClose,
  userName,
  tasks,
  propertyEntries,
  financeEntries,
  documents,
  driveConnected,
  onCreateTask,
  onLogFinanceEntry,
  onCreatePropertyEntry,
  onOpenDriveBackup,
  onNavigate,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [appliedActions, setAppliedActions] = useState<Record<string, boolean>>({});
  const scrollEndRef = useRef<HTMLDivElement | null>(null);

  const pendingTasksCount = useMemo(
    () => tasks.filter((t) => t.status === 'pending').length,
    [tasks]
  );

  const workspaceContext = useMemo(() => {
    const pending = tasks
      .filter((t) => t.status === 'pending')
      .slice(0, 25)
      .map(
        (t) =>
          `- [${t.priority.toUpperCase()}] ${t.title} (${t.category}, due ${t.dueDate}${
            t.dueTime ? ` ${t.dueTime}` : ''
          }, ${t.estimatedMinutes}m)`
      )
      .join('\n');

    const completed = tasks
      .filter((t) => t.status === 'completed')
      .slice(0, 12)
      .map((t) => `- ${t.title} (${t.category}, completed ${t.completedAtIso.slice(0, 10)})`)
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
    for (const f of financeEntries) {
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

    const recentFinances = financeEntries
      .slice(0, 12)
      .map(
        (f) =>
          `- ${f.entryDate} | ${f.kind} | ${f.group} | ${f.title}: $${f.amount.toFixed(2)}${
            f.vendor ? ` (${f.vendor})` : ''
          }`
      )
      .join('\n');

    const documentsSummary = documents
      .slice(0, 20)
      .map(
        (d) =>
          `- ${d.title} (${d.category}, date ${d.detectedDate || 'n/a'}, tags: ${
            d.tags.join(', ') || 'none'
          })${d.summary ? ` — ${d.summary.slice(0, 120)}` : ''}`
      )
      .join('\n');

    return {
      userName,
      currentDateTime: new Date().toLocaleString(),
      driveConnected,
      tasksSummary: `Pending (${pendingTasksCount}):\n${pending || 'None'}\n\nRecent Completed:\n${
        completed || 'None'
      }`,
      wimberleySummary: wimberleySummary || 'No Wimberley property entries logged yet.',
      financesSummary: `Group Totals:\n${groupLines || 'None'}\n\nRecent Transactions:\n${
        recentFinances || 'None'
      }`,
      documentsSummary: documentsSummary || 'No scanned documents in vault.',
    };
  }, [userName, driveConnected, tasks, pendingTasksCount, propertyEntries, financeEntries, documents]);

  if (!open) return null;

  async function sendMessage(textToSend: string) {
    const trimmed = textToSend.trim();
    if (!trimmed || sending) return;

    const userMsg: ChatMessage = {
      id: `u_${Date.now()}`,
      role: 'user',
      text: trimmed,
    };
    const nextHistory = [...messages, userMsg];
    setMessages(nextHistory);
    setInput('');
    setErrorMsg(null);
    setSending(true);

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
        suggestedActions?: SuggestedAction[];
        error?: string;
      };
      if (!res.ok) {
        throw new Error(json.error || `Assistant returned HTTP ${res.status}`);
      }

      const assistantMsg: ChatMessage = {
        id: `a_${Date.now()}`,
        role: 'assistant',
        text: json.reply || 'Done.',
        suggestedActions: Array.isArray(json.suggestedActions) ? json.suggestedActions : [],
      };
      setMessages((prev) => [...prev, assistantMsg]);
      setTimeout(() => scrollEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 40);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to reach Steward AI Assistant.');
    } finally {
      setSending(false);
    }
  }

  async function handleApplyAction(actionKey: string, action: SuggestedAction) {
    if (appliedActions[actionKey]) return;
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
          linkedDocumentId: '',
        });
      } else if (action.type === 'log_expense') {
        const kind: FinanceKind = payload.kind === 'income' ? 'income' : 'expense';
        const rawScope = String(payload.propertyScope || 'general');
        const propertyScope: FinancePropertyScope = (
          VALID_FINANCE_SCOPES as readonly string[]
        ).includes(rawScope)
          ? (rawScope as FinancePropertyScope)
          : 'general';

        await onLogFinanceEntry({
          kind,
          group: String(payload.group || 'General').slice(0, 80),
          title: String(payload.title || action.label || 'Recorded entry').slice(0, 200),
          amount: Math.max(0, Math.min(10000000, Number(payload.amount) || 0)),
          entryDate: safeIsoDate(payload.entryDate),
          vendor: typeof payload.vendor === 'string' ? payload.vendor.slice(0, 120) : '',
          propertyScope,
          taxDeductible: Boolean(payload.taxDeductible),
          notes: typeof payload.notes === 'string' ? payload.notes.slice(0, 2000) : '',
          linkedDocumentId: '',
        });
      } else if (action.type === 'create_property_entry') {
        const rawArea = String(payload.area || 'cabin_maintenance');
        const area: PropertyEntryArea = (VALID_PROPERTY_AREAS as readonly string[]).includes(
          rawArea
        )
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
          linkedDocumentId: '',
        });
      } else if (action.type === 'open_drive_backup') {
        onClose();
        onOpenDriveBackup();
      } else if (action.type === 'navigate') {
        const rawTab = String(payload.tab || 'schedule');
        if ((VALID_NAV_TABS as readonly string[]).includes(rawTab)) {
          onNavigate(rawTab as AssistantNavTarget);
          onClose();
        }
      }

      setAppliedActions((prev) => ({ ...prev, [actionKey]: true }));
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Unable to apply that suggested workspace action.'
      );
    }
  }

  function renderActionIcon(type: SuggestedAction['type']) {
    if (type === 'create_task') return <Plus className="w-3.5 h-3.5 shrink-0" />;
    if (type === 'log_expense') return <Wallet className="w-3.5 h-3.5 shrink-0" />;
    if (type === 'create_property_entry') return <Trees className="w-3.5 h-3.5 shrink-0" />;
    if (type === 'open_drive_backup') return <HardDrive className="w-3.5 h-3.5 shrink-0" />;
    return <ArrowRight className="w-3.5 h-3.5 shrink-0" />;
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/50 backdrop-blur-sm">
      <div
        role="dialog"
        aria-label="Steward AI Assistant"
        className="w-full max-w-lg h-full bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 flex flex-col shadow-2xl"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5 min-w-0">
            <Sparkles className="w-5 h-5 text-teal-700 dark:text-teal-400 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 font-display">
                Steward AI Assistant
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {pendingTasksCount} pending tasks · {propertyEntries.length} Wimberley logs ·{' '}
                {financeEntries.length} financial items · {driveConnected ? 'Drive connected' : 'Drive ready'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {messages.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setMessages([]);
                  setAppliedActions({});
                  setErrorMsg(null);
                }}
                title="Clear conversation"
                aria-label="Clear conversation"
                className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close AI Assistant"
              className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Conversation Body */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
          {messages.length === 0 ? (
            <div className="space-y-5">
              <div className="space-y-2">
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                  Ask anything across your Steward workspace
                </p>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  I have live context from your schedule, Wimberley conservancy &amp; rental cabin
                  monitor, grouped finances, OCR document vault, and Google Drive backup status. I
                  can also create tasks, log expenses, or add property entries in one click.
                </p>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  Suggested questions
                </p>
                <div className="grid grid-cols-1 gap-2">
                  {STARTER_PROMPTS.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => void sendMessage(prompt)}
                      className="min-h-[44px] w-full text-left px-3.5 py-2.5 text-xs font-medium text-slate-800 dark:text-slate-200 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 hover:border-teal-600 dark:hover:border-teal-500 rounded-xl transition-colors"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={
                    msg.role === 'user'
                      ? 'flex justify-end'
                      : 'flex flex-col items-start space-y-2.5'
                  }
                >
                  <div
                    className={
                      msg.role === 'user'
                        ? 'max-w-[85%] px-4 py-2.5 rounded-2xl bg-teal-700 text-white text-sm leading-relaxed'
                        : 'w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 text-sm leading-relaxed whitespace-pre-wrap'
                    }
                  >
                    {msg.text}
                  </div>

                  {msg.role === 'assistant' &&
                    msg.suggestedActions &&
                    msg.suggestedActions.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {msg.suggestedActions.map((act, idx) => {
                          const actionKey = `${msg.id}_${idx}`;
                          const done = Boolean(appliedActions[actionKey]);
                          return (
                            <button
                              key={actionKey}
                              type="button"
                              disabled={done}
                              onClick={() => void handleApplyAction(actionKey, act)}
                              className={`min-h-[40px] inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
                                done
                                  ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900 text-emerald-700 dark:text-emerald-300'
                                  : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-teal-700 dark:text-teal-300 hover:bg-teal-50 dark:hover:bg-teal-950/40'
                              }`}
                            >
                              {done ? (
                                <Check className="w-3.5 h-3.5 shrink-0" />
                              ) : (
                                renderActionIcon(act.type)
                              )}
                              <span>{done ? `${act.label} — Applied` : act.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                </div>
              ))}

              {sending && (
                <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Thinking with your workspace data...</span>
                </div>
              )}
              <div ref={scrollEndRef} />
            </div>
          )}
        </div>

        {/* Error & Input Footer */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 space-y-2.5 bg-white dark:bg-slate-900">
          {errorMsg && (
            <div className="p-2.5 rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 text-xs text-red-700 dark:text-red-300">
              {errorMsg}
            </div>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void sendMessage(input);
            }}
            className="flex items-center gap-2"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about tasks, Wimberley cabin, expenses, OCR, or backups..."
              disabled={sending}
              className="flex-1 min-h-[44px] px-3.5 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-teal-600"
            />
            <button
              type="submit"
              disabled={sending || !input.trim()}
              aria-label="Send message"
              className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center px-3.5 bg-teal-700 hover:bg-teal-800 text-white rounded-xl transition-colors disabled:opacity-50"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

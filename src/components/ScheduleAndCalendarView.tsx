import React, { useMemo, useState } from 'react';
import {
  Calendar as CalendarIcon,
  CheckCircle2,
  Circle,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Clock,
  Bell,
  HelpCircle,
  Plus,
  Trash2,
  Sparkles,
  ArrowUp,
  ArrowDown,
  FileText,
  Edit3,
  X,
  Loader2,
  Download,
} from 'lucide-react';
import {
  AIPriorityPlan,
  CATEGORIES,
  PLACES,
  Category,
  FocusWindow,
  ProjectTask,
  REMINDER_OPTIONS,
  ScannedDocument,
  ScheduleTask,
  TaskPriority,
  TaskType,
  UserProfile,
  formatReminderLabel,
  getLocalTodayIso,
} from '../types';
import { downloadIcsCalendar } from '../services/calendarExport';

interface ScheduleAndCalendarViewProps {
  userProfile: UserProfile | null;
  tasks: ScheduleTask[];
  allTasks: ScheduleTask[];
  sharedTasks: Array<ProjectTask & { projectName: string }>;
  documents: ScannedDocument[];
  onCreateTask: (payload: Omit<ScheduleTask, 'id' | 'userId' | 'createdAt' | 'updatedAt' | 'completedAtIso' | 'status' | 'householdId' | 'memberIds'>) => Promise<void>;
  onUpdateTask: (taskId: string, updates: Partial<ScheduleTask>) => Promise<void>;
  onToggleTaskComplete: (task: ScheduleTask) => Promise<void>;
  onCompleteTask: (
    task: ScheduleTask,
    completionState: 'finished' | 'more',
    remainderNote: string
  ) => Promise<void>;
  onDeleteTask: (taskId: string) => Promise<void>;
  onRecordBehaviorSignal: (signal: string) => Promise<void>;
  onUpdateFocusPrefs: (preferredFocusWindow: FocusWindow, prefersQuickWinsFirst: boolean) => Promise<void>;
  composerTriggerCount: number;
  visibilityOptions: Array<{ value: string; label: string }>;
}

export const ScheduleAndCalendarView: React.FC<ScheduleAndCalendarViewProps> = ({
  userProfile,
  tasks,
  allTasks,
  sharedTasks,
  documents,
  onCreateTask,
  onUpdateTask,
  onToggleTaskComplete,
  onCompleteTask,
  onDeleteTask,
  onRecordBehaviorSignal,
  onUpdateFocusPrefs,
  composerTriggerCount,
  visibilityOptions,
}) => {
  const todayIso = getLocalTodayIso();
  const [subMode, setSubMode] = useState<'calendar' | 'priority'>('calendar');
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedDate, setSelectedDate] = useState<string>(todayIso);
  const [showAllDates, setShowAllDates] = useState<boolean>(true);
  const [categoryFilter, setCategoryFilter] = useState<string>('All');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'completed'>('pending');
  const [searchQuery, setSearchQuery] = useState('');

  // Composer Modal state
  const [composerOpen, setComposerOpen] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [formTitle, setFormTitle] = useState('');
  const [formType, setFormType] = useState<TaskType>('task');
  const [formCategory, setFormCategory] = useState<Category>('Household');
  const [formPlace, setFormPlace] = useState('');
  const [formVisibility, setFormVisibility] = useState('household');
  const [formDueDate, setFormDueDate] = useState(todayIso);
  const [formDueTime, setFormDueTime] = useState('');
  const [formEstimatedMinutes, setFormEstimatedMinutes] = useState(30);
  const [formReminderMinutes, setFormReminderMinutes] = useState(
    userProfile?.defaultReminderMinutes ?? 60
  );
  const [formPriority, setFormPriority] = useState<TaskPriority>('medium');
  const [formLinkedDocId, setFormLinkedDocId] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [savingTask, setSavingTask] = useState(false);

  // AI Help & Prioritization states
  const [loadingHelpId, setLoadingHelpId] = useState<string | null>(null);
  const [expandedHelpIds, setExpandedHelpIds] = useState<Record<string, boolean>>({});
  const [priorityPlan, setPriorityPlan] = useState<AIPriorityPlan | null>(null);
  const [loadingPriority, setLoadingPriority] = useState(false);
  const [priorityError, setPriorityError] = useState<string | null>(null);

  React.useEffect(() => {
    if (composerTriggerCount > 0) {
      openNewComposer(selectedDate);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [composerTriggerCount]);

  function openNewComposer(defaultDate = todayIso) {
    setEditingTaskId(null);
    setFormTitle('');
    setFormType('task');
    setFormCategory('Household');
    setFormPlace('');
    setFormVisibility('household');
    setFormDueDate(defaultDate);
    setFormDueTime('');
    setFormEstimatedMinutes(30);
    setFormReminderMinutes(userProfile?.defaultReminderMinutes ?? 60);
    setFormPriority('medium');
    setFormLinkedDocId('');
    setFormNotes('');
    setComposerOpen(true);
  }

  function openEditComposer(task: ScheduleTask) {
    setEditingTaskId(task.id);
    setFormTitle(task.title);
    setFormType(task.type);
    setFormCategory(task.category);
    setFormPlace(task.place || '');
    setFormDueDate(task.dueDate);
    setFormDueTime(task.dueTime);
    setFormEstimatedMinutes(task.estimatedMinutes);
    setFormReminderMinutes(task.reminderMinutes);
    setFormPriority(task.priority);
    setFormLinkedDocId(task.linkedDocumentId || '');
    setFormNotes(task.notes);
    setComposerOpen(true);
  }

  async function handleSaveComposer(e: React.FormEvent) {
    e.preventDefault();
    if (!formTitle.trim()) return;
    setSavingTask(true);
    try {
      if (editingTaskId) {
        await onUpdateTask(editingTaskId, {
          title: formTitle.trim(),
          type: formType,
          category: formCategory,
          place: formPlace,
          dueDate: formDueDate,
          dueTime: formDueTime,
          estimatedMinutes: Number(formEstimatedMinutes) || 30,
          reminderMinutes: Number(formReminderMinutes),
          priority: formPriority,
          linkedDocumentId: formLinkedDocId,
          notes: formNotes.trim(),
        });
      } else {
        await onCreateTask({
          title: formTitle.trim(),
          type: formType,
          category: formCategory,
          place: formPlace,
          ...(formVisibility === 'private'
            ? { scope: 'private' as const, familyId: '', circleIds: [] as string[] }
            : formVisibility.startsWith('family:')
              ? {
                  scope: 'family' as const,
                  familyId: formVisibility.slice('family:'.length),
                  circleIds: [] as string[],
                }
              : formVisibility.startsWith('circle:')
                ? {
                    scope: 'circles' as const,
                    familyId: '',
                    circleIds: [formVisibility.slice('circle:'.length)],
                  }
                : {}),
          dueDate: formDueDate,
          dueTime: formDueTime,
          estimatedMinutes: Number(formEstimatedMinutes) || 30,
          reminderMinutes: Number(formReminderMinutes),
          priority: formPriority,
          linkedDocumentId: formLinkedDocId,
          notes: formNotes.trim(),
          helpSteps: [],
        });
      }
      setComposerOpen(false);
    } finally {
      setSavingTask(false);
    }
  }

  async function handleFetchHelpSteps(task: ScheduleTask) {
    setLoadingHelpId(task.id);
    try {
      const linkedDoc = documents.find((d) => d.id === task.linkedDocumentId);
      const res = await fetch('/api/tasks/suggest-help', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: task.title,
          category: task.category,
          type: task.type,
          dueDate: task.dueDate,
          notes: task.notes,
          linkedDocumentSummary: linkedDoc?.summary || '',
          linkedDocumentOcr: linkedDoc?.ocrText || '',
        }),
      });
      if (!res.ok) throw new Error('Could not generate help steps.');
      const data = (await res.json()) as { steps: string[]; estimatedMinutes?: number };
      if (Array.isArray(data.steps) && data.steps.length > 0) {
        await onUpdateTask(task.id, {
          helpSteps: data.steps,
          estimatedMinutes: data.estimatedMinutes || task.estimatedMinutes,
        });
        setExpandedHelpIds((prev) => ({ ...prev, [task.id]: true }));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingHelpId(null);
    }
  }

  async function handleGeneratePriorityPlan() {
    const pendingPersonal = tasks
      .filter((t) => t.status === 'pending')
      .map((t) => ({
        id: t.id,
        title: t.title,
        category: t.category,
        dueDate: t.dueDate,
        dueTime: t.dueTime,
        priority: t.priority,
        estimatedMinutes: t.estimatedMinutes || 30,
        source: 'personal' as const,
        notes: t.notes,
      }));

    const pendingShared = sharedTasks
      .filter((t) => t.status === 'pending')
      .map((t) => ({
        id: `shared:${t.id}`,
        title: `${t.title} (${t.projectName})`,
        category: 'General',
        dueDate: t.dueDate,
        dueTime: '',
        priority: t.priority,
        estimatedMinutes: t.estimatedMinutes || 30,
        source: 'shared' as const,
        projectName: t.projectName,
        notes: t.notes,
      }));

    const allPending = [...pendingPersonal, ...pendingShared];
    if (allPending.length === 0) {
      setPriorityError('Add at least one pending task to generate a daily priority plan.');
      return;
    }

    setLoadingPriority(true);
    setPriorityError(null);
    try {
      const res = await fetch('/api/tasks/prioritize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentDateTime: new Date().toLocaleString(),
          tasks: allPending,
          preferredFocusWindow: userProfile?.preferredFocusWindow || 'balanced',
          prefersQuickWinsFirst: userProfile?.prefersQuickWinsFirst || false,
          behaviorSignals: userProfile?.behaviorSignals || [],
        }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Prioritization request failed.');
      }
      const data = await res.json();
      setPriorityPlan({
        ...data,
        generatedAtIso: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      });
    } catch (err) {
      setPriorityError(err instanceof Error ? err.message : 'Unable to prioritize tasks.');
    } finally {
      setLoadingPriority(false);
    }
  }

  async function handleBoostOrDefer(taskId: string, action: 'boost' | 'defer') {
    if (!priorityPlan) return;
    const idx = priorityPlan.rankedTasks.findIndex((r) => r.taskId === taskId);
    if (idx === -1) return;

    const taskTitle =
      tasks.find((t) => t.id === taskId)?.title ||
      sharedTasks.find((s) => `shared:${s.id}` === taskId)?.title ||
      'Task';
    const taskCat = tasks.find((t) => t.id === taskId)?.category || 'General';
    const est = tasks.find((t) => t.id === taskId)?.estimatedMinutes || 30;

    const updated = [...priorityPlan.rankedTasks];
    const [item] = updated.splice(idx, 1);
    if (action === 'boost') {
      updated.unshift(item);
    } else {
      updated.push(item);
    }
    const reindexed = updated.map((r, i) => ({ ...r, rank: i + 1 }));
    setPriorityPlan({ ...priorityPlan, rankedTasks: reindexed });

    const signal =
      action === 'boost'
        ? `User manually boosted "${taskTitle}" (${taskCat}, ${est}m) to top priority on ${todayIso}.`
        : `User deferred "${taskTitle}" (${taskCat}, ${est}m) lower in daily queue on ${todayIso}.`;
    await onRecordBehaviorSignal(signal);
  }

  // Calendar Grid Calculations
  const calendarDays = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDayWeekday = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const cells: Array<{ dateIso: string | null; dayNum: number | null }> = [];
    for (let i = 0; i < firstDayWeekday; i++) {
      cells.push({ dateIso: null, dayNum: null });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const mStr = String(month + 1).padStart(2, '0');
      const dStr = String(d).padStart(2, '0');
      cells.push({ dateIso: `${year}-${mStr}-${dStr}`, dayNum: d });
    }
    return cells;
  }, [currentMonth]);

  const tasksByDate = useMemo(() => {
    const map = new Map<string, ScheduleTask[]>();
    for (const t of tasks) {
      const list = map.get(t.dueDate) || [];
      list.push(t);
      map.set(t.dueDate, list);
    }
    return map;
  }, [tasks]);

  const filteredTasks = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return tasks
      .filter((t) => {
        if (!showAllDates && t.dueDate !== selectedDate) return false;
        if (categoryFilter !== 'All' && t.category !== categoryFilter) return false;
        if (statusFilter !== 'all' && t.status !== statusFilter) return false;
        if (q) {
          const hay = `${t.title} ${t.category} ${t.notes}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (a.status !== b.status) return a.status === 'pending' ? -1 : 1;
        return a.dueDate.localeCompare(b.dueDate) || (a.dueTime || '99:99').localeCompare(b.dueTime || '99:99');
      });
  }, [tasks, showAllDates, selectedDate, categoryFilter, statusFilter, searchQuery]);

  const monthLabel = currentMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  // -- The one ticker (FleetSheet law, carried over): this page only, --
  // -- pulling every pool at once — overdue, today, tomorrow, next up. --
  const [tickerOpen, setTickerOpen] = useState<boolean>(() => {
    try {
      return localStorage.getItem('steward-ticker-open') !== 'closed';
    } catch {
      return true;
    }
  });
  const [tickerExpanded, setTickerExpanded] = useState(false);
  const toggleTicker = () => {
    setTickerOpen((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('steward-ticker-open', next ? 'open' : 'closed');
      } catch {
        // storage unavailable (private mode) — the state still toggles
      }
      return next;
    });
  };
  const tickerItems = useMemo(() => {
    const fmtDay = (iso: string) =>
      new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, {
        weekday: 'short',
        month: 'short',
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
    const tomorrowDate = new Date(`${todayIso}T12:00:00`);
    tomorrowDate.setDate(tomorrowDate.getDate() + 1);
    const tomorrowIso = `${tomorrowDate.getFullYear()}-${String(tomorrowDate.getMonth() + 1).padStart(2, '0')}-${String(tomorrowDate.getDate()).padStart(2, '0')}`;
    const pending = allTasks.filter((t) => t.status === 'pending');
    const items: Array<{ key: string; label: string; title: string; overdue: boolean }> = [];
    for (const t of pending.filter((t) => t.dueDate < todayIso).sort(byWhen)) {
      items.push({ key: t.id, label: `Overdue · was due ${fmtDay(t.dueDate)}`, title: t.title, overdue: true });
    }
    for (const t of pending.filter((t) => t.dueDate === todayIso).sort(byWhen)) {
      items.push({ key: t.id, label: t.dueTime ? `Today · ${fmtTime(t.dueTime)}` : 'Today', title: t.title, overdue: false });
    }
    for (const t of pending.filter((t) => t.dueDate === tomorrowIso).sort(byWhen)) {
      items.push({ key: t.id, label: 'Tomorrow', title: t.title, overdue: false });
    }
    for (const t of pending.filter((t) => t.dueDate > tomorrowIso).sort(byWhen).slice(0, 3)) {
      items.push({ key: t.id, label: fmtDay(t.dueDate), title: t.title, overdue: false });
    }
    return items;
  }, [allTasks, todayIso]);

  // -- Completing a task asks one question first: finished, or more? --
  const [completingTaskId, setCompletingTaskId] = useState<string | null>(null);
  const [moreMode, setMoreMode] = useState(false);
  const [moreNote, setMoreNote] = useState('');

  return (
    <div className="space-y-6">
      {/* Sub-view Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Schedule & Calendar
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Organize tax deadlines, appointments, household maintenance, church, and community events with guided help steps.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => downloadIcsCalendar(tasks, 'Steward Household Calendar')}
            title="Download a calendar file (.ics) of open tasks and appointments — import it into Apple Calendar, Google Calendar, or Outlook"
            className="min-h-[40px] inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <Download className="w-4 h-4" />
            <span>Calendar File</span>
          </button>
          <div className="inline-flex p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
            <button
              type="button"
              onClick={() => setSubMode('calendar')}
              className={`min-h-[40px] px-3 py-1.5 text-sm font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                subMode === 'calendar'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              Calendar & Tasks
            </button>
            <button
              type="button"
              onClick={() => setSubMode('priority')}
              className={`min-h-[40px] inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                subMode === 'priority'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              <Sparkles className="w-4 h-4 text-teal-700 dark:text-teal-400" />
              <span>AI Priority Plan</span>
            </button>
          </div>
        </div>
      </div>

      {/* The one ticker — this page only */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <button
          type="button"
          onClick={toggleTicker}
          aria-expanded={tickerOpen}
          className="w-full min-h-[52px] flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
        >
          <span className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Coming up{tickerItems.length > 0 ? ` (${tickerItems.length})` : ''}
          </span>
          {tickerOpen ? (
            <ChevronUp className="w-5 h-5 text-slate-500 shrink-0" />
          ) : (
            <ChevronDown className="w-5 h-5 text-slate-500 shrink-0" />
          )}
        </button>
        {tickerOpen && (
          <div className="border-t border-slate-200 dark:border-slate-800 px-4 py-3 space-y-2">
            {tickerItems.length === 0 ? (
              <p className="text-base text-slate-600 dark:text-slate-300">
                Nothing overdue, and nothing due today or tomorrow.
              </p>
            ) : (
              <>
                {(tickerExpanded ? tickerItems : tickerItems.slice(0, 5)).map((item) => (
                  <p key={item.key} className="text-base leading-snug text-slate-800 dark:text-slate-100">
                    <span
                      className={`font-semibold ${
                        item.overdue
                          ? 'text-red-600 dark:text-red-400'
                          : 'text-teal-700 dark:text-teal-400'
                      }`}
                    >
                      {item.label}
                    </span>{' '}
                    — {item.title}
                  </p>
                ))}
                {tickerItems.length > 5 && (
                  <button
                    type="button"
                    onClick={() => setTickerExpanded((v) => !v)}
                    className="min-h-[44px] px-2 -ml-2 text-base font-medium text-teal-700 dark:text-teal-400 hover:underline"
                  >
                    {tickerExpanded ? 'Show less' : `+ ${tickerItems.length - 5} more`}
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {subMode === 'calendar' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left: Integrated Calendar */}
          <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CalendarIcon className="w-5 h-5 text-teal-700 dark:text-teal-400" />
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  {monthLabel}
                </h2>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    const now = new Date();
                    setCurrentMonth(new Date(now.getFullYear(), now.getMonth(), 1));
                    setSelectedDate(todayIso);
                    setShowAllDates(false);
                  }}
                  className="min-h-[36px] px-2.5 text-xs font-medium text-teal-700 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-950/40 rounded-md transition-colors"
                >
                  Today
                </button>
                <button
                  type="button"
                  aria-label="Previous month"
                  onClick={() =>
                    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))
                  }
                  className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-md text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  aria-label="Next month"
                  onClick={() =>
                    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))
                  }
                  className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-md text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-7 text-center text-xs font-medium text-slate-500 dark:text-slate-400">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                <div key={d} className="py-1.5">
                  {d}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1">
              {calendarDays.map((cell, idx) => {
                if (!cell.dateIso || cell.dayNum === null) {
                  return <div key={`empty-${idx}`} className="h-12" />;
                }
                const dayTasks = tasksByDate.get(cell.dateIso) || [];
                const pendingCount = dayTasks.filter((t) => t.status === 'pending').length;
                const isSelected = !showAllDates && selectedDate === cell.dateIso;
                const isToday = cell.dateIso === todayIso;
                const hasOverdue = dayTasks.some((t) => t.status === 'pending' && t.dueDate < todayIso);

                return (
                  <button
                    key={cell.dateIso}
                    type="button"
                    onClick={() => {
                      setSelectedDate(cell.dateIso!);
                      setShowAllDates(false);
                    }}
                    className={`h-12 rounded-lg flex flex-col items-center justify-center transition-colors tabular-nums text-sm ${
                      isSelected
                        ? 'bg-teal-700 text-white font-semibold'
                        : isToday
                        ? 'bg-teal-50 dark:bg-teal-950/50 text-teal-800 dark:text-teal-300 font-semibold border border-teal-200 dark:border-teal-800'
                        : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200'
                    }`}
                  >
                    <span>{cell.dayNum}</span>
                    {dayTasks.length > 0 && (
                      <span
                        className={`text-[10px] leading-none mt-0.5 font-mono ${
                          isSelected
                            ? 'text-teal-100'
                            : hasOverdue
                            ? 'text-red-600 dark:text-red-400'
                            : pendingCount > 0
                            ? 'text-teal-700 dark:text-teal-400'
                            : 'text-slate-400'
                        }`}
                      >
                        {pendingCount > 0 ? `${pendingCount} due` : `${dayTasks.length}✓`}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setShowAllDates((prev) => !prev)}
                className="min-h-[40px] px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                {showAllDates ? `Filter to ${selectedDate}` : 'Show All Dates'}
              </button>
              <button
                type="button"
                onClick={() => openNewComposer(selectedDate)}
                className="min-h-[40px] inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add on {selectedDate.slice(5)}</span>
              </button>
            </div>
          </div>

          {/* Right: Agenda & Task List */}
          <div className="lg:col-span-7 space-y-4">
            {/* Search & Filters */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3">
              <div className="flex flex-col sm:flex-row gap-3">
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search tasks, appointments, or notes..."
                  className="flex-1 min-h-[44px] px-3.5 py-2 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-700"
                />
                <div className="inline-flex p-1 bg-slate-100 dark:bg-slate-800 rounded-lg self-start">
                  {(['pending', 'completed', 'all'] as const).map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setStatusFilter(st)}
                      className={`min-h-[36px] px-3 text-xs font-medium rounded-md capitalize transition-colors ${
                        statusFilter === st
                          ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                          : 'text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      {st}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                {['All', ...CATEGORIES].map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setCategoryFilter(cat)}
                    className={`min-h-[36px] px-2.5 py-1 text-xs font-medium rounded-md whitespace-nowrap shrink-0 transition-colors ${
                      categoryFilter === cat
                        ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900'
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Task Rows */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl divide-y divide-slate-200 dark:divide-slate-800">
              {filteredTasks.length === 0 ? (
                <div className="p-10 text-center space-y-3">
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                    {showAllDates
                      ? 'No matching tasks or appointments yet'
                      : `Nothing scheduled for ${selectedDate}`}
                  </p>
                  <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                    Add tax due dates, car maintenance, church functions, community service, or household reminders.
                  </p>
                  <button
                    type="button"
                    onClick={() => openNewComposer(selectedDate)}
                    className="min-h-[44px] inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Add Task or Appointment</span>
                  </button>
                </div>
              ) : (
                filteredTasks.map((task) => {
                  const isOverdue = task.status === 'pending' && task.dueDate < todayIso;
                  const linkedDoc = documents.find((d) => d.id === task.linkedDocumentId);
                  const helpOpen = expandedHelpIds[task.id] ?? task.helpSteps.length > 0;

                  return (
                    <div key={task.id} className="p-4 sm:p-5 space-y-3">
                      <div className="flex items-start gap-3">
                        <button
                          type="button"
                          onClick={() => {
                            if (task.status === 'completed') {
                              void onToggleTaskComplete(task);
                            } else if (completingTaskId === task.id) {
                              setCompletingTaskId(null);
                            } else {
                              setCompletingTaskId(task.id);
                              setMoreMode(false);
                              setMoreNote('');
                            }
                          }}
                          aria-label={
                            task.status === 'completed' ? 'Reopen task' : 'Complete task'
                          }
                          className="min-h-[44px] min-w-[44px] -ml-2 -mt-2 flex items-center justify-center rounded-lg text-slate-500 hover:text-teal-700 dark:hover:text-teal-400 transition-colors shrink-0"
                        >
                          {task.status === 'completed' ? (
                            <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                          ) : (
                            <Circle className="w-5 h-5" />
                          )}
                        </button>

                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-baseline justify-between gap-2">
                            <h3
                              className={`text-base font-medium ${
                                task.status === 'completed'
                                  ? 'line-through text-slate-400 dark:text-slate-500'
                                  : 'text-slate-900 dark:text-slate-100'
                              }`}
                            >
                              {task.title}
                            </h3>
                            <span
                              className={`text-xs font-medium capitalize ${
                                isOverdue
                                  ? 'text-red-600 dark:text-red-400'
                                  : task.priority === 'high'
                                  ? 'text-amber-700 dark:text-amber-400'
                                  : 'text-slate-500 dark:text-slate-400'
                              }`}
                            >
                              {isOverdue ? 'Overdue' : `${task.priority} priority`}
                            </span>
                          </div>

                          {/* Zero-pill inline metadata */}
                          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                            <span>{task.category}{task.place ? ` · ${task.place}` : ''}</span>
                            <span aria-hidden="true">·</span>
                            <span className="capitalize">{task.type}</span>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono">
                              {task.dueDate}
                              {task.dueTime ? ` ${task.dueTime}` : ''}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span className="inline-flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {task.estimatedMinutes}m
                            </span>
                            <span aria-hidden="true">·</span>
                            <span className="inline-flex items-center gap-1">
                              <Bell className="w-3 h-3" />
                              {formatReminderLabel(task.reminderMinutes)}
                            </span>
                          </div>

                          {task.notes && (
                            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                              {task.notes}
                            </p>
                          )}

                          {linkedDoc && (
                            <div className="mt-2 inline-flex items-center gap-1.5 text-xs text-teal-700 dark:text-teal-400 font-medium">
                              <FileText className="w-3.5 h-3.5" />
                              <span>Linked document: {linkedDoc.title}</span>
                            </div>
                          )}

                          {task.status === 'completed' && task.completedAtIso && (
                            <p className="mt-2 text-sm font-medium text-slate-600 dark:text-slate-300">
                              Done{' '}
                              {new Date(task.completedAtIso).toLocaleDateString(undefined, {
                                weekday: 'short',
                                month: 'short',
                                day: 'numeric',
                              })}
                              {task.completionState === 'finished'
                                ? ' — Finished. Nothing left on it.'
                                : task.completionState === 'more'
                                  ? ` — More to do${task.remainderNote ? `: ${task.remainderNote}` : ' later.'}`
                                  : ''}
                            </p>
                          )}

                          {task.status === 'pending' && completingTaskId === task.id && (
                            <div className="mt-3 rounded-lg border border-teal-200 dark:border-teal-800 bg-teal-50 dark:bg-teal-950/40 p-4 space-y-3">
                              <p className="text-base font-medium text-slate-900 dark:text-slate-100">
                                Is "{task.title}" finished, or is there more to do on it later?
                              </p>
                              {!moreMode ? (
                                <div className="flex flex-col sm:flex-row gap-2">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      void onCompleteTask(task, 'finished', '');
                                      setCompletingTaskId(null);
                                    }}
                                    className="flex-1 min-h-[52px] px-4 py-2.5 text-base font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors"
                                  >
                                    Finished
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setMoreMode(true)}
                                    className="flex-1 min-h-[52px] px-4 py-2.5 text-base font-semibold text-teal-900 dark:text-teal-100 bg-white dark:bg-slate-900 border border-teal-300 dark:border-teal-700 hover:bg-teal-100 dark:hover:bg-teal-900/50 rounded-lg transition-colors"
                                  >
                                    More to do later
                                  </button>
                                </div>
                              ) : (
                                <div className="space-y-2.5">
                                  <input
                                    type="text"
                                    value={moreNote}
                                    onChange={(e) => setMoreNote(e.target.value)}
                                    placeholder="What's left to do? (you can leave this blank)"
                                    className="w-full min-h-[48px] px-3.5 py-2 text-base bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-700"
                                  />
                                  <div className="flex flex-col sm:flex-row gap-2">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        void onCompleteTask(task, 'more', moreNote.trim());
                                        setCompletingTaskId(null);
                                      }}
                                      className="flex-1 min-h-[52px] px-4 py-2.5 text-base font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors"
                                    >
                                      Save — more to do
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setMoreMode(false)}
                                      className="min-h-[52px] px-4 py-2.5 text-base font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                                    >
                                      Back
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Action row */}
                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            {task.status === 'pending' && (
                              <button
                                type="button"
                                onClick={() => handleFetchHelpSteps(task)}
                                disabled={loadingHelpId === task.id}
                                className="min-h-[36px] inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-teal-800 dark:text-teal-300 bg-teal-50 dark:bg-teal-950/50 hover:bg-teal-100 dark:hover:bg-teal-900/50 rounded-md transition-colors"
                              >
                                {loadingHelpId === task.id ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <HelpCircle className="w-3.5 h-3.5" />
                                )}
                                <span>
                                  {task.helpSteps.length > 0
                                    ? 'Refresh Help Steps'
                                    : 'Suggest Help Steps'}
                                </span>
                              </button>
                            )}

                            {task.helpSteps.length > 0 && (
                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedHelpIds((prev) => ({
                                    ...prev,
                                    [task.id]: !helpOpen,
                                  }))
                                }
                                className="min-h-[36px] px-2.5 py-1 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors"
                              >
                                {helpOpen
                                  ? `Hide ${task.helpSteps.length} Steps`
                                  : `Show ${task.helpSteps.length} Help Steps`}
                              </button>
                            )}

                            {task.status === 'pending' && (
                              <button
                                type="button"
                                onClick={() => openEditComposer(task)}
                                className="min-h-[36px] inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                                <span>Edit</span>
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => onDeleteTask(task.id)}
                              className="min-h-[36px] inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-md transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Delete</span>
                            </button>
                          </div>

                          {helpOpen && task.helpSteps.length > 0 && (
                            <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 space-y-1.5">
                              <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                                Suggested Help & Preparation Steps
                              </p>
                              <ol className="list-decimal list-inside space-y-1 text-sm text-slate-600 dark:text-slate-300">
                                {task.helpSteps.map((step, i) => (
                                  <li key={i}>{step}</li>
                                ))}
                              </ol>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      ) : (
        /* AI Adaptive Task Prioritization View */
        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="space-y-1">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                Adaptive Daily Task Prioritization
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Analyzes due dates, importance, estimated durations, and learns from your manual boosts, deferrals, and completion patterns over time.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <select
                aria-label="Preferred focus window"
                value={userProfile?.preferredFocusWindow || 'balanced'}
                onChange={(e) =>
                  onUpdateFocusPrefs(
                    e.target.value as FocusWindow,
                    userProfile?.prefersQuickWinsFirst ?? false
                  )
                }
                className="min-h-[44px] px-3 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100"
              >
                <option value="morning">Morning Peak Focus</option>
                <option value="afternoon">Afternoon Peak Focus</option>
                <option value="evening">Evening Peak Focus</option>
                <option value="balanced">Balanced Day</option>
              </select>

              <button
                type="button"
                onClick={() =>
                  onUpdateFocusPrefs(
                    userProfile?.preferredFocusWindow || 'balanced',
                    !(userProfile?.prefersQuickWinsFirst ?? false)
                  )
                }
                className={`min-h-[44px] px-3 text-sm font-medium rounded-lg border transition-colors ${
                  userProfile?.prefersQuickWinsFirst
                    ? 'bg-teal-50 dark:bg-teal-950/50 border-teal-300 dark:border-teal-800 text-teal-800 dark:text-teal-300'
                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                }`}
              >
                {userProfile?.prefersQuickWinsFirst ? 'Quick Wins First: On' : 'Quick Wins First: Off'}
              </button>

              <button
                type="button"
                onClick={handleGeneratePriorityPlan}
                disabled={loadingPriority}
                className="min-h-[44px] inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-60 rounded-lg transition-colors"
              >
                {loadingPriority ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4" />
                )}
                <span>Generate Today&apos;s Priority Plan</span>
              </button>
            </div>
          </div>

          {priorityError && (
            <div className="p-4 rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 text-sm text-red-700 dark:text-red-300">
              {priorityError}
            </div>
          )}

          {priorityPlan ? (
            <div className="space-y-4">
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    Daily Strategy · Generated at {priorityPlan.generatedAtIso}
                  </p>
                  <p className="text-sm text-slate-800 dark:text-slate-200 mt-1.5 leading-relaxed">
                    {priorityPlan.dailyStrategy}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-teal-700 dark:text-teal-400">
                    Learned Behavioral Adaptation
                  </p>
                  <p className="text-sm text-slate-800 dark:text-slate-200 mt-1.5 leading-relaxed">
                    {priorityPlan.learnedInsight}
                  </p>
                </div>
              </div>

              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl divide-y divide-slate-200 dark:divide-slate-800">
                {priorityPlan.rankedTasks.map((ranked) => {
                  const personalTask = tasks.find((t) => t.id === ranked.taskId);
                  const sharedTask = ranked.taskId.startsWith('shared:')
                    ? sharedTasks.find((s) => `shared:${s.id}` === ranked.taskId)
                    : undefined;
                  const title = personalTask?.title || sharedTask?.title || 'Task';
                  const category = personalTask?.category || sharedTask?.projectName || 'Shared';
                  const dueDate = personalTask?.dueDate || sharedTask?.dueDate || '';
                  const est = personalTask?.estimatedMinutes || sharedTask?.estimatedMinutes || 30;

                  return (
                    <div
                      key={ranked.taskId}
                      className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                    >
                      <div className="flex items-start gap-4">
                        <div className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center font-mono font-semibold text-slate-900 dark:text-slate-100 shrink-0 tabular-nums">
                          #{ranked.rank}
                        </div>
                        <div className="space-y-1">
                          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                            {title}
                          </h3>
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                            <span className="font-medium text-teal-700 dark:text-teal-400">
                              {ranked.timeBlock}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span>{category}</span>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono">Due {dueDate}</span>
                            <span aria-hidden="true">·</span>
                            <span>{est}m est.</span>
                            <span aria-hidden="true">·</span>
                            <span>Urgency {ranked.urgencyScore}/100</span>
                          </div>
                          <p className="text-sm text-slate-700 dark:text-slate-300 mt-1">
                            {ranked.reason}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            Adaptive factor: {ranked.adaptiveNote}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleBoostOrDefer(ranked.taskId, 'boost')}
                          className="min-h-[40px] inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                          <span>Prioritize Now</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleBoostOrDefer(ranked.taskId, 'defer')}
                          className="min-h-[40px] inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                          <span>Defer</span>
                        </button>
                        {personalTask && personalTask.status === 'pending' && (
                          <button
                            type="button"
                            onClick={() => onToggleTaskComplete(personalTask)}
                            className="min-h-[40px] inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Done</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-8 text-center space-y-3">
              <p className="text-base font-medium text-slate-900 dark:text-slate-100">
                Ready to rank your schedule
              </p>
              <p className="text-sm text-slate-500 dark:text-slate-400 max-w-lg mx-auto">
                Click &ldquo;Generate Today&apos;s Priority Plan&rdquo; above. As you boost, defer, and complete tasks, Steward records your preferences ({userProfile?.behaviorSignals.length || 0} learned behavioral signals stored) and tailors future rankings automatically.
              </p>
            </div>
          )}

          {userProfile && userProfile.behaviorSignals.length > 0 && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-2">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Learned Behavioral Memory ({userProfile.behaviorSignals.length})
              </h3>
              <ul className="space-y-1 text-xs text-slate-600 dark:text-slate-400">
                {userProfile.behaviorSignals.slice(-6).reverse().map((sig, i) => (
                  <li key={i}>• {sig}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Task / Appointment Composer Modal */}
      {composerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 backdrop-blur-sm p-4">
          <form
            onSubmit={handleSaveComposer}
            className="w-full max-w-lg max-h-[90vh] overflow-y-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4 shadow-xl"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                {editingTaskId ? 'Edit Schedule Item' : 'New Task or Appointment'}
              </h2>
              <button
                type="button"
                onClick={() => setComposerOpen(false)}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                Title
              </label>
              <input
                type="text"
                required
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                placeholder="e.g., File Quarterly Estimated Taxes, Oil Change & Tire Rotation"
                className="w-full min-h-[44px] px-3.5 py-2 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  Type
                </label>
                <select
                  value={formType}
                  onChange={(e) => setFormType(e.target.value as TaskType)}
                  className="w-full min-h-[44px] px-3 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100"
                >
                  <option value="task">Task</option>
                  <option value="appointment">Appointment</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  Category
                </label>
                <select
                  value={formCategory}
                  onChange={(e) => setFormCategory(e.target.value as Category)}
                  className="w-full min-h-[44px] px-3 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100"
                >
                  {CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                Place
              </label>
              <select
                value={formPlace}
                onChange={(e) => setFormPlace(e.target.value)}
                className="w-full min-h-[44px] px-3 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100"
              >
                <option value="">General — no place</option>
                {PLACES.map((pl) => (
                  <option key={pl} value={pl}>
                    {pl}
                  </option>
                ))}
              </select>
            </div>

            {!editingTaskId && visibilityOptions.length > 0 && (
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  Who can see this?
                </label>
                <select
                  value={formVisibility}
                  onChange={(e) => setFormVisibility(e.target.value)}
                  className="w-full min-h-[44px] px-3 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100"
                >
                  {visibilityOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Whatever you add stays yours — this only chooses who can see it.
                </p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  Due Date
                </label>
                <input
                  type="date"
                  required
                  value={formDueDate}
                  onChange={(e) => setFormDueDate(e.target.value)}
                  className="w-full min-h-[44px] px-3 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  Time (optional)
                </label>
                <input
                  type="time"
                  value={formDueTime}
                  onChange={(e) => setFormDueTime(e.target.value)}
                  className="w-full min-h-[44px] px-3 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  Priority
                </label>
                <select
                  value={formPriority}
                  onChange={(e) => setFormPriority(e.target.value as TaskPriority)}
                  className="w-full min-h-[44px] px-3 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  Est. Minutes
                </label>
                <input
                  type="number"
                  min={5}
                  max={1440}
                  step={5}
                  value={formEstimatedMinutes}
                  onChange={(e) => setFormEstimatedMinutes(Number(e.target.value))}
                  className="w-full min-h-[44px] px-3 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  Reminder
                </label>
                <select
                  value={formReminderMinutes}
                  onChange={(e) => setFormReminderMinutes(Number(e.target.value))}
                  className="w-full min-h-[44px] px-2 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100"
                >
                  {REMINDER_OPTIONS.map((opt) => (
                    <option key={opt.minutes} value={opt.minutes}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {documents.length > 0 && (
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  Link Filed Document (optional)
                </label>
                <select
                  value={formLinkedDocId}
                  onChange={(e) => setFormLinkedDocId(e.target.value)}
                  className="w-full min-h-[44px] px-3 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100"
                >
                  <option value="">None</option>
                  {documents.map((doc) => (
                    <option key={doc.id} value={doc.id}>
                      {doc.title} ({doc.category})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                Notes
              </label>
              <textarea
                rows={3}
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
                placeholder="Location, confirmation code, items to bring..."
                className="w-full p-3 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setComposerOpen(false)}
                className="min-h-[44px] px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingTask}
                className="min-h-[44px] px-5 py-2 text-sm font-medium text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-60 rounded-lg transition-colors"
              >
                {savingTask ? 'Saving...' : editingTaskId ? 'Save Changes' : 'Save to Schedule'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

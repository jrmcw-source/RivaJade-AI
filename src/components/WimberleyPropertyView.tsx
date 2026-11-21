import React, { useEffect, useMemo, useState } from 'react';
import {
  Trees,
  Home,
  CalendarClock,
  CloudSun,
  Sparkles,
  Plus,
  RefreshCw,
  FileText,
  Trash2,
  Pencil,
  CalendarPlus,
  CheckCircle2,
  AlertTriangle,
  X,
} from 'lucide-react';
import {
  PropertyAdvisoryPlan,
  PropertyCadence,
  PropertyEntry,
  PropertyEntryArea,
  PropertyEntryStatus,
  ScannedDocument,
  ScheduleTask,
  WimberleyWeatherData,
  getLocalTodayIso,
  PLACES,
  RecordKind,
  RECORD_KIND_LABELS,
} from '../types';

interface WimberleyPropertyViewProps {
  entries: PropertyEntry[];
  documents: ScannedDocument[];
  propertyTasks: ScheduleTask[];
  onCreateEntry: (
    payload: Omit<PropertyEntry, 'id' | 'userId' | 'createdAt' | 'updatedAt' | 'householdId' | 'memberIds'>
  ) => Promise<void>;
  onUpdateEntry: (entryId: string, updates: Partial<PropertyEntry>) => Promise<void>;
  onDeleteEntry: (entryId: string) => Promise<void>;
  onScheduleReminderTask: (
    payload: Omit<
      ScheduleTask,
      'id' | 'userId' | 'createdAt' | 'updatedAt' | 'completedAtIso' | 'status' | 'householdId' | 'memberIds'
    >
  ) => Promise<void>;
  onToggleTaskComplete: (task: ScheduleTask) => Promise<void>;
}

const AREA_LABELS: Record<PropertyEntryArea, string> = {
  conservancy: 'Conservancy',
  cabin_maintenance: 'Cabin Maintenance',
  cabin_stay: 'Cabin Stay & Turnover',
};

const STATUS_LABELS: Record<PropertyEntryStatus, string> = {
  nominal: 'Nominal',
  ready: 'Ready',
  upcoming: 'Upcoming',
  attention: 'Needs Attention',
  urgent: 'Urgent',
  completed: 'Completed',
};

const STATUS_TEXT_COLORS: Record<PropertyEntryStatus, string> = {
  nominal: 'text-emerald-700 dark:text-emerald-400',
  ready: 'text-teal-700 dark:text-teal-400',
  upcoming: 'text-sky-700 dark:text-sky-400',
  attention: 'text-amber-700 dark:text-amber-400',
  urgent: 'text-red-600 dark:text-red-400',
  completed: 'text-slate-500 dark:text-slate-400',
};

const CADENCE_LABELS: Record<PropertyCadence, string> = {
  once: 'One-time',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  seasonal: 'Seasonal',
  annual: 'Annual',
};

export const WimberleyPropertyView: React.FC<WimberleyPropertyViewProps> = ({
  entries,
  documents,
  propertyTasks,
  onCreateEntry,
  onUpdateEntry,
  onDeleteEntry,
  onScheduleReminderTask,
  onToggleTaskComplete,
}) => {
  const [areaFilter, setAreaFilter] = useState<'all' | PropertyEntryArea>('all');
  const [weather, setWeather] = useState<WimberleyWeatherData | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [weatherError, setWeatherError] = useState<string | null>(null);

  const [advisoryPlan, setAdvisoryPlan] = useState<PropertyAdvisoryPlan | null>(null);
  const [advisoryLoading, setAdvisoryLoading] = useState(false);
  const [advisoryError, setAdvisoryError] = useState<string | null>(null);

  const [seedingStarter, setSeedingStarter] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Add / Edit Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<PropertyEntry | null>(null);
  const [area, setArea] = useState<PropertyEntryArea>('conservancy');
  const [place, setPlace] = useState('Riva Jade — Wildlife Conservancy');
  const [title, setTitle] = useState('');
  const [status, setStatus] = useState<PropertyEntryStatus>('nominal');
  const [scheduledDate, setScheduledDate] = useState(getLocalTodayIso());
  const [endDate, setEndDate] = useState('');
  const [cadence, setCadence] = useState<PropertyCadence>('seasonal');
  const [recordKind, setRecordKind] = useState<RecordKind>('personal');
  const [customKindLabel, setCustomKindLabel] = useState('');
  const [inspectorOrGuest, setInspectorOrGuest] = useState('');
  const [notes, setNotes] = useState('');
  const [linkedDocumentId, setLinkedDocumentId] = useState('');
  const [saving, setSaving] = useState(false);

  async function loadWeather() {
    setWeatherLoading(true);
    setWeatherError(null);
    try {
      const res = await fetch('/api/property/wimberley-weather');
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to fetch Wimberley, TX weather.');
      }
      setWeather(data as WimberleyWeatherData);
    } catch (err) {
      setWeatherError(
        err instanceof Error ? err.message : 'Unable to fetch Wimberley weather right now.'
      );
    } finally {
      setWeatherLoading(false);
    }
  }

  useEffect(() => {
    void loadWeather();
  }, []);

  const counts = useMemo(() => {
    const conservancy = entries.filter((e) => e.area === 'conservancy').length;
    const cabinMaint = entries.filter((e) => e.area === 'cabin_maintenance').length;
    const cabinStays = entries.filter((e) => e.area === 'cabin_stay').length;
    const flagged = entries.filter(
      (e) => e.status === 'attention' || e.status === 'urgent'
    ).length;
    return { conservancy, cabinMaint, cabinStays, flagged };
  }, [entries]);

  const filteredEntries = useMemo(() => {
    const list =
      areaFilter === 'all' ? entries : entries.filter((e) => e.area === areaFilter);
    return [...list].sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate));
  }, [entries, areaFilter]);

  const propertyDocs = useMemo(() => {
    return documents.filter(
      (d) =>
        d.category === 'Wimberley Property' ||
        /wimberley|cabin|septic|cistern|oak|conservancy|hays|well|acre/i.test(
          `${d.title} ${d.summary} ${d.tags.join(' ')}`
        )
    );
  }, [documents]);

  function openNewModal(defaultArea: PropertyEntryArea = 'conservancy') {
    setEditingEntry(null);
    setPlace(defaultArea === 'conservancy' ? 'Riva Jade — Wildlife Conservancy' : 'Riva Jade — Rental Cabin');
    setArea(defaultArea);
    setTitle('');
    setStatus(defaultArea === 'cabin_stay' ? 'upcoming' : 'nominal');
    setScheduledDate(getLocalTodayIso());
    setEndDate('');
    setCadence(defaultArea === 'cabin_stay' ? 'once' : 'seasonal');
    setRecordKind('personal');
    setCustomKindLabel('');
    setInspectorOrGuest('');
    setNotes('');
    setLinkedDocumentId('');
    setModalOpen(true);
  }

  function openEditModal(entry: PropertyEntry) {
    setEditingEntry(entry);
    setArea(entry.area);
    setPlace(entry.place || '');
    setTitle(entry.title);
    setStatus(entry.status);
    setScheduledDate(entry.scheduledDate);
    setEndDate(entry.endDate || '');
    setCadence(entry.cadence);
    setRecordKind(entry.recordKind || 'personal');
    setCustomKindLabel(entry.customKindLabel || '');
    setInspectorOrGuest(entry.inspectorOrGuest || '');
    setNotes(entry.notes || '');
    setLinkedDocumentId(entry.linkedDocumentId || '');
    setModalOpen(true);
  }

  async function handleSaveForm(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    try {
      const payload = {
        area,
        place,
        title: title.trim().slice(0, 200),
        status,
        scheduledDate: scheduledDate || getLocalTodayIso(),
        endDate: area === 'cabin_stay' && endDate ? endDate : '',
        cadence,
        inspectorOrGuest: inspectorOrGuest.trim().slice(0, 120),
        notes: notes.trim().slice(0, 2000),
        linkedDocumentId: linkedDocumentId || '',
        recordKind,
        customKindLabel: recordKind === 'custom' ? customKindLabel.trim().slice(0, 60) : '',
      };

      if (editingEntry) {
        await onUpdateEntry(editingEntry.id, payload);
        setFeedback(`Updated "${payload.title}".`);
      } else {
        await onCreateEntry(payload);
        setFeedback(`Added "${payload.title}" to Wimberley monitor.`);
      }
      setModalOpen(false);
    } finally {
      setSaving(false);
    }
  }

  async function handleLoadStarterChecklist() {
    setSeedingStarter(true);
    setFeedback(null);
    const today = getLocalTodayIso();
    const starters: Array<Omit<PropertyEntry, 'id' | 'userId' | 'createdAt' | 'updatedAt' | 'householdId' | 'memberIds'>> = [
      {
        area: 'conservancy',
        place: 'Riva Jade — Wildlife Conservancy',
        title: 'Oak Wilt Season Compliance & Canopy Inspection',
        status: 'nominal',
        scheduledDate: today,
        endDate: '',
        cadence: 'seasonal',
        inspectorOrGuest: 'Family Land Steward',
        notes:
          'Observe Feb–Jun Texas Hill Country oak wilt pruning restriction; seal any storm-damaged live/red oak cuts immediately with pruning paint.',
        linkedDocumentId: '',
      },
      {
        area: 'conservancy',
        place: 'Riva Jade — Wildlife Conservancy',
        title: 'Rainwater Cistern, First-Flush & Creek Erosion Walk',
        status: 'attention',
        scheduledDate: today,
        endDate: '',
        cadence: 'quarterly',
        inspectorOrGuest: 'Family Land Steward',
        notes:
          'Flush cistern sediment screen, check rainwater pump pressure, and inspect low-water drainage berms for runoff washout.',
        linkedDocumentId: '',
      },
      {
        area: 'conservancy',
        place: 'Riva Jade — Wildlife Conservancy',
        title: 'Hays County Wildlife Valuation & Cedar Management Log',
        status: 'upcoming',
        scheduledDate: today,
        endDate: '',
        cadence: 'annual',
        inspectorOrGuest: 'Hays County Appraisal / Steward',
        notes:
          'Document brush control, selective cedar clearing, nest boxes, and perimeter fence checks for annual conservancy/wildlife exemption records.',
        linkedDocumentId: '',
      },
      {
        area: 'cabin_maintenance',
        place: 'Riva Jade — Rental Cabin',
        title: 'Rental Cabin Septic / Aerobic System & Well Filter Check',
        status: 'attention',
        scheduledDate: today,
        endDate: '',
        cadence: 'quarterly',
        inspectorOrGuest: 'Hill Country Septic Service',
        notes:
          'Inspect aerobic sprinkler heads, chlorine tablet level, UV/sediment water filter cartridges, and well pressure tank.',
        linkedDocumentId: '',
      },
      {
        area: 'cabin_maintenance',
        place: 'Riva Jade — Rental Cabin',
        title: 'Cabin Turnover Readiness: HVAC Filters, Propane & Smart Lock',
        status: 'ready',
        scheduledDate: today,
        endDate: '',
        cadence: 'monthly',
        inspectorOrGuest: 'Cabin Caretaker',
        notes:
          'Verify propane tank gauge, test smoke/CO alarms, replace HVAC pleated filter, and rotate guest smart-lock PIN before check-in.',
        linkedDocumentId: '',
      },
    ];

    try {
      for (const item of starters) {
        await onCreateEntry(item);
      }
      setFeedback('Loaded 5 Wimberley conservancy & rental cabin baseline items.');
    } finally {
      setSeedingStarter(false);
    }
  }

  async function handleGenerateAdvisory() {
    setAdvisoryLoading(true);
    setAdvisoryError(null);
    try {
      const weatherSummary = weather
        ? `${weather.current.temperatureF}°F (${weather.current.conditionLabel}), Humidity ${weather.current.humidityPct}%, Wind ${weather.current.windMph} mph. Advisories: ${weather.advisories
            .map((a) => `${a.title}: ${a.detail}`)
            .join(' | ')}`
        : 'Weather feed unavailable';

      const linkedDocsSummary = propertyDocs
        .slice(0, 8)
        .map((d) => `${d.title} (${d.detectedDate || 'no date'}): ${d.summary}`)
        .join('\n');

      const res = await fetch('/api/property/advise', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentDate: getLocalTodayIso(),
          weatherSummary,
          entries: entries.slice(0, 20).map((e) => ({
            area: e.area,
            title: e.title,
            status: e.status,
            scheduledDate: e.scheduledDate,
            endDate: e.endDate,
            cadence: e.cadence,
            notes: e.notes,
          })),
          linkedDocsSummary,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to generate Wimberley property guidance.');
      }
      setAdvisoryPlan(data as PropertyAdvisoryPlan);
    } catch (err) {
      setAdvisoryError(
        err instanceof Error ? err.message : 'Unable to generate seasonal property plan.'
      );
    } finally {
      setAdvisoryLoading(false);
    }
  }

  async function handlePromoteToTask(entry: PropertyEntry) {
    const isStay = entry.area === 'cabin_stay';
    await onScheduleReminderTask({
      title: isStay ? `Cabin Turnover: ${entry.title}` : `Wimberley: ${entry.title}`,
      type: isStay ? 'appointment' : 'task',
      category: 'Wimberley Property',
      place: entry.place || '',
      dueDate: entry.scheduledDate,
      dueTime: isStay ? '11:00' : '09:00',
      estimatedMinutes: isStay ? 90 : 60,
      reminderMinutes: 1440,
      priority: entry.status === 'urgent' ? 'high' : entry.status === 'attention' ? 'medium' : 'medium',
      notes: `${AREA_LABELS[entry.area]} (${CADENCE_LABELS[entry.cadence]})${
        entry.inspectorOrGuest ? ` · Contact: ${entry.inspectorOrGuest}` : ''
      }\n${entry.notes}`,
      helpSteps: [],
      linkedDocumentId: entry.linkedDocumentId || '',
    });
    setFeedback(`Scheduled "${entry.title}" on your main calendar under Wimberley Property.`);
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Wimberley, TX Family Property
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Hays County stewardship monitor for land conservancy health, rental cabin systems, and guest turnovers.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleGenerateAdvisory}
            disabled={advisoryLoading}
            className="min-h-[44px] inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-teal-800 dark:text-teal-300 bg-teal-50 dark:bg-teal-950/50 border border-teal-200 dark:border-teal-800 hover:bg-teal-100 dark:hover:bg-teal-950 rounded-lg transition-colors disabled:opacity-60"
          >
            <Sparkles className="w-4 h-4" />
            <span>{advisoryLoading ? 'Analyzing Property...' : 'Seasonal AI Guidance'}</span>
          </button>

          <button
            type="button"
            onClick={() => openNewModal('conservancy')}
            className="min-h-[44px] inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Log Property Item</span>
          </button>
        </div>
      </div>

      {feedback && (
        <div className="p-3.5 rounded-xl border border-teal-200 dark:border-teal-800 bg-teal-50 dark:bg-teal-950/40 flex items-center justify-between gap-3 text-sm text-teal-800 dark:text-teal-300">
          <span>{feedback}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-teal-700 dark:text-teal-400 hover:opacity-75 p-1"
            aria-label="Dismiss message"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Overview Stats Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Conservancy Checks
          </p>
          <p className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100 mt-1">
            {counts.conservancy}
          </p>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Cabin Systems
          </p>
          <p className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100 mt-1">
            {counts.cabinMaint}
          </p>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Cabin Stays & Turnovers
          </p>
          <p className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100 mt-1">
            {counts.cabinStays}
          </p>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Attention / Urgent
          </p>
          <p
            className={`text-2xl font-bold font-mono tabular-nums mt-1 ${
              counts.flagged > 0
                ? 'text-amber-700 dark:text-amber-400'
                : 'text-emerald-700 dark:text-emerald-400'
            }`}
          >
            {counts.flagged}
          </p>
        </div>
      </div>

      {/* Live Wimberley, TX Weather & Hill Country Environmental Advisories */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <CloudSun className="w-5 h-5 text-teal-700 dark:text-teal-400" />
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Live Wimberley Weather & Hill Country Advisories
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                30.0024°N, 98.0986°W · Hays County · Blanco & Cypress Creek Watershed
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={loadWeather}
            disabled={weatherLoading}
            className="min-h-[38px] inline-flex items-center gap-1.5 px-3 text-xs font-medium text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${weatherLoading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>

        {weatherError && (
          <div className="p-3 rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 text-xs text-red-700 dark:text-red-300">
            {weatherError}
          </div>
        )}

        {weather && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            <div className="lg:col-span-5 space-y-3">
              <div className="flex items-baseline gap-3">
                <span className="text-3xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100">
                  {weather.current.temperatureF}°F
                </span>
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  {weather.current.conditionLabel}
                </span>
              </div>
              <p className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                Feels {weather.current.apparentTemperatureF}°F · Humidity {weather.current.humidityPct}% · Wind {weather.current.windMph} mph · Rain {weather.current.precipitationIn}&quot;
              </p>

              <div className="grid grid-cols-5 gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                {weather.daily.map((d) => (
                  <div key={d.date} className="text-xs space-y-0.5">
                    <p className="font-mono text-slate-500 dark:text-slate-400">
                      {d.date.slice(5)}
                    </p>
                    <p className="font-mono font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                      {d.tempMaxF}° / {d.tempMinF}°
                    </p>
                    <p className="font-mono text-[11px] text-sky-700 dark:text-sky-400 tabular-nums">
                      {d.precipProbPct}% rain
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="lg:col-span-7 divide-y divide-slate-100 dark:divide-slate-800">
              {weather.advisories.map((adv, idx) => (
                <div key={idx} className="py-2.5 first:pt-0 last:pb-0 space-y-1">
                  <div className="flex items-center gap-2">
                    <AlertTriangle
                      className={`w-3.5 h-3.5 shrink-0 ${
                        adv.severity === 'alert'
                          ? 'text-red-600 dark:text-red-400'
                          : adv.severity === 'watch'
                          ? 'text-amber-600 dark:text-amber-400'
                          : 'text-teal-700 dark:text-teal-400'
                      }`}
                    />
                    <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                      {adv.title}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed pl-5">
                    {adv.detail}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* AI Seasonal Advisory Plan */}
      {advisoryError && (
        <div className="p-4 rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 text-sm text-red-700 dark:text-red-300">
          {advisoryError}
        </div>
      )}

      {advisoryPlan && (
        <section className="bg-white dark:bg-slate-900 border border-teal-200 dark:border-teal-800 rounded-xl p-5 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-teal-700 dark:text-teal-400" />
                <span>Wimberley Conservancy & Cabin Action Plan</span>
              </h2>
              <p className="text-sm text-slate-700 dark:text-slate-300 mt-1">
                {advisoryPlan.seasonalSummary}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setAdvisoryPlan(null)}
              className="text-slate-400 hover:text-slate-600 p-1"
              aria-label="Close advisory plan"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs border-y border-slate-100 dark:border-slate-800 py-3">
            <div>
              <p className="font-semibold text-emerald-700 dark:text-emerald-400">
                Conservancy Focus
              </p>
              <p className="text-slate-600 dark:text-slate-400 mt-0.5 leading-relaxed">
                {advisoryPlan.conservancyFocus}
              </p>
            </div>
            <div>
              <p className="font-semibold text-teal-700 dark:text-teal-400">
                Rental Cabin Readiness
              </p>
              <p className="text-slate-600 dark:text-slate-400 mt-0.5 leading-relaxed">
                {advisoryPlan.cabinReadinessFocus}
              </p>
            </div>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {advisoryPlan.recommendations.map((rec, idx) => (
              <div
                key={idx}
                className="py-3 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="space-y-0.5 min-w-0">
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                    {rec.title}
                  </p>
                  <p className="text-xs font-mono text-slate-500 dark:text-slate-400">
                    {AREA_LABELS[rec.area]} · {CADENCE_LABELS[rec.cadence]} · {rec.priority} priority · Suggested {rec.suggestedDate}
                  </p>
                  <p className="text-xs text-slate-600 dark:text-slate-400">{rec.reason}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={async () => {
                      await onCreateEntry({
                        area: rec.area,
                        place:
                          rec.area === 'conservancy'
                            ? 'Riva Jade — Wildlife Conservancy'
                            : 'Riva Jade — Rental Cabin',
                        title: rec.title.slice(0, 200),
                        status: rec.priority === 'high' ? 'attention' : 'upcoming',
                        scheduledDate:
                          /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(rec.suggestedDate)
                            ? rec.suggestedDate
                            : getLocalTodayIso(),
                        endDate: '',
                        cadence: rec.cadence,
                        inspectorOrGuest: '',
                        notes: rec.reason.slice(0, 2000),
                        linkedDocumentId: '',
                      });
                      setFeedback(`Added "${rec.title}" to Wimberley monitor.`);
                    }}
                    className="min-h-[38px] px-3 text-xs font-medium text-teal-700 dark:text-teal-400 border border-teal-200 dark:border-teal-800 hover:bg-teal-50 dark:hover:bg-teal-950/40 rounded-lg"
                  >
                    + Add to Monitor
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Main Property Entries & Schedule Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1 border-b sm:border-b-0 border-slate-100 dark:border-slate-800 pb-2 sm:pb-0">
              {(
                [
                  { id: 'all', label: `All (${entries.length})` },
                  { id: 'conservancy', label: 'Conservancy' },
                  { id: 'cabin_maintenance', label: 'Cabin Care' },
                  { id: 'cabin_stay', label: 'Guest Stays' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setAreaFilter(tab.id)}
                  className={`min-h-[38px] px-3 text-xs font-medium rounded-lg transition-colors ${
                    areaFilter === tab.id
                      ? 'bg-teal-700 text-white'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={handleLoadStarterChecklist}
              disabled={seedingStarter}
              className="min-h-[38px] inline-flex items-center gap-1.5 px-3 text-xs font-medium text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors self-start"
            >
              <Trees className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>{seedingStarter ? 'Loading Checklist...' : 'Load Hill Country Checklist'}</span>
            </button>
          </div>

          {filteredEntries.length === 0 ? (
            <div className="py-12 text-center space-y-3">
              <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                No Wimberley property items logged in this view yet
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                Track oak wilt pruning windows, rainwater cistern maintenance, septic service, Hays County wildlife filings, or rental cabin guest turnovers.
              </p>
              <div className="flex flex-wrap justify-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleLoadStarterChecklist}
                  disabled={seedingStarter}
                  className="min-h-[42px] px-4 text-xs font-medium text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800 hover:bg-teal-50 dark:hover:bg-teal-950/40 rounded-lg"
                >
                  Load Hill Country Checklist
                </button>
                <button
                  type="button"
                  onClick={() => openNewModal(areaFilter === 'all' ? 'conservancy' : areaFilter)}
                  className="min-h-[42px] px-4 text-xs font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg"
                >
                  + Add Custom Entry
                </button>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredEntries.map((entry) => {
                const linkedDoc = documents.find((d) => d.id === entry.linkedDocumentId);
                return (
                  <div key={entry.id} className="py-4 first:pt-0 last:pb-0 space-y-2">
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2">
                          {entry.area === 'conservancy' ? (
                            <Trees className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                          ) : entry.area === 'cabin_maintenance' ? (
                            <Home className="w-4 h-4 text-teal-700 dark:text-teal-400 shrink-0" />
                          ) : (
                            <CalendarClock className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0" />
                          )}
                          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                            {entry.title}
                          </h3>
                        </div>

                        <p className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                          <span className={`font-semibold ${STATUS_TEXT_COLORS[entry.status]}`}>
                            {STATUS_LABELS[entry.status]}
                          </span>
                          {' · '}
                          {AREA_LABELS[entry.area]}
                          {' · '}
                          {CADENCE_LABELS[entry.cadence]}
                          {entry.place ? ` · ${entry.place}` : ''}
                          {' · '}
                          {entry.scheduledDate}
                          {entry.endDate ? ` → ${entry.endDate}` : ''}
                          {entry.inspectorOrGuest ? ` · ${entry.inspectorOrGuest}` : ''}
                        </p>

                        {entry.notes && (
                          <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                            {entry.notes}
                          </p>
                        )}

                        {linkedDoc && (
                          <p className="text-xs text-teal-700 dark:text-teal-400 inline-flex items-center gap-1.5">
                            <FileText className="w-3.5 h-3.5" />
                            <span>Vault Record: {linkedDoc.title}</span>
                          </p>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                        <select
                          aria-label={`Status for ${entry.title}`}
                          value={entry.status}
                          onChange={(e) =>
                            onUpdateEntry(entry.id, {
                              status: e.target.value as PropertyEntryStatus,
                            })
                          }
                          className="min-h-[38px] px-2.5 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-200"
                        >
                          {(Object.keys(STATUS_LABELS) as PropertyEntryStatus[]).map((st) => (
                            <option key={st} value={st}>
                              {STATUS_LABELS[st]}
                            </option>
                          ))}
                        </select>

                        <button
                          type="button"
                          onClick={() => handlePromoteToTask(entry)}
                          title="Add reminder to main schedule"
                          className="min-h-[38px] inline-flex items-center gap-1 px-2.5 text-xs font-medium text-teal-700 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-950/40 rounded-lg"
                        >
                          <CalendarPlus className="w-3.5 h-3.5" />
                          <span>Remind</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => openEditModal(entry)}
                          aria-label="Edit property entry"
                          className="min-h-[38px] min-w-[38px] flex items-center justify-center text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>

                        <button
                          type="button"
                          onClick={() => onDeleteEntry(entry.id)}
                          aria-label="Delete property entry"
                          className="min-h-[38px] min-w-[38px] flex items-center justify-center text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/40"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Sidebar: Scheduled Property Tasks & Linked OCR Property Records */}
        <div className="lg:col-span-4 space-y-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Wimberley Calendar Tasks ({propertyTasks.filter((t) => t.status === 'pending').length})
              </h2>
              <button
                type="button"
                onClick={() => openNewModal('cabin_stay')}
                className="text-xs font-medium text-teal-700 dark:text-teal-400 hover:underline"
              >
                + Cabin Stay
              </button>
            </div>

            {propertyTasks.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Click &ldquo;Remind&rdquo; on any conservancy or cabin item to schedule it with reminders on your main calendar.
              </p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {propertyTasks.slice(0, 8).map((task) => (
                  <div key={task.id} className="py-2.5 first:pt-0 last:pb-0 flex items-start gap-2.5">
                    <button
                      type="button"
                      onClick={() => onToggleTaskComplete(task)}
                      aria-label={`Toggle ${task.title}`}
                      className={`mt-0.5 shrink-0 ${
                        task.status === 'completed'
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-slate-300 dark:text-slate-600 hover:text-teal-600'
                      }`}
                    >
                      <CheckCircle2 className="w-4 h-4" />
                    </button>
                    <div className="min-w-0 flex-1">
                      <p
                        className={`text-xs font-medium ${
                          task.status === 'completed'
                            ? 'line-through text-slate-400'
                            : 'text-slate-900 dark:text-slate-100'
                        }`}
                      >
                        {task.title}
                      </p>
                      <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                        Due {task.dueDate} · {task.priority}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Property Vault Documents ({propertyDocs.length})
            </h2>
            {propertyDocs.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Scan Hays County appraisals, septic service permits, well water tests, or cabin insurance policies in the OCR Vault under &ldquo;Wimberley Property&rdquo;.
              </p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {propertyDocs.slice(0, 6).map((doc) => (
                  <div key={doc.id} className="py-2.5 first:pt-0 last:pb-0 space-y-0.5">
                    <p className="text-xs font-medium text-slate-900 dark:text-slate-100">
                      {doc.title}
                    </p>
                    <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                      {doc.detectedDate || 'No date'} · {doc.tags.slice(0, 3).join(', ')}
                    </p>
                    {doc.summary && (
                      <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-2">
                        {doc.summary}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Add / Edit Property Entry Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 backdrop-blur-sm p-4">
          <form
            onSubmit={handleSaveForm}
            className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4 shadow-xl max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                {editingEntry ? 'Edit Wimberley Property Entry' : 'Log Wimberley Property Entry'}
              </h2>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  Property Area
                </label>
                <select
                  value={area}
                  onChange={(e) => {
                    const next = e.target.value as PropertyEntryArea;
                    setArea(next);
                    if (next === 'cabin_stay') setCadence('once');
                  }}
                  className="w-full min-h-[42px] px-3 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100"
                >
                  <option value="conservancy">Conservancy Stewardship</option>
                  <option value="cabin_maintenance">Rental Cabin Maintenance</option>
                  <option value="cabin_stay">Rental Cabin Stay / Turnover</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  Place
                </label>
                <select
                  value={place}
                  onChange={(e) => setPlace(e.target.value)}
                  className="w-full min-h-[42px] px-3 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100"
                >
                  <option value="">General — no place</option>
                  {PLACES.map((pl) => (
                    <option key={pl} value={pl}>
                      {pl}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  Status
                </label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as PropertyEntryStatus)}
                  className="w-full min-h-[42px] px-3 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100"
                >
                  {(Object.keys(STATUS_LABELS) as PropertyEntryStatus[]).map((st) => (
                    <option key={st} value={st}>
                      {STATUS_LABELS[st]}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                Title
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={
                  area === 'cabin_stay'
                    ? 'e.g., Weekend Family Booking — Rivera Party'
                    : area === 'conservancy'
                    ? 'e.g., Cistern Pump & Oak Canopy Walk'
                    : 'e.g., Aerobic Septic Inspection'
                }
                className="w-full min-h-[42px] px-3 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  {area === 'cabin_stay' ? 'Check-In Date' : 'Scheduled / Last Check Date'}
                </label>
                <input
                  type="date"
                  required
                  value={scheduledDate}
                  onChange={(e) => setScheduledDate(e.target.value)}
                  className="w-full min-h-[42px] px-3 text-sm font-mono bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100"
                />
              </div>

              {area === 'cabin_stay' ? (
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    Check-Out Date
                  </label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full min-h-[42px] px-3 text-sm font-mono bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100"
                  />
                </div>
              ) : (
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    Cadence
                  </label>
                  <select
                    value={cadence}
                    onChange={(e) => setCadence(e.target.value as PropertyCadence)}
                    className="w-full min-h-[42px] px-3 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100"
                  >
                    {(Object.keys(CADENCE_LABELS) as PropertyCadence[]).map((cad) => (
                      <option key={cad} value={cad}>
                        {CADENCE_LABELS[cad]}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  Kind of record
                </label>
                <select
                  value={recordKind}
                  onChange={(e) => setRecordKind(e.target.value as RecordKind)}
                  className="w-full min-h-[42px] px-3 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100"
                >
                  {(Object.keys(RECORD_KIND_LABELS) as RecordKind[])
                    .filter((k) => k !== 'calendar')
                    .map((k) => (
                      <option key={k} value={k}>
                        {RECORD_KIND_LABELS[k]}
                      </option>
                    ))}
                </select>
                {recordKind === 'custom' && (
                  <input
                    type="text"
                    value={customKindLabel}
                    onChange={(e) => setCustomKindLabel(e.target.value)}
                    placeholder="Name your kind — e.g., Official"
                    className="w-full min-h-[42px] px-3 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100"
                  />
                )}
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  {area === 'cabin_stay' ? 'Guest / Contact Name' : 'Caretaker / Vendor'}
                </label>
                <input
                  type="text"
                  value={inspectorOrGuest}
                  onChange={(e) => setInspectorOrGuest(e.target.value)}
                  placeholder={area === 'cabin_stay' ? 'Guest name or platform' : 'e.g., Hays Arborist'}
                  className="w-full min-h-[42px] px-3 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  Link OCR Vault Document
                </label>
                <select
                  value={linkedDocumentId}
                  onChange={(e) => setLinkedDocumentId(e.target.value)}
                  className="w-full min-h-[42px] px-3 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100"
                >
                  <option value="">None linked</option>
                  {documents.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.title}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                Field Notes / Turnover Instructions
              </label>
              <textarea
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Observations, well pressure readings, oak wilt seal notes, or cabin turnover checklist..."
                className="w-full p-3 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="min-h-[42px] px-4 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="min-h-[42px] px-5 text-sm font-medium text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-60 rounded-lg"
              >
                {saving ? 'Saving...' : editingEntry ? 'Save Changes' : 'Save Property Entry'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

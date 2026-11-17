import React, { useMemo, useState } from 'react';
import {
  Wallet,
  Plus,
  Search,
  Download,
  FileText,
  Pencil,
  Trash2,
  X,
  Layers,
} from 'lucide-react';
import {
  DEFAULT_EXPENDITURE_GROUPS,
  FinanceEntry,
  FinanceKind,
  PLACES,
  placeMatches,
  getFinanceArchiveCutoff,
  isArchivedFinanceEntry,
  ScannedDocument,
  getLocalTodayIso,
} from '../types';

interface FinancesViewProps {
  entries: FinanceEntry[];
  documents: ScannedDocument[];
  onCreateEntry: (
    payload: Omit<FinanceEntry, 'id' | 'userId' | 'createdAt' | 'updatedAt' | 'householdId' | 'memberIds'>
  ) => Promise<void>;
  onUpdateEntry: (entryId: string, updates: Partial<FinanceEntry>) => Promise<void>;
  onDeleteEntry: (entryId: string) => Promise<void>;
}


function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function getParentGroupName(groupName: string): string {
  const idx = groupName.indexOf(' - ');
  if (idx > 0) return groupName.slice(0, idx).trim();
  return groupName.trim();
}

function suggestGroupFromDoc(doc: ScannedDocument): string {
  const hay = `${doc.title} ${doc.category} ${doc.summary} ${doc.tags.join(' ')} ${doc.ocrText.slice(0, 600)}`.toLowerCase();
  if (/mom|mother|geriatric|medicare/.test(hay) && /medical|clinic|rx|pharmacy|doctor|hospital|lab|copay/.test(hay)) {
    return 'Medical - Mom';
  }
  if (/jason/.test(hay) && /medical|clinic|rx|pharmacy|doctor|hospital|lab|copay/.test(hay)) {
    return 'Medical - Jason';
  }
  if (/conservancy|oak wilt|cedar|wildlife|cistern|ag exemption|hays county/.test(hay)) {
    return 'Conservancy';
  }
  if (/cabin|airbnb|vrbo|rental|septic|turnover|guest/.test(hay)) {
    return 'Rental Upkeep';
  }
  if (/grocery|h-e-b|heb|whole foods|trader joe|costco|market/.test(hay)) {
    return 'Groceries';
  }
  if (/plumb|roof|hvac|electrical|repair|lumber|hardware|home depot|lowe/.test(hay)) {
    return 'Home Repairs';
  }
  if (doc.category === 'Tax & Finance') return 'Taxes & Insurance';
  if (doc.category === 'Car Maintenance') return 'Car & Maintenance';
  if (doc.category === 'Church & Faith' || doc.category === 'Community Service') {
    return 'Church & Community';
  }
  return 'General';
}

function extractAmountFromDoc(doc: ScannedDocument): number | null {
  const combined = `${doc.keyDetails.join(' ')} ${doc.ocrText}`;
  const match = combined.match(/\$\s?([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{2})?|[0-9]+(?:\.[0-9]{2})?)/);
  if (!match) return null;
  const parsed = Number(match[1].replace(/,/g, ''));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export const FinancesView: React.FC<FinancesViewProps> = ({
  entries,
  documents,
  onCreateEntry,
  onUpdateEntry,
  onDeleteEntry,
}) => {
  const [timeframe, setTimeframe] = useState<'month' | '90d' | 'year' | 'all'>('month');
  const [scopeFilter, setScopeFilter] = useState<string>('all');
  const [includeArchive, setIncludeArchive] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<string>('ALL');
  const [groupViewMode, setGroupViewMode] = useState<'exact' | 'rollup'>('exact');
  const [searchQuery, setSearchQuery] = useState('');

  // Modal composer state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<FinanceEntry | null>(null);
  const [kind, setKind] = useState<FinanceKind>('expense');
  const [groupPreset, setGroupPreset] = useState<string>('Groceries');
  const [customGroup, setCustomGroup] = useState('');
  const [title, setTitle] = useState('');
  const [amountStr, setAmountStr] = useState('');
  const [entryDate, setEntryDate] = useState(getLocalTodayIso());
  const [vendor, setVendor] = useState('');
  const [place, setPlace] = useState('');
  const [careForJason, setCareForJason] = useState(false);
  const [taxDeductible, setTaxDeductible] = useState(false);
  const [notes, setNotes] = useState('');
  const [linkedDocumentId, setLinkedDocumentId] = useState('');
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const knownGroups = useMemo(() => {
    const set = new Set<string>([...DEFAULT_EXPENDITURE_GROUPS]);
    entries.forEach((e) => {
      if (e.group) set.add(e.group);
    });
    return Array.from(set);
  }, [entries]);

  const periodFiltered = useMemo(() => {
    const today = getLocalTodayIso();
    const currentMonthPrefix = today.slice(0, 7);
    const currentYearPrefix = today.slice(0, 4);
    const nowMs = Date.now();
    const ninetyDaysAgo = new Date(nowMs - 90 * 86400000).toISOString().slice(0, 10);

    return entries.filter((e) => {
      if (scopeFilter === 'general') {
        if ((e.place || '') !== '') return false;
      } else if (scopeFilter !== 'all' && !placeMatches(e.place || '', scopeFilter)) {
        return false;
      }
      if (timeframe === 'month') return e.entryDate.startsWith(currentMonthPrefix);
      if (timeframe === '90d') return e.entryDate >= ninetyDaysAgo;
      if (timeframe === 'year') return e.entryDate.startsWith(currentYearPrefix);
      return true;
    });
  }, [entries, timeframe, scopeFilter]);

  // Retention: the working set is the active seven tax years. Archived
  // entries join only when the user deliberately includes the archive.
  const archiveCutoff = getFinanceArchiveCutoff(getLocalTodayIso());
  const archivedCount = useMemo(
    () =>
      periodFiltered.filter((e) => isArchivedFinanceEntry(e.entryDate, getLocalTodayIso()))
        .length,
    [periodFiltered]
  );
  const activeFiltered = useMemo(
    () =>
      includeArchive
        ? periodFiltered
        : periodFiltered.filter((e) => !isArchivedFinanceEntry(e.entryDate, getLocalTodayIso())),
    [periodFiltered, includeArchive]
  );

  const summary = useMemo(() => {
    let totalExpenses = 0;
    let totalIncome = 0;
    let totalDeductible = 0;
    for (const item of activeFiltered) {
      if (item.kind === 'income') {
        totalIncome += item.amount;
      } else {
        totalExpenses += item.amount;
        if (item.taxDeductible) totalDeductible += item.amount;
      }
    }
    return {
      totalExpenses,
      totalIncome,
      netCashflow: totalIncome - totalExpenses,
      totalDeductible,
    };
  }, [activeFiltered]);

  const groupBreakdown = useMemo(() => {
    const map = new Map<string, { name: string; total: number; count: number; deductible: number }>();
    for (const item of activeFiltered) {
      if (item.kind !== 'expense') continue;
      const key =
        groupViewMode === 'rollup' ? getParentGroupName(item.group) : item.group;
      const existing = map.get(key) || { name: key, total: 0, count: 0, deductible: 0 };
      existing.total += item.amount;
      existing.count += 1;
      if (item.taxDeductible) existing.deductible += item.amount;
      map.set(key, existing);
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [activeFiltered, groupViewMode]);

  const visibleLedger = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return activeFiltered
      .filter((item) => {
        if (selectedGroup !== 'ALL') {
          const itemGroupKey =
            groupViewMode === 'rollup' ? getParentGroupName(item.group) : item.group;
          if (itemGroupKey !== selectedGroup) return false;
        }
        if (!q) return true;
        const linked = documents.find((d) => d.id === item.linkedDocumentId);
        return `${item.title} ${item.group} ${item.vendor} ${item.notes} ${linked?.title || ''}`
          .toLowerCase()
          .includes(q);
      })
      .sort((a, b) => b.entryDate.localeCompare(a.entryDate));
  }, [activeFiltered, selectedGroup, groupViewMode, searchQuery, documents]);

  function openNewModal(defaultGroup = 'Groceries') {
    setEditingEntry(null);
    setKind(defaultGroup === 'Rental Income' ? 'income' : 'expense');
    setGroupPreset(defaultGroup);
    setCustomGroup('');
    setTitle('');
    setAmountStr('');
    setEntryDate(getLocalTodayIso());
    setVendor('');
    setPlace(
      defaultGroup === 'Conservancy'
        ? 'Riva Jade — Wildlife Conservancy'
        : defaultGroup === 'Rental Upkeep' || defaultGroup === 'Rental Income'
          ? 'Riva Jade — Rental Cabin'
          : ''
    );
    setCareForJason(false);
    setTaxDeductible(
      defaultGroup === 'Conservancy' ||
        defaultGroup === 'Rental Upkeep' ||
        defaultGroup.startsWith('Medical')
    );
    setNotes('');
    setLinkedDocumentId('');
    setModalOpen(true);
  }

  function openEditModal(entry: FinanceEntry) {
    setEditingEntry(entry);
    setKind(entry.kind);
    if (knownGroups.includes(entry.group)) {
      setGroupPreset(entry.group);
      setCustomGroup('');
    } else {
      setGroupPreset('__custom__');
      setCustomGroup(entry.group);
    }
    setTitle(entry.title);
    setAmountStr(String(entry.amount));
    setEntryDate(entry.entryDate);
    setVendor(entry.vendor);
    setPlace(entry.place || '');
    setCareForJason(entry.careForJason);
    setTaxDeductible(entry.taxDeductible);
    setNotes(entry.notes);
    setLinkedDocumentId(entry.linkedDocumentId);
    setModalOpen(true);
  }

  function handleDocLinkChange(docId: string) {
    setLinkedDocumentId(docId);
    const doc = documents.find((d) => d.id === docId);
    if (!doc) return;
    if (!title.trim()) setTitle(doc.title.slice(0, 200));
    if (!entryDate && doc.detectedDate && /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(doc.detectedDate)) {
      setEntryDate(doc.detectedDate);
    }
    if (!amountStr) {
      const detected = extractAmountFromDoc(doc);
      if (detected !== null) setAmountStr(detected.toFixed(2));
    }
    const suggested = suggestGroupFromDoc(doc);
    if (knownGroups.includes(suggested)) {
      setGroupPreset(suggested);
    }
  }

  async function handleSaveForm(e: React.FormEvent) {
    e.preventDefault();
    const resolvedGroup = (
      groupPreset === '__custom__' ? customGroup : groupPreset
    )
      .trim()
      .slice(0, 80);
    const amount = Number(amountStr);
    if (!title.trim() || !resolvedGroup || !Number.isFinite(amount) || amount < 0) return;

    setSaving(true);
    try {
      const payload = {
        kind,
        group: resolvedGroup,
        title: title.trim().slice(0, 200),
        amount: Math.min(10000000, Math.round(amount * 100) / 100),
        entryDate: entryDate || getLocalTodayIso(),
        vendor: vendor.trim().slice(0, 120),
        place,
        careForJason,
        taxDeductible,
        notes: notes.trim().slice(0, 2000),
        linkedDocumentId: linkedDocumentId || '',
      };

      if (editingEntry) {
        await onUpdateEntry(editingEntry.id, payload);
        setFeedback(`Updated "${payload.title}" (${payload.group}).`);
      } else {
        await onCreateEntry(payload);
        setFeedback(`Logged ${formatCurrency(payload.amount)} under ${payload.group}.`);
      }
      setModalOpen(false);
    } finally {
      setSaving(false);
    }
  }

  function handleExportCsv() {
    const header = ['Date', 'Kind', 'Group', 'Title', 'Amount', 'Vendor', 'Place', 'Tax Deductible', 'Notes'];
    const rows = visibleLedger.map((item) => [
      item.entryDate,
      item.kind,
      item.group,
      item.title,
      item.amount.toFixed(2),
      item.vendor,
      (item.place || 'General') + (item.careForJason ? " — Jason's care" : ''),
      item.taxDeductible ? 'Yes' : 'No',
      item.notes.replace(/\n/g, ' '),
    ]);
    const csv = [header, ...rows]
      .map((cols) => cols.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `steward-finances-${getLocalTodayIso()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Finances & Expenditure Groupings
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Track spending across Conservancy, Home Repairs, Rental Upkeep, Groceries, Medical - Mom, Medical - Jason, and custom categories.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={visibleLedger.length === 0}
            className="min-h-[44px] inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 rounded-lg transition-colors"
          >
            <Download className="w-4 h-4" />
            <span>Export CSV</span>
          </button>

          <button
            type="button"
            onClick={() => openNewModal(selectedGroup !== 'ALL' ? selectedGroup : 'Groceries')}
            className="min-h-[44px] inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Log Transaction</span>
          </button>
        </div>
      </div>

      {feedback && (
        <div className="p-3.5 rounded-xl border border-teal-200 dark:border-teal-800 bg-teal-50 dark:bg-teal-950/40 flex items-center justify-between gap-3 text-sm text-teal-800 dark:text-teal-300">
          <span>{feedback}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-teal-700 dark:text-teal-400 p-1"
            aria-label="Dismiss notification"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Filters Toolbar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1">
          {(
            [
              { id: 'month', label: 'This Month' },
              { id: '90d', label: 'Last 90 Days' },
              { id: 'year', label: 'This Year' },
              { id: 'all', label: 'All Time' },
            ] as const
          ).map((tf) => (
            <button
              key={tf.id}
              type="button"
              onClick={() => setTimeframe(tf.id)}
              className={`min-h-[38px] px-3 text-xs font-medium rounded-lg transition-colors ${
                timeframe === tf.id
                  ? 'bg-teal-700 text-white'
                  : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              {tf.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Filter by place"
            value={scopeFilter}
            onChange={(e) => setScopeFilter(e.target.value)}
            className="min-h-[40px] px-3 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-700 dark:text-slate-200"
          >
            <option value="all">All Places</option>
            <option value="general">General — no place</option>
            {PLACES.map((pl) => (
              <option key={pl} value={pl}>
                {pl}
              </option>
            ))}
          </select>

          <div className="relative flex-1 sm:w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search vendor, group, item..."
              className="w-full min-h-[40px] pl-9 pr-3 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100"
            />
          </div>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Total Expenditures
          </p>
          <p className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100 mt-1">
            {formatCurrency(summary.totalExpenses)}
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Income / Cabin Revenue
          </p>
          <p className="text-2xl font-bold font-mono tabular-nums text-emerald-700 dark:text-emerald-400 mt-1">
            {formatCurrency(summary.totalIncome)}
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Net Balance
          </p>
          <p
            className={`text-2xl font-bold font-mono tabular-nums mt-1 ${
              summary.netCashflow >= 0
                ? 'text-teal-700 dark:text-teal-400'
                : 'text-slate-900 dark:text-slate-100'
            }`}
          >
            {formatCurrency(summary.netCashflow)}
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Tax-Deductible / Medical & Land
          </p>
          <p className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100 mt-1">
            {formatCurrency(summary.totalDeductible)}
          </p>
        </div>
      </div>

      {/* Main Split: Expenditure Groupings vs Ledger */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Expenditure Groupings Breakdown */}
        <section className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-teal-700 dark:text-teal-400" />
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Expenditure Groupings
              </h2>
            </div>

            <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 p-0.5 text-[11px]">
              <button
                type="button"
                onClick={() => {
                  setGroupViewMode('exact');
                  setSelectedGroup('ALL');
                }}
                className={`px-2.5 py-1 rounded-md font-medium ${
                  groupViewMode === 'exact'
                    ? 'bg-teal-700 text-white'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                Exact
              </button>
              <button
                type="button"
                onClick={() => {
                  setGroupViewMode('rollup');
                  setSelectedGroup('ALL');
                }}
                className={`px-2.5 py-1 rounded-md font-medium ${
                  groupViewMode === 'rollup'
                    ? 'bg-teal-700 text-white'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                Rollup
              </button>
            </div>
          </div>

          <p className="text-xs text-slate-500 dark:text-slate-400">
            {groupViewMode === 'rollup'
              ? 'Sub-groups like "Medical - Mom" and "Medical - Jason" are combined under "Medical".'
              : 'Click any expenditure group below to filter transactions.'}
          </p>

          {groupBreakdown.length === 0 ? (
            <div className="py-8 text-center space-y-2">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                No expenses recorded for this period yet.
              </p>
              <button
                type="button"
                onClick={() => openNewModal('Conservancy')}
                className="text-xs font-medium text-teal-700 dark:text-teal-400 hover:underline"
              >
                + Log first expenditure
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {selectedGroup !== 'ALL' && (
                <button
                  type="button"
                  onClick={() => setSelectedGroup('ALL')}
                  className="text-xs font-medium text-teal-700 dark:text-teal-400 hover:underline"
                >
                  ← Show all groups ({groupBreakdown.length})
                </button>
              )}

              {groupBreakdown.map((grp) => {
                const pct =
                  summary.totalExpenses > 0
                    ? Math.round((grp.total / summary.totalExpenses) * 100)
                    : 0;
                const active = selectedGroup === grp.name;
                return (
                  <button
                    key={grp.name}
                    type="button"
                    onClick={() => setSelectedGroup(active ? 'ALL' : grp.name)}
                    className={`w-full text-left p-2.5 rounded-lg border transition-colors space-y-1.5 ${
                      active
                        ? 'border-teal-600 bg-teal-50/70 dark:bg-teal-950/40'
                        : 'border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                        {grp.name}
                      </span>
                      <span className="font-mono font-semibold tabular-nums text-slate-900 dark:text-slate-100 shrink-0">
                        {formatCurrency(grp.total)}
                      </span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                      <div
                        className="h-full bg-teal-600 dark:bg-teal-500 rounded-full"
                        style={{ width: `${Math.max(4, pct)}%` }}
                      />
                    </div>
                    <p className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                      {pct}% of spend · {grp.count} {grp.count === 1 ? 'entry' : 'entries'}
                      {grp.deductible > 0 ? ` · ${formatCurrency(grp.deductible)} deductible` : ''}
                    </p>
                  </button>
                );
              })}
            </div>
          )}

          {/* Quick-Add Preset Buttons */}
          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Quick Log by Category
            </p>
            <div className="flex flex-wrap gap-1.5">
              {[
                'Conservancy',
                'Home Repairs',
                'Rental Upkeep',
                'Groceries',
                'Medical - Mom',
                'Medical - Jason',
              ].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => openNewModal(preset)}
                  className="min-h-[34px] px-2.5 text-xs font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-teal-50 dark:hover:bg-teal-950/50 hover:text-teal-800 dark:hover:text-teal-300 rounded-lg transition-colors"
                >
                  + {preset}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Transaction Ledger */}
        <section className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Wallet className="w-4 h-4 text-teal-700 dark:text-teal-400" />
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {selectedGroup === 'ALL' ? 'Transaction Ledger' : `${selectedGroup} Ledger`} ({visibleLedger.length})
              </h2>
            </div>
          </div>

          {archivedCount > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-2">
              <p className="text-xs text-slate-600 dark:text-slate-300">
                Archive: {archivedCount} record{archivedCount === 1 ? '' : 's'} older than the
                seven-year window (before Jan 1, {archiveCutoff.slice(0, 4)}). Kept for good —
                just not counted in totals or exports unless you include them.
              </p>
              <button
                type="button"
                onClick={() => setIncludeArchive((v) => !v)}
                className="min-h-[34px] px-3 text-xs font-medium text-teal-800 dark:text-teal-300 border border-teal-700/40 dark:border-teal-500/40 rounded-lg"
              >
                {includeArchive ? 'Leave the archive out' : 'Include the archive'}
              </button>
            </div>
          )}

          {visibleLedger.length === 0 ? (
            <div className="py-12 text-center space-y-3">
              <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                No matching financial entries
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                Log expenses manually or link a scanned receipt from your OCR Document Vault to track medical bills, groceries, home repairs, rental upkeep, and conservancy spending.
              </p>
              <button
                type="button"
                onClick={() => openNewModal('Groceries')}
                className="min-h-[42px] px-4 text-xs font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg"
              >
                + Log First Transaction
              </button>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {visibleLedger.map((item) => {
                const linkedDoc = documents.find((d) => d.id === item.linkedDocumentId);
                return (
                  <div
                    key={item.id}
                    className="py-3.5 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-start justify-between gap-3"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                          {item.title}
                        </h3>
                      </div>
                      <p className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                        {item.entryDate} · {item.group}
                        {item.vendor ? ` · ${item.vendor}` : ''}
                        {' · '}
                        {item.place || 'General'}
                        {item.careForJason ? " · Jason's care" : ''}
                        {item.taxDeductible ? ' · Tax Deductible' : ''}
                      </p>
                      {item.notes && (
                        <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                          {item.notes}
                        </p>
                      )}
                      {linkedDoc && (
                        <p className="text-xs text-teal-700 dark:text-teal-400 inline-flex items-center gap-1.5">
                          <FileText className="w-3.5 h-3.5" />
                          <span>Receipt: {linkedDoc.title}</span>
                        </p>
                      )}
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0">
                      <span
                        className={`text-sm font-bold font-mono tabular-nums ${
                          item.kind === 'income'
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : 'text-slate-900 dark:text-slate-100'
                        }`}
                      >
                        {item.kind === 'income' ? '+' : '-'}
                        {formatCurrency(item.amount)}
                      </span>

                      <button
                        type="button"
                        onClick={() => openEditModal(item)}
                        aria-label="Edit transaction"
                        className="min-h-[38px] min-w-[38px] flex items-center justify-center text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={() => onDeleteEntry(item.id)}
                        aria-label="Delete transaction"
                        className="min-h-[38px] min-w-[38px] flex items-center justify-center text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/40"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* Add / Edit Transaction Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 backdrop-blur-sm p-4">
          <form
            onSubmit={handleSaveForm}
            className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4 shadow-xl max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                {editingEntry ? 'Edit Financial Entry' : 'Log Financial Entry'}
              </h2>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {documents.length > 0 && (
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  Link Scanned Receipt / Invoice (auto-fills details if blank)
                </label>
                <select
                  value={linkedDocumentId}
                  onChange={(e) => handleDocLinkChange(e.target.value)}
                  className="w-full min-h-[42px] px-3 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100"
                >
                  <option value="">No linked document</option>
                  {documents.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.title} ({d.detectedDate || d.category})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  Type
                </label>
                <select
                  value={kind}
                  onChange={(e) => setKind(e.target.value as FinanceKind)}
                  className="w-full min-h-[42px] px-3 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100"
                >
                  <option value="expense">Expenditure</option>
                  <option value="income">Income / Rental Payout</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  Expenditure / Finance Group
                </label>
                <select
                  value={groupPreset}
                  onChange={(e) => {
                    const val = e.target.value;
                    setGroupPreset(val);
                    if (val === 'Conservancy') setPlace('Riva Jade — Wildlife Conservancy');
                    else if (val === 'Rental Upkeep' || val === 'Rental Income') {
                      setPlace('Riva Jade — Rental Cabin');
                    }
                  }}
                  className="w-full min-h-[42px] px-3 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100"
                >
                  {knownGroups.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                  <option value="__custom__">+ Custom Group Name...</option>
                </select>
              </div>
            </div>

            {groupPreset === '__custom__' && (
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  Custom Group Name (e.g., Medical - Dad, Wimberley Well)
                </label>
                <input
                  type="text"
                  required
                  value={customGroup}
                  onChange={(e) => setCustomGroup(e.target.value)}
                  placeholder="Enter custom category group"
                  className="w-full min-h-[42px] px-3 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100"
                />
              </div>
            )}

            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                Description / Item
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Cardiology Copay, Oak Wilt Sealing Paint, Weekly Groceries"
                className="w-full min-h-[42px] px-3 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  Amount (USD)
                </label>
                <input
                  type="number"
                  required
                  min="0"
                  step="0.01"
                  value={amountStr}
                  onChange={(e) => setAmountStr(e.target.value)}
                  placeholder="0.00"
                  className="w-full min-h-[42px] px-3 text-sm font-mono bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  Date
                </label>
                <input
                  type="date"
                  required
                  value={entryDate}
                  onChange={(e) => setEntryDate(e.target.value)}
                  className="w-full min-h-[42px] px-3 text-sm font-mono bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  Vendor / Provider
                </label>
                <input
                  type="text"
                  value={vendor}
                  onChange={(e) => setVendor(e.target.value)}
                  placeholder="e.g., H-E-B, Seton Clinic, Lowe's"
                  className="w-full min-h-[42px] px-3 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100"
                />
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
            </div>

            <label className="flex items-center gap-2.5 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer pt-1">
              <input
                type="checkbox"
                checked={taxDeductible}
                onChange={(e) => setTaxDeductible(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-teal-700 focus:ring-teal-600"
              />
              <span>Flag as Tax-Deductible / Medical HSA / Conservancy / Rental Expense</span>
            </label>

            <label className="flex items-center gap-2.5 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={careForJason}
                onChange={(e) => setCareForJason(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-teal-700 focus:ring-teal-600"
              />
              <span>For Jason's care — money spent taking care of Jason</span>
            </label>

            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                Notes
              </label>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Reimbursement notes, warranty info, claim number..."
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
                {saving ? 'Saving...' : editingEntry ? 'Save Changes' : 'Save Entry'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

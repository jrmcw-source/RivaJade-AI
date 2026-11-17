import React, { useMemo } from 'react';
import {
  CheckCircle2,
  Clock,
  AlertTriangle,
  FileText,
  Users,
  Bell,
} from 'lucide-react';
import {
  CATEGORIES,
  ProjectTask,
  ScannedDocument,
  ScheduleTask,
  SharedProject,
  formatReminderLabel,
  getLocalTodayIso,
} from '../types';

interface AnalyticsDashboardViewProps {
  tasks: ScheduleTask[];
  documents: ScannedDocument[];
  projects: SharedProject[];
  sharedTasks: Array<ProjectTask & { projectName: string }>;
  onNavigate: (tab: 'schedule' | 'vault' | 'projects' | 'voice') => void;
}

export const AnalyticsDashboardView: React.FC<AnalyticsDashboardViewProps> = ({
  tasks,
  documents,
  projects,
  sharedTasks,
  onNavigate,
}) => {
  const todayIso = getLocalTodayIso();

  const stats = useMemo(() => {
    const totalPersonal = tasks.length;
    const completedPersonal = tasks.filter((t) => t.status === 'completed').length;
    const pendingPersonal = tasks.filter((t) => t.status === 'pending').length;
    const overduePersonal = tasks.filter(
      (t) => t.status === 'pending' && t.dueDate < todayIso
    ).length;

    const totalShared = sharedTasks.length;
    const completedShared = sharedTasks.filter((t) => t.status === 'completed').length;

    const combinedTotal = totalPersonal + totalShared;
    const combinedCompleted = completedPersonal + completedShared;
    const completionRate =
      combinedTotal > 0 ? Math.round((combinedCompleted / combinedTotal) * 100) : 0;

    // 7-day completion / activity buckets
    const days: Array<{ iso: string; label: string; completed: number; scheduled: number }> = [];
    for (let offset = -6; offset <= 0; offset++) {
      const d = new Date();
      d.setDate(d.getDate() + offset);
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
        d.getDate()
      ).padStart(2, '0')}`;
      const label = d.toLocaleDateString(undefined, { weekday: 'short' });
      const completed = tasks.filter(
        (t) => t.status === 'completed' && (t.completedAtIso.startsWith(iso) || t.dueDate === iso)
      ).length;
      const scheduled = tasks.filter((t) => t.dueDate === iso).length;
      days.push({ iso, label, completed, scheduled });
    }

    // Category breakdown
    const categoryBreakdown = CATEGORIES.map((cat) => {
      const catTasks = tasks.filter((t) => t.category === cat);
      const done = catTasks.filter((t) => t.status === 'completed').length;
      return {
        category: cat,
        total: catTasks.length,
        completed: done,
        pct: catTasks.length > 0 ? Math.round((done / catTasks.length) * 100) : 0,
      };
    }).filter((c) => c.total > 0);

    const upcoming = tasks
      .filter((t) => t.status === 'pending')
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
      .slice(0, 6);

    return {
      totalPersonal,
      completedPersonal,
      pendingPersonal,
      overduePersonal,
      totalShared,
      completedShared,
      completionRate,
      days,
      categoryBreakdown,
      upcoming,
    };
  }, [tasks, sharedTasks, todayIso]);

  const maxBar = Math.max(1, ...stats.days.map((d) => Math.max(d.completed, d.scheduled)));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Progress Analytics Dashboard
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Private, encrypted cloud-synced overview of your schedule adherence, category completion, shared team tasks, and OCR vault.
          </p>
        </div>
      </div>

      {/* KPI Summary Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-1">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
            <span>Overall Completion</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <p className="text-3xl font-bold text-slate-900 dark:text-slate-100 tabular-nums">
            {stats.completionRate}%
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            {stats.completedPersonal + stats.completedShared} of{' '}
            {stats.totalPersonal + stats.totalShared} completed
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-1">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
            <span>Pending & Overdue</span>
            {stats.overduePersonal > 0 ? (
              <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400" />
            ) : (
              <Clock className="w-4 h-4 text-teal-700 dark:text-teal-400" />
            )}
          </div>
          <p className="text-3xl font-bold text-slate-900 dark:text-slate-100 tabular-nums">
            {stats.pendingPersonal}
          </p>
          <p
            className={`text-xs tabular-nums ${
              stats.overduePersonal > 0
                ? 'text-red-600 dark:text-red-400 font-medium'
                : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            {stats.overduePersonal} overdue items
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-1">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
            <span>OCR Vault Records</span>
            <FileText className="w-4 h-4 text-teal-700 dark:text-teal-400" />
          </div>
          <p className="text-3xl font-bold text-slate-900 dark:text-slate-100 tabular-nums">
            {documents.length}
          </p>
          <button
            type="button"
            onClick={() => onNavigate('vault')}
            className="text-xs font-medium text-teal-700 dark:text-teal-400 hover:underline"
          >
            Search filed scans →
          </button>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-1">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
            <span>Shared Group Tasks</span>
            <Users className="w-4 h-4 text-teal-700 dark:text-teal-400" />
          </div>
          <p className="text-3xl font-bold text-slate-900 dark:text-slate-100 tabular-nums">
            {stats.completedShared}/{stats.totalShared}
          </p>
          <button
            type="button"
            onClick={() => onNavigate('projects')}
            className="text-xs font-medium text-teal-700 dark:text-teal-400 hover:underline"
          >
            {projects.length} shared project{projects.length === 1 ? '' : 's'} →
          </button>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* 7-Day Activity Velocity */}
        <div className="lg:col-span-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              7-Day Completion Velocity
            </h2>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Completed vs Scheduled
            </span>
          </div>

          <div className="grid grid-cols-7 gap-2 items-end h-44 pt-4">
            {stats.days.map((d) => {
              const schedPct = Math.round((d.scheduled / maxBar) * 100);
              const compPct = Math.round((d.completed / maxBar) * 100);
              return (
                <div key={d.iso} className="flex flex-col items-center h-full justify-end gap-2">
                  <div className="w-full flex items-end justify-center gap-1 h-32">
                    <div
                      title={`Scheduled: ${d.scheduled}`}
                      style={{ height: `${Math.max(8, schedPct)}%` }}
                      className="w-3 bg-slate-200 dark:bg-slate-700 rounded-t"
                    />
                    <div
                      title={`Completed: ${d.completed}`}
                      style={{ height: `${Math.max(8, compPct)}%` }}
                      className="w-3 bg-teal-700 dark:bg-teal-500 rounded-t"
                    />
                  </div>
                  <div className="text-center">
                    <p className="text-xs font-medium text-slate-700 dark:text-slate-300">
                      {d.label}
                    </p>
                    <p className="text-[11px] font-mono text-slate-400 tabular-nums">
                      {d.completed}/{d.scheduled}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Category Breakdown */}
        <div className="lg:col-span-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Progress by Life Category
          </h2>

          {stats.categoryBreakdown.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400 py-8 text-center">
              Add tasks across Taxes, Car Maintenance, Church, Community, or Hobbies to see category completion analytics.
            </p>
          ) : (
            <div className="space-y-3">
              {stats.categoryBreakdown.map((item) => (
                <div key={item.category} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-800 dark:text-slate-200">
                      {item.category}
                    </span>
                    <span className="font-mono text-slate-500 dark:text-slate-400 tabular-nums">
                      {item.completed}/{item.total} ({item.pct}%)
                    </span>
                  </div>
                  <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div
                      style={{ width: `${item.pct}%` }}
                      className="h-full bg-teal-700 dark:bg-teal-500 rounded-full transition-all"
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Upcoming Deadlines & Reminder Timeline */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-teal-700 dark:text-teal-400" />
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Upcoming Reminder Timeline
            </h2>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('schedule')}
            className="text-xs font-medium text-teal-700 dark:text-teal-400 hover:underline"
          >
            Open Full Schedule →
          </button>
        </div>

        {stats.upcoming.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            All scheduled tasks are complete.
          </p>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {stats.upcoming.map((task) => {
              const isOverdue = task.dueDate < todayIso;
              return (
                <div
                  key={task.id}
                  className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-sm"
                >
                  <div>
                    <p className="font-medium text-slate-900 dark:text-slate-100">
                      {task.title}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {task.category} · Reminder: {formatReminderLabel(task.reminderMinutes)}
                    </p>
                  </div>
                  <span
                    className={`font-mono text-xs tabular-nums ${
                      isOverdue
                        ? 'text-red-600 dark:text-red-400 font-semibold'
                        : 'text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {isOverdue ? `Overdue (${task.dueDate})` : task.dueDate}
                    {task.dueTime ? ` · ${task.dueTime}` : ''}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

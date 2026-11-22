import React, { useMemo, useState } from 'react';
import {
  Users,
  Plus,
  UserPlus,
  CheckCircle2,
  Circle,
  Mail,
  Trash2,
  Check,
  X,
  BellRing,
} from 'lucide-react';
import {
  AppNotification,
  CATEGORIES,
  Category,
  ProjectInvite,
  ProjectMember,
  ProjectTask,
  SharedProject,
  TaskPriority,
  UserProfile,
  getLocalTodayIso,
} from '../types';

interface CollaborativeProjectsViewProps {
  currentUserId: string;
  userProfile: UserProfile | null;
  projects: SharedProject[];
  selectedProjectId: string | null;
  onSelectProject: (projectId: string) => void;
  projectMembers: ProjectMember[];
  projectTasks: ProjectTask[];
  incomingInvites: ProjectInvite[];
  notifications: AppNotification[];
  onCreateProject: (name: string, description: string, category: Category) => Promise<void>;
  onInviteUser: (project: SharedProject, targetInput: string) => Promise<string>;
  onRespondInvite: (invite: ProjectInvite, accept: boolean) => Promise<void>;
  onCreateProjectTask: (
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
  ) => Promise<void>;
  onToggleProjectTask: (project: SharedProject, task: ProjectTask) => Promise<void>;
  onDeleteProjectTask: (projectId: string, taskId: string) => Promise<void>;
  onMarkNotificationRead: (notificationId: string) => Promise<void>;
}

export const CollaborativeProjectsView: React.FC<CollaborativeProjectsViewProps> = ({
  currentUserId,
  projects,
  selectedProjectId,
  onSelectProject,
  projectMembers,
  projectTasks,
  incomingInvites,
  notifications,
  onCreateProject,
  onInviteUser,
  onRespondInvite,
  onCreateProjectTask,
  onToggleProjectTask,
  onDeleteProjectTask,
  onMarkNotificationRead,
}) => {
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [projName, setProjName] = useState('');
  const [projDesc, setProjDesc] = useState('');
  const [projCat, setProjCat] = useState<Category>('Household');
  const [creatingProj, setCreatingProj] = useState(false);

  const [inviteInput, setInviteInput] = useState('');
  const [inviteStatus, setInviteStatus] = useState<string | null>(null);
  const [sendingInvite, setSendingInvite] = useState(false);

  const [taskTitle, setTaskTitle] = useState('');
  const [taskAssigneeId, setTaskAssigneeId] = useState('');
  const [taskDueDate, setTaskDueDate] = useState(getLocalTodayIso());
  const [taskEstMins, setTaskEstMins] = useState(30);
  const [taskPriority, setTaskPriority] = useState<TaskPriority>('medium');
  const [taskNotes, setTaskNotes] = useState('');
  const [addingTask, setAddingTask] = useState(false);

  const activeProject = useMemo(
    () => projects.find((p) => p.projectId === selectedProjectId) || projects[0] || null,
    [projects, selectedProjectId]
  );

  const completedCount = projectTasks.filter((t) => t.status === 'completed').length;
  const unreadNotifications = notifications.filter((n) => !n.read);

  async function handleCreateProjectSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!projName.trim()) return;
    setCreatingProj(true);
    try {
      await onCreateProject(projName.trim(), projDesc.trim(), projCat);
      setProjName('');
      setProjDesc('');
      setNewProjectOpen(false);
    } finally {
      setCreatingProj(false);
    }
  }

  async function handleInviteSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!activeProject || !inviteInput.trim()) return;
    setSendingInvite(true);
    setInviteStatus(null);
    try {
      const msg = await onInviteUser(activeProject, inviteInput.trim());
      setInviteStatus(msg);
      setInviteInput('');
    } catch (err) {
      setInviteStatus(err instanceof Error ? err.message : 'Unable to send invite.');
    } finally {
      setSendingInvite(false);
    }
  }

  async function handleCreateTaskSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!activeProject || !taskTitle.trim()) return;
    const chosenId = taskAssigneeId || currentUserId;
    const chosenMember = projectMembers.find((m) => m.userId === chosenId);
    setAddingTask(true);
    try {
      await onCreateProjectTask(activeProject, {
        title: taskTitle.trim(),
        assigneeId: chosenId,
        assigneeName: chosenMember?.displayName || 'Team Member',
        dueDate: taskDueDate,
        estimatedMinutes: Number(taskEstMins) || 30,
        priority: taskPriority,
        notes: taskNotes.trim(),
      });
      setTaskTitle('');
      setTaskNotes('');
    } finally {
      setAddingTask(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Shared Projects & Group Tasks
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Create shared lists for family, church committees, or community groups, invite collaborators by email or username, assign tasks, and track completion alerts.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setNewProjectOpen(true)}
          className="min-h-[44px] inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors self-start sm:self-auto whitespace-nowrap shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>New Shared Project</span>
        </button>
      </div>

      {/* Pending Invitations Banner */}
      {incomingInvites.length > 0 && (
        <div className="bg-white dark:bg-slate-900 border border-teal-300 dark:border-teal-800 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
            <Mail className="w-4 h-4 text-teal-700 dark:text-teal-400" />
            <span>Pending Project Invitations ({incomingInvites.length})</span>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {incomingInvites.map((inv) => (
              <div
                key={inv.id}
                className="py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="text-sm">
                  <span className="font-medium text-slate-900 dark:text-slate-100">
                    {inv.projectName}
                  </span>{' '}
                  <span className="text-slate-500 dark:text-slate-400">
                    · Invited by {inv.inviterName}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onRespondInvite(inv, true)}
                    className="min-h-[40px] inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Accept</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onRespondInvite(inv, false)}
                    className="min-h-[40px] inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>Decline</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Group Activity Notifications */}
      {notifications.length > 0 && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
              <BellRing className="w-4 h-4 text-teal-700 dark:text-teal-400" />
              <span>
                Group Activity Alerts ({unreadNotifications.length} unread)
              </span>
            </div>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-48 overflow-y-auto">
            {notifications.slice(0, 8).map((notif) => (
              <div
                key={notif.id}
                className="py-2 flex items-center justify-between gap-3 text-sm"
              >
                <div className="min-w-0">
                  <p
                    className={
                      notif.read
                        ? 'text-slate-500 dark:text-slate-400'
                        : 'font-medium text-slate-900 dark:text-slate-100'
                    }
                  >
                    {notif.message}
                  </p>
                  <p className="text-xs text-slate-400 dark:text-slate-500">
                    {notif.projectName} · {notif.actorName}
                  </p>
                </div>
                {!notif.read && (
                  <button
                    type="button"
                    onClick={() => onMarkNotificationRead(notif.id)}
                    className="min-h-[34px] px-2.5 text-xs font-medium text-teal-700 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-950/40 rounded-md shrink-0"
                  >
                    Mark Read
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main Split: Project List + Active Project Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl divide-y divide-slate-200 dark:divide-slate-800">
          <div className="p-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Your Shared Lists ({projects.length})
            </h2>
          </div>

          {projects.length === 0 ? (
            <div className="p-6 text-center space-y-3">
              <Users className="w-7 h-7 text-slate-400 mx-auto" />
              <p className="text-sm text-slate-600 dark:text-slate-400">
                No shared projects yet. Create one to coordinate household chores, church events, or community drives.
              </p>
            </div>
          ) : (
            projects.map((proj) => {
              const isSelected = activeProject?.projectId === proj.projectId;
              return (
                <button
                  key={proj.projectId}
                  type="button"
                  onClick={() => onSelectProject(proj.projectId)}
                  className={`w-full text-left p-4 transition-colors ${
                    isSelected
                      ? 'bg-teal-50/70 dark:bg-teal-950/30'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                  }`}
                >
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {proj.name}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
                    {proj.category} · {proj.participantIds.length} member
                    {proj.participantIds.length === 1 ? '' : 's'}
                  </p>
                </button>
              );
            })
          )}
        </div>

        {/* Active Project Workspace */}
        <div className="lg:col-span-8 space-y-5">
          {activeProject ? (
            <>
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-4">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                      {activeProject.name}
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
                      {activeProject.category} · Owner: {activeProject.ownerName} · {completedCount}/
                      {projectTasks.length} completed
                    </p>
                    {activeProject.description && (
                      <p className="text-sm text-slate-600 dark:text-slate-300 mt-2">
                        {activeProject.description}
                      </p>
                    )}
                  </div>
                </div>

                {/* Members & Invite Form */}
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600 dark:text-slate-300">
                    <span className="font-semibold text-slate-900 dark:text-slate-100">
                      Members:
                    </span>
                    {projectMembers.map((m) => (
                      <span key={m.userId}>
                        {m.displayName} (@{m.username}
                        {m.role === 'owner' ? ', owner' : ''})
                      </span>
                    ))}
                  </div>

                  <form onSubmit={handleInviteSubmit} className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="text"
                      value={inviteInput}
                      onChange={(e) => setInviteInput(e.target.value)}
                      placeholder="Invite by email (e.g., alex@gmail.com) or username (@alex_m)"
                      className="flex-1 min-h-[44px] px-3.5 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100"
                    />
                    <button
                      type="submit"
                      disabled={sendingInvite}
                      className="min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap shrink-0"
                    >
                      <UserPlus className="w-4 h-4" />
                      <span>{sendingInvite ? 'Inviting...' : 'Send Invite'}</span>
                    </button>
                  </form>
                  {inviteStatus && (
                    <p className="text-xs text-teal-700 dark:text-teal-400">{inviteStatus}</p>
                  )}
                </div>
              </div>

              {/* Assign New Shared Task */}
              <form
                onSubmit={handleCreateTaskSubmit}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3"
              >
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Assign Task to Group Member
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input
                    type="text"
                    required
                    value={taskTitle}
                    onChange={(e) => setTaskTitle(e.target.value)}
                    placeholder="Task description (e.g., Bring chairs for church social)"
                    className="sm:col-span-2 min-h-[44px] px-3.5 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100"
                  />
                  <select
                    aria-label="Assign to member"
                    value={taskAssigneeId || currentUserId}
                    onChange={(e) => setTaskAssigneeId(e.target.value)}
                    className="min-h-[44px] px-3 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100"
                  >
                    {projectMembers.map((m) => (
                      <option key={m.userId} value={m.userId}>
                        Assign to: {m.displayName} (@{m.username})
                      </option>
                    ))}
                  </select>
                  <div className="grid grid-cols-3 gap-2">
                    <input
                      type="date"
                      value={taskDueDate}
                      onChange={(e) => setTaskDueDate(e.target.value)}
                      className="col-span-2 min-h-[44px] px-2.5 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100"
                    />
                    <select
                      aria-label="Task priority"
                      value={taskPriority}
                      onChange={(e) => setTaskPriority(e.target.value as TaskPriority)}
                      className="min-h-[44px] px-2 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100"
                    >
                      <option value="low">Low</option>
                      <option value="medium">Med</option>
                      <option value="high">High</option>
                    </select>
                  </div>
                </div>
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
                    <span>Est. minutes:</span>
                    <input
                      type="number"
                      min={5}
                      max={1440}
                      step={5}
                      value={taskEstMins}
                      onChange={(e) => setTaskEstMins(Number(e.target.value))}
                      className="w-20 min-h-[38px] px-2.5 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100"
                    />
                    <input
                      type="text"
                      value={taskNotes}
                      onChange={(e) => setTaskNotes(e.target.value)}
                      placeholder="Optional note..."
                      className="flex-1 min-h-[38px] px-3 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={addingTask}
                    className="min-h-[44px] px-4 py-2 text-sm font-medium text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap shrink-0"
                  >
                    {addingTask ? 'Assigning...' : 'Assign Task'}
                  </button>
                </div>
              </form>

              {/* Assigned Tasks List */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl divide-y divide-slate-200 dark:divide-slate-800">
                {projectTasks.length === 0 ? (
                  <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
                    No tasks in this shared project yet. Assign the first task above.
                  </div>
                ) : (
                  projectTasks.map((pt) => (
                    <div key={pt.id} className="p-4 flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0">
                        <button
                          type="button"
                          onClick={() => onToggleProjectTask(activeProject, pt)}
                          aria-label={pt.status === 'completed' ? 'Reopen task' : 'Complete task'}
                          className="min-h-[44px] min-w-[44px] -ml-2 -mt-2 flex items-center justify-center rounded-lg text-slate-500 hover:text-teal-700 shrink-0"
                        >
                          {pt.status === 'completed' ? (
                            <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                          ) : (
                            <Circle className="w-5 h-5" />
                          )}
                        </button>
                        <div className="min-w-0">
                          <p
                            className={`text-sm font-medium ${
                              pt.status === 'completed'
                                ? 'line-through text-slate-400 dark:text-slate-500'
                                : 'text-slate-900 dark:text-slate-100'
                            }`}
                          >
                            {pt.title}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
                            Assigned to {pt.assigneeName} · Due {pt.dueDate} · {pt.estimatedMinutes}m ·{' '}
                            {pt.priority} priority
                            {pt.status === 'completed' && pt.completedBy
                              ? ` · Completed by ${pt.completedBy}`
                              : ''}
                          </p>
                          {pt.notes && (
                            <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">
                              {pt.notes}
                            </p>
                          )}
                        </div>
                      </div>

                      {(pt.projectOwnerId === currentUserId || pt.createdBy === currentUserId) && (
                        <button
                          type="button"
                          onClick={() => onDeleteProjectTask(activeProject.projectId, pt.id)}
                          aria-label="Delete project task"
                          className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>
            </>
          ) : (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-10 text-center space-y-3">
              <p className="text-base font-medium text-slate-900 dark:text-slate-100">
                Select or create a shared project
              </p>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Collaborate with family members, volunteer teams, or committee organizers in real time.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Create Shared Project Modal */}
      {newProjectOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 backdrop-blur-sm p-4">
          <form
            onSubmit={handleCreateProjectSubmit}
            className="w-full max-w-md max-h-[92vh] overflow-y-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4 shadow-xl"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                New Shared Project
              </h2>
              <button
                type="button"
                onClick={() => setNewProjectOpen(false)}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                Project / Group Name
              </label>
              <input
                type="text"
                required
                value={projName}
                onChange={(e) => setProjName(e.target.value)}
                placeholder="e.g., Household Maintenance, Church Fall Picnic"
                className="w-full min-h-[44px] px-3.5 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                Category
              </label>
              <select
                value={projCat}
                onChange={(e) => setProjCat(e.target.value as Category)}
                className="w-full min-h-[44px] px-3 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                Description
              </label>
              <textarea
                rows={3}
                value={projDesc}
                onChange={(e) => setProjDesc(e.target.value)}
                placeholder="What is this shared group coordinating?"
                className="w-full p-3 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setNewProjectOpen(false)}
                className="min-h-[44px] px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={creatingProj}
                className="min-h-[44px] px-5 py-2 text-sm font-medium text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-60 rounded-lg"
              >
                {creatingProj ? 'Creating...' : 'Create Project'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

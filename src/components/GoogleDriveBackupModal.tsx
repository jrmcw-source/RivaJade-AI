import React, { useEffect, useState } from 'react';
import {
  HardDrive,
  UploadCloud,
  RefreshCw,
  Trash2,
  ExternalLink,
  DownloadCloud,
  CheckCircle2,
  AlertTriangle,
  X,
} from 'lucide-react';
import {
  AccountRecord,
  Credential,
  DirectoryEntry,
  Circle,
  CircleBriefing,
  Family,
  FinanceEntry,
  Household,
  HouseholdMember,
  JasonNote,
  MailBriefing,
  MorningBriefing,
  PropertyEntry,
  ScannedDocument,
  ScheduleTask,
  VoiceMemory,
  getLocalTodayIso,
  EmergencySheet,
} from '../types';
import {
  clearDriveAccessToken,
  connectGoogleDrive,
  subscribeDriveAccessToken,
} from '../firebase';
import {
  DriveBackupFile,
  WorkspaceBackupSnapshot,
  buildFinancesCsvBackup,
  buildOcrVaultMarkdownBackup,
  buildWimberleyMarkdownBackup,
  buildWorkspaceJsonBackup,
  createDriveBackupFile,
  deleteDriveBackupFile,
  downloadDriveBackupContent,
  ensureStewardBackupFolder,
  ensureStewardSubfolder,
  uploadDriveBinaryFile,
  listDriveBackups,
  overwriteDriveBackupFile,
  ensureStewardPhotosFolder,
  downloadDriveFileBlob,
} from '../services/googleDriveBackup';

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

interface GoogleDriveBackupModalProps {
  open: boolean;
  onClose: () => void;
  tasks: ScheduleTask[];
  documents: ScannedDocument[];
  propertyEntries: PropertyEntry[];
  financeEntries: FinanceEntry[];
  voiceMemories: VoiceMemory[];
  // Backup everything (Jason, 2026-11-21): the whole desk rides
  // along in the workspace snapshot — structure and all.
  households?: Household[];
  householdMembers?: HouseholdMember[];
  families?: Family[];
  circles?: Circle[];
  jasonNotes?: JasonNote[];
  briefings?: MorningBriefing[];
  mailBriefings?: MailBriefing[];
  circleBriefings?: CircleBriefing[];
  accountRecords?: AccountRecord[];
  credentials?: Credential[];
  directoryEntries?: DirectoryEntry[];
  emergencySheets?: EmergencySheet[];
  // The family head's chosen root folder, when it is not the
  // desk's own (Jason, 2026-11-21): backups live under it.
  storageRootParentId?: string;
  onRestoreSnapshot: (snapshot: WorkspaceBackupSnapshot) => Promise<{ importedCount: number }>;
  onLinkDocumentPhoto?: (docId: string, driveFileId: string) => Promise<void>;
}

type BackupKind = 'workspace_json' | 'finances_csv' | 'wimberley_md' | 'ocr_md';

type ConfirmDialogState =
  | {
      action: 'delete';
      file: DriveBackupFile;
    }
  | {
      action: 'overwrite';
      file: DriveBackupFile;
      kind: BackupKind;
    }
  | {
      action: 'restore';
      file: DriveBackupFile;
      snapshot: WorkspaceBackupSnapshot;
    }
  | null;

function formatBytes(raw?: string): string {
  const bytes = Number(raw || 0);
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export const GoogleDriveBackupModal: React.FC<GoogleDriveBackupModalProps> = ({
  open,
  onClose,
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
  mailBriefings,
  circleBriefings,
  accountRecords,
  credentials,
  directoryEntries,
  emergencySheets,
  storageRootParentId,
  onRestoreSnapshot,
  onLinkDocumentPhoto,
}) => {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [folderId, setFolderId] = useState<string | null>(null);
  const [files, setFiles] = useState<DriveBackupFile[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState>(null);

  useEffect(() => {
    return subscribeDriveAccessToken((tok) => {
      setAccessToken(tok);
      if (!tok) {
        setFolderId(null);
        setFiles([]);
      }
    });
  }, []);

  async function refreshBackups(tokenToUse?: string) {
    const tok = tokenToUse || accessToken;
    if (!tok) return;
    setLoadingFiles(true);
    setErrorMsg(null);
    try {
      const fId =
        folderId ||
        (storageRootParentId
          ? await ensureStewardSubfolder(tok, storageRootParentId, 'Steward Backups')
          : await ensureStewardBackupFolder(tok));
      setFolderId(fId);
      const list = await listDriveBackups(tok, fId);
      setFiles(list);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to connect to Google Drive.';
      if (/401|invalid|expired|credentials/i.test(msg)) {
        clearDriveAccessToken();
      }
      setErrorMsg(msg);
    } finally {
      setLoadingFiles(false);
    }
  }

  useEffect(() => {
    if (open && accessToken) {
      void refreshBackups(accessToken);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, accessToken]);

  if (!open) return null;

  function buildPayloadForKind(kind: BackupKind): {
    name: string;
    mimeType: string;
    content: string;
  } {
    const dateStamp = getLocalTodayIso();
    if (kind === 'workspace_json') {
      return {
        name: `steward-workspace-backup-${dateStamp}.json`,
        mimeType: 'application/json',
        content: buildWorkspaceJsonBackup({
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
          mailBriefings,
          circleBriefings,
          accountRecords,
          credentials,
          directoryEntries,
          emergencySheets,
        }),
      };
    }
    if (kind === 'finances_csv') {
      return {
        name: `steward-finances-ledger-${dateStamp}.csv`,
        mimeType: 'text/csv',
        content: buildFinancesCsvBackup(financeEntries),
      };
    }
    if (kind === 'wimberley_md') {
      return {
        name: `steward-wimberley-property-${dateStamp}.md`,
        mimeType: 'text/markdown',
        content: buildWimberleyMarkdownBackup(propertyEntries),
      };
    }
    return {
      name: `steward-ocr-vault-${dateStamp}.md`,
      mimeType: 'text/markdown',
      content: buildOcrVaultMarkdownBackup(documents),
    };
  }

  function inferKindFromFilename(name: string): BackupKind {
    if (name.includes('finances') || name.endsWith('.csv')) return 'finances_csv';
    if (name.includes('wimberley')) return 'wimberley_md';
    if (name.includes('ocr')) return 'ocr_md';
    return 'workspace_json';
  }

  async function handleConnectDrive() {
    setConnecting(true);
    setErrorMsg(null);
    try {
      const tok = await connectGoogleDrive();
      await refreshBackups(tok);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Google Drive sign-in was cancelled.');
    } finally {
      setConnecting(false);
    }
  }

  async function handleCreateBackup(kind: BackupKind) {
    if (!accessToken) return;
    setBusyAction(kind);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const fId =
        folderId ||
        (storageRootParentId
          ? await ensureStewardSubfolder(accessToken, storageRootParentId, 'Steward Backups')
          : await ensureStewardBackupFolder(accessToken));
      setFolderId(fId);
      const payload = buildPayloadForKind(kind);
      const created = await createDriveBackupFile(accessToken, {
        folderId: fId,
        ...payload,
      });
      setSuccessMsg(`Saved "${created.name}" into your "Steward Backups" Google Drive folder.`);
      await refreshBackups(accessToken);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Backup upload failed.');
    } finally {
      setBusyAction(null);
    }
  }

  async function handleBackupPhotos() {
    if (!accessToken) return;
    setBusyAction('photos');
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const photosFolderId = await ensureStewardPhotosFolder(accessToken);
      const existing = await listDriveBackups(accessToken, photosFolderId);
      const existingByName = new Map(existing.map((f) => [f.name, f.id]));
      const withPhotos = documents.filter(
        (d) => d.imageUrl && d.imageUrl.startsWith('/api/uploads/')
      );
      let uploaded = 0;
      let skipped = 0;
      let linked = 0;
      let failed = 0;
      for (const d of withPhotos) {
        const fileName = d.imageUrl.split('/').pop() || '';
        if (!fileName) {
          failed += 1;
          continue;
        }
        try {
          let driveId = existingByName.get(fileName) || '';
          if (driveId) {
            skipped += 1;
          } else {
            const res = await fetch(d.imageUrl);
            if (!res.ok) throw new Error('photo fetch failed');
            const blob = await res.blob();
            const created = await uploadDriveBinaryFile(accessToken, {
              folderId: photosFolderId,
              name: fileName,
              mimeType: blob.type || 'image/jpeg',
              blob,
            });
            driveId = created.id;
            uploaded += 1;
          }
          if (driveId && !d.driveFileId && onLinkDocumentPhoto) {
            await onLinkDocumentPhoto(d.id, driveId);
            linked += 1;
          }
        } catch {
          failed += 1;
        }
      }
      setSuccessMsg(
        `Document photos are in "Steward Document Photos" in Drive: ${uploaded} new, ${skipped} already there${
          linked > 0 ? `, ${linked} linked to their records` : ''
        }${failed > 0 ? `, ${failed} could not be read` : ''}.`
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Document photo backup failed.');
    } finally {
      setBusyAction(null);
    }
  }

  async function handleRestorePhotos() {
    if (!accessToken) return;
    setBusyAction('restore-photos');
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const withDrive = documents.filter(
        (d) => d.driveFileId && d.imageUrl && d.imageUrl.startsWith('/api/uploads/')
      );
      let restored = 0;
      let alreadyThere = 0;
      let failed = 0;
      for (const d of withDrive) {
        const fileName = d.imageUrl.split('/').pop() || '';
        if (!fileName) {
          failed += 1;
          continue;
        }
        let missing = false;
        try {
          const check = await fetch(d.imageUrl, { method: 'HEAD' });
          missing = !check.ok;
        } catch {
          missing = true;
        }
        if (!missing) {
          alreadyThere += 1;
          continue;
        }
        try {
          const blob = await downloadDriveFileBlob(accessToken, d.driveFileId);
          const imageBase64 = await blobToBase64(blob);
          const res = await fetch('/api/documents/restore-photo', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fileName, imageBase64 }),
          });
          if (!res.ok) throw new Error('restore failed');
          restored += 1;
        } catch {
          failed += 1;
        }
      }
      setSuccessMsg(
        `Photo restore: ${restored} brought back from Drive, ${alreadyThere} already in place${
          failed > 0 ? `, ${failed} could not be restored` : ''
        }.`
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Photo restore failed.');
    } finally {
      setBusyAction(null);
    }
  }
  async function handlePrepareRestore(file: DriveBackupFile) {
    if (!accessToken) return;
    setBusyAction(`restore_prep_${file.id}`);
    setErrorMsg(null);
    try {
      const raw = await downloadDriveBackupContent(accessToken, file.id);
      const parsed = JSON.parse(raw) as WorkspaceBackupSnapshot;
      if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.tasks)) {
        throw new Error('This file is not a recognized Steward workspace JSON backup.');
      }
      setConfirmDialog({ action: 'restore', file, snapshot: parsed });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not read backup file.');
    } finally {
      setBusyAction(null);
    }
  }

  async function handleConfirmAction() {
    if (!confirmDialog || !accessToken) return;
    const dialog = confirmDialog;
    setConfirmDialog(null);
    setBusyAction(`confirm_${dialog.file.id}`);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      if (dialog.action === 'delete') {
        await deleteDriveBackupFile(accessToken, dialog.file.id);
        setSuccessMsg(`Deleted "${dialog.file.name}" from Google Drive.`);
        await refreshBackups(accessToken);
      } else if (dialog.action === 'overwrite') {
        const payload = buildPayloadForKind(dialog.kind);
        await overwriteDriveBackupFile(accessToken, dialog.file.id, {
          name: dialog.file.name,
          mimeType: payload.mimeType,
          content: payload.content,
        });
        setSuccessMsg(`Updated "${dialog.file.name}" in Google Drive with your latest data.`);
        await refreshBackups(accessToken);
      } else if (dialog.action === 'restore') {
        const res = await onRestoreSnapshot(dialog.snapshot);
        setSuccessMsg(
          `Restored ${res.importedCount} new items from "${dialog.file.name}" into Steward.`
        );
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Google Drive action failed.');
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-5 shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-4">
          <div className="flex items-center gap-2.5">
            <HardDrive className="w-5 h-5 text-teal-700 dark:text-teal-400" />
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                Google Drive Backups
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Save snapshots of the whole desk — schedule, papers, property logs, finances, notes, briefings, and the families, circles, and households themselves — into &ldquo;Steward Backups&rdquo;.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Google Drive Backups"
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {errorMsg && (
          <div className="p-3.5 rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 text-xs text-red-700 dark:text-red-300">
            {errorMsg}
          </div>
        )}

        {successMsg && (
          <div className="p-3.5 rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/40 flex items-center gap-2 text-xs text-emerald-800 dark:text-emerald-300">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {!accessToken ? (
          <div className="py-8 text-center space-y-4">
            <p className="text-sm text-slate-700 dark:text-slate-300 max-w-md mx-auto">
              Connect your Google account to save and manage backups in your private &ldquo;Steward Backups&rdquo; folder on Google Drive.
            </p>
            <button
              type="button"
              onClick={handleConnectDrive}
              disabled={connecting}
              className="min-h-[44px] inline-flex items-center gap-3 px-4 py-2 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg text-sm font-medium text-slate-800 dark:text-slate-100 shadow-sm transition-colors disabled:opacity-60"
            >
              <svg
                version="1.1"
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 48 48"
                className="w-5 h-5 shrink-0"
              >
                <path
                  fill="#EA4335"
                  d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                />
                <path
                  fill="#4285F4"
                  d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                />
                <path
                  fill="#FBBC05"
                  d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                />
                <path
                  fill="#34A853"
                  d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                />
                <path fill="none" d="M0 0h48v48H0z" />
              </svg>
              <span>{connecting ? 'Connecting Google Drive...' : 'Sign in with Google'}</span>
            </button>
          </div>
        ) : (
          <div className="space-y-5">
            {/* Create Backup Actions */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Save New Backup to Google Drive
                </h3>
                <span className="text-xs font-mono text-emerald-700 dark:text-emerald-400">
                  Drive Connected
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  type="button"
                  disabled={busyAction !== null}
                  onClick={() => handleCreateBackup('workspace_json')}
                  className="min-h-[44px] flex items-center justify-between gap-2 px-3.5 py-2.5 text-left text-xs font-medium bg-teal-700 hover:bg-teal-800 text-white rounded-xl transition-colors disabled:opacity-60"
                >
                  <div>
                    <p className="font-semibold">Full Workspace Snapshot (.json)</p>
                    <p className="text-[11px] text-teal-100">
                      {tasks.length} tasks · {documents.length} docs · {propertyEntries.length} property · {financeEntries.length} finances
                    </p>
                  </div>
                  <UploadCloud className="w-4 h-4 shrink-0" />
                </button>

                <button
                  type="button"
                  disabled={busyAction !== null}
                  onClick={() => handleCreateBackup('finances_csv')}
                  className="min-h-[44px] flex items-center justify-between gap-2 px-3.5 py-2.5 text-left text-xs font-medium bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-xl transition-colors disabled:opacity-60"
                >
                  <div>
                    <p className="font-semibold">Finances Ledger (.csv)</p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      {financeEntries.length} grouped expenditures &amp; income
                    </p>
                  </div>
                  <UploadCloud className="w-4 h-4 shrink-0 text-teal-700 dark:text-teal-400" />
                </button>

                <button
                  type="button"
                  disabled={busyAction !== null}
                  onClick={() => handleCreateBackup('wimberley_md')}
                  className="min-h-[44px] flex items-center justify-between gap-2 px-3.5 py-2.5 text-left text-xs font-medium bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-xl transition-colors disabled:opacity-60"
                >
                  <div>
                    <p className="font-semibold">Wimberley Property Report (.md)</p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      {propertyEntries.length} conservancy &amp; rental cabin logs
                    </p>
                  </div>
                  <UploadCloud className="w-4 h-4 shrink-0 text-teal-700 dark:text-teal-400" />
                </button>

                <button
                  type="button"
                  disabled={busyAction !== null}
                  onClick={() => handleCreateBackup('ocr_md')}
                  className="min-h-[44px] flex items-center justify-between gap-2 px-3.5 py-2.5 text-left text-xs font-medium bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-xl transition-colors disabled:opacity-60"
                >
                  <div>
                    <p className="font-semibold">OCR Vault Archive (.md)</p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      {documents.length} scanned records &amp; extracted text
                    </p>
                  </div>
                  <UploadCloud className="w-4 h-4 shrink-0 text-teal-700 dark:text-teal-400" />
                </button>
              </div>
            </div>


                <button
                  type="button"
                  disabled={busyAction !== null}
                  onClick={() => handleBackupPhotos()}
                  className="w-full min-h-[44px] flex items-center justify-between gap-2 px-3.5 py-2.5 text-left text-xs font-medium bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-xl transition-colors disabled:opacity-60"
                >
                  <div>
                    <p className="font-semibold">
                      {busyAction === 'photos' ? 'Backing up document photos...' : 'Document Photos (.jpg)'}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      {
                        documents.filter((d) => d.imageUrl && d.imageUrl.startsWith('/api/uploads/'))
                          .length
                      }{' '}
                      scanned photos, kept in "Steward Document Photos" in Drive — their
                      permanent home, so a lost server copy can be restored
                    </p>
                  </div>
                  <UploadCloud className="w-4 h-4 shrink-0 text-teal-700 dark:text-teal-400" />
                </button>


                <button
                  type="button"
                  disabled={busyAction !== null}
                  onClick={() => handleRestorePhotos()}
                  className="w-full min-h-[44px] flex items-center justify-between gap-2 px-3.5 py-2.5 text-left text-xs font-medium bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-xl transition-colors disabled:opacity-60"
                >
                  <div>
                    <p className="font-semibold">
                      {busyAction === 'restore-photos' ? 'Restoring photos from Drive...' : 'Restore Photos from Drive'}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      {documents.filter((d) => d.driveFileId).length} photos have a Drive home
                      copy — any whose server copy is missing are brought back from Drive
                    </p>
                  </div>
                  <DownloadCloud className="w-4 h-4 shrink-0 text-teal-700 dark:text-teal-400" />
                </button>

            {/* Saved Backups List */}
            <div className="space-y-3 border-t border-slate-200 dark:border-slate-800 pt-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Files in &ldquo;Steward Backups&rdquo; ({files.length})
                </h3>
                <button
                  type="button"
                  onClick={() => refreshBackups()}
                  disabled={loadingFiles}
                  className="min-h-[34px] inline-flex items-center gap-1.5 px-2.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingFiles ? 'animate-spin' : ''}`} />
                  <span>Refresh</span>
                </button>
              </div>

              {files.length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-slate-400 py-4 text-center">
                  {loadingFiles
                    ? 'Loading Google Drive backups...'
                    : 'No backup files saved in Steward Backups yet. Choose a backup format above.'}
                </p>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl">
                  {files.map((file) => {
                    const isJson = file.name.endsWith('.json') || file.mimeType === 'application/json';
                    return (
                      <div
                        key={file.id}
                        className="p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                            {file.name}
                          </p>
                          <p className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                            {file.modifiedTime ? new Date(file.modifiedTime).toLocaleString() : '—'} ·{' '}
                            {formatBytes(file.size)}
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                          {file.webViewLink && (
                            <a
                              href={file.webViewLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="min-h-[34px] inline-flex items-center gap-1 px-2.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                              <span>Open</span>
                            </a>
                          )}

                          {isJson && (
                            <button
                              type="button"
                              disabled={busyAction !== null}
                              onClick={() => handlePrepareRestore(file)}
                              className="min-h-[34px] inline-flex items-center gap-1 px-2.5 text-xs font-medium text-teal-700 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-950/40 rounded-lg"
                            >
                              <DownloadCloud className="w-3.5 h-3.5" />
                              <span>Restore</span>
                            </button>
                          )}

                          <button
                            type="button"
                            disabled={busyAction !== null}
                            onClick={() =>
                              setConfirmDialog({
                                action: 'overwrite',
                                file,
                                kind: inferKindFromFilename(file.name),
                              })
                            }
                            className="min-h-[34px] inline-flex items-center gap-1 px-2.5 text-xs font-medium text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/40 rounded-lg"
                          >
                            <UploadCloud className="w-3.5 h-3.5" />
                            <span>Update</span>
                          </button>

                          <button
                            type="button"
                            disabled={busyAction !== null}
                            onClick={() => setConfirmDialog({ action: 'delete', file })}
                            aria-label={`Delete ${file.name}`}
                            className="min-h-[34px] min-w-[34px] flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Explicit User Confirmation Dialog for Destructive / Mutating Drive Operations */}
      {confirmDialog && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 space-y-4 shadow-2xl">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div className="space-y-1.5">
                <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  {confirmDialog.action === 'delete'
                    ? `Delete "${confirmDialog.file.name}" from Google Drive?`
                    : confirmDialog.action === 'overwrite'
                    ? `Update "${confirmDialog.file.name}" in Google Drive?`
                    : `Restore workspace items from "${confirmDialog.file.name}"?`}
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  {confirmDialog.action === 'delete'
                    ? 'This permanently removes the backup file from your Google Drive account. Your local/Firestore app data will not be deleted.'
                    : confirmDialog.action === 'overwrite'
                    ? 'This will overwrite the existing file content in your Google Drive "Steward Backups" folder with your current Steward data.'
                    : `Found ${confirmDialog.snapshot.tasks.length} tasks, ${confirmDialog.snapshot.documents.length} documents, ${confirmDialog.snapshot.propertyEntries.length} property entries, and ${confirmDialog.snapshot.financeEntries.length} financial entries. Missing items will be added to your Steward account without deleting existing records.`}
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmDialog(null)}
                className="min-h-[42px] px-4 text-xs font-medium text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmAction}
                className={`min-h-[42px] px-4 text-xs font-semibold text-white rounded-lg ${
                  confirmDialog.action === 'delete'
                    ? 'bg-red-600 hover:bg-red-700'
                    : 'bg-teal-700 hover:bg-teal-800'
                }`}
              >
                {confirmDialog.action === 'delete'
                  ? 'Confirm Delete'
                  : confirmDialog.action === 'overwrite'
                  ? 'Confirm Overwrite'
                  : 'Confirm Restore'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

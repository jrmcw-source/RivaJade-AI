import {
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
} from '../types';

export interface DriveBackupFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  size?: string;
  webViewLink?: string;
}

export interface WorkspaceBackupSnapshot {
  version: 1;
  exportedAtIso: string;
  tasks: Array<Omit<ScheduleTask, 'createdAt' | 'updatedAt'>>;
  documents: Array<Omit<ScannedDocument, 'createdAt' | 'updatedAt'>>;
  propertyEntries: Array<Omit<PropertyEntry, 'createdAt' | 'updatedAt'>>;
  financeEntries: Array<Omit<FinanceEntry, 'createdAt' | 'updatedAt'>>;
  voiceMemories: Array<Omit<VoiceMemory, 'createdAt' | 'updatedAt'>>;
  // Backup everything (Jason, 2026-11-21): the snapshot also holds
  // the desk's structure and the rest of its records — households
  // and their member cards, families with their rosters and rules,
  // circles, notes, and the briefings. Optional sections, so a
  // snapshot written before they existed still reads cleanly.
  households?: Array<Omit<Household, 'createdAt' | 'updatedAt'>>;
  householdMembers?: Array<HouseholdMember>;
  families?: Array<Omit<Family, 'createdAt' | 'updatedAt'>>;
  circles?: Array<Omit<Circle, 'createdAt' | 'updatedAt'>>;
  jasonNotes?: Array<Omit<JasonNote, 'createdAt' | 'updatedAt'>>;
  briefings?: Array<Omit<MorningBriefing, 'createdAt' | 'updatedAt'>>;
  mailBriefings?: Array<Omit<MailBriefing, 'createdAt' | 'updatedAt'>>;
  circleBriefings?: Array<Omit<CircleBriefing, 'createdAt' | 'updatedAt'>>;
}

const DRIVE_FOLDER_NAME = 'Steward Backups';

async function parseDriveError(res: Response, fallback: string): Promise<string> {
  try {
    const json = (await res.json()) as { error?: { message?: string } };
    if (json?.error?.message) return json.error.message;
  } catch {
    // ignore JSON parse issues
  }
  return `${fallback} (HTTP ${res.status})`;
}

export async function ensureStewardBackupFolder(accessToken: string): Promise<string> {
  const query = encodeURIComponent(
    `name = '${DRIVE_FOLDER_NAME}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`
  );
  const searchRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name)&spaces=drive`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
  if (!searchRes.ok) {
    throw new Error(await parseDriveError(searchRes, 'Unable to search Google Drive folders'));
  }
  const searchJson = (await searchRes.json()) as { files?: Array<{ id: string; name: string }> };
  if (searchJson.files && searchJson.files.length > 0) {
    return searchJson.files[0].id;
  }

  const createRes = await fetch('https://www.googleapis.com/drive/v3/files?fields=id,name', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: DRIVE_FOLDER_NAME,
      mimeType: 'application/vnd.google-apps.folder',
    }),
  });
  if (!createRes.ok) {
    throw new Error(await parseDriveError(createRes, 'Unable to create Steward Backups folder'));
  }
  const created = (await createRes.json()) as { id: string };
  return created.id;
}

export async function listDriveBackups(
  accessToken: string,
  folderId: string
): Promise<DriveBackupFile[]> {
  const query = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${query}&orderBy=modifiedTime%20desc&fields=files(id,name,mimeType,modifiedTime,size,webViewLink)&pageSize=30`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
  if (!res.ok) {
    throw new Error(await parseDriveError(res, 'Unable to list Google Drive backups'));
  }
  const data = (await res.json()) as { files?: DriveBackupFile[] };
  return data.files || [];
}

function buildMultipartBody(
  metadata: Record<string, unknown>,
  content: string,
  mimeType: string
): { body: string; boundary: string } {
  const boundary = `steward_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const body =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: ${mimeType}; charset=UTF-8\r\n\r\n` +
    `${content}\r\n` +
    `--${boundary}--`;
  return { body, boundary };
}

export async function createDriveBackupFile(
  accessToken: string,
  params: { folderId: string; name: string; mimeType: string; content: string }
): Promise<DriveBackupFile> {
  const { body, boundary } = buildMultipartBody(
    {
      name: params.name,
      parents: [params.folderId],
    },
    params.content,
    params.mimeType
  );

  const res = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,modifiedTime,size,webViewLink',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body,
    }
  );
  if (!res.ok) {
    throw new Error(await parseDriveError(res, 'Failed to upload backup to Google Drive'));
  }
  return (await res.json()) as DriveBackupFile;
}

export async function overwriteDriveBackupFile(
  accessToken: string,
  fileId: string,
  params: { name: string; mimeType: string; content: string }
): Promise<DriveBackupFile> {
  const { body, boundary } = buildMultipartBody(
    { name: params.name },
    params.content,
    params.mimeType
  );

  const res = await fetch(
    `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(
      fileId
    )}?uploadType=multipart&fields=id,name,mimeType,modifiedTime,size,webViewLink`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body,
    }
  );
  if (!res.ok) {
    throw new Error(await parseDriveError(res, 'Failed to update backup in Google Drive'));
  }
  return (await res.json()) as DriveBackupFile;
}

export async function deleteDriveBackupFile(accessToken: string, fileId: string): Promise<void> {
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
  if (!res.ok) {
    throw new Error(await parseDriveError(res, 'Failed to delete backup from Google Drive'));
  }
}

export async function downloadDriveBackupContent(
  accessToken: string,
  fileId: string
): Promise<string> {
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
  if (!res.ok) {
    throw new Error(await parseDriveError(res, 'Failed to download backup from Google Drive'));
  }
  return res.text();
}

export function buildWorkspaceJsonBackup(data: {
  tasks: ScheduleTask[];
  documents: ScannedDocument[];
  propertyEntries: PropertyEntry[];
  financeEntries: FinanceEntry[];
  voiceMemories: VoiceMemory[];
  households?: Household[];
  householdMembers?: HouseholdMember[];
  families?: Family[];
  circles?: Circle[];
  jasonNotes?: JasonNote[];
  briefings?: MorningBriefing[];
  mailBriefings?: MailBriefing[];
  circleBriefings?: CircleBriefing[];
}): string {
  const stripTimestamps = <T extends { createdAt?: unknown; updatedAt?: unknown }>(items: T[]) =>
    items.map(({ createdAt: _c, updatedAt: _u, ...rest }) => rest);

  const snapshot: WorkspaceBackupSnapshot = {
    version: 1,
    exportedAtIso: new Date().toISOString(),
    tasks: stripTimestamps(data.tasks),
    documents: stripTimestamps(data.documents),
    propertyEntries: stripTimestamps(data.propertyEntries),
    financeEntries: stripTimestamps(data.financeEntries),
    voiceMemories: stripTimestamps(data.voiceMemories),
    ...(data.households ? { households: stripTimestamps(data.households) } : {}),
    ...(data.householdMembers ? { householdMembers: data.householdMembers } : {}),
    ...(data.families ? { families: stripTimestamps(data.families) } : {}),
    ...(data.circles ? { circles: stripTimestamps(data.circles) } : {}),
    ...(data.jasonNotes ? { jasonNotes: stripTimestamps(data.jasonNotes) } : {}),
    ...(data.briefings ? { briefings: stripTimestamps(data.briefings) } : {}),
    ...(data.mailBriefings ? { mailBriefings: stripTimestamps(data.mailBriefings) } : {}),
    ...(data.circleBriefings ? { circleBriefings: stripTimestamps(data.circleBriefings) } : {}),
  };
  return JSON.stringify(snapshot, null, 2);
}

export function buildFinancesCsvBackup(entries: FinanceEntry[]): string {
  const header = [
    'Date',
    'Kind',
    'Group',
    'Title',
    'Amount',
    'Vendor',
    'Place',
    'Tax Deductible',
    'Notes',
  ];
  const rows = [...entries]
    .sort((a, b) => b.entryDate.localeCompare(a.entryDate))
    .map((item) => [
      item.entryDate,
      item.kind,
      item.group,
      item.title,
      item.amount.toFixed(2),
      item.vendor,
      (item.place || '') + (item.careForJason ? " — Jason's care" : ''),
      item.taxDeductible ? 'Yes' : 'No',
      item.notes.replace(/\n/g, ' '),
    ]);
  return [header, ...rows]
    .map((cols) => cols.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
    .join('\n');
}

export function buildWimberleyMarkdownBackup(entries: PropertyEntry[]): string {
  const lines = [
    `# Wimberley, TX Family Property Report (${getLocalTodayIso()})`,
    '',
    `Total logged items: ${entries.length}`,
    '',
  ];
  for (const e of entries) {
    lines.push(`## ${e.title}`);
    lines.push(
      `- Area: ${e.area} | Status: ${e.status} | Cadence: ${e.cadence} | Date: ${e.scheduledDate}${
        e.endDate ? ` -> ${e.endDate}` : ''
      }`
    );
    if (e.inspectorOrGuest) lines.push(`- Contact/Guest: ${e.inspectorOrGuest}`);
    if (e.notes) lines.push(`- Notes: ${e.notes}`);
    lines.push('');
  }
  return lines.join('\n');
}

export function buildOcrVaultMarkdownBackup(documents: ScannedDocument[]): string {
  const lines = [
    `# Steward OCR Document Vault Archive (${getLocalTodayIso()})`,
    '',
    `Total scanned records: ${documents.length}`,
    '',
  ];
  for (const d of documents) {
    lines.push(`## ${d.title}`);
    lines.push(
      `- Category: ${d.category} | Date: ${d.detectedDate || 'None'} | Tags: ${
        d.tags.join(', ') || 'None'
      }`
    );
    if (d.summary) lines.push(`- Summary: ${d.summary}`);
    if (d.paperLocation) lines.push(`- Paper lives: ${d.paperLocation}`);
    lines.push(
      `- Checked against the paper: ${
        d.verificationStatus === 'verified'
          ? `Yes${d.verifiedByName ? ` by ${d.verifiedByName}` : ''}${
              d.verifiedAtIso ? ` on ${d.verifiedAtIso.slice(0, 10)}` : ''
            }`
          : 'Not yet'
      }`
    );
    if (d.keyDetails.length > 0) lines.push(`- Key Details: ${d.keyDetails.join(' | ')}`);
    if (d.ocrText) {
      lines.push('');
      lines.push('### Extracted OCR Text');
      lines.push(d.ocrText);
    }
    lines.push('');
  }
  return lines.join('\n');
}

export async function ensureStewardSubfolder(
  accessToken: string,
  parentFolderId: string,
  name: string
): Promise<string> {
  const query = encodeURIComponent(
    `name = '${name}' and '${parentFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`
  );
  const searchRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name)&spaces=drive`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
  if (!searchRes.ok) {
    throw new Error(await parseDriveError(searchRes, 'Unable to search Google Drive folders'));
  }
  const searchJson = (await searchRes.json()) as { files?: Array<{ id: string; name: string }> };
  if (searchJson.files && searchJson.files.length > 0) {
    return searchJson.files[0].id;
  }

  const createRes = await fetch('https://www.googleapis.com/drive/v3/files?fields=id,name', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentFolderId],
    }),
  });
  if (!createRes.ok) {
    throw new Error(await parseDriveError(createRes, 'Unable to create Google Drive folder'));
  }
  const created = (await createRes.json()) as { id: string };
  return created.id;
}

export async function uploadDriveBinaryFile(
  accessToken: string,
  params: { folderId: string; name: string; mimeType: string; blob: Blob }
): Promise<DriveBackupFile> {
  const boundary = `steward_bin_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const metadata = JSON.stringify({ name: params.name, parents: [params.folderId] });
  const body = new Blob(
    [
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: ${params.mimeType}\r\n\r\n`,
      params.blob,
      `\r\n--${boundary}--`,
    ],
    { type: `multipart/related; boundary=${boundary}` }
  );

  const res = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,modifiedTime,size,webViewLink',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body,
    }
  );
  if (!res.ok) {
    throw new Error(await parseDriveError(res, 'Failed to upload file to Google Drive'));
  }
  return (await res.json()) as DriveBackupFile;
}

const PHOTOS_FOLDER_NAME = 'Steward Document Photos';

export async function ensureStewardPhotosFolder(accessToken: string): Promise<string> {
  const query = encodeURIComponent(
    `name = '${PHOTOS_FOLDER_NAME}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`
  );
  const searchRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name)&spaces=drive`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
  if (!searchRes.ok) {
    throw new Error(await parseDriveError(searchRes, 'Unable to search Google Drive folders'));
  }
  const searchJson = (await searchRes.json()) as { files?: Array<{ id: string; name: string }> };
  if (searchJson.files && searchJson.files.length > 0) {
    return searchJson.files[0].id;
  }

  const createRes = await fetch('https://www.googleapis.com/drive/v3/files?fields=id,name', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: PHOTOS_FOLDER_NAME,
      mimeType: 'application/vnd.google-apps.folder',
    }),
  });
  if (!createRes.ok) {
    throw new Error(await parseDriveError(createRes, 'Unable to create Steward Document Photos folder'));
  }
  const created = (await createRes.json()) as { id: string };
  return created.id;
}

export async function downloadDriveFileBlob(
  accessToken: string,
  fileId: string
): Promise<Blob> {
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
  if (!res.ok) {
    throw new Error(await parseDriveError(res, 'Failed to download file from Google Drive'));
  }
  return res.blob();
}

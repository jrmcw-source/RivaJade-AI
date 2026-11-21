// Gmail reading for the morning briefing (Jason, 2026-11-20).
//
// The desk reads the reader's own Gmail only when that reader's own
// email toggle is on and they have connected mail for this session
// (see connectGmail in firebase.ts — read-only scope, token in memory
// only). This module turns recent inbox mail into plain summary lines
// for the briefing model: sender, subject, and the snippet Gmail
// itself shows. Message bodies are never fetched.
//
// The fence (Jason, 2026-11-20): the reader's own mail rules are
// applied HERE, on the reader's own device, before anything is sent
// to the model. A message the rules shut out is dropped from the
// summary entirely — the model never sees it. Kinds follow Gmail's
// own categories: people who write to you, bills/statements/notices
// (Gmail "updates"), and newsletters/announcements (promotions,
// social, forums). A "never" sender beats an "only" list; an "only"
// list, when present, narrows the desk to just those senders.

export interface MailAccessRules {
  fromPeople: boolean;
  billsAndNotices: boolean;
  newsletters: boolean;
  onlySenders: string;
  neverSenders: string;
}

export const DEFAULT_MAIL_RULES: MailAccessRules = {
  fromPeople: true,
  billsAndNotices: true,
  newsletters: false,
  onlySenders: '',
  neverSenders: '',
};

function senderList(raw: string): string[] {
  return raw
    .split(/[\n,;]+/)
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
}

function bucketOf(labelIds: string[]): 'people' | 'bills' | 'bulk' {
  if (
    labelIds.includes('CATEGORY_PROMOTIONS') ||
    labelIds.includes('CATEGORY_SOCIAL') ||
    labelIds.includes('CATEGORY_FORUMS')
  ) {
    return 'bulk';
  }
  if (labelIds.includes('CATEGORY_UPDATES')) return 'bills';
  return 'people';
}

export async function fetchRecentMailSummary(
  accessToken: string,
  rules: MailAccessRules = DEFAULT_MAIL_RULES
): Promise<string> {
  const headers = { Authorization: `Bearer ${accessToken}` };
  const query = encodeURIComponent('in:inbox newer_than:2d');
  const listRes = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=30&q=${query}`,
    { headers }
  );
  if (!listRes.ok) {
    throw new Error(`Gmail list failed: HTTP ${listRes.status}`);
  }
  const list = (await listRes.json()) as { messages?: Array<{ id: string }> };
  const ids = (list.messages || []).map((m) => m.id).slice(0, 30);
  if (!ids.length) return '';

  const only = senderList(rules.onlySenders);
  const never = senderList(rules.neverSenders);
  const lines: string[] = [];
  for (const id of ids) {
    if (lines.length >= 20) break;
    try {
      const res = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
        { headers }
      );
      if (!res.ok) continue;
      const msg = (await res.json()) as {
        snippet?: string;
        labelIds?: string[];
        payload?: { headers?: Array<{ name: string; value: string }> };
      };
      const bucket = bucketOf(msg.labelIds || []);
      if (bucket === 'people' && !rules.fromPeople) continue;
      if (bucket === 'bills' && !rules.billsAndNotices) continue;
      if (bucket === 'bulk' && !rules.newsletters) continue;
      const byName = new Map(
        (msg.payload?.headers || []).map((h) => [h.name.toLowerCase(), h.value])
      );
      const from = (byName.get('from') || 'Unknown sender').slice(0, 80);
      const fromLower = from.toLowerCase();
      if (never.some((n) => fromLower.includes(n))) continue;
      if (only.length && !only.some((n) => fromLower.includes(n))) continue;
      const subject = (byName.get('subject') || '(no subject)').slice(0, 120);
      const snippet = (msg.snippet || '').replace(/\s+/g, ' ').trim().slice(0, 180);
      lines.push(`- From: ${from} | Subject: ${subject} | ${snippet}`);
    } catch {
      // One unreadable message never sinks the whole summary.
      continue;
    }
  }
  return lines.join('\n');
}

// Filing (Jason, 2026-11-21): the same fence, returning the recent
// messages as structured entries so the owner can file one as a
// record under privacy settings they pick. What the fence shuts
// out cannot be filed either — the rules run here first, always.
export interface MailFilingEntry {
  id: string;
  from: string;
  subject: string;
  date: string;
  snippet: string;
}

export async function fetchMailForFiling(
  accessToken: string,
  rules: MailAccessRules = DEFAULT_MAIL_RULES
): Promise<MailFilingEntry[]> {
  const headers = { Authorization: `Bearer ${accessToken}` };
  const query = encodeURIComponent('in:inbox newer_than:30d');
  const listRes = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=30&q=${query}`,
    { headers }
  );
  if (!listRes.ok) {
    throw new Error(`Gmail list failed: HTTP ${listRes.status}`);
  }
  const list = (await listRes.json()) as { messages?: Array<{ id: string }> };
  const ids = (list.messages || []).map((m) => m.id).slice(0, 30);
  const only = senderList(rules.onlySenders);
  const never = senderList(rules.neverSenders);
  const entries: MailFilingEntry[] = [];
  for (const id of ids) {
    if (entries.length >= 20) break;
    try {
      const res = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
        { headers }
      );
      if (!res.ok) continue;
      const msg = (await res.json()) as {
        snippet?: string;
        labelIds?: string[];
        payload?: { headers?: Array<{ name: string; value: string }> };
      };
      const bucket = bucketOf(msg.labelIds || []);
      if (bucket === 'people' && !rules.fromPeople) continue;
      if (bucket === 'bills' && !rules.billsAndNotices) continue;
      if (bucket === 'bulk' && !rules.newsletters) continue;
      const byName = new Map(
        (msg.payload?.headers || []).map((h) => [h.name.toLowerCase(), h.value])
      );
      const from = (byName.get('from') || 'Unknown sender').slice(0, 80);
      const fromLower = from.toLowerCase();
      if (never.some((n) => fromLower.includes(n))) continue;
      if (only.length && !only.some((n) => fromLower.includes(n))) continue;
      entries.push({
        id,
        from,
        subject: (byName.get('subject') || '(no subject)').slice(0, 120),
        date: (byName.get('date') || '').slice(0, 60),
        snippet: (msg.snippet || '').replace(/\s+/g, ' ').trim().slice(0, 300),
      });
    } catch {
      continue;
    }
  }
  return entries;
}

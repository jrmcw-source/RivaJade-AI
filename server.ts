import 'dotenv/config';
import express from 'express';
import http from 'http';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import zlib from 'zlib';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { WebSocketServer, WebSocket } from 'ws';
import {
  GoogleGenAI,
  Type,
  ThinkingLevel,
  Modality,
  LiveServerMessage,
  FunctionDeclaration,
} from '@google/genai';
import { buildIcsCalendar } from './src/services/calendarExport';
import type { ScheduleTask } from './src/types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const UPLOADS_DIR = path.resolve(__dirname, 'uploads');

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// ---------------------------------------------------------------------------
// Household calendar subscription feed — server-side Firestore access.
//
// The feed reads Firestore with server credentials: the
// FIREBASE_SERVICE_ACCOUNT_JSON environment variable when set, otherwise the
// runtime's own identity (Application Default Credentials — for example the
// Cloud Run service account the app runs as). The Admin SDK is imported
// lazily, so a missing package or missing credentials can never stop the app
// itself from starting; the feed simply reports that it is not configured.
// ---------------------------------------------------------------------------
type AdminDb = import('firebase-admin/firestore').Firestore;
let adminDbPromise: Promise<AdminDb | null> | null = null;

function getAdminDb(): Promise<AdminDb | null> {
  if (!adminDbPromise) {
    adminDbPromise = (async () => {
      try {
        const { initializeApp, applicationDefault, cert, getApps } =
          await import('firebase-admin/app');
        const { getFirestore } = await import('firebase-admin/firestore');
        let projectId: string | undefined;
        let databaseId: string | undefined;
        try {
          const cfg = JSON.parse(
            fs.readFileSync(path.resolve(__dirname, 'firebase-applet-config.json'), 'utf8')
          ) as { projectId?: string; firestoreDatabaseId?: string };
          projectId = cfg.projectId;
          databaseId = cfg.firestoreDatabaseId;
        } catch {
          // The config file only pins the project/database; ADC can go without.
        }
        let app: import('firebase-admin/app').App;
        if (getApps().length > 0) {
          app = getApps()[0];
        } else if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
          const key = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON) as {
            project_id?: string;
          };
          app = initializeApp({
            credential: cert(key as Record<string, unknown>),
            projectId: projectId || key.project_id,
          });
        } else {
          app = initializeApp({ credential: applicationDefault(), projectId });
        }
        return databaseId ? getFirestore(app, databaseId) : getFirestore(app);
      } catch (err) {
        console.error('Calendar feed: Firebase Admin is not available on this server.', err);
        return null;
      }
    })();
  }
  return adminDbPromise;
}


const CATEGORIES = [
  'Tax & Finance',
  'Car Maintenance',
  'Household',
  'Church & Faith',
  'Community Service',
  'Social Events',
  'Hobbies',
  'Health & Medical',
  'Wimberley Property',
  'General',
] as const;

function getGenAIClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured in server environment.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

async function createApp() {
  // The family's place tree, written for the AI surfaces (chat assistant,
// voice assistant, document scan). Jason set this layout on 2026-11-17 and
// asked that the assistant be left a description of it, so sorting and
// filing respect the division from the first request.
const PLACE_TREE_BRIEF = `THE FAMILY'S PLACES — HOW THIS DESK IS ORGANIZED:
This desk belongs to Mom. She is the trunk of the tree; everything on the desk is hers. She is officially a Texas resident. Two main branches grow from the trunk: Texas and Louisiana.

THE PEOPLE:
- Mom — the owner of this desk and of both properties; Jason's and Derek's mother. The property Riva Jade is named for her.
- Jason McWhirter — Mom's younger son. He lives at Oakleaf and helps Mom with this desk. The "Jason's care" expenses are spending on his care.
- Derek — Mom's older son. He lives at Elephant Walk and buys things for Riva Jade.
- Dawn — Derek's wife, at Elephant Walk. She drives Jason's old car; Mom pays for its insurance.
- Haydon, Kenzie, and Camden (Cam) — Derek and Dawn's children, the Elephant Walk family.
- Dan Angelo Silverio Bo — Jason's partner; his name may appear in Oakleaf papers and photos.
- A long-term renter couple lives at Riva Jade and watches the property when Mom is in Louisiana.

TEXAS — Riva Jade, one property: 21.6 acres at 5151 Wayside Dr, Wimberley, TX, on the Blanco River.
- "Riva Jade" — the whole property, when a record concerns all of it.
- "Riva Jade — Homestead" — the 1-acre homestead: the main house (Mom's official residence), the barn, the big shop, a little shop, and a storage shed.
- "Riva Jade — Rental Cabin" — the separate rental cabin, which sits inside the homestead acre and is the Homestead's own branch: cabin stays, guests, turnovers, and cabin upkeep.
- "Riva Jade — Wildlife Conservancy" — the other 20.6 acres: riverfront, windmills, bird, duck, and bat sanctuaries, and acreage left natural. Its expenses are wildlife-management work under a tax exemption: native upkeep, supplemental water, sanctuaries, removing invasive species, supporting native species.

LOUISIANA:
- "Oakleaf" — Mom's house in Lafayette, LA. Jason lives there now; the house is Mom's, held in reserve for her. Some of Mom's spending there is for Jason's care in his health state — when an expense is for his care, mark careForJason true.
- "Elephant Walk" — Derek and Dawn's house at 410 Elephant Walk, Carencro, LA. Mom helps with some bills there (for example, Jason's old car and its insurance, which Dawn uses).

HOW TO SORT AND APPLY RECORDS:
- Every task, document, expense, and property entry belongs to exactly one of the six place names above, or is general (place "") when it belongs to the whole desk.
- Choose the branch by what the record is ABOUT — the property, house, land, vehicle, or bill it concerns — not by who mentions it.
- Respect the division from the first step: keep each branch's money, papers, and tasks separate in answers and totals, and name the branch you are reporting on. A wider branch includes everything under it: Riva Jade includes the homestead, the cabin, and the conservancy; Texas means all of Riva Jade; Louisiana means Oakleaf and Elephant Walk together; everything together is Mom's whole desk.
- The branches answer to different tax rules: the conservancy (exemption), the homestead, and the rental cabin each have their own Texas treatment, and the Louisiana places follow Louisiana rules. Never merge them in a total unless the user asks for the wider view.
- If a record's branch is not clear from what the user said or what a document shows, leave it general and say it is unfiled by place. Never guess a branch for money or paperwork.

RECORD RETENTION AND DISCLOSURE — THE DESK'S STANDING LAW:
- The governing objective, for every record on this desk, wherever it resides and whatever it is used for or applied against: never offer more information than what is legally obligated. Not to a tax authority, not to an appraisal district, not to anyone outside the family.
- The family keeps EVERYTHING for itself, forever. Never delete a record because of its age, and never suggest deleting one. Keeping is not disclosing: what the desk holds and what it hands over are two different things.
- Disclosure limits are PER AGENCY, not per property. When you prepare an output — an answer, a summary, a file — for a specific agency or outside party, include only the records inside THAT agency's limit for the branch the records belong to, from the table below.
- THE ACCESS FLOOR: the most recent 3 years of any branch are freely accessible. When a user asks for data inside the last 3 years, provide it without asking who it is for or why — 3 years is the smallest limit in the table, so nothing in that range can exceed any agency's reach, and nobody needs permission for it. The who's-asking question applies only when an output would reach BEYOND 3 years: then the named agency's limit for the branch is the ceiling, and if nobody has named who it is for, ask before preparing it. For the family itself, older data is available when the user deliberately asks for the longer range.
- THE TABLE — the agencies each branch may have to be dealt with, and each agency's minimal limit (its standard reach over that branch's records):
  Riva Jade (the whole property): IRS (federal) 3 years · Texas Comptroller (state) 4 years · Hays County Appraisal District 5 years (wildlife management reports).
  Riva Jade — Homestead: IRS 3 years · Hays County Appraisal District — appraisal and exemptions; no records window, property papers kept while owned.
  Riva Jade — Rental Cabin: IRS 3 years · Texas Comptroller 4 years (hotel occupancy and state taxes) · Hays County Appraisal District — appraisal; property papers kept while owned.
  Riva Jade — Wildlife Conservancy: IRS 3 years · Texas Comptroller 4 years · Hays County Appraisal District 5 years (wildlife management reports).
  Oakleaf (Lafayette, in Lafayette Parish): IRS 3 years · Louisiana Dept. of Revenue 3 years · Lafayette Parish / City (LCG) local taxes 3 years.
  Elephant Walk (Carencro — also Lafayette Parish, the same parish as Oakleaf): IRS 3 years · Louisiana Dept. of Revenue 3 years · Lafayette Parish / City (LCG) 3 years.
  General records (no branch): IRS 3 years; a state or local limit applies only to records tagged to that state's branch.
- The desk's own working set — what fills totals and ordinary answers — keeps, per branch, the LONGEST limit in that branch's table rows (Riva Jade and the Conservancy 5 years, the Rental Cabin 4, the Homestead and both Louisiana places 3), so nothing any agency can still reach is ever out of the family's view. The per-agency cut happens when an output is prepared for that agency.
- Longer reaches exist for special cases — 6 years where income was substantially underreported (federal and Louisiana), 7 years for federal bad-debt or worthless-securities claims, and no limit for unfiled or fraudulent returns. Those are exceptions, not working limits; the archive still holds those years for the family.
- If a request reaches beyond an agency's limit in the table, or asks the family to sign an extension of a deadline (a waiver of prescription), do not settle it either way: flag it for the family to decide.
- THE DEEP ARCHIVE: a finance record 7 years old to the day, or older, is archived automatically — no one decides it, the date decides it. It leaves the ledger, the totals, the exports, and your own working context. It is kept (the backups hold it) and the family can retrieve it deliberately, but never include one in an answer or an output: 7 years is the legal maximum, the longest any rule reaches, so at 7 years to the day the record has outlived every obligation.
- Property records are different: deeds, titles, and purchase records stay active as long as the family owns the property, whatever their age.`;

const app = express();
  app.use(express.json({ limit: '24mb' }));

  // Serve uploaded document scan images safely
  app.get('/api/uploads/:filename', (req, res) => {
    const safeName = path.basename(req.params.filename || '');
    if (!/^[a-zA-Z0-9_\-\.]+$/.test(safeName)) {
      res.status(400).json({ error: 'Invalid filename' });
      return;
    }
    const filePath = path.join(UPLOADS_DIR, safeName);
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: 'Scan image not found' });
      return;
    }
    res.sendFile(filePath);
  });

  // Health check
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  // Download clean project source archive (.zip)
  app.get('/api/project/download', (_req, res) => {
    try {
      const rootDir = path.resolve(__dirname);
      const excludedDirs = new Set(['node_modules', 'dist', 'dev-dist', 'uploads', '.git']);
      const excludedFiles = new Set(['.env', '.env.local', 'DRAFT_firestore.rules']);

      const crcTable = new Uint32Array(256);
      for (let i = 0; i < 256; i++) {
        let c = i;
        for (let k = 0; k < 8; k++) {
          c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        }
        crcTable[i] = c >>> 0;
      }
      const crc32 = (buf: Buffer): number => {
        let crc = 0xffffffff;
        for (let i = 0; i < buf.length; i++) {
          crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
        }
        return (crc ^ 0xffffffff) >>> 0;
      };

      const files: Array<{ relPath: string; data: Buffer }> = [];
      const walk = (dir: string, relBase: string) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          if (entry.isDirectory()) {
            if (excludedDirs.has(entry.name)) continue;
            walk(path.join(dir, entry.name), relBase ? `${relBase}/${entry.name}` : entry.name);
          } else if (entry.isFile()) {
            if (excludedFiles.has(entry.name)) continue;
            const relPath = relBase ? `${relBase}/${entry.name}` : entry.name;
            files.push({
              relPath: `steward-project/${relPath}`,
              data: fs.readFileSync(path.join(dir, entry.name)),
            });
          }
        }
      };
      walk(rootDir, '');

      const localChunks: Buffer[] = [];
      const centralChunks: Buffer[] = [];
      let offset = 0;

      for (const file of files) {
        const nameBuf = Buffer.from(file.relPath, 'utf8');
        const compressed = zlib.deflateRawSync(file.data);
        const crc = crc32(file.data);

        const localHeader = Buffer.alloc(30);
        localHeader.writeUInt32LE(0x04034b50, 0);
        localHeader.writeUInt16LE(20, 4);
        localHeader.writeUInt16LE(0x0800, 6);
        localHeader.writeUInt16LE(8, 8);
        localHeader.writeUInt16LE(0, 10);
        localHeader.writeUInt16LE(0, 12);
        localHeader.writeUInt32LE(crc, 14);
        localHeader.writeUInt32LE(compressed.length, 18);
        localHeader.writeUInt32LE(file.data.length, 22);
        localHeader.writeUInt16LE(nameBuf.length, 26);
        localHeader.writeUInt16LE(0, 28);

        localChunks.push(localHeader, nameBuf, compressed);

        const centralHeader = Buffer.alloc(46);
        centralHeader.writeUInt32LE(0x02014b50, 0);
        centralHeader.writeUInt16LE(20, 4);
        centralHeader.writeUInt16LE(20, 6);
        centralHeader.writeUInt16LE(0x0800, 8);
        centralHeader.writeUInt16LE(8, 10);
        centralHeader.writeUInt16LE(0, 12);
        centralHeader.writeUInt16LE(0, 14);
        centralHeader.writeUInt32LE(crc, 16);
        centralHeader.writeUInt32LE(compressed.length, 20);
        centralHeader.writeUInt32LE(file.data.length, 24);
        centralHeader.writeUInt16LE(nameBuf.length, 28);
        centralHeader.writeUInt16LE(0, 30);
        centralHeader.writeUInt16LE(0, 32);
        centralHeader.writeUInt16LE(0, 34);
        centralHeader.writeUInt16LE(0, 36);
        centralHeader.writeUInt32LE(0, 38);
        centralHeader.writeUInt32LE(offset, 42);

        centralChunks.push(centralHeader, nameBuf);
        offset += localHeader.length + nameBuf.length + compressed.length;
      }

      const centralDir = Buffer.concat(centralChunks);
      const eocd = Buffer.alloc(22);
      eocd.writeUInt32LE(0x06054b50, 0);
      eocd.writeUInt16LE(0, 4);
      eocd.writeUInt16LE(0, 6);
      eocd.writeUInt16LE(files.length, 8);
      eocd.writeUInt16LE(files.length, 10);
      eocd.writeUInt32LE(centralDir.length, 12);
      eocd.writeUInt32LE(offset, 16);
      eocd.writeUInt16LE(0, 20);

      const zipBuffer = Buffer.concat([...localChunks, centralDir, eocd]);
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', 'attachment; filename="steward-project.zip"');
      res.setHeader('Content-Length', String(zipBuffer.length));
      res.send(zipBuffer);
    } catch (error) {
      console.error('Project download error:', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to package project download.',
      });
    }
  });

  // ---------------------------------------------------------------------------
  // 1. Advanced Document OCR & Extraction Endpoint
  // ---------------------------------------------------------------------------
  app.post('/api/documents/scan', async (req, res) => {
    try {
      const { imageBase64, mimeType, fileName, saveFile = true } = req.body as {
        imageBase64?: string;
        mimeType?: string;
        fileName?: string;
        saveFile?: boolean;
      };

      if (!imageBase64 || typeof imageBase64 !== 'string') {
        res.status(400).json({ error: 'Missing imageBase64 payload for OCR.' });
        return;
      }

      const cleanBase64 = imageBase64.includes(',')
        ? imageBase64.split(',')[1]
        : imageBase64;
      const safeMime = mimeType && /^image\/(jpeg|jpg|png|webp|gif)$/.test(mimeType)
        ? mimeType
        : 'image/jpeg';

      let imageUrl = '';
      if (saveFile) {
        const ext = safeMime === 'image/png' ? 'png' : safeMime === 'image/webp' ? 'webp' : 'jpg';
        const storedName = `scan_${Date.now()}_${crypto.randomBytes(4).toString('hex')}.${ext}`;
        const destPath = path.join(UPLOADS_DIR, storedName);
        fs.writeFileSync(destPath, Buffer.from(cleanBase64, 'base64'));
        imageUrl = `/api/uploads/${storedName}`;
      }

      const ai = getGenAIClient();
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: safeMime,
                data: cleanBase64,
              },
            },
            {
              text: `Perform thorough, high-accuracy Optical Character Recognition (OCR) on this scanned document (${fileName || 'document'}).
1. Transcribe ALL visible printed and handwritten text verbatim in fullText, preserving line breaks, headings, amounts, dates, account/reference numbers, phone numbers, addresses, and fine print.
2. Generate a concise title, classify into one of: ${CATEGORIES.join(', ')}.
3. Write a 1-2 sentence summary.
4. Extract keyDetails as "Label: Value" strings (e.g., "Amount Due: $148.00", "Due Date: 2026-12-01", "Provider: City Auto").
5. Detect any primary action/due/appointment date as YYYY-MM-DD in detectedDate (or empty string if none).
6. Propose 3-6 lowercase keyword tags for search indexing.
7. Suggest 0-3 actionable follow-up tasks with practical step-by-step help instructions.
8. Decide which single place this document belongs to, using the place tree below, and return its exact name in place — or an empty string if it belongs to the desk generally. Judge by what the document is about (the property, house, land, vehicle, or bill it concerns), never by who is holding it.

${PLACE_TREE_BRIEF}`,
            },
          ],
        },
        config: {
          systemInstruction:
            'You are a precision OCR and household records specialist. Never invent text that is not visible in the image; transcribe faithfully and extract structured dates and action items cleanly.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              category: {
                type: Type.STRING,
                enum: [...CATEGORIES],
              },
              ocrText: { type: Type.STRING },
              summary: { type: Type.STRING },
              detectedDate: { type: Type.STRING },
              place: {
                type: Type.STRING,
                enum: [
                  '',
                  'Riva Jade',
                  'Riva Jade — Homestead',
                  'Riva Jade — Rental Cabin',
                  'Riva Jade — Wildlife Conservancy',
                  'Oakleaf',
                  'Elephant Walk',
                ],
              },
              keyDetails: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              suggestedTags: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              suggestedTasks: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    title: { type: Type.STRING },
                    dueDate: { type: Type.STRING },
                    priority: { type: Type.STRING, enum: ['low', 'medium', 'high'] },
                    estimatedMinutes: { type: Type.INTEGER },
                    helpSteps: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING },
                    },
                  },
                },
              },
            },
            required: [
              'title',
              'category',
              'ocrText',
              'summary',
              'detectedDate',
              'keyDetails',
              'suggestedTags',
              'suggestedTasks',
            ],
          },
        },
      });

      const parsed = JSON.parse((response.text ?? '{}').trim());
      res.json({
        imageUrl,
        title: parsed.title || fileName || 'Scanned Document',
        category: CATEGORIES.includes(parsed.category) ? parsed.category : 'General',
        ocrText: parsed.ocrText || '',
        summary: parsed.summary || '',
        detectedDate: parsed.detectedDate || '',
        place: typeof parsed.place === 'string' ? parsed.place : '',
        keyDetails: Array.isArray(parsed.keyDetails) ? parsed.keyDetails.slice(0, 25) : [],
        suggestedTags: Array.isArray(parsed.suggestedTags)
          ? parsed.suggestedTags.map((t: string) => String(t).toLowerCase().trim()).filter(Boolean).slice(0, 12)
          : [],
        suggestedTasks: Array.isArray(parsed.suggestedTasks) ? parsed.suggestedTasks.slice(0, 4) : [],
      });
    } catch (error) {
      console.error('OCR scan error:', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to process document OCR.',
      });
    }
  });

  // ---------------------------------------------------------------------------
  // 2. Task Help Suggestions Endpoint
  // ---------------------------------------------------------------------------
  // Household calendar subscription feed. Calendar apps poll this URL; the
  // per-household token in the path is the only credential, and the owner
  // can regenerate it in Settings, which invalidates every older link.
  app.get('/api/calendar/:householdId/:token', async (req, res) => {
    const { householdId, token } = req.params;
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(householdId) || !/^[A-Za-z0-9_-]{1,64}$/.test(token)) {
      res.status(400).type('text/plain').send('Invalid calendar link.');
      return;
    }
    const db = await getAdminDb();
    if (!db) {
      res
        .status(503)
        .type('text/plain')
        .send('The calendar subscription feed is not configured on this server yet.');
      return;
    }
    try {
      const hhSnap = await db.doc(`households/${householdId}`).get();
      if (!hhSnap.exists) {
        res.status(404).type('text/plain').send('Calendar not found.');
        return;
      }
      const hh = hhSnap.data() as { name?: string; calendarToken?: string };
      if (!hh.calendarToken || hh.calendarToken !== token) {
        res.status(404).type('text/plain').send('Calendar not found.');
        return;
      }
      const tasksSnap = await db
        .collection('tasks')
        .where('householdId', '==', householdId)
        .get();
      const feedTasks = tasksSnap.docs.map((d) => {
        const data = d.data() as Record<string, unknown>;
        return {
          id: d.id,
          title: typeof data.title === 'string' ? data.title : 'Untitled',
          status: typeof data.status === 'string' ? data.status : '',
          dueDate: typeof data.dueDate === 'string' ? data.dueDate : '',
          dueTime: typeof data.dueTime === 'string' ? data.dueTime : '',
          estimatedMinutes:
            typeof data.estimatedMinutes === 'number' ? data.estimatedMinutes : 30,
          category: typeof data.category === 'string' ? data.category : '',
          notes: typeof data.notes === 'string' ? data.notes : '',
        };
      });
      const ics = buildIcsCalendar(
        feedTasks as unknown as ScheduleTask[],
        hh.name ? `${hh.name} — GiniApp` : 'GiniApp Family Calendar'
      );
      res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache');
      res.send(ics);
    } catch (err) {
      console.error('Calendar feed failed:', err);
      res
        .status(503)
        .type('text/plain')
        .send('The calendar subscription feed is not configured on this server yet.');
    }
  });

  // Restore a document photo from its Google Drive home copy. The client
  // sends the photo's stored filename plus its bytes; the file lands back in
  // the uploads folder under the same name, so the document's existing
  // imageUrl serves it again.
  app.post('/api/documents/restore-photo', (req, res) => {
    const { fileName, imageBase64 } = req.body as {
      fileName?: string;
      imageBase64?: string;
    };
    const safeName = path.basename(fileName || '');
    if (!/^[a-zA-Z0-9_\-\.]+$/.test(safeName) || !/\.(jpg|jpeg|png|webp)$/i.test(safeName)) {
      res.status(400).json({ error: 'Invalid file name for photo restore.' });
      return;
    }
    if (!imageBase64 || typeof imageBase64 !== 'string') {
      res.status(400).json({ error: 'Missing imageBase64 payload for photo restore.' });
      return;
    }
    const cleanBase64 = imageBase64.includes(',')
      ? imageBase64.split(',')[1]
      : imageBase64;
    const buffer = Buffer.from(cleanBase64, 'base64');
    if (buffer.length === 0 || buffer.length > 16 * 1024 * 1024) {
      res.status(400).json({ error: 'Photo payload is empty or too large.' });
      return;
    }
    fs.writeFileSync(path.join(UPLOADS_DIR, safeName), buffer);
    res.json({ ok: true, imageUrl: `/api/uploads/${safeName}` });
  });

  app.post('/api/tasks/suggest-help', async (req, res) => {
    try {
      const { title, category, type, dueDate, notes, linkedDocumentSummary, linkedDocumentOcr } =
        req.body as {
          title?: string;
          category?: string;
          type?: string;
          dueDate?: string;
          notes?: string;
          linkedDocumentSummary?: string;
          linkedDocumentOcr?: string;
        };

      if (!title) {
        res.status(400).json({ error: 'Task title is required.' });
        return;
      }

      const ai = getGenAIClient();
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `Provide practical, clear, step-by-step help for this ${type || 'task'}:
Title: ${title}
Category: ${category || 'General'}
Due Date: ${dueDate || 'Flexible'}
Notes: ${notes || 'None'}
${linkedDocumentSummary ? `Linked Document Summary: ${linkedDocumentSummary}` : ''}
${linkedDocumentOcr ? `Linked Document OCR Excerpt: ${linkedDocumentOcr.slice(0, 1500)}` : ''}

Return 4-6 concise, actionable steps covering preparation, documents or supplies to gather, common pitfalls to avoid, and time-saving tips.`,
        config: {
          systemInstruction:
            'You are a practical personal organizer helping someone complete real-world household, tax, car maintenance, church, community, social, and hobby tasks smoothly.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              steps: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              estimatedMinutes: { type: Type.INTEGER },
            },
            required: ['steps', 'estimatedMinutes'],
          },
        },
      });

      const parsed = JSON.parse((response.text ?? '{}').trim());
      res.json({
        steps: Array.isArray(parsed.steps) ? parsed.steps.slice(0, 10) : [],
        estimatedMinutes:
          typeof parsed.estimatedMinutes === 'number' ? parsed.estimatedMinutes : 30,
      });
    } catch (error) {
      console.error('Task help error:', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to generate task help.',
      });
    }
  });

  // ---------------------------------------------------------------------------
  // 3. AI-Powered Adaptive Task Prioritization Endpoint
  // ---------------------------------------------------------------------------
  app.post('/api/tasks/prioritize', async (req, res) => {
    try {
      const {
        currentDateTime,
        tasks,
        preferredFocusWindow,
        prefersQuickWinsFirst,
        behaviorSignals,
      } = req.body as {
        currentDateTime?: string;
        tasks?: Array<{
          id: string;
          title: string;
          category: string;
          dueDate: string;
          dueTime?: string;
          priority: string;
          estimatedMinutes: number;
          source: 'personal' | 'shared';
          projectName?: string;
          notes?: string;
        }>;
        preferredFocusWindow?: string;
        prefersQuickWinsFirst?: boolean;
        behaviorSignals?: string[];
      };

      if (!Array.isArray(tasks) || tasks.length === 0) {
        res.status(400).json({ error: 'At least one pending task is required for prioritization.' });
        return;
      }

      const ai = getGenAIClient();
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `Current Local Date/Time: ${currentDateTime || new Date().toISOString()}
User Learned Preferences:
- Preferred Focus Window: ${preferredFocusWindow || 'balanced'}
- Prefers Quick Wins First: ${Boolean(prefersQuickWinsFirst)}
- Observed User Behavior & Override History:
${Array.isArray(behaviorSignals) && behaviorSignals.length > 0 ? behaviorSignals.map((s) => `  * ${s}`).join('\n') : '  * No manual overrides yet; establish clean baseline.'}

Pending Tasks to Prioritize:
${JSON.stringify(tasks, null, 2)}

Analyze deadlines (overdue vs today vs upcoming), user-assigned importance (high/medium/low), estimated completion times (minutes), and the observed behavioral history above. Produce an adaptive ranked execution plan for today.`,
        config: {
          systemInstruction:
            'You are an adaptive personal productivity engine. Rank tasks realistically by urgency, importance, estimated effort, and learned user habits. Explicitly reflect user behavior signals when explaining why items are ranked.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              dailyStrategy: { type: Type.STRING },
              learnedInsight: { type: Type.STRING },
              rankedTasks: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    taskId: { type: Type.STRING },
                    rank: { type: Type.INTEGER },
                    timeBlock: { type: Type.STRING },
                    urgencyScore: { type: Type.INTEGER },
                    reason: { type: Type.STRING },
                    adaptiveNote: { type: Type.STRING },
                  },
                  required: ['taskId', 'rank', 'timeBlock', 'urgencyScore', 'reason', 'adaptiveNote'],
                },
              },
            },
            required: ['dailyStrategy', 'learnedInsight', 'rankedTasks'],
          },
        },
      });

      const parsed = JSON.parse((response.text ?? '{}').trim());
      res.json(parsed);
    } catch (error) {
      console.error('AI prioritization error:', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to prioritize tasks.',
      });
    }
  });

  // ---------------------------------------------------------------------------
  // 3b. Wimberley, TX Real-Time Weather & Hill Country Advisories (NOAA/NWS)
  // ---------------------------------------------------------------------------
  app.get('/api/property/wimberley-weather', async (_req, res) => {
    try {
      const headers = {
        'User-Agent': 'Steward-Wimberley-Monitor/1.0 (steward@local)',
        Accept: 'application/geo+json',
      };
      const [forecastRes, hourlyRes, alertsRes] = await Promise.all([
        fetch('https://api.weather.gov/gridpoints/EWX/142,80/forecast', { headers }),
        fetch('https://api.weather.gov/gridpoints/EWX/142,80/forecast/hourly', { headers }),
        fetch('https://api.weather.gov/alerts/active?point=30.0024,-98.0986', { headers }),
      ]);

      if (!forecastRes.ok) {
        res.status(502).json({
          error: `NOAA weather service returned HTTP ${forecastRes.status} for Wimberley, TX.`,
        });
        return;
      }

      type NwsPeriod = {
        name?: string;
        startTime?: string;
        isDaytime?: boolean;
        temperature?: number;
        windSpeed?: string;
        relativeHumidity?: { value?: number | null };
        probabilityOfPrecipitation?: { value?: number | null };
        shortForecast?: string;
      };

      const forecastJson = (await forecastRes.json()) as {
        properties?: { periods?: NwsPeriod[] };
      };
      const hourlyJson = hourlyRes.ok
        ? ((await hourlyRes.json()) as { properties?: { periods?: NwsPeriod[] } })
        : { properties: { periods: [] } };
      const alertsJson = alertsRes.ok
        ? ((await alertsRes.json()) as {
            features?: Array<{
              properties?: { event?: string; headline?: string; severity?: string };
            }>;
          })
        : { features: [] };

      const periods = forecastJson.properties?.periods ?? [];
      const hourlyPeriods = hourlyJson.properties?.periods ?? [];
      const currentPeriod = hourlyPeriods[0] || periods[0];

      const parseWindMph = (raw?: string): number => {
        if (!raw) return 0;
        const nums = raw.match(/\d+/g);
        if (!nums || nums.length === 0) return 0;
        return Number(nums[nums.length - 1]) || 0;
      };

      const curTemp = Math.round(currentPeriod?.temperature ?? 65);
      const curWind = parseWindMph(currentPeriod?.windSpeed);
      const curHumidity = Math.round(currentPeriod?.relativeHumidity?.value ?? 50);
      const curPrecipProb = Math.round(currentPeriod?.probabilityOfPrecipitation?.value ?? 0);

      // Build 5-day high/low summary from NWS day/night periods
      const dayMap = new Map<
        string,
        { date: string; tempMaxF: number; tempMinF: number; precipIn: number; precipProbPct: number }
      >();
      for (const p of periods) {
        const date = (p.startTime || '').slice(0, 10);
        if (!date) continue;
        const temp = Math.round(p.temperature ?? curTemp);
        const prob = Math.round(p.probabilityOfPrecipitation?.value ?? 0);
        const existing = dayMap.get(date) || {
          date,
          tempMaxF: temp,
          tempMinF: temp,
          precipIn: 0,
          precipProbPct: prob,
        };
        existing.tempMaxF = Math.max(existing.tempMaxF, temp);
        existing.tempMinF = Math.min(existing.tempMinF, temp);
        existing.precipProbPct = Math.max(existing.precipProbPct, prob);
        dayMap.set(date, existing);
      }
      const daily = Array.from(dayMap.values()).slice(0, 5);

      const advisories: Array<{ title: string; severity: 'info' | 'watch' | 'alert'; detail: string }> = [];

      // Official NOAA/NWS active alerts for Hays County / Wimberley
      for (const feat of (alertsJson.features ?? []).slice(0, 3)) {
        const ev = feat.properties?.event;
        const hl = feat.properties?.headline;
        if (ev) {
          advisories.push({
            title: `NWS Alert: ${ev}`,
            severity: 'alert',
            detail: hl || `Active National Weather Service advisory for Wimberley / Hays County.`,
          });
        }
      }

      const minUpcoming = daily.reduce((min, d) => Math.min(min, d.tempMinF), curTemp);
      if (minUpcoming <= 34) {
        advisories.push({
          title: 'Freeze Protection Watch',
          severity: 'alert',
          detail: `Low near ${minUpcoming}°F expected. Verify cabin well house heat lamp, exposed pipe insulation, and rainwater cistern valve drainage.`,
        });
      }

      const maxPrecipProb = daily.reduce((max, d) => Math.max(max, d.precipProbPct), curPrecipProb);
      if (maxPrecipProb >= 60) {
        advisories.push({
          title: 'Runoff & Low-Water Crossing Watch',
          severity: 'watch',
          detail: `Up to ${maxPrecipProb}% rain chance in forecast. Check conservancy creek erosion berms, cabin gutters, and alert incoming guests about Hill Country low-water crossings.`,
        });
      }

      const maxUpcoming = daily.reduce((max, d) => Math.max(max, d.tempMaxF), curTemp);
      if (maxUpcoming >= 95 || (curHumidity <= 25 && curWind >= 15)) {
        advisories.push({
          title: 'Heat & Wildfire / Brush Watch',
          severity: 'watch',
          detail: `High heat (${maxUpcoming}°F) or dry gusty wind (${curWind} mph, ${curHumidity}% RH). Inspect cabin HVAC strain, firepit spark screens, and cedar brush defensible space.`,
        });
      }

      const centralMonth = Number(
        new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', month: 'numeric' }).format(
          new Date()
        )
      );
      if (centralMonth >= 2 && centralMonth <= 6) {
        advisories.push({
          title: 'Oak Wilt Pruning Restriction Window (Feb–Jun)',
          severity: 'info',
          detail:
            'Texas Hill Country oak wilt beetle season is active. Avoid pruning live oaks or red oaks unless emergency storm damage requires immediate wound-paint sealing.',
        });
      } else {
        advisories.push({
          title: 'Hill Country Land & Oak Pruning Window',
          severity: 'info',
          detail:
            'Outside peak oak wilt vector months (Feb–Jun): good seasonal window for selective cedar clearing, oak trimming (always seal cuts), and wildlife habitat maintenance.',
        });
      }

      res.json({
        location: 'Wimberley, TX (Hays County · NOAA EWX)',
        fetchedAtIso: new Date().toISOString(),
        current: {
          temperatureF: curTemp,
          apparentTemperatureF: curTemp,
          humidityPct: curHumidity,
          windMph: curWind,
          precipitationIn: 0,
          conditionLabel: currentPeriod?.shortForecast || 'Clear',
        },
        daily,
        advisories,
      });
    } catch (error) {
      console.error('Wimberley weather fetch error:', error);
      res.status(502).json({
        error:
          error instanceof Error
            ? error.message
            : 'Unable to reach NOAA weather service for Wimberley, TX.',
      });
    }
  });

  // ---------------------------------------------------------------------------
  // 3c. AI Wimberley Conservancy & Rental Cabin Advisory Endpoint
  // ---------------------------------------------------------------------------
  app.post('/api/property/advise', async (req, res) => {
    try {
      const { currentDate, weatherSummary, entries, linkedDocsSummary } = req.body as {
        currentDate?: string;
        weatherSummary?: string;
        entries?: Array<{
          area: string;
          title: string;
          status: string;
          scheduledDate: string;
          endDate?: string;
          cadence: string;
          notes?: string;
        }>;
        linkedDocsSummary?: string;
      };

      const ai = getGenAIClient();
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `Date (Central Time): ${currentDate || new Date().toISOString().slice(0, 10)}
Location: Riva Jade, the family property in Wimberley, TX (Hays County / Texas Hill Country) — 21.6 acres on the Blanco River:
1) The homestead is 1 acre: the main house, the barn, the big shop, a little shop, a storage shed, and the separate rental cabin.
2) The other 20.6 acres are a wildlife conservancy: the riverfront, windmills, bird houses and bat houses, and acreage left natural — deadfall stays where it falls, and there are no improvements beyond supporting Texas native flora and fauna. Stewardship protects that natural state and is the work the wildlife exemption documents: maintaining the land natively, supplemental water supplies for wildlife, sanctuaries for birds, ducks, and bats, removing invasive species, and supporting native species (also native grasses, live/red oaks, oak wilt prevention, Ashe juniper/cedar management, rainwater cistern/well, boundary fencing, wildlife valuation records, creek erosion). Conservancy expenses are tracked apart because they answer to the conservancy's own tax rules, separate from the homestead's and the rental cabin's. Never recommend clearing deadfall, mowing the natural acreage, or building in the conservancy.
3) Rental Cabin operations (guest turnovers, smart lock codes, septic/aerobic system, HVAC filters, propane tank, smoke/CO detectors, well pump & water filtration).

Live Weather & Environmental Context:
${weatherSummary || 'Unavailable'}

Current Property Monitor Entries:
${Array.isArray(entries) && entries.length > 0 ? JSON.stringify(entries, null, 2) : 'None logged yet.'}

Related Scanned Property Documents:
${linkedDocsSummary || 'None linked yet.'}

Generate a focused seasonal stewardship and rental cabin action plan with 4-6 specific recommendations tailored to Wimberley, TX conditions and any gaps or urgent statuses above.`,
        config: {
          systemInstruction:
            'You are a Texas Hill Country land stewardship and short-term rental cabin operations advisor specializing in Wimberley, TX (Hays County). Give concrete, actionable maintenance and conservancy recommendations.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              seasonalSummary: { type: Type.STRING },
              conservancyFocus: { type: Type.STRING },
              cabinReadinessFocus: { type: Type.STRING },
              recommendations: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    title: { type: Type.STRING },
                    area: {
                      type: Type.STRING,
                      enum: ['conservancy', 'cabin_maintenance', 'cabin_stay'],
                    },
                    cadence: {
                      type: Type.STRING,
                      enum: ['once', 'monthly', 'quarterly', 'seasonal', 'annual'],
                    },
                    priority: { type: Type.STRING, enum: ['low', 'medium', 'high'] },
                    suggestedDate: { type: Type.STRING },
                    reason: { type: Type.STRING },
                  },
                  required: ['title', 'area', 'cadence', 'priority', 'suggestedDate', 'reason'],
                },
              },
            },
            required: [
              'seasonalSummary',
              'conservancyFocus',
              'cabinReadinessFocus',
              'recommendations',
            ],
          },
        },
      });

      const parsed = JSON.parse((response.text ?? '{}').trim());
      res.json(parsed);
    } catch (error) {
      console.error('Wimberley property advisory error:', error);
      res.status(500).json({
        error:
          error instanceof Error
            ? error.message
            : 'Failed to generate Wimberley property guidance.',
      });
    }
  });

  // ---------------------------------------------------------------------------
  // 3d. Cross-App AI Assistant Endpoint
  // ---------------------------------------------------------------------------
  // -------------------------------------------------------------------------
  // Supervisor & desks (Jason's ruling, 2026-11-19)
  //
  // A small routing call reads the user's latest message and picks a desk.
  // The desk's call then carries ONLY that desk's slices of the workspace
  // snapshot and may offer ONLY that desk's actions — the lanes and the
  // savings come from what each call is given, not from asking the model to
  // behave. If routing fails for any reason, the request falls back to the
  // general desk, which is exactly the pre-supervisor behavior: every slice,
  // every action. The voice path and the document scan are unchanged.
  //
  // Model sizes are settings, not structure: SUPERVISOR_MODEL routes,
  // DESK_MODEL does the desks' work. Both default to the model this app
  // already runs on; change them here, in one place, when the household's
  // API tier makes a different trade the right one.
  // -------------------------------------------------------------------------
  const SUPERVISOR_MODEL = 'gemini-4-hydrogen';
  const DESK_MODEL = 'gemini-4-hydrogen';

  const SUPERVISOR_RULES = `

SUPERVISOR RULES — these bind every desk, whatever the user asks:
- Nothing is ever deleted. If the user asks to remove something, explain that the desk keeps everything, and offer to mark or correct it instead.
- The family's standing rule for its records: never offer more information than what is legally obligated. The most recent 3 years of any place are freely shown to the household. For anything older, or for any summary meant for someone outside the household, ask who it is for and which agency or purpose needs it before providing it.
- Stay in your desk's lane. If part of a request belongs to another desk, say which desk it belongs to, answer only your part, and let the user ask that desk.`;

  // Front door (Jason, 2026-11-20): the desks mostly serve one person at
  // one big simple screen. She may be listening rather than reading, she
  // answers by voice or by tapping big buttons, and a request the desk
  // cannot fill is never a dead end — it becomes a note for Jason.
  const FRONT_DOOR_RULES = `

FRONT DOOR — how you speak with her (these bind every desk):
- Address the user by the address name given in the request when one is provided (for Mom, "Ms. Gini"). Use it naturally, the way a person at a front desk would — in greetings, in confirmations, and when you ask her something.
- Write every reply so it can be read aloud exactly as written: plain words, short sentences, no jargon, no markdown. She may be listening, not reading.
- When you ask her a question whose answers are a small known set, put those answers in "choices" as short labels (at most 5) AND ask the question in your reply. The screen shows the choices as big buttons; she may tap one or answer in her own words — both count the same.
- When you cannot do something she asked — it is outside this desk, outside the app, or not possible right now — never leave it there. Say plainly that you are sorry and that you cannot do that right now, say that you have noted the request and will talk to Jason about fixing it, and include a "note_for_jason" action whose payload says what she asked for. Never claim you did something you did not do.
- End every completed piece of work by saying exactly what was done, naming the place and the branch it belongs to, so she can catch a mistake: what was filed or recorded, where it belongs, and what happens to it next.`;

  // Everyday lane weather: a plain-word summary for one place, fetched
  // from the National Weather Service (no key, no cost) only when the
  // latest message is about the weather. Returns '' on any failure; the
  // desk then answers with the can't-do wording instead of inventing a
  // forecast.
  async function fetchNwsEverydaySummary(
    lat: number,
    lon: number,
    label: string
  ): Promise<string> {
    try {
      const headers = {
        'User-Agent': 'Steward-Everyday/1.0 (steward@local)',
        Accept: 'application/geo+json',
      };
      const pointsRes = await fetch(`https://api.weather.gov/points/${lat},${lon}`, {
        headers,
      });
      if (!pointsRes.ok) return '';
      const pointsJson = (await pointsRes.json()) as {
        properties?: { gridId?: string; gridX?: number; gridY?: number };
      };
      const gp = pointsJson.properties || {};
      if (!gp.gridId || gp.gridX == null || gp.gridY == null) return '';
      const fcRes = await fetch(
        `https://api.weather.gov/gridpoints/${gp.gridId}/${gp.gridX},${gp.gridY}/forecast`,
        { headers }
      );
      if (!fcRes.ok) return '';
      const fcJson = (await fcRes.json()) as {
        properties?: {
          periods?: Array<{
            name?: string;
            temperature?: number;
            shortForecast?: string;
            probabilityOfPrecipitation?: { value?: number | null };
          }>;
        };
      };
      const periods = (fcJson.properties?.periods || []).slice(0, 4);
      if (periods.length === 0) return '';
      const lines = periods.map((per) => {
        const rain = per.probabilityOfPrecipitation?.value;
        return `${per.name || 'Coming up'}: ${per.shortForecast || 'fair'}, around ${Math.round(
          per.temperature ?? 0
        )} degrees${rain ? `, ${Math.round(rain)}% chance of rain` : ''}`;
      });
      return `${label} — ${lines.join('; ')}.`;
    } catch {
      return '';
    }
  }

  type DeskId = 'records' | 'appointments' | 'finance' | 'general';
  type DeskSlice = 'tasks' | 'wimberley' | 'finances' | 'documents' | 'everyday';
  type DeskAction =
    | 'create_task'
    | 'log_expense'
    | 'create_property_entry'
    | 'open_drive_backup'
    | 'navigate'
    | 'note_for_jason'
    | 'capture_document'
    | 'complete_task'
    | 'show_calendar';
  interface Desk {
    label: string;
    slices: DeskSlice[];
    actions: DeskAction[];
    brief: string;
  }

  // The morning briefing's brief (Jason, 2026-11-20): the article's
  // lesson applied — one narrow job, a prepared pile of the day's own
  // records, a fixed shape, nothing invented. It is written to be read
  // aloud by the front door, in the plain words of the house.
  const BRIEFING_BRIEF = `
THE MORNING BRIEFING: Write this household's morning briefing from the records below. It will be read aloud, so write plain, warm, spoken sentences — no lists of codes, no jargon, no exclamation marks.
- Open with the day and a one-line greeting using the reader's address name if one is given.
- FIRST THINGS: anything overdue, then the most important thing due today. Name what it is and when it was due or is due.
- TODAY: today's appointments and tasks, with times where the records give them.
- COMING UP: tomorrow and the next few days, briefly.
- WAITING: overdue items are things the household is still waiting to get done — say so plainly. If the records mention notes waiting for Jason, say how many are waiting for him.
- DONE LATELY: what was finished in the last few days — what it was, when it was done, and whether it was finished for good or has more to do.
Skip any section the records leave empty. Never invent a task, a time, a person, or a fact that is not in the records. Keep the whole briefing under about 180 words. Separate the sections with a blank line, and start each section (after the greeting) with its plain heading: "First things." / "Today." / "Coming up." / "Waiting." / "Done lately."`;

  // The personal mail add-on's brief (Jason, 2026-11-20): the fence is
  // structural — mail is read only for the reader's own add-on, saved
  // only where that reader alone can see it, and never enters the
  // household's shared briefing. Dates, times, and amounts are quoted
  // exactly as the mail states them, so the reader can check the
  // desk's records against them — planning and accuracy both.
  // The circle briefing's brief (Jason, 2026-11-21): briefings are
  // drawn by circles of contact — this add-on is written from the
  // records the reader's family ring and hand-drawn circles hold,
  // and it is personal: saved only where the reader alone can see
  // it, never folded into the household's shared briefing. Only
  // lines the reader's circles actually hold may be named; the
  // desk invents nothing and mentions no circle the reader is
  // not in.
  const CIRCLES_BRIEF = `
FROM YOUR WIDER CIRCLES: Write a short personal add-on to this reader's morning briefing from the family and circle records below — the things held beyond their household: family business, circle plans, trips being arranged, dates the wider family is keeping.
- Name what is coming up for the family or the circles, with its date exactly as written.
- Name anything waiting on the reader from someone in the wider family.
- Keep the tone plain and warm; it will be read aloud.
- Never invent a person, a plan, a date, or an amount that is not in the lines below, and never mention a circle or a record that is not in the lines below.
Keep it under about 120 words. If the wider circles hold nothing that needs the reader, say exactly that in one friendly line.`;

  const MAIL_BRIEF = `
FROM YOUR MAIL: Write a short personal add-on to this reader's morning briefing from their own recent mail lines below. It will be read aloud, so write plain, warm, spoken sentences.
- Name what needs the reader: a message asking them for something, a bill, a deadline — sender and subject in plain words.
- Name what the reader has been waiting on, when a message answers it or shows it is still outstanding.
- When a message states a date, a time, an amount, or an appointment, give it exactly as written, so the reader can check it against the desk's records.
- Skip newsletters, advertisements, and automated notices unless they carry a bill or a deadline.
- Never invent a sender, a subject, a date, or an amount that is not in the lines below.
Keep it under about 120 words. If nothing in the mail needs the reader, say exactly that in one friendly line.`;

  const DESKS: Record<DeskId, Desk> = {
    records: {
      label: 'Records desk',
      slices: ['documents', 'wimberley'],
      actions: ['create_property_entry', 'open_drive_backup', 'navigate', 'capture_document', 'note_for_jason'],
      brief: `

YOUR DESK: Records. You handle the document vault and the property record: finding papers, saying where a paper is, what a document says, property entries and history, and Drive backups. You do not schedule appointments or record spending; those belong to the Appointments and Finance desks.

CAPTURING A PAPER: when she wants to file a receipt or a paper, first settle where it belongs. If she names the place, use it. For Wimberley, if the branch is not clear, ask which branch it belongs to — the homestead, the rental cabin, or the conservancy — and offer exactly those as choices ("Homestead", "Rental Cabin", "Conservancy"). Once the place is settled, tell her you can file it for her as soon as she takes a picture of it, and offer the "capture_document" action with that place in its payload. The app opens the camera with the place already chosen, reads the paper, and files it under that place.`,
    },
    appointments: {
      label: 'Appointments desk',
      slices: ['tasks'],
      actions: ['create_task', 'complete_task', 'show_calendar', 'navigate', 'note_for_jason'],
      brief: `

YOUR DESK: Appointments. You handle the schedule: tasks, appointments, due dates, reminders, and what is coming up. You do not search the document vault or record spending; those belong to the Records and Finance desks.

FINISHED, OR MORE TO DO: when she says she has done something on the schedule, do not simply mark it. If she has not said whether that is the end of it, ask once — "Is that finished, or is there more to do on it later?" — with choices "Finished with it" and "There's more to do". Then offer the "complete_task" action carrying her answer: completionState "finished", or "more" with remainderNote naming what is left, in her words. The app marks the item done, and when there is more, puts what is left back on the schedule as a new open item for today, so nothing is lost.

DID I ALREADY: when she asks whether she already did something, answer from the Recent Completed list in the snapshot: name what it was, the day it was done, and whether it was finished for good or has more to do — and if more, what the more is. If it is not on that list, say you do not see it done; never guess.

SEEING THE CALENDAR: when she asks to see or look at the calendar itself — not to hear what is on it, but to look at it — offer the "show_calendar" action. The app puts the calendar in front of her and reads her the short version.`,
    },
    finance: {
      label: 'Finance desk',
      slices: ['finances'],
      actions: ['log_expense', 'navigate', 'note_for_jason'],
      brief: `

YOUR DESK: Finance. You handle money records: logging expenses and income, totals and groupings, and the per-agency record windows in the place brief. You do not schedule appointments or search the document vault; those belong to the Appointments and Records desks.`,
    },
    general: {
      label: 'General desk',
      slices: ['tasks', 'wimberley', 'finances', 'documents', 'everyday'],
      actions: [
        'create_task',
        'complete_task',
        'show_calendar',
        'log_expense',
        'create_property_entry',
        'open_drive_backup',
        'navigate',
        'note_for_jason',
        'capture_document',
      ],
      brief: `

YOUR DESK: General. This request spans more than one desk or does not fit one, so you have the whole workspace and every action. Handle it whole.

THE EVERYDAY LANE: you also answer small everyday questions that are not about the records — the weather above all. When the snapshot carries live weather for her places (section 5), answer from it in plain words: what it is like now, what is coming, anything she should dress for or watch for. If no live weather was fetched, say so plainly, apologize, and note it for Jason like any request you cannot fill. Everyday answers never change the records, the money, or the calendar.

Marking things done, answering "did I already" questions, and showing her the calendar follow the same rules as the Appointments desk: ask finished-or-more before marking anything done and offer "complete_task" with her answer, answer did-I-already only from the Recent Completed list, and offer "show_calendar" when she wants to look at the calendar itself.`,
    },
  };

  const DESK_ROUTER_BRIEF = `You route one household message to exactly one desk.
- "records": finding or reading papers and documents, where a paper is, property entries and property history, backups.
- "appointments": scheduling, tasks, appointments, due dates, reminders, what is coming up, what she has already done, marking things done, and seeing the calendar.
- "finance": money — spending, income, totals, bills, record windows for an agency.
- "general": anything mixed, unclear, or outside the other three.
Answer with the desk id only.`;

  async function routeDesk(
    ai: ReturnType<typeof getGenAIClient>,
    lastUserText: string
  ): Promise<DeskId> {
    try {
      const response = await ai.models.generateContent({
        model: SUPERVISOR_MODEL,
        contents: `Latest message from the user:\n${lastUserText.slice(0, 1000)}`,
        config: {
          systemInstruction: DESK_ROUTER_BRIEF,
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              desk: {
                type: Type.STRING,
                enum: ['records', 'appointments', 'finance', 'general'],
              },
            },
            required: ['desk'],
          },
        },
      });
      const parsed = JSON.parse((response.text ?? '{}').trim()) as { desk?: string };
      if (parsed.desk && parsed.desk in DESKS) {
        return parsed.desk as DeskId;
      }
    } catch (err) {
      console.error('Supervisor routing failed; using the general desk:', err);
    }
    return 'general';
  }

  function actionDocLines(actions: DeskAction[]): string {
    const docs: Record<DeskAction, string> = {
      create_task: `- "create_task": {"title":string,"category":one of ${JSON.stringify(CATEGORIES)},"place":"Riva Jade"|"Riva Jade — Homestead"|"Riva Jade — Rental Cabin"|"Riva Jade — Wildlife Conservancy"|"Oakleaf"|"Elephant Walk"|"","type":"task"|"appointment","dueDate":"YYYY-MM-DD","dueTime":"HH:MM" or "","priority":"low"|"medium"|"high","estimatedMinutes":number,"notes":string}`,
      log_expense: `- "log_expense": {"title":string,"amount":number,"group":"Conservancy"|"Home Repairs"|"Rental Upkeep"|"Groceries"|"Medical - Mom"|"Medical - Jason"|"Utilities & Propane"|"Taxes & Insurance"|"Car & Maintenance"|"Church & Community"|"Rental Income"|"General","kind":"expense"|"income","vendor":string,"entryDate":"YYYY-MM-DD","place":"Riva Jade"|"Riva Jade — Homestead"|"Riva Jade — Rental Cabin"|"Riva Jade — Wildlife Conservancy"|"Oakleaf"|"Elephant Walk"|"","careForJason":boolean,"taxDeductible":boolean,"notes":string}`,
      create_property_entry: `- "create_property_entry": {"title":string,"place":"Riva Jade"|"Riva Jade — Homestead"|"Riva Jade — Rental Cabin"|"Riva Jade — Wildlife Conservancy"|"Oakleaf"|"Elephant Walk"|"","area":"conservancy"|"cabin_maintenance"|"cabin_stay","status":"nominal"|"attention"|"urgent"|"upcoming"|"ready"|"completed","scheduledDate":"YYYY-MM-DD","cadence":"once"|"monthly"|"quarterly"|"seasonal"|"annual","inspectorOrGuest":string,"notes":string}`,
      open_drive_backup: `- "open_drive_backup": {"reason":string}`,
      navigate: `- "navigate": {"tab":"schedule"|"property"|"finances"|"vault"|"projects"|"voice"|"analytics"}`,
      note_for_jason: `- "note_for_jason": {"request":string — what the user asked for that this desk could not do, in plain words}`,
      capture_document: `- "capture_document": {"place":"Riva Jade"|"Riva Jade — Homestead"|"Riva Jade — Rental Cabin"|"Riva Jade — Wildlife Conservancy"|"Oakleaf"|"Elephant Walk"|""}`,
      complete_task: `- "complete_task": {"titleQuery":string — words from the title of the open item she says is done,"completionState":"finished"|"more","remainderNote":string — what is left to do, in her words, or ""}`,
      show_calendar: `- "show_calendar": {"reason":string}`,
    };
    return actions.map((a) => docs[a]).join('\n          ');
  }


  // The morning briefing (Jason, 2026-11-20): the client builds a
  // summary of the day's records, this route makes the one model call,
  // and the client saves the result — one call per household per day.
  app.post('/api/assistant/briefing', async (req, res) => {
    try {
      const { context, kind } = req.body as {
        kind?: string;
        context?: {
          userName?: string;
          addressName?: string;
          currentDateTime?: string;
          briefingSummary?: string;
          mailSummary?: string;
          circleSummary?: string;
          aiAccess?: boolean;
        };
      };
      const ctx = context || {};
      // The account holder's own switch (Jason, 2026-11-21): the
      // assistant does no work at all for an account that turned it
      // off, whatever the screen asks.
      if (ctx.aiAccess === false) {
        res.status(403).json({ error: 'The assistant is turned off for this account.' });
        return;
      }
      const isMail = kind === 'mail';
      const isCircles = kind === 'circles';
      const summary = String(ctx.briefingSummary || '').slice(0, 6000);
      const mailSummary = String(ctx.mailSummary || '').slice(0, 4000);
      const circleSummary = String(ctx.circleSummary || '').slice(0, 6000);
      if (isMail ? !mailSummary.trim() : isCircles ? !circleSummary.trim() : !summary.trim()) {
        res.status(400).json({
          error: isMail
            ? 'Mail lines are required for a mail add-on.'
            : isCircles
              ? 'Circle lines are required for a circle add-on.'
              : 'A summary of the day\'s records is required.',
        });
        return;
      }
      const ai = getGenAIClient();
      const requestPayload = {
        model: DESK_MODEL,
        contents: isMail
          ? `Current Date/Time: ${ctx.currentDateTime || new Date().toISOString()}
Reader: ${ctx.userName || 'GiniApp User'}${ctx.addressName ? `\nAddress them as: ${ctx.addressName}` : ''}

THE READER'S OWN RECENT MAIL LINES:
${mailSummary}

Write the mail add-on now, following your brief exactly.`
          : isCircles
            ? `Current Date/Time: ${ctx.currentDateTime || new Date().toISOString()}
Reader: ${ctx.userName || 'GiniApp User'}${ctx.addressName ? `\nAddress them as: ${ctx.addressName}` : ''}

WHAT THE READER'S FAMILY AND CIRCLES HOLD:
${circleSummary}

Write the circle add-on now, following your brief exactly.`
            : `Current Date/Time: ${ctx.currentDateTime || new Date().toISOString()}
Reader: ${ctx.userName || 'GiniApp User'}${ctx.addressName ? `\nAddress them as: ${ctx.addressName}` : ''}

THE HOUSEHOLD'S RECORDS FOR THE BRIEFING:
${summary}

Write the morning briefing now, following your brief exactly.`,
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          systemInstruction: isMail
            ? 'You are GiniApp, the family desk. You write one reader\'s personal mail add-on from the mail lines you are given, and nothing else.' +
              MAIL_BRIEF
            : isCircles
              ? 'You are GiniApp, the family desk. You write one reader\'s personal circle add-on from the family and circle records you are given, and nothing else.' +
                CIRCLES_BRIEF
              : 'You are GiniApp, the family desk. You write the morning briefing from the household records you are given, and nothing else.' +
                PLACE_TREE_BRIEF +
                BRIEFING_BRIEF,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              briefing: { type: Type.STRING },
            },
            required: ['briefing'],
          },
        },
      };

      let response;
      try {
        response = await ai.models.generateContent(requestPayload);
      } catch (firstErr) {
        const msg = firstErr instanceof Error ? firstErr.message : String(firstErr);
        if (/503|UNAVAILABLE|high demand/i.test(msg)) {
          await new Promise((r) => setTimeout(r, 1200));
          response = await ai.models.generateContent(requestPayload);
        } else {
          throw firstErr;
        }
      }

      const parsed = JSON.parse((response.text ?? '{}').trim()) as { briefing?: string };
      const briefing = String(parsed.briefing || '').trim().slice(0, 4000);
      if (!briefing) {
        res.status(502).json({ error: 'The briefing came back empty.' });
        return;
      }
      res.json({ briefing });
    } catch (error) {
      console.error('Morning briefing error:', error);
      let readable =
        error instanceof Error ? error.message : 'Failed to prepare the morning briefing.';
      try {
        const parsedErr = JSON.parse(readable) as { error?: { message?: string } };
        if (parsedErr?.error?.message) {
          readable = parsedErr.error.message;
        }
      } catch {
        // keep the raw message
      }
      res.status(500).json({ error: readable });
    }
  });

  app.post('/api/assistant/chat', async (req, res) => {
    try {
      const { messages, context } = req.body as {
        messages?: Array<{ role: 'user' | 'assistant'; text: string }>;
        context?: {
          userName?: string;
          addressName?: string;
          currentDateTime?: string;
          tasksSummary?: string;
          wimberleySummary?: string;
          financesSummary?: string;
          documentsSummary?: string;
          driveConnected?: boolean;
          aiAccess?: boolean;
          aiWrite?: boolean;
        };
      };

      if (context?.aiAccess === false) {
        res.status(403).json({ error: 'The assistant is turned off for this account.' });
        return;
      }

      if (!Array.isArray(messages) || messages.length === 0) {
        res.status(400).json({ error: 'At least one user message is required.' });
        return;
      }

      const recentHistory = messages
        .slice(-14)
        .map((m) => `${m.role === 'assistant' ? 'Assistant' : 'User'}: ${String(m.text || '').slice(0, 2000)}`)
        .join('\n');

      const ctx = context || {};
      const ai = getGenAIClient();

      // Supervisor: route this message to a desk. The desk decides what
      // this call sees and which actions it may offer. Any routing
      // failure lands on the general desk — the pre-supervisor behavior.
      const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user');
      const deskId = await routeDesk(ai, lastUserMessage?.text || '');
      const desk = DESKS[deskId];
      const sumTasks = desk.slices.includes('tasks')
        ? ctx.tasksSummary || 'No tasks recorded yet.'
        : 'Not shown to this desk.';
      const sumWimberley = desk.slices.includes('wimberley')
        ? ctx.wimberleySummary || 'No property entries recorded yet.'
        : 'Not shown to this desk.';
      const sumFinances = desk.slices.includes('finances')
        ? ctx.financesSummary || 'No financial entries recorded yet.'
        : 'Not shown to this desk.';
      const sumDocuments = desk.slices.includes('documents')
        ? ctx.documentsSummary || 'No scanned documents yet.'
        : 'Not shown to this desk.';
      // Everyday lane: live weather for her two places, fetched only when
      // the general desk takes the message and the message is about the
      // weather. Any failure leaves the section empty, and the desk
      // answers with the can't-do wording rather than a made-up forecast.
      let everydaySummary = '';
      if (
        deskId === 'general' &&
        /\b(weather|forecast|rain|raining|snow|temperature|cold|hot|freeze|storm|sunny|cloudy)\b/i.test(
          lastUserMessage?.text || ''
        )
      ) {
        const [wimberley, lafayette] = await Promise.all([
          fetchNwsEverydaySummary(30.0024, -98.0986, 'Wimberley, Texas (Riva Jade)'),
          fetchNwsEverydaySummary(30.2241, -92.0198, 'Lafayette, Louisiana (Oakleaf)'),
        ]);
        everydaySummary = [wimberley, lafayette].filter(Boolean).join('\n');
      }
      const sumEveryday = desk.slices.includes('everyday')
        ? everydaySummary || 'No live weather was fetched for this message.'
        : 'Not shown to this desk.';
      const actionDocs = actionDocLines(desk.actions);
      const requestPayload = {
        model: DESK_MODEL,
        contents: `Current Date/Time: ${ctx.currentDateTime || new Date().toISOString()}
User: ${ctx.userName || 'GiniApp User'}${ctx.addressName ? `\nAddress them as: ${ctx.addressName}` : ''}
Google Drive Backup Status: ${ctx.driveConnected ? 'Connected in current session' : 'Not yet connected in this session (user can connect via Google Drive Backups)'}${ctx.aiWrite === true ? '' : '\nAuthority: the account holder has NOT given you write authority. Read and suggest only — never say you changed, saved, filed, or sent anything. Put any change you propose in plain words for the person to make themselves.'}

LIVE WORKSPACE SNAPSHOT:
1) Schedule & Tasks:
${sumTasks}

2) Wimberley, TX Family Property (Conservancy & Rental Cabin):
${sumWimberley}

3) Finances & Expenditure Groupings:
${sumFinances}

4) OCR Document Vault:
${sumDocuments}

5) Everyday — weather for her places (live only when fetched for this message):
${sumEveryday}

CONVERSATION:
${recentHistory}

Respond to the user's latest message directly using their real workspace data above. When helpful, propose 0 to 3 ready-to-apply suggestedActions that the user can trigger with one click.
For each action in suggestedActions, set payloadJson to a valid JSON string matching its type:
${actionDocs}`,
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          systemInstruction:
            'You are GiniApp, a knowledgeable, concise, practical household, Texas Hill Country property, and personal finance assistant. Ground every answer in the user workspace data provided. Never invent fake totals or documents. Use plain, helpful prose and only include suggestedActions when genuinely actionable.' +
            PLACE_TREE_BRIEF +
            SUPERVISOR_RULES +
            desk.brief +
            FRONT_DOOR_RULES,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              reply: { type: Type.STRING },
              choices: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              suggestedActions: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    type: {
                      type: Type.STRING,
                      enum: [...desk.actions],
                    },
                    label: { type: Type.STRING },
                    payloadJson: { type: Type.STRING },
                  },
                  required: ['type', 'label', 'payloadJson'],
                },
              },
            },
            required: ['reply', 'suggestedActions'],
          },
        },
      };

      let response;
      try {
        response = await ai.models.generateContent(requestPayload);
      } catch (firstErr) {
        const msg = firstErr instanceof Error ? firstErr.message : String(firstErr);
        if (/503|UNAVAILABLE|high demand/i.test(msg)) {
          await new Promise((r) => setTimeout(r, 1200));
          response = await ai.models.generateContent(requestPayload);
        } else {
          throw firstErr;
        }
      }

      const parsed = JSON.parse((response.text ?? '{}').trim()) as {
        reply?: string;
        choices?: string[];
        suggestedActions?: Array<{
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
        }>;
      };

      res.json({
        reply: parsed.reply || 'I reviewed your workspace. How would you like to proceed?',
        choices: Array.isArray(parsed.choices)
          ? parsed.choices
              .filter((c) => typeof c === 'string' && c.trim().length > 0)
              .slice(0, 5)
              .map((c) => c.slice(0, 60))
          : [],
        suggestedActions: Array.isArray(parsed.suggestedActions)
          ? parsed.suggestedActions
              .filter((a) => desk.actions.includes(a.type))
              .slice(0, 4)
          : [],
        desk: deskId,
      });
    } catch (error) {
      console.error('AI Assistant chat error:', error);
      let readable =
        error instanceof Error ? error.message : 'Failed to reach GiniApp.';
      try {
        const parsedErr = JSON.parse(readable) as { error?: { message?: string; code?: number } };
        if (parsedErr?.error?.message) {
          readable = parsedErr.error.message;
        }
      } catch {
        // leave non-JSON error message as-is
      }
      res.status(500).json({ error: readable });
    }
  });

  const server = http.createServer(app);

  // ---------------------------------------------------------------------------
  // Vite Middleware or Production Static Files
  // ---------------------------------------------------------------------------
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        allowedHosts: true,
        hmr: false,
        watch: null,
        ws: {
          server,
          path: '/__vite_ws',
        },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // ---------------------------------------------------------------------------
  // 4. Gemini Live API WebSocket Bridge (/live)
  // ---------------------------------------------------------------------------
  const wss = new WebSocketServer({ noServer: true });
  server.on('upgrade', (req, socket, head) => {
    const pathname = (req.url || '').split('?')[0];
    if (pathname === '/live') {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req);
      });
    }
  });

  const liveTools: FunctionDeclaration[] = [
    {
      name: 'createScheduleTask',
      description: 'Creates a new task or appointment with a reminder in the user schedule.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          category: { type: Type.STRING, enum: [...CATEGORIES] },
          type: { type: Type.STRING, enum: ['task', 'appointment'] },
          dueDate: { type: Type.STRING, description: 'YYYY-MM-DD' },
          dueTime: { type: Type.STRING, description: 'HH:MM 24h or empty' },
          priority: { type: Type.STRING, enum: ['low', 'medium', 'high'] },
          estimatedMinutes: { type: Type.INTEGER },
          notes: { type: Type.STRING },
        },
        required: ['title', 'category', 'dueDate'],
      },
    },
    {
      name: 'markTaskCompleted',
      description: 'Marks an existing pending task as completed by matching its title. If she has not said whether that is the end of it, ask first — is that finished, or is there more to do on it later? — and pass her answer as completionState; when there is more, remainderNote names what is left in her words and the app puts it back on the schedule as a new open item for today.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          taskTitle: { type: Type.STRING },
          completionState: { type: Type.STRING, enum: ['finished', 'more'] },
          remainderNote: { type: Type.STRING },
        },
        required: ['taskTitle'],
      },
    },
    {
      name: 'searchDocumentVault',
      description: 'Searches the user OCR-indexed scanned document vault by keyword, tag, or content.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          query: { type: Type.STRING },
        },
        required: ['query'],
      },
    },
    {
      name: 'saveFollowUpMemory',
      description: 'Saves a summary of tasks completed and concrete follow-up steps from this voice conversation.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          summary: { type: Type.STRING },
          completedTaskTitles: { type: Type.ARRAY, items: { type: Type.STRING } },
          followUpSteps: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: ['summary', 'followUpSteps'],
      },
    },
    {
      name: 'logFinanceEntry',
      description: 'Logs an expenditure or income entry into a financial group such as Conservancy, Home Repairs, Rental Upkeep, Groceries, Medical - Mom, or Medical - Jason.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          amount: { type: Type.NUMBER },
          group: { type: Type.STRING },
          kind: { type: Type.STRING, enum: ['expense', 'income'] },
          vendor: { type: Type.STRING },
          entryDate: { type: Type.STRING, description: 'YYYY-MM-DD' },
          place: {
            type: Type.STRING,
            enum: [
              '',
              'Riva Jade',
              'Riva Jade — Homestead',
              'Riva Jade — Rental Cabin',
              'Riva Jade — Wildlife Conservancy',
              'Oakleaf',
              'Elephant Walk',
            ],
          },
          taxDeductible: { type: Type.BOOLEAN },
        },
        required: ['title', 'amount', 'group'],
      },
    },
    {
      name: 'noteForJason',
      description:
        'Writes down a request the assistant cannot fill, so Jason can see it and fix it. Use whenever the user asks for something outside the available tools or not possible right now — after telling the user, in plain words, that you cannot do that right now and that you have noted it and will talk to Jason about fixing it.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          request: {
            type: Type.STRING,
            description: 'What the user asked for, in plain words.',
          },
        },
        required: ['request'],
      },
    },
  ];

  wss.on('connection', (clientWs: WebSocket) => {
    let liveSession: Awaited<ReturnType<GoogleGenAI['live']['connect']>> | null = null;
    let isClosing = false;

    const sendSafe = (payload: Record<string, unknown>) => {
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify(payload));
      }
    };

    clientWs.on('message', async (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as {
          type?: string;
          context?: {
            userName?: string;
            addressName?: string;
            currentDateTime?: string;
            pendingTasks?: string;
            completedTasks?: string;
            recentMemories?: string;
            documentsSummary?: string;
            propertySummary?: string;
            financeSummary?: string;
          };
          audio?: string;
          text?: string;
          toolResponse?: {
            id: string;
            name: string;
            response: Record<string, unknown>;
          };
        };

        if (msg.type === 'init' && !liveSession) {
          const ai = getGenAIClient();
          const ctx = msg.context || {};
          const systemInstruction = `You are GiniApp, a warm, concise, proactive personal voice assistant for ${ctx.userName || 'the user'}.
${ctx.addressName ? `Address the user as ${ctx.addressName}. ` : ''}Current Local Date/Time: ${ctx.currentDateTime || new Date().toISOString()}

MEMORY OF COMPLETED TASKS:
${ctx.completedTasks || 'None recorded yet.'}

PAST VOICE MEMORY & FOLLOW-UP NOTES:
${ctx.recentMemories || 'None yet.'}

CURRENT PENDING SCHEDULE & REMINDERS:
${ctx.pendingTasks || 'No pending tasks.'}

WIMBERLEY, TX FAMILY PROPERTY (CONSERVANCY & RENTAL CABIN):
${ctx.propertySummary || 'No Wimberley property entries logged yet.'}

FINANCES & EXPENDITURE GROUPINGS SUMMARY:
${ctx.financeSummary || 'No financial entries logged yet.'}

OCR DOCUMENT VAULT SUMMARY:
${ctx.documentsSummary || 'No scanned documents yet.'}

${PLACE_TREE_BRIEF}

Guidelines:
- Keep spoken answers natural, warm, and concise (2-4 sentences unless asked for detail).
- Proactively reference completed tasks when relevant and suggest logical next follow-up steps.
- When asked about the family property in Wimberley, TX (conservancy or rental cabin), reference its live logged status and suggest 'Wimberley Property' tasks when scheduling follow-ups.
- When the user mentions an expense or asks about spending (e.g., Medical - Mom, Medical - Jason, Conservancy, Home Repairs, Rental Upkeep, Groceries), answer from the summary or call logFinanceEntry.
- When the user asks to add a task, complete a task, look up a scanned document, log a financial transaction, or save follow-up steps, call the appropriate tool immediately.
- If the user asks what she is supposed to press or do, reassure her by name: she does not have to press anything — you are here to help, and she can just say what she would like to do.
- When she says she has done something on the schedule and has not said whether that is the end of it, ask once before calling markTaskCompleted: is that finished, or is there more to do on it later? Pass her answer as completionState ("finished" or "more") and, when there is more, remainderNote naming what is left in her words.
- When she asks whether she already did something, answer from the completed tasks in your context: name what it was, the day it was done, and whether it was finished or has more to do. If it is not there, say you do not see it done — never guess.
- When you cannot do something she asked, never leave it there: say plainly that you are sorry and cannot do that right now, say you have noted the request and will talk to Jason about fixing it, and call noteForJason with what she asked for. Never claim you did something you did not do.
- When a piece of work is finished, say exactly what was done, naming the place and branch it belongs to, so she can catch a mistake.`;

          liveSession = await ai.live.connect({
            model: 'gemini-3.8-live',
            config: {
              responseModalities: [Modality.AUDIO],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: { voiceName: 'Zephyr' },
                },
              },
              inputAudioTranscription: {},
              outputAudioTranscription: {},
              tools: [{ functionDeclarations: liveTools }],
              systemInstruction,
            },
            callbacks: {
              onopen: () => {
                sendSafe({ type: 'ready' });
              },
              onmessage: (message: LiveServerMessage) => {
                const content = message.serverContent;
                if (content?.inputTranscription?.text) {
                  sendSafe({
                    type: 'inputTranscript',
                    text: content.inputTranscription.text,
                  });
                }
                if (content?.outputTranscription?.text) {
                  sendSafe({
                    type: 'outputTranscript',
                    text: content.outputTranscription.text,
                  });
                }
                for (const part of content?.modelTurn?.parts ?? []) {
                  if (part.inlineData?.data) {
                    sendSafe({
                      type: 'audio',
                      audio: part.inlineData.data,
                    });
                  }
                }
                if (content?.interrupted) {
                  sendSafe({ type: 'interrupted' });
                }
                if (content?.turnComplete) {
                  sendSafe({ type: 'turnComplete' });
                }
                for (const call of message.toolCall?.functionCalls ?? []) {
                  sendSafe({
                    type: 'toolCall',
                    call: {
                      id: call.id,
                      name: call.name,
                      args: call.args,
                    },
                  });
                }
              },
              onerror: (err) => {
                console.error('Gemini Live session error:', err);
                sendSafe({
                  type: 'error',
                  error: err instanceof Error ? err.message : 'Live voice connection error',
                });
              },
              onclose: () => {
                if (!isClosing) {
                  sendSafe({ type: 'closed' });
                }
              },
            },
          });
          return;
        }

        if (msg.audio && liveSession) {
          liveSession.sendRealtimeInput({
            audio: {
              data: msg.audio,
              mimeType: 'audio/pcm;rate=16000',
            },
          });
          return;
        }

        if (msg.text && liveSession) {
          liveSession.sendRealtimeInput({ text: msg.text });
          return;
        }

        if (msg.toolResponse && liveSession) {
          liveSession.sendToolResponse({
            functionResponses: [
              {
                id: msg.toolResponse.id,
                name: msg.toolResponse.name,
                response: msg.toolResponse.response,
              },
            ],
          });
        }
      } catch (err) {
        console.error('Live WS message error:', err);
        sendSafe({
          type: 'error',
          error: err instanceof Error ? err.message : 'Failed to process live audio message',
        });
      }
    });

    clientWs.on('close', () => {
      isClosing = true;
      try {
        liveSession?.close();
      } catch {
        // ignore close cleanup errors
      }
      liveSession = null;
    });
  });

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Steward server listening on http://0.0.0.0:${PORT}`);
  });
}

createApp().catch((err) => {
  console.error('Failed to start Steward server:', err);
  process.exit(1);
});

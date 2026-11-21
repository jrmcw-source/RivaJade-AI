import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Camera,
  Upload,
  Search,
  Tag,
  FileText,
  Trash2,
  Plus,
  X,
  RotateCw,
  CheckCircle2,
  Loader2,
  SlidersHorizontal,
  CalendarPlus,
} from 'lucide-react';
import {
  CATEGORIES,
  PLACES,
  isPlaceName,
  Category,
  ScannedDocument,
  RecordKind,
  RECORD_KIND_LABELS,
  ScheduleTask,
  getLocalTodayIso,
} from '../types';
import { getDriveAccessToken } from '../firebase';
import { downloadDriveFileBlob } from '../services/googleDriveBackup';

interface SuggestedTaskFromOCR {
  title: string;
  dueDate: string;
  priority: 'low' | 'medium' | 'high';
  estimatedMinutes: number;
  helpSteps: string[];
}

interface DocumentScannerVaultViewProps {
  childSubjects?: Array<{
    key: string;
    label: string;
    subjectName: string;
    subjectFamilyId: string;
  }>;
  documents: ScannedDocument[];
  onSaveDocument: (
    payload: Omit<ScannedDocument, 'id' | 'userId' | 'createdAt' | 'updatedAt' | 'householdId' | 'memberIds' | 'verificationStatus' | 'verifiedByName' | 'verifiedAtIso' | 'paperLocation' | 'driveFileId'> & { paperLocation?: string }
  ) => Promise<string>;
  onUpdateDocument: (docId: string, updates: Partial<ScannedDocument>) => Promise<void>;
  onVerifyDocument: (doc: ScannedDocument) => Promise<void>;
  onDeleteDocument: (docId: string) => Promise<void>;
  onCreateTaskFromDoc: (
    payload: Omit<
      ScheduleTask,
      'id' | 'userId' | 'createdAt' | 'updatedAt' | 'completedAtIso' | 'status' | 'householdId' | 'memberIds'
    >
  ) => Promise<void>;
  scannerTriggerCount: number;
  // Front door capture (2026-11-20): when the desk has already settled
  // the branch with her, the scan is filed under that place, and the app
  // is told once the save lands so the door can confirm it in words.
  scannerPresetPlace?: string;
  onDocumentSaved?: (info: { title: string; place: string }) => void;
}

function highlightMatch(text: string, query: string): React.ReactNode {
  const q = query.trim();
  if (!q) return text;
  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = text.split(new RegExp(`(${escaped})`, 'gi'));
  return parts.map((part, i) =>
    part.toLowerCase() === q.toLowerCase() ? (
      <mark key={i} className="bg-amber-200 dark:bg-amber-800/70 text-slate-900 dark:text-slate-100 rounded px-0.5">
        {part}
      </mark>
    ) : (
      <React.Fragment key={i}>{part}</React.Fragment>
    )
  );
}

function extractSnippet(text: string, query: string, radius = 90): string {
  if (!text) return '';
  const q = query.trim().toLowerCase();
  if (!q) return text.slice(0, 180) + (text.length > 180 ? '...' : '');
  const idx = text.toLowerCase().indexOf(q);
  if (idx === -1) return text.slice(0, 180) + (text.length > 180 ? '...' : '');
  const start = Math.max(0, idx - radius);
  const end = Math.min(text.length, idx + q.length + radius);
  return `${start > 0 ? '...' : ''}${text.slice(start, end)}${end < text.length ? '...' : ''}`;
}

export const DocumentScannerVaultView: React.FC<DocumentScannerVaultViewProps> = ({
  childSubjects,
  documents,
  onSaveDocument,
  onUpdateDocument,
  onVerifyDocument,
  onDeleteDocument,
  onCreateTaskFromDoc,
  scannerTriggerCount,
  scannerPresetPlace,
  onDocumentSaved,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTag, setActiveTag] = useState<string>('All');
  const [categoryFilter, setCategoryFilter] = useState<string>('All');
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [drivePhotoSrc, setDrivePhotoSrc] = useState<Record<string, string>>({});
  const [docPrint, setDocPrint] = useState(false);

  // If the app server's copy of a photo is gone, show the photo from its
  // permanent home in Google Drive instead.
  async function loadPhotoFromDrive(docRecord: ScannedDocument) {
    if (!docRecord.driveFileId || drivePhotoSrc[docRecord.id]) return;
    const token = getDriveAccessToken();
    if (!token) return;
    try {
      const blob = await downloadDriveFileBlob(token, docRecord.driveFileId);
      const url = URL.createObjectURL(blob);
      setDrivePhotoSrc((prev) => ({ ...prev, [docRecord.id]: url }));
    } catch {
      // Leave the broken image as it is; Drive Backups can restore the
      // server copy from Drive.
    }
  }

  // Scanner modal state
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scanTab, setScanTab] = useState<'camera' | 'upload'>('camera');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [capturedDataUrl, setCapturedDataUrl] = useState<string | null>(null);
  const [rawImageFileName, setRawImageFileName] = useState('camera_scan.jpg');
  const [enhanceOcr, setEnhanceOcr] = useState(true);
  const [runningOcr, setRunningOcr] = useState(false);
  const [ocrError, setOcrError] = useState<string | null>(null);

  // Draft reviewed OCR result before filing
  const [draftResult, setDraftResult] = useState<{
    imageUrl: string;
    title: string;
    category: Category;
    ocrText: string;
    summary: string;
    detectedDate: string;
    keyDetails: string[];
    tags: string[];
    suggestedTasks: SuggestedTaskFromOCR[];
    selectedTaskIndices: Record<number, boolean>;
    notes: string;
    paperLocation: string;
    accountLocation: string;
    place: string;
    recordKind: RecordKind;
    customKindLabel: string;
  } | null>(null);
  const [newTagInput, setNewTagInput] = useState('');
  const [savingDoc, setSavingDoc] = useState(false);

  // Inspector edit state
  const [editTagInput, setEditTagInput] = useState('');
  const [paperLocationInput, setPaperLocationInput] = useState('');
  const [subjectInput, setSubjectInput] = useState('');
  const [accountLocationInput, setAccountLocationInput] = useState('');
  const [placeInput, setPlaceInput] = useState('');
  const [kindInput, setKindInput] = useState<RecordKind>('personal');
  const [customKindInput, setCustomKindInput] = useState('');
  const [editingOcrText, setEditingOcrText] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (scannerTriggerCount > 0) {
      openScanner('camera');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scannerTriggerCount]);

  function stopCamera() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }

  async function startCamera(mode: 'environment' | 'user') {
    stopCamera();
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: mode },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch (err) {
      setCameraError(
        err instanceof Error
          ? `Camera unavailable (${err.message}). You can upload a photo or scan file instead.`
          : 'Camera permission denied. Upload an image file instead.'
      );
    }
  }

  useEffect(() => {
    if (scannerOpen && scanTab === 'camera' && !capturedDataUrl && !draftResult) {
      void startCamera(facingMode);
    } else {
      stopCamera();
    }
    return () => stopCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scannerOpen, scanTab, facingMode, capturedDataUrl, draftResult]);

  function openScanner(mode: 'camera' | 'upload') {
    setScanTab(mode);
    setCapturedDataUrl(null);
    setDraftResult(null);
    setOcrError(null);
    setScannerOpen(true);
  }

  function closeScanner() {
    stopCamera();
    setScannerOpen(false);
  }

  function applyCanvasOcrEnhancement(
    sourceCanvas: HTMLCanvasElement,
    highContrast: boolean
  ): string {
    if (!highContrast) {
      return sourceCanvas.toDataURL('image/jpeg', 0.9);
    }
    const ctx = sourceCanvas.getContext('2d');
    if (!ctx) return sourceCanvas.toDataURL('image/jpeg', 0.9);
    const imgData = ctx.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);
    const d = imgData.data;
    // Gentle document contrast boost while preserving gray tones for OCR
    const factor = 1.38;
    for (let i = 0; i < d.length; i += 4) {
      const luma = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      const enhanced = Math.max(0, Math.min(255, (luma - 128) * factor + 135));
      d[i] = enhanced;
      d[i + 1] = enhanced;
      d[i + 2] = enhanced;
    }
    ctx.putImageData(imgData, 0, 0);
    return sourceCanvas.toDataURL('image/jpeg', 0.92);
  }

  function handleCapturePhoto() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const maxEdge = 1800;
    const scale = Math.min(1, maxEdge / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = applyCanvasOcrEnhancement(canvas, enhanceOcr);
    setRawImageFileName(`scan_${getLocalTodayIso()}.jpg`);
    setCapturedDataUrl(dataUrl);
    stopCamera();
  }

  function handleFileSelected(file: File) {
    if (!file.type.startsWith('image/')) {
      setOcrError('Please select a JPEG, PNG, or WebP document image.');
      return;
    }
    setOcrError(null);
    setRawImageFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const maxEdge = 1800;
        const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const dataUrl = applyCanvasOcrEnhancement(canvas, enhanceOcr);
        setCapturedDataUrl(dataUrl);
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  }

  async function handleRunOcr() {
    if (!capturedDataUrl) return;
    setRunningOcr(true);
    setOcrError(null);
    try {
      const res = await fetch('/api/documents/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: capturedDataUrl,
          mimeType: 'image/jpeg',
          fileName: rawImageFileName,
          saveFile: true,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'OCR processing failed.');
      }
      const data = await res.json();
      const selectedMap: Record<number, boolean> = {};
      (data.suggestedTasks || []).forEach((_: unknown, i: number) => {
        selectedMap[i] = true;
      });
      setDraftResult({
        imageUrl: data.imageUrl || '',
        title: data.title || rawImageFileName,
        category: CATEGORIES.includes(data.category) ? data.category : 'General',
        ocrText: data.ocrText || '',
        summary: data.summary || '',
        detectedDate: data.detectedDate || '',
        keyDetails: data.keyDetails || [],
        tags: data.suggestedTags || [],
        suggestedTasks: data.suggestedTasks || [],
        selectedTaskIndices: selectedMap,
        notes: '',
        paperLocation: '',
        accountLocation: '',
        recordKind: 'personal',
        customKindLabel: '',
        place:
          scannerPresetPlace && isPlaceName(scannerPresetPlace)
            ? scannerPresetPlace
            : isPlaceName(data.place)
              ? data.place
              : '',
      });
    } catch (err) {
      setOcrError(err instanceof Error ? err.message : 'OCR extraction failed.');
    } finally {
      setRunningOcr(false);
    }
  }

  async function handleFileToVault(e: React.FormEvent) {
    e.preventDefault();
    if (!draftResult) return;
    setSavingDoc(true);
    try {
      const newDocId = await onSaveDocument({
        title: draftResult.title.trim() || 'Scanned Document',
        category: draftResult.category,
        ocrText: draftResult.ocrText,
        summary: draftResult.summary,
        tags: draftResult.tags,
        keyDetails: draftResult.keyDetails,
        detectedDate: draftResult.detectedDate,
        imageUrl: draftResult.imageUrl,
        fileName: rawImageFileName,
        notes: draftResult.notes,
        paperLocation: draftResult.paperLocation,
        accountLocation: draftResult.accountLocation,
        place: draftResult.place,
        recordKind: draftResult.recordKind,
        customKindLabel:
          draftResult.recordKind === 'custom' ? draftResult.customKindLabel.trim().slice(0, 60) : '',
      });

      // Schedule checked suggested tasks linked to this document
      for (let i = 0; i < draftResult.suggestedTasks.length; i++) {
        if (draftResult.selectedTaskIndices[i]) {
          const st = draftResult.suggestedTasks[i];
          const validDate = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(st.dueDate)
            ? st.dueDate
            : draftResult.detectedDate && /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(draftResult.detectedDate)
            ? draftResult.detectedDate
            : getLocalTodayIso();
          await onCreateTaskFromDoc({
            title: st.title,
            type: 'task',
            category: draftResult.category,
            place: draftResult.place,
            dueDate: validDate,
            dueTime: '',
            estimatedMinutes: st.estimatedMinutes || 30,
            reminderMinutes: 1440,
            priority: st.priority || 'medium',
            notes: `Created from scanned document: ${draftResult.title}`,
            helpSteps: st.helpSteps || [],
            linkedDocumentId: newDocId,
          });
        }
      }

      onDocumentSaved?.({
        title: draftResult.title.trim() || 'Scanned Document',
        place: draftResult.place,
      });
      setSelectedDocId(newDocId);
      closeScanner();
    } catch (err) {
      setOcrError(err instanceof Error ? err.message : 'That paper could not be filed.');
    } finally {
      setSavingDoc(false);
    }
  }

  const allTags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const doc of documents) {
      for (const tag of doc.tags) {
        counts.set(tag, (counts.get(tag) || 0) + 1);
      }
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([tag]) => tag);
  }, [documents]);

  const filteredDocuments = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return documents.filter((doc) => {
      if (activeTag !== 'All' && !doc.tags.includes(activeTag)) return false;
      if (categoryFilter !== 'All' && doc.category !== categoryFilter) return false;
      if (q) {
        const haystack = [
          doc.title,
          doc.category,
          doc.summary,
          doc.ocrText,
          doc.notes,
          doc.paperLocation,
          doc.accountLocation || '',
          doc.tags.join(' '),
          doc.keyDetails.join(' '),
        ]
          .join('\n')
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [documents, activeTag, categoryFilter, searchQuery]);

  const selectedDoc = documents.find((d) => d.id === selectedDocId) || null;

  useEffect(() => {
    setPaperLocationInput(selectedDoc?.paperLocation || '');
    setAccountLocationInput(selectedDoc?.accountLocation || '');
    setPlaceInput(selectedDoc?.place || '');
    setKindInput(selectedDoc?.recordKind || 'personal');
    setSubjectInput(
      selectedDoc?.subjectName && selectedDoc?.subjectFamilyId
        ? `${selectedDoc.subjectFamilyId}::${selectedDoc.subjectName}`
        : ''
    );
    setCustomKindInput(selectedDoc?.customKindLabel || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDocId]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            OCR Document Vault
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Scan receipts, tax forms, vehicle records, and bulletins through your camera, extract searchable OCR text, and tag for instant retrieval.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => openScanner('upload')}
            className="min-h-[44px] inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <Upload className="w-4 h-4" />
            <span>Upload Image</span>
          </button>
          <button
            type="button"
            onClick={() => openScanner('camera')}
            className="min-h-[44px] inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <Camera className="w-4 h-4" />
            <span>Scan with Camera</span>
          </button>
        </div>
      </div>

      {docPrint && selectedDoc && (
        <div className="steward-print">
          <h1 style={{ fontSize: '22px', marginBottom: '4px' }}>{selectedDoc.title}</h1>
          <p style={{ fontSize: '12px', marginBottom: '16px' }}>
            {selectedDoc.category}
            {selectedDoc.place ? ` — ${selectedDoc.place}` : ''}
            {selectedDoc.detectedDate ? ` — ${selectedDoc.detectedDate}` : ''}
          </p>
          {(drivePhotoSrc[selectedDoc.id] || selectedDoc.imageUrl) && (
            <img
              src={drivePhotoSrc[selectedDoc.id] || selectedDoc.imageUrl}
              alt={selectedDoc.title}
              style={{ maxWidth: '100%', marginBottom: '16px' }}
            />
          )}
          {selectedDoc.summary && (
            <p style={{ fontSize: '14px', whiteSpace: 'pre-line', marginBottom: '12px' }}>
              {selectedDoc.summary}
            </p>
          )}
          {(selectedDoc.keyDetails || []).length > 0 && (
            <div style={{ marginBottom: '12px' }}>
              {selectedDoc.keyDetails.map((d, i) => (
                <p key={i} style={{ fontSize: '13px' }}>
                  • {d}
                </p>
              ))}
            </div>
          )}
          {selectedDoc.ocrText && (
            <p style={{ fontSize: '13px', whiteSpace: 'pre-line', marginBottom: '12px' }}>
              {selectedDoc.ocrText}
            </p>
          )}
          {selectedDoc.notes && (
            <p style={{ fontSize: '13px', whiteSpace: 'pre-line', marginBottom: '12px' }}>
              {selectedDoc.notes}
            </p>
          )}
          <p style={{ fontSize: '12px', marginTop: '16px' }}>
            Kept by the family in Steward.
          </p>
        </div>
      )}

      {/* Family photo shelf: pictures kept as pictures. A photo
          rides here when its document carries the 'photo' tag;
          the shelf shows only what the reader may already see. */}
      {documents.filter((d) => (d.tags || []).includes('photo') && (d.imageUrl || d.driveFileId)).length > 0 && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Family photo shelf
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Pictures kept as pictures. Open one to see it full-size, change who can
              see it, or take it off the shelf.
            </p>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
            {documents
              .filter((d) => (d.tags || []).includes('photo') && (d.imageUrl || d.driveFileId))
              .map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => setSelectedDocId(d.id)}
                  className="group text-left"
                >
                  <img
                    src={drivePhotoSrc[d.id] || d.imageUrl}
                    onError={() => void loadPhotoFromDrive(d)}
                    alt={d.title}
                    className="w-full aspect-square object-cover rounded-lg border border-slate-200 dark:border-slate-800"
                  />
                  <span className="block text-[11px] mt-1 text-slate-600 dark:text-slate-300 truncate">
                    {d.title}
                  </span>
                </button>
              ))}
          </div>
        </div>
      )}

      {/* Full-Text OCR & Tag Search Controls */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search inside OCR text, invoice numbers, amounts, dates, or keyword tags..."
              className="w-full min-h-[44px] pl-10 pr-4 py-2 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-700"
            />
          </div>
          <select
            aria-label="Filter by document category"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="min-h-[44px] px-3 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100"
          >
            <option value="All">All Categories</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        {allTags.length > 0 && (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 dark:text-slate-400 mr-1 shrink-0">
              <Tag className="w-3.5 h-3.5" />
              Tags:
            </span>
            <button
              type="button"
              onClick={() => setActiveTag('All')}
              className={`min-h-[34px] px-2.5 py-1 text-xs font-medium rounded-md shrink-0 transition-colors ${
                activeTag === 'All'
                  ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              All ({documents.length})
            </button>
            {allTags.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => setActiveTag(tag)}
                className={`min-h-[34px] px-2.5 py-1 text-xs font-medium rounded-md shrink-0 transition-colors ${
                  activeTag === tag
                    ? 'bg-teal-700 text-white'
                    : 'text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                #{tag}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Vault Split View */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className={selectedDoc ? 'lg:col-span-6 space-y-3' : 'lg:col-span-12 grid grid-cols-1 md:grid-cols-2 gap-4'}>
          {filteredDocuments.length === 0 ? (
            <div className="col-span-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-10 text-center space-y-3">
              <FileText className="w-8 h-8 text-slate-400 mx-auto" />
              <p className="text-base font-medium text-slate-900 dark:text-slate-100">
                {documents.length === 0
                  ? 'No scanned documents filed yet'
                  : 'No documents match your OCR search or tag filter'}
              </p>
              <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                Scan W-2s, vehicle registration renewals, receipts, warranty cards, or community flyers to index every word with OCR.
              </p>
              <button
                type="button"
                onClick={() => openScanner('camera')}
                className="min-h-[44px] inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors"
              >
                <Camera className="w-4 h-4" />
                <span>Scan First Document</span>
              </button>
            </div>
          ) : (
            filteredDocuments.map((docItem) => {
              const snippet = extractSnippet(docItem.ocrText, searchQuery);
              const isSelected = selectedDocId === docItem.id;
              return (
                <button
                  key={docItem.id}
                  type="button"
                  onClick={() => {
                    setSelectedDocId(docItem.id);
                    setEditingOcrText(null);
                  }}
                  className={`w-full text-left bg-white dark:bg-slate-900 border rounded-xl p-4 space-y-2.5 transition-colors ${
                    isSelected
                      ? 'border-teal-700 dark:border-teal-500 ring-1 ring-teal-700'
                      : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 truncate">
                        {highlightMatch(docItem.title, searchQuery)}
                      </h3>
                      {docItem.encrypted && (
                        <p className="text-xs font-medium text-teal-700 dark:text-teal-400">
                          Sealed
                        </p>
                      )}
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                        <span>{docItem.category}</span>
                        {docItem.place && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>{docItem.place}</span>
                          </>
                        )}
                        {docItem.detectedDate && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono">Date: {docItem.detectedDate}</span>
                          </>
                        )}
                        <span aria-hidden="true">·</span>
                        <span className="font-mono">{docItem.ocrText.length} OCR chars</span>
                        <span aria-hidden="true">·</span>
                        {docItem.verificationStatus === 'verified' ? (
                          <span className="text-teal-700 dark:text-teal-400 font-medium">
                            Checked against the paper
                          </span>
                        ) : (
                          <span className="text-amber-700 dark:text-amber-400 font-medium">
                            Not yet checked
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {docItem.summary && (
                    <p className="text-sm text-slate-600 dark:text-slate-300 line-clamp-2">
                      {highlightMatch(docItem.summary, searchQuery)}
                    </p>
                  )}

                  {snippet && (
                    <p className="text-xs font-mono text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-950 p-2.5 rounded-lg border border-slate-100 dark:border-slate-800 line-clamp-2">
                      {highlightMatch(snippet, searchQuery)}
                    </p>
                  )}

                  {docItem.tags.length > 0 && (
                    <div className="text-xs text-slate-500 dark:text-slate-400 flex flex-wrap gap-x-2 gap-y-1">
                      {docItem.tags.map((t) => (
                        <span key={t}>#{highlightMatch(t, searchQuery)}</span>
                      ))}
                    </div>
                  )}
                </button>
              );
            })
          )}
        </div>

        {/* Document Detail Inspector */}
        {selectedDoc && (
          <div className="lg:col-span-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-5">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  {selectedDoc.title}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  {selectedDoc.category}
                  {selectedDoc.detectedDate ? ` · Detected date: ${selectedDoc.detectedDate}` : ''}
                  {selectedDoc.fileName ? ` · ${selectedDoc.fileName}` : ''}
                </p>
              </div>
              <button
                type="button"
                aria-label="Close inspector"
                onClick={() => setSelectedDocId(null)}
                className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {selectedDoc.encrypted && (
              <p className="text-xs text-teal-700 dark:text-teal-400">
                This record is sealed. Its words can be read and changed only while
                your vault is unlocked — unlock it in Settings. The title, kind,
                place, and dates stay visible, like the writing on an envelope.
              </p>
            )}

            {selectedDoc.imageUrl && (
              <div className="rounded-lg overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-950 max-h-64 flex items-center justify-center">
                <img
                  src={drivePhotoSrc[selectedDoc.id] || selectedDoc.imageUrl}
                  onError={() => void loadPhotoFromDrive(selectedDoc)}
                  alt={selectedDoc.title}
                  referrerPolicy="no-referrer"
                  className="max-h-64 w-auto object-contain"
                />
              </div>
            )}

            {selectedDoc.keyDetails.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Extracted Key Details
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {selectedDoc.keyDetails.map((detail, i) => (
                    <div
                      key={i}
                      className="text-xs font-mono text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2"
                    >
                      {highlightMatch(detail, searchQuery)}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Paper Location & Checking Against the Paper */}
            <div className="space-y-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3.5">
              {selectedDoc.verificationStatus === 'verified' ? (
                <p className="text-xs text-teal-800 dark:text-teal-300">
                  <span className="font-semibold">Checked against the paper</span>
                  {selectedDoc.verifiedByName ? ` by ${selectedDoc.verifiedByName}` : ''}
                  {selectedDoc.verifiedAtIso
                    ? ` on ${new Date(selectedDoc.verifiedAtIso).toLocaleDateString()}`
                    : ''}
                  . The words here match the physical document.
                </p>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-amber-800 dark:text-amber-300">
                    <span className="font-semibold">Not yet checked against the paper.</span>{' '}
                    This reading came from a photograph. Before anyone relies on it, hold the
                    paper next to it, compare the words and numbers, then mark it checked.
                  </p>
                  <button
                    type="button"
                    onClick={() => void onVerifyDocument(selectedDoc)}
                    className="min-h-[40px] inline-flex items-center gap-1.5 px-3.5 text-xs font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>I checked it against the paper</span>
                  </button>
                </div>
              )}
              <div className="flex gap-2">
                <select
                  value={placeInput}
                  onChange={(e) => setPlaceInput(e.target.value)}
                  aria-label="Place for this document"
                  className="flex-1 min-h-[40px] px-3 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100"
                >
                  <option value="">General — no place</option>
                  {PLACES.map((pl) => (
                    <option key={pl} value={pl}>
                      {pl}
                    </option>
                  ))}
                </select>
                <select
                  value={kindInput}
                  onChange={(e) => setKindInput(e.target.value as RecordKind)}
                  aria-label="Kind of record"
                  className="flex-1 min-h-[40px] px-3 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100"
                >
                  {(Object.keys(RECORD_KIND_LABELS) as RecordKind[])
                    .filter((k) => k !== 'calendar')
                    .map((k) => (
                      <option key={k} value={k}>
                        {RECORD_KIND_LABELS[k]}
                      </option>
                    ))}
                </select>
              </div>
              {kindInput === 'custom' && (
                <input
                  type="text"
                  value={customKindInput}
                  onChange={(e) => setCustomKindInput(e.target.value)}
                  placeholder="Name your kind — e.g., Official"
                  aria-label="Name for the custom kind"
                  className="w-full min-h-[40px] px-3 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100"
                />
              )}
              {(childSubjects || []).length > 0 && (
                <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
                  <span>About a child:</span>
                  <select
                    value={subjectInput}
                    onChange={(e) => setSubjectInput(e.target.value)}
                    className="min-h-[36px] px-2 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100"
                  >
                    <option value="">Not about a child</option>
                    {(childSubjects || []).map((c) => (
                      <option key={c.key} value={c.key}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                  <span className="text-[11px] text-slate-400">
                    The child's parents decide for records about them.
                  </span>
                </label>
              )}
              {(selectedDoc.imageUrl || selectedDoc.driveFileId) && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      void onUpdateDocument(selectedDoc.id, {
                        tags: (selectedDoc.tags || []).includes('photo')
                          ? (selectedDoc.tags || []).filter((t) => t !== 'photo')
                          : [...(selectedDoc.tags || []), 'photo'],
                      })
                    }
                    className="min-h-[36px] px-3 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-700 dark:text-slate-200"
                  >
                    {(selectedDoc.tags || []).includes('photo')
                      ? 'Take off the photo shelf'
                      : 'Put on the photo shelf'}
                  </button>
                  <span className="text-[11px] text-slate-400">
                    The shelf shows pictures as pictures, at the same reach as the
                    record itself.
                  </span>
                </div>
              )}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setDocPrint(true);
                    window.setTimeout(() => window.print(), 80);
                  }}
                  className="min-h-[36px] px-3 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-700 dark:text-slate-200"
                >
                  Print this record
                </button>
                <span className="text-[11px] text-slate-400">
                  Prints what you can see here — a sealed record prints its envelope,
                  never its sealed words.
                </span>
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void onUpdateDocument(selectedDoc.id, {
                    subjectName:
                      (childSubjects || []).find((c) => c.key === subjectInput)?.subjectName || '',
                    subjectFamilyId:
                      (childSubjects || []).find((c) => c.key === subjectInput)?.subjectFamilyId ||
                      '',
                    paperLocation: paperLocationInput.trim(),
                    accountLocation: accountLocationInput.trim(),
                    place: placeInput,
                    recordKind: kindInput,
                    customKindLabel:
                      kindInput === 'custom' ? customKindInput.trim().slice(0, 60) : '',
                  });
                }}
                className="flex gap-2"
              >
                <input
                  type="text"
                  value={paperLocationInput}
                  onChange={(e) => setPaperLocationInput(e.target.value)}
                  placeholder="Where the paper lives (e.g., Blue box in the study, folder: Taxes)"
                  className="flex-1 min-h-[40px] px-3 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100"
                />
                <button
                  type="submit"
                  className="min-h-[40px] px-3 text-xs font-medium text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-lg"
                >
                  Save Location
                </button>
              </form>
              {(kindInput === 'official' || kindInput === 'financial') && (
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    Where the account lives
                  </label>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      void onUpdateDocument(selectedDoc.id, {
                        accountLocation: accountLocationInput.trim(),
                      });
                    }}
                    className="flex gap-2"
                  >
                    <input
                      type="text"
                      value={accountLocationInput}
                      onChange={(e) => setAccountLocationInput(e.target.value)}
                      placeholder="Bank or office, and its address — where the account itself is held"
                      className="flex-1 min-h-[40px] px-3 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100"
                    />
                    <button
                      type="submit"
                      className="min-h-[40px] px-3 text-xs font-medium text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-lg"
                    >
                      Save
                    </button>
                  </form>
                </div>
              )}
            </div>

            {/* Keyword Tags Editor */}
            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Keyword Tags
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {selectedDoc.tags.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() =>
                      onUpdateDocument(selectedDoc.id, {
                        tags: selectedDoc.tags.filter((t) => t !== tag),
                      })
                    }
                    title="Remove tag"
                    className="min-h-[32px] inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950/40 dark:hover:text-red-300 rounded-md transition-colors"
                  >
                    <span>#{tag}</span>
                    <X className="w-3 h-3" />
                  </button>
                ))}
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const cleaned = editTagInput.trim().toLowerCase().replace(/^#/, '');
                  if (!cleaned || selectedDoc.tags.includes(cleaned)) return;
                  void onUpdateDocument(selectedDoc.id, {
                    tags: [...selectedDoc.tags, cleaned].slice(0, 20),
                  });
                  setEditTagInput('');
                }}
                className="flex gap-2"
              >
                <input
                  type="text"
                  value={editTagInput}
                  onChange={(e) => setEditTagInput(e.target.value)}
                  placeholder="Add keyword tag (e.g., warranty, 2026-taxes)"
                  className="flex-1 min-h-[40px] px-3 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100"
                />
                <button
                  type="submit"
                  className="min-h-[40px] px-3 text-xs font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors"
                >
                  Add Tag
                </button>
              </form>
            </div>

            {/* Full OCR Extracted Text */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Full Extracted OCR Text
                </h3>
                {editingOcrText === null ? (
                  <button
                    type="button"
                    onClick={() => setEditingOcrText(selectedDoc.ocrText)}
                    className="text-xs font-medium text-teal-700 dark:text-teal-400 hover:underline"
                  >
                    Edit OCR Text
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setEditingOcrText(null)}
                      className="text-xs text-slate-500 hover:underline"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        await onUpdateDocument(selectedDoc.id, {
                          ocrText: editingOcrText,
                          ...(selectedDoc.verificationStatus === 'verified'
                            ? {
                                verificationStatus: 'provisional' as const,
                                verifiedByName: '',
                                verifiedAtIso: '',
                              }
                            : {}),
                        });
                        setEditingOcrText(null);
                      }}
                      className="text-xs font-medium text-teal-700 dark:text-teal-400 hover:underline"
                    >
                      Save OCR Text
                    </button>
                  </div>
                )}
              </div>

              {editingOcrText !== null ? (
                <textarea
                  rows={8}
                  value={editingOcrText}
                  onChange={(e) => setEditingOcrText(e.target.value)}
                  className="w-full p-3 text-xs font-mono bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100"
                />
              ) : (
                <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap break-words text-xs font-mono text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg p-3.5 leading-relaxed">
                  {selectedDoc.ocrText
                    ? highlightMatch(selectedDoc.ocrText, searchQuery)
                    : 'No OCR text extracted.'}
                </pre>
              )}
            </div>

            <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={async () => {
                  const due =
                    selectedDoc.detectedDate && /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(selectedDoc.detectedDate)
                      ? selectedDoc.detectedDate
                      : getLocalTodayIso();
                  await onCreateTaskFromDoc({
                    title: `Follow up: ${selectedDoc.title}`,
                    type: 'task',
                    category: selectedDoc.category,
                    dueDate: due,
                    dueTime: '',
                    estimatedMinutes: 30,
                    reminderMinutes: 1440,
                    priority: 'medium',
                    notes: selectedDoc.summary,
                    helpSteps: [],
                    place: selectedDoc.place || '',
            linkedDocumentId: selectedDoc.id,
                  });
                }}
                className="min-h-[44px] inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-teal-800 dark:text-teal-300 bg-teal-50 dark:bg-teal-950/50 hover:bg-teal-100 dark:hover:bg-teal-900/50 rounded-lg transition-colors"
              >
                <CalendarPlus className="w-4 h-4" />
                <span>Create Scheduled Reminder</span>
              </button>

              <button
                type="button"
                onClick={async () => {
                  const idToDel = selectedDoc.id;
                  setSelectedDocId(null);
                  await onDeleteDocument(idToDel);
                }}
                className="min-h-[44px] inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                <span>Delete Document</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Camera & OCR Scanner Modal */}
      {scannerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-2xl max-h-[92vh] overflow-y-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  Document Camera & OCR Scanner
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Capture a photo or upload a scan to extract full searchable text, tags, and dates.
                </p>
              </div>
              <button
                type="button"
                onClick={closeScanner}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {!draftResult && (
              <>
                <div className="flex items-center justify-between gap-3">
                  <div className="inline-flex p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
                    <button
                      type="button"
                      onClick={() => {
                        setCapturedDataUrl(null);
                        setScanTab('camera');
                      }}
                      className={`min-h-[38px] px-3 text-xs font-medium rounded-md transition-colors ${
                        scanTab === 'camera'
                          ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                          : 'text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      Device Camera
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setCapturedDataUrl(null);
                        setScanTab('upload');
                      }}
                      className={`min-h-[38px] px-3 text-xs font-medium rounded-md transition-colors ${
                        scanTab === 'upload'
                          ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                          : 'text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      Upload Photo / Scan
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => setEnhanceOcr((v) => !v)}
                    className={`min-h-[38px] inline-flex items-center gap-1.5 px-3 text-xs font-medium rounded-lg border transition-colors ${
                      enhanceOcr
                        ? 'bg-teal-50 dark:bg-teal-950/40 border-teal-300 dark:border-teal-800 text-teal-800 dark:text-teal-300'
                        : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    <SlidersHorizontal className="w-3.5 h-3.5" />
                    <span>OCR Contrast Enhance: {enhanceOcr ? 'On' : 'Off'}</span>
                  </button>
                </div>

                {!capturedDataUrl ? (
                  scanTab === 'camera' ? (
                    <div className="space-y-3">
                      {cameraError ? (
                        <div className="p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-center space-y-3">
                          <p className="text-sm text-slate-700 dark:text-slate-300">
                            {cameraError}
                          </p>
                          <button
                            type="button"
                            onClick={() => setScanTab('upload')}
                            className="min-h-[44px] px-4 py-2 text-sm font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg"
                          >
                            Switch to File Upload
                          </button>
                        </div>
                      ) : (
                        <div className="relative rounded-xl overflow-hidden bg-slate-950 border border-slate-800 aspect-[4/3] flex items-center justify-center">
                          <video
                            ref={videoRef}
                            playsInline
                            muted
                            className="w-full h-full object-cover"
                          />
                          <div className="pointer-events-none absolute inset-6 border-2 border-dashed border-white/60 rounded-lg" />
                        </div>
                      )}

                      {!cameraError && (
                        <div className="flex items-center justify-between gap-3">
                          <button
                            type="button"
                            onClick={() =>
                              setFacingMode((m) => (m === 'environment' ? 'user' : 'environment'))
                            }
                            className="min-h-[44px] inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800"
                          >
                            <RotateCw className="w-4 h-4" />
                            <span>Flip Camera</span>
                          </button>
                          <button
                            type="button"
                            onClick={handleCapturePhoto}
                            className="min-h-[48px] inline-flex items-center gap-2 px-6 py-2.5 text-sm font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors"
                          >
                            <Camera className="w-4 h-4" />
                            <span>Capture Document</span>
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        const file = e.dataTransfer.files?.[0];
                        if (file) handleFileSelected(file);
                      }}
                      className="border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-xl p-10 text-center space-y-3 bg-slate-50 dark:bg-slate-950"
                    >
                      <Upload className="w-8 h-8 text-teal-700 dark:text-teal-400 mx-auto" />
                      <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                        Drop a document photo here, or choose from your device
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Supports JPEG, PNG, and WebP photos of receipts, letters, tax forms, or checklists.
                      </p>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleFileSelected(file);
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="min-h-[44px] px-4 py-2 text-sm font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors"
                      >
                        Select Document Photo
                      </button>
                    </div>
                  )
                ) : (
                  <div className="space-y-4">
                    <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-950 max-h-72 flex items-center justify-center">
                      <img
                        src={capturedDataUrl}
                        alt="Captured scan preview"
                        className="max-h-72 w-auto object-contain"
                      />
                    </div>
                    {ocrError && (
                      <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-300">
                        {ocrError}
                      </div>
                    )}
                    <div className="flex items-center justify-between gap-3">
                      <button
                        type="button"
                        onClick={() => setCapturedDataUrl(null)}
                        className="min-h-[44px] px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800"
                      >
                        Retake / Choose Another
                      </button>
                      <button
                        type="button"
                        onClick={handleRunOcr}
                        disabled={runningOcr}
                        className="min-h-[44px] inline-flex items-center gap-2 px-5 py-2 text-sm font-medium text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-60 rounded-lg transition-colors"
                      >
                        {runningOcr ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <CheckCircle2 className="w-4 h-4" />
                        )}
                        <span>{runningOcr ? 'Running OCR Extraction...' : 'Run OCR & Extract Fields'}</span>
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Step 2: Review Extracted OCR, Tags, and Suggested Follow-up Tasks */}
            {draftResult && (
              <form onSubmit={handleFileToVault} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                      Document Title
                    </label>
                    <input
                      type="text"
                      required
                      value={draftResult.title}
                      onChange={(e) => setDraftResult({ ...draftResult, title: e.target.value })}
                      className="w-full min-h-[42px] px-3 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                      Category
                    </label>
                    <select
                      value={draftResult.category}
                      onChange={(e) =>
                        setDraftResult({ ...draftResult, category: e.target.value as Category })
                      }
                      className="w-full min-h-[42px] px-3 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100"
                    >
                      {CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                      Kind of record
                    </label>
                    <select
                      value={draftResult.recordKind}
                      onChange={(e) =>
                        setDraftResult({
                          ...draftResult,
                          recordKind: e.target.value as RecordKind,
                        })
                      }
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
                  </div>
                  {draftResult.recordKind === 'custom' && (
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                        Name your kind
                      </label>
                      <input
                        type="text"
                        value={draftResult.customKindLabel}
                        onChange={(e) =>
                          setDraftResult({ ...draftResult, customKindLabel: e.target.value })
                        }
                        placeholder="e.g., Official — deeds, titles, filings"
                        className="w-full min-h-[42px] px-3 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100"
                      />
                    </div>
                  )}
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    Where will the paper live?
                  </label>
                  <input
                    type="text"
                    value={draftResult.paperLocation}
                    onChange={(e) =>
                      setDraftResult({ ...draftResult, paperLocation: e.target.value })
                    }
                    placeholder="e.g., Blue box in the study, folder: Taxes — so anyone can find the original"
                    className="w-full min-h-[42px] px-3 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100"
                  />
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    This scan starts out unchecked. It earns its check mark later, when someone
                    compares it against the paper itself.
                  </p>
                </div>

                {(draftResult.recordKind === 'official' || draftResult.recordKind === 'financial') && (
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                      Where does the account live?
                    </label>
                    <input
                      type="text"
                      value={draftResult.accountLocation}
                      onChange={(e) =>
                        setDraftResult({ ...draftResult, accountLocation: e.target.value })
                      }
                      placeholder="e.g., First Bank, Main Street branch — the place the account itself is held"
                      className="w-full min-h-[42px] px-3 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100"
                    />
                  </div>
                )}

                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    Which place does this paper belong to?
                  </label>
                  <select
                    value={draftResult.place}
                    onChange={(e) => setDraftResult({ ...draftResult, place: e.target.value })}
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
                    Extracted OCR Text (Editable)
                  </label>
                  <textarea
                    rows={6}
                    value={draftResult.ocrText}
                    onChange={(e) => setDraftResult({ ...draftResult, ocrText: e.target.value })}
                    className="w-full p-3 text-xs font-mono bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    Keyword Tags
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {draftResult.tags.map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() =>
                          setDraftResult({
                            ...draftResult,
                            tags: draftResult.tags.filter((t) => t !== tag),
                          })
                        }
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-md"
                      >
                        <span>#{tag}</span>
                        <X className="w-3 h-3" />
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newTagInput}
                      onChange={(e) => setNewTagInput(e.target.value)}
                      placeholder="Add keyword tag..."
                      className="flex-1 min-h-[38px] px-3 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const clean = newTagInput.trim().toLowerCase().replace(/^#/, '');
                        if (!clean || draftResult.tags.includes(clean)) return;
                        setDraftResult({
                          ...draftResult,
                          tags: [...draftResult.tags, clean].slice(0, 20),
                        });
                        setNewTagInput('');
                      }}
                      className="min-h-[38px] inline-flex items-center gap-1 px-3 text-xs font-medium text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-lg"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Tag</span>
                    </button>
                  </div>
                </div>

                {draftResult.suggestedTasks.length > 0 && (
                  <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                    <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                      Detected Follow-Up Tasks (check to add to your schedule)
                    </p>
                    <div className="space-y-2">
                      {draftResult.suggestedTasks.map((st, idx) => (
                        <label
                          key={idx}
                          className="flex items-start gap-2.5 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={Boolean(draftResult.selectedTaskIndices[idx])}
                            onChange={(e) =>
                              setDraftResult({
                                ...draftResult,
                                selectedTaskIndices: {
                                  ...draftResult.selectedTaskIndices,
                                  [idx]: e.target.checked,
                                },
                              })
                            }
                            className="mt-0.5 rounded text-teal-700"
                          />
                          <div className="text-xs">
                            <p className="font-medium text-slate-900 dark:text-slate-100">
                              {st.title}
                            </p>
                            <p className="text-slate-500 dark:text-slate-400">
                              Due {st.dueDate || draftResult.detectedDate || getLocalTodayIso()} · {st.estimatedMinutes}m · {st.priority} priority
                            </p>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between pt-2">
                  <button
                    type="button"
                    onClick={() => setDraftResult(null)}
                    className="min-h-[44px] px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    disabled={savingDoc}
                    className="min-h-[44px] px-5 py-2 text-sm font-medium text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-60 rounded-lg transition-colors"
                  >
                    {savingDoc ? 'Filing Document...' : 'File to OCR Vault'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

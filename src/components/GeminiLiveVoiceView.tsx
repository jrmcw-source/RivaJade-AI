import React, { useEffect, useRef, useState } from 'react';
import {
  Mic,
  MicOff,
  PhoneOff,
  Send,
  BookmarkCheck,
  CheckCircle2,
  ListChecks,
  Trash2,
  Plus,
} from 'lucide-react';
import {
  Category,
  CATEGORIES,
  FinanceEntry,
  FinanceKind,
  PLACES,
  isPlaceName,
  isArchivedFinanceEntry,
  PropertyEntry,
  ScannedDocument,
  ScheduleTask,
  VoiceMemory,
  getLocalTodayIso,
} from '../types';

interface TranscriptTurn {
  id: string;
  speaker: 'user' | 'assistant' | 'system';
  text: string;
}

interface GeminiLiveVoiceViewProps {
  userName: string;
  tasks: ScheduleTask[];
  documents: ScannedDocument[];
  memories: VoiceMemory[];
  propertyEntries: PropertyEntry[];
  financeEntries: FinanceEntry[];
  onCreateTask: (
    payload: Omit<
      ScheduleTask,
      'id' | 'userId' | 'createdAt' | 'updatedAt' | 'completedAtIso' | 'status' | 'householdId' | 'memberIds'
    >
  ) => Promise<void>;
  onCompleteTaskByTitle: (titleQuery: string) => Promise<string | null>;
  onSaveMemory: (payload: {
    summary: string;
    followUpSteps: string[];
    completedTaskTitles: string[];
    transcriptExcerpt: string;
  }) => Promise<void>;
  onDeleteMemory: (memoryId: string) => Promise<void>;
  onLogFinanceEntry: (
    payload: Omit<FinanceEntry, 'id' | 'userId' | 'createdAt' | 'updatedAt' | 'householdId' | 'memberIds'>
  ) => Promise<void>;
}

function floatTo16BitPcmBase64(float32: Float32Array): string {
  const buffer = new ArrayBuffer(float32.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function base64PcmToFloat32(base64: string): Float32Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const view = new DataView(bytes.buffer);
  const numSamples = Math.floor(bytes.byteLength / 2);
  const out = new Float32Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    out[i] = view.getInt16(i * 2, true) / 32768;
  }
  return out;
}

export const GeminiLiveVoiceView: React.FC<GeminiLiveVoiceViewProps> = ({
  userName,
  tasks,
  documents,
  memories,
  propertyEntries,
  financeEntries,
  onCreateTask,
  onCompleteTaskByTitle,
  onSaveMemory,
  onDeleteMemory,
  onLogFinanceEntry,
}) => {
  const [status, setStatus] = useState<'idle' | 'connecting' | 'connected' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptTurn[]>([]);
  const [textInput, setTextInput] = useState('');
  const [savingMemory, setSavingMemory] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const inputCtxRef = useRef<AudioContext | null>(null);
  const outputCtxRef = useRef<AudioContext | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const isMutedRef = useRef<boolean>(false);

  // Refs for fresh closures inside WS callbacks
  const tasksRef = useRef(tasks);
  const documentsRef = useRef(documents);
  const propertyEntriesRef = useRef(propertyEntries);
  const financeEntriesRef = useRef(financeEntries);
  tasksRef.current = tasks;
  documentsRef.current = documents;
  propertyEntriesRef.current = propertyEntries;
  financeEntriesRef.current = financeEntries;

  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  useEffect(() => {
    return () => {
      disconnectSession();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function appendTranscript(speaker: 'user' | 'assistant' | 'system', text: string) {
    if (!text.trim()) return;
    setTranscript((prev) => {
      const last = prev[prev.length - 1];
      if (last && last.speaker === speaker && speaker !== 'system') {
        const updated = [...prev];
        updated[updated.length - 1] = {
          ...last,
          text: `${last.text}${last.text.endsWith(' ') || text.startsWith(' ') ? '' : ' '}${text}`,
        };
        return updated;
      }
      return [...prev, { id: `${Date.now()}_${Math.random()}`, speaker, text }];
    });
  }

  function clearAudioQueue() {
    for (const src of activeSourcesRef.current) {
      try {
        src.stop();
      } catch {
        // ignore already stopped
      }
    }
    activeSourcesRef.current.clear();
    if (outputCtxRef.current) {
      nextStartTimeRef.current = outputCtxRef.current.currentTime;
    }
  }

  function playPcmChunk(base64Audio: string) {
    const ctx = outputCtxRef.current;
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      void ctx.resume();
    }
    const samples = base64PcmToFloat32(base64Audio);
    if (samples.length === 0) return;

    const buffer = ctx.createBuffer(1, samples.length, 24000);
    buffer.getChannelData(0).set(samples);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);

    const startTime = Math.max(ctx.currentTime, nextStartTimeRef.current);
    source.start(startTime);
    nextStartTimeRef.current = startTime + buffer.duration;

    activeSourcesRef.current.add(source);
    source.onended = () => {
      activeSourcesRef.current.delete(source);
    };
  }

  async function handleLiveToolCall(call: {
    id: string;
    name: string;
    args: Record<string, unknown>;
  }) {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    let resultPayload: Record<string, unknown> = { ok: true };

    try {
      if (call.name === 'createScheduleTask') {
        const args = call.args as {
          title?: string;
          category?: string;
          type?: 'task' | 'appointment';
          dueDate?: string;
          dueTime?: string;
          priority?: 'low' | 'medium' | 'high';
          estimatedMinutes?: number;
          notes?: string;
        };
        const cat = CATEGORIES.includes(args.category as Category)
          ? (args.category as Category)
          : 'General';
        const dueDate =
          args.dueDate && /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(args.dueDate)
            ? args.dueDate
            : getLocalTodayIso();
        await onCreateTask({
          title: args.title || 'Voice Scheduled Task',
          type: args.type === 'appointment' ? 'appointment' : 'task',
          category: cat,
          dueDate,
          dueTime: args.dueTime || '',
          estimatedMinutes: Number(args.estimatedMinutes) || 30,
          reminderMinutes: 60,
          priority: args.priority || 'medium',
          notes: args.notes || 'Created during Gemini Live voice conversation',
          helpSteps: [],
          place: '',
          linkedDocumentId: '',
        });
        appendTranscript('system', `Added "${args.title}" for ${dueDate} (${cat}).`);
        resultPayload = { created: true, title: args.title, dueDate, category: cat };
      } else if (call.name === 'markTaskCompleted') {
        const taskTitle = String(call.args?.taskTitle || '');
        const matched = await onCompleteTaskByTitle(taskTitle);
        if (matched) {
          appendTranscript('system', `Marked "${matched}" as completed.`);
          resultPayload = { completed: true, matchedTitle: matched };
        } else {
          resultPayload = { completed: false, reason: 'No matching pending task found.' };
        }
      } else if (call.name === 'searchDocumentVault') {
        const q = String(call.args?.query || '').toLowerCase();
        const matches = documentsRef.current
          .filter((d) =>
            `${d.title} ${d.category} ${d.summary} ${d.ocrText} ${d.tags.join(' ')}`
              .toLowerCase()
              .includes(q)
          )
          .slice(0, 4)
          .map((d) => ({
            title: d.title,
            category: d.category,
            detectedDate: d.detectedDate,
            summary: d.summary,
            keyDetails: d.keyDetails,
          }));
        appendTranscript('system', `Searched OCR vault for "${q}" (${matches.length} matches).`);
        resultPayload = { matches };
      } else if (call.name === 'saveFollowUpMemory') {
        const summary = String(call.args?.summary || 'Voice session follow-up');
        const completedTaskTitles = Array.isArray(call.args?.completedTaskTitles)
          ? (call.args.completedTaskTitles as string[])
          : [];
        const followUpSteps = Array.isArray(call.args?.followUpSteps)
          ? (call.args.followUpSteps as string[])
          : [];
        await onSaveMemory({
          summary,
          completedTaskTitles,
          followUpSteps,
          transcriptExcerpt: transcript
            .map((t) => `${t.speaker}: ${t.text}`)
            .join('\n')
            .slice(0, 8000),
        });
        appendTranscript('system', 'Saved conversation memory & follow-up steps.');
        resultPayload = { saved: true };
      } else if (call.name === 'logFinanceEntry') {
        const args = call.args as {
          title?: string;
          amount?: number;
          group?: string;
          kind?: FinanceKind;
          vendor?: string;
          entryDate?: string;
          place?: string;
          taxDeductible?: boolean;
        };
        const amount = Number(args.amount) || 0;
        const group = String(args.group || 'General').slice(0, 80);
        const title = String(args.title || 'Voice Expense').slice(0, 200);
        const entryDate =
          args.entryDate && /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(args.entryDate)
            ? args.entryDate
            : getLocalTodayIso();
        await onLogFinanceEntry({
          kind: args.kind === 'income' ? 'income' : 'expense',
          group,
          title,
          amount: Math.max(0, Math.min(10000000, amount)),
          entryDate,
          vendor: String(args.vendor || '').slice(0, 120),
          place: isPlaceName(args.place) ? args.place : '',
          careForJason: false,
          taxDeductible: Boolean(args.taxDeductible),
          notes: 'Logged during Gemini Live voice conversation',
          linkedDocumentId: '',
        });
        appendTranscript('system', `Logged $${amount.toFixed(2)} under ${group} (${title}).`);
        resultPayload = { logged: true, title, amount, group, entryDate };
      }
    } catch (err) {
      resultPayload = { error: err instanceof Error ? err.message : 'Tool execution error' };
    }

    ws.send(
      JSON.stringify({
        toolResponse: {
          id: call.id,
          name: call.name,
          response: resultPayload,
        },
      })
    );
  }

  async function startSession() {
    disconnectSession();
    setStatus('connecting');
    setErrorMessage(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;

      const inputCtx = new AudioContext({ sampleRate: 16000 });
      const outputCtx = new AudioContext({ sampleRate: 24000 });
      inputCtxRef.current = inputCtx;
      outputCtxRef.current = outputCtx;
      nextStartTimeRef.current = outputCtx.currentTime;

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${window.location.host}/live`);
      wsRef.current = ws;

      ws.onopen = () => {
        const pendingSummary = tasksRef.current
          .filter((t) => t.status === 'pending')
          .slice(0, 20)
          .map((t) => `- ${t.title} (${t.category}, due ${t.dueDate}${t.dueTime ? ' ' + t.dueTime : ''}, ${t.priority})`)
          .join('\n');

        const completedSummary = tasksRef.current
          .filter((t) => t.status === 'completed')
          .slice(0, 15)
          .map((t) => `- ${t.title} (${t.category}, completed ${t.completedAtIso || t.dueDate})`)
          .join('\n');

        const memoriesSummary = memories
          .slice(0, 5)
          .map((m) => `- ${m.summary} | Follow-ups: ${m.followUpSteps.join('; ')}`)
          .join('\n');

        const docsSummary = documentsRef.current
          .slice(0, 15)
          .map((d) => `- ${d.title} [${d.category}] tags: ${d.tags.join(', ')}`)
          .join('\n');

        const propertySummary = propertyEntriesRef.current
          .slice(0, 15)
          .map(
            (p) =>
              `- [${p.area}] ${p.title}: ${p.status} (${p.scheduledDate}${
                p.endDate ? ' to ' + p.endDate : ''
              }, ${p.cadence})${p.notes ? ' — ' + p.notes.slice(0, 120) : ''}`
          )
          .join('\n');

        const groupTotals = new Map<string, number>();
        for (const f of financeEntriesRef.current) {
          if (isArchivedFinanceEntry(f.entryDate, getLocalTodayIso())) continue;
          if (f.kind === 'expense') {
            groupTotals.set(f.group, (groupTotals.get(f.group) || 0) + f.amount);
          }
        }
        const financeSummary = Array.from(groupTotals.entries())
          .map(([grp, tot]) => `- ${grp}: $${tot.toFixed(2)}`)
          .join('\n');

        ws.send(
          JSON.stringify({
            type: 'init',
            context: {
              userName,
              currentDateTime: new Date().toLocaleString(),
              pendingTasks: pendingSummary,
              completedTasks: completedSummary,
              recentMemories: memoriesSummary,
              documentsSummary: docsSummary,
              propertySummary,
              financeSummary,
            },
          })
        );
      };

      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data) as {
          type?: string;
          audio?: string;
          text?: string;
          error?: string;
          call?: { id: string; name: string; args: Record<string, unknown> };
        };

        if (msg.type === 'ready') {
          setStatus('connected');
          appendTranscript('system', 'Voice session connected. Speak naturally anytime.');
          const source = inputCtx.createMediaStreamSource(stream);
          const processor = inputCtx.createScriptProcessor(4096, 1, 1);
          processorRef.current = processor;
          source.connect(processor);
          processor.connect(inputCtx.destination);

          processor.onaudioprocess = (e) => {
            if (isMutedRef.current || ws.readyState !== WebSocket.OPEN) return;
            const pcm = floatTo16BitPcmBase64(e.inputBuffer.getChannelData(0));
            ws.send(JSON.stringify({ audio: pcm }));
          };
        } else if (msg.type === 'audio' && msg.audio) {
          playPcmChunk(msg.audio);
        } else if (msg.type === 'inputTranscript' && msg.text) {
          appendTranscript('user', msg.text);
        } else if (msg.type === 'outputTranscript' && msg.text) {
          appendTranscript('assistant', msg.text);
        } else if (msg.type === 'interrupted') {
          clearAudioQueue();
        } else if (msg.type === 'toolCall' && msg.call) {
          void handleLiveToolCall(msg.call);
        } else if (msg.type === 'error') {
          setErrorMessage(msg.error || 'Voice session error');
          setStatus('error');
        } else if (msg.type === 'closed') {
          setStatus('idle');
        }
      };

      ws.onerror = () => {
        setErrorMessage('WebSocket voice connection failed.');
        setStatus('error');
      };

      ws.onclose = () => {
        setStatus((prev) => (prev === 'error' ? 'error' : 'idle'));
      };
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Microphone access is required for live voice chat.'
      );
      setStatus('error');
    }
  }

  function disconnectSession() {
    clearAudioQueue();
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
    }
    if (inputCtxRef.current) {
      void inputCtxRef.current.close();
      inputCtxRef.current = null;
    }
    if (outputCtxRef.current) {
      void outputCtxRef.current.close();
      outputCtxRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setStatus('idle');
  }

  function handleSendTextPrompt(e: React.FormEvent) {
    e.preventDefault();
    if (!textInput.trim() || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    const prompt = textInput.trim();
    appendTranscript('user', prompt);
    wsRef.current.send(JSON.stringify({ text: prompt }));
    setTextInput('');
  }

  async function handleSaveSessionSnapshot() {
    if (transcript.length === 0) return;
    setSavingMemory(true);
    try {
      const completedTitles = tasks
        .filter((t) => t.status === 'completed')
        .slice(0, 8)
        .map((t) => t.title);
      const assistantLines = transcript
        .filter((t) => t.speaker === 'assistant')
        .map((t) => t.text);
      const summary =
        assistantLines[assistantLines.length - 1]?.slice(0, 400) ||
        'Voice check-in covering schedule & follow-up items.';
      const pendingFollowUps = tasks
        .filter((t) => t.status === 'pending')
        .slice(0, 4)
        .map((t) => `${t.title} (Due ${t.dueDate})`);

      await onSaveMemory({
        summary,
        completedTaskTitles: completedTitles,
        followUpSteps: pendingFollowUps,
        transcriptExcerpt: transcript
          .map((t) => `${t.speaker}: ${t.text}`)
          .join('\n')
          .slice(0, 12000),
      });
    } finally {
      setSavingMemory(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Voice Assistant & Memory
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Speak naturally back and forth with live audio transcription, completed-task recall, document lookup, and automatic follow-up tracking.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          {status === 'connected' ? (
            <>
              <button
                type="button"
                onClick={() => setIsMuted((m) => !m)}
                className={`min-h-[44px] inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium rounded-lg border transition-colors ${
                  isMuted
                    ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800 text-amber-800 dark:text-amber-300'
                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200'
                }`}
              >
                {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4 text-teal-700" />}
                <span>{isMuted ? 'Mic Muted' : 'Mic Live'}</span>
              </button>
              <button
                type="button"
                onClick={disconnectSession}
                className="min-h-[44px] inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
              >
                <PhoneOff className="w-4 h-4" />
                <span>End Call</span>
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={startSession}
              disabled={status === 'connecting'}
              className="min-h-[44px] inline-flex items-center gap-2 px-5 py-2 text-sm font-medium text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-60 rounded-lg transition-colors"
            >
              <Mic className="w-4 h-4" />
              <span>{status === 'connecting' ? 'Connecting Voice...' : 'Start Live Voice Chat'}</span>
            </button>
          )}
        </div>
      </div>

      {errorMessage && (
        <div className="p-4 rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 text-sm text-red-700 dark:text-red-300">
          {errorMessage}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Live Conversation & Audio Transcription */}
        <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl flex flex-col min-h-[440px]">
          <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              {status === 'connected' && (
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
              )}
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Live Audio Transcription
              </h2>
            </div>

            {transcript.length > 0 && (
              <button
                type="button"
                onClick={handleSaveSessionSnapshot}
                disabled={savingMemory}
                className="min-h-[36px] inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium text-teal-700 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-950/40 rounded-md transition-colors"
              >
                <BookmarkCheck className="w-3.5 h-3.5" />
                <span>{savingMemory ? 'Saving...' : 'Save Session Memory'}</span>
              </button>
            )}
          </div>

          <div className="flex-1 p-4 space-y-3 overflow-y-auto max-h-[420px]">
            {transcript.length === 0 ? (
              <div className="py-16 text-center space-y-2 max-w-md mx-auto">
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                  Ready for live voice conversation
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  Click &ldquo;Start Live Voice Chat&rdquo; to talk hands-free. Ask things like:
                  &ldquo;What did I finish this week?&rdquo;, &ldquo;Add an oil change for Friday at 9 AM&rdquo;,
                  or &ldquo;Find my tax receipt in the vault.&rdquo;
                </p>
              </div>
            ) : (
              transcript.map((turn) => (
                <div
                  key={turn.id}
                  className={`p-3 rounded-xl text-sm ${
                    turn.speaker === 'user'
                      ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 ml-8'
                      : turn.speaker === 'assistant'
                      ? 'bg-teal-50 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-900 text-slate-900 dark:text-slate-100 mr-8'
                      : 'text-xs font-mono text-slate-500 dark:text-slate-400 text-center'
                  }`}
                >
                  {turn.speaker !== 'system' && (
                    <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
                      {turn.speaker === 'user' ? userName : 'Steward'}
                    </p>
                  )}
                  <p className="leading-relaxed">{turn.text}</p>
                </div>
              ))
            )}
          </div>

          <form
            onSubmit={handleSendTextPrompt}
            className="p-3 border-t border-slate-200 dark:border-slate-800 flex items-center gap-2"
          >
            <input
              type="text"
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              disabled={status !== 'connected'}
              placeholder={
                status === 'connected'
                  ? 'Type a follow-up message or ask by voice...'
                  : 'Connect voice session to chat...'
              }
              className="flex-1 min-h-[44px] px-3.5 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100 disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={status !== 'connected' || !textInput.trim()}
              aria-label="Send message"
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg bg-teal-700 hover:bg-teal-800 disabled:opacity-40 text-white transition-colors"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>

        {/* Memory of Completed Tasks & Follow-up Steps */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Active Memory: Completed Tasks
              </h2>
            </div>
            {tasks.filter((t) => t.status === 'completed').length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Completed tasks appear here and are automatically remembered in your voice sessions.
              </p>
            ) : (
              <ul className="space-y-1.5 text-xs text-slate-700 dark:text-slate-300">
                {tasks
                  .filter((t) => t.status === 'completed')
                  .slice(0, 6)
                  .map((t) => (
                    <li key={t.id} className="flex items-center justify-between gap-2">
                      <span className="truncate">{t.title}</span>
                      <span className="font-mono text-slate-400 shrink-0">{t.dueDate}</span>
                    </li>
                  ))}
              </ul>
            )}
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
            <div className="flex items-center gap-2">
              <ListChecks className="w-4 h-4 text-teal-700 dark:text-teal-400" />
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Saved Voice Memories & Follow-Ups ({memories.length})
              </h2>
            </div>

            {memories.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Ask Steward during a voice call to save follow-up steps, or click &ldquo;Save Session Memory&rdquo; after chatting.
              </p>
            ) : (
              <div className="space-y-3 max-h-[340px] overflow-y-auto pr-1">
                {memories.map((mem) => (
                  <div
                    key={mem.id}
                    className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs font-medium text-slate-900 dark:text-slate-100 leading-relaxed">
                        {mem.summary}
                      </p>
                      <button
                        type="button"
                        aria-label="Delete memory"
                        onClick={() => onDeleteMemory(mem.id)}
                        className="text-slate-400 hover:text-red-600 p-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {mem.followUpSteps.length > 0 && (
                      <div className="space-y-1">
                        <p className="text-[11px] font-semibold text-teal-700 dark:text-teal-400">
                          Follow-Up Steps:
                        </p>
                        {mem.followUpSteps.map((step, i) => (
                          <div key={i} className="flex items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-300">
                            <span>• {step}</span>
                            <button
                              type="button"
                              onClick={() =>
                                onCreateTask({
                                  title: step.slice(0, 180),
                                  type: 'task',
                                  category: 'General',
                                  dueDate: getLocalTodayIso(),
                                  dueTime: '',
                                  estimatedMinutes: 30,
                                  reminderMinutes: 60,
                                  priority: 'medium',
                                  notes: `Follow-up from voice session: ${mem.summary}`,
                                  helpSteps: [],
                                  place: '',
                                  linkedDocumentId: '',
                                })
                              }
                              title="Add to schedule"
                              className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium text-teal-700 dark:text-teal-400 hover:bg-teal-100 dark:hover:bg-teal-900/40 rounded shrink-0"
                            >
                              <Plus className="w-3 h-3" />
                              <span>Schedule</span>
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

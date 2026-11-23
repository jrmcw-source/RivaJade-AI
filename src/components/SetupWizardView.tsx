import { useState } from 'react';
import { Check, ChevronLeft, ChevronRight, X } from 'lucide-react';

// The setup wizard (Jason, 2026-11-21): the desk on first meeting is
// a lot, so a new user is walked in one plain step at a time instead
// of being handed the whole thing at once. Every step can be skipped;
// anything skipped can be done later in Settings. Each step saves as
// it goes, so stopping midway keeps what was finished.

interface SetupWizardViewProps {
  initialDisplayName: string;
  initialAddressName: string;
  existingFamilyName: string | null;
  driveConnected: boolean;
  aiAccess: boolean;
  aiConnectors: boolean;
  aiWrite: boolean;
  onSaveName: (displayName: string, addressName: string) => Promise<void>;
  onCreateFamily: (name: string) => Promise<boolean>;
  onCreateHousehold: (name: string) => Promise<boolean>;
  onConnectDrive: () => Promise<void>;
  onSaveAiPrefs: (patch: {
    aiAccess: boolean;
    aiConnectors: boolean;
    aiWrite: boolean;
  }) => Promise<void>;
  onFinish: () => void;
}

const STEP_TITLES = [
  'Welcome',
  'Your name',
  'Your family',
  'Your household',
  'Safety copies',
  'The assistant',
  'Ready',
];

export default function SetupWizardView(props: SetupWizardViewProps) {
  const [step, setStep] = useState(0);
  const [displayName, setDisplayName] = useState(props.initialDisplayName);
  const [addressName, setAddressName] = useState(props.initialAddressName);
  const [familyName, setFamilyName] = useState('');
  const [householdName, setHouseholdName] = useState('');
  const [familyMade, setFamilyMade] = useState(false);
  const [householdMade, setHouseholdMade] = useState(false);
  const [aiAccess, setAiAccess] = useState(props.aiAccess);
  const [aiConnectors, setAiConnectors] = useState(props.aiConnectors);
  const [aiWrite, setAiWrite] = useState(props.aiWrite);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  const last = STEP_TITLES.length - 1;

  async function next() {
    setNote('');
    setBusy(true);
    let failed = false;
    try {
      if (step === 1) {
        await props.onSaveName(displayName.trim(), addressName.trim());
      } else if (step === 2 && !props.existingFamilyName && !familyMade) {
        const name = familyName.trim();
        if (name) {
          const ok = await props.onCreateFamily(name);
          if (ok) setFamilyMade(true);
        }
      } else if (step === 3 && !householdMade) {
        const name = householdName.trim();
        if (name) {
          const ok = await props.onCreateHousehold(name);
          if (ok) setHouseholdMade(true);
        }
      } else if (step === 5) {
        await props.onSaveAiPrefs({ aiAccess, aiConnectors, aiWrite });
      }
    } catch {
      // A save that fails must never trap the step (pass 24): say so
      // in plain words and move on — the same thing can be finished
      // later in Settings.
      failed = true;
    } finally {
      setBusy(false);
    }
    if (failed) {
      setNote(
        'That step did not save just now. You can finish it later in Settings — moving on.'
      );
    }
    setStep((s) => Math.min(last, s + 1));
  }

  const inputCls =
    'w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 py-2.5 text-base text-slate-900 dark:text-slate-100';

  const toggleRow = (
    label: string,
    words: string,
    value: boolean,
    set: (v: boolean) => void
  ) => (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-slate-200 dark:border-slate-800 p-4">
      <div>
        <p className="text-base font-medium text-slate-900 dark:text-slate-100">{label}</p>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{words}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        aria-label={label}
        onClick={() => set(!value)}
        className={`relative w-12 h-7 rounded-full shrink-0 mt-0.5 ${
          value ? 'bg-teal-700' : 'bg-slate-300 dark:bg-slate-700'
        }`}
      >
        <span
          className={`absolute top-0.5 w-6 h-6 rounded-full bg-white shadow transition-all ${
            value ? 'left-[22px]' : 'left-0.5'
          }`}
        />
      </button>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[70] overflow-y-auto bg-slate-50 dark:bg-slate-950">
      <div className="max-w-2xl mx-auto px-5 py-8 space-y-6">
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Setting up your desk — step {step + 1} of {STEP_TITLES.length}:{' '}
            {STEP_TITLES[step]}
          </p>
          <button
            type="button"
            onClick={props.onFinish}
            className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 shrink-0"
          >
            <X className="w-4 h-4" /> Skip setup
          </button>
        </div>
        <div className="flex gap-1.5" aria-hidden="true">
          {STEP_TITLES.map((t, i) => (
            <span
              key={t}
              className={`h-1.5 flex-1 rounded-full ${
                i <= step ? 'bg-teal-700' : 'bg-slate-200 dark:bg-slate-800'
              }`}
            />
          ))}
        </div>

        {step === 0 && (
          <div className="space-y-4">
            <h1 className="text-3xl font-semibold font-display text-slate-900 dark:text-slate-100">
              Let's set up your desk.
            </h1>
            <p className="text-lg text-slate-600 dark:text-slate-300 leading-relaxed">
              A few short steps, one at a time. Anything you skip can be done
              later in Settings — nothing here is locked in, and each step
              saves as you go.
            </p>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <h1 className="text-2xl font-semibold font-display text-slate-900 dark:text-slate-100">
              What should the desk call you?
            </h1>
            <div className="space-y-3">
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value.slice(0, 120))}
                placeholder="Your name"
                aria-label="Your name"
                className={inputCls}
              />
              <input
                value={addressName}
                onChange={(e) => setAddressName(e.target.value.slice(0, 60))}
                placeholder="A shorter name for greetings — optional"
                aria-label="A shorter name for greetings"
                className={inputCls}
              />
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <h1 className="text-2xl font-semibold font-display text-slate-900 dark:text-slate-100">
              Your family
            </h1>
            {props.existingFamilyName ? (
              <p className="text-lg text-slate-600 dark:text-slate-300 leading-relaxed">
                Your family is already named “{props.existingFamilyName}.”
                Nothing to do on this step.
              </p>
            ) : familyMade ? (
              <p className="text-lg text-slate-600 dark:text-slate-300 leading-relaxed inline-flex items-start gap-2">
                <Check className="w-5 h-5 text-teal-700 mt-1 shrink-0" /> Your
                family is created. You are its head to start — the family can
                choose otherwise later.
              </p>
            ) : (
              <>
                <p className="text-lg text-slate-600 dark:text-slate-300 leading-relaxed">
                  Every desk belongs to a family. Name yours — like “The
                  McWhirter Family.” You are its head to start; the family can
                  choose otherwise later.
                </p>
                <input
                  value={familyName}
                  onChange={(e) => setFamilyName(e.target.value.slice(0, 120))}
                  placeholder="The family name"
                  aria-label="The family name"
                  className={inputCls}
                />
              </>
            )}
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <h1 className="text-2xl font-semibold font-display text-slate-900 dark:text-slate-100">
              Your household
            </h1>
            {householdMade ? (
              <p className="text-lg text-slate-600 dark:text-slate-300 leading-relaxed inline-flex items-start gap-2">
                <Check className="w-5 h-5 text-teal-700 mt-1 shrink-0" /> Your
                household is created and linked to your family.
              </p>
            ) : (
              <>
                <p className="text-lg text-slate-600 dark:text-slate-300 leading-relaxed">
                  A household is one home base — one house, the people under
                  its roof. Name yours — like “Oakleaf.” More households and
                  places can be added any time.
                </p>
                <input
                  value={householdName}
                  onChange={(e) => setHouseholdName(e.target.value.slice(0, 120))}
                  placeholder="The household name"
                  aria-label="The household name"
                  className={inputCls}
                />
              </>
            )}
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4">
            <h1 className="text-2xl font-semibold font-display text-slate-900 dark:text-slate-100">
              Safety copies
            </h1>
            <p className="text-lg text-slate-600 dark:text-slate-300 leading-relaxed">
              GiniApp can keep a safety copy of the whole desk in your own
              Google Drive — your files, in your Drive; the desk just puts
              them there. Connect now, or later from the Drive Backup button
              at the top of the desk.
            </p>
            {props.driveConnected ? (
              <p className="text-base text-teal-700 dark:text-teal-400 inline-flex items-center gap-2">
                <Check className="w-5 h-5" /> Drive is connected.
              </p>
            ) : (
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setBusy(true);
                  setNote('');
                  props
                    .onConnectDrive()
                    .catch(() =>
                      setNote(
                        'That did not connect. You can try again later from Drive Backup.'
                      )
                    )
                    .finally(() => setBusy(false));
                }}
                className="min-h-[44px] px-5 rounded-lg bg-teal-700 text-white text-base font-medium hover:bg-teal-800 disabled:opacity-60"
              >
                Connect Google Drive
              </button>
            )}
          </div>
        )}

        {step === 5 && (
          <div className="space-y-4">
            <h1 className="text-2xl font-semibold font-display text-slate-900 dark:text-slate-100">
              The assistant
            </h1>
            <p className="text-lg text-slate-600 dark:text-slate-300 leading-relaxed">
              The desk has an assistant built in. You decide what it may do —
              these switches are yours, and you can change them any time in
              Settings.
            </p>
            <div className="space-y-3">
              {toggleRow(
                'Read my desk',
                'The assistant can read your records to answer questions and make your briefings. Starts on.',
                aiAccess,
                setAiAccess
              )}
              {toggleRow(
                'Use my connected accounts',
                'The assistant can work with accounts you connect, like email and Drive. Starts on.',
                aiConnectors,
                setAiConnectors
              )}
              {toggleRow(
                'Write for me',
                'The assistant can add and change records itself. Starts off — off means it suggests, and you do the writing.',
                aiWrite,
                setAiWrite
              )}
            </div>
          </div>
        )}

        {step === last && (
          <div className="space-y-4">
            <h1 className="text-3xl font-semibold font-display text-slate-900 dark:text-slate-100">
              Your desk is ready.
            </h1>
            <p className="text-lg text-slate-600 dark:text-slate-300 leading-relaxed">
              The big screen that opens next is your front door — ask it
              anything out loud or in typing, or close it to see the whole
              desk. Everything you skipped lives in Settings, top of the
              sidebar.
            </p>
          </div>
        )}

        {note && (
          <p className="text-sm text-amber-700 dark:text-amber-400">{note}</p>
        )}

        <div className="flex items-center justify-between gap-3 pt-2">
          <button
            type="button"
            disabled={step === 0 || busy}
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            className="inline-flex items-center gap-1 min-h-[44px] px-4 rounded-lg border border-slate-300 dark:border-slate-700 text-base text-slate-600 dark:text-slate-300 disabled:opacity-40"
          >
            <ChevronLeft className="w-4 h-4" /> Back
          </button>
          {step < last ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void next()}
              className="inline-flex items-center gap-1 min-h-[44px] px-5 rounded-lg bg-teal-700 text-white text-base font-medium hover:bg-teal-800 disabled:opacity-60"
            >
              {step === 0 ? 'Start' : 'Next'} <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={props.onFinish}
              className="min-h-[44px] px-5 rounded-lg bg-teal-700 text-white text-base font-medium hover:bg-teal-800"
            >
              Open my desk
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

import React from 'react';
import { EULA_VERSION } from '../types';

interface AboutViewProps {
  mode: 'about' | 'eula';
  onClose: () => void;
  onAccept?: () => void;
  onDecline?: () => void;
}

// The one place the disclaimer lives (Jason, 2026-11-21): an
// About page anyone can open, and the same words as the
// agreement a person accepts before the desk first opens.
// Not repeated on cards, not printed on handouts.
export const AboutView: React.FC<AboutViewProps> = ({ mode, onClose, onAccept, onDecline }) => {
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-white dark:bg-slate-950">
      <div className="max-w-2xl mx-auto px-5 py-8 space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
              Steward
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Part of the family.
            </p>
          </div>
          {mode === 'about' && (
            <button
              type="button"
              onClick={onClose}
              className="min-h-[40px] px-3 text-sm bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-700 dark:text-slate-200"
            >
              Back to the desk
            </button>
          )}
        </div>

        {mode === 'eula' && (
          <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-200">
            Before the desk opens, the agreement. Read it, and accept it to go on —
            or decline, and the desk stays closed.
          </p>
        )}

        <div className="space-y-3">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            What Steward is
          </h2>
          <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
            Steward keeps a family's papers, dates, lists, and money notes in one
            desk, and shares each record exactly as far as its owner says — with a
            person, a household, a family, or a circle the family draws itself.
            Whoever files a record owns it, always. The desk holds records; it does
            not own them, and it does not decide for the family.
          </p>
        </div>

        <div className="space-y-3">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            What Steward is not
          </h2>
          <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
            Steward is an aid, not a legal verdict or a medical diagnostic. It
            follows the documents a family files — a court's custody order, a
            guardianship paper — but it does not decide what the law is, and it
            does not decide anyone's care. Legal authority lives in the court's
            documents. Medical authority lives with the family's doctors. For
            those, get your own doctor and a lawyer.
          </p>
        </div>

        <div className="space-y-3">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            The agreement
          </h2>
          <ol className="list-decimal pl-5 space-y-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
            <li>
              The desk is provided as-is, without warranty of any kind. Your
              records are yours; the backups the desk makes are yours to keep and
              to restore from.
            </li>
            <li>
              Steward is an aid for keeping records. Decisions — legal, medical,
              financial — belong to you and your family, with your own
              professionals.
            </li>
            <li>
              What you file is yours. The desk shares a record only as that
              record's own settings say, and a sealed record is encrypted with
              your passphrase: if the passphrase is lost and no recovery the desk
              offers applies, the desk cannot open it. That is what sealed means.
            </li>
            <li>
              Accepting records your acceptance of these terms, with the date and
              the version ({EULA_VERSION}). If the terms change in substance, the
              desk will ask again before it opens.
            </li>
          </ol>
        </div>

        {mode === 'eula' ? (
          <div className="flex flex-wrap gap-3 pt-2">
            <button
              type="button"
              onClick={onAccept}
              className="min-h-[44px] px-5 text-sm font-medium bg-teal-700 hover:bg-teal-600 text-white rounded-lg"
            >
              I accept
            </button>
            <button
              type="button"
              onClick={onDecline}
              className="min-h-[44px] px-5 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-700 dark:text-slate-200"
            >
              I don't accept
            </button>
          </div>
        ) : (
          <p className="text-xs text-slate-400">
            Agreement version {EULA_VERSION}.
          </p>
        )}
      </div>
    </div>
  );
};

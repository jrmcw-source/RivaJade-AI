import React, { useState } from 'react';
import { Calendar, Camera, Mic, BarChart3, Users, Sparkles, ArrowRight } from 'lucide-react';
import { PWAInstallModalTrigger } from './PWAInstallModal';

interface WelcomeSignInViewProps {
  onSignIn: () => Promise<void>;
  authError: string | null;
}

export const WelcomeSignInView: React.FC<WelcomeSignInViewProps> = ({
  onSignIn,
  authError,
}) => {
  const [signingIn, setSigningIn] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);

  async function handleLogin() {
    setSigningIn(true);
    try {
      await onSignIn();
    } finally {
      setSigningIn(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col">
      {/* 3-Zone Top Bar */}
      <header className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between gap-8">
          <span className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100 whitespace-nowrap shrink-0 font-display">
            Steward
          </span>

          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600 dark:text-slate-300">
            <a href="#features" className="hover:text-slate-900 dark:hover:text-white whitespace-nowrap shrink-0">
              Schedule
            </a>
            <a href="#features" className="hover:text-slate-900 dark:hover:text-white whitespace-nowrap shrink-0">
              OCR Vault
            </a>
            <a href="#features" className="hover:text-slate-900 dark:hover:text-white whitespace-nowrap shrink-0">
              Shared Lists
            </a>
            <a href="#features" className="hover:text-slate-900 dark:hover:text-white whitespace-nowrap shrink-0">
              Voice Live
            </a>
          </nav>

          <button
            type="button"
            onClick={handleLogin}
            disabled={signingIn}
            className="min-h-[44px] px-4 py-2 text-sm font-medium text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            {signingIn ? 'Signing in...' : 'Sign in with Google'}
          </button>
        </div>
      </header>

      {/* Main Split Hero */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-12 lg:py-16 space-y-16">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-stretch">
          <div className="lg:col-span-6 flex flex-col justify-center space-y-6">
            <p className="text-xs font-medium text-teal-700 dark:text-teal-400">
              Personal Schedule · Camera OCR Vault · Collaborative Projects · iOS & Android
            </p>
            <h1 className="text-4xl lg:text-5xl font-bold tracking-tight text-slate-900 dark:text-slate-100 leading-[1.1] text-balance">
              Keep every deadline, document, and household commitment in order.
            </h1>
            <p className="text-base text-slate-600 dark:text-slate-300 leading-relaxed max-w-xl">
              Maintain your calendar across tax due dates, car maintenance, church functions, community service, and hobbies—backed by camera OCR filing, real-time voice conversations, adaptive prioritization, and cloud sync.
            </p>

            {authError && (
              <div className="p-3.5 rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 text-sm text-red-700 dark:text-red-300">
                {authError}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                type="button"
                onClick={handleLogin}
                disabled={signingIn}
                className="min-h-[48px] inline-flex items-center gap-2 px-6 py-3 text-sm font-semibold text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-60 rounded-lg transition-colors"
              >
                <span>{signingIn ? 'Connecting Account...' : 'Continue with Google'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
              <PWAInstallModalTrigger />
            </div>
          </div>

          <div className="lg:col-span-6">
            <div className="h-full min-h-[320px] rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900">
              {!imgFailed ? (
                <img
                  src="/src/assets/images/hero_steward_desk_1794877844733.jpg"
                  alt="Organized home desk with calendar planner and labeled document folders"
                  referrerPolicy="no-referrer"
                  onError={() => setImgFailed(true)}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center p-10 text-center space-y-3 bg-gradient-to-br from-slate-100 to-teal-50 dark:from-slate-900 dark:to-teal-950/40">
                  <Calendar className="w-10 h-10 text-teal-700 dark:text-teal-400" />
                  <p className="text-base font-semibold text-slate-900 dark:text-slate-100">
                    Steward Household & Schedule Hub
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Core Capabilities Grid */}
        <section id="features" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-2.5">
            <Camera className="w-5 h-5 text-teal-700 dark:text-teal-400" />
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Camera OCR Document Vault
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              Capture receipts, tax notices, and repair invoices. Full OCR text extraction, keyword tagging, and instant content search keep every record ready when needed.
            </p>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-2.5">
            <Sparkles className="w-5 h-5 text-teal-700 dark:text-teal-400" />
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Adaptive Priority & Task Help
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              Get step-by-step preparation checklists for complex tasks and an adaptive daily priority plan that learns from your habits and manual overrides.
            </p>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-2.5">
            <Mic className="w-5 h-5 text-teal-700 dark:text-teal-400" />
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Live Voice Chat & Memory
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              Talk back and forth hands-free with live audio transcription, recall completed tasks, search your OCR vault by voice, and save follow-up steps.
            </p>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-2.5">
            <Users className="w-5 h-5 text-teal-700 dark:text-teal-400" />
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Collaborative Shared Lists
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              Invite family or committee members by email or username, assign tasks, and receive live alerts on assignments and completions.
            </p>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-2.5">
            <BarChart3 className="w-5 h-5 text-teal-700 dark:text-teal-400" />
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Secure Progress Analytics
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              Monitor your completion rate, 7-day velocity, and category balance in a private, authenticated cloud-synced dashboard.
            </p>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-2.5">
            <Calendar className="w-5 h-5 text-teal-700 dark:text-teal-400" />
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Integrated Calendar & Mobile PWA
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              Interactive monthly calendar with reminders, synced across desktop browsers and installable standalone apps on iOS and Android.
            </p>
          </div>
        </section>
      </main>
    </div>
  );
};

import React, { useState } from 'react';
import { Smartphone, Download, Share, PlusSquare, CheckCircle2, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export const PWAInstallModalTrigger: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const { isInstallable, isInstalled, isIOS, isAndroid, install } = usePWAInstall();
  const [open, setOpen] = useState(false);
  const [platformTab, setPlatformTab] = useState<'ios' | 'android'>(isIOS ? 'ios' : 'android');

  if (isInstalled) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          if (isInstallable && !isIOS) {
            void install();
          } else {
            setOpen(true);
          }
        }}
        className={
          compact
            ? 'min-h-[44px] inline-flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0'
            : 'min-h-[44px] inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0'
        }
      >
        <Smartphone className="w-4 h-4 text-teal-700 dark:text-teal-400" />
        <span>iOS & Android App</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-md max-h-[92vh] overflow-y-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-5 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  Install GiniApp on iOS & Android
                </h3>
                <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                  Run as a standalone home-screen app with offline access, camera scanning, and cloud sync.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close mobile install guide"
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
              <button
                type="button"
                onClick={() => setPlatformTab('ios')}
                className={`min-h-[40px] px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  platformTab === 'ios'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                iPhone & iPad (iOS)
              </button>
              <button
                type="button"
                onClick={() => setPlatformTab('android')}
                className={`min-h-[40px] px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  platformTab === 'android'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                Android
              </button>
            </div>

            {platformTab === 'ios' ? (
              <div className="space-y-3 text-sm text-slate-700 dark:text-slate-300">
                <div className="flex items-start gap-3 p-3 rounded-lg border border-slate-200 dark:border-slate-800">
                  <Share className="w-5 h-5 text-teal-700 dark:text-teal-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-slate-900 dark:text-slate-100">
                      1. Open in Safari & tap Share
                    </p>
                    <p className="text-slate-600 dark:text-slate-400 mt-0.5">
                      Tap the Share icon in the Safari toolbar at the bottom or top of your iOS screen.
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 rounded-lg border border-slate-200 dark:border-slate-800">
                  <PlusSquare className="w-5 h-5 text-teal-700 dark:text-teal-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-slate-900 dark:text-slate-100">
                      2. Tap Add to Home Screen
                    </p>
                    <p className="text-slate-600 dark:text-slate-400 mt-0.5">
                      Scroll down and select &ldquo;Add to Home Screen&rdquo;, then tap Add to launch GiniApp full-screen.
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-3 text-sm text-slate-700 dark:text-slate-300">
                {isInstallable ? (
                  <button
                    type="button"
                    onClick={async () => {
                      const ok = await install();
                      if (ok) setOpen(false);
                    }}
                    className="w-full min-h-[48px] flex items-center justify-center gap-2 rounded-lg bg-teal-700 hover:bg-teal-800 text-white font-medium transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    <span>Install Android App Now</span>
                  </button>
                ) : (
                  <div className="flex items-start gap-3 p-3 rounded-lg border border-slate-200 dark:border-slate-800">
                    <CheckCircle2 className="w-5 h-5 text-teal-700 dark:text-teal-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium text-slate-900 dark:text-slate-100">
                        {isAndroid ? 'Install via Chrome Menu' : 'Open on Android Chrome'}
                      </p>
                      <p className="text-slate-600 dark:text-slate-400 mt-0.5">
                        Tap the browser menu (three dots) in Chrome and select &ldquo;Install app&rdquo; or &ldquo;Add to Home screen&rdquo;.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}

            <button
              type="button"
              onClick={() => setOpen(false)}
              className="w-full min-h-[44px] py-2 text-sm font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </>
  );
};

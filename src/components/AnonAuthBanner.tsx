import React, { useState } from 'react';
import { useFleet } from '../context/FleetContext';
import { AlertTriangle, RefreshCw, LogIn, ExternalLink, X } from 'lucide-react';

export const AnonAuthBanner: React.FC = () => {
  const { anonDisabled, retryAnonymousAuth, signInGoogle } = useFleet();
  const [dismissed, setDismissed] = useState(false);
  const [retrying, setRetrying] = useState(false);

  if (!anonDisabled || dismissed) {
    return null;
  }

  const handleRetry = async () => {
    setRetrying(true);
    await retryAnonymousAuth();
    setRetrying(false);
  };

  return (
    <div className="bg-amber-950/90 border-b-2 border-amber-500 text-amber-100 px-4 py-3 relative shadow-lg print:hidden">
      <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="bg-amber-500/20 p-2 rounded-md text-amber-400 shrink-0 mt-0.5 sm:mt-0">
            <AlertTriangle className="w-5 h-5 text-amber-400" />
          </div>
          <div className="text-sm">
            <p className="font-bold text-amber-300">
              Anonymous Sign-in is not enabled in Firebase Console
            </p>
            <p className="text-xs text-amber-200/90 mt-0.5">
              Live sync requires authentication. Go to <strong>Firebase Console &gt; Authentication &gt; Sign-in method</strong> and turn on <strong>Anonymous</strong>. All local edits are currently queued safely in offline cache.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
          <button
            onClick={handleRetry}
            disabled={retrying}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-md transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${retrying ? 'animate-spin' : ''}`} />
            Retry
          </button>

          <button
            onClick={() => signInGoogle()}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/30 rounded-md transition-colors"
          >
            <LogIn className="w-3.5 h-3.5" />
            Sign in with Google
          </button>

          <button
            onClick={() => setDismissed(true)}
            aria-label="Dismiss banner"
            className="p-1.5 text-amber-400/80 hover:text-amber-200 rounded-md transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

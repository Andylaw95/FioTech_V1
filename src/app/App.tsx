import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router';
import fiotechLogo from '@/assets/fiotech-logo.png';
import { Layout } from '@/app/components/Layout';
import { Dashboard } from '@/app/pages/Dashboard';
import { Devices } from '@/app/pages/Devices';
import { Alarms } from '@/app/pages/Alarms';
import { BIMTwins } from '@/app/pages/BIMTwins';
import { Settings } from '@/app/pages/Settings';
import { Buildings } from '@/app/pages/Buildings';
import { BuildingDetails } from '@/app/pages/BuildingDetails';
import { Login } from '@/app/pages/Login';
import { WaterAlarms } from '@/app/pages/WaterAlarms';
import { FireAlarms } from '@/app/pages/FireAlarms';
import { SmokeAlarms } from '@/app/pages/SmokeAlarms';
import { Gateways } from '@/app/pages/Gateways';

import { AdminPanel } from '@/app/pages/AdminPanel';
import { NoiseDashboard } from '@/app/pages/NoiseDashboard';
import { DustDashboard } from '@/app/pages/DustDashboard';
import { EnvironmentalMonitoring } from '@/app/pages/EnvironmentalMonitoring';
import { ProfileProvider } from '@/app/utils/ProfileContext';
import { AuthProvider, useAuth } from '@/app/utils/AuthContext';
import { ThemeProvider } from '@/app/utils/ThemeContext';
import { Loader2 } from 'lucide-react';
import { warmupServer, resetWarmup } from '@/app/utils/api';

function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const [devBypass, setDevBypass] = React.useState(() => {
    return import.meta.env.DEV && sessionStorage.getItem('fiotec_dev_bypass') === '1';
  });

  const enableDevBypass = React.useCallback(() => {
    sessionStorage.setItem('fiotec_dev_bypass', '1');
    setDevBypass(true);
  }, []);

  // PERF: Start server warmup in parallel with auth check.
  React.useEffect(() => {
    warmupServer().catch(() => { /* handled by warmupServer itself */ });
  }, []);

  if (devBypass) {
    return <>{children}</>;
  }

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-4">
          <img src={fiotechLogo} alt="FioTec" className="h-14 object-contain" />
          <div className="flex items-center gap-2 text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm font-medium">Loading FioTec...</span>
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <>
        <Login />
        {import.meta.env.DEV && (
          <div className="fixed bottom-4 right-4 z-50">
            <button
              onClick={() => enableDevBypass()}
              className="rounded-lg bg-amber-500 px-4 py-2 text-xs font-medium text-white shadow-lg hover:bg-amber-600 transition-colors"
            >
              🔧 Dev Mode — Skip Login
            </button>
          </div>
        )}
      </>
    );
  }

  return <>{children}</>;
}

/**
 * ServerWarmupGate — primes the Edge Function cold start with a
 * single lightweight /health ping BEFORE any data-fetching
 * components mount. This prevents the thundering herd of 503s
 * that occur when 6-7 API calls hit a cold server simultaneously.
 *
 * If warmup exhausts (server unreachable after 60s), shows an
 * error screen with retry instead of dumping all requests at once.
 */
function ServerWarmupGate({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = React.useState<'loading' | 'success' | 'failed'>('loading');
  const [elapsed, setElapsed] = React.useState(0);
  const startRef = React.useRef(Date.now());

  // Dev bypass skips warmup entirely
  const isDevBypassed = import.meta.env.DEV && sessionStorage.getItem('fiotec_dev_bypass') === '1';

  const attemptWarmup = React.useCallback(() => {
    setStatus('loading');
    setElapsed(0);
    startRef.current = Date.now();
    resetWarmup();
    warmupServer().then((result) => {
      setStatus(result === 'success' ? 'success' : 'failed');
    });
  }, []);

  // Allow users to skip warmup and enter the app without server connectivity.
  // The TransientAuthError + retry system in fetchWithAuth will handle
  // cold-start issues gracefully even without a prior warmup.
  const skipWarmup = React.useCallback(() => {
    console.log('[FioTec] Warmup skipped by user');
    setStatus('success');
  }, []);

  React.useEffect(() => {
    if (isDevBypassed) {
      setStatus('success');
      return;
    }
    warmupServer().then((result) => {
      setStatus(result === 'success' ? 'success' : 'failed');
    });
  }, []);

  // Elapsed timer — gives users visual feedback during cold start
  React.useEffect(() => {
    if (status !== 'loading') return;
    const interval = setInterval(() => {
      setElapsed(Math.round((Date.now() - startRef.current) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [status]);

  if (status === 'loading') {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-4">
          <img src={fiotechLogo} alt="FioTec" className="h-14 object-contain" />
          <div className="flex items-center gap-2 text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm font-medium">Connecting to server...</span>
          </div>
          {elapsed > 5 && (
            <p className="text-xs text-slate-400">
              Server is starting up ({elapsed}s)...
            </p>
          )}
          {elapsed > 8 && (
            <button
              onClick={skipWarmup}
              className="text-xs text-blue-500 hover:text-blue-700 underline underline-offset-2 transition-colors"
            >
              Continue without waiting
            </button>
          )}
          {elapsed > 15 && (
            <p className="text-xs text-slate-400 max-w-xs text-center">
              Cold starts can take up to a minute. You can skip and data will load when ready.
            </p>
          )}
        </div>
      </div>
    );
  }

  if (status === 'failed') {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-5">
          <img src={fiotechLogo} alt="FioTec" className="h-14 object-contain" />
          <div className="text-center">
            <p className="text-sm font-semibold text-slate-800">Unable to reach the server</p>
            <p className="text-xs text-slate-500 mt-1 max-w-xs">
              The backend may still be starting up. You can retry or continue with limited functionality.
            </p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={attemptWarmup}
              className="px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
            >
              Retry Connection
            </button>
            <button
              onClick={skipWarmup}
              className="px-5 py-2 bg-slate-200 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-300 transition-colors"
            >
              Continue Anyway
            </button>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

export default function App() {
  return (
    <AuthProvider>
      <AuthGate>
        <ServerWarmupGate>
          <ThemeProvider>
            <ProfileProvider>
              <BrowserRouter>
                <Routes>
                  <Route path="/" element={<Layout />}>
                    <Route index element={<Dashboard />} />

                    <Route path="buildings" element={<Buildings />} />
                    <Route path="buildings/:id" element={<BuildingDetails />} />
                    <Route path="devices" element={<Devices />} />
                    <Route path="gateways" element={<Gateways />} />
                    <Route path="alarms" element={<Alarms />} />
                    <Route path="alarms/water" element={<WaterAlarms />} />
                    <Route path="alarms/fire" element={<FireAlarms />} />
                    <Route path="alarms/smoke" element={<SmokeAlarms />} />
                    <Route path="noise" element={<NoiseDashboard />} />
                    <Route path="dust" element={<DustDashboard />} />
                    <Route path="environment" element={<EnvironmentalMonitoring />} />
                    <Route path="bim" element={<BIMTwins />} />
                    <Route path="settings" element={<Settings />} />
                    <Route path="admin" element={<AdminPanel />} />
                    <Route path="*" element={<Navigate to="/" replace />} />
                  </Route>
                </Routes>
              </BrowserRouter>
            </ProfileProvider>
          </ThemeProvider>
        </ServerWarmupGate>
      </AuthGate>
    </AuthProvider>
  );
}
import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router';
import fiotechLogo from '@/assets/fiotech-logo.png';
import { Layout } from '@/app/components/Layout';
import { Login } from '@/app/pages/Login';

// Code-split: heavy pages are lazy-loaded so the initial bundle stays small.
// Login + Layout are eager to render the first paint without a fallback flash.
const Dashboard = React.lazy(() => import('@/app/pages/Dashboard').then(m => ({ default: m.Dashboard })));
const Devices = React.lazy(() => import('@/app/pages/Devices').then(m => ({ default: m.Devices })));
const Alarms = React.lazy(() => import('@/app/pages/Alarms').then(m => ({ default: m.Alarms })));
const BIMTwins = React.lazy(() => import('@/app/pages/BIMTwins').then(m => ({ default: m.BIMTwins })));
const Settings = React.lazy(() => import('@/app/pages/Settings').then(m => ({ default: m.Settings })));
const Buildings = React.lazy(() => import('@/app/pages/Buildings').then(m => ({ default: m.Buildings })));
const BuildingDetails = React.lazy(() => import('@/app/pages/BuildingDetails').then(m => ({ default: m.BuildingDetails })));
const WaterAlarms = React.lazy(() => import('@/app/pages/WaterAlarms').then(m => ({ default: m.WaterAlarms })));
const FireAlarms = React.lazy(() => import('@/app/pages/FireAlarms').then(m => ({ default: m.FireAlarms })));
const SmokeAlarms = React.lazy(() => import('@/app/pages/SmokeAlarms').then(m => ({ default: m.SmokeAlarms })));
const VibrationAlarms = React.lazy(() => import('@/app/pages/VibrationAlarms').then(m => ({ default: m.VibrationAlarms })));
const Gateways = React.lazy(() => import('@/app/pages/Gateways').then(m => ({ default: m.Gateways })));
const AdminPanel = React.lazy(() => import('@/app/pages/AdminPanel').then(m => ({ default: m.AdminPanel })));
const NoiseDashboard = React.lazy(() => import('@/app/pages/NoiseDashboard').then(m => ({ default: m.NoiseDashboard })));
const DustDashboard = React.lazy(() => import('@/app/pages/DustDashboard').then(m => ({ default: m.DustDashboard })));
const VibrationDashboard = React.lazy(() => import('@/app/pages/VibrationDashboard').then(m => ({ default: m.VibrationDashboard })));
const EnvironmentalMonitoring = React.lazy(() => import('@/app/pages/EnvironmentalMonitoring').then(m => ({ default: m.EnvironmentalMonitoring })));
const DigitalTwinPortfolio = React.lazy(() => import('@/app/pages/DigitalTwin/Portfolio').then(m => ({ default: m.Portfolio })));
const BIM3DDemo = React.lazy(() => import('@/app/pages/demo/BIM3DDemo').then(m => ({ default: m.BIM3DDemo })));

import { ProfileProvider } from '@/app/utils/ProfileContext';
import { AuthProvider, useAuth } from '@/app/utils/AuthContext';
import { ThemeProvider } from '@/app/utils/ThemeContext';
import { Loader2 } from 'lucide-react';
import { warmupServer, resetWarmup } from '@/app/utils/api';
import { SpeedInsights } from '@vercel/speed-insights/react';

class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[AppErrorBoundary] caught', error, info);
  }
  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
          <div className="max-w-2xl w-full rounded-xl border border-rose-200 bg-white p-6 shadow-lg">
            <h1 className="text-lg font-semibold text-rose-600 mb-2">App crashed</h1>
            <p className="text-sm text-slate-600 mb-3">{this.state.error.message}</p>
            <pre className="text-xs bg-slate-900 text-slate-100 p-3 rounded overflow-auto max-h-72 whitespace-pre-wrap">{this.state.error.stack}</pre>
            <button
              onClick={() => { this.setState({ error: null }); location.reload(); }}
              className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
            >Reload</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

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
    <AppErrorBoundary>
      <AuthProvider>
        <AuthGate>
          <ServerWarmupGate>
            <ThemeProvider>
              <ProfileProvider>
                <BrowserRouter>
                  <React.Suspense fallback={
                    <div className="flex h-screen items-center justify-center bg-slate-50">
                      <div className="flex flex-col items-center gap-3">
                        <img src={fiotechLogo} alt="FioTec" className="h-12 object-contain" />
                        <div className="flex items-center gap-2 text-slate-500">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span className="text-sm font-medium">Loading...</span>
                        </div>
                      </div>
                    </div>
                  }>
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
                        <Route path="alarms/vibration" element={<VibrationAlarms />} />
                        <Route path="noise" element={<NoiseDashboard />} />
                        <Route path="dust" element={<DustDashboard />} />
                        <Route path="environment" element={<EnvironmentalMonitoring />} />
                        <Route path="environment/noise" element={<NoiseDashboard />} />
                        <Route path="environment/dust" element={<DustDashboard />} />
                        <Route path="environment/vibration" element={<VibrationDashboard />} />
                        <Route path="vibration" element={<VibrationDashboard />} />
                        <Route path="bim" element={<BIMTwins />} />
                        <Route path="bim-legacy" element={<BIMTwins />} />
                        <Route path="digital-twin-v2" element={<DigitalTwinPortfolio />} />
                        <Route path="digital-twin-v2/:propertyId" element={<BIM3DDemo />} />
                        <Route path="demo/bim-3d" element={<BIM3DDemo />} />
                        <Route path="settings" element={<Settings />} />
                        <Route path="admin" element={<AdminPanel />} />
                        <Route path="*" element={<Navigate to="/" replace />} />
                      </Route>
                    </Routes>
                  </React.Suspense>
                </BrowserRouter>
                <SpeedInsights />
              </ProfileProvider>
            </ThemeProvider>
          </ServerWarmupGate>
        </AuthGate>
      </AuthProvider>
    </AppErrorBoundary>
  );
}
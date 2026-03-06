import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import fiotechLogo from '@/assets/fiotech-logo.png';
import fiotechAppLogo from '@/assets/fiotech-applogo.png';
import { Eye, EyeOff, Loader2, AlertCircle, Building2, Cpu, Shield, Activity, Play } from 'lucide-react';
import { useAuth } from '@/app/utils/AuthContext';
import { setDemoMode } from '@/app/utils/demoMode';
import { clsx } from 'clsx';

export function Login() {
  const { signIn, demoLogin } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [quickLoading, setQuickLoading] = useState<'demo' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const result = await signIn(email, password);
      if (result.error) {
        // Friendlier error for unconfirmed email
        const msg = result.error.toLowerCase();
        if (msg.includes('email not confirmed') || msg.includes('not confirmed')) {
          setError('Email not confirmed. Please check your inbox and click the confirmation link.');
        } else {
          setError(result.error);
        }
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickLogin = async (type: 'demo') => {
    setError(null);
    setQuickLoading(type);

    // Demo account: fully offline, no backend needed
    setDemoMode(true);
    demoLogin();
    setQuickLoading(null);
  };

  const features = [
    { icon: Building2, label: 'Property Management', desc: 'Manage buildings, floors, and zones' },
    { icon: Cpu, label: 'IoT Device Control', desc: 'Monitor sensors in real-time' },
    { icon: Activity, label: 'Digital Twin', desc: 'Interactive 3D building visualization' },
    { icon: Shield, label: 'Smart Alarms', desc: 'Auto-generated threshold alerts' },
  ];

  const isAnyLoading = loading || quickLoading !== null;

  return (
    <div className="min-h-screen flex bg-slate-50">
      {/* Left Panel — Branding */}
      <div className="hidden lg:flex lg:w-1/2 relative bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 overflow-hidden">
        <div className="absolute inset-0 opacity-[0.05]"
          style={{ backgroundImage: 'radial-gradient(#fff 1px, transparent 1px)', backgroundSize: '24px 24px' }} />
        
        <div className="absolute inset-0">
          <svg className="w-full h-full opacity-10" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="grid" width="60" height="60" patternUnits="userSpaceOnUse">
                <path d="M 60 0 L 0 0 0 60" fill="none" stroke="#3b82f6" strokeWidth="0.5" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid)" />
          </svg>
        </div>

        <div className="relative z-10 flex flex-col justify-between p-12 w-full">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <img src={fiotechLogo} alt="FioTec" className="h-16 object-contain brightness-0 invert" />
            </div>
            <p className="text-blue-300 text-sm mt-1">IoT Property Management Platform</p>
          </div>

          <div className="space-y-6">
            <h2 className="text-3xl font-bold text-white leading-tight">
              Smart buildings.<br />Smarter management.
            </h2>
            <p className="text-blue-200/70 text-base max-w-md">
              Monitor sensors, manage properties, and respond to alerts across your entire portfolio from a single dashboard.
            </p>

            <div className="grid grid-cols-2 gap-4 mt-8">
              {features.map((f, i) => (
                <motion.div
                  key={f.label}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 + i * 0.1 }}
                  className="p-4 rounded-xl bg-white/5 border border-white/10 backdrop-blur-sm"
                >
                  <f.icon className="h-5 w-5 text-blue-400 mb-2" />
                  <h4 className="text-sm font-semibold text-white">{f.label}</h4>
                  <p className="text-xs text-blue-300/60 mt-0.5">{f.desc}</p>
                </motion.div>
              ))}
            </div>
          </div>

          <div className="text-xs text-blue-300/40">
            &copy; 2026 FioTec Solutions. All rights reserved.
          </div>
        </div>
      </div>

      {/* Right Panel — Login Form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md"
        >
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-2 mb-8">
            <img src={fiotechAppLogo} alt="FioTec" className="h-9 w-9 object-contain" />
            <span className="text-xl font-bold text-slate-900 tracking-tight">FioTec</span>
          </div>

          <div className="mb-8">
            <h1 className="text-2xl font-bold text-slate-900">Welcome back</h1>
            <p className="text-sm text-slate-500 mt-1">
              Sign in to access your IoT dashboard
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <AnimatePresence mode="wait">
              {error && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm"
                >
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </motion.div>
              )}
            </AnimatePresence>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@company.com"
                className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all"
                autoComplete="email"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Min 8 characters"
                  className="w-full h-11 px-4 pr-11 rounded-xl border border-slate-200 bg-white text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all"
                  autoComplete="current-password"
                  required
                  minLength={8}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isAnyLoading}
              className={clsx(
                "w-full h-11 rounded-xl text-sm font-semibold text-white transition-all flex items-center justify-center gap-2",
                isAnyLoading
                  ? "bg-blue-400 cursor-not-allowed"
                  : "bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40"
              )}
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Signing in...
                </>
              ) : (
                'Sign In'
              )}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-sm text-slate-500">
              Need an account? Contact your administrator.
            </p>
          </div>

          {/* Quick Access Accounts */}
          <div className="mt-6 space-y-3">
              <div className="flex items-center gap-2">
                <div className="flex-1 h-px bg-slate-200" />
                <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Quick Access</span>
                <div className="flex-1 h-px bg-slate-200" />
              </div>

              <div className="flex justify-center">
                {/* Demo Account */}
                <button
                  onClick={() => handleQuickLogin('demo')}
                  disabled={isAnyLoading}
                  className={clsx(
                    "relative overflow-hidden rounded-xl border p-4 text-left transition-all group w-full max-w-xs",
                    isAnyLoading
                      ? "opacity-50 cursor-not-allowed border-slate-200"
                      : "border-purple-200 hover:border-purple-300 hover:shadow-md hover:shadow-purple-500/10 cursor-pointer"
                  )}
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-purple-50 to-indigo-50/50 opacity-60" />
                  <div className="relative">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="h-8 w-8 rounded-lg bg-purple-100 flex items-center justify-center">
                        {quickLoading === 'demo' ? (
                          <Loader2 className="h-4 w-4 animate-spin text-purple-600" />
                        ) : (
                          <Play className="h-4 w-4 text-purple-600" />
                        )}
                      </div>
                      <span className="text-xs font-bold text-purple-700 uppercase tracking-wider">Demo</span>
                    </div>
                    <p className="text-xs font-semibold text-slate-800 mb-0.5">Demonstration</p>
                    <p className="text-[11px] text-slate-500 leading-tight">
                      Pre-loaded with 8 properties, 25 devices, and live alarms
                    </p>
                  </div>
                </button>
              </div>
            </div>
        </motion.div>
      </div>
    </div>
  );
}

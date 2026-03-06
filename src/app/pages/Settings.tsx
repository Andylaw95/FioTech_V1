import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  User,
  Bell,
  Shield,
  Gauge,
  Database,
  Server,
  Save,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Download,
  RotateCcw,
  Mail,
  Smartphone,
  BellRing,
  Droplets,
  Wind,
  Wifi,
  WifiOff,
  Thermometer,
  Moon,
  Clock,
  Eye,
  EyeOff,
  ChevronRight,
  Phone,
  Building2,
  Globe,
  Calendar,
  Timer,
  LayoutGrid,
  ShieldCheck,
  KeyRound,
  LogIn,
  Trash2,
  FileJson,
  Activity,
  HardDrive,
  Radio,
  Copy,
  RefreshCw,
  Zap,
  Camera,
  Upload,
  X,
} from 'lucide-react';
import { clsx } from 'clsx';
import { motion, AnimatePresence } from 'motion/react';
import { api, type AppSettings, type WebhookConfig } from '@/app/utils/api';
import { useAuth } from '@/app/utils/AuthContext';
import { toast } from 'sonner';
import { AWSConfigPanel } from '@/app/components/AWSConfigPanel';

type SettingsTab = 'profile' | 'notifications' | 'dashboard' | 'security' | 'data' | 'aws' | 'system';

const TABS: { id: SettingsTab; label: string; icon: React.ElementType; description: string }[] = [
  { id: 'profile', label: 'Profile', icon: User, description: 'Account information' },
  { id: 'notifications', label: 'Notifications', icon: Bell, description: 'Alert preferences' },
  { id: 'dashboard', label: 'Dashboard', icon: Gauge, description: 'Display preferences' },
  { id: 'security', label: 'Security', icon: Shield, description: 'Authentication & access' },
  { id: 'data', label: 'Data Management', icon: Database, description: 'Export & reset' },
  { id: 'aws', label: 'AWS Cloud', icon: Globe, description: 'IoT Core & DynamoDB' },
  { id: 'system', label: 'System', icon: Server, description: 'Health & diagnostics' },
];

// --- Toggle Switch Component ---
function ToggleSwitch({
  enabled,
  onChange,
  disabled = false,
}: {
  enabled: boolean;
  onChange: (val: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      disabled={disabled}
      onClick={() => onChange(!enabled)}
      className={clsx(
        'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2',
        enabled ? 'bg-blue-600' : 'bg-slate-200',
        disabled && 'opacity-50 cursor-not-allowed'
      )}
    >
      <span
        className={clsx(
          'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out',
          enabled ? 'translate-x-5' : 'translate-x-0'
        )}
      />
    </button>
  );
}

// --- Section Wrapper ---
function SettingsSection({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="px-4 sm:px-6 py-4 sm:py-5 border-b border-slate-100">
        <h3 className="text-base sm:text-lg font-semibold text-slate-900">{title}</h3>
        {description && <p className="text-sm sm:text-base text-slate-500 mt-0.5">{description}</p>}
      </div>
      <div className="p-4 sm:p-6">{children}</div>
    </div>
  );
}

// --- Row Item ---
function SettingsRow({
  icon: Icon,
  iconColor = 'text-slate-500',
  iconBg = 'bg-slate-50',
  label,
  description,
  children,
}: {
  icon?: React.ElementType;
  iconColor?: string;
  iconBg?: string;
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-4 first:pt-0 last:pb-0 border-b border-slate-50 last:border-none">
      <div className="flex items-center gap-3 min-w-0">
        {Icon && (
          <div className={clsx('p-2 rounded-lg shrink-0', iconBg, iconColor)}>
            <Icon className="h-5 w-5" />
          </div>
        )}
        <div className="min-w-0">
          <p className="text-base font-medium text-slate-900">{label}</p>
          {description && <p className="text-sm text-slate-500 mt-0.5 truncate">{description}</p>}
        </div>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export function Settings() {
  const { isAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState<SettingsTab>('profile');
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [healthStatus, setHealthStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const [dataStats, setDataStats] = useState<{ properties: number; devices: number } | null>(null);
  const [resetting, setResetting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  // Webhook / Gateway integration state
  const [webhookConfig, setWebhookConfig] = useState<WebhookConfig | null>(null);
  const [webhookLoading, setWebhookLoading] = useState(false);
  const [webhookGenerating, setWebhookGenerating] = useState(false);

  // Avatar upload state
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);

  const handleAvatarUpload = async (file: File) => {
    const allowedTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
    if (!allowedTypes.includes(file.type)) {
      toast.error('Please upload a PNG, JPG, WebP, or GIF image');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error('Image must be under 10MB');
      return;
    }
    setAvatarUploading(true);
    try {
      const result = await api.uploadImage(file);
      // Update local settings state
      updateLocal('profile.avatar', result.url);
      // Save to backend immediately
      const updated = await api.updateSettings({ profile: { ...settings!.profile, avatar: result.url } });
      setSettings(updated);
      // Broadcast to Layout header instantly
      window.dispatchEvent(new CustomEvent('fiotec-profile-update', {
        detail: { name: updated.profile.name, role: updated.profile.role, avatar: result.url }
      }));
      toast.success('Profile photo updated');
    } catch (err) {
      console.error('Avatar upload failed:', err);
      toast.error('Failed to upload photo. Please try again.');
    } finally {
      setAvatarUploading(false);
    }
  };

  const handleRemoveAvatar = async () => {
    if (!settings) return;
    try {
      setSaving(true);
      const updated = await api.updateSettings({ profile: { ...settings.profile, avatar: '' } });
      setSettings(updated);
      window.dispatchEvent(new CustomEvent('fiotec-profile-update', {
        detail: { name: updated.profile.name, role: updated.profile.role, avatar: '' }
      }));
      toast.success('Profile photo removed');
    } catch (err) {
      console.error('Failed to remove avatar:', err);
      toast.error('Failed to remove photo');
    } finally {
      setSaving(false);
    }
  };

  // Load settings on mount
  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const data = await api.getSettings();
      setSettings(data);
    } catch (err) {
      console.error('Failed to load settings:', err);
      toast.error('Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  // Save a section of settings
  const saveSettings = useCallback(
    async (partial: Partial<AppSettings>) => {
      if (!settings) return;
      setSaving(true);
      try {
        const updated = await api.updateSettings(partial);
        setSettings(updated);
        // Instantly update profile name/avatar in header via context
        if (updated?.profile?.name) {
          window.dispatchEvent(new CustomEvent('fiotec-profile-update', { 
            detail: { name: updated.profile.name, role: updated.profile.role, avatar: updated.profile.avatar || '' } 
          }));
        }
        toast.success('Settings saved successfully');
      } catch (err) {
        console.error('Failed to save settings:', err);
        toast.error('Failed to save settings');
      } finally {
        setSaving(false);
      }
    },
    [settings]
  );

  // Local state updater (optimistic)
  const updateLocal = (path: string, value: any) => {
    if (!settings) return;
    const keys = path.split('.');
    const updated = JSON.parse(JSON.stringify(settings));
    let obj = updated;
    for (let i = 0; i < keys.length - 1; i++) {
      obj = obj[keys[i]];
    }
    obj[keys[keys.length - 1]] = value;
    setSettings(updated);
  };

  // Get nested value
  const getVal = (path: string) => {
    if (!settings) return undefined;
    const keys = path.split('.');
    let obj: any = settings;
    for (const k of keys) {
      obj = obj?.[k];
    }
    return obj;
  };

  // Health check
  const checkHealth = async () => {
    setHealthStatus('checking');
    try {
      const res = await api.healthCheck();
      setHealthStatus(res.status === 'ok' ? 'online' : 'offline');
    } catch {
      setHealthStatus('offline');
    }
  };

  // Load system data
  useEffect(() => {
    if (activeTab === 'system') {
      checkHealth();
      loadWebhookConfig();
      Promise.all([api.getProperties(), api.getDevices()]).then(([props, devs]) => {
        setDataStats({ properties: props.length, devices: devs.length });
      }).catch(() => {});
    }
  }, [activeTab]);

  // Webhook config management
  const loadWebhookConfig = async () => {
    setWebhookLoading(true);
    try {
      const config = await api.getWebhookConfig();
      setWebhookConfig(config);
    } catch (err) {
      console.error('Failed to load webhook config:', err);
    } finally {
      setWebhookLoading(false);
    }
  };

  const handleGenerateToken = async () => {
    setWebhookGenerating(true);
    try {
      const config = await api.generateWebhookToken();
      setWebhookConfig(config);
      toast.success('Webhook token generated successfully');
    } catch (err) {
      console.error('Failed to generate webhook token:', err);
      const msg = err instanceof Error ? err.message : 'Failed to generate webhook token';
      toast.error(msg.length > 120 ? 'Failed to generate webhook token. Check console.' : msg);
    } finally {
      setWebhookGenerating(false);
    }
  };

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied to clipboard`);
    } catch {
      toast.error('Failed to copy to clipboard');
    }
  };

  // Handle data export
  const handleExport = async () => {
    setExporting(true);
    try {
      const data = await api.exportData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `fiotec-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('Data exported successfully');
    } catch (err) {
      console.error('Export failed:', err);
      toast.error('Failed to export data');
    } finally {
      setExporting(false);
    }
  };

  // Handle data reset
  const handleReset = async () => {
    setResetting(true);
    try {
      await api.resetData();
      await loadSettings();
      setShowResetConfirm(false);
      toast.success('All data has been reset to defaults');
    } catch (err) {
      console.error('Reset failed:', err);
      toast.error('Failed to reset data');
    } finally {
      setResetting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          <p className="text-sm text-slate-500">Loading settings...</p>
        </div>
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="flex flex-col items-center gap-3">
          <AlertTriangle className="h-8 w-8 text-amber-500" />
          <p className="text-sm text-slate-700 font-medium">Unable to load settings</p>
          <button onClick={loadSettings} className="text-sm text-blue-600 hover:underline">
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl lg:text-3xl font-bold text-slate-900">Settings</h2>
        <p className="text-sm sm:text-base text-slate-500 mt-1">Manage your account, notifications, and system preferences.</p>
      </div>

      <div className="flex flex-col lg:flex-row gap-4 sm:gap-6">
        {/* Sidebar Tabs — horizontal scroll on mobile, vertical on lg */}
        <nav className="lg:w-52 xl:w-64 shrink-0">
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="flex lg:flex-col overflow-x-auto lg:overflow-x-visible p-1.5 lg:p-2 gap-1 lg:gap-0.5 no-scrollbar">
              {TABS.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={clsx(
                      'flex items-center gap-2 lg:gap-3 w-auto lg:w-full shrink-0 rounded-xl px-3 py-2 lg:py-3 text-left transition-all',
                      isActive
                        ? 'bg-blue-50 text-blue-700'
                        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                    )}
                  >
                    <div
                      className={clsx(
                        'p-1.5 lg:p-2 rounded-lg',
                        isActive ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-500'
                      )}
                    >
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <p className={clsx('text-sm lg:text-base font-medium whitespace-nowrap', isActive && 'text-blue-700')}>{tab.label}</p>
                      <p className="text-xs text-slate-500 truncate hidden lg:block">{tab.description}</p>
                    </div>
                    {isActive && <ChevronRight className="h-4 w-4 ml-auto text-blue-400 shrink-0 hidden lg:block" />}
                  </button>
                );
              })}
            </div>
          </div>
        </nav>

        {/* Content Area */}
        <div className="flex-1 min-w-0 space-y-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="space-y-6"
            >
              {/* ===== PROFILE TAB ===== */}
              {activeTab === 'profile' && (
                <>
                  <SettingsSection title="Personal Information" description="Update your name, email, and contact details.">
                    <div className="flex flex-col sm:flex-row gap-6 mb-6">
                      <div className="shrink-0">
                        <div className="relative group">
                          <input
                            ref={avatarInputRef}
                            type="file"
                            accept="image/png,image/jpeg,image/webp,image/gif"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) handleAvatarUpload(file);
                              e.target.value = '';
                            }}
                          />
                          {settings.profile.avatar ? (
                            <img
                              src={settings.profile.avatar}
                              alt="Profile"
                              className="h-20 w-20 rounded-2xl object-cover ring-2 ring-slate-100"
                            />
                          ) : (
                            <div className="h-20 w-20 rounded-2xl bg-blue-600 ring-2 ring-slate-100 flex items-center justify-center">
                              <span className="text-2xl font-bold text-white">
                                {settings.profile.name ? settings.profile.name.charAt(0).toUpperCase() : 'U'}
                              </span>
                            </div>
                          )}
                          {/* Overlay on hover */}
                          <button
                            type="button"
                            onClick={() => avatarInputRef.current?.click()}
                            disabled={avatarUploading}
                            className="absolute inset-0 rounded-2xl bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer"
                          >
                            {avatarUploading ? (
                              <Loader2 className="h-6 w-6 text-white animate-spin" />
                            ) : (
                              <Camera className="h-6 w-6 text-white" />
                            )}
                          </button>
                          {/* Status badge / remove button */}
                          {settings.profile.avatar ? (
                            <button
                              type="button"
                              onClick={handleRemoveAvatar}
                              className="absolute -bottom-1 -right-1 h-6 w-6 rounded-full bg-red-500 ring-2 ring-white flex items-center justify-center hover:bg-red-600 transition-colors"
                              title="Remove photo"
                            >
                              <X className="h-3.5 w-3.5 text-white" />
                            </button>
                          ) : (
                            <div className="absolute -bottom-1 -right-1 h-6 w-6 rounded-full bg-slate-400 ring-2 ring-white flex items-center justify-center">
                              <Camera className="h-3 w-3 text-white" />
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex-1 space-y-1">
                        <p className="text-sm font-semibold text-slate-900">{settings.profile.name}</p>
                        <p className="text-xs text-slate-500">{settings.profile.role} at {settings.profile.company}</p>
                        <span className="inline-flex items-center gap-1 mt-2 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[11px] font-medium ring-1 ring-emerald-200">
                          <CheckCircle2 className="h-3 w-3" /> Active Account
                        </span>
                        <p className="text-[11px] text-slate-400 mt-1">Hover on photo to change · Max 10MB</p>
                      </div>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1.5">Full Name</label>
                        <input
                          type="text"
                          value={settings.profile.name}
                          onChange={(e) => updateLocal('profile.name', e.target.value)}
                          className="w-full h-10 px-3 rounded-lg border border-slate-200 bg-white text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1.5">Email Address</label>
                        <input
                          type="email"
                          value={settings.profile.email}
                          readOnly
                          disabled
                          title="Email is managed by Supabase Auth and cannot be changed here"
                          className="w-full h-10 px-3 rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-500 outline-none cursor-not-allowed"
                        />
                        <p className="text-[11px] text-slate-400 mt-1">Managed by authentication provider</p>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1.5">Phone Number</label>
                        <input
                          type="tel"
                          value={settings.profile.phone}
                          onChange={(e) => updateLocal('profile.phone', e.target.value)}
                          className="w-full h-10 px-3 rounded-lg border border-slate-200 bg-white text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1.5">Company</label>
                        <input
                          type="text"
                          value={settings.profile.company}
                          onChange={(e) => updateLocal('profile.company', e.target.value)}
                          className="w-full h-10 px-3 rounded-lg border border-slate-200 bg-white text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1.5">Role</label>
                        <input
                          type="text"
                          value={settings.profile.role}
                          readOnly
                          disabled
                          title="Role is assigned by administrators and cannot be self-modified"
                          className="w-full h-10 px-3 rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-500 outline-none cursor-not-allowed"
                        />
                        <p className="text-[11px] text-slate-400 mt-1">Assigned by system administrator</p>
                      </div>
                    </div>

                    <div className="mt-6 flex justify-end">
                      <button
                        onClick={() => saveSettings({ profile: settings.profile })}
                        disabled={saving}
                        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-all shadow-sm"
                      >
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        Save Profile
                      </button>
                    </div>
                  </SettingsSection>
                </>
              )}

              {/* ===== NOTIFICATIONS TAB ===== */}
              {activeTab === 'notifications' && (
                <>
                  <SettingsSection title="Notification Channels" description="Choose how you want to receive alerts.">
                    <SettingsRow icon={Mail} iconBg="bg-blue-50" iconColor="text-blue-600" label="Email Alerts" description="Receive notifications via email">
                      <ToggleSwitch enabled={settings.notifications.emailAlerts} onChange={(v) => updateLocal('notifications.emailAlerts', v)} />
                    </SettingsRow>
                    <SettingsRow icon={Smartphone} iconBg="bg-violet-50" iconColor="text-violet-600" label="SMS Alerts" description="Get text messages for critical alerts">
                      <ToggleSwitch enabled={settings.notifications.smsAlerts} onChange={(v) => updateLocal('notifications.smsAlerts', v)} />
                    </SettingsRow>
                    <SettingsRow icon={BellRing} iconBg="bg-amber-50" iconColor="text-amber-600" label="Push Notifications" description="Browser and mobile push alerts">
                      <ToggleSwitch enabled={settings.notifications.pushNotifications} onChange={(v) => updateLocal('notifications.pushNotifications', v)} />
                    </SettingsRow>
                  </SettingsSection>

                  <SettingsSection title="Alert Types" description="Select which event types trigger notifications.">
                    <SettingsRow icon={Droplets} iconBg="bg-blue-50" iconColor="text-blue-600" label="Water Leak Detection" description="Alerts when water sensors detect a leak">
                      <ToggleSwitch enabled={settings.notifications.alertTypes.waterLeak} onChange={(v) => updateLocal('notifications.alertTypes.waterLeak', v)} />
                    </SettingsRow>
                    <SettingsRow icon={Wind} iconBg="bg-red-50" iconColor="text-red-600" label="Smoke & Fire" description="Smoke detector and fire alarm triggers">
                      <ToggleSwitch enabled={settings.notifications.alertTypes.smoke} onChange={(v) => updateLocal('notifications.alertTypes.smoke', v)} />
                    </SettingsRow>
                    <SettingsRow icon={WifiOff} iconBg="bg-slate-100" iconColor="text-slate-600" label="Device Offline" description="When a sensor goes offline or disconnects">
                      <ToggleSwitch enabled={settings.notifications.alertTypes.deviceOffline} onChange={(v) => updateLocal('notifications.alertTypes.deviceOffline', v)} />
                    </SettingsRow>
                    <SettingsRow icon={Droplets} iconBg="bg-teal-50" iconColor="text-teal-600" label="High Humidity" description="Humidity exceeds defined threshold">
                      <ToggleSwitch enabled={settings.notifications.alertTypes.highHumidity} onChange={(v) => updateLocal('notifications.alertTypes.highHumidity', v)} />
                    </SettingsRow>
                    <SettingsRow icon={Thermometer} iconBg="bg-orange-50" iconColor="text-orange-600" label="Temperature Anomaly" description="Temperature readings outside normal range">
                      <ToggleSwitch enabled={settings.notifications.alertTypes.temperature} onChange={(v) => updateLocal('notifications.alertTypes.temperature', v)} />
                    </SettingsRow>
                  </SettingsSection>

                  <SettingsSection title="Quiet Hours" description="Suppress non-critical notifications during set hours.">
                    <SettingsRow icon={Moon} iconBg="bg-indigo-50" iconColor="text-indigo-600" label="Enable Quiet Hours" description="Silence non-critical alerts during these times">
                      <ToggleSwitch enabled={settings.notifications.quietHoursEnabled} onChange={(v) => updateLocal('notifications.quietHoursEnabled', v)} />
                    </SettingsRow>
                    {settings.notifications.quietHoursEnabled && (
                      <div className="flex flex-wrap items-center gap-3 pt-4 pl-4 sm:pl-12">
                        <div>
                          <label className="block text-xs font-medium text-slate-500 mb-1">Start</label>
                          <input
                            type="time"
                            value={settings.notifications.quietHoursStart}
                            onChange={(e) => updateLocal('notifications.quietHoursStart', e.target.value)}
                            className="h-9 px-3 rounded-lg border border-slate-200 bg-white text-sm outline-none focus:border-blue-500 transition-all"
                          />
                        </div>
                        <span className="text-slate-400 mt-5">to</span>
                        <div>
                          <label className="block text-xs font-medium text-slate-500 mb-1">End</label>
                          <input
                            type="time"
                            value={settings.notifications.quietHoursEnd}
                            onChange={(e) => updateLocal('notifications.quietHoursEnd', e.target.value)}
                            className="h-9 px-3 rounded-lg border border-slate-200 bg-white text-sm outline-none focus:border-blue-500 transition-all"
                          />
                        </div>
                      </div>
                    )}
                  </SettingsSection>

                  <div className="flex justify-end">
                    <button
                      onClick={() => saveSettings({ notifications: settings.notifications })}
                      disabled={saving}
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-all shadow-sm"
                    >
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      Save Notification Preferences
                    </button>
                  </div>
                </>
              )}

              {/* ===== DASHBOARD TAB ===== */}
              {activeTab === 'dashboard' && (
                <>
                  <SettingsSection title="Display Preferences" description="Customize how data is shown across the dashboard.">
                    <SettingsRow icon={Thermometer} iconBg="bg-orange-50" iconColor="text-orange-600" label="Temperature Unit" description="Choose Celsius or Fahrenheit for readings">
                      <div className="flex bg-slate-100 rounded-lg p-0.5">
                        {(['celsius', 'fahrenheit'] as const).map((unit) => (
                          <button
                            key={unit}
                            onClick={() => updateLocal('dashboard.temperatureUnit', unit)}
                            className={clsx(
                              'px-3 py-1.5 rounded-md text-xs font-medium transition-all',
                              settings.dashboard.temperatureUnit === unit
                                ? 'bg-white text-slate-900 shadow-sm'
                                : 'text-slate-500 hover:text-slate-700'
                            )}
                          >
                            {unit === 'celsius' ? '°C' : '°F'}
                          </button>
                        ))}
                      </div>
                    </SettingsRow>

                    <SettingsRow icon={Calendar} iconBg="bg-blue-50" iconColor="text-blue-600" label="Date Format" description="How dates appear in the interface">
                      <select
                        value={settings.dashboard.dateFormat}
                        onChange={(e) => updateLocal('dashboard.dateFormat', e.target.value)}
                        className="h-9 px-3 rounded-lg border border-slate-200 bg-white text-sm outline-none focus:border-blue-500 transition-all"
                      >
                        <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                        <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                        <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                      </select>
                    </SettingsRow>

                    <SettingsRow icon={Globe} iconBg="bg-emerald-50" iconColor="text-emerald-600" label="Timezone" description="Timezone for all timestamps">
                      <select
                        value={settings.dashboard.timezone}
                        onChange={(e) => updateLocal('dashboard.timezone', e.target.value)}
                        className="h-9 px-3 rounded-lg border border-slate-200 bg-white text-sm outline-none focus:border-blue-500 transition-all"
                      >
                        <option value="America/New_York">Eastern (ET)</option>
                        <option value="America/Chicago">Central (CT)</option>
                        <option value="America/Denver">Mountain (MT)</option>
                        <option value="America/Los_Angeles">Pacific (PT)</option>
                        <option value="Europe/London">London (GMT)</option>
                        <option value="Europe/Paris">Paris (CET)</option>
                        <option value="Asia/Tokyo">Tokyo (JST)</option>
                        <option value="Asia/Singapore">Singapore (SGT)</option>
                      </select>
                    </SettingsRow>

                    <SettingsRow icon={LayoutGrid} iconBg="bg-violet-50" iconColor="text-violet-600" label="Compact Mode" description="Use denser layout for data tables">
                      <ToggleSwitch enabled={settings.dashboard.compactMode} onChange={(v) => updateLocal('dashboard.compactMode', v)} />
                    </SettingsRow>
                  </SettingsSection>

                  <SettingsSection title="Data Refresh" description="How often the dashboard polls for new sensor data.">
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-lg bg-blue-50 text-blue-600">
                            <Timer className="h-4 w-4" />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-slate-900">Auto-Refresh Interval</p>
                            <p className="text-xs text-slate-500">Current: every {settings.dashboard.refreshInterval} seconds</p>
                          </div>
                        </div>
                        <span className="text-sm font-mono font-semibold text-blue-600">{settings.dashboard.refreshInterval}s</span>
                      </div>
                      <input
                        type="range"
                        min={5}
                        max={120}
                        step={5}
                        value={settings.dashboard.refreshInterval}
                        onChange={(e) => updateLocal('dashboard.refreshInterval', Number(e.target.value))}
                        className="w-full accent-blue-600"
                      />
                      <div className="flex justify-between text-[11px] text-slate-400">
                        <span>5s (Real-time)</span>
                        <span>60s</span>
                        <span>120s (Battery saver)</span>
                      </div>
                    </div>
                  </SettingsSection>

                  <div className="flex justify-end">
                    <button
                      onClick={() => saveSettings({ dashboard: settings.dashboard })}
                      disabled={saving}
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-all shadow-sm"
                    >
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      Save Dashboard Settings
                    </button>
                  </div>
                </>
              )}

              {/* ===== SECURITY TAB ===== */}
              {activeTab === 'security' && (
                <>
                  <SettingsSection title="Authentication" description="Manage your account security settings.">
                    <SettingsRow icon={ShieldCheck} iconBg="bg-slate-50" iconColor="text-slate-400" label="Two-Factor Authentication" description="Add an extra layer of security to your account">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 text-[11px] font-medium ring-1 ring-amber-200">Coming Soon</span>
                    </SettingsRow>
                    <SettingsRow icon={LogIn} iconBg="bg-blue-50" iconColor="text-blue-600" label="Login Notifications" description="Get notified when someone signs into your account">
                      <ToggleSwitch enabled={settings.security.loginNotifications} onChange={(v) => updateLocal('security.loginNotifications', v)} />
                    </SettingsRow>
                  </SettingsSection>

                  <SettingsSection title="Session Management" description="Control how long sessions stay active.">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-slate-50 text-slate-400">
                        <Clock className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-900">Session Timeout</p>
                        <p className="text-xs text-slate-500">Session lifetime is managed by the authentication provider (Supabase Auth). Default: 1 hour JWT, with automatic background refresh.</p>
                      </div>
                    </div>
                  </SettingsSection>

                  <SettingsSection title="Password" description="Change your account password.">
                    <p className="text-sm text-slate-500">Password management is handled by Supabase Auth. Use the <strong>Forgot Password</strong> flow on the login page to reset your password via email.</p>
                  </SettingsSection>

                  <div className="flex justify-end">
                    <button
                      onClick={() => saveSettings({ security: settings.security })}
                      disabled={saving}
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-all shadow-sm"
                    >
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      Save Security Settings
                    </button>
                  </div>
                </>
              )}

              {/* ===== DATA MANAGEMENT TAB ===== */}
              {activeTab === 'data' && (
                <>
                  <SettingsSection title="Export Data" description="Download a full snapshot of your properties, devices, and settings.">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-blue-50 text-blue-600 shrink-0">
                          <FileJson className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-slate-900">Full Data Export</p>
                          <p className="text-xs text-slate-500">Download as JSON including all properties, devices, and settings</p>
                        </div>
                      </div>
                      <button
                        onClick={handleExport}
                        disabled={exporting}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-all shadow-sm"
                      >
                        {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                        {exporting ? 'Exporting...' : 'Export JSON'}
                      </button>
                    </div>
                  </SettingsSection>

                  <SettingsSection title="Reset Data" description="Restore all data to factory defaults. This action cannot be undone.">
                    {!isAdmin ? (
                      <p className="text-sm text-slate-500">Only administrators can reset data. Contact your system administrator.</p>
                    ) : (
                      <>
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-red-50 text-red-600">
                              <Trash2 className="h-4 w-4" />
                            </div>
                            <div>
                              <p className="text-sm font-medium text-slate-900">Factory Reset</p>
                              <p className="text-xs text-slate-500">Reset all properties, devices, and settings to their original defaults</p>
                            </div>
                          </div>
                          {!showResetConfirm ? (
                            <button
                              onClick={() => setShowResetConfirm(true)}
                              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-red-200 bg-white text-sm font-medium text-red-600 hover:bg-red-50 transition-all shadow-sm"
                            >
                              <RotateCcw className="h-4 w-4" />
                              Reset All Data
                            </button>
                          ) : (
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => setShowResetConfirm(false)}
                                className="px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-600 hover:bg-slate-50 transition-all"
                              >
                                Cancel
                              </button>
                              <button
                                onClick={handleReset}
                                disabled={resetting}
                                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 transition-all shadow-sm"
                              >
                                {resetting ? <Loader2 className="h-4 w-4 animate-spin" /> : <AlertTriangle className="h-4 w-4" />}
                                {resetting ? 'Resetting...' : 'Confirm Reset'}
                              </button>
                            </div>
                          )}
                        </div>
                        {showResetConfirm && (
                          <div className="mt-4 p-3 rounded-lg bg-red-50 border border-red-100">
                            <p className="text-xs text-red-800 font-medium">
                              Warning: This will permanently delete all custom properties, device assignments, and settings. This cannot be undone.
                            </p>
                          </div>
                        )}
                      </>
                    )}
                  </SettingsSection>
                </>
              )}

              {/* ===== AWS CLOUD TAB ===== */}
              {activeTab === 'aws' && (
                <AWSConfigPanel />
              )}

              {/* ===== SYSTEM TAB ===== */}
              {activeTab === 'system' && (
                <>
                  <SettingsSection title="API Health" description="Live connectivity check to the FioTec backend.">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div
                          className={clsx(
                            'p-2 rounded-lg',
                            healthStatus === 'online' ? 'bg-emerald-50 text-emerald-600' : healthStatus === 'offline' ? 'bg-red-50 text-red-600' : 'bg-slate-100 text-slate-500'
                          )}
                        >
                          <Activity className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-slate-900">Backend Server</p>
                          <p className="text-xs text-slate-500">
                            {healthStatus === 'checking' && 'Checking connection...'}
                            {healthStatus === 'online' && 'All systems operational'}
                            {healthStatus === 'offline' && 'Server unreachable'}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span
                          className={clsx(
                            'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium',
                            healthStatus === 'online' && 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
                            healthStatus === 'offline' && 'bg-red-50 text-red-700 ring-1 ring-red-200',
                            healthStatus === 'checking' && 'bg-slate-100 text-slate-600 ring-1 ring-slate-200'
                          )}
                        >
                          {healthStatus === 'checking' && <Loader2 className="h-3 w-3 animate-spin" />}
                          {healthStatus === 'online' && <CheckCircle2 className="h-3 w-3" />}
                          {healthStatus === 'offline' && <AlertTriangle className="h-3 w-3" />}
                          {healthStatus === 'checking' ? 'Checking' : healthStatus === 'online' ? 'Online' : 'Offline'}
                        </span>
                        <button
                          onClick={checkHealth}
                          className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-500 transition-all"
                        >
                          <RotateCcw className={clsx('h-4 w-4', healthStatus === 'checking' && 'animate-spin')} />
                        </button>
                      </div>
                    </div>
                  </SettingsSection>

                  <SettingsSection title="System Information" description="Technical details about this FioTec instance.">
                    <div className="space-y-0">
                      <SettingsRow icon={HardDrive} iconBg="bg-slate-100" iconColor="text-slate-600" label="Version" description="Current application version">
                        <span className="text-xs font-mono font-medium text-slate-600 px-2 py-1 bg-slate-100 rounded">v1.0</span>
                      </SettingsRow>
                      <SettingsRow icon={Building2} iconBg="bg-blue-50" iconColor="text-blue-600" label="Managed Properties" description="Total properties in database">
                        <span className="text-sm font-semibold text-slate-900">{dataStats?.properties ?? '...'}</span>
                      </SettingsRow>
                      <SettingsRow icon={Wifi} iconBg="bg-emerald-50" iconColor="text-emerald-600" label="Registered Devices" description="Total IoT devices tracked">
                        <span className="text-sm font-semibold text-slate-900">{dataStats?.devices ?? '...'}</span>
                      </SettingsRow>
                      <SettingsRow icon={Server} iconBg="bg-violet-50" iconColor="text-violet-600" label="Backend" description="Supabase Edge Functions (Deno)">
                        <span className="text-xs font-mono text-slate-500">Hono + KV Store</span>
                      </SettingsRow>
                      <SettingsRow icon={Globe} iconBg="bg-orange-50" iconColor="text-orange-600" label="Environment" description="Current deployment target">
                        <span className="text-xs font-medium text-slate-600 px-2 py-1 bg-orange-50 rounded ring-1 ring-orange-200">Production</span>
                      </SettingsRow>
                    </div>
                  </SettingsSection>

                  {/* ── Milesight Gateway Integration ── */}
                  <SettingsSection title="Milesight Gateway Integration" description="Connect your Milesight UG65/UG67 LoRaWAN gateway to push live sensor data into FioTec.">
                    {/* Connection Status */}
                    <div className="flex items-center justify-between mb-6">
                      <div className="flex items-center gap-3">
                        <div className={clsx('p-2 rounded-lg', webhookConfig?.hasToken ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500')}>
                          <Radio className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-slate-900">Gateway Connection</p>
                          <p className="text-xs text-slate-500">
                            {webhookLoading ? 'Loading...' : webhookConfig?.hasToken ? 'Webhook token active — ready to receive data' : 'No webhook token generated yet'}
                          </p>
                        </div>
                      </div>
                      <span className={clsx(
                        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium',
                        webhookConfig?.hasToken
                          ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
                          : 'bg-slate-100 text-slate-600 ring-1 ring-slate-200'
                      )}>
                        {webhookLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : webhookConfig?.hasToken ? <CheckCircle2 className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
                        {webhookLoading ? 'Loading' : webhookConfig?.hasToken ? 'Active' : 'Not Connected'}
                      </span>
                    </div>

                    {/* Step 1: Generate Token */}
                    <div className="rounded-xl border border-slate-200 p-4 mb-4">
                      <div className="flex items-center gap-2 mb-3">
                        <span className="flex items-center justify-center h-6 w-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold">1</span>
                        <h4 className="text-sm font-semibold text-slate-900">Generate Webhook Token</h4>
                      </div>
                      <p className="text-xs text-slate-500 mb-3 ml-8">
                        Generate a secure token that authenticates your gateway. This token is unique to your account and can be regenerated at any time (previous tokens are revoked).
                      </p>
                      <div className="ml-8">
                        <button
                          onClick={handleGenerateToken}
                          disabled={webhookGenerating}
                          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-all shadow-sm"
                        >
                          {webhookGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                          {webhookConfig?.hasToken ? 'Regenerate Token' : 'Generate Token'}
                        </button>
                      </div>
                    </div>

                    {/* Step 2: Token & URL Display */}
                    {webhookConfig?.hasToken && (
                      <div className="rounded-xl border border-slate-200 p-4 mb-4">
                        <div className="flex items-center gap-2 mb-3">
                          <span className="flex items-center justify-center h-6 w-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold">2</span>
                          <h4 className="text-sm font-semibold text-slate-900">Copy Your Webhook URL</h4>
                        </div>
                        <p className="text-xs text-slate-500 mb-3 ml-8">
                          Paste this URL into your Milesight gateway's HTTP integration settings. The token is embedded in the URL for authentication.
                        </p>
                        <div className="ml-8 space-y-3">
                          <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1">Webhook URL</label>
                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                readOnly
                                value={webhookConfig.webhookUrl ?? ''}
                                className="flex-1 h-9 px-3 rounded-lg border border-slate-200 bg-slate-50 text-xs font-mono text-slate-700 outline-none select-all"
                                onClick={(e) => (e.target as HTMLInputElement).select()}
                              />
                              <button
                                onClick={() => copyToClipboard(webhookConfig.webhookUrl ?? '', 'Webhook URL')}
                                className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 transition-all"
                              >
                                <Copy className="h-3.5 w-3.5" /> Copy
                              </button>
                            </div>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1">Auth Token</label>
                            <div className="flex items-center gap-2">
                              <input
                                type="password"
                                readOnly
                                value={webhookConfig.token ?? ''}
                                className="flex-1 h-9 px-3 rounded-lg border border-slate-200 bg-slate-50 text-xs font-mono text-slate-700 outline-none select-all"
                                onClick={(e) => { const el = e.target as HTMLInputElement; el.type = 'text'; el.select(); }}
                                onBlur={(e) => { (e.target as HTMLInputElement).type = 'password'; }}
                              />
                              <button
                                onClick={() => copyToClipboard(webhookConfig.token ?? '', 'Auth Token')}
                                className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 transition-all"
                              >
                                <Copy className="h-3.5 w-3.5" /> Copy
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Step 3: Gateway Setup Instructions */}
                    <div className="rounded-xl border border-slate-200 p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <span className="flex items-center justify-center h-6 w-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold">3</span>
                        <h4 className="text-sm font-semibold text-slate-900">Configure Your Milesight Gateway</h4>
                      </div>
                      <div className="ml-8 space-y-3">
                        <p className="text-xs text-slate-500">Follow these steps on your Milesight UG65/UG67 web interface:</p>
                        <ol className="text-xs text-slate-600 space-y-2.5 list-none">
                          <li className="flex gap-2">
                            <span className="shrink-0 flex items-center justify-center h-5 w-5 rounded bg-slate-100 text-slate-600 text-[10px] font-bold mt-0.5">a</span>
                            <span>Open the gateway admin panel (usually <span className="font-mono text-blue-600">http://192.168.23.1</span>) and navigate to <span className="font-semibold">Network Server &rarr; Application</span>.</span>
                          </li>
                          <li className="flex gap-2">
                            <span className="shrink-0 flex items-center justify-center h-5 w-5 rounded bg-slate-100 text-slate-600 text-[10px] font-bold mt-0.5">b</span>
                            <span>Select your application, then go to the <span className="font-semibold">HTTP Integration</span> (or <span className="font-semibold">Data Transmission &rarr; Cloud</span> on newer firmware).</span>
                          </li>
                          <li className="flex gap-2">
                            <span className="shrink-0 flex items-center justify-center h-5 w-5 rounded bg-slate-100 text-slate-600 text-[10px] font-bold mt-0.5">c</span>
                            <span>Set <span className="font-semibold">Type</span> to <span className="font-mono bg-slate-100 px-1 rounded">HTTP</span> and <span className="font-semibold">Mode</span> to <span className="font-mono bg-slate-100 px-1 rounded">POST</span>.</span>
                          </li>
                          <li className="flex gap-2">
                            <span className="shrink-0 flex items-center justify-center h-5 w-5 rounded bg-slate-100 text-slate-600 text-[10px] font-bold mt-0.5">d</span>
                            <span>Paste the <span className="font-semibold">Webhook URL</span> (from Step 2) into the <span className="font-semibold">Uplink Data URL</span> field. You can use the same URL for Join, ACK, and Error notifications.</span>
                          </li>
                          <li className="flex gap-2">
                            <span className="shrink-0 flex items-center justify-center h-5 w-5 rounded bg-slate-100 text-slate-600 text-[10px] font-bold mt-0.5">e</span>
                            <span>Set <span className="font-semibold">Content-Type</span> to <span className="font-mono bg-slate-100 px-1 rounded">application/json</span>. Enable <span className="font-semibold">Payload Codec</span> and select your sensor's decoder (e.g., <span className="font-mono text-xs">Milesight-Sensor-Decoder</span>) so the <code className="font-mono bg-slate-100 px-1 rounded text-[11px]">object</code> field contains decoded values.</span>
                          </li>
                          <li className="flex gap-2">
                            <span className="shrink-0 flex items-center justify-center h-5 w-5 rounded bg-slate-100 text-slate-600 text-[10px] font-bold mt-0.5">f</span>
                            <span>Click <span className="font-semibold">Save</span>. Sensor data will begin appearing in FioTec within seconds of the next uplink.</span>
                          </li>
                        </ol>

                        <div className="mt-4 p-3 rounded-lg bg-blue-50 border border-blue-100">
                          <p className="text-xs text-blue-800">
                            <span className="font-semibold">Supported payload format:</span> Milesight Network Server JSON with <code className="font-mono bg-blue-100 px-1 rounded text-[11px]">devEUI</code>, <code className="font-mono bg-blue-100 px-1 rounded text-[11px]">deviceName</code>, <code className="font-mono bg-blue-100 px-1 rounded text-[11px]">data</code> (hex), <code className="font-mono bg-blue-100 px-1 rounded text-[11px]">object</code> (decoded), <code className="font-mono bg-blue-100 px-1 rounded text-[11px]">rxInfo</code>, <code className="font-mono bg-blue-100 px-1 rounded text-[11px]">txInfo</code>. FioTec auto-generates alarms when decoded values exceed thresholds (e.g., temperature, smoke, leak detection).
                          </p>
                        </div>

                        <div className="mt-2 p-3 rounded-lg bg-amber-50 border border-amber-100">
                          <p className="text-xs text-amber-800">
                            <span className="font-semibold">Tip:</span> Ensure your gateway has internet access and DNS resolution. If behind a firewall, allow outbound HTTPS to <code className="font-mono bg-amber-100 px-1 rounded text-[11px]">*.supabase.co</code> on port 443. Verify connectivity by checking the Twin Dashboard's "Webhook Sensor Devices" section after saving.
                          </p>
                        </div>
                      </div>
                    </div>
                  </SettingsSection>
                </>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
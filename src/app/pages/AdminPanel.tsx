import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Users,
  Search,
  Loader2,
  ShieldCheck,
  Mail,
  Phone,
  Building2,
  Key,
  Trash2,
  ChevronRight,
  X,
  Save,
  AlertTriangle,
  RefreshCw,
  Eye,
  EyeOff,
  UserCog,
  Calendar,
  Clock,
  Database,
  Cpu,
  CheckCircle2,
  XCircle,
  Crown,
  Plus,
  Radio,
  MapPin,
  Wifi,
  WifiOff,
  Server,
  UserPlus,
  Copy,
} from 'lucide-react';
import { clsx } from 'clsx';
import { motion, AnimatePresence } from 'motion/react';
import { api, type AdminUser, type AdminUserDetail, type Property, type Device, type Gateway } from '@/app/utils/api';
import { useAuth } from '@/app/utils/AuthContext';
import { toast } from 'sonner';
import { Navigate } from 'react-router';

function cn(...inputs: (string | undefined | null | false)[]) {
  return clsx(inputs);
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return 'Never';
  return new Date(dateStr).toLocaleDateString('en-GB', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDateShort(dateStr: string | null) {
  if (!dateStr) return 'Never';
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: '2-digit',
  });
}

function AccountTypeBadge({ type }: { type: string }) {
  const colors: Record<string, string> = {
    standard: 'bg-blue-50 text-blue-700 ring-blue-600/20 dark:bg-blue-900/30 dark:text-blue-300',
    testing: 'bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-900/30 dark:text-amber-300',
    demo: 'bg-slate-50 text-slate-700 ring-slate-600/20 dark:bg-slate-900/30 dark:text-slate-300',
  };
  return (
    <span className={cn(
      'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset',
      colors[type] || colors.standard,
    )}>
      {type}
    </span>
  );
}

// ─── Resource Management Tabs ───────────────────────────

type ResourceTab = 'profile' | 'properties' | 'devices' | 'gateways';

const STATUS_DOT: Record<string, string> = {
  online: 'bg-emerald-500',
  offline: 'bg-slate-400',
  warning: 'bg-amber-500',
  active: 'bg-emerald-500',
  inactive: 'bg-slate-400',
};

// ── Properties Tab ──

function PropertiesTab({ userId }: { userId: string }) {
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: '', location: '', type: 'Commercial' });

  // Copy from Master state
  const [showCopyMaster, setShowCopyMaster] = useState(false);
  const [masterProperties, setMasterProperties] = useState<Property[]>([]);
  const [loadingMaster, setLoadingMaster] = useState(false);
  const [selectedMasterProps, setSelectedMasterProps] = useState<Set<string>>(new Set());
  const [copying, setCopying] = useState(false);
  const [copyProgress, setCopyProgress] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.adminGetUserProperties(userId);
      setProperties(data);
    } catch { toast.error('Failed to load properties'); }
    finally { setLoading(false); }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async () => {
    if (!form.name.trim()) { toast.error('Name is required'); return; }
    setAdding(true);
    try {
      await api.adminAddProperty(userId, {
        name: form.name, location: form.location, type: form.type,
        status: 'active', waterSensors: '0', image: '',
      });
      toast.success('Property added');
      setForm({ name: '', location: '', type: 'Commercial' });
      setShowAdd(false);
      load();
    } catch (e: any) { toast.error(e.message || 'Failed to add property'); }
    finally { setAdding(false); }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete property "${name}"?`)) return;
    try {
      await api.adminDeleteProperty(userId, id);
      toast.success('Property deleted');
      load();
    } catch (e: any) { toast.error(e.message || 'Failed to delete'); }
  };

  // Fetch master's properties and open copy panel
  const openCopyMaster = async () => {
    if (showCopyMaster) { setShowCopyMaster(false); return; }
    setShowAdd(false);
    setShowCopyMaster(true);
    setLoadingMaster(true);
    setSelectedMasterProps(new Set());
    setCopyProgress('');
    try {
      // getProperties() returns admin's own (master) properties
      const master = await api.getProperties();
      // Filter out properties that already exist on the target user (by name)
      const existingNames = new Set(properties.map(p => p.name.toLowerCase()));
      const available = master.filter(p => !existingNames.has(p.name.toLowerCase()));
      setMasterProperties(available);
      if (available.length === 0 && master.length > 0) {
        toast.info('All master properties already assigned to this user');
      }
    } catch (e: any) {
      toast.error('Failed to load master properties');
      setShowCopyMaster(false);
    } finally {
      setLoadingMaster(false);
    }
  };

  const toggleMasterProp = (id: string) => {
    setSelectedMasterProps(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAllMaster = () => {
    if (selectedMasterProps.size === masterProperties.length) {
      setSelectedMasterProps(new Set());
    } else {
      setSelectedMasterProps(new Set(masterProperties.map(p => p.id)));
    }
  };

  const handleCopyFromMaster = async () => {
    if (selectedMasterProps.size === 0) { toast.error('Select at least one property'); return; }
    setCopying(true);
    let totalDevices = 0;
    let totalGateways = 0;
    let successCount = 0;
    const selected = masterProperties.filter(p => selectedMasterProps.has(p.id));

    for (let i = 0; i < selected.length; i++) {
      const p = selected[i];
      setCopyProgress(`Copying ${i + 1}/${selected.length}: ${p.name}...`);
      try {
        const result = await api.adminAssignPropertyToUser(p.id, userId, {
          includeDevices: true,
          removeFromSource: false,
        });
        totalDevices += result.devicesCopied || 0;
        totalGateways += result.gatewaysCopied || 0;
        successCount++;
      } catch (e: any) {
        toast.error(`Failed to copy "${p.name}": ${e.message}`);
      }
    }

    setCopying(false);
    setCopyProgress('');
    setShowCopyMaster(false);
    setSelectedMasterProps(new Set());

    if (successCount > 0) {
      toast.success(
        `Copied ${successCount} propert${successCount > 1 ? 'ies' : 'y'} with ${totalDevices} devices and ${totalGateways} gateways`
      );
      load();
    }
  };

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-blue-500" /></div>;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-500 dark:text-slate-400">{properties.length} properties</span>
        <div className="flex items-center gap-2">
          <button onClick={openCopyMaster} className={cn(
            "flex items-center gap-1 text-xs font-medium transition-colors",
            showCopyMaster
              ? "text-amber-600 dark:text-amber-400"
              : "text-amber-600 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300"
          )}>
            <Copy className="h-3.5 w-3.5" /> Copy from Master
          </button>
          <button onClick={() => { setShowAdd(!showAdd); setShowCopyMaster(false); }} className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400">
            <Plus className="h-3.5 w-3.5" /> Add
          </button>
        </div>
      </div>

      {/* Copy from Master panel */}
      <AnimatePresence>
        {showCopyMaster && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-900/20 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Crown className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                  <span className="text-xs font-semibold text-amber-800 dark:text-amber-200">Master Properties</span>
                </div>
                {masterProperties.length > 0 && (
                  <button onClick={selectAllMaster} className="text-[10px] font-medium text-amber-700 dark:text-amber-300 hover:underline">
                    {selectedMasterProps.size === masterProperties.length ? 'Deselect All' : 'Select All'}
                  </button>
                )}
              </div>

              {loadingMaster ? (
                <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin text-amber-500" /></div>
              ) : masterProperties.length === 0 ? (
                <p className="text-xs text-amber-600 dark:text-amber-400 py-2 text-center">No properties available to copy</p>
              ) : (
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {masterProperties.map(p => (
                    <label key={p.id} className={cn(
                      "flex items-center gap-2.5 rounded-md border px-2.5 py-2 cursor-pointer transition-colors",
                      selectedMasterProps.has(p.id)
                        ? "border-amber-400 dark:border-amber-600 bg-amber-100/80 dark:bg-amber-900/40"
                        : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-amber-300 dark:hover:border-amber-700"
                    )}>
                      <input
                        type="checkbox"
                        checked={selectedMasterProps.has(p.id)}
                        onChange={() => toggleMasterProp(p.id)}
                        className="h-3.5 w-3.5 rounded border-slate-300 text-amber-600 focus:ring-amber-500"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <Building2 className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                          <span className="text-xs font-medium text-slate-900 dark:text-white truncate">{p.name}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 text-[10px] text-slate-500 dark:text-slate-400">
                          {p.location && <span>{p.location}</span>}
                          <span>{p.type}</span>
                          {p.deviceCount != null && <span>{p.deviceCount} devices</span>}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              )}

              {masterProperties.length > 0 && (
                <div className="flex items-center gap-2 pt-1">
                  <button
                    onClick={handleCopyFromMaster}
                    disabled={copying || selectedMasterProps.size === 0}
                    className="flex-1 flex items-center justify-center gap-1.5 rounded-md bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-50 transition-colors"
                  >
                    {copying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Copy className="h-3.5 w-3.5" />}
                    {copying ? copyProgress : `Copy ${selectedMasterProps.size} Propert${selectedMasterProps.size !== 1 ? 'ies' : 'y'}`}
                  </button>
                  <button onClick={() => setShowCopyMaster(false)} className="rounded-md px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
                    Cancel
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Add form */}
      <AnimatePresence>
        {showAdd && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-900/20 p-3 space-y-2">
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Property name *" className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500" />
              <input value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} placeholder="Location" className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500" />
              <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500">
                <option>Commercial</option><option>Residential</option><option>Industrial</option><option>Mixed-Use</option>
              </select>
              <div className="flex gap-2">
                <button onClick={handleAdd} disabled={adding} className="flex-1 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                  {adding ? 'Adding...' : 'Add Property'}
                </button>
                <button onClick={() => setShowAdd(false)} className="rounded-md px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">Cancel</button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* List */}
      {properties.length === 0 ? (
        <div className="text-center py-6 text-slate-400 dark:text-slate-500 text-sm">No properties assigned</div>
      ) : (
        <div className="space-y-2">
          {properties.map(p => (
            <div key={p.id} className="flex items-center justify-between rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-slate-400 shrink-0" />
                  <span className="font-medium text-sm text-slate-900 dark:text-white truncate">{p.name}</span>
                  <span className={cn('h-2 w-2 rounded-full shrink-0', STATUS_DOT[p.status] || 'bg-slate-400')} />
                </div>
                <div className="flex items-center gap-3 mt-1 text-xs text-slate-500 dark:text-slate-400 flex-wrap">
                  {p.location && <span className="flex items-center gap-1 whitespace-nowrap"><MapPin className="h-3 w-3 shrink-0" />{p.location}</span>}
                  <span className="whitespace-nowrap">{p.type}</span>
                  {p.deviceCount != null && <span className="whitespace-nowrap">{p.deviceCount} devices</span>}
                </div>
              </div>
              <button onClick={() => handleDelete(p.id, p.name)} className="p-1.5 rounded-md text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Devices Tab ──

const ADMIN_DEVICE_TYPES = [
  'IAQ', 'Environment Sensor', 'LoRaWAN Sensor', 'Water Sensor', 'Smoke Detector', 'Fire Alarm',
  'Temperature Sensor', 'Humidity Sensor', 'Motion Sensor',
  'Noise', 'Leakage', 'CO2 Sensor', 'PM2.5 Sensor', 'People Counter', 'Door/Window Sensor',
];

function DevicesTab({ userId }: { userId: string }) {
  const [devices, setDevices] = useState<Device[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [gateways, setGateways] = useState<Gateway[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: '', type: 'IAQ', building: '', location: '', gateway: '', devEui: '' });
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [assignValue, setAssignValue] = useState('');
  const [savingAssign, setSavingAssign] = useState(false);
  const [editingLocationId, setEditingLocationId] = useState<string | null>(null);
  const [locationValue, setLocationValue] = useState('');
  const [savingLocation, setSavingLocation] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [d, p, g] = await Promise.all([
        api.adminGetUserDevices(userId),
        api.adminGetUserProperties(userId),
        api.adminGetUserGateways(userId),
      ]);
      setDevices(d);
      setProperties(p);
      setGateways(g);
    } catch { toast.error('Failed to load devices'); }
    finally { setLoading(false); }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async () => {
    if (!form.name.trim()) { toast.error('Device name is required'); return; }
    setAdding(true);
    try {
      const payload: any = {
        name: form.name, type: form.type, building: form.building || 'Unassigned',
        location: form.location, gateway: form.gateway || 'Unassigned',
        status: 'online', battery: 100, lastUpdate: new Date().toISOString(),
      };
      if (form.devEui.trim()) {
        payload.devEui = form.devEui.trim().toUpperCase();
        payload.serialNumber = form.devEui.trim().toUpperCase();
      }
      await api.adminAddDevice(userId, payload);
      toast.success('Device added');
      setForm({ name: '', type: 'IAQ', building: '', location: '', gateway: '', devEui: '' });
      setShowAdd(false);
      load();
    } catch (e: any) { toast.error(e.message || 'Failed to add device'); }
    finally { setAdding(false); }
  };

  const handleAssign = async (deviceId: string) => {
    if (savingAssign) return;
    setSavingAssign(true);
    try {
      await api.adminAssignDevice(userId, deviceId, assignValue || 'Unassigned');
      toast.success(`Device assigned to ${assignValue || 'Unassigned'}`);
      setAssigningId(null);
      load();
    } catch (e: any) { toast.error(e.message || 'Failed to assign device'); }
    finally { setSavingAssign(false); }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete device "${name}"?`)) return;
    try {
      await api.adminDeleteDevice(userId, id);
      toast.success('Device deleted');
      load();
    } catch (e: any) { toast.error(e.message || 'Failed to delete'); }
  };

  const handleEditLocation = async (deviceId: string) => {
    if (savingLocation) return;
    setSavingLocation(true);
    try {
      await api.adminUpdateDevice(userId, deviceId, { location: locationValue.trim() || 'Not specified' });
      toast.success('Location updated');
      setEditingLocationId(null);
      load();
    } catch (e: any) { toast.error(e.message || 'Failed to update location'); }
    finally { setSavingLocation(false); }
  };

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-blue-500" /></div>;

  // Sort: real devices (with devEui) first, then by name
  const sortedDevices = [...devices].sort((a, b) => {
    const aReal = a.devEui ? 1 : 0;
    const bReal = b.devEui ? 1 : 0;
    if (aReal !== bReal) return bReal - aReal; // Real first
    return (a.name || '').localeCompare(b.name || '');
  });

  const realDevices = devices.filter(d => d.devEui);
  const unassignedReal = realDevices.filter(d => !d.building || d.building === 'Unassigned');

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500 dark:text-slate-400">{devices.length} devices</span>
          {realDevices.length > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 dark:bg-emerald-900/30 px-2 py-0.5 text-xs text-emerald-700 dark:text-emerald-300">
              <Wifi className="h-3 w-3" /> {realDevices.length} linked
            </span>
          )}
        </div>
        <button onClick={() => setShowAdd(!showAdd)} className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400">
          <Plus className="h-3.5 w-3.5" /> Add
        </button>
      </div>

      {/* Info: auto-registration tip */}
      {realDevices.length > 0 && (
        <div className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50/60 dark:bg-blue-900/20 px-3 py-2">
          <div className="flex items-start gap-2">
            <CheckCircle2 className="h-4 w-4 text-blue-500 dark:text-blue-400 mt-0.5 shrink-0" />
            <p className="text-xs text-blue-700 dark:text-blue-300">
              <span className="font-medium">Devices auto-register</span> when they send data through the webhook. No need to add them manually — just assign existing devices to properties below.
            </p>
          </div>
        </div>
      )}

      {/* Warning: unassigned real devices */}
      {unassignedReal.length > 0 && (
        <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-900/20 px-3 py-2">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs font-medium text-amber-800 dark:text-amber-200">
                {unassignedReal.length} real device{unassignedReal.length > 1 ? 's' : ''} not assigned to a property
              </p>
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
                {unassignedReal.map(d => d.name).join(', ')} — click the <Building2 className="inline h-3 w-3" /> icon to assign
              </p>
            </div>
          </div>
        </div>
      )}

      <AnimatePresence>
        {showAdd && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-900/20 p-3 space-y-2">
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Device name *" className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500" />
              <input value={form.devEui} onChange={e => setForm(f => ({ ...f, devEui: e.target.value }))} placeholder="DevEUI (e.g. 24E124707E012648) — links to real sensor data" className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500 font-mono" />
              <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500">
                {ADMIN_DEVICE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <select value={form.building} onChange={e => setForm(f => ({ ...f, building: e.target.value }))} className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">Unassigned</option>
                {properties.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
              </select>
              <select value={form.gateway} onChange={e => setForm(f => ({ ...f, gateway: e.target.value }))} className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">No Gateway</option>
                {gateways.map(g => <option key={g.id} value={g.id}>{g.name} ({g.status})</option>)}
              </select>
              <input value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} placeholder="Location (e.g. Floor 3, Room 301)" className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500" />
              <div className="flex gap-2">
                <button onClick={handleAdd} disabled={adding} className="flex-1 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                  {adding ? 'Adding...' : 'Add Device'}
                </button>
                <button onClick={() => setShowAdd(false)} className="rounded-md px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">Cancel</button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {devices.length === 0 ? (
        <div className="text-center py-6 text-slate-400 dark:text-slate-500 text-sm">No devices</div>
      ) : (
        <div className="space-y-2">
          {sortedDevices.map(d => {
            const isReal = !!d.devEui;
            const isUnassigned = !d.building || d.building === 'Unassigned';
            return (
            <div key={d.id} className={cn(
              'rounded-lg border p-3 transition-colors',
              isReal && isUnassigned
                ? 'border-amber-300 dark:border-amber-700 bg-amber-50/30 dark:bg-amber-900/10'
                : isReal
                  ? 'border-emerald-200 dark:border-emerald-800 bg-white dark:bg-slate-800'
                  : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800'
            )}>
              <div className="flex items-center justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    {isReal ? (
                      <Wifi className="h-4 w-4 text-emerald-500 shrink-0" />
                    ) : (
                      <Radio className="h-4 w-4 text-slate-400 shrink-0" />
                    )}
                    <span className="font-medium text-sm text-slate-900 dark:text-white truncate">{d.name}</span>
                    <span className={cn('h-2 w-2 rounded-full shrink-0', STATUS_DOT[d.status] || 'bg-slate-400')} />
                    {isReal && (
                      <span className="inline-flex items-center rounded-full bg-emerald-50 dark:bg-emerald-900/30 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-300 ring-1 ring-inset ring-emerald-600/20 dark:ring-emerald-500/30">
                        LIVE
                      </span>
                    )}
                    {!isReal && (
                      <span className="inline-flex items-center rounded-full bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 text-[10px] font-medium text-slate-500 dark:text-slate-400 ring-1 ring-inset ring-slate-300 dark:ring-slate-600">
                        SEED
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-slate-500 dark:text-slate-400 flex-wrap">
                    <span>{d.type}</span>
                    <span className="flex items-center gap-1">
                      <Building2 className="h-3 w-3" />
                      {d.building && d.building !== 'Unassigned' ? d.building : <span className="text-amber-500 font-medium">Unassigned</span>}
                    </span>
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {d.location && d.location !== 'Not specified' ? d.location : <span className="text-slate-400 italic">No location</span>}
                    </span>
                    <span>{d.battery}%</span>
                  </div>
                  {/* Show devEui and model info for real devices */}
                  {isReal && (
                    <div className="flex items-center gap-3 mt-1 text-[10px] text-slate-400 dark:text-slate-500 font-mono flex-wrap">
                      <span>EUI: {d.devEui}</span>
                      {(d as any).model && <span className="font-sans">Model: {(d as any).model}</span>}
                      {(d as any).manufacturer && <span className="font-sans">{(d as any).manufacturer}</span>}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => {
                      if (assigningId === d.id) { setAssigningId(null); }
                      else { setAssigningId(d.id); setEditingLocationId(null); setAssignValue(d.building === 'Unassigned' ? '' : (d.building || '')); }
                    }}
                    className={cn(
                      'p-1.5 rounded-md transition-colors',
                      assigningId === d.id
                        ? 'text-blue-600 bg-blue-50 dark:bg-blue-900/30'
                        : isReal && isUnassigned
                          ? 'text-amber-500 bg-amber-50 dark:bg-amber-900/20 hover:text-amber-600 animate-pulse'
                          : 'text-slate-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20'
                    )}
                    title={isReal && isUnassigned ? 'Assign this real device to a property!' : 'Assign to Property'}
                  >
                    <Building2 className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => {
                      if (editingLocationId === d.id) { setEditingLocationId(null); }
                      else { setEditingLocationId(d.id); setAssigningId(null); setLocationValue(d.location && d.location !== 'Not specified' ? d.location : ''); }
                    }}
                    className={cn(
                      'p-1.5 rounded-md transition-colors',
                      editingLocationId === d.id
                        ? 'text-violet-600 bg-violet-50 dark:bg-violet-900/30'
                        : 'text-slate-400 hover:text-violet-500 hover:bg-violet-50 dark:hover:bg-violet-900/20'
                    )}
                    title="Edit Location"
                  >
                    <MapPin className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => handleDelete(d.id, d.name)} className="p-1.5 rounded-md text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {/* Inline assign-to-property panel */}
              <AnimatePresence>
                {assigningId === d.id && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-700 flex items-center gap-2">
                      <select
                        value={assignValue}
                        onChange={e => setAssignValue(e.target.value)}
                        className="flex-1 rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-1 text-xs text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">Unassigned</option>
                        {properties.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
                      </select>
                      <button
                        onClick={() => handleAssign(d.id)}
                        disabled={savingAssign}
                        className="rounded-md bg-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                      >
                        {savingAssign ? '...' : 'Save'}
                      </button>
                      <button
                        onClick={() => setAssigningId(null)}
                        className="rounded-md px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Inline edit location panel */}
              <AnimatePresence>
                {editingLocationId === d.id && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-700 flex items-center gap-2">
                      <MapPin className="h-3.5 w-3.5 text-violet-500 shrink-0" />
                      <input
                        value={locationValue}
                        onChange={e => setLocationValue(e.target.value)}
                        placeholder="e.g. Floor 3, Room 301"
                        className="flex-1 rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-1 text-xs text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-violet-500"
                        onKeyDown={e => { if (e.key === 'Enter') handleEditLocation(d.id); }}
                      />
                      <button
                        onClick={() => handleEditLocation(d.id)}
                        disabled={savingLocation}
                        className="rounded-md bg-violet-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-violet-700 disabled:opacity-50"
                      >
                        {savingLocation ? '...' : 'Save'}
                      </button>
                      <button
                        onClick={() => setEditingLocationId(null)}
                        className="rounded-md px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Gateways Tab ──

function GatewaysTab({ userId }: { userId: string }) {
  const [gateways, setGateways] = useState<Gateway[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: '', model: 'Milesight UG65', protocol: 'LoRaWAN', location: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.adminGetUserGateways(userId);
      setGateways(data);
    } catch { toast.error('Failed to load gateways'); }
    finally { setLoading(false); }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async () => {
    if (!form.name.trim()) { toast.error('Gateway name is required'); return; }
    setAdding(true);
    try {
      await api.adminAddGateway(userId, {
        name: form.name, model: form.model, protocol: form.protocol,
        location: form.location, status: 'offline',
      });
      toast.success('Gateway added');
      setForm({ name: '', model: 'Milesight UG65', protocol: 'LoRaWAN', location: '' });
      setShowAdd(false);
      load();
    } catch (e: any) { toast.error(e.message || 'Failed to add gateway'); }
    finally { setAdding(false); }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete gateway "${name}"?`)) return;
    try {
      await api.adminDeleteGateway(userId, id);
      toast.success('Gateway deleted');
      load();
    } catch (e: any) { toast.error(e.message || 'Failed to delete'); }
  };

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-blue-500" /></div>;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-500 dark:text-slate-400">{gateways.length} gateways</span>
        <button onClick={() => setShowAdd(!showAdd)} className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400">
          <Plus className="h-3.5 w-3.5" /> Add
        </button>
      </div>

      <AnimatePresence>
        {showAdd && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-900/20 p-3 space-y-2">
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Gateway name *" className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500" />
              <input value={form.model} onChange={e => setForm(f => ({ ...f, model: e.target.value }))} placeholder="Model" className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500" />
              <select value={form.protocol} onChange={e => setForm(f => ({ ...f, protocol: e.target.value }))} className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500">
                <option>LoRaWAN</option><option>WiFi</option><option>Zigbee</option><option>BLE</option><option>4G/LTE</option><option>Ethernet</option>
              </select>
              <input value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} placeholder="Location" className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500" />
              <div className="flex gap-2">
                <button onClick={handleAdd} disabled={adding} className="flex-1 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                  {adding ? 'Adding...' : 'Add Gateway'}
                </button>
                <button onClick={() => setShowAdd(false)} className="rounded-md px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">Cancel</button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {gateways.length === 0 ? (
        <div className="text-center py-6 text-slate-400 dark:text-slate-500 text-sm">No gateways assigned</div>
      ) : (
        <div className="space-y-2">
          {gateways.map(g => {
            const isOnline = g.status === 'online';
            const isWarning = g.status === 'warning';
            const isOffline = !isOnline && !isWarning;
            const lastSeenStr = g.lastSeen ? new Date(g.lastSeen).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : null;
            return (
            <div key={g.id} className={cn(
              'rounded-lg border p-3',
              isOnline ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50/30 dark:bg-emerald-900/10' :
              isWarning ? 'border-amber-200 dark:border-amber-800 bg-amber-50/30 dark:bg-amber-900/10' :
              'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800'
            )}>
              <div className="flex items-center justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Server className="h-4 w-4 text-slate-400 shrink-0" />
                    <span className="font-medium text-sm text-slate-900 dark:text-white truncate">{g.name}</span>
                    {isOnline && <Wifi className="h-3.5 w-3.5 text-emerald-500 shrink-0" />}
                    {isWarning && <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />}
                    {isOffline && <WifiOff className="h-3.5 w-3.5 text-slate-400 shrink-0" />}
                    <span className={cn(
                      'inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset',
                      isOnline ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 ring-emerald-600/20' :
                      isWarning ? 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 ring-amber-600/20' :
                      'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 ring-slate-300'
                    )}>
                      {isOnline ? 'ONLINE' : isWarning ? 'WARMING UP' : 'OFFLINE'}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-slate-500 dark:text-slate-400 flex-wrap">
                    <span>{g.model}</span>
                    <span>{g.protocol}</span>
                    {g.connectedDevices > 0 && <span>{g.connectedDevices} device{g.connectedDevices > 1 ? 's' : ''}</span>}
                    {g.signal > 0 && <span>Signal: {g.signal}%</span>}
                    {lastSeenStr && <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{lastSeenStr}</span>}
                  </div>
                  {(g as any).macAddress && (
                    <div className="mt-1 text-[10px] font-mono text-slate-400 dark:text-slate-500">
                      MAC: {(g as any).macAddress}
                    </div>
                  )}
                </div>
                <button onClick={() => handleDelete(g.id, g.name)} className="p-1.5 rounded-md text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── User Detail Panel ──────────────────────────────────

interface UserDetailPanelProps {
  userId: string;
  onClose: () => void;
  onUserUpdated: () => void;
  /** Lightweight data from the list for instant pre-population */
  previewData?: AdminUser;
}

function UserDetailPanel({ userId, onClose, onUserUpdated, previewData }: UserDetailPanelProps) {
  const [activeTab, setActiveTab] = useState<ResourceTab>('profile');
  const [user, setUser] = useState<AdminUserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Editable fields — instantly pre-populated from list data
  const [name, setName] = useState(previewData?.name || '');
  const [email, setEmail] = useState(previewData?.email || '');
  const [phone, setPhone] = useState(previewData?.phone || '');
  const [company, setCompany] = useState(previewData?.company || '');
  const [role, setRole] = useState(previewData?.role || 'Viewer');
  const [accountType, setAccountType] = useState(previewData?.accountType || 'standard');
  const [newPassword, setNewPassword] = useState('');
  const [adminPassword, setAdminPassword] = useState('');

  const loadUser = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.adminGetUser(userId);
      setUser(data);
      // Override with full detail data (may have richer profile info)
      setName(data.profile?.name || data.name || '');
      setEmail(data.email || '');
      setPhone(data.profile?.phone || (data as any).phone || '');
      setCompany(data.profile?.company || (data as any).company || '');
      setRole(data.profile?.role || data.role || 'Viewer');
      setAccountType(data.accountType || 'standard');
    } catch (err: any) {
      toast.error('Failed to load user details');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { loadUser(); }, [loadUser]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const updates: Record<string, any> = {
        name,
        email,
        phone,
        company,
        role,
        accountType,
      };
      if (newPassword.trim()) {
        if (!adminPassword.trim()) {
          toast.error('Please enter your admin password to confirm the password reset.');
          setSaving(false);
          return;
        }
        updates.password = newPassword;
        updates.adminPassword = adminPassword;
      }
      await api.adminUpdateUser(userId, updates);
      toast.success('User updated successfully');
      setNewPassword('');
      setAdminPassword('');
      onUserUpdated();
      loadUser();
    } catch (err: any) {
      toast.error(err.message || 'Failed to update user');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await api.adminDeleteUser(userId);
      toast.success('User deleted');
      onClose();
      onUserUpdated();
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete user');
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-500 dark:text-slate-400">
        User not found
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-sm">
            {(user.name || user.email)[0]?.toUpperCase() || 'U'}
          </div>
          <div>
            <h3 className="font-semibold text-slate-900 dark:text-white">{user.name || user.email}</h3>
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <AccountTypeBadge type={user.accountType} />
              {user.isMaster && (
                <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 font-medium">
                  <Crown className="h-3 w-3" /> Master
                </span>
              )}
            </div>
          </div>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
          <X className="h-5 w-5 text-slate-400" />
        </button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-2">
        {[
          { icon: Database, label: 'Properties', value: user.propertyCount },
          { icon: Cpu, label: 'Devices', value: user.deviceCount },
          { icon: Calendar, label: 'Created', value: formatDateShort(user.createdAt) },
          { icon: Clock, label: 'Last Login', value: user.lastSignIn ? formatDateShort(user.lastSignIn) : 'Never' },
        ].map(({ icon: Icon, label, value }) => (
          <div key={label} className="rounded-lg border border-slate-200 dark:border-slate-700 p-2 flex items-center gap-2">
            <Icon className="h-3.5 w-3.5 text-slate-400 shrink-0" />
            <div className="min-w-0">
              <div className="text-xs font-semibold text-slate-900 dark:text-white truncate">{value}</div>
              <div className="text-[10px] text-slate-500 dark:text-slate-400">{label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-slate-200 dark:border-slate-700 overflow-x-auto">
        {([
          { key: 'profile' as ResourceTab, label: 'Profile', icon: UserCog },
          { key: 'properties' as ResourceTab, label: 'Properties', icon: Building2 },
          { key: 'devices' as ResourceTab, label: 'Devices', icon: Radio },
          { key: 'gateways' as ResourceTab, label: 'Gateways', icon: Server },
        ]).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={cn(
              'flex items-center gap-1 px-2.5 py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap',
              activeTab === key
                ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300',
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'profile' && (
        <>
          {/* Edit form */}
          <div className="space-y-4">
            <h4 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <UserCog className="h-4 w-4" /> Edit User
            </h4>

            <div className="grid grid-cols-1 gap-3">
              {/* Name */}
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors"
                />
              </div>

              {/* Email */}
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1 flex items-center gap-1">
                  <Mail className="h-3 w-3" /> Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors"
                />
              </div>

              {/* Phone */}
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1 flex items-center gap-1">
                  <Phone className="h-3 w-3" /> Phone
                </label>
                <input
                  type="text"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="e.g. +852 1234 5678"
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors"
                />
              </div>

              {/* Company */}
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1 flex items-center gap-1">
                  <Building2 className="h-3 w-3" /> Company
                </label>
                <input
                  type="text"
                  value={company}
                  onChange={e => setCompany(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors"
                />
              </div>

              {/* Role */}
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Role</label>
                <select
                  value={role}
                  onChange={e => setRole(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors"
                >
                  <option value="Admin">Admin</option>
                  <option value="Manager">Manager</option>
                  <option value="Engineer">Engineer</option>
                  <option value="Technician">Technician</option>
                  <option value="Viewer">Viewer</option>
                </select>
              </div>

              {/* Account Type */}
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Account Type</label>
                <select
                  value={accountType}
                  onChange={e => setAccountType(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors"
                >
                  <option value="standard">Standard</option>
                  <option value="testing">Testing</option>
                  <option value="demo">Demo</option>
                </select>
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1 flex items-center gap-1">
                <Key className="h-3 w-3" /> New Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="Leave blank to keep current"
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 pr-10 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {newPassword && newPassword.length < 6 && (
                <p className="mt-1 text-xs text-amber-600">Password must be at least 6 characters</p>
              )}
            </div>

            {/* Admin Password Confirmation (shown only when setting new password) */}
            {newPassword.trim() && (
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1 flex items-center gap-1">
                  <Key className="h-3 w-3" /> Your Admin Password (confirm)
                </label>
                <input
                  type="password"
                  value={adminPassword}
                  onChange={e => setAdminPassword(e.target.value)}
                  placeholder="Enter your admin password to confirm"
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors"
                />
                <p className="mt-1 text-xs text-slate-500">Required for security when resetting a user's password</p>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between pt-4 border-t border-slate-200 dark:border-slate-700">
            {/* Delete button */}
            {!user.isMaster && (
              <div>
                {!confirmDelete ? (
                  <button
                    onClick={() => setConfirmDelete(true)}
                    className="flex items-center gap-1.5 text-sm text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 transition-colors"
                  >
                    <Trash2 className="h-4 w-4" /> Delete User
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-red-600 dark:text-red-400">Confirm?</span>
                    <button
                      onClick={handleDelete}
                      disabled={deleting}
                      className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
                    >
                      {deleting ? 'Deleting...' : 'Yes, Delete'}
                    </button>
                    <button
                      onClick={() => setConfirmDelete(false)}
                      className="rounded-md px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            )}
            {user.isMaster && <div />}

            {/* Save button */}
            <button
              onClick={handleSave}
              disabled={saving || (newPassword.length > 0 && newPassword.length < 6)}
              className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save Changes
            </button>
          </div>
        </>
      )}

      {activeTab === 'properties' && <PropertiesTab userId={userId} />}
      {activeTab === 'devices' && <DevicesTab userId={userId} />}
      {activeTab === 'gateways' && <GatewaysTab userId={userId} />}
    </div>
  );
}

// ─── Create User Dialog ─────────────────────────────────

function CreateUserDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [accountType, setAccountType] = useState('standard');
  const [showPw, setShowPw] = useState(false);
  const [creating, setCreating] = useState(false);

  const reset = () => { setEmail(''); setPassword(''); setName(''); setAccountType('standard'); setShowPw(false); };

  const handleCreate = async () => {
    if (!email.trim()) { toast.error('Email is required'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { toast.error('Invalid email format'); return; }
    if (password.length < 8) { toast.error('Password must be at least 8 characters'); return; }
    setCreating(true);
    try {
      await api.signup({ email: email.trim(), password, name: name.trim() || email.split('@')[0], accountType });
      toast.success(`Account created for ${email}. A confirmation email has been sent.`);
      reset();
      onClose();
      onCreated();
    } catch (err: any) {
      toast.error(err.message || 'Failed to create account');
    } finally {
      setCreating(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.15 }}
        onClick={e => e.stopPropagation()}
        className="relative mx-4 w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl p-6"
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-blue-50 dark:bg-blue-900/30 p-2">
              <UserPlus className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Create New Account</h3>
          </div>
          <button onClick={() => { reset(); onClose(); }} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
            <X className="h-5 w-5 text-slate-400" />
          </button>
        </div>

        <div className="space-y-4">
          {/* Name */}
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Full Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. John Smith"
              className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-blue-500 outline-none transition-colors"
            />
          </div>

          {/* Email */}
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1 flex items-center gap-1">
              <Mail className="h-3 w-3" /> Email <span className="text-red-500">*</span>
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="user@company.com"
              className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-blue-500 outline-none transition-colors"
            />
          </div>

          {/* Password */}
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1 flex items-center gap-1">
              <Key className="h-3 w-3" /> Password <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Min 8 characters"
                className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 pr-10 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-blue-500 outline-none transition-colors"
              />
              <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {password && password.length < 8 && (
              <p className="mt-1 text-xs text-amber-600">Password must be at least 8 characters</p>
            )}
          </div>

          {/* Account Type */}
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Account Type</label>
            <select
              value={accountType}
              onChange={e => setAccountType(e.target.value)}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition-colors"
            >
              <option value="standard">Standard</option>
              <option value="testing">Testing</option>
              <option value="demo">Demo</option>
            </select>
            <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
              Standard accounts get default seed data (properties, devices, gateways).
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-slate-200 dark:border-slate-700">
          <button
            onClick={() => { reset(); onClose(); }}
            className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={creating || !email.trim() || password.length < 8}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
            Create Account
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ─── Main Admin Panel ───────────────────────────────────

export function AdminPanel() {
  const { isAdmin, isDemoMode } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<string>('all');
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.adminListUsers();
      setUsers(data.users || []);
    } catch (err: any) {
      toast.error('Failed to load users');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  // Redirect non-admins (unless demo mode) — placed after all hooks
  if (!isAdmin && !isDemoMode) {
    return <Navigate to="/" replace />;
  }

  const filteredUsers = users.filter(u => {
    const matchesSearch =
      !search ||
      u.email.toLowerCase().includes(search.toLowerCase()) ||
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.company?.toLowerCase().includes(search.toLowerCase());
    const matchesType = filterType === 'all' || u.accountType === filterType;
    return matchesSearch && matchesType;
  });

  const stats = {
    total: users.length,
    standard: users.filter(u => u.accountType === 'standard').length,
    testing: users.filter(u => u.accountType === 'testing').length,
    demo: users.filter(u => u.accountType === 'demo').length,
  };

  return (
    <div className="min-h-screen">
      <AnimatePresence>
        {showCreateDialog && (
          <CreateUserDialog
            open={showCreateDialog}
            onClose={() => setShowCreateDialog(false)}
            onCreated={loadUsers}
          />
        )}
      </AnimatePresence>

      <div className="p-4 lg:p-8 space-y-6">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <ShieldCheck className="h-7 w-7 text-blue-600" />
              System Admin
            </h1>
            <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
              Manage user accounts, permissions and settings
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowCreateDialog(true)}
              className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
            >
              <UserPlus className="h-4 w-4" />
              Create Account
            </button>
            <button
              onClick={loadUsers}
              disabled={loading}
              className="flex items-center gap-2 rounded-lg bg-slate-100 dark:bg-slate-800 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
              Refresh
            </button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Total Users', value: stats.total, icon: Users, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/30' },
            { label: 'Standard', value: stats.standard, icon: CheckCircle2, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/30' },
            { label: 'Testing', value: stats.testing, icon: AlertTriangle, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/30' },
            { label: 'Demo', value: stats.demo, icon: Eye, color: 'text-slate-600 dark:text-slate-400', bg: 'bg-slate-50 dark:bg-slate-800' },
          ].map(({ label, value, icon: Icon, color, bg }) => (
            <div key={label} className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
              <div className="flex items-center gap-3">
                <div className={cn('rounded-lg p-2', bg)}>
                  <Icon className={cn('h-5 w-5', color)} />
                </div>
                <div>
                  <div className="text-2xl font-bold text-slate-900 dark:text-white">{value}</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">{label}</div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* User List */}
          <div className={cn(
            'xl:col-span-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden',
            selectedUserId ? '' : 'xl:col-span-3',
          )}>
            {/* Toolbar */}
            <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search by name, email, or company..."
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 pl-10 pr-3 py-2 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors"
                />
              </div>
              <select
                value={filterType}
                onChange={e => setFilterType(e.target.value)}
                className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
              >
                <option value="all">All Types</option>
                <option value="standard">Standard</option>
                <option value="testing">Testing</option>
                <option value="demo">Demo</option>
              </select>
            </div>

            {/* Table */}
            {loading ? (
              <div className="flex items-center justify-center h-48">
                <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-slate-400 dark:text-slate-500">
                <Users className="h-8 w-8 mb-2" />
                <p className="text-sm">No users found</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
                      <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-slate-400">User</th>
                      <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-slate-400 hidden sm:table-cell">Role</th>
                      <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-slate-400 hidden md:table-cell">Type</th>
                      <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-slate-400 hidden xl:table-cell">Last Login</th>
                      <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-slate-400 hidden md:table-cell">Status</th>
                      <th className="px-4 py-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map(user => (
                      <tr
                        key={user.id}
                        onClick={() => setSelectedUserId(user.id)}
                        className={cn(
                          'border-b border-slate-100 dark:border-slate-800 cursor-pointer transition-colors',
                          selectedUserId === user.id
                            ? 'bg-blue-50 dark:bg-blue-900/20'
                            : 'hover:bg-slate-50 dark:hover:bg-slate-800/50',
                        )}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
                              {(user.name || user.email)[0]?.toUpperCase() || 'U'}
                            </div>
                            <div className="min-w-0">
                              <div className="font-medium text-slate-900 dark:text-white truncate flex items-center gap-1.5">
                                {user.name || user.email.split('@')[0]}
                                {user.isMaster && <Crown className="h-3.5 w-3.5 text-amber-500 shrink-0" />}
                              </div>
                              <div className="text-xs text-slate-500 dark:text-slate-400 truncate">{user.email}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-400 hidden sm:table-cell">{user.role}</td>
                        <td className="px-4 py-3 hidden md:table-cell"><AccountTypeBadge type={user.accountType} /></td>
                        <td className="px-4 py-3 text-slate-500 dark:text-slate-400 text-xs hidden xl:table-cell">{formatDate(user.lastSignIn)}</td>
                        <td className="px-4 py-3 hidden md:table-cell">
                          {user.emailConfirmed ? (
                            <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                              <CheckCircle2 className="h-3.5 w-3.5" /> Verified
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                              <XCircle className="h-3.5 w-3.5" /> Unverified
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <ChevronRight className="h-4 w-4 text-slate-400 ml-auto" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Detail Panel */}
          <AnimatePresence>
            {selectedUserId && (
              <motion.div
                key="detail"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.2 }}
                className="xl:col-span-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 self-start overflow-hidden"
              >
                <UserDetailPanel
                  userId={selectedUserId}
                  onClose={() => setSelectedUserId(null)}
                  onUserUpdated={loadUsers}
                  previewData={users.find(u => u.id === selectedUserId)}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

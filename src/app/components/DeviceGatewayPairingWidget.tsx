import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Router,
  Cpu,
  Link2,
  Link2Off,
  Loader2,
  CheckCircle,
  X,
  ChevronDown,
  ChevronUp,
  Search,
  Battery,
  BatteryWarning,
  Unplug,
  ArrowRight,
  RefreshCw,
  Building2,
  Filter,
  Square,
  MinusSquare,
  Clock,
  History,
} from 'lucide-react';
import { clsx } from 'clsx';
import { motion, AnimatePresence } from 'motion/react';
import {
  api,
  type Gateway,
  type Device,
  type Property,
  type GatewayDevice,
} from '@/app/utils/api';
import { toast } from 'sonner';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/app/components/ui/select';
import { Button } from '@/app/components/ui/button';
import { Checkbox } from '@/app/components/ui/checkbox';

// ─── Types ───────────────────────────────────────────────

interface ActivityLogEntry {
  id: string;
  action: 'pair' | 'unpair' | 'batch-pair';
  deviceNames: string[];
  gatewayName: string;
  timestamp: number;
}

// ─── Status helpers ──────────────────────────────────────

function StatusDot({ status }: { status: string }) {
  return (
    <span
      className={clsx(
        'inline-flex h-2 w-2 rounded-full shrink-0',
        status === 'online'
          ? 'bg-emerald-500'
          : status === 'warning'
            ? 'bg-amber-500 animate-pulse'
            : 'bg-slate-400',
      )}
    />
  );
}

function MiniSignal({ signal }: { signal: number }) {
  const bars =
    signal >= 80 ? 4 : signal >= 60 ? 3 : signal >= 40 ? 2 : 1;
  const color =
    signal >= 80
      ? 'bg-emerald-500'
      : signal >= 60
        ? 'bg-blue-500'
        : signal >= 40
          ? 'bg-amber-500'
          : 'bg-red-500';
  return (
    <div className="flex items-end gap-px" title={`${signal}%`}>
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          className={clsx(
            'w-[3px] rounded-full',
            i < bars ? color : 'bg-slate-200',
          )}
          style={{ height: `${6 + i * 2}px` }}
        />
      ))}
    </div>
  );
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 5_000) return 'just now';
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

// ─── Connected device chip ───────────────────────────────

function ConnectedDeviceChip({
  device,
  onUnassign,
  busy,
}: {
  device: GatewayDevice;
  onUnassign: (deviceId: string) => void;
  busy: boolean;
}) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ duration: 0.2 }}
      className={clsx(
        'flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] group/chip transition-all',
        device.status === 'online'
          ? 'border-emerald-100 bg-emerald-50/40'
          : device.status === 'warning'
            ? 'border-amber-100 bg-amber-50/40'
            : 'border-slate-200 bg-slate-50/40',
      )}
    >
      <StatusDot status={device.status} />
      <span className="font-medium text-slate-700 truncate max-w-[80px] sm:max-w-[120px]">
        {device.name}
      </span>
      <div className="flex items-center gap-0.5 text-slate-400 ml-auto">
        {device.battery < 20 ? (
          <BatteryWarning className="h-2.5 w-2.5 text-red-500" />
        ) : (
          <Battery className="h-2.5 w-2.5" />
        )}
        <span
          className={clsx(
            'text-[9px]',
            device.battery < 20 && 'text-red-500',
          )}
        >
          {device.battery}%
        </span>
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onUnassign(device.id);
        }}
        disabled={busy}
        className="opacity-0 group-hover/chip:opacity-100 rounded p-0.5 text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all disabled:opacity-50"
        title="Unpair from gateway"
      >
        <X className="h-2.5 w-2.5" />
      </button>
    </motion.div>
  );
}

// ─── Gateway row ─────────────────────────────────────────

function GatewayRow({
  gateway,
  expanded,
  onToggle,
  onUnassign,
  busy,
}: {
  gateway: Gateway;
  expanded: boolean;
  onToggle: () => void;
  onUnassign: (deviceId: string) => void;
  busy: boolean;
}) {
  return (
    <div
      className={clsx(
        'rounded-xl border transition-all',
        expanded
          ? 'border-blue-200 bg-blue-50/30 shadow-sm'
          : 'border-slate-100 bg-white hover:border-slate-200',
      )}
    >
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-3 py-2.5 text-left"
      >
        <div
          className={clsx(
            'h-8 w-8 rounded-lg flex items-center justify-center shrink-0',
            gateway.status === 'online'
              ? 'bg-emerald-100'
              : gateway.status === 'warning'
                ? 'bg-amber-100'
                : 'bg-slate-100',
          )}
        >
          <Router
            className={clsx(
              'h-4 w-4',
              gateway.status === 'online'
                ? 'text-emerald-600'
                : gateway.status === 'warning'
                  ? 'text-amber-600'
                  : 'text-slate-400',
            )}
          />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="text-xs font-semibold text-slate-800 truncate">
              {gateway.name}
            </p>
            <span
              className={clsx(
                'text-[9px] font-medium px-1.5 py-0.5 rounded-full',
                gateway.status === 'online'
                  ? 'bg-emerald-50 text-emerald-700'
                  : gateway.status === 'warning'
                    ? 'bg-amber-50 text-amber-700'
                    : 'bg-slate-100 text-slate-500',
              )}
            >
              {gateway.status}
            </span>
          </div>
          <p className="text-[10px] text-slate-400 truncate">
            {gateway.property} &middot; {gateway.protocol}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <MiniSignal signal={gateway.signal} />
          <div className="text-right">
            <p className="text-xs font-bold text-slate-700">
              {gateway.connectedDevices}
            </p>
            <p className="text-[9px] text-slate-400">devices</p>
          </div>
          {expanded ? (
            <ChevronUp className="h-3.5 w-3.5 text-slate-400" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
          )}
        </div>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 pt-1 border-t border-slate-100">
              {gateway.devices.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  <AnimatePresence mode="popLayout">
                    {gateway.devices.map((d) => (
                      <ConnectedDeviceChip
                        key={d.id}
                        device={d}
                        onUnassign={onUnassign}
                        busy={busy}
                      />
                    ))}
                  </AnimatePresence>
                </div>
              ) : (
                <div className="flex items-center justify-center gap-1.5 py-3 text-[11px] text-slate-400">
                  <Unplug className="h-3.5 w-3.5" />
                  No connected devices
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Batch Pair Form ──────���──────────────────────────────

function BatchPairForm({
  gateways,
  unassignedDevices,
  onPairBatch,
  busy,
}: {
  gateways: Gateway[];
  unassignedDevices: Device[];
  onPairBatch: (deviceIds: string[], gatewayId: string) => void;
  busy: boolean;
}) {
  const [selectedDevices, setSelectedDevices] = useState<Set<string>>(
    new Set(),
  );
  const [selectedGateway, setSelectedGateway] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  // Determine compatible gateways based on ALL selected devices
  const compatibleGateways = useMemo(() => {
    const online = gateways.filter((g) => g.status !== 'offline');
    if (selectedDevices.size === 0) return online;
    const selectedDevicesList = unassignedDevices.filter((d) =>
      selectedDevices.has(d.id),
    );
    return online.filter((g) => {
      return selectedDevicesList.every((d) => {
        if (d.building === 'Unassigned' || g.property === 'Unassigned')
          return true;
        return g.property === d.building;
      });
    });
  }, [selectedDevices, gateways, unassignedDevices]);

  // Reset gateway if it becomes incompatible
  useEffect(() => {
    if (
      selectedGateway &&
      !compatibleGateways.some((g) => g.id === selectedGateway)
    ) {
      setSelectedGateway('');
    }
  }, [compatibleGateways, selectedGateway]);

  // Clear selections when the available list changes (e.g. after a pair)
  useEffect(() => {
    setSelectedDevices((prev) => {
      const stillAvailable = new Set(unassignedDevices.map((d) => d.id));
      const next = new Set([...prev].filter((id) => stillAvailable.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [unassignedDevices]);

  const filteredDevices = useMemo(() => {
    if (!searchTerm) return unassignedDevices;
    const q = searchTerm.toLowerCase();
    return unassignedDevices.filter(
      (d) =>
        (d.name ?? '').toLowerCase().includes(q) ||
        (d.type ?? '').toLowerCase().includes(q) ||
        (d.building ?? '').toLowerCase().includes(q),
    );
  }, [unassignedDevices, searchTerm]);

  const toggleDevice = (id: string) => {
    setSelectedDevices((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedDevices.size === filteredDevices.length) {
      setSelectedDevices(new Set());
    } else {
      setSelectedDevices(new Set(filteredDevices.map((d) => d.id)));
    }
  };

  const handlePair = () => {
    if (selectedDevices.size === 0 || !selectedGateway) return;
    onPairBatch([...selectedDevices], selectedGateway);
    setSelectedDevices(new Set());
    setSelectedGateway('');
    setSearchTerm('');
  };

  const allSelected =
    filteredDevices.length > 0 &&
    filteredDevices.every((d) => selectedDevices.has(d.id));
  const someSelected =
    filteredDevices.some((d) => selectedDevices.has(d.id)) && !allSelected;

  if (unassignedDevices.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-4 text-center">
        <CheckCircle className="h-5 w-5 text-emerald-400 mx-auto mb-1.5" />
        <p className="text-xs font-medium text-slate-600">All devices paired</p>
        <p className="text-[10px] text-slate-400 mt-0.5">
          Every device is assigned to a gateway
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-blue-100 bg-gradient-to-br from-blue-50/60 to-white p-3.5 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-6 w-6 rounded-lg bg-blue-100 flex items-center justify-center">
            <Link2 className="h-3.5 w-3.5 text-blue-600" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-800">
              Batch Pair
            </p>
            <p className="text-[10px] text-slate-400">
              {unassignedDevices.length} unassigned
            </p>
          </div>
        </div>
        {selectedDevices.size > 0 && (
          <span className="text-[10px] font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-100">
            {selectedDevices.size} selected
          </span>
        )}
      </div>

      {/* Step 1: Select devices (multi-select) */}
      <div className="space-y-1.5">
        <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
          1. Select Devices
        </label>

        {/* Search + Select All */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search devices..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full h-7 pl-7 pr-2 text-[11px] rounded-md border border-slate-200 bg-white outline-none focus:border-blue-400 transition-colors"
            />
          </div>
          <button
            onClick={toggleAll}
            className="flex items-center gap-1 h-7 px-2 rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-[10px] font-medium text-slate-600 transition-colors shrink-0"
            title={allSelected ? 'Deselect all' : 'Select all'}
          >
            {allSelected ? (
              <MinusSquare className="h-3 w-3 text-blue-500" />
            ) : someSelected ? (
              <MinusSquare className="h-3 w-3 text-blue-400" />
            ) : (
              <Square className="h-3 w-3 text-slate-400" />
            )}
            All
          </button>
        </div>

        {/* Device list */}
        <div className="max-h-[160px] overflow-y-auto rounded-lg border border-slate-100 bg-white divide-y divide-slate-50">
          {filteredDevices.length === 0 ? (
            <div className="py-4 text-center text-[11px] text-slate-400">
              {searchTerm ? 'No devices match your search' : 'No unassigned devices'}
            </div>
          ) : (
            filteredDevices.map((d) => {
              const isSelected = selectedDevices.has(d.id);
              return (
                <label
                  key={d.id}
                  className={clsx(
                    'flex items-center gap-2 px-2.5 py-1.5 cursor-pointer transition-colors',
                    isSelected
                      ? 'bg-blue-50/50'
                      : 'hover:bg-slate-50/50',
                  )}
                >
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => toggleDevice(d.id)}
                    className="h-3.5 w-3.5"
                  />
                  <StatusDot status={d.status} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-medium text-slate-700 truncate">
                      {d.name}
                    </p>
                    <p className="text-[9px] text-slate-400 truncate">
                      {d.type}
                      {d.building !== 'Unassigned'
                        ? ` · ${d.building}`
                        : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-0.5 text-slate-400 shrink-0">
                    {d.battery < 20 ? (
                      <BatteryWarning className="h-2.5 w-2.5 text-red-500" />
                    ) : (
                      <Battery className="h-2.5 w-2.5" />
                    )}
                    <span
                      className={clsx(
                        'text-[9px]',
                        d.battery < 20 && 'text-red-500',
                      )}
                    >
                      {d.battery}%
                    </span>
                  </div>
                </label>
              );
            })
          )}
        </div>
      </div>

      {/* Step 2: Select gateway */}
      <div className="space-y-1.5">
        <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
          2. Select Gateway
        </label>
        <Select
          value={selectedGateway}
          onValueChange={setSelectedGateway}
          disabled={selectedDevices.size === 0}
        >
          <SelectTrigger
            className={clsx(
              'h-9 text-xs',
              selectedDevices.size === 0 && 'opacity-50',
            )}
          >
            <SelectValue
              placeholder={
                selectedDevices.size === 0
                  ? 'Select device(s) first'
                  : 'Choose target gateway...'
              }
            />
          </SelectTrigger>
          <SelectContent>
            {compatibleGateways.map((g) => (
              <SelectItem key={g.id} value={g.id}>
                <span className="flex items-center gap-2">
                  <StatusDot status={g.status} />
                  <span className="truncate">{g.name}</span>
                  <span className="text-slate-400 text-[10px]">
                    {g.protocol}
                  </span>
                  <span className="text-slate-300 text-[10px]">
                    {g.connectedDevices} dev
                  </span>
                </span>
              </SelectItem>
            ))}
            {compatibleGateways.length === 0 && (
              <div className="py-3 text-center text-xs text-slate-400">
                No compatible gateways
              </div>
            )}
          </SelectContent>
        </Select>
      </div>

      {/* Pair Button */}
      <Button
        size="sm"
        className="w-full h-8 text-xs gap-1.5"
        disabled={selectedDevices.size === 0 || !selectedGateway || busy}
        onClick={handlePair}
      >
        {busy ? (
          <>
            <Loader2 className="h-3 w-3 animate-spin" />
            Pairing...
          </>
        ) : (
          <>
            <Link2 className="h-3 w-3" />
            Pair {selectedDevices.size > 1 ? `${selectedDevices.size} Devices` : 'Device'}
            <ArrowRight className="h-3 w-3" />
          </>
        )}
      </Button>
    </div>
  );
}

// ─── Activity Log ────────────────────────────────────────

function ActivityLog({ entries }: { entries: ActivityLogEntry[] }) {
  const [, forceUpdate] = useState(0);

  // Re-render every 15s to update relative timestamps
  useEffect(() => {
    const interval = setInterval(() => forceUpdate((n) => n + 1), 15_000);
    return () => clearInterval(interval);
  }, []);

  if (entries.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-3 text-center">
        <History className="h-4 w-4 text-slate-300 mx-auto mb-1" />
        <p className="text-[10px] text-slate-400">
          No recent activity
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/30 overflow-hidden">
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-slate-100 bg-white/60">
        <History className="h-3 w-3 text-slate-400" />
        <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
          Recent Activity
        </span>
        <span className="text-[9px] text-slate-400 ml-auto">
          {entries.length} event{entries.length !== 1 ? 's' : ''}
        </span>
      </div>
      <div className="max-h-[140px] overflow-y-auto">
        <AnimatePresence initial={false}>
          {entries.map((entry) => (
            <motion.div
              key={entry.id}
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="border-b border-slate-50 last:border-0"
            >
              <div className="flex items-start gap-2 px-3 py-2">
                <div
                  className={clsx(
                    'mt-0.5 h-4 w-4 rounded flex items-center justify-center shrink-0',
                    entry.action === 'unpair'
                      ? 'bg-amber-100 text-amber-600'
                      : 'bg-emerald-100 text-emerald-600',
                  )}
                >
                  {entry.action === 'unpair' ? (
                    <Link2Off className="h-2.5 w-2.5" />
                  ) : (
                    <Link2 className="h-2.5 w-2.5" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] text-slate-700 leading-tight">
                    {entry.action === 'unpair' ? (
                      <>
                        <span className="font-medium">{entry.deviceNames[0]}</span>
                        {' '}unpaired from{' '}
                        <span className="font-medium">{entry.gatewayName}</span>
                      </>
                    ) : entry.action === 'batch-pair' ? (
                      <>
                        <span className="font-medium">
                          {entry.deviceNames.length} device{entry.deviceNames.length !== 1 ? 's' : ''}
                        </span>
                        {' '}paired to{' '}
                        <span className="font-medium">{entry.gatewayName}</span>
                      </>
                    ) : (
                      <>
                        <span className="font-medium">{entry.deviceNames[0]}</span>
                        {' '}paired to{' '}
                        <span className="font-medium">{entry.gatewayName}</span>
                      </>
                    )}
                  </p>
                  {entry.action === 'batch-pair' &&
                    entry.deviceNames.length > 0 && (
                      <p className="text-[9px] text-slate-400 mt-0.5 truncate">
                        {entry.deviceNames.join(', ')}
                      </p>
                    )}
                </div>
                <span className="text-[9px] text-slate-400 shrink-0 mt-0.5 flex items-center gap-0.5">
                  <Clock className="h-2 w-2" />
                  {timeAgo(entry.timestamp)}
                </span>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ─── Main Widget ─────────────────────────────────────────

const MAX_LOG_ENTRIES = 20;

export function DeviceGatewayPairingWidget() {
  const [gateways, setGateways] = useState<Gateway[]>([]);
  const [allDevices, setAllDevices] = useState<Device[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [expandedGateway, setExpandedGateway] = useState<string | null>(
    null,
  );
  const [refreshing, setRefreshing] = useState(false);
  const [propertyFilter, setPropertyFilter] = useState<string>('all');
  const [activityLog, setActivityLog] = useState<ActivityLogEntry[]>([]);
  const logIdRef = useRef(0);

  // ─── Data fetching ──────────────────────────────────────
  const fetchData = useCallback(async (showLoader = true) => {
    try {
      if (showLoader) setLoading(true);
      const [gwData, devData, propData] = await Promise.all([
        api.getGateways(),
        api.getDevices(),
        api.getProperties(),
      ]);
      setGateways(gwData);
      setAllDevices(devData);
      setProperties(propData);
    } catch (err) {
      console.debug('Pairing widget: failed to fetch data', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ─── Activity log helper ────────────────────────────────
  const addLogEntry = useCallback(
    (
      action: ActivityLogEntry['action'],
      deviceNames: string[],
      gatewayName: string,
    ) => {
      logIdRef.current += 1;
      setActivityLog((prev) =>
        [
          {
            id: `log-${logIdRef.current}`,
            action,
            deviceNames,
            gatewayName,
            timestamp: Date.now(),
          },
          ...prev,
        ].slice(0, MAX_LOG_ENTRIES),
      );
    },
    [],
  );

  // ─── Property filter logic ─────────────────────────────
  const filteredGateways = useMemo(() => {
    if (propertyFilter === 'all') return gateways;
    return gateways.filter(
      (g) =>
        g.property === propertyFilter || g.property === 'Unassigned',
    );
  }, [gateways, propertyFilter]);

  const unassignedDevices = useMemo(() => {
    const assignedIds = new Set(
      gateways.flatMap((g) => g.devices.map((d) => d.id)),
    );
    let devices = allDevices.filter(
      (d) =>
        !assignedIds.has(d.id) &&
        (!d.gateway || d.gateway === 'Unassigned'),
    );
    if (propertyFilter !== 'all') {
      devices = devices.filter(
        (d) =>
          d.building === propertyFilter || d.building === 'Unassigned',
      );
    }
    return devices;
  }, [allDevices, gateways, propertyFilter]);

  // ─── Unique property names for filter dropdown ──────────
  const propertyNames = useMemo(() => {
    const fromProps = properties.map((p) => p.name);
    const fromGateways = gateways
      .map((g) => g.property)
      .filter((p) => p !== 'Unassigned');
    return [...new Set([...fromProps, ...fromGateways])].sort();
  }, [properties, gateways]);

  // ─── Batch pair handler ─────────────────────────────────
  const handlePairBatch = useCallback(
    async (deviceIds: string[], gatewayId: string) => {
      setBusy(true);
      const gateway = gateways.find((g) => g.id === gatewayId);
      const deviceNames = deviceIds
        .map(
          (id) =>
            allDevices.find((d) => d.id === id)?.name || 'Unknown',
        );
      try {
        await api.assignDevicesToGateway(gatewayId, deviceIds);
        const isBatch = deviceIds.length > 1;
        toast.success(
          isBatch
            ? `${deviceIds.length} devices paired to "${gateway?.name || 'Gateway'}"`
            : `"${deviceNames[0]}" paired to "${gateway?.name || 'Gateway'}"`,
          { duration: 3000 },
        );
        addLogEntry(
          isBatch ? 'batch-pair' : 'pair',
          deviceNames,
          gateway?.name || 'Unknown',
        );
        await fetchData(false);
        setExpandedGateway(gatewayId);
      } catch (err) {
        console.error('Failed to pair device(s):', err);
        toast.error('Failed to pair device(s). Please try again.');
      } finally {
        setBusy(false);
      }
    },
    [allDevices, gateways, fetchData, addLogEntry],
  );

  // ─── Unassign handler ──────────────────────────────────
  const handleUnassign = useCallback(
    async (deviceId: string) => {
      setBusy(true);
      const device =
        allDevices.find((d) => d.id === deviceId) ||
        gateways.flatMap((g) => g.devices).find((d) => d.id === deviceId);
      const parentGateway = gateways.find((g) =>
        g.devices.some((d) => d.id === deviceId),
      );
      try {
        await api.unassignDeviceFromGateway(deviceId);
        toast.success(
          `"${device?.name || 'Device'}" unpaired from gateway`,
          { duration: 3000 },
        );
        addLogEntry(
          'unpair',
          [device?.name || 'Unknown'],
          parentGateway?.name || 'Unknown',
        );
        await fetchData(false);
      } catch (err) {
        console.error('Failed to unassign device:', err);
        toast.error('Failed to unassign device.');
      } finally {
        setBusy(false);
      }
    },
    [allDevices, gateways, fetchData, addLogEntry],
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchData(false);
    setRefreshing(false);
  };

  // ─── Stats ─────────────────────────────────────────────
  const stats = useMemo(
    () => ({
      totalGateways: filteredGateways.length,
      onlineGateways: filteredGateways.filter(
        (g) => g.status === 'online',
      ).length,
      warningGateways: filteredGateways.filter(
        (g) => g.status === 'warning',
      ).length,
      offlineGateways: filteredGateways.filter(
        (g) => g.status === 'offline',
      ).length,
      totalPaired: filteredGateways.reduce(
        (s, g) => s + g.connectedDevices,
        0,
      ),
      totalUnassigned: unassignedDevices.length,
    }),
    [filteredGateways, unassignedDevices],
  );

  // ─── Sorted gateways ──────────────────────────────────
  const sortedGateways = useMemo(() => {
    const order: Record<string, number> = {
      online: 0,
      warning: 1,
      offline: 2,
    };
    return [...filteredGateways].sort(
      (a, b) => (order[a.status] ?? 3) - (order[b.status] ?? 3),
    );
  }, [filteredGateways]);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6 shadow-sm">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-5">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-violet-50 rounded-lg text-violet-600">
            <Link2 className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-900">
              Device-Gateway Pairing
            </h3>
            <p className="text-sm text-slate-500">
              Batch pair and manage connections
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Property filter */}
          <div className="flex items-center gap-1.5">
            <Filter className="h-3 w-3 text-slate-400" />
            <Select
              value={propertyFilter}
              onValueChange={setPropertyFilter}
            >
              <SelectTrigger className="h-7 text-[11px] w-[150px] border-slate-200">
                <SelectValue placeholder="All Properties" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  <span className="flex items-center gap-1.5">
                    <Building2 className="h-3 w-3 text-slate-400" />
                    All Properties
                  </span>
                </SelectItem>
                {propertyNames.map((name) => (
                  <SelectItem key={name} value={name}>
                    <span className="flex items-center gap-1.5">
                      <Building2 className="h-3 w-3 text-blue-400" />
                      {name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="rounded-lg p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all disabled:opacity-50"
            title="Refresh"
          >
            <RefreshCw
              className={clsx('h-4 w-4', refreshing && 'animate-spin')}
            />
          </button>

          <div className="flex gap-3 text-xs text-slate-500">
            <span className="flex items-center gap-1">
              <Cpu className="h-3 w-3 text-blue-500" />
              {stats.totalPaired} paired
            </span>
            {stats.totalUnassigned > 0 && (
              <span className="flex items-center gap-1 text-amber-600 font-medium">
                <Link2Off className="h-3 w-3" />
                {stats.totalUnassigned} free
              </span>
            )}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-violet-400" />
        </div>
      ) : gateways.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-slate-400">
          <Router className="h-8 w-8 text-slate-200 mb-2" />
          <p className="text-sm text-slate-500">
            No gateways configured
          </p>
          <p className="text-xs text-slate-400">
            Add gateways from the Gateways page first
          </p>
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
          {/* Left column: Gateway list + stats */}
          <div className="space-y-3">
            {/* Gateway list header */}
            <div className="flex items-center gap-2">
              <h4 className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                Gateways ({stats.totalGateways})
              </h4>
              <div className="flex-1 h-px bg-slate-100" />
              <div className="flex items-center gap-2 text-[10px] text-slate-400">
                {stats.onlineGateways > 0 && (
                  <span className="flex items-center gap-0.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    {stats.onlineGateways}
                  </span>
                )}
                {stats.warningGateways > 0 && (
                  <span className="flex items-center gap-0.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                    {stats.warningGateways}
                  </span>
                )}
                {stats.offlineGateways > 0 && (
                  <span className="flex items-center gap-0.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                    {stats.offlineGateways}
                  </span>
                )}
              </div>
            </div>

            {/* Gateway rows */}
            {sortedGateways.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-6 text-center">
                <Building2 className="h-5 w-5 text-slate-300 mx-auto mb-1.5" />
                <p className="text-xs text-slate-500">
                  No gateways for this property
                </p>
                <button
                  onClick={() => setPropertyFilter('all')}
                  className="text-[10px] text-blue-600 hover:underline mt-1"
                >
                  Clear filter
                </button>
              </div>
            ) : (
              <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1">
                {sortedGateways.map((gw) => (
                  <GatewayRow
                    key={gw.id}
                    gateway={gw}
                    expanded={expandedGateway === gw.id}
                    onToggle={() =>
                      setExpandedGateway(
                        expandedGateway === gw.id ? null : gw.id,
                      )
                    }
                    onUnassign={handleUnassign}
                    busy={busy}
                  />
                ))}
              </div>
            )}

            {/* Summary stats row */}
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2 text-center">
                <p className="text-lg font-bold text-slate-800">
                  {stats.totalGateways}
                </p>
                <p className="text-[10px] text-slate-400">Gateways</p>
              </div>
              <div className="rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2 text-center">
                <p className="text-lg font-bold text-slate-800">
                  {stats.totalPaired}
                </p>
                <p className="text-[10px] text-slate-400">Paired</p>
              </div>
              <div
                className={clsx(
                  'rounded-lg border px-3 py-2 text-center',
                  stats.totalUnassigned > 0
                    ? 'border-amber-100 bg-amber-50/40'
                    : 'border-emerald-100 bg-emerald-50/40',
                )}
              >
                <p
                  className={clsx(
                    'text-lg font-bold',
                    stats.totalUnassigned > 0
                      ? 'text-amber-700'
                      : 'text-emerald-700',
                  )}
                >
                  {stats.totalUnassigned}
                </p>
                <p className="text-[10px] text-slate-400">Unassigned</p>
              </div>
            </div>
          </div>

          {/* Right column: Batch pair + Activity log */}
          <div className="space-y-3">
            <BatchPairForm
              gateways={filteredGateways}
              unassignedDevices={unassignedDevices}
              onPairBatch={handlePairBatch}
              busy={busy}
            />
            <ActivityLog entries={activityLog} />
          </div>
        </div>
      )}
    </div>
  );
}
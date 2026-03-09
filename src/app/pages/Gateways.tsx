import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Router,
  WifiOff,
  Wifi,
  Signal,
  Search,
  Loader2,
  Building2,
  MapPin,
  Cpu,
  ChevronDown,
  ChevronUp,
  MoreVertical,
  Trash2,
  RefreshCcw,
  Plus,
  Globe,
  Fingerprint,
  HardDrive,
  Clock,
  CheckCircle,
  AlertTriangle,
  Battery,
  BatteryWarning,
  Zap,
  X,
  GripVertical,
  ArrowRight,
  Unplug,
  Activity,
  Pause,
  Play,
  Copy,
  Smartphone,
  Radio,
  Hash,
} from 'lucide-react';
import { clsx } from 'clsx';
import { api, type Gateway, type GatewayDevice, type Property, type Device } from '@/app/utils/api';
import { useAuth } from '@/app/utils/AuthContext';
import { projectId, publicAnonKey } from '/utils/supabase/info';
import { toast } from 'sonner';
import { Popover, PopoverContent, PopoverTrigger } from '@/app/components/ui/popover';
import { motion, AnimatePresence } from 'motion/react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
  DialogDescription,
} from '@/app/components/ui/dialog';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/app/components/ui/select';
import { DndProvider, useDrag, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { WebhookConfigPanel } from '@/app/components/WebhookConfigPanel';
import { copyToClipboard } from '@/app/utils/clipboard';

const DND_TYPE = 'GATEWAY_DEVICE';

interface DragItem {
  id: string;
  name: string;
  type: string;
  status: string;
  battery: number;
  sourceGatewayId: string | null; // null means from "available" pool
}

function formatTimeSince(isoString: string): string {
  const now = Date.now();
  const then = new Date(isoString).getTime();
  const diffMs = now - then;
  if (diffMs < 60000) return 'Just now';
  if (diffMs < 3600000) return `${Math.round(diffMs / 60000)}m ago`;
  if (diffMs < 86400000) return `${Math.round(diffMs / 3600000)}h ago`;
  return `${Math.round(diffMs / 86400000)}d ago`;
}

function SignalStrength({ signal, size = 'md' }: { signal: number; size?: 'sm' | 'md' }) {
  const bars = signal >= 80 ? 4 : signal >= 60 ? 3 : signal >= 40 ? 2 : 1;
  const color = signal >= 80 ? 'bg-emerald-500' : signal >= 60 ? 'bg-blue-500' : signal >= 40 ? 'bg-amber-500' : 'bg-red-500';
  const h = size === 'sm' ? [6, 9, 12, 16] : [8, 12, 16, 20];
  const w = size === 'sm' ? 'w-1' : 'w-1.5';
  return (
    <div className="flex items-end gap-0.5" title={`${signal}% signal`}>
      {[0, 1, 2, 3].map(i => (
        <div
          key={i}
          className={clsx(w, "rounded-full transition-colors", i < bars ? color : "bg-slate-200")}
          style={{ height: `${h[i]}px` }}
        />
      ))}
    </div>
  );
}

function ProtocolBadge({ protocol }: { protocol: string }) {
  const colors: Record<string, string> = {
    'Zigbee': 'bg-purple-50 text-purple-700 ring-purple-600/20',
    'LoRaWAN': 'bg-sky-50 text-sky-700 ring-sky-600/20',
    'WiFi': 'bg-blue-50 text-blue-700 ring-blue-600/20',
    'BLE+Zigbee': 'bg-indigo-50 text-indigo-700 ring-indigo-600/20',
    'BLE': 'bg-teal-50 text-teal-700 ring-teal-600/20',
    'LoRaWAN + LTE': 'bg-violet-50 text-violet-700 ring-violet-600/20',
    'LTE': 'bg-red-50 text-red-700 ring-red-600/20',
    'Cellular': 'bg-red-50 text-red-700 ring-red-600/20',
    'Ethernet': 'bg-gray-50 text-gray-700 ring-gray-600/20',
  };
  return (
    <span className={clsx(
      "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
      colors[protocol] || 'bg-slate-50 text-slate-700 ring-slate-600/20'
    )}>
      {protocol}
    </span>
  );
}

function StatusDot({ status }: { status: string }) {
  return (
    <span className={clsx(
      "inline-flex h-2.5 w-2.5 rounded-full shrink-0",
      status === 'online' ? 'bg-emerald-500' :
      status === 'warning' ? 'bg-amber-500 animate-pulse' :
      status === 'offline' ? 'bg-slate-400' :
      'bg-red-500'
    )} />
  );
}

// ─── Draggable connected device chip ─────────────────────

function DraggableDeviceChip({
  device,
  gatewayId,
  onUnassign,
  canEdit = true,
}: {
  device: GatewayDevice;
  gatewayId: string;
  onUnassign: (deviceId: string) => void;
  canEdit?: boolean;
}) {
  const [{ isDragging }, drag] = useDrag<DragItem, void, { isDragging: boolean }>(() => ({
    type: DND_TYPE,
    item: { id: device.id, name: device.name, type: device.type, status: device.status, battery: device.battery, sourceGatewayId: gatewayId },
    canDrag: canEdit,
    collect: (monitor) => ({ isDragging: monitor.isDragging() }),
  }), [device, gatewayId, canEdit]);

  return (
    <div
      ref={drag}
      className={clsx(
        "flex items-center gap-2 rounded-lg border px-3 py-2 text-xs transition-all group/chip",
        canEdit ? "cursor-grab active:cursor-grabbing" : "cursor-default",
        isDragging ? 'opacity-40 scale-95 shadow-lg' :
        device.status === 'online' ? 'border-emerald-100 bg-emerald-50/50 hover:border-emerald-200' :
        device.status === 'warning' ? 'border-amber-100 bg-amber-50/50 hover:border-amber-200' :
        device.status === 'offline' ? 'border-slate-200 bg-slate-50/50 hover:border-slate-300' :
        'border-red-100 bg-red-50/50 hover:border-red-200'
      )}
    >
      {canEdit && <GripVertical className="h-3 w-3 text-slate-300 shrink-0" />}
      <StatusDot status={device.status} />
      <div className="flex-1 min-w-0">
        <p className="font-medium text-slate-800 truncate">{device.name}</p>
        <p className="text-slate-500">{device.type}</p>
      </div>
      <div className="flex items-center gap-1.5">
        <div className="flex items-center gap-0.5 text-slate-400">
          {device.battery < 20 ? <BatteryWarning className="h-3 w-3 text-red-500" /> : <Battery className="h-3 w-3" />}
          <span className={clsx("text-[10px] font-medium", device.battery < 20 && 'text-red-500')}>{device.battery}%</span>
        </div>
        {canEdit && (
          <button
            onClick={(e) => { e.stopPropagation(); onUnassign(device.id); }}
            className="opacity-0 group-hover/chip:opacity-100 rounded p-0.5 text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all"
            title="Unassign from gateway"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Draggable available device chip ─────────────────────

function AvailableDeviceChip({ device }: { device: Device }) {
  const [{ isDragging }, drag] = useDrag<DragItem, void, { isDragging: boolean }>(() => ({
    type: DND_TYPE,
    item: { id: device.id, name: device.name, type: device.type, status: device.status, battery: device.battery, sourceGatewayId: null },
    collect: (monitor) => ({ isDragging: monitor.isDragging() }),
  }), [device]);

  return (
    <div
      ref={drag}
      className={clsx(
        "flex items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-xs transition-all cursor-grab active:cursor-grabbing",
        isDragging ? 'opacity-40 scale-95 shadow-lg border-blue-300 bg-blue-50' :
        'border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50/30'
      )}
    >
      <GripVertical className="h-3 w-3 text-slate-300 shrink-0" />
      <StatusDot status={device.status} />
      <div className="flex-1 min-w-0">
        <p className="font-medium text-slate-700 truncate">{device.name}</p>
        <p className="text-slate-400">{device.type} · {device.building}</p>
      </div>
      <ArrowRight className="h-3 w-3 text-slate-300 shrink-0" />
    </div>
  );
}

// ─── Drop zone for the gateway ───────────────────────────

function GatewayDropZone({
  gatewayId,
  onDrop,
  children,
}: {
  gatewayId: string;
  onDrop: (item: DragItem) => void;
  children: React.ReactNode;
}) {
  const [{ isOver, canDrop }, drop] = useDrop<DragItem, void, { isOver: boolean; canDrop: boolean }>(() => ({
    accept: DND_TYPE,
    canDrop: (item) => item.sourceGatewayId !== gatewayId,
    drop: (item) => onDrop(item),
    collect: (monitor) => ({
      isOver: monitor.isOver(),
      canDrop: monitor.canDrop(),
    }),
  }), [gatewayId, onDrop]);

  return (
    <div
      ref={drop}
      className={clsx(
        "rounded-xl border-2 border-dashed p-3 transition-all min-h-[60px]",
        isOver && canDrop ? 'border-blue-400 bg-blue-50/60 shadow-inner' :
        canDrop ? 'border-blue-200 bg-blue-50/20' :
        'border-transparent'
      )}
    >
      {isOver && canDrop && (
        <div className="flex items-center justify-center gap-1.5 text-xs text-blue-600 font-medium mb-2">
          <Plus className="h-3 w-3" />
          Drop to assign device
        </div>
      )}
      {children}
    </div>
  );
}

const GATEWAY_MODELS = ['FioGate Lite 200', 'FioGate Pro 500', 'FioGate Max 800', 'Milesight UG65', 'EC25', 'Custom'];
const GATEWAY_PROTOCOLS = ['Zigbee', 'LoRaWAN', 'LoRaWAN + LTE', 'WiFi', 'BLE', 'BLE+Zigbee', 'LTE', 'Cellular', 'Ethernet'];

// ─── Signal conversion helpers ───────────────────────────
// Uses the standard mobile formula: % = 2 × (dBm + 100), clamped [0, 100]
// -50 dBm = 100%, -63 dBm = 74%, -80 dBm = 40%, -100 dBm = 0%
function dBmToPercent(dBm: number): number {
  return Math.max(0, Math.min(100, Math.round(2 * (dBm + 100))));
}

function percentToDbm(pct: number): number {
  return Math.round(pct / 2 - 100);
}

// LTE ASU (Arbitrary Strength Unit, 0–31) to dBm: dBm = 2 × ASU − 113
function asuToDbm(asu: number): number {
  return 2 * asu - 113;
}

function asuToPercent(asu: number): number {
  return dBmToPercent(asuToDbm(asu));
}

// ─── Protocol-specific field definitions ─────────────────

interface ProtocolFieldDef {
  key: string;
  label: string;
  placeholder: string;
  icon: React.ComponentType<any>;
  type?: 'text' | 'number';
}

const PROTOCOL_FIELDS: Record<string, ProtocolFieldDef[]> = {
  WiFi: [
    { key: 'macAddress', label: 'MAC Address', placeholder: 'AA:BB:CC:DD:EE:FF', icon: Fingerprint },
    { key: 'ipAddress', label: 'IP Address', placeholder: '192.168.1.100', icon: Globe },
    { key: 'ssid', label: 'WiFi Network (SSID)', placeholder: 'e.g. BuildingNet-5G', icon: Wifi },
    { key: 'signal', label: 'Signal Strength (%)', placeholder: '0–100', icon: Signal, type: 'number' },
  ],
  Ethernet: [
    { key: 'macAddress', label: 'MAC Address', placeholder: 'AA:BB:CC:DD:EE:FF', icon: Fingerprint },
    { key: 'ipAddress', label: 'IP Address', placeholder: '192.168.1.100', icon: Globe },
  ],
  LTE: [
    { key: 'imei', label: 'IMEI', placeholder: 'e.g. 865847053040323', icon: Smartphone },
    { key: 'simIccid', label: 'SIM ICCID', placeholder: 'e.g. 8944110065483200000', icon: Hash },
    { key: 'apn', label: 'APN', placeholder: 'e.g. internet.provider.com', icon: Globe },
    { key: 'ipAddress', label: 'IP Address (carrier-assigned)', placeholder: 'Leave blank if dynamic', icon: Globe },
    { key: 'signal', label: 'Signal Strength (%)', placeholder: '0–100 (RSSI mapped)', icon: Signal, type: 'number' },
  ],
  Cellular: [
    { key: 'imei', label: 'IMEI', placeholder: 'e.g. 865847053040323', icon: Smartphone },
    { key: 'simIccid', label: 'SIM ICCID', placeholder: 'e.g. 8944110065483200000', icon: Hash },
    { key: 'apn', label: 'APN', placeholder: 'e.g. internet', icon: Globe },
    { key: 'ipAddress', label: 'IP Address (carrier-assigned)', placeholder: 'Leave blank if dynamic', icon: Globe },
    { key: 'signal', label: 'Signal Strength (%)', placeholder: '0–100', icon: Signal, type: 'number' },
  ],
  Zigbee: [
    { key: 'panId', label: 'PAN ID', placeholder: 'e.g. 0x1A2B', icon: Radio },
    { key: 'channel', label: 'Channel (11–26)', placeholder: 'e.g. 15', icon: Radio },
    { key: 'signal', label: 'Signal Strength (%)', placeholder: '0–100', icon: Signal, type: 'number' },
  ],
  LoRaWAN: [
    { key: 'devEui', label: 'DevEUI', placeholder: 'e.g. 70B3D5499A000001', icon: Fingerprint },
    { key: 'frequencyBand', label: 'Frequency Band', placeholder: 'e.g. EU868, US915, AS923', icon: Radio },
    { key: 'signal', label: 'Signal Strength (%)', placeholder: '0–100 (RSSI)', icon: Signal, type: 'number' },
  ],
  'LoRaWAN + LTE': [
    { key: 'devEui', label: 'DevEUI', placeholder: 'e.g. 70B3D5499A000001', icon: Fingerprint },
    { key: 'frequencyBand', label: 'Frequency Band / Region', placeholder: 'e.g. AS923, EU868, US915', icon: Radio },
    { key: 'imei', label: 'LTE Modem IMEI', placeholder: 'e.g. 865847053040323', icon: Smartphone },
    { key: 'simIccid', label: 'SIM ICCID', placeholder: 'e.g. 89852090163181674197', icon: Hash },
    { key: 'apn', label: 'APN', placeholder: 'e.g. internet.provider.com', icon: Globe },
    { key: 'ipAddress', label: 'Carrier IP Address', placeholder: 'Leave blank if dynamic', icon: Globe },
    { key: 'macAddress', label: 'WiFi / Ethernet MAC', placeholder: 'e.g. 24:E1:24:F5:7D:DD', icon: Fingerprint },
    { key: 'signal', label: 'LTE Signal (%)', placeholder: '0–100 (or use dBm converter)', icon: Signal, type: 'number' },
  ],
  BLE: [
    { key: 'macAddress', label: 'BLE Address', placeholder: 'AA:BB:CC:DD:EE:FF', icon: Fingerprint },
    { key: 'signal', label: 'Signal Strength (%)', placeholder: '0–100', icon: Signal, type: 'number' },
  ],
  'BLE+Zigbee': [
    { key: 'macAddress', label: 'BLE Address', placeholder: 'AA:BB:CC:DD:EE:FF', icon: Fingerprint },
    { key: 'panId', label: 'Zigbee PAN ID', placeholder: 'e.g. 0x1A2B', icon: Radio },
    { key: 'channel', label: 'Channel (11–26)', placeholder: 'e.g. 15', icon: Radio },
    { key: 'signal', label: 'Signal Strength (%)', placeholder: '0–100', icon: Signal, type: 'number' },
  ],
};

/** Get the protocol-specific detail info cards for the expanded panel */
function getProtocolInfoCards(gw: Gateway) {
  const base: Array<{ label: string; value: string; icon: React.ComponentType<any> }> = [];
  const p = gw.protocol;

  if (p === 'WiFi') {
    if (gw.macAddress) base.push({ label: 'MAC Address', value: gw.macAddress, icon: Fingerprint });
    if (gw.ipAddress) base.push({ label: 'IP Address', value: gw.ipAddress, icon: Globe });
    if (gw.ssid) base.push({ label: 'SSID', value: gw.ssid, icon: Wifi });
  } else if (p === 'Ethernet') {
    if (gw.macAddress) base.push({ label: 'MAC Address', value: gw.macAddress, icon: Fingerprint });
    if (gw.ipAddress) base.push({ label: 'IP Address', value: gw.ipAddress, icon: Globe });
  } else if (p === 'LTE' || p === 'Cellular') {
    if (gw.imei) base.push({ label: 'IMEI', value: gw.imei, icon: Smartphone });
    if (gw.simIccid) base.push({ label: 'SIM ICCID', value: gw.simIccid, icon: Hash });
    if (gw.apn) base.push({ label: 'APN', value: gw.apn, icon: Globe });
    if (gw.ipAddress) base.push({ label: 'IP Address', value: gw.ipAddress, icon: Globe });
  } else if (p === 'Zigbee') {
    if (gw.panId) base.push({ label: 'PAN ID', value: gw.panId, icon: Radio });
    if (gw.channel) base.push({ label: 'Channel', value: gw.channel, icon: Radio });
  } else if (p === 'LoRaWAN') {
    if (gw.devEui) base.push({ label: 'DevEUI', value: gw.devEui, icon: Fingerprint });
    if (gw.frequencyBand) base.push({ label: 'Frequency', value: gw.frequencyBand, icon: Radio });
  } else if (p === 'LoRaWAN + LTE') {
    // LoRaWAN identifiers
    if (gw.devEui) base.push({ label: 'DevEUI', value: gw.devEui, icon: Fingerprint });
    if (gw.frequencyBand) base.push({ label: 'LoRa Region', value: gw.frequencyBand, icon: Radio });
    // LTE backhaul identifiers
    if (gw.imei) base.push({ label: 'LTE IMEI', value: gw.imei, icon: Smartphone });
    if (gw.simIccid) base.push({ label: 'SIM ICCID', value: gw.simIccid, icon: Hash });
    if (gw.apn) base.push({ label: 'APN', value: gw.apn, icon: Globe });
    if (gw.ipAddress) base.push({ label: 'Carrier IP', value: gw.ipAddress, icon: Globe });
    if (gw.macAddress) base.push({ label: 'MAC', value: gw.macAddress, icon: Fingerprint });
    // Show signal in dBm alongside percentage
    if (gw.signal !== undefined) {
      const dbmValue = percentToDbm(gw.signal);
      base.push({ label: 'LTE Signal', value: `${gw.signal}% (${dbmValue} dBm)`, icon: Signal });
    }
  } else if (p === 'BLE') {
    if (gw.macAddress) base.push({ label: 'BLE Address', value: gw.macAddress, icon: Fingerprint });
  } else if (p === 'BLE+Zigbee') {
    if (gw.macAddress) base.push({ label: 'BLE Address', value: gw.macAddress, icon: Fingerprint });
    if (gw.panId) base.push({ label: 'PAN ID', value: gw.panId, icon: Radio });
    if (gw.channel) base.push({ label: 'Channel', value: gw.channel, icon: Radio });
  } else {
    // Fallback: show whatever identifiers exist
    if (gw.ipAddress) base.push({ label: 'IP Address', value: gw.ipAddress, icon: Globe });
    if (gw.macAddress) base.push({ label: 'MAC Address', value: gw.macAddress, icon: Fingerprint });
  }

  // Always add firmware + last seen
  base.push({ label: 'Firmware', value: gw.firmware || '—', icon: HardDrive });
  base.push({ label: 'Last Seen', value: formatTimeSince(gw.lastSeen), icon: Clock });

  return base;
}

/** Inline dBm/ASU → percentage converter widget for cellular signal input */
function DbmConverterWidget({ onApply }: { onApply: (percent: number) => void }) {
  const [mode, setMode] = useState<'dBm' | 'ASU'>('dBm');
  const [inputVal, setInputVal] = useState('');

  const converted = (() => {
    const n = parseFloat(inputVal);
    if (isNaN(n)) return null;
    if (mode === 'dBm') {
      if (n > 0 || n < -120) return null;
      return dBmToPercent(n);
    }
    // ASU mode (0–31 for LTE)
    if (n < 0 || n > 31) return null;
    return asuToPercent(n);
  })();

  const dbmDisplay = (() => {
    const n = parseFloat(inputVal);
    if (isNaN(n)) return null;
    if (mode === 'dBm') return n;
    if (n < 0 || n > 31) return null;
    return asuToDbm(n);
  })();

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/80 px-4 py-3">
      <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
        <Signal className="h-3 w-3" />
        Signal Converter
      </p>
      <div className="flex items-end gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-1.5 mb-1.5">
            <button
              type="button"
              onClick={() => { setMode('dBm'); setInputVal(''); }}
              className={clsx(
                "rounded px-2 py-0.5 text-[10px] font-semibold transition-all",
                mode === 'dBm' ? "bg-blue-600 text-white" : "bg-slate-200 text-slate-500 hover:bg-slate-300"
              )}
            >
              dBm
            </button>
            <button
              type="button"
              onClick={() => { setMode('ASU'); setInputVal(''); }}
              className={clsx(
                "rounded px-2 py-0.5 text-[10px] font-semibold transition-all",
                mode === 'ASU' ? "bg-blue-600 text-white" : "bg-slate-200 text-slate-500 hover:bg-slate-300"
              )}
            >
              ASU
            </button>
          </div>
          <Input
            type="number"
            value={inputVal}
            onChange={e => setInputVal(e.target.value)}
            placeholder={mode === 'dBm' ? 'e.g. -63' : 'e.g. 25 (0–31)'}
            className="h-8 text-sm"
          />
        </div>
        <div className="text-center min-w-[60px]">
          {converted !== null ? (
            <>
              <p className="text-lg font-bold text-slate-900">{converted}%</p>
              {dbmDisplay !== null && mode === 'ASU' && (
                <p className="text-[10px] text-slate-400">{dbmDisplay} dBm</p>
              )}
            </>
          ) : (
            <p className="text-sm text-slate-300 font-medium">—</p>
          )}
        </div>
        <button
          type="button"
          onClick={() => converted !== null && onApply(converted)}
          disabled={converted === null}
          className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all shrink-0"
        >
          Apply
        </button>
      </div>
      <p className="text-[10px] text-slate-400 mt-1.5">
        Formula: % = 2 × (dBm + 100). Example: -63 dBm → 74%, -80 dBm → 40%
      </p>
    </div>
  );
}

function AddGatewayDialog({ properties, onSuccess }: { properties: Property[]; onSuccess: () => void }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const [name, setName] = useState('');
  const [model, setModel] = useState('');
  const [customModel, setCustomModel] = useState('');
  const [protocol, setProtocol] = useState('');
  const [property, setProperty] = useState('');
  const [location, setLocation] = useState('');
  const [firmware, setFirmware] = useState('');
  const [protocolData, setProtocolData] = useState<Record<string, string>>({});

  const currentFields = protocol ? (PROTOCOL_FIELDS[protocol] || []) : [];

  const updateField = (key: string, value: string) => {
    setProtocolData(prev => ({ ...prev, [key]: value }));
  };

  const resetForm = () => {
    setName(''); setModel(''); setCustomModel(''); setProtocol('');
    setProperty(''); setLocation(''); setFirmware('');
    setProtocolData({});
  };

  const handleProtocolChange = (val: string) => {
    setProtocol(val);
    setProtocolData({}); // Reset protocol-specific fields when switching
  };

  const handleSubmit = async () => {
    if (!name.trim() || !protocol) {
      toast.error('Gateway name and protocol are required.');
      return;
    }

    const finalModel = model === 'Custom' ? (customModel.trim() || 'Custom Gateway') : (model || 'FioGate Lite 200');
    const signalRaw = protocolData.signal;
    const signalValue = signalRaw ? Math.min(100, Math.max(0, parseInt(signalRaw, 10) || 80)) : undefined;

    const payload: any = {
      name: name.trim(),
      model: finalModel,
      protocol,
      property: property || 'Unassigned',
      location: location.trim() || 'Not specified',
      firmware: firmware.trim() || undefined,
      signal: signalValue,
    };

    // Add protocol-specific fields (skip 'signal' as it's handled above)
    for (const field of currentFields) {
      if (field.key === 'signal') continue;
      const val = protocolData[field.key]?.trim();
      if (val) payload[field.key] = val;
    }

    setLoading(true);
    try {
      await api.addGateway(payload);
      toast.success(`Gateway "${name}" added successfully.`);
      setOpen(false);
      resetForm();
      onSuccess();
    } catch (err: any) {
      console.error('Failed to add gateway:', err);
      toast.error(err.message || 'Failed to add gateway');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 shadow-sm transition-all shadow-blue-200">
          <Plus className="h-4 w-4" />
          Add Gateway
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Register New Gateway</DialogTitle>
          <DialogDescription>
            Add a new gateway to your network and assign it to a property.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Row 1: Name + Protocol */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Gateway Name *</Label>
              <Input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Lobby Gateway"
              />
            </div>
            <div className="space-y-2">
              <Label>Protocol *</Label>
              <Select value={protocol} onValueChange={handleProtocolChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Select protocol" />
                </SelectTrigger>
                <SelectContent>
                  {GATEWAY_PROTOCOLS.map(p => (
                    <SelectItem key={p} value={p}>{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Row 2: Model + Firmware */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Model</Label>
              <Select value={model} onValueChange={setModel}>
                <SelectTrigger>
                  <SelectValue placeholder="Select model" />
                </SelectTrigger>
                <SelectContent>
                  {GATEWAY_MODELS.map(m => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {model === 'Custom' && (
                <Input
                  value={customModel}
                  onChange={e => setCustomModel(e.target.value)}
                  placeholder="e.g. EC25EUXGAR08A08M1G"
                  className="mt-1"
                />
              )}
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <HardDrive className="h-3.5 w-3.5 text-slate-400" />
                Firmware Version
              </Label>
              <Input
                value={firmware}
                onChange={e => setFirmware(e.target.value)}
                placeholder="e.g. v3.2.1"
              />
            </div>
          </div>

          {/* Protocol-specific fields — dynamic section */}
          {protocol && currentFields.length > 0 && (
            <>
              <div className="flex items-center gap-2 pt-1">
                <div className="h-px flex-1 bg-slate-200" />
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">{protocol} Configuration</span>
                <div className="h-px flex-1 bg-slate-200" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {currentFields.map(field => (
                  <div key={field.key} className="space-y-2">
                    <Label className="flex items-center gap-1.5">
                      <field.icon className="h-3.5 w-3.5 text-slate-400" />
                      {field.label}
                    </Label>
                    <Input
                      type={field.type === 'number' ? 'number' : 'text'}
                      min={field.type === 'number' ? 0 : undefined}
                      max={field.type === 'number' ? 100 : undefined}
                      value={protocolData[field.key] || ''}
                      onChange={e => updateField(field.key, e.target.value)}
                      placeholder={field.placeholder}
                    />
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Row: Property + Location */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <Building2 className="h-3.5 w-3.5 text-slate-400" />
                Assign to Property
              </Label>
              <Select value={property} onValueChange={setProperty}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a property" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Unassigned">Unassigned</SelectItem>
                  {properties.map(p => (
                    <SelectItem key={p.id} value={p.name}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Physical Location</Label>
              <Input
                value={location}
                onChange={e => setLocation(e.target.value)}
                placeholder="e.g. Server Room, Floor 1"
              />
            </div>
          </div>

          {/* Protocol-specific hints */}
          {(protocol === 'LTE' || protocol === 'Cellular') && (
            <div className="rounded-lg border border-blue-100 bg-blue-50/50 px-4 py-3">
              <p className="text-xs font-semibold text-blue-800 mb-1">Cellular Gateway Setup</p>
              <p className="text-[11px] text-blue-700 leading-relaxed">
                After registering, configure your gateway to send a periodic heartbeat
                (every 2–4 min) to <code className="bg-blue-100 px-1 rounded text-[10px]">POST /gateway-heartbeat</code> with
                your gateway ID to keep its status live. See the expanded panel for the full API reference.
              </p>
            </div>
          )}
          {protocol === 'Ethernet' && (
            <div className="rounded-lg border border-slate-100 bg-slate-50/50 px-4 py-3">
              <p className="text-xs font-semibold text-slate-700 mb-1">Wired Connection</p>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Ethernet gateways have no signal variability — signal strength is always reported as 100% while online.
              </p>
            </div>
          )}
          {protocol === 'LoRaWAN' && (
            <div className="rounded-lg border border-sky-100 bg-sky-50/50 px-4 py-3">
              <p className="text-xs font-semibold text-sky-800 mb-1">LoRaWAN Gateway</p>
              <p className="text-[11px] text-sky-700 leading-relaxed">
                The DevEUI uniquely identifies this gateway on the LoRa network server. Select the correct frequency band for your region.
              </p>
            </div>
          )}
          {protocol === 'LoRaWAN + LTE' && (
            <div className="rounded-lg border border-violet-100 bg-violet-50/50 px-4 py-3">
              <p className="text-xs font-semibold text-violet-800 mb-1">LoRaWAN Gateway with LTE Backhaul</p>
              <p className="text-[11px] text-violet-700 leading-relaxed">
                This gateway communicates with IoT sensors via <strong>LoRaWAN</strong> and reaches the cloud via <strong>LTE cellular</strong>.
                Common examples: Milesight UG65/UG67, Kerlink iStation, RAK7289.
                Configure heartbeat POST requests over the LTE connection to keep the status live.
              </p>
            </div>
          )}

          {/* dBm / ASU → % converter for cellular protocols */}
          {(protocol === 'LTE' || protocol === 'Cellular' || protocol === 'LoRaWAN + LTE') && (
            <DbmConverterWidget onApply={(pct) => updateField('signal', String(pct))} />
          )}

          {/* No protocol selected prompt */}
          {!protocol && (
            <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/30 px-4 py-5 text-center">
              <Radio className="h-5 w-5 text-slate-300 mx-auto mb-1.5" />
              <p className="text-xs text-slate-400">Select a protocol to see its configuration fields</p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={loading || !name.trim() || !protocol}>
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Registering...
              </>
            ) : (
              <>
                <Plus className="h-4 w-4 mr-2" />
                Register Gateway
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type FilterType = 'all' | 'online' | 'offline' | 'warning';

const POLL_INTERVAL = 30000; // 30 seconds

function GatewaysInner() {
  const { isAdmin } = useAuth();
  const [gateways, setGateways] = useState<Gateway[]>([]);
  const [allDevices, setAllDevices] = useState<Device[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedGateway, setExpandedGateway] = useState<string | null>(null);
  const [gatewayToDelete, setGatewayToDelete] = useState<Gateway | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [livePolling, setLivePolling] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [testingHeartbeat, setTestingHeartbeat] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      else setRefreshing(true);
      const [gwData, propData, devData] = await Promise.all([
        api.getGateways(),
        api.getProperties(),
        api.getDevices(),
      ]);
      setGateways(gwData);
      setProperties(propData);
      setAllDevices(devData);
      setLastRefreshed(new Date());
    } catch (err) {
      console.debug('Failed to fetch gateways:', err);
      if (!silent) toast.error('Failed to load gateways');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto-polling
  useEffect(() => {
    if (livePolling) {
      pollRef.current = setInterval(() => fetchData(true), POLL_INTERVAL);
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [livePolling, fetchData]);

  const handleDelete = async (gw: Gateway) => {
    try {
      await api.deleteGateway(gw.id);
      setGateways(prev => prev.filter(g => g.id !== gw.id));
      toast.success(`Gateway "${gw.name}" deleted`);
    } catch (err) {
      console.error('Failed to delete gateway:', err);
      toast.error('Failed to delete gateway');
    }
  };

  const handleReassignProperty = async (gw: Gateway, newProperty: string) => {
    try {
      await api.updateGateway(gw.id, { property: newProperty } as any);
      setGateways(prev => prev.map(g => g.id === gw.id ? { ...g, property: newProperty } : g));
      toast.success(`Gateway "${gw.name}" reassigned to ${newProperty}`);
    } catch (err) {
      console.error('Failed to reassign gateway:', err);
      toast.error('Failed to reassign gateway');
    }
  };

  const handleAssignDevice = useCallback(async (gatewayId: string, item: DragItem) => {
    try {
      await api.assignDevicesToGateway(gatewayId, [item.id]);
      toast.success(`"${item.name}" assigned to gateway`);
      await fetchData();
    } catch (err) {
      console.error('Failed to assign device:', err);
      toast.error('Failed to assign device');
    }
  }, [fetchData]);

  const handleUnassignDevice = useCallback(async (deviceId: string) => {
    try {
      await api.unassignDeviceFromGateway(deviceId);
      toast.success('Device unassigned from gateway');
      await fetchData();
    } catch (err) {
      console.error('Failed to unassign device:', err);
      toast.error('Failed to unassign device');
    }
  }, [fetchData]);

  // Get available devices for a specific gateway (same property, not assigned to any gateway)
  const getAvailableDevices = useCallback((gw: Gateway): Device[] => {
    const assignedIds = new Set(gateways.flatMap(g => g.devices.map(d => d.id)));
    return allDevices.filter(d => {
      if (assignedIds.has(d.id)) return false;
      // Show devices from same property or unassigned devices
      if (gw.property === 'Unassigned') return !d.gateway || d.gateway === 'Unassigned';
      return d.building === gw.property || d.building === 'Unassigned' || !d.gateway || d.gateway === 'Unassigned';
    });
  }, [allDevices, gateways]);

  const stats = useMemo(() => {
    const online = gateways.filter(g => g.status === 'online').length;
    const warning = gateways.filter(g => g.status === 'warning').length;
    const offline = gateways.filter(g => g.status === 'offline').length;
    const totalDevices = gateways.reduce((sum, g) => sum + g.connectedDevices, 0);
    const avgSignal = gateways.length > 0 ? Math.round(gateways.filter(g => g.status !== 'offline').reduce((sum, g) => sum + g.signal, 0) / Math.max(1, gateways.filter(g => g.status !== 'offline').length)) : 0;
    const protocols = [...new Set(gateways.map(g => g.protocol))];
    return { total: gateways.length, online, warning, offline, totalDevices, avgSignal, protocols };
  }, [gateways]);

  const filtered = useMemo(() => {
    let result = gateways;
    if (filter !== 'all') result = result.filter(g => g.status === filter);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(g =>
        g.name.toLowerCase().includes(q) ||
        g.property.toLowerCase().includes(q) ||
        g.protocol.toLowerCase().includes(q) ||
        g.ipAddress.includes(q) ||
        g.model.toLowerCase().includes(q)
      );
    }
    return result.sort((a, b) => {
      const order = { online: 0, warning: 1, offline: 2 };
      const diff = (order[a.status] ?? 3) - (order[b.status] ?? 3);
      if (diff !== 0) return diff;
      return b.connectedDevices - a.connectedDevices;
    });
  }, [gateways, filter, searchQuery]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Gateways</h2>
          <div className="flex flex-wrap items-center gap-3 mt-0.5">
            <p className="text-sm sm:text-base text-slate-500">Manage network gateways and device connections.</p>
            {/* Live status indicator */}
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => setLivePolling(prev => !prev)}
                className={clsx(
                  "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-all border",
                  livePolling
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
                    : "bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100"
                )}
                title={livePolling ? 'Auto-refresh every 30s — click to pause' : 'Auto-refresh paused — click to resume'}
              >
                {livePolling ? (
                  <>
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                    </span>
                    LIVE
                  </>
                ) : (
                  <>
                    <Pause className="h-3 w-3" />
                    Paused
                  </>
                )}
              </button>
              <button
                onClick={() => fetchData(true)}
                disabled={refreshing}
                className="rounded-lg p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all disabled:opacity-50"
                title="Refresh now"
              >
                <RefreshCcw className={clsx("h-4 w-4", refreshing && "animate-spin")} />
              </button>
              {lastRefreshed && (
                <span className="text-[10px] text-slate-400 hidden sm:inline">
                  Updated {lastRefreshed.toLocaleTimeString('en-GB', { timeZone: 'Asia/Hong_Kong' })}
                </span>
              )}
            </div>
          </div>
        </div>
        {isAdmin && <AddGatewayDialog properties={properties} onSuccess={() => fetchData()} />}
      </div>

      {/* Overview Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Total Gateways', value: stats.total, sub: `${stats.online} online`, icon: Router, iconBg: 'bg-blue-100', iconColor: 'text-blue-600' },
          { label: 'Connected Devices', value: stats.totalDevices, sub: 'Across all gateways', icon: Cpu, iconBg: 'bg-emerald-100', iconColor: 'text-emerald-600' },
          { label: 'Avg. Signal', value: `${stats.avgSignal}%`, sub: stats.avgSignal >= 70 ? 'Strong' : stats.avgSignal >= 50 ? 'Moderate' : 'Weak', icon: Signal, iconBg: 'bg-purple-100', iconColor: 'text-purple-600' },
          { label: 'Protocols', value: stats.protocols.length, sub: stats.protocols.join(', ') || '—', icon: Globe, iconBg: 'bg-amber-100', iconColor: 'text-amber-600' },
        ].map((s, i) => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: i * 0.05 }}
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <div className="flex items-start gap-3">
              <div className={clsx("rounded-xl p-2.5", s.iconBg)}>
                <s.icon className={clsx("h-5 w-5", s.iconColor)} />
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500">{s.label}</p>
                <p className="text-xl font-bold text-slate-900 mt-0.5">{loading ? '—' : s.value}</p>
                <p className="text-xs text-slate-400 mt-0.5 truncate max-w-[120px] sm:max-w-[140px]">{s.sub}</p>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Network Topology Visual */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.15 }}
        className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-slate-900">Network Topology</h3>
          <div className="flex items-center gap-3 text-xs text-slate-400">
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500" /> Online</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-500" /> Warning</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-slate-400" /> Offline</span>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
          </div>
        ) : (
          <div className="flex flex-wrap gap-4 justify-center py-2">
            <div className="flex flex-col items-center">
              <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white shadow-lg shadow-blue-500/25 mb-2">
                <Zap className="h-7 w-7" />
              </div>
              <span className="text-[10px] font-semibold text-slate-600">FioTec Cloud</span>
            </div>

            <div className="flex items-center px-3">
              <div className="w-8 h-px bg-gradient-to-r from-blue-300 to-slate-200" />
              <div className="flex flex-col gap-1">
                {gateways.slice(0, 5).map((_, i) => (
                  <div key={i} className="w-4 h-px bg-slate-200" />
                ))}
              </div>
            </div>

            <div className="flex flex-wrap gap-3 max-w-3xl">
              {gateways.map((gw) => (
                <button
                  key={gw.id}
                  onClick={() => setExpandedGateway(expandedGateway === gw.id ? null : gw.id)}
                  className={clsx(
                    "flex items-center gap-2.5 rounded-xl border px-3.5 py-2.5 text-left transition-all hover:shadow-md cursor-pointer",
                    expandedGateway === gw.id ? 'ring-2 ring-blue-500 border-blue-200 bg-blue-50/50' :
                    gw.status === 'online' ? 'border-emerald-100 bg-white hover:border-emerald-200' :
                    gw.status === 'warning' ? 'border-amber-100 bg-amber-50/30 hover:border-amber-200' :
                    gw.status === 'offline' ? 'border-slate-200 bg-slate-50/30 hover:border-slate-300' :
                    'border-red-100 bg-red-50/30 hover:border-red-200'
                  )}
                >
                  <div className={clsx(
                    "rounded-lg p-1.5",
                    gw.status === 'online' ? 'bg-emerald-100' :
                    gw.status === 'warning' ? 'bg-amber-100' :
                    gw.status === 'offline' ? 'bg-slate-100' :
                    'bg-red-100'
                  )}>
                    <Router className={clsx(
                      "h-4 w-4",
                      gw.status === 'online' ? 'text-emerald-600' :
                      gw.status === 'warning' ? 'text-amber-600' :
                      gw.status === 'offline' ? 'text-slate-500' :
                      'text-red-600'
                    )} />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-800 leading-tight truncate max-w-[100px]">{gw.name}</p>
                    <p className="text-[10px] text-slate-400">{gw.connectedDevices} device{gw.connectedDevices !== 1 ? 's' : ''}</p>
                  </div>
                  <SignalStrength signal={gw.signal} size="sm" />
                </button>
              ))}
            </div>
          </div>
        )}
      </motion.div>

      {/* Webhook Integration */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.18 }}
      >
        <WebhookConfigPanel />
      </motion.div>

      {/* Gateway List */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.2 }}
        className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden"
      >
        {/* Header bar */}
        <div className="border-b border-slate-100 px-4 sm:px-6 py-3 sm:py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3 w-full sm:w-auto overflow-x-auto">
            <h3 className="font-semibold text-slate-900 text-sm shrink-0">Gateway Registry</h3>
            <div className="flex rounded-lg bg-slate-100 p-0.5 shrink-0">
              {([['all', 'All'], ['online', 'Online'], ['warning', 'Warning'], ['offline', 'Offline']] as const).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setFilter(key)}
                  className={clsx(
                    "rounded-md px-2.5 py-1 text-xs font-medium transition-all",
                    filter === key
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-500 hover:text-slate-900"
                  )}
                >
                  {label}
                  {key === 'warning' && stats.warning > 0 && (
                    <span className="ml-1 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-amber-500 px-1 text-xs font-bold text-white">
                      {stats.warning}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <div className="relative flex-1 sm:flex-initial">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search gateways..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-9 w-full sm:w-56 rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-4 text-sm outline-none focus:border-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <Router className="h-10 w-10 mb-3 text-slate-300" />
            <p className="text-sm font-medium text-slate-500">No gateways found</p>
            <p className="text-xs text-slate-400 mt-1">
              {searchQuery ? 'Try a different search' : 'No gateways match the selected filter'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filtered.map((gw) => {
              const availableDevices = expandedGateway === gw.id ? getAvailableDevices(gw) : [];
              return (
                <div key={gw.id}>
                  {/* Gateway Row */}
                  <div
                    className={clsx(
                      "px-4 sm:px-6 py-4 cursor-pointer hover:bg-slate-50/80 transition-colors",
                      gw.status === 'warning' && 'bg-amber-50/20',
                      gw.status === 'offline' && 'bg-slate-50/40',
                      expandedGateway === gw.id && 'bg-blue-50/30'
                    )}
                    onClick={() => setExpandedGateway(expandedGateway === gw.id ? null : gw.id)}
                  >
                    <div className="flex items-center gap-4">
                      <div className="relative shrink-0">
                        <div className={clsx(
                          "h-11 w-11 rounded-xl flex items-center justify-center",
                          gw.status === 'online' ? 'bg-emerald-100' :
                          gw.status === 'warning' ? 'bg-amber-100' :
                          gw.status === 'offline' ? 'bg-slate-100' :
                          'bg-red-100'
                        )}>
                          <Router className={clsx(
                            "h-5 w-5",
                            gw.status === 'online' ? 'text-emerald-600' :
                            gw.status === 'warning' ? 'text-amber-600' :
                            gw.status === 'offline' ? 'text-slate-500' :
                            'text-red-600'
                          )} />
                        </div>
                        <span className={clsx(
                          "absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white",
                          gw.status === 'online' ? 'bg-emerald-500' :
                          gw.status === 'warning' ? 'bg-amber-500 animate-pulse' :
                          gw.status === 'offline' ? 'bg-slate-400' :
                          'bg-red-500'
                        )} />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <h4 className="font-semibold text-slate-900 text-sm truncate">{gw.name}</h4>
                          <ProtocolBadge protocol={gw.protocol} />
                        </div>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-500">
                          <span className="flex items-center gap-1"><Building2 className="h-3 w-3" />{gw.property}</span>
                          <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{gw.location}</span>
                          <span className="flex items-center gap-1"><HardDrive className="h-3 w-3" />{gw.model}</span>
                        </div>
                      </div>

                      <div className="hidden md:flex items-center gap-6">
                        <div className="text-center">
                          <p className="text-lg font-bold text-slate-900">{gw.connectedDevices}</p>
                          <p className="text-[10px] text-slate-400">Devices</p>
                        </div>
                        <div className="text-center">
                          <SignalStrength signal={gw.signal} />
                          <p className="text-[10px] text-slate-400 mt-1">{gw.signal}%</p>
                        </div>
                        <div className="text-center">
                          <p className="text-xs font-medium text-slate-700">{gw.uptime}</p>
                          <p className="text-[10px] text-slate-400">Uptime</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        {isAdmin && (
                          <Popover>
                            <PopoverTrigger asChild>
                              <button
                                onClick={(e) => e.stopPropagation()}
                                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                              >
                                <MoreVertical className="h-4 w-4" />
                              </button>
                            </PopoverTrigger>
                            <PopoverContent className="w-52 p-1" align="end">

                              {/* Property reassignment submenu */}
                              <div className="my-1 border-t border-slate-100" />
                              <div className="px-3 py-1.5">
                                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Assign to Property</p>
                                <div className="max-h-32 overflow-y-auto space-y-0.5">
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleReassignProperty(gw, 'Unassigned'); }}
                                    className={clsx(
                                      "w-full text-left rounded px-2 py-1 text-xs transition-colors",
                                      gw.property === 'Unassigned' ? "bg-blue-50 text-blue-700 font-medium" : "text-slate-600 hover:bg-slate-50"
                                    )}
                                  >
                                    Unassigned
                                  </button>
                                  {properties.map(p =>
                                    <button
                                      key={p.id}
                                      onClick={(e) => { e.stopPropagation(); handleReassignProperty(gw, p.name); }}
                                      className={clsx(
                                        "w-full text-left rounded px-2 py-1 text-xs transition-colors truncate",
                                        gw.property === p.name ? "bg-blue-50 text-blue-700 font-medium" : "text-slate-600 hover:bg-slate-50"
                                      )}
                                    >
                                      {p.name}
                                    </button>
                                  )}
                                </div>
                              </div>

                              <div className="my-1 border-t border-slate-100" />
                              <button
                                onClick={(e) => { e.stopPropagation(); setGatewayToDelete(gw); }}
                                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                              >
                                <Trash2 className="h-3.5 w-3.5" /> Remove
                              </button>
                            </PopoverContent>
                          </Popover>
                        )}
                        {expandedGateway === gw.id ? (
                          <ChevronUp className="h-4 w-4 text-slate-400" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-slate-400" />
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Expanded Detail Panel with DnD */}
                  <AnimatePresence>
                    {expandedGateway === gw.id && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.25 }}
                        className="overflow-hidden"
                      >
                        <div className="px-4 sm:px-6 pb-5 pt-1 bg-slate-50/50 border-t border-slate-100">
                          {/* Live Status Diagnostics */}
                          <div className="rounded-lg bg-white border border-slate-100 p-4 mb-4">
                            <div className="flex items-center justify-between mb-3">
                              <h5 className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                                <Activity className="h-3.5 w-3.5 text-blue-500" />
                                Status Diagnostics
                              </h5>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setTestingHeartbeat(gw.id);
                                  api.gatewayHeartbeat(gw.id, { signal: gw.signal || 80 })
                                    .then((res) => {
                                      toast.success(`Heartbeat sent — status: ${res.status}`);
                                      fetchData(true);
                                    })
                                    .catch((err: any) => {
                                      console.error('Test heartbeat failed:', err);
                                      toast.error('Heartbeat failed: ' + (err.message || 'Unknown error'));
                                    })
                                    .finally(() => setTestingHeartbeat(null));
                                }}
                                disabled={testingHeartbeat === gw.id}
                                className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-all"
                              >
                                {testingHeartbeat === gw.id ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <Activity className="h-3 w-3" />
                                )}
                                Send Test Heartbeat
                              </button>
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                              <div className="text-center">
                                <div className={clsx(
                                  "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold border mb-1",
                                  gw.status === 'online' ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                                  gw.status === 'warning' ? "bg-amber-50 text-amber-700 border-amber-200" :
                                  "bg-slate-50 text-slate-500 border-slate-200"
                                )}>
                                  <StatusDot status={gw.status} />
                                  {gw.status === 'online' ? 'Online' : gw.status === 'warning' ? 'Warning' : 'Offline'}
                                </div>
                                <p className="text-[10px] text-slate-400">Derived Status</p>
                              </div>
                              <div className="text-center">
                                <p className="text-sm font-bold text-slate-900 font-mono">{gw.signal}%</p>
                                <div className="flex items-center justify-center gap-1 mt-0.5">
                                  <SignalStrength signal={gw.signal} size="sm" />
                                </div>
                                <p className="text-[10px] text-slate-400 mt-0.5">Signal</p>
                              </div>
                              <div className="text-center">
                                <p className="text-sm font-bold text-slate-900">{gw.uptime || '—'}</p>
                                <p className="text-[10px] text-slate-400">Uptime</p>
                              </div>
                              <div className="text-center">
                                <p className="text-sm font-bold text-slate-900">{formatTimeSince(gw.lastSeen)}</p>
                                <p className="text-[10px] text-slate-400">Last Heartbeat</p>
                              </div>
                            </div>
                            <div className="mt-3 pt-3 border-t border-slate-100">
                              <p className="text-[10px] text-slate-400 leading-relaxed">
                                <span className="font-semibold">How status works:</span>{' '}
                                <span className="inline-flex items-center gap-0.5"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Online</span> = heartbeat &lt;5 min{' · '}
                                <span className="inline-flex items-center gap-0.5"><span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> Warning</span> = 5–15 min ago{' · '}
                                <span className="inline-flex items-center gap-0.5"><span className="h-1.5 w-1.5 rounded-full bg-slate-400" /> Offline</span> = &gt;15 min ago
                              </p>
                            </div>
                          </div>

                          {/* Gateway Info Cards with ID */}
                          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3 mb-4">
                            {/* Gateway ID — clickable to copy */}
                            <div
                              className="rounded-lg bg-white border border-blue-100 px-3 py-2.5 cursor-pointer hover:bg-blue-50/30 transition-colors"
                              onClick={(e) => {
                                e.stopPropagation();
                                copyToClipboard(gw.id).then(() => {
                                  setCopiedId(gw.id);
                                  toast.success('Gateway ID copied!');
                                  setTimeout(() => setCopiedId(null), 2000);
                                });
                              }}
                              title="Click to copy Gateway ID"
                            >
                              <div className="flex items-center gap-1.5 mb-1">
                                <Router className="h-3 w-3 text-blue-500" />
                                <span className="text-[10px] font-medium text-blue-500 uppercase tracking-wider">Gateway ID</span>
                              </div>
                              <p className="text-xs font-semibold text-slate-800 font-mono truncate">
                                {copiedId === gw.id ? 'Copied!' : gw.id}
                              </p>
                            </div>
                            {getProtocolInfoCards(gw).map(info => (
                              <div key={info.label} className="rounded-lg bg-white border border-slate-100 px-3 py-2.5">
                                <div className="flex items-center gap-1.5 mb-1">
                                  <info.icon className="h-3 w-3 text-slate-400" />
                                  <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">{info.label}</span>
                                </div>
                                <p className="text-xs font-semibold text-slate-800 font-mono truncate">{info.value || '—'}</p>
                              </div>
                            ))}
                          </div>

                          {/* Connected Devices — Drop Zone */}
                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <h5 className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                                <Cpu className="h-3.5 w-3.5 text-blue-500" />
                                Connected Devices ({gw.connectedDevices})
                              </h5>
                              <div className="flex items-center gap-2 text-[10px] text-slate-400">
                                {gw.onlineDevices > 0 && (
                                  <span className="flex items-center gap-0.5">
                                    <CheckCircle className="h-2.5 w-2.5 text-emerald-500" />
                                    {gw.onlineDevices} online
                                  </span>
                                )}
                                {gw.warningDevices > 0 && (
                                  <span className="flex items-center gap-0.5">
                                    <AlertTriangle className="h-2.5 w-2.5 text-amber-500" />
                                    {gw.warningDevices} warning
                                  </span>
                                )}
                                {gw.offlineDevices > 0 && (
                                  <span className="flex items-center gap-0.5">
                                    <WifiOff className="h-2.5 w-2.5 text-slate-400" />
                                    {gw.offlineDevices} offline
                                  </span>
                                )}
                              </div>
                            </div>

                            <GatewayDropZone
                              gatewayId={gw.id}
                              onDrop={(item) => handleAssignDevice(gw.id, item)}
                            >
                              {gw.devices.length > 0 ? (
                                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                                  {gw.devices.map(d => (
                                    <DraggableDeviceChip
                                      key={d.id}
                                      device={d}
                                      gatewayId={gw.id}
                                      onUnassign={handleUnassignDevice}
                                      canEdit={isAdmin}
                                    />
                                  ))}
                                </div>
                              ) : (
                                <div className="rounded-lg border border-dashed border-slate-200 py-6 text-center text-xs text-slate-400">
                                  <Unplug className="h-5 w-5 mx-auto mb-1.5 text-slate-300" />
                                  No devices connected — drag devices here to assign
                                </div>
                              )}
                            </GatewayDropZone>
                          </div>

                          {/* Available Devices Section — admin only */}
                          {isAdmin && availableDevices.length > 0 && (
                            <div className="mt-4 pt-4 border-t border-slate-200">
                              <h5 className="text-xs font-semibold text-slate-600 mb-2 flex items-center gap-1.5">
                                <Plus className="h-3.5 w-3.5 text-slate-400" />
                                Available Devices ({availableDevices.length})
                                <span className="font-normal text-slate-400 ml-1">— drag to assign</span>
                              </h5>
                              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 max-h-[200px] overflow-y-auto pr-1">
                                {availableDevices.map(d => (
                                  <AvailableDeviceChip key={d.id} device={d} />
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Heartbeat API Reference — collapsible */}
                          <div className="mt-4 pt-4 border-t border-slate-200">
                            <details className="group">
                              <summary className="cursor-pointer text-xs font-semibold text-slate-600 flex items-center gap-1.5 select-none list-none [&::-webkit-details-marker]:hidden">
                                <Globe className="h-3.5 w-3.5 text-slate-400" />
                                Heartbeat API Reference
                                <ChevronDown className="h-3 w-3 text-slate-400 group-open:rotate-180 transition-transform ml-auto" />
                              </summary>
                              <div className="mt-3 space-y-3">
                                <div className="rounded-lg bg-slate-900 text-slate-100 px-4 py-3 overflow-x-auto">
                                  <p className="text-[10px] text-slate-400 mb-2 font-semibold uppercase tracking-wider">cURL Example</p>
                                  <pre className="text-[11px] font-mono leading-relaxed whitespace-pre-wrap break-all">{`curl -X POST \\
  "https://${projectId}.supabase.co/functions/v1/make-server-4916a0b9/gateway-heartbeat" \\
  -H "Authorization: Bearer ${publicAnonKey.slice(0, 20)}..." \\
  -H "x-user-token: <YOUR_JWT>" \\
  -H "Content-Type: application/json" \\
  -d '{"gatewayId":"${gw.id}","signal":80}'`}</pre>
                                </div>
                                <div className="grid grid-cols-2 gap-3 text-[11px]">
                                  <div className="rounded-lg border border-slate-100 bg-white p-3">
                                    <p className="font-semibold text-slate-700 mb-1">Request Fields</p>
                                    <ul className="space-y-0.5 text-slate-500">
                                      <li><code className="text-blue-600 bg-blue-50 px-1 rounded">gatewayId</code> — required</li>
                                      <li><code className="text-slate-600 bg-slate-50 px-1 rounded">signal</code> — 0–100 (optional)</li>
                                      <li><code className="text-slate-600 bg-slate-50 px-1 rounded">firmware</code> — version string</li>
                                      <li><code className="text-slate-600 bg-slate-50 px-1 rounded">ipAddress</code> — current IP</li>
                                    </ul>
                                  </div>
                                  <div className="rounded-lg border border-slate-100 bg-white p-3">
                                    <p className="font-semibold text-slate-700 mb-1">Response</p>
                                    <ul className="space-y-0.5 text-slate-500">
                                      <li><code className="text-emerald-600 bg-emerald-50 px-1 rounded">success</code> — boolean</li>
                                      <li><code className="text-emerald-600 bg-emerald-50 px-1 rounded">status</code> — online/warning/offline</li>
                                      <li><code className="text-emerald-600 bg-emerald-50 px-1 rounded">signal</code> — current signal %</li>
                                      <li><code className="text-emerald-600 bg-emerald-50 px-1 rounded">lastSeen</code> — ISO timestamp</li>
                                    </ul>
                                  </div>
                                </div>
                                <p className="text-[10px] text-slate-400">
                                  Send every 2–4 min to keep status "online". The Gateways page auto-refreshes every 30s when LIVE mode is on.
                                </p>
                              </div>
                            </details>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        )}
      </motion.div>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!gatewayToDelete} onOpenChange={(open) => { if (!open) setGatewayToDelete(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-red-100 flex items-center justify-center shrink-0">
                <Trash2 className="h-4 w-4 text-red-600" />
              </div>
              Delete Gateway
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to remove <span className="font-semibold text-slate-700">"{gatewayToDelete?.name}"</span>? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>

          {gatewayToDelete && gatewayToDelete.connectedDevices > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 flex items-start gap-2.5">
              <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-amber-800">
                  {gatewayToDelete.connectedDevices} connected device{gatewayToDelete.connectedDevices !== 1 ? 's' : ''} will be unassigned
                </p>
                <p className="text-[11px] text-amber-700 mt-0.5">
                  {gatewayToDelete.devices.map(d => d.name).join(', ')}
                </p>
              </div>
            </div>
          )}

          {gatewayToDelete && (
            <div className="rounded-lg border border-slate-100 bg-slate-50 px-4 py-3 grid grid-cols-3 gap-3 text-center">
              <div>
                <p className="text-[10px] text-slate-400 uppercase tracking-wider">Property</p>
                <p className="text-xs font-medium text-slate-700 mt-0.5 truncate">{gatewayToDelete.property}</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-400 uppercase tracking-wider">Protocol</p>
                <p className="text-xs font-medium text-slate-700 mt-0.5">{gatewayToDelete.protocol}</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-400 uppercase tracking-wider">Status</p>
                <p className={clsx(
                  "text-xs font-medium mt-0.5",
                  gatewayToDelete.status === 'online' ? 'text-emerald-700' :
                  gatewayToDelete.status === 'warning' ? 'text-amber-700' :
                  'text-slate-500'
                )}>{gatewayToDelete.status}</p>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setGatewayToDelete(null)} disabled={deleting}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                if (!gatewayToDelete) return;
                setDeleting(true);
                await handleDelete(gatewayToDelete);
                setDeleting(false);
                setGatewayToDelete(null);
              }}
              disabled={deleting}
            >
              {deleting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete Gateway
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function Gateways() {
  return (
    <DndProvider backend={HTML5Backend}>
      <GatewaysInner />
    </DndProvider>
  );
}
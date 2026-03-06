import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { 
  Search, 
  Filter, 
  Download, 
  MoreHorizontal, 
  Battery, 
  BatteryMedium, 
  BatteryLow,
  Wifi,
  WifiOff,
  ChevronDown,
  Building2,
  Check,
  X,
  Edit2,
  Trash2,
  Plus,
  Router,
  MapPin,
  Loader2,
  Pencil
} from 'lucide-react';
import { clsx } from 'clsx';
import { DeviceHistoryChart } from '@/app/components/DeviceHistoryChart';
import { useSearchParams } from 'react-router';
import { Popover, PopoverContent, PopoverTrigger } from '@/app/components/ui/popover';
import { AssignDeviceDialog } from '@/app/components/AssignDeviceDialog';
import { AddDeviceDialog } from '@/app/components/AddDeviceDialog';
import { api } from '@/app/utils/api';
import { useAuth } from '@/app/utils/AuthContext';
import { toast } from 'sonner';

interface Device {
  id: string;
  name: string;
  type: string;
  building: string;
  location: string;
  lastUpdate: string;
  battery: number;
  status: string;
  gateway?: string;
}

interface Property {
  id: string;
  name: string;
}

// ── Inline-editable location cell ────────────────────────
function EditableLocation({ device, onSave, isAdmin }: { device: Device; onSave: () => void; isAdmin: boolean }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(device.location || '');
  const [saving, setSaving] = useState(false);

  if (!isAdmin) return <span>{device.location}</span>;

  const handleSave = async () => {
    const trimmed = value.trim() || 'Not specified';
    if (trimmed === device.location) { setEditing(false); return; }
    setSaving(true);
    try {
      await api.updateDevice(device.id, { location: trimmed });
      onSave();
      setEditing(false);
    } catch (err) {
      console.error('Failed to update location:', err);
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <input
          autoFocus
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') { setValue(device.location || ''); setEditing(false); } }}
          className="h-7 w-36 rounded border border-blue-300 px-2 text-sm outline-none focus:ring-2 focus:ring-blue-100"
          disabled={saving}
          placeholder="e.g. Floor 3, Room B"
        />
        <button onClick={handleSave} disabled={saving} className="p-1 rounded hover:bg-blue-50 text-blue-600">
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
        </button>
        <button onClick={() => { setValue(device.location || ''); setEditing(false); }} disabled={saving} className="p-1 rounded hover:bg-slate-100 text-slate-500">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 group/loc">
      <MapPin className="h-3.5 w-3.5 text-slate-400" />
      <span>{device.location}</span>
      <button
        onClick={() => { setValue(device.location || ''); setEditing(true); }}
        className="opacity-0 group-hover/loc:opacity-100 p-1 hover:bg-slate-200 rounded text-slate-500 hover:text-blue-600 transition-all"
      >
        <Pencil className="h-3 w-3" />
      </button>
    </div>
  );
}

export function Devices() {
  const [selectedDevice, setSelectedDevice] = useState<string | null>(null);
  const [historyPeriod, setHistoryPeriod] = useState<string>('24h');
  const [searchParams] = useSearchParams();
  const { isAdmin } = useAuth();
  
  // Data States
  const [devices, setDevices] = useState<Device[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);

  // Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [buildingFilter, setBuildingFilter] = useState<string>('all');

  const fetchData = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const [devicesData, propertiesData] = await Promise.all([
        api.getDevices(),
        api.getProperties(),
      ]);
      setDevices(devicesData);
      setProperties(propertiesData);
    } catch (error) {
      console.debug("Failed to fetch data", error);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto-refresh every 30s (only when tab is visible)
  useEffect(() => {
    const timer = setInterval(() => {
      if (!document.hidden) fetchData(true);
    }, 30000);
    const onVisible = () => { if (!document.hidden) fetchData(true); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, [fetchData]);

  // Derived Filters
  const filteredDevices = useMemo(() => {
    return devices.filter(device => {
      // Search Filter
      const matchesSearch = 
        device.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        device.location.toLowerCase().includes(searchQuery.toLowerCase()) ||
        device.building.toLowerCase().includes(searchQuery.toLowerCase()) ||
        device.type.toLowerCase().includes(searchQuery.toLowerCase());

      // Status Filter
      const matchesStatus = statusFilter === 'all' || device.status === statusFilter;

      // Type Filter
      const matchesType = typeFilter === 'all' || device.type === typeFilter;

      // Building Filter
      const matchesBuilding = buildingFilter === 'all' || device.building === buildingFilter;

      return matchesSearch && matchesStatus && matchesType && matchesBuilding;
    });
  }, [devices, searchQuery, statusFilter, typeFilter, buildingFilter]);

  const uniqueTypes = Array.from(new Set(devices.map(d => d.type))).sort();
  // Use properties list for filter to ensure consistency, or derived from devices if preferred
  // Using properties list is better for complete list even if no device is assigned yet
  const uniqueBuildings = Array.from(new Set([
    ...properties.map(p => p.name),
    ...devices.map(d => d.building)
  ])).sort().filter(Boolean);

  const clearFilters = () => {
    setSearchQuery('');
    setStatusFilter('all');
    setTypeFilter('all');
    setBuildingFilter('all');
  };

  const activeFilterCount = (statusFilter !== 'all' ? 1 : 0) + (typeFilter !== 'all' ? 1 : 0) + (buildingFilter !== 'all' ? 1 : 0);

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col justify-between gap-3 sm:gap-4 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-2xl sm:text-3xl font-bold text-slate-900">IoT Devices</h2>
          <p className="text-sm sm:text-base text-slate-500">Manage and monitor all connected sensors.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          
          <Popover>
            <PopoverTrigger asChild>
              <button className={clsx(
                "inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium shadow-sm transition-all",
                activeFilterCount > 0 
                  ? "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100" 
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              )}>
                <Filter className="h-4 w-4" />
                Filter
                {activeFilterCount > 0 && (
                  <span className="ml-1 flex h-5 w-5 items-center justify-center rounded-full bg-blue-200 text-xs font-bold text-blue-800">
                    {activeFilterCount}
                  </span>
                )}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-0" align="end">
              <div className="p-4 border-b border-slate-100">
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold text-slate-900">Filter Devices</h4>
                  {(statusFilter !== 'all' || typeFilter !== 'all' || buildingFilter !== 'all') && (
                    <button onClick={clearFilters} className="text-xs text-blue-600 hover:text-blue-800 font-medium">
                      Reset All
                    </button>
                  )}
                </div>
              </div>
              <div className="p-4 space-y-6 max-h-[400px] overflow-y-auto">
                
                {/* Status Filter */}
                <div className="space-y-3">
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Device Status</label>
                  <div className="flex flex-wrap gap-2">
                    {['all', 'online', 'warning', 'offline'].map(status => (
                      <button
                        key={status}
                        onClick={() => setStatusFilter(status)}
                        className={clsx(
                          "px-3 py-1.5 rounded-full text-xs font-medium border transition-all capitalize",
                          statusFilter === status
                            ? "bg-slate-900 text-white border-slate-900"
                            : "bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                        )}
                      >
                        {status}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Building Filter (New) */}
                <div className="space-y-3">
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Property</label>
                  <div className="grid grid-cols-1 gap-2">
                    <button
                        onClick={() => setBuildingFilter('all')}
                        className={clsx(
                          "px-3 py-2 rounded-lg text-xs font-medium border transition-all text-left flex items-center justify-between",
                          buildingFilter === 'all'
                            ? "bg-blue-50 text-blue-700 border-blue-200"
                            : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                        )}
                      >
                        All Properties
                        {buildingFilter === 'all' && <Check className="h-3.5 w-3.5" />}
                    </button>
                    {uniqueBuildings.map(b => (
                      <button
                        key={b}
                        onClick={() => setBuildingFilter(b)}
                        className={clsx(
                          "px-3 py-2 rounded-lg text-xs font-medium border transition-all text-left flex items-center justify-between",
                          buildingFilter === b
                            ? "bg-blue-50 text-blue-700 border-blue-200"
                            : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                        )}
                      >
                        {b}
                        {buildingFilter === b && <Check className="h-3.5 w-3.5" />}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Type Filter */}
                <div className="space-y-3">
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Device Type</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                        onClick={() => setTypeFilter('all')}
                        className={clsx(
                          "px-3 py-2 rounded-lg text-xs font-medium border transition-all text-left",
                          typeFilter === 'all'
                            ? "bg-blue-50 text-blue-700 border-blue-200"
                            : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                        )}
                      >
                        All Types
                    </button>
                    {uniqueTypes.map(type => (
                      <button
                        key={type}
                        onClick={() => setTypeFilter(type)}
                        className={clsx(
                          "px-3 py-2 rounded-lg text-xs font-medium border transition-all text-left truncate",
                          typeFilter === type
                            ? "bg-blue-50 text-blue-700 border-blue-200"
                            : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                        )}
                      >
                        {type}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </PopoverContent>
          </Popover>

          {isAdmin && <AddDeviceDialog onSuccess={fetchData} properties={properties} />}

          <button className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 shadow-sm transition-all">
            <Download className="h-4 w-4" />
            Export
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="relative group">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search devices by name, type, or location..."
          className="h-12 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-10 text-sm shadow-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
        />
        {searchQuery && (
          <button 
            onClick={() => setSearchQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Active Filters Summary */}
      {(statusFilter !== 'all' || typeFilter !== 'all' || buildingFilter !== 'all') && (
        <div className="flex items-center gap-2 animate-in fade-in slide-in-from-top-1 flex-wrap">
          <span className="text-xs text-slate-500 font-medium">Active Filters:</span>
          {statusFilter !== 'all' && (
            <span className="flex items-center gap-1 px-2 py-1 rounded bg-slate-100 text-slate-600 text-xs border border-slate-200">
              Status: <span className="font-semibold capitalize">{statusFilter}</span>
              <button onClick={() => setStatusFilter('all')} className="ml-1 text-slate-400 hover:text-slate-600"><X className="h-3 w-3"/></button>
            </span>
          )}
          {buildingFilter !== 'all' && (
            <span className="flex items-center gap-1 px-2 py-1 rounded bg-slate-100 text-slate-600 text-xs border border-slate-200">
              Property: <span className="font-semibold">{buildingFilter}</span>
              <button onClick={() => setBuildingFilter('all')} className="ml-1 text-slate-400 hover:text-slate-600"><X className="h-3 w-3"/></button>
            </span>
          )}
          {typeFilter !== 'all' && (
            <span className="flex items-center gap-1 px-2 py-1 rounded bg-slate-100 text-slate-600 text-xs border border-slate-200">
              Type: <span className="font-semibold">{typeFilter}</span>
              <button onClick={() => setTypeFilter('all')} className="ml-1 text-slate-400 hover:text-slate-600"><X className="h-3 w-3"/></button>
            </span>
          )}
        </div>
      )}

      {/* Devices Table */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        {/* Mobile: Card layout */}
        <div className="md:hidden divide-y divide-slate-100">
          {loading ? (
            <div className="px-4 py-12 text-center text-slate-500 text-sm">Loading devices...</div>
          ) : filteredDevices.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2 px-4">
              <Search className="h-8 w-8 text-slate-300" />
              <p className="text-sm font-medium text-slate-900">No devices found</p>
              <p className="text-xs text-slate-500">Try adjusting your filters.</p>
              <button onClick={clearFilters} className="mt-1 text-blue-600 hover:underline text-xs">Clear all filters</button>
            </div>
          ) : filteredDevices.map((device) => (
            <div key={device.id} className="px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="font-medium text-slate-900 text-sm truncate">{device.name}</p>
                    <span className="inline-flex items-center rounded-md bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-600 shrink-0">
                      {device.type}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-500 mb-2">
                    <Building2 className="h-3 w-3 shrink-0" />
                    <span className="truncate">{device.building}</span>
                    <span className="text-slate-300">·</span>
                    <span className="truncate">{device.location}</span>
                    {device.gateway && device.gateway !== 'Unassigned' && (
                      <>
                        <span className="text-slate-300">·</span>
                        <span className="flex items-center gap-0.5 text-slate-400">
                          <Router className="h-3 w-3" />
                          {device.gateway}
                        </span>
                      </>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5">
                      {device.status === 'online' ? (
                        <div className="h-2 w-2 rounded-full bg-emerald-500" />
                      ) : device.status === 'warning' ? (
                        <div className="h-2 w-2 rounded-full bg-amber-500" />
                      ) : (
                        <div className="h-2 w-2 rounded-full bg-slate-400" />
                      )}
                      <span className="capitalize text-xs text-slate-600">{device.status}</span>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-slate-500">
                      {device.battery > 80 ? (
                        <Battery className="h-3.5 w-3.5 text-emerald-500" />
                      ) : device.battery > 20 ? (
                        <BatteryMedium className="h-3.5 w-3.5 text-amber-500" />
                      ) : (
                        <BatteryLow className="h-3.5 w-3.5 text-red-500" />
                      )}
                      <span>{device.battery}%</span>
                    </div>
                    <span className="text-xs text-slate-400">{device.lastUpdate}</span>
                  </div>
                </div>
                {isAdmin && (
                  <Popover>
                    <PopoverTrigger asChild>
                      <button className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 shrink-0">
                        <MoreHorizontal className="h-4 w-4" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-40 p-1" align="end">
                      <button
                        onClick={async () => {
                          if (!confirm(`Delete device "${device.name}"?`)) return;
                          try {
                            await api.deleteDevice(device.id);
                            toast.success(`"${device.name}" deleted.`);
                            fetchData();
                          } catch (err: any) {
                            toast.error(err.message || 'Failed to delete');
                          }
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-md transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Delete Device
                      </button>
                    </PopoverContent>
                  </Popover>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Desktop: Table layout */}
        <div className="overflow-x-auto hidden md:block">
          <table className="w-full text-left text-sm" style={{ minWidth: '800px' }}>
            <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-100">
              <tr>
                <th className="px-4 py-4 whitespace-nowrap">Device Name</th>
                <th className="px-4 py-4 whitespace-nowrap">Type</th>
                <th className="px-4 py-4 whitespace-nowrap">Building</th>
                <th className="px-4 py-4 whitespace-nowrap">Location</th>
                <th className="px-4 py-4 whitespace-nowrap">Status</th>
                <th className="px-4 py-4 whitespace-nowrap">Battery</th>
                <th className="px-4 py-4 whitespace-nowrap">Last Update</th>
                {isAdmin && <th className="px-4 py-4 text-right whitespace-nowrap">Actions</th>}
              </tr>
            </thead>
            {loading ? (
               <tbody>
                  <tr>
                    <td colSpan={8} className="px-6 py-12 text-center text-slate-500">Loading devices...</td>
                  </tr>
                </tbody>
            ) : filteredDevices.length > 0 ? (
              filteredDevices.map((device) => (
                <tbody key={device.id} className="group border-b border-slate-50 last:border-none">
                  <tr 
                    onClick={() => { setSelectedDevice(selectedDevice === device.id ? null : device.id); setHistoryPeriod('24h'); }}
                    className={clsx(
                      "cursor-pointer hover:bg-slate-50 transition-colors",
                      selectedDevice === device.id && "bg-slate-50"
                    )}
                  >
                    <td className="px-4 py-4 font-medium text-slate-900 whitespace-nowrap">{device.name}</td>
                    <td className="px-4 py-4">
                      <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600 whitespace-nowrap">
                        {device.type}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-slate-600 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                       <div className="flex items-center gap-1.5 group/edit">
                         <Building2 className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                         <span>{device.building}</span>
                         {isAdmin && (
                           <AssignDeviceDialog 
                              device={device} 
                              properties={properties} 
                              onSuccess={fetchData}
                              trigger={
                                  <button className="opacity-0 group-hover/edit:opacity-100 p-1 hover:bg-slate-200 rounded text-slate-500 hover:text-blue-600 transition-all">
                                    <Edit2 className="h-3 w-3" />
                                  </button>
                              }
                           />
                         )}
                       </div>
                    </td>
                    <td className="px-4 py-4 text-slate-600 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      <EditableLocation device={device} onSave={fetchData} isAdmin={isAdmin} />
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        {device.status === 'online' ? (
                          <div className="h-2.5 w-2.5 rounded-full bg-emerald-500 ring-4 ring-emerald-50" />
                        ) : device.status === 'warning' ? (
                           <div className="h-2.5 w-2.5 rounded-full bg-amber-500 ring-4 ring-amber-50" />
                        ) : (
                          <div className="h-2.5 w-2.5 rounded-full bg-slate-400 ring-4 ring-slate-100" />
                        )}
                        <span className="capitalize text-slate-700">{device.status}</span>
                      </div>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2 text-slate-600">
                        {device.battery > 80 ? (
                          <Battery className="h-4 w-4 text-emerald-500" />
                        ) : device.battery > 20 ? (
                          <BatteryMedium className="h-4 w-4 text-amber-500" />
                        ) : (
                          <BatteryLow className="h-4 w-4 text-red-500" />
                        )}
                        <span>{device.battery}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-slate-500 whitespace-nowrap">{device.lastUpdate}</td>
                    {isAdmin && (
                      <td className="px-4 py-4 text-right">
                        <Popover>
                          <PopoverTrigger asChild>
                            <button className="rounded-lg p-2 text-slate-400 hover:bg-white hover:shadow-sm hover:text-slate-600" onClick={e => e.stopPropagation()}>
                              <MoreHorizontal className="h-4 w-4" />
                            </button>
                          </PopoverTrigger>
                          <PopoverContent className="w-40 p-1" align="end">
                            <button
                              onClick={async (e) => {
                                e.stopPropagation();
                                if (!confirm(`Delete device "${device.name}"?`)) return;
                                try {
                                  await api.deleteDevice(device.id);
                                  toast.success(`"${device.name}" deleted.`);
                                  fetchData();
                                } catch (err: any) {
                                  toast.error(err.message || 'Failed to delete');
                                }
                              }}
                              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-md transition-colors"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              Delete Device
                            </button>
                          </PopoverContent>
                        </Popover>
                      </td>
                    )}
                  </tr>
                  {selectedDevice === device.id && (
                    <tr className="bg-slate-50/50">
                      <td colSpan={8} className="px-6 py-4">
                        <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-6 shadow-sm sm:min-w-[600px] animate-in fade-in slide-in-from-top-2">
                          <div className="mb-4 flex items-center justify-between">
                            <h4 className="font-semibold text-slate-900">Historical Data - {device.name}</h4>
                            <div className="flex rounded-lg bg-slate-100 p-1">
                              {(['24h', '7d', '30d'] as const).map((p) => (
                                <button
                                  key={p}
                                  onClick={() => setHistoryPeriod(p)}
                                  className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                                    historyPeriod === p
                                      ? 'bg-white text-slate-900 shadow-sm'
                                      : 'text-slate-500 hover:text-slate-900'
                                  }`}
                                >
                                  {p.toUpperCase()}
                                </button>
                              ))}
                            </div>
                          </div>
                          <DeviceHistoryChart deviceId={device.id} deviceType={device.type} devEui={device.devEui} period={historyPeriod} />
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              ))
            ) : (
              <tbody>
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-slate-500">
                    <div className="flex flex-col items-center justify-center gap-2">
                        <Search className="h-8 w-8 text-slate-300" />
                        <p className="text-base font-medium text-slate-900">No devices found</p>
                        <p className="text-xs">Try adjusting your filters or search terms.</p>
                        <button onClick={clearFilters} className="mt-2 text-blue-600 hover:underline text-xs">Clear all filters</button>
                    </div>
                  </td>
                </tr>
              </tbody>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
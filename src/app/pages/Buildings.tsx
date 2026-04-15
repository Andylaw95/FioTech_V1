import React, { useState, useEffect, useCallback } from 'react';
import { 
  Building2, 
  MapPin, 
  AlertTriangle, 
  CheckCircle2, 
  Search, 
  MoreHorizontal,
  ArrowRight,
  Loader2,
  Pencil,
  Trash2,
  ExternalLink,
  Grid3X3,
  List,
  Activity,
  Camera,
  UserPlus
} from 'lucide-react';
import { clsx } from 'clsx';
import { useNavigate } from 'react-router';
import { api, type Property, invalidateCache } from '@/app/utils/api';
import { useAuth } from '@/app/utils/AuthContext';
import { AddPropertyDialog } from '@/app/components/AddPropertyDialog';
import { EditPropertyDialog } from '@/app/components/EditPropertyDialog';
import { DeletePropertyDialog } from '@/app/components/DeletePropertyDialog';
import { ChangePropertyPhotoDialog } from '@/app/components/ChangePropertyPhotoDialog';
import { AssignPropertyDialog } from '@/app/components/AssignPropertyDialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/app/components/ui/popover';
import { toast } from 'sonner';

// Map API property to display format
function mapPropertyToCard(p: Property) {
  const waterParts = (p.waterSensors || '0/0').split('/');
  const waterCount = parseInt(waterParts[0]) || 0;
  const waterTotal = parseInt(waterParts[1]) || 0;
  const isWarning = p.status?.toLowerCase() === 'warning';
  const isCritical = p.status?.toLowerCase() === 'critical';
  const alerts = 0; // Real alarm count not available per-property; status badge indicates health
  return {
    id: p.id,
    name: p.name,
    address: p.location,
    type: p.type,
    image: p.image || 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&q=80&w=800',
    // Use actual device count from backend (enriched), fallback to waterSensors total
    totalSensors: p.deviceCount ?? waterTotal,
    onlineSensors: p.onlineDevices ?? waterCount,
    waterSensorsRaw: p.waterSensors,
    status: isCritical ? 'critical' : isWarning ? 'warning' : 'normal',
    alerts,
    // Keep original for edit dialog
    _raw: p,
  };
}

type ViewMode = 'grid' | 'list';

export function Buildings() {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [properties, setProperties] = useState<ReturnType<typeof mapPropertyToCard>[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');

  // Edit/Delete dialog state
  const [editTarget, setEditTarget] = useState<Property | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [photoTarget, setPhotoTarget] = useState<{ id: string; image?: string } | null>(null);
  const [assignTarget, setAssignTarget] = useState<{ id: string; name: string; deviceCount?: number } | null>(null);

  const fetchProperties = useCallback(async () => {
    try {
      const data = await api.getProperties();
      setProperties(data.map(mapPropertyToCard));
    } catch (err) {
      console.debug('Failed to fetch properties:', err);
      toast.error('Failed to load properties');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProperties();
  }, [fetchProperties]);

  // Auto-refresh every 30s (only when tab is visible)
  useEffect(() => {
    const silentRefresh = () => {
      if (!document.hidden) {
        // Invalidate cache so we always get fresh data (e.g., photo updated on another device)
        invalidateCache('/properties');
        api.getProperties().then(data => setProperties(data.map(mapPropertyToCard))).catch(() => {});
      }
    };
    const timer = setInterval(silentRefresh, 30000);
    document.addEventListener('visibilitychange', silentRefresh);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', silentRefresh); };
  }, []);

  const handleDeleteSuccess = () => {
    toast.success(`${deleteTarget?.name} has been deleted`);
    setDeleteTarget(null);
    fetchProperties();
  };

  const handleEditSuccess = () => {
    toast.success('Property updated successfully');
    setEditTarget(null);
    fetchProperties();
  };

  const filteredProperties = properties.filter(b => {
    const q = searchQuery.toLowerCase();
    return (b.name ?? '').toLowerCase().includes(q) ||
      (b.address ?? '').toLowerCase().includes(q) ||
      (b.type ?? '').toLowerCase().includes(q);
  });

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col justify-between gap-3 sm:gap-4 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Properties</h2>
          <p className="text-sm sm:text-base text-slate-500">
            Manage your buildings and their sensor networks.
            {!loading && ` ${properties.length} total.`}
          </p>
        </div>
        {isAdmin && <AddPropertyDialog onSuccess={() => { fetchProperties(); toast.success('Property added!'); }} />}
      </div>

      {/* Search and View Toggle */}
      <div className="flex items-center gap-3">
        <div className="flex flex-1 items-center gap-4 rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
          <Search className="ml-2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by name, location, or type..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="text-xs text-slate-400 hover:text-slate-600 px-2">
              Clear
            </button>
          )}
        </div>
        <div className="flex rounded-lg border border-slate-200 p-0.5 bg-white shadow-sm">
          <button
            onClick={() => setViewMode('grid')}
            className={clsx(
              "rounded-md p-2 transition-all",
              viewMode === 'grid' ? "bg-slate-100 text-slate-900" : "text-slate-400 hover:text-slate-600"
            )}
          >
            <Grid3X3 className="h-4 w-4" />
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={clsx(
              "rounded-md p-2 transition-all",
              viewMode === 'list' ? "bg-slate-100 text-slate-900" : "text-slate-400 hover:text-slate-600"
            )}
          >
            <List className="h-4 w-4" />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
        </div>
      ) : filteredProperties.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
          <Building2 className="h-12 w-12 mb-3" />
          <p className="text-lg font-medium">No properties found</p>
          <p className="text-sm">{searchQuery ? 'Try a different search term.' : 'Add a new property to get started.'}</p>
        </div>
      ) : viewMode === 'grid' ? (
        /* === GRID VIEW === */
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredProperties.map((building) => (
            <div 
              key={building.id} 
              className="group relative flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-all hover:shadow-md hover:border-slate-300 cursor-pointer"
              onClick={() => navigate(`/buildings/${building.id}`)}
            >
              {/* Image Header */}
              <div className="relative h-48 w-full overflow-hidden bg-slate-100">
                <img 
                  src={building.image} 
                  alt={building.name} 
                  className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
                <div className="absolute top-4 left-4">
                  <span className={clsx(
                    "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium shadow-sm backdrop-blur-md",
                    building.status === 'normal' ? "bg-emerald-500/90 text-white" :
                    building.status === 'warning' ? "bg-amber-500/90 text-white" :
                    "bg-red-500/90 text-white"
                  )}>
                    {building.status === 'normal' ? (
                      <><CheckCircle2 className="h-3 w-3" /> Normal</>
                    ) : (
                      <><AlertTriangle className="h-3 w-3" /> {building.alerts} Alerts</>
                    )}
                  </span>
                </div>
                {/* Context Menu */}
                <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Popover>
                    <PopoverTrigger asChild>
                      <button
                        onClick={(e) => e.stopPropagation()}
                        className="rounded-lg bg-black/30 p-1.5 text-white backdrop-blur-md hover:bg-black/50 transition-colors"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-44 p-1" align="end">
                      <button
                        onClick={(e) => { e.stopPropagation(); navigate(`/buildings/${building.id}`); }}
                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        View Details
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setPhotoTarget({ id: building.id, image: building._raw.image }); }}
                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                      >
                        <Camera className="h-3.5 w-3.5" />
                        Change Photo
                      </button>
                      {isAdmin && (
                        <>
                          <button
                            onClick={(e) => { e.stopPropagation(); setEditTarget(building._raw); }}
                            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            Edit Property
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); setAssignTarget({ id: building.id, name: building.name, deviceCount: building.totalSensors }); }}
                            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                          >
                            <UserPlus className="h-3.5 w-3.5" />
                            Assign to Account
                          </button>
                          <div className="my-1 border-t border-slate-100" />
                          <button
                            onClick={(e) => { e.stopPropagation(); setDeleteTarget({ id: building.id, name: building.name }); }}
                            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Delete
                          </button>
                        </>
                      )}
                    </PopoverContent>
                  </Popover>
                </div>
              </div>

              {/* Content */}
              <div className="flex flex-1 flex-col p-5">
                <div className="mb-4">
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-semibold text-slate-900 group-hover:text-blue-600 transition-colors">{building.name}</h3>
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="flex items-center gap-1 text-xs text-slate-500">
                      <MapPin className="h-3 w-3" />
                      {building.address}
                    </span>
                    <span className={clsx(
                      "inline-flex rounded-md px-1.5 py-0.5 text-xs font-medium",
                      building.type === 'Commercial' ? "bg-blue-50 text-blue-600" :
                      building.type === 'Residential' ? "bg-emerald-50 text-emerald-600" :
                      building.type === 'Industrial' ? "bg-amber-50 text-amber-600" :
                      "bg-purple-50 text-purple-600"
                    )}>
                      {building.type}
                    </span>
                  </div>
                </div>

                <div className="mt-auto grid grid-cols-2 gap-4 border-t border-slate-100 pt-4">
                  <div>
                    <p className="text-xs font-medium text-slate-500">Devices</p>
                    <p className="mt-0.5 text-lg font-semibold text-slate-900">{building.totalSensors}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-500">Online</p>
                    <div className="mt-0.5 flex items-center gap-1.5">
                      <Activity className="h-4 w-4 text-emerald-500" />
                      <span className="text-lg font-semibold text-slate-900">{building.onlineSensors}/{building.totalSensors}</span>
                    </div>
                  </div>
                </div>
                
                <div className="mt-4 flex items-center justify-between text-xs font-medium text-blue-600 opacity-0 transition-opacity group-hover:opacity-100">
                  <span>View Details</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* === LIST VIEW === */
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-x-auto">
          <table className="w-full text-sm text-left min-w-[700px]">
            <thead className="bg-slate-50 text-slate-500 font-medium">
              <tr>
                <th className="px-6 py-3">Property</th>
                <th className="px-6 py-3">Type</th>
                <th className="px-6 py-3">Location</th>
                <th className="px-6 py-3">Devices</th>
                <th className="px-6 py-3">Status</th>
                {isAdmin && <th className="px-6 py-3 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredProperties.map((building) => (
                <tr
                  key={building.id}
                  className="group hover:bg-slate-50 transition-colors cursor-pointer"
                  onClick={() => navigate(`/buildings/${building.id}`)}
                >
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg bg-slate-100 overflow-hidden shrink-0">
                        <img src={building.image} alt="" className="h-full w-full object-cover" />
                      </div>
                      <div>
                        <p className="font-medium text-slate-900 group-hover:text-blue-600 transition-colors truncate max-w-[180px]">{building.name}</p>
                        <p className="text-xs text-slate-500">{building.totalSensors} device{building.totalSensors !== 1 ? 's' : ''}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={clsx(
                      "inline-flex rounded-md px-2 py-0.5 text-xs font-medium",
                      building.type === 'Commercial' ? "bg-blue-50 text-blue-700" :
                      building.type === 'Residential' ? "bg-emerald-50 text-emerald-700" :
                      building.type === 'Industrial' ? "bg-amber-50 text-amber-700" :
                      "bg-purple-50 text-purple-700"
                    )}>
                      {building.type}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-slate-600">
                    <div className="flex items-center gap-1 max-w-[200px]">
                      <MapPin className="h-3 w-3 shrink-0" /> <span className="truncate">{building.address}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <Activity className="h-3.5 w-3.5 text-emerald-500" />
                      <span className="text-slate-700 font-medium">{building.onlineSensors}/{building.totalSensors}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={clsx(
                      "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset",
                      building.status === 'normal' 
                        ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20" 
                        : "bg-amber-50 text-amber-700 ring-amber-600/20"
                    )}>
                      {building.status === 'normal' ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
                      {building.status === 'normal' ? 'Normal' : `${building.alerts} Alert${building.alerts !== 1 ? 's' : ''}`}
                    </span>
                  </td>
                  {isAdmin && (
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={(e) => { e.stopPropagation(); setEditTarget(building._raw); }}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-blue-600 transition-colors"
                          title="Edit"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setAssignTarget({ id: building.id, name: building.name, deviceCount: building.totalSensors }); }}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-blue-50 hover:text-blue-600 transition-colors"
                          title="Assign to Account"
                        >
                          <UserPlus className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setDeleteTarget({ id: building.id, name: building.name }); }}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Edit Dialog */}
      {editTarget && (
        <EditPropertyDialog
          property={editTarget}
          open={!!editTarget}
          onOpenChange={(open) => { if (!open) setEditTarget(null); }}
          onSuccess={handleEditSuccess}
        />
      )}

      {/* Photo Dialog */}
      {photoTarget && (
        <ChangePropertyPhotoDialog
          propertyId={photoTarget.id}
          currentImage={photoTarget.image}
          open={!!photoTarget}
          onOpenChange={(open) => { if (!open) setPhotoTarget(null); }}
          onSuccess={() => { toast.success('Property photo updated'); setPhotoTarget(null); fetchProperties(); }}
        />
      )}

      {/* Delete Dialog */}
      {deleteTarget && (
        <DeletePropertyDialog
          property={deleteTarget}
          open={!!deleteTarget}
          onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
          onSuccess={handleDeleteSuccess}
        />
      )}

      {/* Assign Property Dialog */}
      {assignTarget && (
        <AssignPropertyDialog
          property={assignTarget}
          open={!!assignTarget}
          onOpenChange={(open) => { if (!open) setAssignTarget(null); }}
          onSuccess={() => {
            toast.success(`Property "${assignTarget.name}" assigned successfully`);
            setAssignTarget(null);
            fetchProperties();
          }}
        />
      )}
    </div>
  );
}
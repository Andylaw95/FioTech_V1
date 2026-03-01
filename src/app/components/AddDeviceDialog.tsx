import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
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
import { Plus, Loader2, Router } from 'lucide-react';
import { api, type Property, type Gateway } from '@/app/utils/api';
import { toast } from 'sonner';

const DEVICE_TYPES = ['IAQ', 'Noise', 'Leakage', 'Smoke', 'Fire', 'Temperature'];

interface AddDeviceDialogProps {
  onSuccess: () => void;
  properties?: Property[];
  trigger?: React.ReactNode;
}

export function AddDeviceDialog({ onSuccess, properties: propsProp, trigger }: AddDeviceDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [properties, setProperties] = useState<Property[]>(propsProp || []);
  const [gateways, setGateways] = useState<Gateway[]>([]);

  const [name, setName] = useState('');
  const [type, setType] = useState('');
  const [building, setBuilding] = useState('');
  const [location, setLocation] = useState('');
  const [gateway, setGateway] = useState('');

  // Fetch properties and gateways when dialog opens
  useEffect(() => {
    if (open) {
      if (!propsProp) {
        api.getProperties().then(setProperties).catch(() => {});
      }
      api.getGateways().then(setGateways).catch(() => {});
    }
  }, [open, propsProp]);

  // Filter gateways by selected property
  const filteredGateways = building
    ? gateways.filter(g => g.property === building || g.property === 'Unassigned')
    : gateways;

  const handleSubmit = async () => {
    if (!name.trim() || !type) {
      toast.error('Device name and type are required.');
      return;
    }

    setLoading(true);
    try {
      await api.addDevice({
        name: name.trim(),
        type,
        building: building || 'Unassigned',
        location: location.trim() || 'Not specified',
        gateway: gateway || 'Unassigned',
      });
      toast.success(`Device "${name}" added successfully.`);
      setOpen(false);
      setName('');
      setType('');
      setBuilding('');
      setLocation('');
      setGateway('');
      onSuccess();
    } catch (err: any) {
      console.error('Failed to add device:', err);
      toast.error(err.message || 'Failed to add device');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <button className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 shadow-sm transition-all shadow-blue-200">
            <Plus className="h-4 w-4" />
            Add Device
          </button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Register New Device</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Device Name *</Label>
            <Input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. IAQ Sensor Gamma"
            />
          </div>

          <div className="space-y-2">
            <Label>Device Type *</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger>
                <SelectValue placeholder="Select sensor type" />
              </SelectTrigger>
              <SelectContent>
                {DEVICE_TYPES.map(t => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Assign to Property</Label>
            <Select value={building} onValueChange={(val) => {
              setBuilding(val);
              // Reset gateway if it's not compatible with the new property
              if (gateway && val) {
                const selectedGw = gateways.find(g => g.id === gateway);
                if (selectedGw && selectedGw.property !== val && selectedGw.property !== 'Unassigned') {
                  setGateway('');
                }
              }
            }}>
              <SelectTrigger>
                <SelectValue placeholder="Unassigned" />
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
            <Label className="flex items-center gap-1.5">
              <Router className="h-3.5 w-3.5 text-slate-400" />
              Connect to Gateway
            </Label>
            <Select value={gateway} onValueChange={setGateway}>
              <SelectTrigger>
                <SelectValue placeholder="Select a gateway" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Unassigned">No Gateway</SelectItem>
                {filteredGateways.map(g => (
                  <SelectItem key={g.id} value={g.id}>
                    <span className="flex items-center gap-2">
                      <span className={`inline-block h-1.5 w-1.5 rounded-full shrink-0 ${
                        g.status === 'online' ? 'bg-emerald-500' :
                        g.status === 'warning' ? 'bg-amber-500' :
                        'bg-slate-400'
                      }`} />
                      {g.name}
                      <span className="text-slate-400 text-xs">({g.protocol})</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {filteredGateways.length === 0 && gateways.length > 0 && building && (
              <p className="text-xs text-amber-600">
                No gateways assigned to this property. Showing all gateways.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Location / Zone</Label>
            <Input
              value={location}
              onChange={e => setLocation(e.target.value)}
              placeholder="e.g. Meeting Room B, Floor 3"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={loading || !name.trim() || !type}>
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Registering...
              </>
            ) : (
              <>
                <Plus className="h-4 w-4 mr-2" />
                Register Device
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
import React, { useState } from 'react';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter, 
  DialogTrigger 
} from '@/app/components/ui/dialog';
import { Button } from '@/app/components/ui/button';
import { Label } from '@/app/components/ui/label';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/app/components/ui/select';
import { Loader2, Building2 } from 'lucide-react';
import { api } from '@/app/utils/api';

interface Property {
  id: string;
  name: string;
}

interface AssignDeviceDialogProps {
  device: { id: string; name: string; building: string };
  properties: Property[];
  onSuccess: () => void;
  trigger?: React.ReactNode;
}

export function AssignDeviceDialog({ device, properties, onSuccess, trigger }: AssignDeviceDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedBuilding, setSelectedBuilding] = useState(device.building);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      await api.assignDevice(device.id, selectedBuilding);
      setOpen(false);
      onSuccess();
    } catch (error) {
      console.error('Error assigning device:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
            <Building2 className="h-4 w-4" />
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Assign Device</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="grid gap-4 py-4">
          <div className="space-y-1">
             <p className="text-sm font-medium text-slate-500">Device</p>
             <p className="text-base font-semibold text-slate-900">{device.name}</p>
          </div>
          
          <div className="grid gap-2">
            <Label htmlFor="building">
              Select Property
            </Label>
            <Select 
              value={selectedBuilding} 
              onValueChange={setSelectedBuilding}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a property" />
              </SelectTrigger>
              <SelectContent>
                {properties.map(p => (
                   <SelectItem key={p.id} value={p.name}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <DialogFooter>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Assignment
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
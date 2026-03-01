import React, { useState } from 'react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/app/components/ui/alert-dialog';
import { Loader2, AlertTriangle } from 'lucide-react';
import { api } from '@/app/utils/api';

interface DeletePropertyDialogProps {
  property: { id: string; name: string; deviceCount?: number };
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function DeletePropertyDialog({ property, open, onOpenChange, onSuccess }: DeletePropertyDialogProps) {
  const [loading, setLoading] = useState(false);

  const handleDelete = async () => {
    setLoading(true);
    try {
      await api.deleteProperty(property.id);
      onOpenChange(false);
      onSuccess();
    } catch (error) {
      console.error('Error deleting property:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100">
              <AlertTriangle className="h-5 w-5 text-red-600" />
            </div>
            <AlertDialogTitle>Delete Property</AlertDialogTitle>
          </div>
          <AlertDialogDescription asChild>
            <div className="space-y-3">
              <p>
                Are you sure you want to delete <strong className="text-slate-900">{property.name}</strong>? This action cannot be undone.
              </p>
              {(property.deviceCount ?? 0) > 0 && (
                <div className="rounded-lg bg-amber-50 border border-amber-100 p-3 text-xs text-amber-800">
                  <strong>{property.deviceCount}</strong> device{property.deviceCount !== 1 ? 's' : ''} assigned to this property will be unassigned.
                </div>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => { e.preventDefault(); handleDelete(); }}
            disabled={loading}
            className="bg-red-600 text-white hover:bg-red-700 focus:ring-red-500"
          >
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Delete Property
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

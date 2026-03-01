import React, { useState, useEffect, useCallback } from 'react';
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
import { Loader2, UserPlus, Building2, Cpu, ArrowRight } from 'lucide-react';
import { api, AdminUser } from '@/app/utils/api';
import { Label } from '@/app/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/app/components/ui/select';
import { Checkbox } from '@/app/components/ui/checkbox';

interface AssignPropertyDialogProps {
  property: { id: string; name: string; deviceCount?: number };
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function AssignPropertyDialog({
  property,
  open,
  onOpenChange,
  onSuccess,
}: AssignPropertyDialogProps) {
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [targetUserId, setTargetUserId] = useState<string>('');
  const [includeDevices, setIncludeDevices] = useState(true);
  const [removeFromSource, setRemoveFromSource] = useState(false);
  const [error, setError] = useState('');

  const fetchUsers = useCallback(async () => {
    setUsersLoading(true);
    try {
      const res = await api.adminListUsers(1, 100);
      // Filter out master account (admin themselves)
      const otherUsers = res.users.filter((u: AdminUser) => !u.isMaster);
      setUsers(otherUsers);
    } catch (e) {
      console.error('Failed to load users:', e);
      setError('Failed to load user accounts.');
    } finally {
      setUsersLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      setTargetUserId('');
      setIncludeDevices(true);
      setRemoveFromSource(false);
      setError('');
      fetchUsers();
    }
  }, [open, fetchUsers]);

  const handleAssign = async () => {
    if (!targetUserId) {
      setError('Please select a target account.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const result = await api.adminAssignPropertyToUser(property.id, targetUserId, {
        includeDevices,
        removeFromSource,
      });
      onOpenChange(false);
      onSuccess();
    } catch (e: any) {
      const msg = e?.message || 'Failed to assign property.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const selectedUser = users.find((u) => u.id === targetUserId);

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100">
              <UserPlus className="h-5 w-5 text-blue-600" />
            </div>
            <AlertDialogTitle>Assign Property to Account</AlertDialogTitle>
          </div>
          <AlertDialogDescription asChild>
            <div className="space-y-4">
              {/* Property info */}
              <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
                <div className="flex items-center gap-2 text-sm font-medium text-slate-900">
                  <Building2 className="h-4 w-4 text-slate-500" />
                  {property.name}
                </div>
                {(property.deviceCount ?? 0) > 0 && (
                  <div className="flex items-center gap-2 text-xs text-slate-500 mt-1">
                    <Cpu className="h-3 w-3" />
                    {property.deviceCount} device{property.deviceCount !== 1 ? 's' : ''} linked
                  </div>
                )}
              </div>

              {/* Target account selector */}
              <div className="space-y-2">
                <Label className="text-sm font-medium text-slate-700">Target Account</Label>
                {usersLoading ? (
                  <div className="flex items-center gap-2 text-sm text-slate-500 py-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading accounts…
                  </div>
                ) : (
                  <Select value={targetUserId} onValueChange={setTargetUserId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select an account…" />
                    </SelectTrigger>
                    <SelectContent>
                      {users.map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          <span className="flex flex-col">
                            <span className="font-medium">{u.name || u.email}</span>
                            {u.name && (
                              <span className="text-xs text-slate-500">{u.email}</span>
                            )}
                          </span>
                        </SelectItem>
                      ))}
                      {users.length === 0 && (
                        <div className="py-2 px-3 text-sm text-slate-500">No other accounts found.</div>
                      )}
                    </SelectContent>
                  </Select>
                )}
              </div>

              {/* Options */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="include-devices"
                    checked={includeDevices}
                    onCheckedChange={(v: boolean | 'indeterminate') => setIncludeDevices(!!v)}
                  />
                  <Label htmlFor="include-devices" className="text-sm text-slate-700 cursor-pointer">
                    Include linked devices ({property.deviceCount ?? 0})
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="remove-from-source"
                    checked={removeFromSource}
                    onCheckedChange={(v: boolean | 'indeterminate') => setRemoveFromSource(!!v)}
                  />
                  <Label htmlFor="remove-from-source" className="text-sm text-slate-700 cursor-pointer">
                    Remove from my account after assigning (transfer)
                  </Label>
                </div>
              </div>

              {/* Summary */}
              {targetUserId && selectedUser && (
                <div className="rounded-lg bg-blue-50 border border-blue-100 p-3 text-xs text-blue-800">
                  <div className="flex items-center gap-1">
                    <strong>{property.name}</strong>
                    {includeDevices && <span>+ {property.deviceCount ?? 0} device(s)</span>}
                    <ArrowRight className="h-3 w-3 mx-1" />
                    <strong>{selectedUser.name || selectedUser.email}</strong>
                  </div>
                  {removeFromSource && (
                    <p className="mt-1 text-amber-700">
                      ⚠ This property will be removed from your account.
                    </p>
                  )}
                </div>
              )}

              {/* Error */}
              {error && (
                <div className="rounded-lg bg-red-50 border border-red-100 p-3 text-xs text-red-700">
                  {error}
                </div>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e: React.MouseEvent) => {
              e.preventDefault();
              handleAssign();
            }}
            disabled={loading || !targetUserId || usersLoading}
            className="bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500"
          >
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {removeFromSource ? 'Transfer Property' : 'Assign Property'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/app/components/ui/dialog';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import { Loader2, Upload, X, Link2, Camera } from 'lucide-react';
import { api } from '@/app/utils/api';

interface ChangePropertyPhotoDialogProps {
  propertyId: string;
  currentImage?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

type ImageMode = 'upload' | 'url';

export function ChangePropertyPhotoDialog({
  propertyId,
  currentImage,
  open,
  onOpenChange,
  onSuccess,
}: ChangePropertyPhotoDialogProps) {
  const [loading, setLoading] = useState(false);
  const [imageMode, setImageMode] = useState<ImageMode>('upload');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [imageUrl, setImageUrl] = useState(currentImage || '');
  const [previewUrl, setPreviewUrl] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setImageUrl(currentImage || '');
      setPreviewUrl('');
      setUploadError('');
    }
  }, [open, currentImage]);

  const handleFileUpload = useCallback(async (file: File) => {
    const allowedTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
    if (!allowedTypes.includes(file.type)) {
      setUploadError('Please upload a PNG, JPG, WebP, or GIF image.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setUploadError('File size must be under 10MB.');
      return;
    }

    setUploadError('');
    setUploading(true);
    const localPreview = URL.createObjectURL(file);
    setPreviewUrl(localPreview);

    try {
      const result = await api.uploadImage(file);
      setImageUrl(result.url);
      setPreviewUrl(result.url);
    } catch (err: any) {
      console.error('Image upload error:', err);
      setUploadError(err.message || 'Upload failed. Please try again.');
      setPreviewUrl('');
      setImageUrl(currentImage || '');
    } finally {
      setUploading(false);
      URL.revokeObjectURL(localPreview);
    }
  }, [currentImage]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileUpload(file);
  }, [handleFileUpload]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileUpload(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [handleFileUpload]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!imageUrl) return;
    setLoading(true);
    try {
      await api.updatePropertyPhoto(propertyId, imageUrl);
      onOpenChange(false);
      onSuccess();
    } catch (error) {
      console.error('Error updating property photo:', error);
      setUploadError('Failed to save. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const displayPreview = previewUrl || imageUrl;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Camera className="h-5 w-5" />
            Change Property Photo
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="grid gap-4 py-4">
          {/* Mode Toggle */}
          <div className="flex rounded-lg border border-slate-200 p-0.5 bg-slate-50">
            <button
              type="button"
              onClick={() => setImageMode('upload')}
              className={`flex-1 flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-all ${
                imageMode === 'upload'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <Upload className="h-4 w-4" /> Upload Photo
            </button>
            <button
              type="button"
              onClick={() => setImageMode('url')}
              className={`flex-1 flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-all ${
                imageMode === 'url'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <Link2 className="h-4 w-4" /> Image URL
            </button>
          </div>

          {/* Upload Mode */}
          {imageMode === 'upload' && (
            <div
              onDrop={handleDrop}
              onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDragActive(true); }}
              onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setDragActive(false); }}
              onClick={() => fileInputRef.current?.click()}
              className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 cursor-pointer transition-all ${
                dragActive
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-slate-200 bg-slate-50/50 hover:border-slate-300 hover:bg-slate-50'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                onChange={handleFileSelect}
                className="hidden"
              />
              {uploading ? (
                <div className="flex flex-col items-center gap-2">
                  <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                  <p className="text-sm text-blue-600">Uploading...</p>
                </div>
              ) : (
                <>
                  <Upload className="h-8 w-8 text-slate-400 mb-2" />
                  <p className="text-sm font-medium text-slate-600">Click or drag to upload</p>
                  <p className="text-xs text-slate-400 mt-1">PNG, JPG, WebP, or GIF · Max 10MB</p>
                </>
              )}
            </div>
          )}

          {/* URL Mode */}
          {imageMode === 'url' && (
            <div className="space-y-2">
              <Label htmlFor="photo-url">Image URL</Label>
              <Input
                id="photo-url"
                value={imageUrl}
                onChange={(e) => { setImageUrl(e.target.value); setPreviewUrl(e.target.value); }}
                placeholder="https://example.com/photo.jpg"
              />
            </div>
          )}

          {/* Error */}
          {uploadError && (
            <p className="text-xs text-red-500 flex items-center gap-1">
              <X className="h-3 w-3" />
              {uploadError}
            </p>
          )}

          {/* Preview */}
          {displayPreview && (
            <div className="space-y-2">
              <Label className="text-xs text-slate-500">Preview</Label>
              <div className="h-40 w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                <img
                  src={displayPreview.replace('w=100', 'w=600')}
                  alt="Preview"
                  className="h-full w-full object-cover"
                  onError={(e) => { (e.target as HTMLImageElement).src = ''; }}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading || uploading || !imageUrl}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Photo
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

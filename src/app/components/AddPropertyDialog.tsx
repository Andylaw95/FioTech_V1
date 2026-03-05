import React, { useState, useRef, useCallback } from 'react';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter, 
  DialogTrigger 
} from '@/app/components/ui/dialog';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/app/components/ui/select';
import { Plus, Loader2, Upload, X, ImageIcon, Link2 } from 'lucide-react';
import { api } from '@/app/utils/api';

interface AddPropertyDialogProps {
  onSuccess: () => void;
}

type ImageMode = 'upload' | 'url';

export function AddPropertyDialog({ onSuccess }: AddPropertyDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [imageMode, setImageMode] = useState<ImageMode>('upload');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [previewUrl, setPreviewUrl] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState({
    name: '',
    location: '',
    type: 'Commercial',
    image: ''
  });

  const resetForm = () => {
    setFormData({ name: '', location: '', type: 'Commercial', image: '' });
    setPreviewUrl('');
    setUploadError('');
    setImageMode('upload');
    setDragActive(false);
  };

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

    // Show local preview immediately
    const localPreview = URL.createObjectURL(file);
    setPreviewUrl(localPreview);

    try {
      const result = await api.uploadImage(file);
      setFormData(prev => ({ ...prev, image: result.url }));
      setPreviewUrl(result.url);
    } catch (err: any) {
      console.error('Image upload error:', err);
      setUploadError(err.message || 'Upload failed. Please try again.');
      setPreviewUrl('');
      setFormData(prev => ({ ...prev, image: '' }));
    } finally {
      setUploading(false);
      URL.revokeObjectURL(localPreview);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileUpload(file);
  }, [handleFileUpload]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileUpload(file);
    // Reset input value so re-selecting the same file triggers change
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [handleFileUpload]);

  const clearImage = () => {
    setFormData(prev => ({ ...prev, image: '' }));
    setPreviewUrl('');
    setUploadError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      await api.addProperty(formData);
      setOpen(false);
      resetForm();
      onSuccess();
    } catch (error) {
      console.error('Error creating property:', error);
    } finally {
      setLoading(false);
    }
  };

  const displayPreview = previewUrl || formData.image;

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
      <DialogTrigger asChild>
        <Button className="gap-2 bg-blue-600 hover:bg-blue-700 text-white">
          <Plus className="h-4 w-4" />
          Add Property
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Add New Property</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="grid gap-4 py-4">
          {/* Name */}
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="name" className="text-right">
              Name
            </Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="col-span-3"
              placeholder="e.g. Grand Plaza"
              required
            />
          </div>

          {/* Location */}
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="location" className="text-right">
              Location
            </Label>
            <Input
              id="location"
              value={formData.location}
              onChange={(e) => setFormData({ ...formData, location: e.target.value })}
              className="col-span-3"
              placeholder="e.g. Downtown"
              required
            />
          </div>

          {/* Type */}
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="type" className="text-right">
              Type
            </Label>
            <div className="col-span-3">
              <Select 
                value={formData.type} 
                onValueChange={(value) => setFormData({ ...formData, type: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Commercial">Commercial</SelectItem>
                  <SelectItem value="Residential">Residential</SelectItem>
                  <SelectItem value="Industrial">Industrial</SelectItem>
                  <SelectItem value="Retail">Retail</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Image Section */}
          <div className="grid grid-cols-4 items-start gap-4">
            <Label className="text-right pt-2">
              Image
            </Label>
            <div className="col-span-3 space-y-3">
              {/* Mode Toggle */}
              <div className="flex rounded-lg border border-slate-200 p-0.5 bg-slate-50">
                <button
                  type="button"
                  onClick={() => { setImageMode('upload'); setUploadError(''); }}
                  className={`flex-1 flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
                    imageMode === 'upload'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <Upload className="h-3.5 w-3.5" />
                  Upload File
                </button>
                <button
                  type="button"
                  onClick={() => { setImageMode('url'); setUploadError(''); }}
                  className={`flex-1 flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
                    imageMode === 'url'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <Link2 className="h-3.5 w-3.5" />
                  Paste URL
                </button>
              </div>

              {/* Upload Mode */}
              {imageMode === 'upload' && !displayPreview && (
                <div
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onClick={() => fileInputRef.current?.click()}
                  className={`relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 cursor-pointer transition-all ${
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
                    <>
                      <Loader2 className="h-8 w-8 animate-spin text-blue-500 mb-2" />
                      <p className="text-sm font-medium text-slate-600">Uploading...</p>
                    </>
                  ) : (
                    <>
                      <div className="mb-2 rounded-full bg-slate-100 p-3">
                        <Upload className="h-5 w-5 text-slate-400" />
                      </div>
                      <p className="text-sm font-medium text-slate-600">
                        {dragActive ? 'Drop image here' : 'Click or drag image to upload'}
                      </p>
                      <p className="mt-1 text-xs text-slate-400">PNG, JPG, WebP, GIF up to 10MB</p>
                    </>
                  )}
                </div>
              )}

              {/* URL Mode */}
              {imageMode === 'url' && !displayPreview && (
                <Input
                  value={formData.image}
                  onChange={(e) => {
                    setFormData({ ...formData, image: e.target.value });
                    setPreviewUrl(e.target.value);
                  }}
                  placeholder="https://example.com/building.jpg"
                />
              )}

              {/* Error Message */}
              {uploadError && (
                <p className="text-xs text-red-500 flex items-center gap-1">
                  <X className="h-3 w-3" />
                  {uploadError}
                </p>
              )}

              {/* Image Preview */}
              {displayPreview && (
                <div className="relative group">
                  <div className="h-32 w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                    <img
                      src={displayPreview}
                      alt="Preview"
                      className="h-full w-full object-cover"
                      onError={() => {
                        if (imageMode === 'url') {
                          setUploadError('Could not load image from URL.');
                        }
                      }}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={clearImage}
                    className="absolute -top-2 -right-2 rounded-full bg-red-500 p-1 text-white shadow-md opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                  {uploading && (
                    <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/40">
                      <Loader2 className="h-6 w-6 animate-spin text-white" />
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button type="submit" disabled={loading || uploading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Property
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

'use client';

import { useRef, useState } from 'react';
import { uploadFile } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface FileUploadFieldProps {
  value: string;
  onChange: (url: string) => void;
  label?: string;
  id?: string;
}

/**
 * A URL input paired with a real file picker — pick a file, it uploads to
 * Cloudinary via POST /api/upload, and the resulting URL fills the field.
 * The URL stays directly editable too, so a pre-hosted link still works.
 */
export function FileUploadField({ value, onChange, label = 'File', id }: FileUploadFieldProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const url = await uploadFile(file);
      onChange(url);
    } catch {
      setError('Upload failed. You can paste a URL instead.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          id={id}
          placeholder={`${label} URL (optional)`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={uploading}
          onClick={() => fileInputRef.current?.click()}
        >
          {uploading ? 'Uploading...' : 'Upload File'}
        </Button>
        <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileSelect} />
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

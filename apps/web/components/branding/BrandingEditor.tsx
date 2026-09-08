'use client';

import { useState } from 'react';
import Image from 'next/image';
import { AxiosError } from 'axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { FileUploadField } from '@/components/file-upload-field';
import { darkenColor, defaultBranding } from '@/lib/BrandingContext';

export interface BrandingFormData {
  portalName: string;
  loginMessage: string;
  logoUrl: string;
  primaryColor: string;
  accentColor: string;
  sidebarColor: string; // '' means "auto" (darker shade of primary)
  loginBgColor: string;
  fontFamily: string;
}

export const EMPTY_BRANDING_FORM: BrandingFormData = {
  portalName: defaultBranding.portalName,
  loginMessage: '',
  logoUrl: '',
  primaryColor: defaultBranding.primaryColor,
  accentColor: defaultBranding.accentColor,
  sidebarColor: '',
  loginBgColor: defaultBranding.loginBgColor,
  fontFamily: defaultBranding.fontFamily,
};

const FONT_OPTIONS = ['Inter', 'Roboto', 'Poppins', 'Open Sans'];

function getErrorMessage(err: unknown, fallback: string): string {
  const axiosErr = err as AxiosError<{ error?: string }>;
  return axiosErr.response?.data?.error ?? fallback;
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (hex: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : '#000000'}
          onChange={(e) => onChange(e.target.value)}
          className="h-10 w-10 cursor-pointer rounded border"
        />
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="#000000"
          className="font-mono"
        />
      </div>
    </div>
  );
}

interface BrandingEditorProps {
  title: string;
  initial: BrandingFormData;
  onSave: (data: BrandingFormData) => Promise<void>;
  onPreviewPortal?: (draft: BrandingFormData) => void;
}

export function BrandingEditor({ title, initial, onSave, onPreviewPortal }: BrandingEditorProps) {
  const [form, setForm] = useState<BrandingFormData>(initial);
  const [sidebarAuto, setSidebarAuto] = useState(!initial.sidebarColor);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const effectiveSidebarColor = sidebarAuto ? darkenColor(form.primaryColor) : form.sidebarColor || darkenColor(form.primaryColor);

  async function handleSave() {
    setError(null);
    setSaved(false);
    setSaving(true);
    try {
      await onSave({
        ...form,
        sidebarColor: sidebarAuto ? '' : form.sidebarColor,
      });
      setSaved(true);
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to save branding.'));
    } finally {
      setSaving(false);
    }
  }

  function handleReset() {
    setForm(EMPTY_BRANDING_FORM);
    setSidebarAuto(true);
    setError(null);
    setSaved(false);
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">{title}</h2>

      <Tabs defaultValue="basic">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="basic">Basic</TabsTrigger>
          <TabsTrigger value="colors">Colors</TabsTrigger>
          <TabsTrigger value="advanced">Advanced</TabsTrigger>
        </TabsList>

        {/* TAB 1 — Basic */}
        <TabsContent value="basic" className="space-y-4 pt-4">
          <div className="space-y-2">
            <Label htmlFor="portal-name">Portal Name</Label>
            <Input
              id="portal-name"
              placeholder="City Grammar School Portal"
              value={form.portalName}
              onChange={(e) => setForm((f) => ({ ...f, portalName: e.target.value }))}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="login-message">Login Message</Label>
            <Input
              id="login-message"
              placeholder="Welcome to City Grammar!"
              value={form.loginMessage}
              onChange={(e) => setForm((f) => ({ ...f, loginMessage: e.target.value }))}
            />
          </div>

          <div className="space-y-2">
            <Label>Logo</Label>
            {form.logoUrl && (
              <Image
                src={form.logoUrl}
                alt="Logo preview"
                width={200}
                height={64}
                unoptimized
                className="h-16 w-auto rounded border object-contain p-1"
              />
            )}
            <FileUploadField
              value={form.logoUrl}
              onChange={(url) => setForm((f) => ({ ...f, logoUrl: url }))}
              label="Logo"
            />
          </div>
        </TabsContent>

        {/* TAB 2 — Colors */}
        <TabsContent value="colors" className="pt-4">
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-4">
              <ColorField
                label="Primary Color"
                value={form.primaryColor}
                onChange={(hex) => setForm((f) => ({ ...f, primaryColor: hex }))}
              />
              <ColorField
                label="Accent Color"
                value={form.accentColor}
                onChange={(hex) => setForm((f) => ({ ...f, accentColor: hex }))}
              />

              <div className="space-y-2 rounded-md border p-3">
                <div className="flex items-center justify-between">
                  <Label htmlFor="sidebar-auto" className="font-normal">
                    Auto (darker shade of primary)
                  </Label>
                  <Switch id="sidebar-auto" checked={sidebarAuto} onCheckedChange={setSidebarAuto} />
                </div>
                {!sidebarAuto && (
                  <ColorField
                    label="Sidebar Color"
                    value={form.sidebarColor || darkenColor(form.primaryColor)}
                    onChange={(hex) => setForm((f) => ({ ...f, sidebarColor: hex }))}
                  />
                )}
              </div>

              <ColorField
                label="Login Background"
                value={form.loginBgColor}
                onChange={(hex) => setForm((f) => ({ ...f, loginBgColor: hex }))}
              />
            </div>

            {/* Live preview */}
            <div className="space-y-3">
              <p className="text-xs font-medium text-muted-foreground">Live Preview</p>
              <div className="overflow-hidden rounded-lg border shadow-sm">
                <div className="flex">
                  <div
                    className="w-32 space-y-2 p-3 text-xs text-white"
                    style={{ backgroundColor: effectiveSidebarColor }}
                  >
                    <p className="font-semibold">{form.portalName || 'Portal Name'}</p>
                    <p className="rounded px-2 py-1" style={{ backgroundColor: form.primaryColor }}>
                      Dashboard
                    </p>
                    <p className="px-2 py-1 opacity-80">Students</p>
                    <p className="px-2 py-1 opacity-80">Teachers</p>
                  </div>
                  <div className="flex-1 space-y-2 bg-background p-3">
                    <div
                      className="rounded-md px-3 py-1.5 text-center text-xs font-medium text-white"
                      style={{ backgroundColor: form.primaryColor }}
                    >
                      Primary Button
                    </div>
                    <div
                      className="rounded-md px-3 py-1.5 text-center text-xs font-medium text-white"
                      style={{ backgroundColor: form.accentColor }}
                    >
                      Accent Button
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* TAB 3 — Advanced */}
        <TabsContent value="advanced" className="space-y-4 pt-4">
          <div className="space-y-2">
            <Label>Font Family</Label>
            <div className="grid grid-cols-2 gap-2">
              {FONT_OPTIONS.map((font) => (
                <label
                  key={font}
                  className="flex cursor-pointer items-center gap-2 rounded-md border p-2 text-sm"
                >
                  <input
                    type="radio"
                    name="font-family"
                    checked={form.fontFamily === font}
                    onChange={() => setForm((f) => ({ ...f, fontFamily: font }))}
                  />
                  <span style={{ fontFamily: `${font}, sans-serif` }}>{font} — Aa Bb Cc</span>
                </label>
              ))}
            </div>
          </div>

          <Button type="button" variant="outline" onClick={handleReset}>
            Reset to Default
          </Button>
        </TabsContent>
      </Tabs>

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      {saved && !error && <p className="text-sm text-green-600">Branding saved.</p>}

      <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
        {onPreviewPortal && (
          <Button
            type="button"
            variant="outline"
            onClick={() => onPreviewPortal({ ...form, sidebarColor: sidebarAuto ? '' : form.sidebarColor })}
          >
            Preview Portal
          </Button>
        )}
        <Button type="button" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save Branding'}
        </Button>
      </div>
    </div>
  );
}

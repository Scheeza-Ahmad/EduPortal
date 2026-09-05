'use client';

import { useEffect, useState } from 'react';
import { AxiosError } from 'axios';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useBranding } from '@/lib/BrandingContext';
import { ErrorState } from '@/components/shared/ErrorState';
import { BrandingEditor, BrandingFormData, EMPTY_BRANDING_FORM } from '@/components/branding/BrandingEditor';
import { FeaturesEditor } from '@/components/features/FeaturesEditor';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { TimetableSettingsTab } from '@/components/school-settings/TimetableSettingsTab';

function getErrorMessage(err: unknown, fallback: string): string {
  const axiosErr = err as AxiosError<{ error?: string }>;
  return axiosErr.response?.data?.error ?? fallback;
}

export default function SchoolSettingsPage() {
  const { setBranding } = useBranding();
  const [initial, setInitial] = useState<BrandingFormData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [features, setFeaturesState] = useState<Record<string, boolean>>({});
  const [featuresLoading, setFeaturesLoading] = useState(true);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<{
        success: boolean;
        data: Partial<{
          portalName: string;
          loginMessage: string | null;
          logoUrl: string | null;
          primaryColor: string;
          accentColor: string;
          sidebarColor: string | null;
          loginBgColor: string;
          fontFamily: string;
        }>;
      }>('/api/admin/school-settings/branding');
      const b = res.data.data;
      setInitial({
        portalName: b.portalName || EMPTY_BRANDING_FORM.portalName,
        loginMessage: b.loginMessage ?? '',
        logoUrl: b.logoUrl ?? '',
        primaryColor: b.primaryColor || EMPTY_BRANDING_FORM.primaryColor,
        accentColor: b.accentColor || EMPTY_BRANDING_FORM.accentColor,
        sidebarColor: b.sidebarColor ?? '',
        loginBgColor: b.loginBgColor || EMPTY_BRANDING_FORM.loginBgColor,
        fontFamily: b.fontFamily || EMPTY_BRANDING_FORM.fontFamily,
      });
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load school settings.'));
    } finally {
      setLoading(false);
    }
  }

  async function loadFeatures() {
    setFeaturesLoading(true);
    try {
      const res = await api.get<{ success: boolean; data: Record<string, boolean> }>(
        '/api/admin/school-settings/features'
      );
      setFeaturesState(res.data.data);
    } catch {
      setFeaturesState({});
    } finally {
      setFeaturesLoading(false);
    }
  }

  useEffect(() => {
    load();
    loadFeatures();
  }, []);

  async function handleSave(data: BrandingFormData) {
    const res = await api.patch<{
      success: boolean;
      data: {
        portalName: string | null;
        logoUrl: string | null;
        primaryColor: string;
        sidebarColor: string | null;
        accentColor: string;
        fontFamily: string;
        loginBgColor: string;
        loginMessage: string | null;
      };
    }>('/api/admin/school-settings/branding', {
      portalName: data.portalName || undefined,
      loginMessage: data.loginMessage || null,
      logoUrl: data.logoUrl || null,
      primaryColor: data.primaryColor,
      accentColor: data.accentColor,
      sidebarColor: data.sidebarColor || null,
      loginBgColor: data.loginBgColor,
      fontFamily: data.fontFamily,
    });

    // Apply immediately — this admin is a user of the very portal they just
    // re-branded, so the sidebar/colors should update without a re-login.
    const saved = res.data.data;
    setBranding({
      portalName: saved.portalName || EMPTY_BRANDING_FORM.portalName,
      logoUrl: saved.logoUrl,
      primaryColor: saved.primaryColor,
      sidebarColor: saved.sidebarColor,
      accentColor: saved.accentColor,
      fontFamily: saved.fontFamily,
      loginBgColor: saved.loginBgColor,
      loginMessage: saved.loginMessage,
    });
    toast.success('Branding updated!');
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">School Settings & Branding</h1>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : initial ? (
        <Tabs defaultValue="branding">
          <TabsList>
            <TabsTrigger value="branding">Branding</TabsTrigger>
            <TabsTrigger value="features">Features</TabsTrigger>
            <TabsTrigger value="timetable">Timetable Settings</TabsTrigger>
          </TabsList>

          <TabsContent value="branding" className="pt-4">
            <BrandingEditor title="Customize Your Portal" initial={initial} onSave={handleSave} />
          </TabsContent>

          <TabsContent value="features" className="space-y-4 pt-4">
            {featuresLoading ? (
              <p className="text-sm text-muted-foreground">Loading features...</p>
            ) : (
              <>
                <FeaturesEditor values={features} readOnly />
                <p className="text-xs text-muted-foreground">
                  To enable or disable features, contact your EduPortal administrator.
                </p>
              </>
            )}
          </TabsContent>

          <TabsContent value="timetable" className="pt-4">
            <TimetableSettingsTab />
          </TabsContent>
        </Tabs>
      ) : null}
    </div>
  );
}

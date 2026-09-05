'use client';

import { useEffect, useState } from 'react';
import { AxiosError } from 'axios';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { FEATURES, FEATURE_CATEGORIES } from '@/lib/features';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const CATEGORY_ICON: Record<string, string> = {
  Academic: '📚',
  Management: '🏢',
  Finance: '💰',
  Communication: '📱',
  Advanced: '🤖',
};

function getErrorMessage(err: unknown, fallback: string): string {
  const axiosErr = err as AxiosError<{ error?: string }>;
  return axiosErr.response?.data?.error ?? fallback;
}

interface FeaturesEditorProps {
  values: Record<string, boolean>;
  /** Read-only view (Admin) — shows Enabled/Disabled labels, no switches. */
  readOnly?: boolean;
  /** Only used when not read-only — persists one flag change. Throwing
   * reverts the toggle and shows the thrown message as a toast. */
  onToggle?: (key: string, enabled: boolean) => Promise<void>;
}

export function FeaturesEditor({ values, readOnly, onToggle }: FeaturesEditorProps) {
  const [localValues, setLocalValues] = useState(values);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  useEffect(() => {
    setLocalValues(values);
  }, [values]);

  async function handleToggle(key: string, enabled: boolean) {
    if (!onToggle) return;
    setLocalValues((v) => ({ ...v, [key]: enabled }));
    setSavingKey(key);
    try {
      await onToggle(key, enabled);
      toast.success('Feature updated');
    } catch (err) {
      setLocalValues((v) => ({ ...v, [key]: !enabled }));
      toast.error(getErrorMessage(err, 'Failed to update feature.'));
    } finally {
      setSavingKey(null);
    }
  }

  return (
    <div className="space-y-4">
      {FEATURE_CATEGORIES.map((category) => {
        const items = FEATURES.filter((f) => f.category === category);
        if (items.length === 0) return null;

        return (
          <Card key={category}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">
                {CATEGORY_ICON[category] ?? ''} {category}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {items.map((f) => {
                const enabled = localValues[f.key] ?? true;
                return (
                  <div
                    key={f.key}
                    className="flex items-start justify-between gap-4 border-b pb-3 last:border-0 last:pb-0"
                  >
                    <div className="flex items-start gap-2">
                      <span className="text-lg leading-none">{f.icon}</span>
                      <div>
                        <p className="text-sm font-medium">{f.label}</p>
                        <p className="text-xs text-muted-foreground">{f.description}</p>
                      </div>
                    </div>
                    {readOnly ? (
                      <span
                        className={cn(
                          'shrink-0 text-sm font-medium',
                          enabled ? 'text-green-600' : 'text-muted-foreground'
                        )}
                      >
                        {enabled ? '✅ Enabled' : '❌ Disabled'}
                      </span>
                    ) : (
                      <Switch
                        checked={enabled}
                        disabled={savingKey === f.key}
                        onCheckedChange={(checked) => handleToggle(f.key, checked)}
                      />
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

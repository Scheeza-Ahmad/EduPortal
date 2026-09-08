'use client';

import { useEffect, useState } from 'react';
import { AxiosError } from 'axios';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';

interface DayOverride {
  schoolStartTime?: string;
  schoolEndTime?: string;
  periodDuration?: number;
  breakStartTime?: string;
  breakDuration?: number;
}

interface TimetableSettings {
  schoolStartTime: string;
  schoolEndTime: string;
  periodDuration: number;
  breakStartTime: string;
  breakDuration: number;
  workingDays: string[];
  dayOverrides: Record<string, DayOverride>;
}

const DEFAULT_SETTINGS: TimetableSettings = {
  schoolStartTime: '08:00',
  schoolEndTime: '14:00',
  periodDuration: 45,
  breakStartTime: '10:30',
  breakDuration: 20,
  workingDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
  dayOverrides: {},
};

const DAY_OPTIONS: { value: string; label: string }[] = [
  { value: 'monday', label: 'Monday' },
  { value: 'tuesday', label: 'Tuesday' },
  { value: 'wednesday', label: 'Wednesday' },
  { value: 'thursday', label: 'Thursday' },
  { value: 'friday', label: 'Friday' },
  { value: 'saturday', label: 'Saturday' },
];

function getErrorMessage(err: unknown, fallback: string): string {
  const axiosErr = err as AxiosError<{ error?: string }>;
  return axiosErr.response?.data?.error ?? fallback;
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

/** Same skip-the-break logic as the backend's buildDailyPeriods — used only
 * to render the live preview, the actual generation always re-derives this
 * from the saved settings. */
function countPeriodsPerDay(s: {
  schoolStartTime: string;
  schoolEndTime: string;
  periodDuration: number;
  breakStartTime: string;
  breakDuration: number;
}): number {
  const dayStart = timeToMinutes(s.schoolStartTime);
  const dayEnd = timeToMinutes(s.schoolEndTime);
  const breakStart = timeToMinutes(s.breakStartTime);
  const breakEnd = breakStart + s.breakDuration;

  let count = 0;
  let cursor = dayStart;
  while (cursor + s.periodDuration <= dayEnd) {
    const periodEnd = cursor + s.periodDuration;
    if (cursor < breakEnd && periodEnd > breakStart) {
      cursor = breakEnd;
      continue;
    }
    count += 1;
    cursor = periodEnd;
  }
  return count;
}

/** Merges a day's override (if any) over the base settings, for both the
 * preview text and the override form's placeholder/default values. */
function effectiveDaySettings(base: TimetableSettings, day: string) {
  return { ...base, ...(base.dayOverrides[day] ?? {}) };
}

export function TimetableSettingsTab() {
  const [settings, setSettings] = useState<TimetableSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<{ success: boolean; data: Partial<TimetableSettings> }>(
        '/api/admin/school-settings/timetable'
      );
      setSettings({ ...DEFAULT_SETTINGS, ...res.data.data });
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load timetable settings.'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function toggleDay(day: string) {
    setSettings((s) => ({
      ...s,
      workingDays: s.workingDays.includes(day)
        ? s.workingDays.filter((d) => d !== day)
        : [...s.workingDays, day],
    }));
  }

  /** Turns a per-day override on/off — e.g. Friday being a half day.
   * Turning it on seeds the override with the base settings so the inputs
   * start populated; turning it off drops the day's key entirely. */
  function toggleDayOverride(day: string, enabled: boolean) {
    setSettings((s) => {
      const next = { ...s.dayOverrides };
      if (enabled) {
        next[day] = {
          schoolStartTime: s.schoolStartTime,
          schoolEndTime: s.schoolEndTime,
          periodDuration: s.periodDuration,
          breakStartTime: s.breakStartTime,
          breakDuration: s.breakDuration,
        };
      } else {
        delete next[day];
      }
      return { ...s, dayOverrides: next };
    });
  }

  function updateDayOverride(day: string, patch: Partial<DayOverride>) {
    setSettings((s) => ({
      ...s,
      dayOverrides: { ...s.dayOverrides, [day]: { ...s.dayOverrides[day], ...patch } },
    }));
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await api.patch<{ success: boolean; data: TimetableSettings }>(
        '/api/admin/school-settings/timetable',
        settings
      );
      setSettings(res.data.data);
      toast.success('Timetable settings saved!');
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to save timetable settings.'));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="text-sm text-muted-foreground">Loading...</p>;

  const periodsPerDay = countPeriodsPerDay(settings);

  return (
    <div className="max-w-xl space-y-6">
      <Card>
        <CardContent className="space-y-4 pt-6">
          <p className="text-sm font-medium">School Hours</p>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="school-start">Start Time</Label>
              <Input
                id="school-start"
                type="time"
                value={settings.schoolStartTime}
                onChange={(e) => setSettings((s) => ({ ...s, schoolStartTime: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="school-end">End Time</Label>
              <Input
                id="school-end"
                type="time"
                value={settings.schoolEndTime}
                onChange={(e) => setSettings((s) => ({ ...s, schoolEndTime: e.target.value }))}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 pt-6">
          <p className="text-sm font-medium">Period Settings</p>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="period-duration">Period Duration (minutes)</Label>
              <Input
                id="period-duration"
                type="number"
                min={15}
                max={120}
                value={settings.periodDuration}
                onChange={(e) => setSettings((s) => ({ ...s, periodDuration: Number(e.target.value) }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="break-duration">Break Duration (minutes)</Label>
              <Input
                id="break-duration"
                type="number"
                min={0}
                max={120}
                value={settings.breakDuration}
                onChange={(e) => setSettings((s) => ({ ...s, breakDuration: Number(e.target.value) }))}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="break-start">Break Start</Label>
            <Input
              id="break-start"
              type="time"
              value={settings.breakStartTime}
              onChange={(e) => setSettings((s) => ({ ...s, breakStartTime: e.target.value }))}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 pt-6">
          <p className="text-sm font-medium">Working Days</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {DAY_OPTIONS.map((day) => (
              <label key={day.value} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={settings.workingDays.includes(day.value)}
                  onChange={() => toggleDay(day.value)}
                />
                {day.label}
              </label>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 pt-6">
          <div>
            <p className="text-sm font-medium">Day-Specific Timings</p>
            <p className="text-xs text-muted-foreground">
              For a day with different hours — e.g. Friday ending early for a half day.
            </p>
          </div>
          <div className="space-y-3">
            {DAY_OPTIONS.filter((d) => settings.workingDays.includes(d.value)).map((day) => {
              const override = settings.dayOverrides[day.value];
              const enabled = Boolean(override);
              const effective = effectiveDaySettings(settings, day.value);
              return (
                <div key={day.value} className="rounded-md border p-3 space-y-3">
                  <label className="flex items-center gap-2 text-sm font-medium">
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      checked={enabled}
                      onChange={(e) => toggleDayOverride(day.value, e.target.checked)}
                    />
                    {day.label} — different timing
                  </label>

                  {enabled && (
                    <div className="grid grid-cols-2 gap-3 pl-6">
                      <div className="space-y-1">
                        <Label className="text-xs">Start Time</Label>
                        <Input
                          type="time"
                          value={override?.schoolStartTime ?? settings.schoolStartTime}
                          onChange={(e) => updateDayOverride(day.value, { schoolStartTime: e.target.value })}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">End Time</Label>
                        <Input
                          type="time"
                          value={override?.schoolEndTime ?? settings.schoolEndTime}
                          onChange={(e) => updateDayOverride(day.value, { schoolEndTime: e.target.value })}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Period Duration (min)</Label>
                        <Input
                          type="number"
                          min={15}
                          max={120}
                          value={override?.periodDuration ?? settings.periodDuration}
                          onChange={(e) =>
                            updateDayOverride(day.value, { periodDuration: Number(e.target.value) })
                          }
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Break Duration (min)</Label>
                        <Input
                          type="number"
                          min={0}
                          max={120}
                          value={override?.breakDuration ?? settings.breakDuration}
                          onChange={(e) =>
                            updateDayOverride(day.value, { breakDuration: Number(e.target.value) })
                          }
                        />
                      </div>
                      <div className="col-span-2 space-y-1">
                        <Label className="text-xs">Break Start</Label>
                        <Input
                          type="time"
                          value={override?.breakStartTime ?? settings.breakStartTime}
                          onChange={(e) => updateDayOverride(day.value, { breakStartTime: e.target.value })}
                        />
                      </div>
                      <p className="col-span-2 text-xs text-muted-foreground">
                        {countPeriodsPerDay(effective)} periods on {day.label}.
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <div className="rounded-md border border-dashed bg-muted/30 p-3 text-sm text-muted-foreground">
        With these settings:{' '}
        <span className="font-medium text-foreground">{periodsPerDay} periods per day</span> ({settings.periodDuration}{' '}
        min each) on a normal day. Break at {settings.breakStartTime} for {settings.breakDuration} minutes.
        {Object.keys(settings.dayOverrides).length > 0 && ' Days with different timing are shown above.'}
      </div>

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      <Button onClick={handleSave} disabled={saving}>
        {saving ? 'Saving...' : 'Save Timetable Settings'}
      </Button>
    </div>
  );
}

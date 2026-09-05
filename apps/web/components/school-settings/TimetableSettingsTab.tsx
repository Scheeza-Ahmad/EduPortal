'use client';

import { useEffect, useState } from 'react';
import { AxiosError } from 'axios';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';

interface TimetableSettings {
  schoolStartTime: string;
  schoolEndTime: string;
  periodDuration: number;
  breakStartTime: string;
  breakDuration: number;
  workingDays: string[];
}

const DEFAULT_SETTINGS: TimetableSettings = {
  schoolStartTime: '08:00',
  schoolEndTime: '14:00',
  periodDuration: 45,
  breakStartTime: '10:30',
  breakDuration: 20,
  workingDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
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
function countPeriodsPerDay(s: TimetableSettings): number {
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

      <div className="rounded-md border border-dashed bg-muted/30 p-3 text-sm text-muted-foreground">
        With these settings: <span className="font-medium text-foreground">{periodsPerDay} periods per day</span>{' '}
        ({settings.periodDuration} min each). Break at {settings.breakStartTime} for {settings.breakDuration} minutes.
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

'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface Stats {
  totalStudents: number;
  totalTeachers: number;
  totalClasses: number;
  totalActivities: number;
  attendanceRate: number;
}

const STAT_CARDS: { key: keyof Stats; label: string; suffix?: string }[] = [
  { key: 'totalStudents', label: 'Total Students' },
  { key: 'totalTeachers', label: 'Total Teachers' },
  { key: 'totalClasses', label: 'Total Classes' },
  { key: 'totalActivities', label: 'Total Activities' },
  { key: 'attendanceRate', label: 'Attendance Rate (this month)', suffix: '%' },
];

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    api
      .get<{ success: boolean; data: Stats }>('/api/admin/stats')
      .then((res) => {
        if (!cancelled) setStats(res.data.data);
      })
      .catch(() => {
        if (!cancelled) setError('Failed to load dashboard stats.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading dashboard...</p>;
  }

  if (error) {
    return <p className="text-sm text-destructive">{error}</p>;
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {STAT_CARDS.map(({ key, label, suffix }) => (
        <Card key={key}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">
              {stats?.[key] ?? 0}
              {suffix ?? ''}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

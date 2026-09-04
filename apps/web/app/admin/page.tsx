'use client';

import { useEffect, useState } from 'react';
import { AxiosError } from 'axios';
import { api } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useTranslation } from '@/lib/useTranslation';
import { ErrorState } from '@/components/shared/ErrorState';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

interface Stats {
  totalStudents: number;
  totalTeachers: number;
  totalClasses: number;
  totalActivities: number;
  attendanceRate: number;
}

interface TrendData {
  attendanceTrend: { weekLabel: string; attendanceRate: number }[];
  studentsByClass: { classLabel: string; studentCount: number }[];
}

const STAT_CARDS: { key: keyof Stats; label: string; suffix?: string }[] = [
  { key: 'totalStudents', label: 'Total Students' },
  { key: 'totalTeachers', label: 'Total Teachers' },
  { key: 'totalClasses', label: 'Total Classes' },
  { key: 'totalActivities', label: 'Total Activities' },
  { key: 'attendanceRate', label: 'Attendance Rate (this month)', suffix: '%' },
];

interface WingReport {
  id: string;
  wing: 'junior' | 'senior';
  monthYear: string;
  status: string;
  notes: string | null;
  submittedAt: string;
  coordinator: { name: string; email: string };
}

function getErrorMessage(err: unknown, fallback: string): string {
  const axiosErr = err as AxiosError<{ error?: string }>;
  return axiosErr.response?.data?.error ?? fallback;
}

export default function AdminDashboardPage() {
  const { t } = useTranslation();
  const [stats, setStats] = useState<Stats | null>(null);
  const [trend, setTrend] = useState<TrendData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

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

    api
      .get<{ success: boolean; data: TrendData }>('/api/admin/stats/trend')
      .then((res) => {
        if (!cancelled) setTrend(res.data.data);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [retryKey]);

  if (loading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {STAT_CARDS.map(({ key }) => (
          <Card key={key}>
            <CardHeader className="pb-2">
              <Skeleton className="h-4 w-32" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-16" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <ErrorState message={`Failed to load. ${error}`} onRetry={() => setRetryKey((k) => k + 1)} />
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {STAT_CARDS.map(({ key, suffix }) => (
          <Card key={key}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{t(key)}</CardTitle>
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

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Attendance Trend (Last 6 Weeks)</CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            {!trend || trend.attendanceTrend.length === 0 ? (
              <p className="text-sm text-muted-foreground">No attendance data yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trend.attendanceTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                  <XAxis dataKey="weekLabel" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} domain={[0, 100]} />
                  <Tooltip formatter={(v: number) => `${v}%`} />
                  <Line type="monotone" dataKey="attendanceRate" name="Attendance %" stroke="#0b0b0b" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Students by Class</CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            {!trend || trend.studentsByClass.length === 0 ? (
              <p className="text-sm text-muted-foreground">No classes yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trend.studentsByClass}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                  <XAxis dataKey="classLabel" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="studentCount" name="Students" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <CoordinatorReportsSection />
    </div>
  );
}

function CoordinatorReportsSection() {
  const [reports, setReports] = useState<WingReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [comments, setComments] = useState<Record<string, string>>({});
  const [actingId, setActingId] = useState<string | null>(null);

  async function loadReports() {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<{ success: boolean; data: { reports: WingReport[] } }>('/api/admin/wing-reports');
      setReports(res.data.data.reports);
    } catch {
      setError('Failed to load wing reports.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadReports();
  }, []);

  const pending = reports.filter((r) => r.status === 'submitted');

  async function handleDecision(report: WingReport, decision: 'approve' | 'reject') {
    setActingId(report.id);
    setError(null);
    try {
      await api.patch(`/api/admin/wing-reports/${report.id}/${decision}`, {
        adminComment: comments[report.id] || undefined,
      });
      await loadReports();
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to update wing report.'));
    } finally {
      setActingId(null);
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Coordinator Reports</CardTitle>
        {pending.length > 0 && <Badge variant="destructive">{pending.length} pending</Badge>}
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : error ? (
          <ErrorState message={error} onRetry={loadReports} />
        ) : pending.length === 0 ? (
          <p className="text-sm text-muted-foreground">No wing reports awaiting review.</p>
        ) : (
          <div className="space-y-4">
            {pending.map((r) => (
              <div key={r.id} className="space-y-3 rounded-md border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="font-medium capitalize">{r.wing} Wing</span>
                    <span className="text-sm text-muted-foreground"> — {r.monthYear}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    Submitted by {r.coordinator.name} on {new Date(r.submittedAt).toLocaleDateString()}
                  </span>
                </div>
                {r.notes && <p className="text-sm text-muted-foreground">Notes: {r.notes}</p>}
                <Textarea
                  placeholder="Comment (optional)"
                  value={comments[r.id] ?? ''}
                  onChange={(e) => setComments((c) => ({ ...c, [r.id]: e.target.value }))}
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    disabled={actingId === r.id}
                    onClick={() => handleDecision(r, 'approve')}
                  >
                    {actingId === r.id ? 'Saving...' : 'Approve'}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={actingId === r.id}
                    onClick={() => handleDecision(r, 'reject')}
                  >
                    {actingId === r.id ? 'Saving...' : 'Request Changes'}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

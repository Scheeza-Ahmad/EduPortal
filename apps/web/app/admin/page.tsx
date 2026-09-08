'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { AxiosError } from 'axios';
import { api, fetcher } from '@/lib/api';
import { dynamicChart } from '@/lib/dynamicChart';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useTranslation } from '@/lib/useTranslation';
import type { TranslationKey } from '@/lib/translations';
import { ErrorState } from '@/components/shared/ErrorState';

// Fix 7 — recharts is a heavy dependency; loading it only on the client,
// only for this dashboard, keeps it out of the initial bundle everywhere else.
const ResponsiveContainer = dynamicChart(() => import('recharts').then((m) => m.ResponsiveContainer));
const LineChart = dynamicChart(() => import('recharts').then((m) => m.LineChart));
const BarChart = dynamicChart(() => import('recharts').then((m) => m.BarChart));
const Line = dynamicChart(() => import('recharts').then((m) => m.Line));
const Bar = dynamicChart(() => import('recharts').then((m) => m.Bar));
const CartesianGrid = dynamicChart(() => import('recharts').then((m) => m.CartesianGrid));
const XAxis = dynamicChart(() => import('recharts').then((m) => m.XAxis));
const YAxis = dynamicChart(() => import('recharts').then((m) => m.YAxis));
const Tooltip = dynamicChart(() => import('recharts').then((m) => m.Tooltip));

// Fix 4 — everything below comes from ONE call to /api/admin/dashboard
// instead of separate stats / stats-trend / subjects-demand requests.
interface DashboardData {
  stats: {
    students: number;
    teachers: number;
    classes: number;
    activities: number;
    attendance: number;
  };
  recentAnnouncements: { id: string; title: string; author: { name: string } }[];
  upcomingCalendar: { id: string; title: string; type: string; date: string }[];
  atRiskCount: number;
  pendingLeaves: number;
  chartData: {
    byClass: { classLabel: string; studentCount: number }[];
    attendanceTrend: { weekLabel: string; attendanceRate: number }[];
  };
}

const STAT_CARDS: { key: keyof DashboardData['stats']; translationKey: TranslationKey; suffix?: string }[] = [
  { key: 'students', translationKey: 'totalStudents' },
  { key: 'teachers', translationKey: 'totalTeachers' },
  { key: 'classes', translationKey: 'totalClasses' },
  { key: 'activities', translationKey: 'totalActivities' },
  { key: 'attendance', translationKey: 'attendanceRate', suffix: '%' },
];

interface SubjectDemand {
  wing: 'junior' | 'senior';
  subjectName: string;
  sectionsNeeding: number;
  assignedCount: number;
  poolTeacherCount: number;
  shortage: number;
}

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
  const { data, error, isLoading, mutate } = useSWR<DashboardData>('/api/admin/dashboard', fetcher, {
    refreshInterval: 60000, // keep pending-leave/at-risk counts reasonably fresh without polling hard
  });

  if (isLoading) {
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

  if (error || !data) {
    return (
      <ErrorState message={`Failed to load. ${getErrorMessage(error, 'Unknown error')}`} onRetry={() => mutate()} />
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {STAT_CARDS.map(({ key, translationKey, suffix }) => (
          <Card key={key}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{t(translationKey)}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">
                {data.stats[key] ?? 0}
                {suffix ?? ''}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardContent className="flex items-center justify-between pt-6">
            <span className="text-sm text-muted-foreground">At-Risk Students</span>
            <Badge variant={data.atRiskCount > 0 ? 'destructive' : 'outline'}>{data.atRiskCount}</Badge>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between pt-6">
            <span className="text-sm text-muted-foreground">Pending Leave Requests</span>
            <Badge variant={data.pendingLeaves > 0 ? 'destructive' : 'outline'}>{data.pendingLeaves}</Badge>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Attendance Trend (Last 6 Weeks)</CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            {data.chartData.attendanceTrend.length === 0 ? (
              <p className="text-sm text-muted-foreground">No attendance data yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.chartData.attendanceTrend}>
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
            {data.chartData.byClass.length === 0 ? (
              <p className="text-sm text-muted-foreground">No classes yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.chartData.byClass}>
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

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent Announcements</CardTitle>
          </CardHeader>
          <CardContent>
            {data.recentAnnouncements.length === 0 ? (
              <p className="text-sm text-muted-foreground">No announcements yet.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {data.recentAnnouncements.map((a) => (
                  <li key={a.id} className="flex items-center justify-between">
                    <span>{a.title}</span>
                    <span className="text-xs text-muted-foreground">{a.author.name}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Upcoming Calendar</CardTitle>
          </CardHeader>
          <CardContent>
            {data.upcomingCalendar.length === 0 ? (
              <p className="text-sm text-muted-foreground">No upcoming events.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {data.upcomingCalendar.map((d) => (
                  <li key={d.id} className="flex items-center justify-between">
                    <span>{d.title}</span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(d.date).toLocaleDateString()}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <SubjectTeacherDemandSection />

      <CoordinatorReportsSection />
    </div>
  );
}

/** Shows, per wing, how many teachers each subject needs (based on how many
 * sections currently offer it) versus how many teachers actually have it in
 * their pool, so admin can see shortages. */
function SubjectTeacherDemandSection() {
  const { data, isLoading } = useSWR<{ demand: SubjectDemand[] }>('/api/admin/subjects/demand', fetcher);
  const demand = data?.demand ?? [];

  const junior = demand.filter((d) => d.wing === 'junior');
  const senior = demand.filter((d) => d.wing === 'senior');

  function renderWingTable(rows: SubjectDemand[], label: string) {
    return (
      <div className="space-y-2">
        <p className="text-sm font-medium">{label}</p>
        {rows.length === 0 ? (
          <p className="text-xs text-muted-foreground">No subjects defined for this wing yet.</p>
        ) : (
          <div className="space-y-1">
            {rows.map((d) => (
              <div key={d.subjectName} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                <span>{d.subjectName}</span>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{d.sectionsNeeding} section(s)</span>
                  <span>{d.poolTeacherCount} teacher(s) available</span>
                  {d.shortage > 0 ? (
                    <Badge variant="destructive" className="text-[10px]">
                      Short {d.shortage}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px]">
                      OK
                    </Badge>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Subject Teacher Demand</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {renderWingTable(junior, 'Junior Wing (1-5)')}
            {renderWingTable(senior, 'Senior Wing (6-10)')}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CoordinatorReportsSection() {
  const { data, isLoading, error, mutate } = useSWR<{ reports: WingReport[] }>('/api/admin/wing-reports', fetcher);
  const [comments, setComments] = useState<Record<string, string>>({});
  const [actingId, setActingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const reports = data?.reports ?? [];
  const pending = reports.filter((r) => r.status === 'submitted');

  async function handleDecision(report: WingReport, decision: 'approve' | 'reject') {
    setActingId(report.id);
    setActionError(null);
    try {
      await api.patch(`/api/admin/wing-reports/${report.id}/${decision}`, {
        adminComment: comments[report.id] || undefined,
      });
      await mutate();
    } catch (err) {
      setActionError(getErrorMessage(err, 'Failed to update wing report.'));
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
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : error ? (
          <ErrorState message="Failed to load wing reports." onRetry={() => mutate()} />
        ) : pending.length === 0 ? (
          <p className="text-sm text-muted-foreground">No wing reports awaiting review.</p>
        ) : (
          <div className="space-y-4">
            {actionError && (
              <p className="text-sm text-destructive" role="alert">
                {actionError}
              </p>
            )}
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

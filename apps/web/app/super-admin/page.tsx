'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { dynamicChart } from '@/lib/dynamicChart';
import { CHART_COLORS } from '@/lib/chartColors';

// Fix 7 — recharts kept out of the initial bundle; loaded client-side only
// when this dashboard is actually visited.
const Bar = dynamicChart(() => import('recharts').then((m) => m.Bar));
const BarChart = dynamicChart(() => import('recharts').then((m) => m.BarChart));
const CartesianGrid = dynamicChart(() => import('recharts').then((m) => m.CartesianGrid));
const Cell = dynamicChart(() => import('recharts').then((m) => m.Cell));
const Legend = dynamicChart(() => import('recharts').then((m) => m.Legend));
const Line = dynamicChart(() => import('recharts').then((m) => m.Line));
const LineChart = dynamicChart(() => import('recharts').then((m) => m.LineChart));
const Pie = dynamicChart(() => import('recharts').then((m) => m.Pie));
const PieChart = dynamicChart(() => import('recharts').then((m) => m.PieChart));
const ResponsiveContainer = dynamicChart(() => import('recharts').then((m) => m.ResponsiveContainer));
const Tooltip = dynamicChart(() => import('recharts').then((m) => m.Tooltip));
const XAxis = dynamicChart(() => import('recharts').then((m) => m.XAxis));
const YAxis = dynamicChart(() => import('recharts').then((m) => m.YAxis));
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

// ---------------------------------------------------------------
// Types
// ---------------------------------------------------------------

interface Stats {
  totalSchools: number;
  schoolsPercentChange: number;
  usersByRole: { role: string; count: number }[];
  totalSubmissions: number;
  totalSubmissionsThisMonth: number;
  storage: { usedBytes: number; limitBytes: number; percentUsed: number } | null;
}

interface UserGrowthPoint {
  month: string;
  students: number;
  teachers: number;
  admins: number;
}

interface ActivityTrendPoint {
  date: string;
  activities: number;
  submissions: number;
}

interface SubmissionRate {
  onTime: number;
  late: number;
  pending: number;
}

interface SchoolOverviewRow {
  id: string;
  name: string;
  studentCount: number;
  teacherCount: number;
  submissionCount: number;
  lastActive: string | null;
  isActive: boolean;
}

interface Analytics {
  userGrowth: UserGrowthPoint[];
  activityTrend: ActivityTrendPoint[];
  submissionRate: SubmissionRate;
  schoolsOverview: SchoolOverviewRow[];
}

interface AuditLogEntry {
  id: string;
  userId: string;
  action: string;
  targetTable: string | null;
  createdAt: string;
  user: { name: string } | null;
}

interface PortalRow {
  id: string;
  name: string;
  admin: { id: string; name: string; email: string } | null;
  isActive: boolean;
}

// ---------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------

function formatTimeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function actionIcon(action: string, targetTable: string | null): string {
  if (action.includes('SCHOOL') || targetTable === 'School') return '🏫';
  if (action.includes('GRADE') || targetTable === 'Grade') return '📊';
  if (['BACKUP', 'IMPERSONATE'].some((a) => action.includes(a))) return '⚙️';
  return '👤';
}

function formatBytes(bytes: number): string {
  const gb = bytes / (1024 * 1024 * 1024);
  return `${gb.toFixed(1)}GB`;
}

// ---------------------------------------------------------------
// Overview stat card
// ---------------------------------------------------------------

function StatCard({
  label,
  value,
  delta,
  sub,
}: {
  label: string;
  value: string;
  delta?: number;
  sub?: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-baseline gap-2">
          <p className="text-3xl font-bold">{value}</p>
          {delta !== undefined && (
            <span
              className={cn(
                'text-xs font-medium',
                delta > 0 ? 'text-[#006300]' : delta < 0 ? 'text-destructive' : 'text-muted-foreground'
              )}
            >
              {delta > 0 ? '+' : ''}
              {delta}% vs last month
            </span>
          )}
        </div>
        {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------
// Page
// ---------------------------------------------------------------

type SortKey = 'name' | 'studentCount' | 'teacherCount' | 'submissionCount' | 'lastActive';

export default function SuperAdminDashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [feed, setFeed] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [portals, setPortals] = useState<PortalRow[]>([]);
  const [viewingPortalId, setViewingPortalId] = useState<string | null>(null);

  async function loadFeed() {
    try {
      const res = await api.get<{ success: boolean; data: { logs: AuditLogEntry[] } }>(
        '/api/super/audit-logs?limit=20'
      );
      setFeed(res.data.data.logs);
    } catch {
      // Non-fatal — the feed will just stay empty/stale.
    }
  }

  async function loadPortals() {
    try {
      const res = await api.get<{ success: boolean; data: { schools: PortalRow[] } }>(
        '/api/super/schools?limit=100'
      );
      setPortals(res.data.data.schools);
    } catch {
      // Non-fatal — the portal list will just stay empty.
    }
  }

  async function handleViewPortal(school: PortalRow) {
    setViewingPortalId(school.id);
    try {
      const res = await api.get<{
        success: boolean;
        data: Partial<{
          portalName: string;
          logoUrl: string | null;
          primaryColor: string;
          sidebarColor: string | null;
          accentColor: string;
          fontFamily: string;
          loginBgColor: string;
          loginMessage: string | null;
        }>;
      }>(`/api/super/schools/${school.id}/branding`);
      const b = res.data.data;
      // Temporarily stage this school's branding where the login page (and
      // every portal layout after it) already knows to look, then open a
      // fresh tab so this session's own view is never disturbed.
      localStorage.setItem(
        'school_branding',
        JSON.stringify({
          portalName: b.portalName || school.name,
          logoUrl: b.logoUrl ?? null,
          primaryColor: b.primaryColor || '#1a56db',
          sidebarColor: b.sidebarColor ?? null,
          accentColor: b.accentColor || '#f97316',
          fontFamily: b.fontFamily || 'Inter',
          loginBgColor: b.loginBgColor || '#ffffff',
          loginMessage: b.loginMessage ?? null,
        })
      );
    } catch {
      // ignore — the new tab just won't be pre-branded
    } finally {
      setViewingPortalId(null);
    }
    window.open('/login', '_blank', 'noopener,noreferrer');
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [statsRes, analyticsRes] = await Promise.all([
          api.get<{ success: boolean; data: Stats }>('/api/super/stats'),
          api.get<{ success: boolean; data: Analytics }>('/api/super/analytics'),
        ]);
        if (cancelled) return;
        setStats(statsRes.data.data);
        setAnalytics(analyticsRes.data.data);
        await Promise.all([loadFeed(), loadPortals()]);
      } catch {
        if (!cancelled) setError('Failed to load dashboard data.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    // "Live" feed — refresh every 30s.
    const interval = setInterval(loadFeed, 30000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const totalActiveUsers = stats?.usersByRole.reduce((sum, r) => sum + r.count, 0) ?? 0;
  const usersBreakdown = useMemo(() => {
    if (!stats) return '';
    const byRole = new Map(stats.usersByRole.map((r) => [r.role, r.count]));
    return (
      [
        [byRole.get('school_admin') ?? 0, 'admins'],
        [byRole.get('teacher') ?? 0, 'teachers'],
        [byRole.get('student') ?? 0, 'students'],
        [byRole.get('parent') ?? 0, 'parents'],
      ] as [number, string][]
    )
      .filter(([count]) => count > 0)
      .map(([count, label]) => `${count} ${label}`)
      .join(' · ');
  }, [stats]);

  const submissionDonutData = useMemo(() => {
    if (!analytics) return [];
    const { onTime, late, pending } = analytics.submissionRate;
    return [
      { name: 'On Time', value: onTime, color: CHART_COLORS.good },
      { name: 'Late', value: late, color: CHART_COLORS.critical },
      { name: 'Pending', value: pending, color: CHART_COLORS.warning },
    ];
  }, [analytics]);
  const hasSubmissionData = submissionDonutData.some((d) => d.value > 0);

  const sortedSchools = useMemo(() => {
    if (!analytics) return [];
    const rows = [...analytics.schoolsOverview];
    rows.sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'name') cmp = a.name.localeCompare(b.name);
      else if (sortKey === 'lastActive') {
        cmp = (a.lastActive ? new Date(a.lastActive).getTime() : 0) -
          (b.lastActive ? new Date(b.lastActive).getTime() : 0);
      } else {
        cmp = a[sortKey] - b[sortKey];
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return rows;
  }, [analytics, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  function sortIndicator(key: SortKey) {
    if (sortKey !== key) return '';
    return sortDir === 'asc' ? ' ▲' : ' ▼';
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-28" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-16" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Card>
          <CardHeader>
            <Skeleton className="h-4 w-32" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-64 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return <p className="text-sm text-destructive">{error}</p>;
  }

  return (
    <div className="space-y-6">
      {/* Overview cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total Schools"
          value={String(stats?.totalSchools ?? 0)}
          delta={stats?.schoolsPercentChange}
        />
        <StatCard
          label="Total Active Users"
          value={String(totalActiveUsers)}
          sub={usersBreakdown}
        />
        <StatCard
          label="Submissions This Month"
          value={String(stats?.totalSubmissionsThisMonth ?? 0)}
          sub={`${stats?.totalSubmissions ?? 0} all-time`}
        />
        <StatCard
          label="Platform Storage Used"
          value={stats?.storage ? `${stats.storage.percentUsed}%` : 'N/A'}
          sub={
            stats?.storage
              ? `${formatBytes(stats.storage.usedBytes)} of ${formatBytes(stats.storage.limitBytes)}`
              : 'Cloudinary not configured'
          }
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* Main column: charts + table */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">User Growth (last 6 months)</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={analytics?.userGrowth ?? []}>
                  <CartesianGrid stroke={CHART_COLORS.grid} vertical={false} />
                  <XAxis
                    dataKey="month"
                    stroke={CHART_COLORS.axis}
                    tick={{ fill: CHART_COLORS.textSecondary, fontSize: 12 }}
                    tickLine={false}
                  />
                  <YAxis
                    stroke={CHART_COLORS.axis}
                    tick={{ fill: CHART_COLORS.textSecondary, fontSize: 12 }}
                    tickLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line
                    type="monotone"
                    dataKey="students"
                    name="Students"
                    stroke={CHART_COLORS.series1}
                    strokeWidth={2}
                    dot={{ r: 4, strokeWidth: 2, stroke: '#fff' }}
                  />
                  <Line
                    type="monotone"
                    dataKey="teachers"
                    name="Teachers"
                    stroke={CHART_COLORS.series2}
                    strokeWidth={2}
                    dot={{ r: 4, strokeWidth: 2, stroke: '#fff' }}
                  />
                  <Line
                    type="monotone"
                    dataKey="admins"
                    name="Admins"
                    stroke={CHART_COLORS.series3}
                    strokeWidth={2}
                    dot={{ r: 4, strokeWidth: 2, stroke: '#fff' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Activity (last 7 days)</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={analytics?.activityTrend ?? []} barGap={4}>
                    <CartesianGrid stroke={CHART_COLORS.grid} vertical={false} />
                    <XAxis
                      dataKey="date"
                      stroke={CHART_COLORS.axis}
                      tick={{ fill: CHART_COLORS.textSecondary, fontSize: 11 }}
                      tickLine={false}
                      tickFormatter={(d: string) => d.slice(5)}
                    />
                    <YAxis
                      stroke={CHART_COLORS.axis}
                      tick={{ fill: CHART_COLORS.textSecondary, fontSize: 12 }}
                      tickLine={false}
                      allowDecimals={false}
                    />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar
                      dataKey="activities"
                      name="Activities"
                      fill={CHART_COLORS.series1}
                      radius={[4, 4, 0, 0]}
                      maxBarSize={24}
                    />
                    <Bar
                      dataKey="submissions"
                      name="Submissions"
                      fill={CHART_COLORS.series2}
                      radius={[4, 4, 0, 0]}
                      maxBarSize={24}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Submission Rate</CardTitle>
              </CardHeader>
              <CardContent>
                {hasSubmissionData ? (
                  <ResponsiveContainer width="100%" height={240}>
                    <PieChart>
                      <Pie
                        data={submissionDonutData}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={55}
                        outerRadius={85}
                        paddingAngle={2}
                        label={({ percent }: { percent?: number }) => `${Math.round((percent ?? 0) * 100)}%`}
                      >
                        {submissionDonutData.map((entry) => (
                          <Cell key={entry.name} fill={entry.color} stroke="#fcfcfb" strokeWidth={2} />
                        ))}
                      </Pie>
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-[240px] items-center justify-center text-center text-sm text-muted-foreground">
                    No submissions yet — data will appear once students start
                    submitting assignments
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Schools Overview</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    {(
                      [
                        ['name', 'School'],
                        ['studentCount', 'Students'],
                        ['teacherCount', 'Teachers'],
                        ['submissionCount', 'Submissions'],
                        ['lastActive', 'Last Active'],
                      ] as [SortKey, string][]
                    ).map(([key, label]) => (
                      <th
                        key={key}
                        className="cursor-pointer select-none py-2 pr-4 font-medium"
                        onClick={() => toggleSort(key)}
                      >
                        {label}
                        {sortIndicator(key)}
                      </th>
                    ))}
                    <th className="py-2 pr-4 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedSchools.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-6 text-center text-muted-foreground">
                        No schools yet.
                      </td>
                    </tr>
                  ) : (
                    sortedSchools.map((school) => (
                      <Fragment key={school.id}>
                        <tr
                          className="cursor-pointer border-b last:border-b-0 hover:bg-muted/40"
                          onClick={() =>
                            setExpandedId((id) => (id === school.id ? null : school.id))
                          }
                        >
                          <td className="py-2 pr-4 font-medium">{school.name}</td>
                          <td className="py-2 pr-4">{school.studentCount}</td>
                          <td className="py-2 pr-4">{school.teacherCount}</td>
                          <td className="py-2 pr-4">{school.submissionCount}</td>
                          <td className="py-2 pr-4 text-muted-foreground">
                            {school.lastActive ? formatTimeAgo(school.lastActive) : 'Never'}
                          </td>
                          <td className="py-2 pr-4">
                            <Badge variant={school.isActive ? 'default' : 'secondary'}>
                              {school.isActive ? 'Active' : 'Inactive'}
                            </Badge>
                          </td>
                        </tr>
                        {expandedId === school.id && (
                          <tr className="border-b bg-muted/20 last:border-b-0">
                            <td colSpan={6} className="px-4 py-3 text-xs text-muted-foreground">
                              Submissions per student:{' '}
                              {school.studentCount > 0
                                ? (school.submissionCount / school.studentCount).toFixed(1)
                                : '—'}{' '}
                              · Last activity:{' '}
                              {school.lastActive
                                ? new Date(school.lastActive).toLocaleString()
                                : 'No recorded activity yet'}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar: recent activity feed */}
        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="text-base">Recent Activity</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {feed.length === 0 ? (
              <p className="text-sm text-muted-foreground">No recent activity.</p>
            ) : (
              feed.map((entry) => (
                <div key={entry.id} className="flex items-start gap-2 text-sm">
                  <span className="text-base leading-none">
                    {actionIcon(entry.action, entry.targetTable)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{entry.action}</p>
                    <p className="text-xs text-muted-foreground">
                      by {entry.user?.name ?? 'Unknown user'} · {formatTimeAgo(entry.createdAt)}
                    </p>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">School Portals</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {portals.length === 0 ? (
            <p className="text-sm text-muted-foreground">No schools yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2 pr-4 font-medium">School Name</th>
                  <th className="py-2 pr-4 font-medium">Admin</th>
                  <th className="py-2 pr-4 font-medium">Status</th>
                  <th className="py-2 pr-4 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {portals.map((school) => (
                  <tr key={school.id} className="border-b last:border-b-0">
                    <td className="py-2 pr-4 font-medium">{school.name}</td>
                    <td className="py-2 pr-4 text-muted-foreground">
                      {school.admin ? school.admin.name : 'Not assigned'}
                    </td>
                    <td className="py-2 pr-4">
                      <Badge variant={school.isActive ? 'default' : 'secondary'}>
                        {school.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </td>
                    <td className="py-2 pr-4 space-x-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={viewingPortalId === school.id}
                        onClick={() => handleViewPortal(school)}
                      >
                        {viewingPortalId === school.id ? '...' : 'View Portal'}
                      </Button>
                      <Button variant="outline" size="sm" asChild>
                        <Link href="/super-admin/schools">Customize</Link>
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

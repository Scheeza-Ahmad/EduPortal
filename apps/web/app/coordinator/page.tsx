'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuthStore } from '@/lib/store';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

interface Stats {
  totalTeachers: number;
  totalStudents: number;
  totalClasses: number;
  activitiesThisMonth: number;
  submissionRate: number;
  attendanceRate: number;
  pendingReports: number;
  atRiskStudents: number;
}

interface TeacherActivity {
  teacherId: string;
  teacherName: string;
  classesCount: number;
  activitiesThisMonth: number;
  lastActiveDate: string | null;
  activityStatus: 'active' | 'low' | 'inactive';
  reportStatus: string;
}

interface RecentReport {
  id: string;
  teacherName: string;
  monthYear: string;
  status: string;
}

interface Alert {
  type: string;
  message: string;
}

interface AttendanceTrendPoint {
  weekLabel: string;
  attendanceRate: number;
}

interface AtRiskByClass {
  classLabel: string;
  count: number;
}

interface Dashboard {
  wing: 'junior' | 'senior';
  wingLabel: string;
  stats: Stats;
  teacherActivity: TeacherActivity[];
  recentReports: RecentReport[];
  alerts: Alert[];
  attendanceTrend: AttendanceTrendPoint[];
  atRiskByClass: AtRiskByClass[];
}

const ACTIVITY_COLORS: Record<string, string> = {
  active: '#22c55e',
  low: '#eab308',
  inactive: '#ef4444',
};

const REPORT_STATUS_COLORS: Record<string, string> = {
  approved: '#22c55e',
  forwarded: '#3b82f6',
  reviewed: '#8b5cf6',
  submitted: '#eab308',
  draft: '#94a3b8',
  rejected: '#ef4444',
};

const ALERT_ICON: Record<string, string> = {
  inactive_teacher: '🔴',
  low_attendance: '🟡',
  pending_report: '📋',
};

function monthYearLabel(): string {
  return new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' });
}

function shortName(name: string): string {
  const parts = name.split(' ');
  return parts.length > 1 ? `${parts[0]} ${parts[1][0]}.` : name;
}

export default function CoordinatorDashboardPage() {
  const router = useRouter();
  const userName = useAuthStore((s) => s.user?.name);
  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<{ success: boolean; data: Dashboard }>('/api/coordinator/dashboard')
      .then((res) => setData(res.data.data))
      .catch(() => setError('Failed to load dashboard.'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-sm text-muted-foreground">Loading dashboard...</p>;
  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!data) return null;

  const teacherChartData = data.teacherActivity.map((t) => ({
    name: shortName(t.teacherName),
    activities: t.activitiesThisMonth,
    status: t.activityStatus,
  }));

  const reportStatusCounts = new Map<string, number>();
  for (const r of data.recentReports) {
    reportStatusCounts.set(r.status, (reportStatusCounts.get(r.status) ?? 0) + 1);
  }
  const donutData = Array.from(reportStatusCounts.entries()).map(([name, value]) => ({ name, value }));
  const totalReports = data.recentReports.length;

  return (
    <div className="space-y-6">
      {/* Row 1 — Welcome banner */}
      <div className="rounded-lg bg-zinc-900 p-5 text-white">
        <h1 className="text-lg font-semibold">
          Welcome, {userName ?? 'Coordinator'} — {data.wingLabel.split(' (')[0]} Coordinator
        </h1>
        <p className="mt-1 text-sm text-zinc-300">
          {data.wingLabel} | {monthYearLabel()}
        </p>
      </div>

      {/* Row 2 — Stats cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Total Teachers" value={String(data.stats.totalTeachers)} bg="#6366f1" icon="👩‍🏫" />
        <StatCard label="Total Students" value={String(data.stats.totalStudents)} bg="#3b82f6" icon="🎓" />
        <StatCard label="Total Classes" value={String(data.stats.totalClasses)} bg="#8b5cf6" icon="🏫" />
        <StatCard label="Activities This Month" value={String(data.stats.activitiesThisMonth)} bg="#22c55e" icon="📝" />
        <StatCard label="Submission Rate" value={`${data.stats.submissionRate}%`} bg="#f97316" icon="📊" />
        <StatCard label="Pending Reports" value={String(data.stats.pendingReports)} bg="#ef4444" icon="📋" />
      </div>

      {/* Row 3 — Teacher activity + report status donut */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle className="text-base">Teacher Activity — This Month</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            {teacherChartData.length === 0 ? (
              <p className="text-sm text-muted-foreground">No teachers in this wing yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={teacherChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="activities" name="Activities" radius={[4, 4, 0, 0]}>
                    {teacherChartData.map((entry, i) => (
                      <Cell key={i} fill={ACTIVITY_COLORS[entry.status]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Monthly Reports Status</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            {donutData.length === 0 ? (
              <p className="text-sm text-muted-foreground">No reports yet.</p>
            ) : (
              <div className="relative h-full w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={donutData} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="80%" paddingAngle={2}>
                      {donutData.map((entry) => (
                        <Cell key={entry.name} fill={REPORT_STATUS_COLORS[entry.name] ?? '#94a3b8'} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center pb-8">
                  <span className="text-2xl font-bold">{totalReports}</span>
                  <span className="text-xs text-muted-foreground">Reports</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Row 4 — Attendance trend + at-risk by class */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Wing Attendance Trend</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            {data.attendanceTrend.length === 0 ? (
              <p className="text-sm text-muted-foreground">No attendance data yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.attendanceTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                  <XAxis dataKey="weekLabel" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} domain={[0, 100]} />
                  <Tooltip formatter={(v: number) => `${v}%`} />
                  <ReferenceLine y={75} stroke="#ef4444" strokeDasharray="4 4" label={{ value: 'Target 75%', fontSize: 10, fill: '#ef4444' }} />
                  <Line type="monotone" dataKey="attendanceRate" name="Attendance %" stroke="#6366f1" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">At-Risk Students by Class</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            {data.atRiskByClass.length === 0 ? (
              <p className="text-sm text-muted-foreground">No classes yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.atRiskByClass}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                  <XAxis dataKey="classLabel" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="count" name="At-Risk Students" fill="#ef4444" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Row 5 — Teacher status table + recent alerts */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Teacher Status</CardTitle>
          </CardHeader>
          <CardContent>
            {data.teacherActivity.length === 0 ? (
              <p className="text-sm text-muted-foreground">No teachers in this wing yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs text-muted-foreground">
                      <th className="py-1 pr-2">Teacher</th>
                      <th className="py-1 pr-2">Classes</th>
                      <th className="py-1 pr-2">Activities</th>
                      <th className="py-1 pr-2">Last Active</th>
                      <th className="py-1 pr-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.teacherActivity.map((t) => (
                      <tr
                        key={t.teacherId}
                        className="cursor-pointer border-b last:border-0 hover:bg-muted/40"
                        onClick={() => router.push(`/coordinator/teachers/${t.teacherId}`)}
                      >
                        <td className="py-1.5 pr-2 font-medium">{t.teacherName}</td>
                        <td className="py-1.5 pr-2 text-muted-foreground">{t.classesCount}</td>
                        <td className="py-1.5 pr-2">{t.activitiesThisMonth}</td>
                        <td className="py-1.5 pr-2 text-muted-foreground">
                          {t.lastActiveDate ? new Date(t.lastActiveDate).toLocaleDateString() : '—'}
                        </td>
                        <td className="py-1.5 pr-2">
                          <StatusPill status={t.activityStatus} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent Alerts</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.alerts.length === 0 ? (
              <p className="text-sm text-muted-foreground">No alerts right now 🎉</p>
            ) : (
              data.alerts.map((a, i) => (
                <div key={i} className="flex items-start gap-2 rounded-md border p-2 text-sm">
                  <span>{ALERT_ICON[a.type] ?? '•'}</span>
                  <span>{a.message}</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, bg }: { icon: string; label: string; value: string; bg: string }) {
  return (
    <div className="rounded-lg p-4 text-white shadow-sm" style={{ backgroundColor: bg }}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium opacity-90">{label}</span>
        <span className="text-lg">{icon}</span>
      </div>
      <div className="mt-2 text-lg font-semibold">{value}</div>
    </div>
  );
}

function StatusPill({ status }: { status: 'active' | 'low' | 'inactive' }) {
  const style =
    status === 'active'
      ? 'bg-green-100 text-green-800'
      : status === 'low'
        ? 'bg-yellow-100 text-yellow-800'
        : 'bg-red-100 text-red-800';
  return <Badge variant="outline" className={`${style} hover:${style}`}>{status.toUpperCase()}</Badge>;
}

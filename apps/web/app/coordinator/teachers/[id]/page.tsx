'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

interface ActivityEntry {
  id: string;
  title: string;
  createdAt: string;
  dueDate: string;
  subject: { name: string };
}

interface MonthlyReportRow {
  id: string;
  monthYear: string;
  status: string;
  activitiesCount: number;
  attendanceRate: number;
}

interface TeacherDetail {
  teacher: { id: string; name: string; email: string; wing: string; lastLoginAt: string | null };
  classes: { classLabel: string; subject: string }[];
  classTeacherOf: string[];
  activitiesLast3Months: ActivityEntry[];
  attendanceRateThisMonth: number;
  monthlyReports: MonthlyReportRow[];
  summary: { activitiesThisMonth: number; activityStatus: string } | null;
}

function monthKey(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function CoordinatorTeacherDetailPage() {
  const params = useParams<{ id: string }>();
  const [data, setData] = useState<TeacherDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reminding, setReminding] = useState(false);
  const [reminded, setReminded] = useState(false);

  useEffect(() => {
    api
      .get<{ success: boolean; data: TeacherDetail }>(`/api/coordinator/teachers/${params.id}`)
      .then((res) => setData(res.data.data))
      .catch(() => setError('Failed to load teacher details.'))
      .finally(() => setLoading(false));
  }, [params.id]);

  async function handleRemind() {
    setReminding(true);
    try {
      await api.post(`/api/coordinator/teachers/${params.id}/remind`);
      setReminded(true);
    } finally {
      setReminding(false);
    }
  }

  if (loading) return <p className="text-sm text-muted-foreground">Loading...</p>;
  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!data) return null;

  const monthCounts = new Map<string, number>();
  for (const a of data.activitiesLast3Months) {
    const key = monthKey(a.createdAt);
    monthCounts.set(key, (monthCounts.get(key) ?? 0) + 1);
  }
  const activityChartData = Array.from(monthCounts.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, count]) => ({ month, count }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{data.teacher.name}</h1>
        <Button variant="outline" disabled={reminding || reminded} onClick={handleRemind}>
          {reminded ? 'Reminder Sent' : reminding ? 'Sending...' : 'Send Reminder'}
        </Button>
      </div>

      <Card>
        <CardContent className="grid grid-cols-2 gap-4 pt-6 sm:grid-cols-4">
          <div>
            <div className="text-xs text-muted-foreground">Email</div>
            <div className="text-sm font-medium">{data.teacher.email}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Wing</div>
            <div className="text-sm font-medium capitalize">{data.teacher.wing}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Classes</div>
            <div className="text-sm font-medium">{data.classes.length}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Attendance This Month</div>
            <div className="text-sm font-medium">{data.attendanceRateThisMonth}%</div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Activity — Last 3 Months</CardTitle>
        </CardHeader>
        <CardContent className="h-64">
          {activityChartData.length === 0 ? (
            <p className="text-sm text-muted-foreground">No activities in the last 3 months.</p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={activityChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="count" name="Activities" fill="#6366f1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Classes & Subjects</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          {data.classes.length === 0 ? (
            <p className="text-sm text-muted-foreground">No classes assigned.</p>
          ) : (
            data.classes.map((c, i) => (
              <div key={i} className="flex justify-between text-sm">
                <span>{c.subject}</span>
                <span className="text-muted-foreground">Class {c.classLabel}</span>
              </div>
            ))
          )}
          {data.classTeacherOf.length > 0 && (
            <p className="pt-2 text-xs text-muted-foreground">
              Class teacher of: {data.classTeacherOf.join(', ')}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Monthly Report History</CardTitle>
        </CardHeader>
        <CardContent>
          {data.monthlyReports.length === 0 ? (
            <p className="text-sm text-muted-foreground">No monthly reports yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Month</TableHead>
                  <TableHead>Activities</TableHead>
                  <TableHead>Attendance</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.monthlyReports.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.monthYear}</TableCell>
                    <TableCell>{r.activitiesCount}</TableCell>
                    <TableCell>{r.attendanceRate}%</TableCell>
                    <TableCell>
                      <Badge variant="outline">{r.status}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

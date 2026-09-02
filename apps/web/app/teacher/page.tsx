'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

interface SubjectWithClass {
  id: string;
  name: string;
  class: { id: string; number: number; section: string };
}

interface AttendanceToday {
  subjectId: string;
  subjectName: string;
  marked: boolean;
}

interface UpcomingActivity {
  id: string;
  title: string;
  dueDate: string;
  totalMarks: number;
  subject: { id: string; name: string };
}

interface RecentAction {
  id: string;
  action: string;
  createdAt: string;
}

interface Dashboard {
  mySubjects: SubjectWithClass[];
  ungradedSubmissionsCount: number;
  attendanceToday: AttendanceToday[];
  upcomingDueDates: UpcomingActivity[];
  recentActivity: RecentAction[];
}

interface FeeDefaulter {
  studentName: string;
  className: number | null;
  section: string | null;
  totalDue: number;
  status: 'unpaid' | 'overdue';
}

interface LeaveRequestRow {
  id: string;
  studentName: string;
  classLabel: string;
  startDate: string;
  endDate: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
}

export default function TeacherDashboardPage() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [defaulters, setDefaulters] = useState<FeeDefaulter[]>([]);
  const [defaultersMonth, setDefaultersMonth] = useState('');

  const [pendingLeaveRequests, setPendingLeaveRequests] = useState<LeaveRequestRow[]>([]);

  useEffect(() => {
    let cancelled = false;

    api
      .get<{ success: boolean; data: Dashboard }>('/api/teacher/dashboard')
      .then((res) => {
        if (!cancelled) setData(res.data.data);
      })
      .catch(() => {
        if (!cancelled) setError('Failed to load dashboard.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    api
      .get<{ success: boolean; data: { monthYear: string; defaulters: FeeDefaulter[] } }>(
        '/api/teacher/fee-defaulters'
      )
      .then((res) => {
        if (cancelled) return;
        setDefaultersMonth(res.data.data.monthYear);
        setDefaulters(res.data.data.defaulters);
      })
      .catch(() => {});

    api
      .get<{ success: boolean; data: { requests: LeaveRequestRow[] } }>('/api/teacher/leave-requests', {
        params: { status: 'pending' },
      })
      .then((res) => {
        if (!cancelled) setPendingLeaveRequests(res.data.data.requests);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-32" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-16" />
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-4 w-40" />
              </CardHeader>
              <CardContent className="space-y-3">
                {Array.from({ length: 3 }).map((_, j) => (
                  <Skeleton key={j} className="h-5 w-full" />
                ))}
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader>
            <Skeleton className="h-4 w-28" />
          </CardHeader>
          <CardContent className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-5 w-full" />
            ))}
          </CardContent>
        </Card>
      </div>
    );
  }
  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!data) return null;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              My Subjects
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{data.mySubjects.length}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Ungraded Submissions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{data.ungradedSubmissionsCount}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Attendance Marked Today
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">
              {data.attendanceToday.filter((a) => a.marked).length} /{' '}
              {data.attendanceToday.length}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Today&apos;s Attendance Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.attendanceToday.length === 0 ? (
              <p className="text-sm text-muted-foreground">No subjects assigned yet.</p>
            ) : (
              data.attendanceToday.map((a) => (
                <div key={a.subjectId} className="flex items-center justify-between text-sm">
                  <Link href="/teacher/attendance" className="hover:underline">
                    {a.subjectName}
                  </Link>
                  <Badge variant={a.marked ? 'default' : 'secondary'}>
                    {a.marked ? 'Marked' : 'Not marked'}
                  </Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Upcoming Due Dates (next 7 days)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.upcomingDueDates.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing due this week.</p>
            ) : (
              data.upcomingDueDates.map((a) => (
                <div key={a.id} className="flex items-center justify-between text-sm">
                  <span>
                    {a.title}{' '}
                    <span className="text-muted-foreground">({a.subject.name})</span>
                  </span>
                  <span className="text-muted-foreground">
                    {new Date(a.dueDate).toLocaleDateString()}
                  </span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent Activity</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {data.recentActivity.length === 0 ? (
            <p className="text-sm text-muted-foreground">No recent activity.</p>
          ) : (
            data.recentActivity.map((entry) => (
              <div key={entry.id} className="flex items-center justify-between text-sm">
                <span>{entry.action}</span>
                <span className="text-muted-foreground">
                  {new Date(entry.createdAt).toLocaleString()}
                </span>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Fee Defaulters{defaultersMonth ? ` — ${monthYearLabel(defaultersMonth)}` : ''}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {defaulters.length === 0 ? (
            <p className="text-sm text-muted-foreground">No fee defaulters this month 🎉</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="py-1 pr-2">Student</th>
                    <th className="py-1 pr-2">Class</th>
                    <th className="py-1 pr-2">Total Due</th>
                    <th className="py-1 pr-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {defaulters.map((d, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="py-1.5 pr-2 font-medium">{d.studentName}</td>
                      <td className="py-1.5 pr-2 text-muted-foreground">
                        {d.className != null ? `${d.className}-${d.section}` : '—'}
                      </td>
                      <td className="py-1.5 pr-2">PKR {d.totalDue.toLocaleString()}</td>
                      <td className="py-1.5 pr-2">
                        <Badge variant={d.status === 'overdue' ? 'destructive' : 'secondary'}>
                          {d.status.toUpperCase()}
                        </Badge>
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
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Pending Leave Requests</CardTitle>
          <Link href="/teacher/leave-requests" className="text-sm text-primary hover:underline">
            View all →
          </Link>
        </CardHeader>
        <CardContent>
          {pendingLeaveRequests.length === 0 ? (
            <p className="text-sm text-muted-foreground">No pending leave requests.</p>
          ) : (
            <div className="space-y-2">
              {pendingLeaveRequests.slice(0, 5).map((r) => (
                <div key={r.id} className="flex items-center justify-between text-sm">
                  <span>
                    {r.studentName} <span className="text-muted-foreground">({r.classLabel})</span>
                  </span>
                  <span className="text-muted-foreground">
                    {new Date(r.startDate).toLocaleDateString()} – {new Date(r.endDate).toLocaleDateString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function monthYearLabel(monthYear: string): string {
  const [y, m] = monthYear.split('-').map(Number);
  if (!y || !m) return monthYear;
  return new Date(y, m - 1, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' });
}

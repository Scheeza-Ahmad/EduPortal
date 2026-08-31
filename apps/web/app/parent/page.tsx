'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useParentStore } from '@/lib/parentStore';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

interface ReportCard {
  overallPercentage: number;
}

interface AttendanceData {
  overallPercentage: number;
}

interface Announcement {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  class: { number: number; section: string } | null;
}

export default function ParentDashboardPage() {
  const selectedChildId = useParentStore((s) => s.selectedChildId);
  const selectedChild = useParentStore((s) =>
    s.children.find((c) => c.id === s.selectedChildId)
  );

  const [reportCard, setReportCard] = useState<ReportCard | null>(null);
  const [attendance, setAttendance] = useState<AttendanceData | null>(null);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedChildId) return;
    setLoading(true);
    setError(null);

    Promise.all([
      api.get<{ success: boolean; data: ReportCard }>(
        `/api/parent/child/${selectedChildId}/report-card`
      ),
      api.get<{ success: boolean; data: AttendanceData }>(
        `/api/parent/child/${selectedChildId}/attendance`
      ),
      api.get<{ success: boolean; data: { announcements: Announcement[] } }>(
        `/api/parent/child/${selectedChildId}/announcements`
      ),
    ])
      .then(([cardRes, attendanceRes, announcementsRes]) => {
        setReportCard(cardRes.data.data);
        setAttendance(attendanceRes.data.data);
        setAnnouncements(announcementsRes.data.data.announcements.slice(0, 5));
      })
      .catch(() => setError('Failed to load dashboard.'))
      .finally(() => setLoading(false));
  }, [selectedChildId]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
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
        <Card>
          <CardHeader>
            <Skeleton className="h-4 w-40" />
          </CardHeader>
          <CardContent className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-5 w-full" />
            ))}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) return <p className="text-sm text-destructive">{error}</p>;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">
        {selectedChild ? `${selectedChild.name}'s Dashboard` : 'Dashboard'}
      </h1>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Overall Grade Average
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{reportCard?.overallPercentage ?? 0}%</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Attendance (this month)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{attendance?.overallPercentage ?? 0}%</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent Announcements</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {announcements.length === 0 ? (
            <p className="text-sm text-muted-foreground">No announcements yet.</p>
          ) : (
            announcements.map((a) => (
              <div key={a.id} className="space-y-1 border-b pb-2 last:border-b-0 last:pb-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium">{a.title}</p>
                  <Badge variant={a.class ? 'outline' : 'default'} className="text-xs">
                    {a.class ? `Class ${a.class.number}${a.class.section}` : 'School-wide'}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {new Date(a.createdAt).toLocaleDateString()}
                </p>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

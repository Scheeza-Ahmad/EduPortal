'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/shared/ErrorState';

type BadgeType = 'perfect_week' | 'top_of_class' | 'streak_7';

const BADGE_LABELS: Record<BadgeType, string> = {
  perfect_week: '🏆 Perfect Week',
  top_of_class: '⭐ Top of Class',
  streak_7: '🔥 7-Day Streak',
};

interface ActivityRow {
  id: string;
  title: string;
  dueDate: string;
  subject: { id: string; name: string };
}

interface GradeRow {
  id: string;
  subject: string;
  activityTitle: string;
  marks: number;
  totalMarks: number;
  gradedAt: string;
}

interface BadgeRow {
  id: string;
  type: BadgeType;
  awardedAt: string;
}

interface Dashboard {
  pendingActivities: ActivityRow[];
  upcomingDeadlines: ActivityRow[];
  recentGrades: GradeRow[];
  attendanceRate: number;
  badges: BadgeRow[];
}

interface SubjectCard {
  id: string;
  name: string;
  creditHours: number;
  teacher: { id: string; name: string } | null;
}

export default function StudentDashboardPage() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [subjects, setSubjects] = useState<SubjectCard[]>([]);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    api
      .get<{ success: boolean; data: Dashboard }>('/api/student/dashboard')
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
      .get<{ success: boolean; data: { subjects: SubjectCard[] } }>('/api/student/subjects')
      .then((res) => {
        if (!cancelled) setSubjects(res.data.data.subjects);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [retryKey]);

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
      </div>
    );
  }

  if (error) return <ErrorState message={error} onRetry={() => setRetryKey((k) => k + 1)} />;
  if (!data) return null;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Pending Activities
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{data.pendingActivities.length}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Attendance Rate (this month)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{data.attendanceRate}%</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Badges</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{data.badges.length}</p>
          </CardContent>
        </Card>
      </div>

      {subjects.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">My Subjects</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {subjects.map((s) => (
                <Link key={s.id} href={`/student/subjects/${s.id}`} className="block">
                  <div className="rounded-md border p-3 text-sm transition-colors hover:bg-muted">
                    <p className="font-medium">{s.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {s.teacher ? s.teacher.name : 'No teacher assigned'} · {s.creditHours} credit hours
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Upcoming Deadlines (next 7 days)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.upcomingDeadlines.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing due this week.</p>
            ) : (
              data.upcomingDeadlines.map((a) => (
                <div key={a.id} className="flex items-center justify-between text-sm">
                  <span>
                    {a.title} <span className="text-muted-foreground">({a.subject.name})</span>
                  </span>
                  <span className="text-muted-foreground">
                    {new Date(a.dueDate).toLocaleDateString()}
                  </span>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent Grades</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.recentGrades.length === 0 ? (
              <p className="text-sm text-muted-foreground">No grades yet.</p>
            ) : (
              data.recentGrades.map((g) => (
                <div key={g.id} className="flex items-center justify-between text-sm">
                  <span>
                    {g.activityTitle} <span className="text-muted-foreground">({g.subject})</span>
                  </span>
                  <span className="text-muted-foreground">
                    {g.marks} / {g.totalMarks}
                  </span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">My Badges</CardTitle>
        </CardHeader>
        <CardContent>
          {data.badges.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No badges yet — keep submitting on time and attending class!
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {data.badges.map((b) => (
                <Badge key={b.id} variant="secondary">
                  {BADGE_LABELS[b.type]}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

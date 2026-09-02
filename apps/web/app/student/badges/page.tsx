'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type BadgeType = 'perfect_week' | 'top_of_class' | 'streak_7' | 'streak_30' | 'full_marks';

interface Badge {
  id: string;
  type: BadgeType;
  awardedAt: string;
}

interface Progress {
  currentSubmissionStreak: number;
  attendanceMarkedThisWeek: number;
  presentThisWeek: number;
}

const BADGE_INFO: Record<BadgeType, { emoji: string; label: string; description: string }> = {
  perfect_week: { emoji: '🏆', label: 'Perfect Week', description: '100% attendance in a week' },
  top_of_class: { emoji: '⭐', label: 'Top of Class', description: 'Highest grade in class' },
  streak_7: { emoji: '🔥', label: '7-Day Streak', description: '7 consecutive submissions' },
  streak_30: { emoji: '💎', label: '30-Day Streak', description: '30 consecutive submissions' },
  full_marks: { emoji: '🎯', label: 'Full Marks', description: 'Perfect score on an activity' },
};

const BADGE_ORDER: BadgeType[] = ['perfect_week', 'top_of_class', 'streak_7', 'streak_30', 'full_marks'];

function progressFor(type: BadgeType, progress: Progress): string | null {
  if (type === 'streak_7') return `${Math.min(progress.currentSubmissionStreak, 7)}/7 submissions streak`;
  if (type === 'streak_30') return `${Math.min(progress.currentSubmissionStreak, 30)}/30 submissions streak`;
  if (type === 'perfect_week') {
    return progress.attendanceMarkedThisWeek > 0
      ? `${progress.presentThisWeek}/${progress.attendanceMarkedThisWeek} days present this week`
      : 'No attendance marked this week yet';
  }
  return null;
}

export default function StudentBadgesPage() {
  const [badges, setBadges] = useState<Badge[]>([]);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    api
      .get<{ success: boolean; data: { badges: Badge[]; progress: Progress } }>('/api/student/badges')
      .then((res) => {
        if (!cancelled) {
          setBadges(res.data.data.badges);
          setProgress(res.data.data.progress);
        }
      })
      .catch(() => {
        if (!cancelled) setError('Failed to load badges.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) return <p className="text-sm text-muted-foreground">Loading achievements...</p>;
  if (error) return <p className="text-sm text-destructive">{error}</p>;

  const earnedTypes = new Set(badges.map((b) => b.type));
  const earnedList = BADGE_ORDER.filter((t) => earnedTypes.has(t));
  const lockedList = BADGE_ORDER.filter((t) => !earnedTypes.has(t));

  // "Rarest" — the earned type with the fewest awards; "Latest" — most recently awarded.
  const countByType = new Map<BadgeType, number>();
  for (const b of badges) countByType.set(b.type, (countByType.get(b.type) ?? 0) + 1);
  const rarest =
    earnedList.length > 0
      ? earnedList.reduce((a, b) => ((countByType.get(a) ?? 0) <= (countByType.get(b) ?? 0) ? a : b))
      : null;
  const latest = badges[0] ?? null;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">My Achievements</h1>

      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-xs text-muted-foreground">Total Earned</div>
            <div className="mt-1 text-2xl font-bold">{badges.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-xs text-muted-foreground">Rarest</div>
            <div className="mt-1 text-lg font-semibold">{rarest ? BADGE_INFO[rarest].label : '—'}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-xs text-muted-foreground">Latest</div>
            <div className="mt-1 text-lg font-semibold">{latest ? BADGE_INFO[latest.type].label : '—'}</div>
          </CardContent>
        </Card>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground">Earned Badges</h2>
        {earnedList.length === 0 ? (
          <p className="text-sm text-muted-foreground">No badges earned yet — keep going!</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {earnedList.map((type) => {
              const info = BADGE_INFO[type];
              const earnedBadges = badges.filter((b) => b.type === type);
              const latestForType = earnedBadges[0];
              return (
                <Card key={type}>
                  <CardHeader className="items-center pb-2 text-center">
                    <span className="text-4xl">{info.emoji}</span>
                    <CardTitle className="text-base">{info.label}</CardTitle>
                  </CardHeader>
                  <CardContent className="text-center">
                    <p className="text-sm text-muted-foreground">{info.description}</p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Earned: {new Date(latestForType.awardedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                      {earnedBadges.length > 1 ? ` · x${earnedBadges.length}` : ''}
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground">Locked Badges</h2>
        {lockedList.length === 0 ? (
          <p className="text-sm text-muted-foreground">You&apos;ve earned every badge! 🎉</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {lockedList.map((type) => {
              const info = BADGE_INFO[type];
              const progressText = progress ? progressFor(type, progress) : null;
              return (
                <Card key={type} className={cn('opacity-60 grayscale')}>
                  <CardHeader className="items-center pb-2 text-center">
                    <span className="text-4xl">🔒</span>
                    <CardTitle className="text-base">{info.label}</CardTitle>
                  </CardHeader>
                  <CardContent className="text-center">
                    <p className="text-sm text-muted-foreground">{info.description}</p>
                    {progressText && <p className="mt-2 text-xs font-medium text-foreground">{progressText}</p>}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

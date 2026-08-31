'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type BadgeType = 'perfect_week' | 'top_of_class' | 'streak_7';

interface Badge {
  id: string;
  type: BadgeType;
  awardedAt: string;
}

const BADGE_INFO: Record<BadgeType, { emoji: string; label: string; description: string }> = {
  perfect_week: {
    emoji: '🏆',
    label: 'Perfect Week',
    description: '100% attendance for a full week',
  },
  top_of_class: {
    emoji: '⭐',
    label: 'Top of Class',
    description: 'Highest grade in class on an activity',
  },
  streak_7: {
    emoji: '🔥',
    label: '7-Day Streak',
    description: '7 consecutive on-time submissions',
  },
};

export default function StudentBadgesPage() {
  const [badges, setBadges] = useState<Badge[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    api
      .get<{ success: boolean; data: { badges: Badge[] } }>('/api/student/badges')
      .then((res) => {
        if (!cancelled) setBadges(res.data.data.badges);
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

  if (loading) return <p className="text-sm text-muted-foreground">Loading badges...</p>;
  if (error) return <p className="text-sm text-destructive">{error}</p>;

  const badgesByType = (Object.keys(BADGE_INFO) as BadgeType[]).map((type) => {
    const earned = badges.filter((b) => b.type === type);
    const latest = earned[0] ?? null;
    return { type, count: earned.length, latestAwardedAt: latest?.awardedAt ?? null };
  });

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Badges</h1>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {badgesByType.map(({ type, count, latestAwardedAt }) => {
          const info = BADGE_INFO[type];
          const earned = count > 0;

          return (
            <Card
              key={type}
              className={cn(!earned && 'opacity-50 grayscale')}
            >
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <span className="text-2xl">{info.emoji}</span>
                  {info.label}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                <p className="text-sm text-muted-foreground">{info.description}</p>
                {earned ? (
                  <p className="text-xs text-muted-foreground">
                    Earned {count > 1 ? `${count} times` : 'once'}
                    {latestAwardedAt &&
                      ` · most recently ${new Date(latestAwardedAt).toLocaleDateString()}`}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">Not earned yet</p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

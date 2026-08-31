'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useParentStore } from '@/lib/parentStore';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface Announcement {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  author: { id: string; name: string };
  class: { number: number; section: string } | null;
}

export default function ParentAnnouncementsPage() {
  const selectedChildId = useParentStore((s) => s.selectedChildId);
  const selectedChild = useParentStore((s) =>
    s.children.find((c) => c.id === s.selectedChildId)
  );

  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedChildId) return;
    setLoading(true);
    setError(null);

    api
      .get<{ success: boolean; data: { announcements: Announcement[] } }>(
        `/api/parent/child/${selectedChildId}/announcements`
      )
      .then((res) => setAnnouncements(res.data.data.announcements))
      .catch(() => setError('Failed to load announcements.'))
      .finally(() => setLoading(false));
  }, [selectedChildId]);

  if (loading) return <p className="text-sm text-muted-foreground">Loading announcements...</p>;
  if (error) return <p className="text-sm text-destructive">{error}</p>;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">
        {selectedChild ? `${selectedChild.name}'s Announcements` : 'Announcements'}
      </h1>

      {announcements.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-center text-sm text-muted-foreground">
            No announcements yet.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {announcements.map((a) => (
            <Card key={a.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <CardTitle className="text-base">{a.title}</CardTitle>
                  <Badge variant={a.class ? 'outline' : 'default'} className="text-xs">
                    {a.class ? `Class ${a.class.number}${a.class.section}` : 'School-wide'}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {a.author.name} · {new Date(a.createdAt).toLocaleString()}
                </p>
              </CardHeader>
              <CardContent>
                <p className="text-sm whitespace-pre-wrap">{a.body}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

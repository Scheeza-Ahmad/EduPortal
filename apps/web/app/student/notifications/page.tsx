'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface Notification {
  id: string;
  type: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

function friendlyType(type: string): string {
  if (type.startsWith('DUE_DATE_REMINDER_24H')) return 'Due Soon';
  if (type.startsWith('DUE_DATE_REMINDER_2H')) return 'Due Very Soon';
  if (type === 'ABSENCE_STREAK') return 'Attendance';
  return type.replace(/_/g, ' ');
}

export default function StudentNotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [markingAll, setMarkingAll] = useState(false);

  async function loadNotifications() {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<{ success: boolean; data: { notifications: Notification[] } }>(
        '/api/student/notifications'
      );
      setNotifications(res.data.data.notifications);
    } catch {
      setError('Failed to load notifications.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadNotifications();
  }, []);

  async function markAsRead(id: string) {
    setMarkingId(id);
    try {
      await api.patch(`/api/student/notifications/${id}/read`);
      setNotifications((list) => list.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
    } catch {
      setError('Failed to update notification.');
    } finally {
      setMarkingId(null);
    }
  }

  async function markAllAsRead() {
    const unread = notifications.filter((n) => !n.isRead);
    if (unread.length === 0) return;

    setMarkingAll(true);
    try {
      await Promise.all(unread.map((n) => api.patch(`/api/student/notifications/${n.id}/read`)));
      setNotifications((list) => list.map((n) => ({ ...n, isRead: true })));
    } catch {
      setError('Failed to mark all as read.');
    } finally {
      setMarkingAll(false);
    }
  }

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Notifications</h1>
        {unreadCount > 0 && (
          <Button variant="outline" size="sm" onClick={markAllAsRead} disabled={markingAll}>
            {markingAll ? 'Marking...' : 'Mark all as read'}
          </Button>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading notifications...</p>
      ) : error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : notifications.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-center text-sm text-muted-foreground">
            No notifications yet.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {notifications.map((n) => (
            <Card key={n.id} className={cn(!n.isRead && 'border-primary')}>
              <CardHeader className="flex-row items-start justify-between space-y-0 pb-2">
                <div className="flex items-center gap-2">
                  {!n.isRead && <span className="h-2 w-2 rounded-full bg-primary" />}
                  <Badge variant="outline" className="text-xs">
                    {friendlyType(n.type)}
                  </Badge>
                  <CardTitle className="text-sm font-normal text-muted-foreground">
                    {new Date(n.createdAt).toLocaleString()}
                  </CardTitle>
                </div>
                {!n.isRead && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={markingId === n.id}
                    onClick={() => markAsRead(n.id)}
                  >
                    {markingId === n.id ? '...' : 'Mark as read'}
                  </Button>
                )}
              </CardHeader>
              <CardContent>
                <p className={cn('text-sm', !n.isRead && 'font-medium')}>{n.message}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

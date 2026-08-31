'use client';

import { FormEvent, useEffect, useState } from 'react';
import { AxiosError } from 'axios';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface Announcement {
  id: string;
  title: string;
  body: string;
  classId: string | null;
  createdAt: string;
}

function getErrorMessage(err: unknown, fallback: string): string {
  const axiosErr = err as AxiosError<{ error?: string }>;
  return axiosErr.response?.data?.error ?? fallback;
}

export default function CoordinatorAnnouncementsPage() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [targetWing, setTargetWing] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function loadAnnouncements() {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<{ success: boolean; data: { announcements: Announcement[] } }>(
        '/api/coordinator/announcements'
      );
      setAnnouncements(res.data.data.announcements);
    } catch {
      setError('Failed to load announcements.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAnnouncements();
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);
    try {
      await api.post('/api/coordinator/announcements', { title, body, targetWing });
      setTitle('');
      setBody('');
      await loadAnnouncements();
    } catch (err) {
      setFormError(getErrorMessage(err, 'Failed to post announcement.'));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      await api.delete(`/api/coordinator/announcements/${id}`);
      await loadAnnouncements();
    } catch {
      setError('Failed to delete announcement.');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Announcements</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">New Announcement</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Title</Label>
              <Input required value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Body</Label>
              <Textarea required value={body} onChange={(e) => setBody(e.target.value)} />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={targetWing} onCheckedChange={setTargetWing} />
              <Label className="!mt-0">Post to entire wing</Label>
            </div>
            <p className="text-xs text-muted-foreground">
              {targetWing
                ? 'This will post to every class in your wing.'
                : 'This will post school-wide.'}
            </p>
            {formError && (
              <p className="text-sm text-destructive" role="alert">
                {formError}
              </p>
            )}
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Posting...' : 'Post Announcement'}
            </Button>
          </form>
        </CardContent>
      </Card>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : announcements.length === 0 ? (
        <p className="text-sm text-muted-foreground">No announcements yet.</p>
      ) : (
        <div className="space-y-3">
          {announcements.map((a) => (
            <Card key={a.id}>
              <CardContent className="flex items-start justify-between gap-4 pt-6">
                <div>
                  <div className="font-medium">{a.title}</div>
                  <p className="mt-1 text-sm text-muted-foreground">{a.body}</p>
                  <div className="mt-2 text-xs text-muted-foreground">
                    {new Date(a.createdAt).toLocaleString()} — {a.classId ? 'Class' : 'School-wide'}
                  </div>
                </div>
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={deletingId === a.id}
                  onClick={() => handleDelete(a.id)}
                >
                  {deletingId === a.id ? '...' : 'Delete'}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

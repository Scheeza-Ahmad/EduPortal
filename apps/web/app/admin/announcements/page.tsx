'use client';

import { FormEvent, useEffect, useState } from 'react';
import { AxiosError } from 'axios';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface ClassOption {
  id: string;
  number: number;
  section: string;
}

function classOptionLabel(c: ClassOption): string {
  return `Class ${c.number} - ${c.section}`;
}

interface Announcement {
  id: string;
  title: string;
  body: string;
  classId: string | null;
  createdAt: string;
  author: { id: string; name: string };
}

type Audience =
  | 'all_students'
  | 'all_teachers'
  | 'class_teachers_only'
  | 'subject_teachers_only'
  | 'all_staff'
  | 'school_wide'
  | 'specific_class';

const AUDIENCE_OPTIONS: { value: Audience; label: string }[] = [
  { value: 'school_wide', label: 'School-wide (everyone)' },
  { value: 'all_students', label: 'All students' },
  { value: 'all_teachers', label: 'All teachers' },
  { value: 'class_teachers_only', label: 'Class teachers only' },
  { value: 'subject_teachers_only', label: 'Subject teachers only' },
  { value: 'all_staff', label: 'All staff (teachers + coordinators + finance)' },
  { value: 'specific_class', label: 'Specific class' },
];

interface AnnouncementForm {
  title: string;
  body: string;
  classId: string; // '' = school-wide, only meaningful when audience === 'specific_class'
  audience: Audience;
}

const EMPTY_FORM: AnnouncementForm = { title: '', body: '', classId: '', audience: 'school_wide' };

export default function AnnouncementsPage() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [classFilter, setClassFilter] = useState('all');

  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<AnnouncementForm>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function loadClasses() {
    try {
      const res = await api.get<{ success: boolean; data: { classes: ClassOption[] } }>(
        '/api/admin/classes'
      );
      setClasses(res.data.data.classes);
    } catch {
      // Non-fatal — the class dropdown will just be empty.
    }
  }

  async function loadAnnouncements() {
    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    if (classFilter !== 'all') params.set('classId', classFilter);

    try {
      const res = await api.get<{ success: boolean; data: { announcements: Announcement[] } }>(
        `/api/admin/announcements?${params.toString()}`
      );
      setAnnouncements(res.data.data.announcements);
    } catch {
      setError('Failed to load announcements.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadClasses();
  }, []);

  useEffect(() => {
    loadAnnouncements();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classFilter]);

  function openAddDialog() {
    setForm(EMPTY_FORM);
    setFormError(null);
    setDialogOpen(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);

    try {
      await api.post('/api/admin/announcements', {
        title: form.title,
        body: form.body,
        classId: form.audience === 'specific_class' ? form.classId || undefined : undefined,
        audience: form.audience,
      });
      setDialogOpen(false);
      await loadAnnouncements();
    } catch (err) {
      const axiosErr = err as AxiosError<{ error?: string }>;
      setFormError(axiosErr.response?.data?.error ?? 'Failed to post announcement.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(announcement: Announcement) {
    setDeletingId(announcement.id);
    try {
      await api.delete(`/api/admin/announcements/${announcement.id}`);
      await loadAnnouncements();
    } catch {
      setError('Failed to delete announcement.');
    } finally {
      setDeletingId(null);
    }
  }

  function classLabel(classId: string | null): string {
    if (!classId) return 'School-wide';
    const match = classes.find((c) => c.id === classId);
    return match ? classOptionLabel(match) : 'Class';
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Announcements</h1>
        <div className="flex items-center gap-2">
          <Select value={classFilter} onValueChange={setClassFilter}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Filter by class" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All announcements</SelectItem>
              {classes.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {classOptionLabel(c)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={openAddDialog}>Add Announcement</Button>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading announcements...</p>
      ) : error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : announcements.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-center text-sm text-muted-foreground">
            No announcements yet.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {announcements.map((a) => (
            <Card key={a.id}>
              <CardHeader className="flex-row items-start justify-between space-y-0 pb-2">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-base">{a.title}</CardTitle>
                    <Badge variant={a.classId ? 'outline' : 'default'} className="text-xs">
                      {classLabel(a.classId)}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {a.author.name} · {new Date(a.createdAt).toLocaleString()}
                  </p>
                </div>
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={deletingId === a.id}
                  onClick={() => handleDelete(a)}
                >
                  {deletingId === a.id ? '...' : 'Delete'}
                </Button>
              </CardHeader>
              <CardContent>
                <p className="text-sm whitespace-pre-wrap">{a.body}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Announcement</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="announcement-title">Title</Label>
              <Input
                id="announcement-title"
                required
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="announcement-body">Message</Label>
              <Textarea
                id="announcement-body"
                required
                rows={4}
                value={form.body}
                onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label>Audience</Label>
              <Select
                value={form.audience}
                onValueChange={(v) => setForm((f) => ({ ...f, audience: v as Audience }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AUDIENCE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {form.audience === 'specific_class' && (
              <div className="space-y-2">
                <Label>Class</Label>
                <Select value={form.classId} onValueChange={(v) => setForm((f) => ({ ...f, classId: v }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a class" />
                  </SelectTrigger>
                  <SelectContent>
                    {classes.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {classOptionLabel(c)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {formError && (
              <p className="text-sm text-destructive" role="alert">
                {formError}
              </p>
            )}

            <DialogFooter>
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Posting...' : 'Post Announcement'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

'use client';

import { FormEvent, useEffect, useState } from 'react';
import { AxiosError } from 'axios';
import { api } from '@/lib/api';
import { useAuthStore } from '@/lib/store';
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
  classTeacherId: string | null;
}

interface SubjectOption {
  id: string;
  name: string;
  classId: string;
}

type Audience = 'my_class' | 'my_subject_students' | 'all_teachers' | 'school_wide';

interface Announcement {
  id: string;
  title: string;
  body: string;
  classId: string | null;
  createdAt: string;
  authorId: string;
  author: { id: string; name: string };
  class: ClassOption | null;
}

interface AnnouncementForm {
  title: string;
  body: string;
  classId: string;
  audience: Audience;
  subjectId: string;
}

const EMPTY_FORM: AnnouncementForm = {
  title: '',
  body: '',
  classId: '',
  audience: 'my_class',
  subjectId: '',
};

export default function TeacherAnnouncementsPage() {
  const currentUserId = useAuthStore((state) => state.user?.id);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [subjects, setSubjects] = useState<SubjectOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<AnnouncementForm>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function loadClasses() {
    try {
      const res = await api.get<{ success: boolean; data: { classes: ClassOption[] } }>(
        '/api/teacher/classes'
      );
      setClasses(res.data.data.classes);
    } catch {
      // Non-fatal — the class dropdown will just be empty.
    }
  }

  async function loadAnnouncements() {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<{ success: boolean; data: { announcements: Announcement[] } }>(
        '/api/teacher/announcements'
      );
      setAnnouncements(res.data.data.announcements);
    } catch {
      setError('Failed to load announcements.');
    } finally {
      setLoading(false);
    }
  }

  async function loadSubjects() {
    try {
      const res = await api.get<{ success: boolean; data: { subjects: SubjectOption[] } }>(
        '/api/teacher/subjects'
      );
      setSubjects(res.data.data.subjects);
    } catch {
      // Non-fatal — the "my subject students" audience just won't be usable.
    }
  }

  useEffect(() => {
    loadClasses();
    loadSubjects();
    loadAnnouncements();
  }, []);

  function openAddDialog() {
    setForm(EMPTY_FORM);
    setFormError(null);
    setDialogOpen(true);
  }

  function isClassTeacherOf(classId: string): boolean {
    return classes.find((c) => c.id === classId)?.classTeacherId === currentUserId;
  }

  function audienceOptionsFor(classId: string): { value: Audience; label: string }[] {
    if (isClassTeacherOf(classId)) {
      return [
        { value: 'my_class', label: 'My class students (Class members only)' },
        { value: 'all_teachers', label: 'All teachers in school' },
        { value: 'school_wide', label: 'School-wide' },
      ];
    }
    return [
      { value: 'my_subject_students', label: 'Students in my subject' },
      { value: 'school_wide', label: 'School-wide' },
    ];
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);

    try {
      await api.post('/api/teacher/announcements', {
        title: form.title,
        body: form.body,
        classId: form.classId,
        audience: form.audience,
        subjectId: form.audience === 'my_subject_students' ? form.subjectId || undefined : undefined,
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
      await api.delete(`/api/teacher/announcements/${announcement.id}`);
      await loadAnnouncements();
    } catch {
      setError('Failed to delete announcement.');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Announcements</h1>
        <Button onClick={openAddDialog} disabled={classes.length === 0}>
          Add Announcement
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading announcements...</p>
      ) : error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : announcements.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-center text-sm text-muted-foreground">
            No announcements for your classes yet.
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
                    {a.class && (
                      <Badge variant="outline" className="text-xs">
                        Class {a.class.number}
                        {a.class.section}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {a.author.name} · {new Date(a.createdAt).toLocaleString()}
                  </p>
                </div>
                {a.authorId === currentUserId && (
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={deletingId === a.id}
                    onClick={() => handleDelete(a)}
                  >
                    {deletingId === a.id ? '...' : 'Delete'}
                  </Button>
                )}
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
              <Label>Class</Label>
              <Select
                value={form.classId}
                onValueChange={(v) =>
                  setForm((f) => ({
                    ...f,
                    classId: v,
                    audience: audienceOptionsFor(v)[0].value,
                    subjectId: '',
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a class" />
                </SelectTrigger>
                <SelectContent>
                  {classes.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      Class {c.number}
                      {c.section}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {form.classId && (
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
                    {audienceOptionsFor(form.classId).map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {form.audience === 'my_subject_students' && (
              <div className="space-y-2">
                <Label>Subject</Label>
                <Select value={form.subjectId} onValueChange={(v) => setForm((f) => ({ ...f, subjectId: v }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a subject" />
                  </SelectTrigger>
                  <SelectContent>
                    {subjects
                      .filter((s) => s.classId === form.classId)
                      .map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            )}

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

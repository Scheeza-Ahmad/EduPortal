'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { AxiosError } from 'axios';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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

type ActivityType = 'assignment' | 'quiz' | 'project' | 'presentation';

interface SubjectOption {
  id: string;
  name: string;
  class: { id: string; number: number; section: string };
}

interface Activity {
  id: string;
  subjectId: string;
  type: ActivityType;
  title: string;
  description: string | null;
  dueDate: string;
  totalMarks: number;
  fileUrl: string | null;
  isDraft: boolean;
  isLocked: boolean;
  subject: SubjectOption;
}

interface ActivityForm {
  subjectId: string;
  type: ActivityType;
  title: string;
  description: string;
  dueDate: string;
  totalMarks: string;
  fileUrl: string;
  isDraft: boolean;
}

const EMPTY_FORM: ActivityForm = {
  subjectId: '',
  type: 'assignment',
  title: '',
  description: '',
  dueDate: '',
  totalMarks: '',
  fileUrl: '',
  isDraft: true,
};

const TYPE_LABELS: Record<ActivityType, string> = {
  assignment: 'Assignment',
  quiz: 'Quiz',
  project: 'Project',
  presentation: 'Presentation',
};

export default function TeacherActivitiesPage() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [subjects, setSubjects] = useState<SubjectOption[]>([]);
  const [subjectsError, setSubjectsError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingActivity, setEditingActivity] = useState<Activity | null>(null);
  const [form, setForm] = useState<ActivityForm>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);

  const [reuseDialogOpen, setReuseDialogOpen] = useState(false);
  const [reusableActivities, setReusableActivities] = useState<Activity[]>([]);
  const [reuseLoading, setReuseLoading] = useState(false);

  async function loadSubjects() {
    setSubjectsError(null);
    try {
      const res = await api.get<{ success: boolean; data: { subjects: SubjectOption[] } }>(
        '/api/teacher/subjects'
      );
      setSubjects(res.data.data.subjects);
    } catch (err) {
      const axiosErr = err as AxiosError<{ error?: string }>;
      setSubjectsError(axiosErr.response?.data?.error ?? 'Failed to load your subjects.');
    }
  }

  async function loadActivities() {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<{ success: boolean; data: { activities: Activity[] } }>(
        '/api/teacher/activities'
      );
      setActivities(res.data.data.activities);
    } catch {
      setError('Failed to load activities.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSubjects();
    loadActivities();
  }, []);

  function openAddDialog() {
    setEditingActivity(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setDialogOpen(true);
  }

  function openEditDialog(activity: Activity) {
    setEditingActivity(activity);
    setForm({
      subjectId: activity.subjectId,
      type: activity.type,
      title: activity.title,
      description: activity.description ?? '',
      dueDate: activity.dueDate.slice(0, 16),
      totalMarks: String(activity.totalMarks),
      fileUrl: activity.fileUrl ?? '',
      isDraft: activity.isDraft,
    });
    setFormError(null);
    setDialogOpen(true);
  }

  async function openReuseDialog() {
    setReuseDialogOpen(true);
    setReuseLoading(true);
    try {
      const res = await api.get<{ success: boolean; data: { activities: Activity[] } }>(
        '/api/teacher/activities/reuse'
      );
      setReusableActivities(res.data.data.activities);
    } catch {
      setReusableActivities([]);
    } finally {
      setReuseLoading(false);
    }
  }

  function applyAsTemplate(activity: Activity) {
    setEditingActivity(null);
    setForm({
      subjectId: activity.subjectId,
      type: activity.type,
      title: activity.title,
      description: activity.description ?? '',
      dueDate: '',
      totalMarks: String(activity.totalMarks),
      fileUrl: '',
      isDraft: true,
    });
    setFormError(null);
    setReuseDialogOpen(false);
    setDialogOpen(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);

    const payload = {
      subjectId: form.subjectId,
      type: form.type,
      title: form.title,
      description: form.description || undefined,
      dueDate: form.dueDate ? new Date(form.dueDate).toISOString() : undefined,
      totalMarks: Number(form.totalMarks),
      fileUrl: form.fileUrl || undefined,
      isDraft: form.isDraft,
    };

    try {
      if (editingActivity) {
        await api.patch(`/api/teacher/activities/${editingActivity.id}`, payload);
      } else {
        await api.post('/api/teacher/activities', payload);
      }
      setDialogOpen(false);
      await loadActivities();
    } catch (err) {
      const axiosErr = err as AxiosError<{ error?: string }>;
      setFormError(axiosErr.response?.data?.error ?? 'Failed to save activity.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handlePublish(activity: Activity) {
    setActionId(activity.id);
    try {
      await api.post(`/api/teacher/activities/${activity.id}/publish`);
      await loadActivities();
    } catch {
      setError('Failed to publish activity.');
    } finally {
      setActionId(null);
    }
  }

  async function handleDelete(activity: Activity) {
    setActionId(activity.id);
    try {
      await api.delete(`/api/teacher/activities/${activity.id}`);
      await loadActivities();
    } catch {
      setError('Failed to delete activity.');
    } finally {
      setActionId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Activities</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={openReuseDialog}>
            Reuse from Previous
          </Button>
          <Button onClick={openAddDialog}>Add Activity</Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">All Activities</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading activities...</p>
          ) : error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Subject / Class</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead>Marks</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activities.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground">
                      No activities yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  activities.map((activity) => (
                    <TableRow key={activity.id}>
                      <TableCell className="font-medium">{activity.title}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {activity.subject.name} (Class {activity.subject.class.number}
                        {activity.subject.class.section})
                      </TableCell>
                      <TableCell>{TYPE_LABELS[activity.type]}</TableCell>
                      <TableCell>{new Date(activity.dueDate).toLocaleString()}</TableCell>
                      <TableCell>{activity.totalMarks}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          <Badge variant={activity.isDraft ? 'secondary' : 'default'}>
                            {activity.isDraft ? 'Draft' : 'Published'}
                          </Badge>
                          {activity.isLocked && (
                            <Badge variant="outline" className="text-xs">
                              Locked
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right space-x-2">
                        <Link href={`/teacher/activities/${activity.id}/submissions`}>
                          <Button variant="outline" size="sm">
                            Submissions
                          </Button>
                        </Link>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openEditDialog(activity)}
                        >
                          Edit
                        </Button>
                        {activity.isDraft && (
                          <Button
                            size="sm"
                            disabled={actionId === activity.id}
                            onClick={() => handlePublish(activity)}
                          >
                            {actionId === activity.id ? '...' : 'Publish'}
                          </Button>
                        )}
                        <Button
                          variant="destructive"
                          size="sm"
                          disabled={actionId === activity.id}
                          onClick={() => handleDelete(activity)}
                        >
                          {actionId === activity.id ? '...' : 'Delete'}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingActivity ? 'Edit Activity' : 'Add Activity'}</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Subject</Label>
                <Select
                  value={form.subjectId}
                  onValueChange={(v) => setForm((f) => ({ ...f, subjectId: v }))}
                  disabled={Boolean(editingActivity)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a subject" />
                  </SelectTrigger>
                  <SelectContent>
                    {subjects.length === 0 ? (
                      <div className="px-2 py-1.5 text-sm text-muted-foreground">
                        {subjectsError ?? 'No subjects assigned to you yet.'}
                      </div>
                    ) : (
                      subjects.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name} (Class {s.class.number}
                          {s.class.section})
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                {subjectsError && (
                  <p className="text-xs text-destructive">{subjectsError}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label>Type</Label>
                <Select
                  value={form.type}
                  onValueChange={(v) => setForm((f) => ({ ...f, type: v as ActivityType }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(TYPE_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="activity-title">Title</Label>
              <Input
                id="activity-title"
                required
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="activity-description">Description (optional)</Label>
              <Textarea
                id="activity-description"
                rows={3}
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="activity-due">Due Date</Label>
                <Input
                  id="activity-due"
                  type="datetime-local"
                  required
                  value={form.dueDate}
                  onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="activity-marks">Total Marks</Label>
                <Input
                  id="activity-marks"
                  type="number"
                  min={1}
                  required
                  value={form.totalMarks}
                  onChange={(e) => setForm((f) => ({ ...f, totalMarks: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="activity-file">File URL (optional, Cloudinary)</Label>
              <Input
                id="activity-file"
                value={form.fileUrl}
                onChange={(e) => setForm((f) => ({ ...f, fileUrl: e.target.value }))}
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                id="activity-draft"
                type="checkbox"
                className="h-4 w-4"
                checked={form.isDraft}
                onChange={(e) => setForm((f) => ({ ...f, isDraft: e.target.checked }))}
              />
              <Label htmlFor="activity-draft" className="font-normal">
                Save as draft (students won&apos;t see it until published)
              </Label>
            </div>

            {formError && (
              <p className="text-sm text-destructive" role="alert">
                {formError}
              </p>
            )}

            <DialogFooter>
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Saving...' : editingActivity ? 'Save Changes' : 'Create Activity'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={reuseDialogOpen} onOpenChange={setReuseDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reuse a Previous Activity</DialogTitle>
          </DialogHeader>

          {reuseLoading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : reusableActivities.length === 0 ? (
            <p className="text-sm text-muted-foreground">No past activities to reuse yet.</p>
          ) : (
            <div className="max-h-80 space-y-2 overflow-y-auto">
              {reusableActivities.map((activity) => (
                <div
                  key={activity.id}
                  className="flex items-center justify-between rounded-md border p-3"
                >
                  <div>
                    <p className="text-sm font-medium">{activity.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {activity.subject.name} · {TYPE_LABELS[activity.type]} ·{' '}
                      {new Date(activity.dueDate).toLocaleDateString()}
                    </p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => applyAsTemplate(activity)}>
                    Use as Template
                  </Button>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

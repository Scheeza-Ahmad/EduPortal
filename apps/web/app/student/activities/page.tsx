'use client';

import { FormEvent, useEffect, useState } from 'react';
import { AxiosError } from 'axios';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
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
import { FileUploadField } from '@/components/file-upload-field';

type Status = 'pending' | 'submitted' | 'late';

interface Activity {
  id: string;
  title: string;
  type: string;
  description: string | null;
  dueDate: string;
  totalMarks: number;
  isLocked: boolean;
  subject: { id: string; name: string };
  status: Status;
  mySubmission: {
    id: string;
    submittedAt: string;
    isLate: boolean;
    grade: { marks: number; feedback: string | null } | null;
  } | null;
}

const STATUS_LABELS: Record<Status, string> = {
  pending: 'Pending',
  submitted: 'Submitted',
  late: 'Late',
};

const STATUS_VARIANTS: Record<Status, 'default' | 'secondary' | 'destructive'> = {
  pending: 'secondary',
  submitted: 'default',
  late: 'destructive',
};

export default function StudentActivitiesPage() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [subjectOptions, setSubjectOptions] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [subjectFilter, setSubjectFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<'all' | Status>('all');

  const [dialogOpen, setDialogOpen] = useState(false);
  const [submittingActivity, setSubmittingActivity] = useState<Activity | null>(null);
  const [fileUrl, setFileUrl] = useState('');
  const [textContent, setTextContent] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function loadActivities() {
    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    if (subjectFilter !== 'all') params.set('subject', subjectFilter);
    if (statusFilter !== 'all') params.set('status', statusFilter);

    try {
      const res = await api.get<{ success: boolean; data: { activities: Activity[] } }>(
        `/api/student/activities?${params.toString()}`
      );
      setActivities(res.data.data.activities);
    } catch {
      setError('Failed to load activities.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // Unfiltered, once — used only to populate the subject dropdown so it
    // doesn't collapse to one option once a subject filter is applied.
    api
      .get<{ success: boolean; data: { activities: Activity[] } }>('/api/student/activities')
      .then((res) => {
        const map = new Map<string, string>();
        res.data.data.activities.forEach((a) => map.set(a.subject.id, a.subject.name));
        setSubjectOptions(Array.from(map.entries()).map(([id, name]) => ({ id, name })));
      })
      .catch(() => setSubjectOptions([]));
  }, []);

  useEffect(() => {
    loadActivities();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectFilter, statusFilter]);

  function openSubmitDialog(activity: Activity) {
    setSubmittingActivity(activity);
    setFileUrl('');
    setTextContent('');
    setFormError(null);
    setDialogOpen(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!submittingActivity) return;
    setFormError(null);

    if (!fileUrl && !textContent) {
      setFormError('Provide a file URL or write your answer.');
      return;
    }

    setSubmitting(true);
    try {
      await api.post(`/api/student/submit/${submittingActivity.id}`, {
        fileUrl: fileUrl || undefined,
        textContent: textContent || undefined,
      });
      setDialogOpen(false);
      await loadActivities();
    } catch (err) {
      const axiosErr = err as AxiosError<{ error?: string }>;
      setFormError(axiosErr.response?.data?.error ?? 'Failed to submit.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Activities</h1>

      <Card>
        <CardHeader className="flex-row flex-wrap items-center gap-4 space-y-0">
          <CardTitle className="text-base">All Activities</CardTitle>
          <div className="ml-auto flex flex-wrap gap-2">
            <Select value={subjectFilter} onValueChange={setSubjectFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Subject" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All subjects</SelectItem>
                {subjectOptions.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as 'all' | Status)}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="submitted">Submitted</SelectItem>
                <SelectItem value="late">Late</SelectItem>
              </SelectContent>
            </Select>
          </div>
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
                  <TableHead>Subject</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Grade</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activities.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground">
                      No activities found.
                    </TableCell>
                  </TableRow>
                ) : (
                  activities.map((activity) => (
                    <TableRow key={activity.id}>
                      <TableCell className="font-medium">{activity.title}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {activity.subject.name}
                      </TableCell>
                      <TableCell>{new Date(activity.dueDate).toLocaleString()}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          <Badge variant={STATUS_VARIANTS[activity.status]}>
                            {STATUS_LABELS[activity.status]}
                          </Badge>
                          {activity.isLocked && activity.status === 'pending' && (
                            <Badge variant="outline" className="text-xs">
                              Locked
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {activity.mySubmission?.grade
                          ? `${activity.mySubmission.grade.marks} / ${activity.totalMarks}`
                          : '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        {activity.status === 'pending' ? (
                          <Button
                            size="sm"
                            disabled={activity.isLocked}
                            onClick={() => openSubmitDialog(activity)}
                          >
                            {activity.isLocked ? 'Closed' : 'Submit'}
                          </Button>
                        ) : (
                          <span className="text-sm text-muted-foreground">
                            Submitted{' '}
                            {activity.mySubmission &&
                              new Date(activity.mySubmission.submittedAt).toLocaleDateString()}
                          </span>
                        )}
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
            <DialogTitle>Submit: {submittingActivity?.title}</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            {submittingActivity?.description && (
              <p className="text-sm text-muted-foreground">{submittingActivity.description}</p>
            )}

            <div className="space-y-2">
              <Label htmlFor="submit-file">Attachment (optional)</Label>
              <FileUploadField id="submit-file" value={fileUrl} onChange={setFileUrl} label="Attachment" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="submit-text">Written Answer (optional)</Label>
              <Textarea
                id="submit-text"
                rows={5}
                value={textContent}
                onChange={(e) => setTextContent(e.target.value)}
              />
            </div>

            <p className="text-xs text-muted-foreground">
              Provide at least one of the above.
            </p>

            {formError && (
              <p className="text-sm text-destructive" role="alert">
                {formError}
              </p>
            )}

            <DialogFooter>
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Submitting...' : 'Submit'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

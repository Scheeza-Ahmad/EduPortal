'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
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

interface Grade {
  id: string;
  marks: number;
  feedback: string | null;
}

interface Submission {
  id: string;
  fileUrl: string | null;
  textContent: string | null;
  submittedAt: string;
  isLate: boolean;
  studentUser: { id: string; name: string; email: string };
  grade: Grade | null;
}

interface ActivityDetail {
  id: string;
  title: string;
  totalMarks: number;
  dueDate: string;
  subject: { id: string; name: string; class: { number: number; section: string } };
}

interface GradeForm {
  marks: string;
  feedback: string;
}

export default function ActivitySubmissionsPage() {
  const params = useParams<{ id: string }>();
  const activityId = params.id;

  const [activity, setActivity] = useState<ActivityDetail | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [gradingSubmission, setGradingSubmission] = useState<Submission | null>(null);
  const [form, setForm] = useState<GradeForm>({ marks: '', feedback: '' });
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const [activityRes, submissionsRes] = await Promise.all([
        api.get<{ success: boolean; data: ActivityDetail }>(
          `/api/teacher/activities/${activityId}`
        ),
        api.get<{ success: boolean; data: { submissions: Submission[] } }>(
          `/api/teacher/submissions/${activityId}`
        ),
      ]);
      setActivity(activityRes.data.data);
      setSubmissions(submissionsRes.data.data.submissions);
    } catch {
      setError('Failed to load submissions.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activityId]);

  function openGradeDialog(submission: Submission) {
    setGradingSubmission(submission);
    setForm({
      marks: submission.grade ? String(submission.grade.marks) : '',
      feedback: submission.grade?.feedback ?? '',
    });
    setFormError(null);
    setDialogOpen(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!gradingSubmission) return;
    setFormError(null);
    setSubmitting(true);

    try {
      await api.patch(`/api/teacher/submissions/${gradingSubmission.id}/grade`, {
        marks: Number(form.marks),
        feedback: form.feedback || undefined,
      });
      setDialogOpen(false);
      await loadData();
    } catch (err) {
      const axiosErr = err as AxiosError<{ error?: string }>;
      setFormError(axiosErr.response?.data?.error ?? 'Failed to save grade.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link
            href="/teacher/activities"
            className="text-sm text-muted-foreground hover:underline"
          >
            &larr; Back to Activities
          </Link>
          <h1 className="text-xl font-semibold">
            {activity ? activity.title : 'Submissions'}
          </h1>
          {activity && (
            <p className="text-sm text-muted-foreground">
              {activity.subject.name} (Class {activity.subject.class.number}
              {activity.subject.class.section}) · Due{' '}
              {new Date(activity.dueDate).toLocaleString()} · Out of {activity.totalMarks}
            </p>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Submissions</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading submissions...</p>
          ) : error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student</TableHead>
                  <TableHead>Submitted</TableHead>
                  <TableHead>Content</TableHead>
                  <TableHead>Marks</TableHead>
                  <TableHead>Feedback</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {submissions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground">
                      No submissions yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  submissions.map((submission) => (
                    <TableRow key={submission.id}>
                      <TableCell className="font-medium">
                        {submission.studentUser.name}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">
                            {new Date(submission.submittedAt).toLocaleString()}
                          </span>
                          {submission.isLate && (
                            <Badge variant="destructive" className="text-xs">
                              Late
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {submission.fileUrl ? (
                          <a
                            href={submission.fileUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-primary hover:underline"
                          >
                            View file
                          </a>
                        ) : submission.textContent ? (
                          <span className="line-clamp-1 max-w-[200px] text-muted-foreground">
                            {submission.textContent}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {submission.grade ? (
                          `${submission.grade.marks} / ${activity?.totalMarks ?? '?'}`
                        ) : (
                          <span className="text-muted-foreground">Ungraded</span>
                        )}
                      </TableCell>
                      <TableCell className="max-w-[160px] truncate text-muted-foreground">
                        {submission.grade?.feedback ?? '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openGradeDialog(submission)}
                        >
                          {submission.grade ? 'Edit Grade' : 'Grade'}
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
            <DialogTitle>
              Grade {gradingSubmission?.studentUser.name ?? 'Submission'}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="grade-marks">
                Marks (out of {activity?.totalMarks ?? '?'})
              </Label>
              <Input
                id="grade-marks"
                type="number"
                min={0}
                max={activity?.totalMarks}
                required
                value={form.marks}
                onChange={(e) => setForm((f) => ({ ...f, marks: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="grade-feedback">Feedback (optional)</Label>
              <Textarea
                id="grade-feedback"
                rows={3}
                value={form.feedback}
                onChange={(e) => setForm((f) => ({ ...f, feedback: e.target.value }))}
              />
            </div>

            {formError && (
              <p className="text-sm text-destructive" role="alert">
                {formError}
              </p>
            )}

            <DialogFooter>
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Saving...' : 'Save Grade'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

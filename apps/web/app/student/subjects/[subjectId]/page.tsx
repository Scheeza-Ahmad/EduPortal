'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { AxiosError } from 'axios';
import { ArrowLeft } from 'lucide-react';
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
import { FileUploadField } from '@/components/file-upload-field';

type Status = 'pending' | 'submitted' | 'late';

interface Activity {
  id: string;
  title: string;
  type: string;
  description: string | null;
  dueDate: string;
  totalMarks: number;
  fileUrl: string | null;
  isLocked: boolean;
  status: Status;
  mySubmission: {
    id: string;
    submittedAt: string;
    isLate: boolean;
    grade: { marks: number; feedback: string | null } | null;
  } | null;
}

interface SubjectInfo {
  id: string;
  name: string;
  creditHours: number;
  teacher: { id: string; name: string } | null;
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

function getErrorMessage(err: unknown, fallback: string): string {
  const axiosErr = err as AxiosError<{ error?: string }>;
  return axiosErr.response?.data?.error ?? fallback;
}

/** Per-activity status the student actually cares about — distinct from the
 * raw pending/submitted/late tri-state, since "not submitted" reads very
 * differently depending on whether the due date has already passed. */
function activityDisplayStatus(activity: Activity): { label: string; className: string } {
  if (activity.mySubmission?.grade) {
    return { label: `${activity.mySubmission.grade.marks} / ${activity.totalMarks}`, className: 'font-medium text-green-600' };
  }
  if (activity.mySubmission) {
    return { label: 'Submitted — Awaiting Grade', className: 'text-orange-700 dark:text-orange-400' };
  }
  if (new Date(activity.dueDate) < new Date()) {
    return { label: 'Missed', className: 'font-medium text-red-600' };
  }
  return { label: 'Pending', className: 'text-muted-foreground' };
}

export default function StudentSubjectPage() {
  const params = useParams<{ subjectId: string }>();
  const subjectId = params.subjectId;

  const [subject, setSubject] = useState<SubjectInfo | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [submittingActivity, setSubmittingActivity] = useState<Activity | null>(null);
  const [fileUrl, setFileUrl] = useState('');
  const [textContent, setTextContent] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<{
        success: boolean;
        data: { subject: SubjectInfo; activities: Activity[] };
      }>(`/api/student/subjects/${subjectId}/activities`);
      setSubject(res.data.data.subject);
      setActivities(res.data.data.activities);
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load this subject.'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (subjectId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectId]);

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
      await load();
    } catch (err) {
      setFormError(getErrorMessage(err, 'Failed to submit.'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <Link
        href="/student"
        className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Dashboard
      </Link>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading subject...</p>
      ) : error ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 pt-6 text-center">
            <p className="text-sm text-destructive">{error}</p>
            <Button variant="outline" size="sm" onClick={load}>
              Retry
            </Button>
          </CardContent>
        </Card>
      ) : subject ? (
        <>
          <div>
            <h1 className="text-xl font-semibold">{subject.name}</h1>
            <p className="text-sm text-muted-foreground">
              {subject.teacher ? subject.teacher.name : 'No teacher assigned'} · {subject.creditHours}{' '}
              periods/week
            </p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Activities</CardTitle>
            </CardHeader>
            <CardContent>
              {activities.length === 0 ? (
                <p className="text-sm text-muted-foreground">No activities in this subject yet.</p>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Title</TableHead>
                        <TableHead>Due Date</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Grade</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {activities.map((activity) => (
                        <TableRow key={activity.id}>
                          <TableCell className="font-medium">{activity.title}</TableCell>
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
                            {(() => {
                              const display = activityDisplayStatus(activity);
                              return (
                                <div>
                                  <span className={display.className}>{display.label}</span>
                                  {activity.mySubmission?.grade?.feedback && (
                                    <p className="mt-0.5 text-xs text-muted-foreground">
                                      {activity.mySubmission.grade.feedback}
                                    </p>
                                  )}
                                </div>
                              );
                            })()}
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
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      ) : null}

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

            <p className="text-xs text-muted-foreground">Provide at least one of the above.</p>

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

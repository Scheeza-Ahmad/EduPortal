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

interface GradeSuggestion {
  activityId: string;
  totalSubmissions: number;
  gradedCount: number;
  ungradedCount: number;
  stats: { mean: number; stdDev: number; min: number; max: number; median: number } | null;
  suggestion: { excellent: string; good: string; average: string; needsWork: string } | null;
  distribution: { excellent: number; good: number; average: number; needsWork: number } | null;
  reason?: string;
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

  const [aiDialogOpen, setAiDialogOpen] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiInsight, setAiInsight] = useState<GradeSuggestion | null>(null);

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

  async function openAiInsight() {
    setAiDialogOpen(true);
    setAiLoading(true);
    try {
      const res = await api.get<{ success: boolean; data: GradeSuggestion }>(
        `/api/teacher/activities/${activityId}/grade-suggestion`
      );
      setAiInsight(res.data.data);
    } catch {
      setAiInsight(null);
    } finally {
      setAiLoading(false);
    }
  }

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
        <Button variant="outline" onClick={openAiInsight}>
          🤖 AI Grade Insight
        </Button>
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

      <Dialog open={aiDialogOpen} onOpenChange={setAiDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>🤖 AI Grade Insight — {activity?.title ?? 'Activity'}</DialogTitle>
          </DialogHeader>
          {aiLoading ? (
            <p className="text-sm text-muted-foreground">Analyzing grades...</p>
          ) : !aiInsight || !aiInsight.stats || !aiInsight.distribution || !aiInsight.suggestion ? (
            <p className="text-sm text-muted-foreground">
              {aiInsight?.reason ?? 'Not enough graded submissions yet.'}
            </p>
          ) : (
            <div className="space-y-5 text-sm">
              <div>
                <div className="mb-2 font-semibold">Class Statistics</div>
                <div className="grid grid-cols-2 gap-2 rounded-md border p-3">
                  <div>
                    Average Score: <span className="font-medium">{aiInsight.stats.mean} / {activity?.totalMarks}</span>{' '}
                    <span className="text-muted-foreground">
                      ({activity ? Math.round((aiInsight.stats.mean / activity.totalMarks) * 100) : 0}%)
                    </span>
                  </div>
                  <div>
                    Highest Score: <span className="font-medium">{aiInsight.stats.max} / {activity?.totalMarks}</span>
                  </div>
                  <div>
                    Lowest Score: <span className="font-medium">{aiInsight.stats.min} / {activity?.totalMarks}</span>
                  </div>
                  <div>
                    Std Deviation: <span className="font-medium">{aiInsight.stats.stdDev}</span>
                  </div>
                </div>
              </div>

              <div>
                <div className="mb-2 font-semibold">Grade Distribution</div>
                <div className="space-y-1 rounded-md border p-3">
                  <div>🟢 Excellent ({aiInsight.suggestion.excellent}): {aiInsight.distribution.excellent} students</div>
                  <div>🔵 Good ({aiInsight.suggestion.good}): {aiInsight.distribution.good} students</div>
                  <div>🟡 Average ({aiInsight.suggestion.average}): {aiInsight.distribution.average} students</div>
                  <div>🔴 Needs Work ({aiInsight.suggestion.needsWork}): {aiInsight.distribution.needsWork} students</div>
                </div>
              </div>

              {activity && (
                <div>
                  <div className="mb-2 font-semibold">Grading Suggestion</div>
                  <div className="space-y-1 rounded-md border p-3">
                    {(
                      [
                        [0.9, 1, 'A+'],
                        [0.8, 0.9, 'A'],
                        [0.7, 0.8, 'B+'],
                        [0.6, 0.7, 'B'],
                        [0.5, 0.6, 'C'],
                        [0, 0.5, 'F'],
                      ] as [number, number, string][]
                    ).map(([lo, hi, gradeLabel]) => {
                      const total = activity.totalMarks;
                      const loMark = Math.ceil(lo * total);
                      const hiMark = Math.max(loMark, Math.floor(hi * total) - (hi < 1 ? 1 : 0));
                      return (
                        <div key={gradeLabel} className="flex justify-between">
                          <span className="font-medium">{gradeLabel}</span>
                          <span className="text-muted-foreground">
                            {gradeLabel === 'F' ? `Below ${Math.ceil(0.5 * total)}` : `${loMark}-${hiMark} marks`}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <p className="text-xs text-muted-foreground">
                Note: Based on {aiInsight.gradedCount} graded submission{aiInsight.gradedCount === 1 ? '' : 's'}
                {aiInsight.ungradedCount > 0 ? ` (${aiInsight.ungradedCount} still ungraded)` : ''}.
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAiDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

'use client';

import { FormEvent, useEffect, useState } from 'react';
import { AxiosError } from 'axios';
import { api } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface Report {
  id: string;
  monthYear: string;
  activitiesCount: number;
  attendanceRate: number;
  studentPerformanceSummary: string | null;
  challengesFaced: string | null;
  plansNextMonth: string | null;
  status: string;
  coordinatorComment: string | null;
  teacher: { name: string; email: string };
}

function getErrorMessage(err: unknown, fallback: string): string {
  const axiosErr = err as AxiosError<{ error?: string }>;
  return axiosErr.response?.data?.error ?? fallback;
}

export default function CoordinatorReportsPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [monthYear, setMonthYear] = useState('');
  const [status, setStatus] = useState('all');

  const [reviewTarget, setReviewTarget] = useState<Report | null>(null);
  const [comment, setComment] = useState('');
  const [submittingAction, setSubmittingAction] = useState<string | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);

  async function loadReports() {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string> = {};
      if (monthYear) params.monthYear = monthYear;
      if (status !== 'all') params.status = status;
      const res = await api.get<{ success: boolean; data: { reports: Report[] } }>('/api/coordinator/reports', {
        params,
      });
      setReports(res.data.data.reports);
    } catch {
      setError('Failed to load reports.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadReports();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthYear, status]);

  function openReview(report: Report) {
    setReviewTarget(report);
    setComment(report.coordinatorComment ?? '');
    setReviewError(null);
  }

  async function handleAction(action: 'reviewed' | 'forwarded' | 'rejected') {
    if (!reviewTarget) return;
    setSubmittingAction(action);
    setReviewError(null);
    try {
      await api.patch(`/api/coordinator/reports/${reviewTarget.id}/review`, {
        coordinatorComment: comment || undefined,
        action,
      });
      setReviewTarget(null);
      await loadReports();
    } catch (err) {
      setReviewError(getErrorMessage(err, 'Failed to update report.'));
    } finally {
      setSubmittingAction(null);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Monthly Reports</h1>

      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-2">
          <Label>Month/Year</Label>
          <Input placeholder="2026-09" value={monthYear} onChange={(e) => setMonthYear(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Status</Label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="submitted">Submitted</SelectItem>
              <SelectItem value="reviewed">Reviewed</SelectItem>
              <SelectItem value="forwarded">Forwarded</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : reports.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-center text-sm text-muted-foreground">No reports found.</CardContent>
        </Card>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Teacher</TableHead>
                <TableHead>Month</TableHead>
                <TableHead>Activities</TableHead>
                <TableHead>Attendance</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reports.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.teacher.name}</TableCell>
                  <TableCell>{r.monthYear}</TableCell>
                  <TableCell>{r.activitiesCount}</TableCell>
                  <TableCell>{r.attendanceRate}%</TableCell>
                  <TableCell>
                    <Badge variant="outline">{r.status}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="outline" size="sm" onClick={() => openReview(r)}>
                      Review
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={Boolean(reviewTarget)} onOpenChange={(open) => !open && setReviewTarget(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>
              Review Report — {reviewTarget?.teacher.name} ({reviewTarget?.monthYear})
            </DialogTitle>
          </DialogHeader>
          {reviewTarget && (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3 rounded-md border p-3">
                <div>
                  <div className="text-xs text-muted-foreground">Activities Created</div>
                  <div className="font-medium">{reviewTarget.activitiesCount}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Average Attendance</div>
                  <div className="font-medium">{reviewTarget.attendanceRate}%</div>
                </div>
              </div>
              <div>
                <div className="mb-1 text-xs font-medium text-muted-foreground">Student Performance Summary</div>
                <p className="rounded-md border p-2 text-sm">{reviewTarget.studentPerformanceSummary || '—'}</p>
              </div>
              <div>
                <div className="mb-1 text-xs font-medium text-muted-foreground">Challenges Faced</div>
                <p className="rounded-md border p-2 text-sm">{reviewTarget.challengesFaced || '—'}</p>
              </div>
              <div>
                <div className="mb-1 text-xs font-medium text-muted-foreground">Plans for Next Month</div>
                <p className="rounded-md border p-2 text-sm">{reviewTarget.plansNextMonth || '—'}</p>
              </div>

              <form
                onSubmit={(e: FormEvent) => e.preventDefault()}
                className="space-y-2"
              >
                <Label>Coordinator Comment</Label>
                <Textarea value={comment} onChange={(e) => setComment(e.target.value)} />
              </form>

              {reviewError && (
                <p className="text-sm text-destructive" role="alert">
                  {reviewError}
                </p>
              )}
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              disabled={Boolean(submittingAction)}
              onClick={() => handleAction('reviewed')}
            >
              {submittingAction === 'reviewed' ? 'Saving...' : 'Mark Reviewed'}
            </Button>
            <Button disabled={Boolean(submittingAction)} onClick={() => handleAction('forwarded')}>
              {submittingAction === 'forwarded' ? 'Saving...' : 'Forward to Admin'}
            </Button>
            <Button
              variant="destructive"
              disabled={Boolean(submittingAction)}
              onClick={() => handleAction('rejected')}
            >
              {submittingAction === 'rejected' ? 'Saving...' : 'Reject'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { AxiosError } from 'axios';
import { api } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
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

interface LeaveRequestRow {
  id: string;
  studentName: string;
  rollNo: string;
  classLabel: string;
  reason: string;
  startDate: string;
  endDate: string;
  status: 'pending' | 'approved' | 'rejected';
  reviewNote: string | null;
}

const STATUS_STYLE: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  approved: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
};

function getErrorMessage(err: unknown, fallback: string): string {
  const axiosErr = err as AxiosError<{ error?: string }>;
  return axiosErr.response?.data?.error ?? fallback;
}

export default function TeacherLeaveRequestsPage() {
  const [requests, setRequests] = useState<LeaveRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [reviewTarget, setReviewTarget] = useState<LeaveRequestRow | null>(null);
  const [reviewNote, setReviewNote] = useState('');
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [submittingAction, setSubmittingAction] = useState<string | null>(null);

  async function loadRequests() {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<{ success: boolean; data: { requests: LeaveRequestRow[] } }>(
        '/api/teacher/leave-requests'
      );
      setRequests(res.data.data.requests);
    } catch {
      setError('Failed to load leave requests.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadRequests();
  }, []);

  function openReview(r: LeaveRequestRow) {
    setReviewTarget(r);
    setReviewNote(r.reviewNote ?? '');
    setReviewError(null);
  }

  async function handleAction(action: 'approved' | 'rejected', target?: LeaveRequestRow) {
    const row = target ?? reviewTarget;
    if (!row) return;
    setSubmittingAction(action);
    setReviewError(null);
    try {
      await api.patch(`/api/teacher/leave-requests/${row.id}/review`, {
        action,
        reviewNote: target ? undefined : reviewNote || undefined,
      });
      setReviewTarget(null);
      await loadRequests();
    } catch (err) {
      setReviewError(getErrorMessage(err, 'Failed to update leave request.'));
    } finally {
      setSubmittingAction(null);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Leave Requests</h1>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : requests.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-center text-sm text-muted-foreground">
            No leave requests from your students.
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Student</TableHead>
                <TableHead>Class</TableHead>
                <TableHead>Date Range</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {requests.map((r) => (
                <TableRow key={r.id} className="cursor-pointer" onClick={() => openReview(r)}>
                  <TableCell>
                    <div className="font-medium">{r.studentName}</div>
                    <div className="text-xs text-muted-foreground">{r.rollNo}</div>
                  </TableCell>
                  <TableCell>{r.classLabel}</TableCell>
                  <TableCell>
                    {new Date(r.startDate).toLocaleDateString()} – {new Date(r.endDate).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="max-w-[200px] truncate">{r.reason}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={STATUS_STYLE[r.status]}>
                      {r.status.toUpperCase()}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {r.status === 'pending' && (
                      <div className="flex justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                        <Button size="sm" onClick={() => handleAction('approved', r)}>
                          Approve
                        </Button>
                        <Button variant="destructive" size="sm" onClick={() => handleAction('rejected', r)}>
                          Reject
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={Boolean(reviewTarget)} onOpenChange={(open) => !open && setReviewTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Leave Request — {reviewTarget?.studentName}</DialogTitle>
          </DialogHeader>
          {reviewTarget && (
            <div className="space-y-4">
              <div className="space-y-1 rounded-md border p-3 text-sm">
                <div>
                  <span className="text-muted-foreground">Class: </span>
                  {reviewTarget.classLabel}
                </div>
                <div>
                  <span className="text-muted-foreground">Dates: </span>
                  {new Date(reviewTarget.startDate).toLocaleDateString()} –{' '}
                  {new Date(reviewTarget.endDate).toLocaleDateString()}
                </div>
                <div>
                  <span className="text-muted-foreground">Reason: </span>
                  {reviewTarget.reason}
                </div>
              </div>
              <div className="space-y-2">
                <Label>Review Note</Label>
                <Textarea value={reviewNote} onChange={(e) => setReviewNote(e.target.value)} />
              </div>
              {reviewError && (
                <p className="text-sm text-destructive" role="alert">
                  {reviewError}
                </p>
              )}
              {reviewTarget.status === 'pending' ? (
                <DialogFooter className="gap-2">
                  <Button
                    variant="destructive"
                    disabled={Boolean(submittingAction)}
                    onClick={() => handleAction('rejected')}
                  >
                    {submittingAction === 'rejected' ? 'Saving...' : 'Reject'}
                  </Button>
                  <Button disabled={Boolean(submittingAction)} onClick={() => handleAction('approved')}>
                    {submittingAction === 'approved' ? 'Saving...' : 'Approve'}
                  </Button>
                </DialogFooter>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Already {reviewTarget.status} — no further action needed.
                </p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

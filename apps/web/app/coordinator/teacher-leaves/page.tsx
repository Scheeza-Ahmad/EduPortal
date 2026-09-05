'use client';

import { useEffect, useState } from 'react';
import { AxiosError } from 'axios';
import { api } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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

interface TeacherLeaveRow {
  id: string;
  teacherName: string;
  fromDate: string;
  toDate: string;
  reason: string;
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

export default function CoordinatorTeacherLeavesPage() {
  const [leaves, setLeaves] = useState<TeacherLeaveRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [actingId, setActingId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<{ success: boolean; data: { leaves: TeacherLeaveRow[] } }>(
        '/api/coordinator/teacher-leaves'
      );
      setLeaves(res.data.data.leaves);
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load teacher leave requests.'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleDecision(id: string, action: 'approved' | 'rejected') {
    setActingId(id);
    try {
      await api.patch(`/api/coordinator/teacher-leaves/${id}/review`, {
        action,
        reviewNote: notes[id] || undefined,
      });
      await load();
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to update leave request.'));
    } finally {
      setActingId(null);
    }
  }

  const pending = leaves.filter((l) => l.status === 'pending');
  const reviewed = leaves.filter((l) => l.status !== 'pending');

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Teacher Leave Requests</h1>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : (
        <>
          <Card>
            <CardContent className="pt-6">
              <h2 className="mb-3 text-sm font-medium">Pending ({pending.length})</h2>
              {pending.length === 0 ? (
                <p className="text-sm text-muted-foreground">No pending leave requests.</p>
              ) : (
                <div className="space-y-3">
                  {pending.map((l) => (
                    <div key={l.id} className="space-y-2 rounded-md border p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="font-medium">{l.teacherName}</p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(l.fromDate).toLocaleDateString()} – {new Date(l.toDate).toLocaleDateString()}
                          </p>
                        </div>
                        <Badge variant="outline" className={STATUS_STYLE[l.status]}>
                          {l.status.toUpperCase()}
                        </Badge>
                      </div>
                      <p className="text-sm">{l.reason}</p>
                      <Textarea
                        placeholder="Review note (optional)"
                        value={notes[l.id] ?? ''}
                        onChange={(e) => setNotes((n) => ({ ...n, [l.id]: e.target.value }))}
                        rows={2}
                      />
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          disabled={actingId === l.id}
                          onClick={() => handleDecision(l.id, 'approved')}
                        >
                          {actingId === l.id ? '...' : 'Approve'}
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={actingId === l.id}
                          onClick={() => handleDecision(l.id, 'rejected')}
                        >
                          {actingId === l.id ? '...' : 'Reject'}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <h2 className="mb-3 text-sm font-medium">Reviewed</h2>
              {reviewed.length === 0 ? (
                <p className="text-sm text-muted-foreground">No reviewed leave requests yet.</p>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Teacher</TableHead>
                        <TableHead>Date Range</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Note</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {reviewed.map((l) => (
                        <TableRow key={l.id}>
                          <TableCell className="font-medium">{l.teacherName}</TableCell>
                          <TableCell>
                            {new Date(l.fromDate).toLocaleDateString()} – {new Date(l.toDate).toLocaleDateString()}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={STATUS_STYLE[l.status]}>
                              {l.status.toUpperCase()}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground">{l.reviewNote ?? '—'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

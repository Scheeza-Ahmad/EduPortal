'use client';

import { useEffect, useState } from 'react';
import { AxiosError } from 'axios';
import { api } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface StaffLeaveRow {
  id: string;
  staffName: string;
  role: string;
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

export default function StaffLeavesPage() {
  const [leaves, setLeaves] = useState<StaffLeaveRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<{ success: boolean; data: { leaves: StaffLeaveRow[] } }>(
        '/api/admin/staff-leaves'
      );
      setLeaves(res.data.data.leaves);
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load staff leaves.'));
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
      await api.patch(`/api/admin/staff-leaves/${id}/review`, { action });
      await load();
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to update leave request.'));
    } finally {
      setActingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Staff Leaves</h1>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : leaves.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-center text-sm text-muted-foreground">
            No staff leave requests yet.
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Staff Name</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Dates</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {leaves.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="font-medium">{l.staffName}</TableCell>
                  <TableCell className="capitalize text-muted-foreground">{l.role}</TableCell>
                  <TableCell>
                    {new Date(l.fromDate).toLocaleDateString()} – {new Date(l.toDate).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="max-w-[200px] truncate">{l.reason}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={STATUS_STYLE[l.status]}>
                      {l.status.toUpperCase()}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right space-x-2">
                    {l.status === 'pending' ? (
                      <>
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
                      </>
                    ) : (
                      <span className="text-sm text-muted-foreground">{l.reviewNote ?? '—'}</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

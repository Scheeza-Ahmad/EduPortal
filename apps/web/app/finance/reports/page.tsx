'use client';

import { FormEvent, useEffect, useState } from 'react';
import { AxiosError } from 'axios';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
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

interface FinanceReport {
  id: string;
  monthYear: string;
  totalDue: number;
  totalPaid: number;
  totalPending: number;
  totalLateFine: number;
  status: string;
  submittedAt: string | null;
  createdAt: string;
}

const STATUS_VARIANT: Record<string, 'default' | 'outline' | 'secondary'> = {
  draft: 'outline',
  submitted: 'secondary',
  approved: 'default',
};

function getErrorMessage(err: unknown, fallback: string): string {
  const axiosErr = err as AxiosError<{ error?: string }>;
  return axiosErr.response?.data?.error ?? fallback;
}

export default function FinanceReportsPage() {
  const [reports, setReports] = useState<FinanceReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [monthYear, setMonthYear] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [submittingId, setSubmittingId] = useState<string | null>(null);

  async function loadReports() {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<{ success: boolean; data: { reports: FinanceReport[] } }>(
        '/api/finance/reports'
      );
      setReports(res.data.data.reports);
    } catch {
      setError('Failed to load finance reports.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadReports();
  }, []);

  async function handleGenerate(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setGenerating(true);
    try {
      await api.post('/api/finance/reports/generate', { monthYear });
      setDialogOpen(false);
      setMonthYear('');
      await loadReports();
    } catch (err) {
      setFormError(getErrorMessage(err, 'Failed to generate report.'));
    } finally {
      setGenerating(false);
    }
  }

  async function handleSubmit(report: FinanceReport) {
    setSubmittingId(report.id);
    try {
      await api.patch(`/api/finance/reports/${report.id}/submit`);
      await loadReports();
    } catch {
      setError('Failed to submit report.');
    } finally {
      setSubmittingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Finance Reports</h1>
        <Button
          onClick={() => {
            setMonthYear('');
            setFormError(null);
            setDialogOpen(true);
          }}
        >
          + Generate Report
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : reports.length === 0 ? (
        <p className="text-sm text-muted-foreground">No finance reports yet.</p>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Month</TableHead>
                <TableHead>Total Due</TableHead>
                <TableHead>Total Paid</TableHead>
                <TableHead>Pending</TableHead>
                <TableHead>Late Fines</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reports.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.monthYear}</TableCell>
                  <TableCell>PKR {r.totalDue.toLocaleString()}</TableCell>
                  <TableCell>PKR {r.totalPaid.toLocaleString()}</TableCell>
                  <TableCell>PKR {r.totalPending.toLocaleString()}</TableCell>
                  <TableCell>PKR {r.totalLateFine.toLocaleString()}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[r.status] ?? 'outline'}>{r.status}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {r.status === 'draft' && (
                      <Button
                        size="sm"
                        disabled={submittingId === r.id}
                        onClick={() => handleSubmit(r)}
                      >
                        {submittingId === r.id ? 'Submitting...' : 'Submit'}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Generate Finance Report</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleGenerate} className="space-y-4">
            <div className="space-y-2">
              <Label>Month/Year</Label>
              <Input
                required
                placeholder="2024-09"
                value={monthYear}
                onChange={(e) => setMonthYear(e.target.value)}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Regenerating an existing month&apos;s report recalculates it as a fresh draft.
            </p>
            {formError && (
              <p className="text-sm text-destructive" role="alert">
                {formError}
              </p>
            )}
            <DialogFooter>
              <Button type="submit" disabled={generating}>
                {generating ? 'Generating...' : 'Generate'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

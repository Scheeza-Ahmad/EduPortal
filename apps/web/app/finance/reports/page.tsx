'use client';

import { FormEvent, useEffect, useState } from 'react';
import { AxiosError } from 'axios';
import { api } from '@/lib/api';
import type { ReportClassGroup } from '@/lib/financeReportPdf';
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
  meta: { byClass: ReportClassGroup[] } | null;
}

const REPORT_STATUS_VARIANT: Record<string, 'default' | 'outline' | 'secondary'> = {
  draft: 'outline',
  submitted: 'secondary',
  approved: 'default',
};

const FEE_STATUS_STYLE: Record<string, string> = {
  paid: 'bg-green-100 text-green-800 hover:bg-green-100',
  unpaid: 'bg-gray-100 text-gray-700 hover:bg-gray-100',
  partial: 'bg-yellow-100 text-yellow-800 hover:bg-yellow-100',
  overdue: 'bg-red-100 text-red-800 hover:bg-red-100',
};

function getErrorMessage(err: unknown, fallback: string): string {
  const axiosErr = err as AxiosError<{ error?: string }>;
  return axiosErr.response?.data?.error ?? fallback;
}

function FeeStatusBadge({ status }: { status: string }) {
  return (
    <Badge variant="outline" className={FEE_STATUS_STYLE[status] ?? ''}>
      {status.toUpperCase()}
    </Badge>
  );
}

export default function FinanceReportsPage() {
  const [reports, setReports] = useState<FinanceReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [schoolName, setSchoolName] = useState('');

  const [dialogOpen, setDialogOpen] = useState(false);
  const [monthYear, setMonthYear] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [submittingId, setSubmittingId] = useState<string | null>(null);

  const [detailReport, setDetailReport] = useState<FinanceReport | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

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
    api
      .get<{ success: boolean; data: { name: string } }>('/api/finance/school-info')
      .then((res) => setSchoolName(res.data.data.name))
      .catch(() => setSchoolName(''));
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

  async function handleDownloadPdf(report: FinanceReport) {
    setDownloadingId(report.id);
    try {
      // Loaded on demand — @react-pdf/renderer is a heavy PDF-layout engine
      // that has no reason to be in this page's initial bundle.
      const [{ pdf }, { FinanceReportPdfDocument }] = await Promise.all([
        import('@react-pdf/renderer'),
        import('@/lib/financeReportPdf'),
      ]);
      const blob = await pdf(
        <FinanceReportPdfDocument
          schoolName={schoolName || 'EduPortal School'}
          monthYear={report.monthYear}
          totalDue={report.totalDue}
          totalPaid={report.totalPaid}
          totalPending={report.totalPending}
          totalLateFine={report.totalLateFine}
          byClass={report.meta?.byClass ?? []}
        />
      ).toBlob();

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `FinanceReport-${report.monthYear}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError('Failed to generate PDF.');
    } finally {
      setDownloadingId(null);
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
                    <Badge variant={REPORT_STATUS_VARIANT[r.status] ?? 'outline'}>{r.status}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => setDetailReport(r)}>
                        View Details
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={downloadingId === r.id}
                        onClick={() => handleDownloadPdf(r)}
                      >
                        {downloadingId === r.id ? 'Preparing...' : 'Download PDF'}
                      </Button>
                      {r.status === 'draft' && (
                        <Button
                          size="sm"
                          disabled={submittingId === r.id}
                          onClick={() => handleSubmit(r)}
                        >
                          {submittingId === r.id ? 'Submitting...' : 'Submit'}
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Generate report dialog */}
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

      {/* Report details dialog */}
      <Dialog open={Boolean(detailReport)} onOpenChange={(open) => !open && setDetailReport(null)}>
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Report Details — {detailReport?.monthYear}</DialogTitle>
          </DialogHeader>
          {detailReport && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-md border p-3">
                  <div className="text-xs text-muted-foreground">Total Due</div>
                  <div className="text-base font-semibold">PKR {detailReport.totalDue.toLocaleString()}</div>
                </div>
                <div className="rounded-md border p-3">
                  <div className="text-xs text-muted-foreground">Total Paid</div>
                  <div className="text-base font-semibold">PKR {detailReport.totalPaid.toLocaleString()}</div>
                </div>
                <div className="rounded-md border p-3">
                  <div className="text-xs text-muted-foreground">Pending</div>
                  <div className="text-base font-semibold">PKR {detailReport.totalPending.toLocaleString()}</div>
                </div>
                <div className="rounded-md border p-3">
                  <div className="text-xs text-muted-foreground">Collection Rate</div>
                  <div className="text-base font-semibold">
                    {detailReport.totalDue > 0
                      ? `${((detailReport.totalPaid / detailReport.totalDue) * 100).toFixed(1)}%`
                      : '0.0%'}
                  </div>
                </div>
              </div>

              {!detailReport.meta?.byClass || detailReport.meta.byClass.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No class-wise breakdown available for this report. Regenerate it to populate one.
                </p>
              ) : (
                detailReport.meta.byClass.map((group) => (
                  <div key={`${group.classNumber}-${group.section}`} className="space-y-2">
                    <div className="text-sm font-medium">
                      Class {group.classNumber} - Section {group.section} ({group.studentCount} students)
                    </div>
                    <div className="rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Student</TableHead>
                            <TableHead>Due</TableHead>
                            <TableHead>Discount</TableHead>
                            <TableHead>Payable</TableHead>
                            <TableHead>Paid</TableHead>
                            <TableHead>Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {group.students.map((s) => (
                            <TableRow key={s.rollNo + s.name}>
                              <TableCell>
                                <div className="font-medium">{s.name}</div>
                                <div className="text-xs text-muted-foreground">{s.rollNo}</div>
                              </TableCell>
                              <TableCell>{s.baseFee.toLocaleString()}</TableCell>
                              <TableCell>{s.discount.toLocaleString()}</TableCell>
                              <TableCell>{s.netPayable.toLocaleString()}</TableCell>
                              <TableCell>{s.paidAmount.toLocaleString()}</TableCell>
                              <TableCell>
                                <FeeStatusBadge status={s.status} />
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
          <DialogFooter>
            {detailReport && (
              <Button
                variant="outline"
                disabled={downloadingId === detailReport.id}
                onClick={() => handleDownloadPdf(detailReport)}
              >
                {downloadingId === detailReport.id ? 'Preparing...' : 'Download PDF'}
              </Button>
            )}
            <Button variant="outline" onClick={() => setDetailReport(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

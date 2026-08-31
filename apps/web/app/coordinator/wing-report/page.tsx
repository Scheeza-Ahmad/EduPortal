'use client';

import { FormEvent, useEffect, useState } from 'react';
import { AxiosError } from 'axios';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface WingSummary {
  monthYear: string;
  totalTeachers: number;
  activeTeachers: number;
  inactiveTeachers: number;
  totalStudents: number;
  wingAttendanceRate: number;
  activitiesCreated: number;
  atRiskStudentCount: number;
  teacherReportsSubmitted: number;
  teacherReportsTotal: number;
}

interface ExistingReport {
  id: string;
  status: string;
  notes: string | null;
  submittedAt: string;
}

function getErrorMessage(err: unknown, fallback: string): string {
  const axiosErr = err as AxiosError<{ error?: string }>;
  return axiosErr.response?.data?.error ?? fallback;
}

function defaultMonthYear(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export default function CoordinatorWingReportPage() {
  const [monthYear, setMonthYear] = useState(defaultMonthYear());
  const [summary, setSummary] = useState<WingSummary | null>(null);
  const [existing, setExisting] = useState<ExistingReport | null>(null);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!monthYear) return;
    setLoading(true);
    setError(null);
    setSuccess(false);
    api
      .get<{ success: boolean; data: { summary: WingSummary; existing: ExistingReport | null } }>(
        `/api/coordinator/wing-report/${monthYear}`
      )
      .then((res) => {
        setSummary(res.data.data.summary);
        setExisting(res.data.data.existing);
        setNotes(res.data.data.existing?.notes ?? '');
      })
      .catch(() => setError('Failed to load wing report summary.'))
      .finally(() => setLoading(false));
  }, [monthYear]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await api.post<{ success: boolean; data: ExistingReport }>('/api/coordinator/wing-report', {
        monthYear,
        notes: notes || undefined,
      });
      setExisting(res.data.data);
      setSuccess(true);
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to submit wing report.'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-xl font-semibold">Wing Monthly Report</h1>
        <div className="space-y-2">
          <Label>Month/Year</Label>
          <Input value={monthYear} onChange={(e) => setMonthYear(e.target.value)} placeholder="2026-09" />
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : summary ? (
        <>
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">Auto-Generated Summary — {monthYear}</CardTitle>
              {existing && <Badge variant="outline">{existing.status}</Badge>}
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <SummaryStat
                label="Total Teachers"
                value={`${summary.totalTeachers} (active: ${summary.activeTeachers}, inactive: ${summary.inactiveTeachers})`}
              />
              <SummaryStat label="Total Students" value={String(summary.totalStudents)} />
              <SummaryStat label="Wing Attendance" value={`${summary.wingAttendanceRate}%`} />
              <SummaryStat label="Activities Created" value={String(summary.activitiesCreated)} />
              <SummaryStat
                label="Submission Rate"
                value={`${summary.teacherReportsTotal > 0 ? Math.round((summary.teacherReportsSubmitted / summary.teacherReportsTotal) * 100) : 0}%`}
              />
              <SummaryStat label="At-Risk Students" value={String(summary.atRiskStudentCount)} />
              <SummaryStat
                label="Teacher Reports"
                value={`${summary.teacherReportsSubmitted} submitted, ${summary.teacherReportsTotal - summary.teacherReportsSubmitted} pending`}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Coordinator Notes / Recommendations</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                rows={5}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Any observations, recommendations, or context for the admin..."
              />
              {success && <p className="text-sm text-green-700">Wing report submitted to admin.</p>}
              <Button onClick={handleSubmit} disabled={submitting}>
                {submitting ? 'Submitting...' : 'Generate & Submit to Admin'}
              </Button>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm font-semibold">{value}</div>
    </div>
  );
}

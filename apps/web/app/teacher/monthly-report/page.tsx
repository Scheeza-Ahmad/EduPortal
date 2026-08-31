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

interface Stats {
  activitiesCount: number;
  attendanceRate: number;
  studentsInClasses: number;
}

interface Report {
  id: string;
  monthYear: string;
  status: string;
  studentPerformanceSummary: string | null;
  challengesFaced: string | null;
  plansNextMonth: string | null;
  coordinatorComment: string | null;
  adminComment: string | null;
}

function getErrorMessage(err: unknown, fallback: string): string {
  const axiosErr = err as AxiosError<{ error?: string }>;
  return axiosErr.response?.data?.error ?? fallback;
}

function defaultMonthYear(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function monthYearLabel(monthYear: string): string {
  const [y, m] = monthYear.split('-').map(Number);
  if (!y || !m) return monthYear;
  return new Date(y, m - 1, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' });
}

export default function TeacherMonthlyReportPage() {
  const [monthYear, setMonthYear] = useState(defaultMonthYear());
  const [stats, setStats] = useState<Stats | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [form, setForm] = useState({
    studentPerformanceSummary: '',
    challengesFaced: '',
    plansNextMonth: '',
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!monthYear) return;
    setLoading(true);
    setError(null);
    setSuccessMsg(null);
    api
      .get<{ success: boolean; data: { report: Report | null; stats: Stats } }>(
        `/api/teacher/monthly-report/${monthYear}`
      )
      .then((res) => {
        setStats(res.data.data.stats);
        setReport(res.data.data.report);
        setForm({
          studentPerformanceSummary: res.data.data.report?.studentPerformanceSummary ?? '',
          challengesFaced: res.data.data.report?.challengesFaced ?? '',
          plansNextMonth: res.data.data.report?.plansNextMonth ?? '',
        });
      })
      .catch(() => setError('Failed to load monthly report.'))
      .finally(() => setLoading(false));
  }, [monthYear]);

  const isLocked = report && report.status !== 'draft';

  async function handleSaveDraft(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await api.post<{ success: boolean; data: { report: Report; stats: Stats } }>(
        '/api/teacher/monthly-report',
        { monthYear, ...form }
      );
      setReport(res.data.data.report);
      setStats(res.data.data.stats);
      setSuccessMsg('Draft saved.');
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to save draft.'));
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmit() {
    if (!report) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await api.patch<{ success: boolean; data: Report }>(
        `/api/teacher/monthly-report/${report.id}/submit`
      );
      setReport(res.data.data);
      setSuccessMsg('Report submitted to your coordinator.');
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to submit report.'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-xl font-semibold">Monthly Report — {monthYearLabel(monthYear)}</h1>
        <div className="space-y-2">
          <Label>Month</Label>
          <Input value={monthYear} onChange={(e) => setMonthYear(e.target.value)} placeholder="2026-09" />
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : (
        <>
          {stats && (
            <Card>
              <CardContent className="grid grid-cols-3 gap-4 pt-6">
                <div>
                  <div className="text-xs text-muted-foreground">Activities Created</div>
                  <div className="text-xl font-bold">{stats.activitiesCount}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Average Attendance</div>
                  <div className="text-xl font-bold">{stats.attendanceRate}%</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Students in Classes</div>
                  <div className="text-xl font-bold">{stats.studentsInClasses}</div>
                </div>
              </CardContent>
            </Card>
          )}

          {report && report.status === 'approved' && (
            <Card className="border-green-300 bg-green-50">
              <CardContent className="pt-6">
                <Badge className="bg-green-600 hover:bg-green-600">Approved</Badge>
                {report.adminComment && (
                  <p className="mt-2 text-sm text-green-800">Admin comment: {report.adminComment}</p>
                )}
              </CardContent>
            </Card>
          )}

          {report && ['submitted', 'reviewed', 'forwarded', 'rejected'].includes(report.status) && (
            <Card>
              <CardContent className="pt-6 text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Status:</span>
                  <Badge variant="outline">{report.status}</Badge>
                </div>
                {report.coordinatorComment && (
                  <p className="mt-2 text-muted-foreground">Coordinator comment: {report.coordinatorComment}</p>
                )}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Report Details</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSaveDraft} className="space-y-4">
                <div className="space-y-2">
                  <Label>Student Performance Summary</Label>
                  <Textarea
                    rows={3}
                    disabled={Boolean(isLocked)}
                    placeholder="Overall class performance this month..."
                    value={form.studentPerformanceSummary}
                    onChange={(e) => setForm((f) => ({ ...f, studentPerformanceSummary: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Challenges Faced</Label>
                  <Textarea
                    rows={3}
                    disabled={Boolean(isLocked)}
                    placeholder="Any difficulties encountered..."
                    value={form.challengesFaced}
                    onChange={(e) => setForm((f) => ({ ...f, challengesFaced: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Plans for Next Month</Label>
                  <Textarea
                    rows={3}
                    disabled={Boolean(isLocked)}
                    placeholder="Topics to cover, events planned..."
                    value={form.plansNextMonth}
                    onChange={(e) => setForm((f) => ({ ...f, plansNextMonth: e.target.value }))}
                  />
                </div>

                {successMsg && <p className="text-sm text-green-700">{successMsg}</p>}
                {error && (
                  <p className="text-sm text-destructive" role="alert">
                    {error}
                  </p>
                )}

                {!isLocked && (
                  <div className="flex gap-2">
                    <Button type="submit" variant="outline" disabled={saving}>
                      {saving ? 'Saving...' : 'Save as Draft'}
                    </Button>
                    <Button type="button" disabled={!report || submitting} onClick={handleSubmit}>
                      {submitting ? 'Submitting...' : 'Submit to Coordinator'}
                    </Button>
                  </div>
                )}
              </form>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

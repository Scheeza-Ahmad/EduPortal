'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useParentStore } from '@/lib/parentStore';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface SubjectSummary {
  subjectId: string;
  subjectName: string;
  totalMarks: number;
  totalPossible: number;
  percentage: number;
}

interface ReportCard {
  student: { id: string; name: string; rollNo: string; class: { number: number; section: string } };
  subjectSummary: SubjectSummary[];
  overallPercentage: number;
}

export default function ParentReportCardPage() {
  const selectedChildId = useParentStore((s) => s.selectedChildId);

  const [report, setReport] = useState<ReportCard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (!selectedChildId) return;
    setLoading(true);
    setError(null);

    api
      .get<{ success: boolean; data: ReportCard }>(
        `/api/parent/child/${selectedChildId}/report-card`
      )
      .then((res) => setReport(res.data.data))
      .catch(() => setError('Failed to load report card.'))
      .finally(() => setLoading(false));
  }, [selectedChildId]);

  async function handleDownload() {
    if (!selectedChildId) return;
    setDownloading(true);
    try {
      const res = await api.get(`/api/parent/child/${selectedChildId}/report-card/pdf`, {
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.download = `report-card-${report?.student.rollNo ?? selectedChildId}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      setError('Failed to download report card.');
    } finally {
      setDownloading(false);
    }
  }

  if (loading) return <p className="text-sm text-muted-foreground">Loading report card...</p>;
  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!report) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Report Card</h1>
        <Button onClick={handleDownload} disabled={downloading}>
          {downloading ? 'Downloading...' : 'Download PDF'}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{report.student.name}</CardTitle>
          <p className="text-sm text-muted-foreground">
            Roll No {report.student.rollNo} · Class {report.student.class.number}
            {report.student.class.section}
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Overall percentage:{' '}
            <span className="text-lg font-semibold text-foreground">
              {report.overallPercentage}%
            </span>
          </p>

          {report.subjectSummary.length === 0 ? (
            <p className="text-sm text-muted-foreground">No graded work yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Subject</TableHead>
                  <TableHead>Marks</TableHead>
                  <TableHead>Percentage</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.subjectSummary.map((s) => (
                  <TableRow key={s.subjectId}>
                    <TableCell className="font-medium">{s.subjectName}</TableCell>
                    <TableCell>
                      {s.totalMarks} / {s.totalPossible}
                    </TableCell>
                    <TableCell>{s.percentage}%</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

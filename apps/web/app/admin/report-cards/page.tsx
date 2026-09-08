'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { ReportCardData } from '@/lib/reportCardPdf';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface ClassOption {
  id: string;
  number: number;
  section: string;
}

function classLabel(c: { number: number; section: string }): string {
  return `Class ${c.number} - ${c.section}`;
}

interface StudentOption {
  id: string;
  name: string;
  studentProfile: { rollNo: string } | null;
}

async function downloadReportCard(report: ReportCardData) {
  // Loaded on demand — @react-pdf/renderer is a heavy PDF-layout engine
  // that has no reason to be in this page's initial bundle.
  const [{ pdf }, { ReportCardPdfDocument }] = await Promise.all([
    import('@react-pdf/renderer'),
    import('@/lib/reportCardPdf'),
  ]);
  const blob = await pdf(<ReportCardPdfDocument {...report} />).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `ReportCard-${report.student.name}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function ReportCardsPage() {
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [selectedClassId, setSelectedClassId] = useState('');
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [report, setReport] = useState<ReportCardData | null>(null);

  const [loadingStudents, setLoadingStudents] = useState(false);
  const [loadingReport, setLoadingReport] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadingAll, setDownloadingAll] = useState(false);

  useEffect(() => {
    api
      .get<{ success: boolean; data: { classes: ClassOption[] } }>('/api/admin/classes')
      .then((res) => {
        const active = res.data.data.classes;
        setClasses(active);
        if (active.length > 0) setSelectedClassId(active[0].id);
      })
      .catch(() => setError('Failed to load classes.'));
  }, []);

  useEffect(() => {
    if (!selectedClassId) return;

    setLoadingStudents(true);
    setSelectedStudentId('');
    setReport(null);

    api
      .get<{ success: boolean; data: { students: StudentOption[] } }>(
        `/api/admin/students?classId=${selectedClassId}&limit=100`
      )
      .then((res) => setStudents(res.data.data.students))
      .catch(() => setStudents([]))
      .finally(() => setLoadingStudents(false));
  }, [selectedClassId]);

  useEffect(() => {
    if (!selectedStudentId) {
      setReport(null);
      return;
    }

    setLoadingReport(true);
    setError(null);

    api
      .get<{ success: boolean; data: ReportCardData }>(`/api/admin/report-cards/${selectedStudentId}`)
      .then((res) => setReport(res.data.data))
      .catch(() => setError('Failed to load report card.'))
      .finally(() => setLoadingReport(false));
  }, [selectedStudentId]);

  async function handleDownload() {
    if (!report) return;
    setDownloading(true);
    try {
      await downloadReportCard(report);
    } finally {
      setDownloading(false);
    }
  }

  async function handleDownloadAll() {
    if (!selectedClassId) return;
    setDownloadingAll(true);
    try {
      const res = await api.get<{ success: boolean; data: { reports: ReportCardData[] } }>(
        `/api/admin/report-cards/bulk/${selectedClassId}`
      );
      for (const r of res.data.data.reports) {
        // eslint-disable-next-line no-await-in-loop
        await downloadReportCard(r);
      }
    } catch {
      setError('Failed to generate bulk report cards.');
    } finally {
      setDownloadingAll(false);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Report Cards</h1>

      <Card>
        <CardContent className="flex flex-wrap items-end gap-4 pt-6">
          <div className="space-y-2">
            <p className="text-sm font-medium">Class</p>
            <Select value={selectedClassId} onValueChange={setSelectedClassId}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Select a class" />
              </SelectTrigger>
              <SelectContent>
                {classes.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {classLabel(c)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">Student</p>
            <Select value={selectedStudentId} onValueChange={setSelectedStudentId}>
              <SelectTrigger className="w-[240px]">
                <SelectValue
                  placeholder={loadingStudents ? 'Loading...' : 'Select a student'}
                />
              </SelectTrigger>
              <SelectContent>
                {students.length === 0 ? (
                  <div className="px-2 py-1.5 text-sm text-muted-foreground">
                    No students in this class.
                  </div>
                ) : (
                  students.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                      {s.studentProfile ? ` (Roll ${s.studentProfile.rollNo})` : ''}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          <Button
            variant="outline"
            disabled={!selectedClassId || downloadingAll}
            onClick={handleDownloadAll}
          >
            {downloadingAll ? 'Generating...' : 'Download All (Bulk)'}
          </Button>
        </CardContent>
      </Card>

      {loadingReport ? (
        <p className="text-sm text-muted-foreground">Loading report card...</p>
      ) : error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : !report ? (
        <p className="text-sm text-muted-foreground">Select a student to view their report card.</p>
      ) : (
        <>
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle className="text-base">{report.student.name}</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Roll No {report.student.rollNo} · Class {report.student.class}-{report.student.section}
                </p>
              </div>
              <Button size="sm" disabled={downloading} onClick={handleDownload}>
                {downloading ? 'Preparing...' : 'Download PDF'}
              </Button>
            </CardHeader>
            <CardContent>
              {report.subjects.length === 0 ? (
                <p className="text-sm text-muted-foreground">No graded work yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Subject</TableHead>
                      <TableHead>Teacher</TableHead>
                      <TableHead>Marks</TableHead>
                      <TableHead>Percentage</TableHead>
                      <TableHead>Grade</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.subjects.map((s) => (
                      <TableRow key={s.subjectName}>
                        <TableCell className="font-medium">{s.subjectName}</TableCell>
                        <TableCell className="text-muted-foreground">{s.teacherName}</TableCell>
                        <TableCell>
                          {s.obtainedMarks} / {s.totalMarks}
                        </TableCell>
                        <TableCell>{s.percentage}%</TableCell>
                        <TableCell>{s.grade}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow>
                      <TableCell className="font-semibold">OVERALL</TableCell>
                      <TableCell />
                      <TableCell />
                      <TableCell className="font-semibold">{report.overallPercentage}%</TableCell>
                      <TableCell className="font-semibold">{report.overallGrade}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Attendance</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Total Days: {report.attendance.totalDays} · Present: {report.attendance.presentDays} · Rate:{' '}
              {report.attendance.percentage}%
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

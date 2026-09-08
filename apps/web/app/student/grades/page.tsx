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

type GradeCard = ReportCardData;

interface GradeEntry {
  id: string;
  activityTitle: string;
  marks: number;
  totalMarks: number;
  percentage: number;
  feedback: string | null;
  gradedAt: string;
}

interface SubjectGrades {
  subjectId: string;
  subjectName: string;
  grades: GradeEntry[];
}

export default function StudentGradesPage() {
  const [gradeCard, setGradeCard] = useState<GradeCard | null>(null);
  const [subjectGrades, setSubjectGrades] = useState<SubjectGrades[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api.get<{ success: boolean; data: GradeCard }>('/api/student/grade-card'),
      api.get<{ success: boolean; data: { subjects: SubjectGrades[] } }>('/api/student/grades'),
    ])
      .then(([cardRes, gradesRes]) => {
        setGradeCard(cardRes.data.data);
        setSubjectGrades(gradesRes.data.data.subjects);
      })
      .catch(() => setError('Failed to load grades.'))
      .finally(() => setLoading(false));
  }, []);

  const [downloading, setDownloading] = useState(false);

  async function handleDownload() {
    if (!gradeCard) return;
    setDownloading(true);
    try {
      // Loaded on demand — @react-pdf/renderer is a heavy PDF-layout engine
      // that has no reason to be in this page's initial bundle.
      const [{ pdf }, { ReportCardPdfDocument }] = await Promise.all([
        import('@react-pdf/renderer'),
        import('@/lib/reportCardPdf'),
      ]);
      const blob = await pdf(<ReportCardPdfDocument {...gradeCard} />).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ReportCard-${gradeCard.student.name}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  }

  if (loading) return <p className="text-sm text-muted-foreground">Loading grades...</p>;
  if (error) return <p className="text-sm text-destructive">{error}</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Grades</h1>
        <Button size="sm" disabled={!gradeCard || downloading} onClick={handleDownload}>
          {downloading ? 'Preparing...' : 'Download Report Card'}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Grade Card</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Overall percentage:{' '}
            <span className="text-lg font-semibold text-foreground">
              {gradeCard?.overallPercentage ?? 0}%
            </span>
          </p>

          {!gradeCard || gradeCard.subjects.length === 0 ? (
            <p className="text-sm text-muted-foreground">No graded work yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Subject</TableHead>
                  <TableHead>Marks</TableHead>
                  <TableHead>Percentage</TableHead>
                  <TableHead>Grade</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {gradeCard.subjects.map((s) => (
                  <TableRow key={s.subjectName}>
                    <TableCell className="font-medium">{s.subjectName}</TableCell>
                    <TableCell>
                      {s.obtainedMarks} / {s.totalMarks}
                    </TableCell>
                    <TableCell>{s.percentage}%</TableCell>
                    <TableCell>{s.grade}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {subjectGrades.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-center text-sm text-muted-foreground">
            No graded activities yet.
          </CardContent>
        </Card>
      ) : (
        subjectGrades.map((subject) => (
          <Card key={subject.subjectId}>
            <CardHeader>
              <CardTitle className="text-base">{subject.subjectName}</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Activity</TableHead>
                    <TableHead>Marks</TableHead>
                    <TableHead>Percentage</TableHead>
                    <TableHead>Feedback</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {subject.grades.map((g) => (
                    <TableRow key={g.id}>
                      <TableCell className="font-medium">{g.activityTitle}</TableCell>
                      <TableCell>
                        {g.marks} / {g.totalMarks}
                      </TableCell>
                      <TableCell>{g.percentage}%</TableCell>
                      <TableCell className="max-w-[200px] truncate text-muted-foreground">
                        {g.feedback ?? '—'}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(g.gradedAt).toLocaleDateString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}

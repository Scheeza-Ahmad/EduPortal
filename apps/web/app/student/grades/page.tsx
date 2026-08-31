'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
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

interface GradeCard {
  subjectSummary: SubjectSummary[];
  overallPercentage: number;
}

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

  if (loading) return <p className="text-sm text-muted-foreground">Loading grades...</p>;
  if (error) return <p className="text-sm text-destructive">{error}</p>;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Grades</h1>

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

          {!gradeCard || gradeCard.subjectSummary.length === 0 ? (
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
                {gradeCard.subjectSummary.map((s) => (
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

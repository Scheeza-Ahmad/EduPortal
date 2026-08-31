'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useParentStore } from '@/lib/parentStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

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

export default function ParentGradesPage() {
  const selectedChildId = useParentStore((s) => s.selectedChildId);
  const selectedChild = useParentStore((s) =>
    s.children.find((c) => c.id === s.selectedChildId)
  );

  const [subjectGrades, setSubjectGrades] = useState<SubjectGrades[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedChildId) return;
    setLoading(true);
    setError(null);

    api
      .get<{ success: boolean; data: { subjects: SubjectGrades[] } }>(
        `/api/parent/child/${selectedChildId}/grades`
      )
      .then((res) => setSubjectGrades(res.data.data.subjects))
      .catch(() => setError('Failed to load grades.'))
      .finally(() => setLoading(false));
  }, [selectedChildId]);

  if (loading) return <p className="text-sm text-muted-foreground">Loading grades...</p>;
  if (error) return <p className="text-sm text-destructive">{error}</p>;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">
        {selectedChild ? `${selectedChild.name}'s Grades` : 'Grades'}
      </h1>

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

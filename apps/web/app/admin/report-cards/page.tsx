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

interface SubjectSummary {
  subjectId: string;
  subjectName: string;
  totalMarks: number;
  totalPossible: number;
  percentage: number;
}

interface GradeEntry {
  id: string;
  subject: string;
  activityTitle: string;
  marks: number;
  totalMarks: number;
  feedback: string | null;
  gradedAt: string;
}

interface ReportCard {
  student: { id: string; name: string; rollNo: string; class: ClassOption };
  subjectSummary: SubjectSummary[];
  grades: GradeEntry[];
}

export default function ReportCardsPage() {
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [selectedClassId, setSelectedClassId] = useState('');
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [report, setReport] = useState<ReportCard | null>(null);

  const [loadingStudents, setLoadingStudents] = useState(false);
  const [loadingReport, setLoadingReport] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      .get<{ success: boolean; data: ReportCard }>(`/api/admin/report-cards/${selectedStudentId}`)
      .then((res) => setReport(res.data.data))
      .catch(() => setError('Failed to load report card.'))
      .finally(() => setLoadingReport(false));
  }, [selectedStudentId]);

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
            <CardHeader>
              <CardTitle className="text-base">{report.student.name}</CardTitle>
              <p className="text-sm text-muted-foreground">
                Roll No {report.student.rollNo} · {classLabel(report.student.class)}
              </p>
            </CardHeader>
            <CardContent>
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

          <Card>
            <CardHeader>
              <CardTitle className="text-base">All Graded Activities</CardTitle>
            </CardHeader>
            <CardContent>
              {report.grades.length === 0 ? (
                <p className="text-sm text-muted-foreground">No graded activities yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Activity</TableHead>
                      <TableHead>Subject</TableHead>
                      <TableHead>Marks</TableHead>
                      <TableHead>Feedback</TableHead>
                      <TableHead>Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.grades.map((g) => (
                      <TableRow key={g.id}>
                        <TableCell className="font-medium">{g.activityTitle}</TableCell>
                        <TableCell>{g.subject}</TableCell>
                        <TableCell>
                          {g.marks} / {g.totalMarks}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {g.feedback ?? '—'}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {new Date(g.gradedAt).toLocaleDateString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

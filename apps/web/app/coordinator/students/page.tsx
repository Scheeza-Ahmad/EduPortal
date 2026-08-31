'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface AtRiskStudent {
  studentProfileId: string;
  name: string;
  classNumber: number;
  section: string;
  attendanceRate: number;
  averageGrade: number | null;
  riskReason: 'Low Attendance' | 'Low Grades' | 'Both';
}

interface ClassSummary {
  classNumber: number;
  section: string;
  studentCount: number;
  attendanceRate: number;
  averageGrade: number;
}

interface StudentsOverview {
  totalStudents: number;
  averageAttendance: number;
  averageGrade: number;
  atRiskStudents: AtRiskStudent[];
  byClass: ClassSummary[];
}

const RISK_STYLE: Record<string, string> = {
  'Low Attendance': 'bg-yellow-100 text-yellow-800',
  'Low Grades': 'bg-orange-100 text-orange-800',
  Both: 'bg-red-100 text-red-800',
};

export default function CoordinatorStudentsPage() {
  const [data, setData] = useState<StudentsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<{ success: boolean; data: StudentsOverview }>('/api/coordinator/students')
      .then((res) => setData(res.data.data))
      .catch(() => setError('Failed to load students overview.'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-sm text-muted-foreground">Loading...</p>;
  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!data) return null;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Wing Students Overview</h1>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-xs text-muted-foreground">Total Students</div>
            <div className="mt-1 text-2xl font-bold">{data.totalStudents}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-xs text-muted-foreground">Avg Attendance</div>
            <div className="mt-1 text-2xl font-bold">{data.averageAttendance}%</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-xs text-muted-foreground">Avg Grade</div>
            <div className="mt-1 text-2xl font-bold">{data.averageGrade}%</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-xs text-muted-foreground">At-Risk Count</div>
            <div className="mt-1 text-2xl font-bold text-red-600">{data.atRiskStudents.length}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="bg-red-50">
          <CardTitle className="text-base text-red-700">At-Risk Students</CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          {data.atRiskStudents.length === 0 ? (
            <p className="text-sm text-muted-foreground">No at-risk students 🎉</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student</TableHead>
                  <TableHead>Class</TableHead>
                  <TableHead>Attendance %</TableHead>
                  <TableHead>Avg Grade</TableHead>
                  <TableHead>Risk Reason</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.atRiskStudents.map((s) => (
                  <TableRow key={s.studentProfileId}>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell>
                      {s.classNumber}-{s.section}
                    </TableCell>
                    <TableCell>{s.attendanceRate}%</TableCell>
                    <TableCell>{s.averageGrade != null ? `${s.averageGrade}%` : '—'}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={RISK_STYLE[s.riskReason]}>
                        {s.riskReason}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">By Class</CardTitle>
        </CardHeader>
        <CardContent>
          {data.byClass.length === 0 ? (
            <p className="text-sm text-muted-foreground">No classes yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Class</TableHead>
                  <TableHead>Students</TableHead>
                  <TableHead>Attendance %</TableHead>
                  <TableHead>Avg Grade</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.byClass.map((c, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">
                      {c.classNumber}-{c.section}
                    </TableCell>
                    <TableCell>{c.studentCount}</TableCell>
                    <TableCell>{c.attendanceRate}%</TableCell>
                    <TableCell>{c.averageGrade}%</TableCell>
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

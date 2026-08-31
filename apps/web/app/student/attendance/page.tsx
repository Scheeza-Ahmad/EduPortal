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

interface SubjectAttendance {
  subjectId: string;
  subjectName: string;
  present: number;
  absent: number;
  late: number;
  total: number;
  percentage: number;
}

interface AttendanceData {
  perSubject: SubjectAttendance[];
  overallPercentage: number;
}

export default function StudentAttendancePage() {
  const [data, setData] = useState<AttendanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    api
      .get<{ success: boolean; data: AttendanceData }>('/api/student/attendance')
      .then((res) => {
        if (!cancelled) setData(res.data.data);
      })
      .catch(() => {
        if (!cancelled) setError('Failed to load attendance.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) return <p className="text-sm text-muted-foreground">Loading attendance...</p>;
  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!data) return null;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Attendance</h1>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Overall Attendance (this month)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-bold">{data.overallPercentage}%</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">By Subject</CardTitle>
        </CardHeader>
        <CardContent>
          {data.perSubject.length === 0 ? (
            <p className="text-sm text-muted-foreground">No subjects yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Subject</TableHead>
                  <TableHead>Present</TableHead>
                  <TableHead>Absent</TableHead>
                  <TableHead>Late</TableHead>
                  <TableHead>Total Marked</TableHead>
                  <TableHead>Percentage</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.perSubject.map((s) => (
                  <TableRow key={s.subjectId}>
                    <TableCell className="font-medium">{s.subjectName}</TableCell>
                    <TableCell>{s.present}</TableCell>
                    <TableCell>{s.absent}</TableCell>
                    <TableCell>{s.late}</TableCell>
                    <TableCell>{s.total}</TableCell>
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

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { AxiosError } from 'axios';
import { ArrowLeft } from 'lucide-react';
import { api } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
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

interface ClassInfo {
  id: string;
  number: number;
  section: string;
  wing: 'junior' | 'senior' | 'both';
}

interface SubjectHere {
  id: string;
  name: string;
  creditHours: number;
}

interface StudentRow {
  id: string;
  name: string;
  email: string;
  rollNo: string;
}

interface ClassDetail {
  class: ClassInfo;
  isClassTeacher: boolean;
  mySubjectsHere: SubjectHere[];
  students: StudentRow[];
}

function getErrorMessage(err: unknown, fallback: string): string {
  const axiosErr = err as AxiosError<{ error?: string }>;
  return axiosErr.response?.data?.error ?? fallback;
}

export default function TeacherClassDetailPage() {
  const params = useParams<{ classId: string }>();
  const classId = params.classId;

  const [data, setData] = useState<ClassDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<{ success: boolean; data: ClassDetail }>(
        `/api/teacher/classes/${classId}`
      );
      setData(res.data.data);
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load class details.'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (classId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId]);

  return (
    <div className="space-y-6">
      <Link
        href="/teacher/classes"
        className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to My Classes
      </Link>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading class details...</p>
      ) : error ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 pt-6 text-center">
            <p className="text-sm text-destructive">{error}</p>
            <Button variant="outline" size="sm" onClick={load}>
              Retry
            </Button>
          </CardContent>
        </Card>
      ) : data ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-xl font-semibold">
                Class {data.class.number}
                {data.class.section}
              </h1>
              <div className="mt-1 flex items-center gap-2">
                <Badge variant="outline" className="capitalize">
                  {data.class.wing} wing
                </Badge>
                {data.isClassTeacher && <Badge>Class Teacher</Badge>}
              </div>
            </div>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Subjects You Teach Here</CardTitle>
            </CardHeader>
            <CardContent>
              {data.mySubjectsHere.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  You don&apos;t teach a subject in this class — you&apos;re the class teacher only.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {data.mySubjectsHere.map((s) => (
                    <Badge key={s.id} variant="secondary">
                      {s.name} · {s.creditHours} credit hours
                    </Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Students ({data.students.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {data.students.length === 0 ? (
                <p className="text-sm text-muted-foreground">No students in this class yet.</p>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Roll No</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Email</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.students.map((s) => (
                        <TableRow key={s.id}>
                          <TableCell className="font-medium">{s.rollNo}</TableCell>
                          <TableCell>{s.name}</TableCell>
                          <TableCell className="text-muted-foreground">{s.email}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}

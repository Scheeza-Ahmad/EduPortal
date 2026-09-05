'use client';

import { useEffect, useState } from 'react';
import { AxiosError } from 'axios';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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

type Status = 'present' | 'absent' | 'late' | 'leave' | 'half_day';

const STATUS_ORDER: Status[] = ['present', 'absent', 'late', 'leave', 'half_day'];

const STATUS_STYLE: Record<Status, { label: string; solid: string; outline: string }> = {
  present: {
    label: 'Present',
    solid: 'bg-green-600 hover:bg-green-700 text-white border-green-600',
    outline: 'border-green-600 text-green-700 hover:bg-green-50 dark:text-green-400',
  },
  absent: {
    label: 'Absent',
    solid: 'bg-red-600 hover:bg-red-700 text-white border-red-600',
    outline: 'border-red-600 text-red-700 hover:bg-red-50 dark:text-red-400',
  },
  late: {
    label: 'Late',
    solid: 'bg-orange-600 hover:bg-orange-700 text-white border-orange-600',
    outline: 'border-orange-600 text-orange-700 hover:bg-orange-50 dark:text-orange-400',
  },
  leave: {
    label: 'Leave',
    solid: 'bg-blue-600 hover:bg-blue-700 text-white border-blue-600',
    outline: 'border-blue-600 text-blue-700 hover:bg-blue-50 dark:text-blue-400',
  },
  half_day: {
    label: 'Half Day',
    solid: 'bg-purple-600 hover:bg-purple-700 text-white border-purple-600',
    outline: 'border-purple-600 text-purple-700 hover:bg-purple-50 dark:text-purple-400',
  },
};

interface SubjectOption {
  id: string;
  name: string;
  class: { number: number; section: string };
}

interface RosterEntry {
  studentId: string;
  name: string;
  rollNo: string;
  status: Status | null;
}

interface ReportEntry {
  studentId: string;
  name: string;
  rollNo: string;
  totalMarked: number;
  percentage: number;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function AttendancePage() {
  const [subjects, setSubjects] = useState<SubjectOption[]>([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState('');
  const [date, setDate] = useState(todayIso());

  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [loadingRoster, setLoadingRoster] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [report, setReport] = useState<ReportEntry[]>([]);
  const [loadingReport, setLoadingReport] = useState(false);

  useEffect(() => {
    api
      .get<{ success: boolean; data: { subjects: SubjectOption[] } }>('/api/teacher/subjects')
      .then((res) => {
        const list = res.data.data.subjects;
        setSubjects(list);
        if (list.length > 0) setSelectedSubjectId(list[0].id);
      })
      .catch(() => setError('Failed to load subjects.'));
  }, []);

  async function loadRoster() {
    if (!selectedSubjectId || !date) return;
    setLoadingRoster(true);
    setError(null);
    setSaveMessage(null);
    try {
      const res = await api.get<{ success: boolean; data: { roster: RosterEntry[] } }>(
        `/api/teacher/attendance/${selectedSubjectId}/${date}`
      );
      // Default anyone unmarked to "present" — teacher flips the exceptions.
      setRoster(res.data.data.roster.map((r) => ({ ...r, status: r.status ?? 'present' })));
    } catch {
      setError('Failed to load roster.');
    } finally {
      setLoadingRoster(false);
    }
  }

  async function loadReport() {
    if (!selectedSubjectId) return;
    setLoadingReport(true);
    try {
      const res = await api.get<{ success: boolean; data: { report: ReportEntry[] } }>(
        `/api/teacher/attendance/report/${selectedSubjectId}`
      );
      setReport(res.data.data.report);
    } catch {
      setReport([]);
    } finally {
      setLoadingReport(false);
    }
  }

  useEffect(() => {
    loadRoster();
    loadReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSubjectId, date]);

  function setStatus(studentId: string, status: Status) {
    setRoster((r) => r.map((entry) => (entry.studentId === studentId ? { ...entry, status } : entry)));
  }

  function markAllPresent() {
    setRoster((r) => r.map((entry) => ({ ...entry, status: 'present' })));
  }

  async function handleSave() {
    setSaving(true);
    setSaveMessage(null);
    setError(null);
    try {
      await api.post('/api/teacher/attendance', {
        subjectId: selectedSubjectId,
        date,
        records: roster.map((r) => ({ studentId: r.studentId, status: r.status ?? 'present' })),
      });
      setSaveMessage('Attendance saved.');
      await loadReport();
    } catch (err) {
      const axiosErr = err as AxiosError<{ error?: string }>;
      setError(axiosErr.response?.data?.error ?? 'Failed to save attendance.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Attendance</h1>

      <Card>
        <CardContent className="flex flex-wrap items-end gap-4 pt-6">
          <div className="space-y-2">
            <p className="text-sm font-medium">Subject</p>
            <Select value={selectedSubjectId} onValueChange={setSelectedSubjectId}>
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder="Select a subject" />
              </SelectTrigger>
              <SelectContent>
                {subjects.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name} (Class {s.class.number}
                    {s.class.section})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">Date</p>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>

          <Button variant="outline" onClick={markAllPresent} disabled={roster.length === 0}>
            Mark All Present
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Mark Attendance</CardTitle>
          <Button onClick={handleSave} disabled={saving || roster.length === 0}>
            {saving ? 'Saving...' : 'Save Attendance'}
          </Button>
        </CardHeader>
        <CardContent>
          {error && <p className="mb-3 text-sm text-destructive">{error}</p>}
          {saveMessage && <p className="mb-3 text-sm text-green-600">{saveMessage}</p>}

          {loadingRoster ? (
            <p className="text-sm text-muted-foreground">Loading roster...</p>
          ) : roster.length === 0 ? (
            <p className="text-sm text-muted-foreground">No students in this class yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Roll No</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {roster.map((entry) => (
                  <TableRow key={entry.studentId}>
                    <TableCell>{entry.rollNo}</TableCell>
                    <TableCell className="font-medium">{entry.name}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {STATUS_ORDER.map((status) => {
                          const isSelected = entry.status === status;
                          const style = STATUS_STYLE[status];
                          return (
                            <Button
                              key={status}
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => setStatus(entry.studentId, status)}
                              className={cn(isSelected ? style.solid : style.outline)}
                            >
                              {style.label}
                            </Button>
                          );
                        })}
                      </div>
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
          <CardTitle className="text-base">Monthly Attendance Report</CardTitle>
        </CardHeader>
        <CardContent>
          {loadingReport ? (
            <p className="text-sm text-muted-foreground">Loading report...</p>
          ) : report.length === 0 ? (
            <p className="text-sm text-muted-foreground">No attendance data yet this month.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Roll No</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Days Marked</TableHead>
                  <TableHead>Attendance %</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.map((entry) => (
                  <TableRow key={entry.studentId}>
                    <TableCell>{entry.rollNo}</TableCell>
                    <TableCell className="font-medium">{entry.name}</TableCell>
                    <TableCell>{entry.totalMarked}</TableCell>
                    <TableCell>{entry.percentage}%</TableCell>
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

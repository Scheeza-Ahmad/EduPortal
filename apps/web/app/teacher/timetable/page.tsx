'use client';

import { useEffect, useState } from 'react';
import { AxiosError } from 'axios';
import { api } from '@/lib/api';
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

interface TimetableSlot {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  room: string | null;
  subject: { id: string; name: string };
  class: { id: string; number: number; section: string };
}

const DAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function getErrorMessage(err: unknown, fallback: string): string {
  const axiosErr = err as AxiosError<{ error?: string }>;
  return axiosErr.response?.data?.error ?? fallback;
}

export default function TeacherTimetablePage() {
  const [slots, setSlots] = useState<TimetableSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<{ success: boolean; data: { slots: TimetableSlot[] } }>(
        '/api/teacher/timetable'
      );
      setSlots(res.data.data.slots);
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load timetable.'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  // Group by day so the week reads top-to-bottom rather than one long list.
  const byDay = DAY_LABELS.map((_, dayIndex) => slots.filter((s) => s.dayOfWeek === dayIndex)).map(
    (daySlots) => [...daySlots].sort((a, b) => a.startTime.localeCompare(b.startTime))
  );

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">My Timetable</h1>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading timetable...</p>
      ) : error ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 pt-6 text-center">
            <p className="text-sm text-destructive">{error}</p>
            <Button variant="outline" size="sm" onClick={load}>
              Retry
            </Button>
          </CardContent>
        </Card>
      ) : slots.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-center text-sm text-muted-foreground">
            No timetable slots assigned to you yet.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {DAY_LABELS.map((day, dayIndex) =>
            byDay[dayIndex].length === 0 ? null : (
              <Card key={day}>
                <CardHeader>
                  <CardTitle className="text-base">{day}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Time</TableHead>
                          <TableHead>Subject</TableHead>
                          <TableHead>Class</TableHead>
                          <TableHead>Room</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {byDay[dayIndex].map((slot) => (
                          <TableRow key={slot.id}>
                            <TableCell className="font-medium">
                              {slot.startTime} – {slot.endTime}
                            </TableCell>
                            <TableCell>{slot.subject.name}</TableCell>
                            <TableCell className="text-muted-foreground">
                              Class {slot.class.number}
                              {slot.class.section}
                            </TableCell>
                            <TableCell>{slot.room ?? '—'}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            )
          )}
        </div>
      )}
    </div>
  );
}

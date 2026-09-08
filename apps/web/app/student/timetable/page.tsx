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

interface TimetableSlot {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  room: string | null;
  subject: { name: string; teacher: { id: string; name: string } | null };
}

const DAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default function StudentTimetablePage() {
  const [slots, setSlots] = useState<TimetableSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<{ success: boolean; data: { slots: TimetableSlot[] } }>('/api/student/timetable')
      .then((res) => setSlots(res.data.data.slots))
      .catch(() => setError('Failed to load timetable.'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-sm text-muted-foreground">Loading timetable...</p>;
  if (error) return <p className="text-sm text-destructive">{error}</p>;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Timetable</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Weekly Schedule</CardTitle>
        </CardHeader>
        <CardContent>
          {slots.length === 0 ? (
            <p className="text-sm text-muted-foreground">No timetable set yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Day</TableHead>
                  <TableHead>Time</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Teacher</TableHead>
                  <TableHead>Room</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {slots.map((slot) => (
                  <TableRow key={slot.id}>
                    <TableCell className="font-medium">{DAY_LABELS[slot.dayOfWeek]}</TableCell>
                    <TableCell>
                      {slot.startTime} – {slot.endTime}
                    </TableCell>
                    <TableCell>{slot.subject.name}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {slot.subject.teacher?.name ?? 'Not Assigned'}
                    </TableCell>
                    <TableCell>{slot.room ?? '—'}</TableCell>
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

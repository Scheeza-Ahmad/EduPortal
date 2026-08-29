'use client';

import { FormEvent, useEffect, useState } from 'react';
import { AxiosError } from 'axios';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type CalendarType = 'exam' | 'holiday' | 'event';

interface CalendarDate {
  id: string;
  title: string;
  type: CalendarType;
  date: string;
}

interface CalendarForm {
  title: string;
  type: CalendarType;
  date: string;
}

const EMPTY_FORM: CalendarForm = { title: '', type: 'event', date: '' };

const TYPE_BADGE_VARIANT: Record<CalendarType, 'default' | 'secondary' | 'outline'> = {
  exam: 'default',
  holiday: 'secondary',
  event: 'outline',
};

export default function CalendarPage() {
  const [dates, setDates] = useState<CalendarDate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [typeFilter, setTypeFilter] = useState<'all' | CalendarType>('all');

  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<CalendarForm>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function loadDates() {
    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    if (typeFilter !== 'all') params.set('type', typeFilter);

    try {
      const res = await api.get<{ success: boolean; data: { dates: CalendarDate[] } }>(
        `/api/admin/calendar?${params.toString()}`
      );
      setDates(res.data.data.dates);
    } catch {
      setError('Failed to load calendar.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typeFilter]);

  function openAddDialog() {
    setForm(EMPTY_FORM);
    setFormError(null);
    setDialogOpen(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);

    try {
      await api.post('/api/admin/calendar', form);
      setDialogOpen(false);
      await loadDates();
    } catch (err) {
      const axiosErr = err as AxiosError<{ error?: string }>;
      setFormError(axiosErr.response?.data?.error ?? 'Failed to add calendar entry.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(entry: CalendarDate) {
    setDeletingId(entry.id);
    try {
      await api.delete(`/api/admin/calendar/${entry.id}`);
      await loadDates();
    } catch {
      setError('Failed to remove calendar entry.');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Academic Calendar</h1>
        <div className="flex items-center gap-2">
          <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as 'all' | CalendarType)}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Filter by type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              <SelectItem value="exam">Exam</SelectItem>
              <SelectItem value="holiday">Holiday</SelectItem>
              <SelectItem value="event">Event</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={openAddDialog}>Add Date</Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Upcoming & Past Dates</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading calendar...</p>
          ) : error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dates.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground">
                      No calendar entries yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  dates.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell className="font-medium">{entry.title}</TableCell>
                      <TableCell>
                        <Badge variant={TYPE_BADGE_VARIANT[entry.type]} className="capitalize">
                          {entry.type}
                        </Badge>
                      </TableCell>
                      <TableCell>{new Date(entry.date).toLocaleDateString()}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="destructive"
                          size="sm"
                          disabled={deletingId === entry.id}
                          onClick={() => handleDelete(entry)}
                        >
                          {deletingId === entry.id ? '...' : 'Remove'}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Calendar Date</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="calendar-title">Title</Label>
              <Input
                id="calendar-title"
                required
                placeholder="e.g. Mid-Term Exams"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label>Type</Label>
              <Select
                value={form.type}
                onValueChange={(v) => setForm((f) => ({ ...f, type: v as CalendarType }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="exam">Exam</SelectItem>
                  <SelectItem value="holiday">Holiday</SelectItem>
                  <SelectItem value="event">Event</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="calendar-date">Date</Label>
              <Input
                id="calendar-date"
                type="date"
                required
                value={form.date}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
              />
            </div>

            {formError && (
              <p className="text-sm text-destructive" role="alert">
                {formError}
              </p>
            )}

            <DialogFooter>
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Saving...' : 'Add'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

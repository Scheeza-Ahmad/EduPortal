'use client';

import { FormEvent, useEffect, useState } from 'react';
import { AxiosError } from 'axios';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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

interface ClassOption {
  id: string;
  number: number;
  section: string;
}

function classLabel(c: ClassOption): string {
  return `Class ${c.number} - ${c.section}`;
}

interface SubjectOption {
  id: string;
  name: string;
  teacher: { id: string; name: string } | null;
}

interface TimetableSlot {
  id: string;
  classId: string;
  subjectId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  room: string | null;
  subject: SubjectOption;
}

interface SlotForm {
  subjectId: string;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  room: string;
}

const EMPTY_FORM: SlotForm = { subjectId: '', dayOfWeek: '1', startTime: '', endTime: '', room: '' };

const DAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

interface PreviewSlot {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  subjectId: string;
  teacherId: string | null;
}

interface AutoGenerateResult {
  preview: true;
  generated: number;
  skipped: number;
  conflicts: { subject: string; reason: string }[];
  warnings: string[];
  schedule: { day: string; period: number; time: string; subject: string; teacher: string }[];
  teacherLoad: Record<string, number>;
  slots: PreviewSlot[];
}

export default function TimetablePage() {
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [selectedClassId, setSelectedClassId] = useState('');
  const [subjects, setSubjects] = useState<SubjectOption[]>([]);
  const [slots, setSlots] = useState<TimetableSlot[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSlot, setEditingSlot] = useState<TimetableSlot | null>(null);
  const [form, setForm] = useState<SlotForm>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [conflictWarning, setConflictWarning] = useState<string | null>(null);
  const [checkingConflict, setCheckingConflict] = useState(false);

  const [autoGenDialogOpen, setAutoGenDialogOpen] = useState(false);
  const [autoGenSubmitting, setAutoGenSubmitting] = useState(false);
  const [autoGenResult, setAutoGenResult] = useState<AutoGenerateResult | null>(null);
  const [autoGenError, setAutoGenError] = useState<string | null>(null);
  // Fix 4 — once the admin approves a preview, this holds the "saved"
  // confirmation instead of the preview, so the dialog can't be confused
  // for still-unsaved data.
  const [autoGenConfirmed, setAutoGenConfirmed] = useState<{ slotCount: number } | null>(null);
  const [autoGenConfirming, setAutoGenConfirming] = useState(false);

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

  async function loadSubjectsForClass(classId: string) {
    try {
      const res = await api.get<{ success: boolean; data: { subjects: SubjectOption[] } }>(
        `/api/admin/subjects?classId=${classId}`
      );
      setSubjects(res.data.data.subjects);
    } catch {
      setSubjects([]);
    }
  }

  async function loadSlots(classId: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<{ success: boolean; data: { slots: TimetableSlot[] } }>(
        `/api/admin/timetable/${classId}`
      );
      setSlots(res.data.data.slots);
    } catch {
      setError('Failed to load timetable.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!selectedClassId) return;
    loadSubjectsForClass(selectedClassId);
    loadSlots(selectedClassId);
  }, [selectedClassId]);

  function openAddDialog() {
    setEditingSlot(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setConflictWarning(null);
    setDialogOpen(true);
  }

  function openEditDialog(slot: TimetableSlot) {
    setEditingSlot(slot);
    setForm({
      subjectId: slot.subjectId,
      dayOfWeek: String(slot.dayOfWeek),
      startTime: slot.startTime,
      endTime: slot.endTime,
      room: slot.room ?? '',
    });
    setFormError(null);
    setConflictWarning(null);
    setDialogOpen(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);

    try {
      await api.post('/api/admin/timetable', {
        id: editingSlot?.id,
        classId: selectedClassId,
        subjectId: form.subjectId,
        dayOfWeek: Number(form.dayOfWeek),
        startTime: form.startTime,
        endTime: form.endTime,
        room: form.room || undefined,
      });
      setDialogOpen(false);
      await loadSlots(selectedClassId);
    } catch (err) {
      const axiosErr = err as AxiosError<{ error?: string }>;
      setFormError(axiosErr.response?.data?.error ?? 'Failed to save timetable slot.');
    } finally {
      setSubmitting(false);
    }
  }

  // Live conflict check — fires whenever subject/day/time are all filled in,
  // so the admin sees the warning (and Save gets disabled) before they even
  // try to submit, not just after a 409 comes back.
  useEffect(() => {
    const teacherId = subjects.find((s) => s.id === form.subjectId)?.teacher?.id;
    if (!teacherId || !form.startTime || !form.endTime) {
      setConflictWarning(null);
      return;
    }
    if (form.endTime <= form.startTime) {
      setConflictWarning(null);
      return;
    }

    let cancelled = false;
    setCheckingConflict(true);
    const params = new URLSearchParams({
      teacherId,
      dayOfWeek: form.dayOfWeek,
      startTime: form.startTime,
      endTime: form.endTime,
    });
    if (editingSlot) params.set('excludeSlotId', editingSlot.id);

    api
      .get<{ success: boolean; data: { conflict: boolean; message: string | null } }>(
        `/api/admin/timetable/check-conflict?${params.toString()}`
      )
      .then((res) => {
        if (!cancelled) setConflictWarning(res.data.data.conflict ? res.data.data.message : null);
      })
      .catch(() => {
        if (!cancelled) setConflictWarning(null);
      })
      .finally(() => {
        if (!cancelled) setCheckingConflict(false);
      });

    return () => {
      cancelled = true;
    };
  }, [form.subjectId, form.dayOfWeek, form.startTime, form.endTime, subjects, editingSlot]);

  async function handleDelete(slot: TimetableSlot) {
    setDeletingId(slot.id);
    try {
      await api.delete(`/api/admin/timetable/${slot.id}`);
      await loadSlots(selectedClassId);
    } catch {
      setError('Failed to delete timetable slot.');
    } finally {
      setDeletingId(null);
    }
  }

  function openAutoGenDialog() {
    setAutoGenResult(null);
    setAutoGenError(null);
    setAutoGenConfirmed(null);
    setAutoGenDialogOpen(true);
  }

  // Fix 4 step 1 — generates a PREVIEW only; nothing is written to the DB
  // until the admin clicks "Approve & Save" below.
  async function handleAutoGenerate() {
    setAutoGenSubmitting(true);
    setAutoGenError(null);
    setAutoGenConfirmed(null);
    try {
      const res = await api.post<{ success: boolean; data: AutoGenerateResult }>(
        '/api/admin/timetable/auto-generate',
        { classId: selectedClassId }
      );
      setAutoGenResult(res.data.data);
    } catch (err) {
      const axiosErr = err as AxiosError<{ error?: string }>;
      setAutoGenError(axiosErr.response?.data?.error ?? 'Failed to generate timetable.');
    } finally {
      setAutoGenSubmitting(false);
    }
  }

  // Fix 4 step 2 — actually persists the previewed slots, then refreshes the
  // live weekly grid below and lets teachers/students see the new timetable.
  async function handleApproveAndSave() {
    if (!autoGenResult) return;
    setAutoGenConfirming(true);
    setAutoGenError(null);
    try {
      const res = await api.post<{ success: boolean; data: { slotCount: number } }>(
        '/api/admin/timetable/auto-generate/confirm',
        { classId: selectedClassId, slots: autoGenResult.slots }
      );
      setAutoGenConfirmed(res.data.data);
      setAutoGenResult(null);
      await loadSlots(selectedClassId);
    } catch (err) {
      const axiosErr = err as AxiosError<{ error?: string }>;
      setAutoGenError(axiosErr.response?.data?.error ?? 'Failed to save timetable.');
    } finally {
      setAutoGenConfirming(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Timetable</h1>
        <div className="flex items-center gap-2">
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
          <Button variant="outline" onClick={openAutoGenDialog} disabled={!selectedClassId}>
            Auto-Generate
          </Button>
          <Button onClick={openAddDialog} disabled={!selectedClassId}>
            Add Slot
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {(() => {
              const selectedClass = classes.find((c) => c.id === selectedClassId);
              return selectedClass ? `${classLabel(selectedClass)} — Weekly Schedule` : 'Select a class';
            })()}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!selectedClassId ? (
            <p className="text-sm text-muted-foreground">
              Create a class first on the Students & Classes page.
            </p>
          ) : loading ? (
            <p className="text-sm text-muted-foreground">Loading timetable...</p>
          ) : error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Day</TableHead>
                  <TableHead>Time</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Teacher</TableHead>
                  <TableHead>Room</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {slots.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground">
                      No timetable slots yet for this class.
                    </TableCell>
                  </TableRow>
                ) : (
                  slots.map((slot) => (
                    <TableRow key={slot.id}>
                      <TableCell className="font-medium">{DAY_LABELS[slot.dayOfWeek]}</TableCell>
                      <TableCell>
                        {slot.startTime} – {slot.endTime}
                      </TableCell>
                      <TableCell>{slot.subject.name}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {slot.subject.teacher?.name ?? (
                          <Badge variant="destructive" className="text-[10px]">
                            Not Assigned
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>{slot.room ?? '—'}</TableCell>
                      <TableCell className="text-right space-x-2">
                        <Button variant="outline" size="sm" onClick={() => openEditDialog(slot)}>
                          Edit
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          disabled={deletingId === slot.id}
                          onClick={() => handleDelete(slot)}
                        >
                          {deletingId === slot.id ? '...' : 'Delete'}
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
            <DialogTitle>{editingSlot ? 'Edit Timetable Slot' : 'Add Timetable Slot'}</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            {(() => {
              const selectedClass = classes.find((c) => c.id === selectedClassId);
              return selectedClass ? (
                <p className="text-sm text-muted-foreground">
                  Class: <span className="font-medium text-foreground">{classLabel(selectedClass)}</span>
                </p>
              ) : null;
            })()}

            <div className="space-y-2">
              <Label>Subject</Label>
              <Select
                value={form.subjectId}
                onValueChange={(v) => setForm((f) => ({ ...f, subjectId: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a subject" />
                </SelectTrigger>
                <SelectContent>
                  {subjects.length === 0 ? (
                    <div className="px-2 py-1.5 text-sm text-muted-foreground">
                      No subjects for this class yet.
                    </div>
                  ) : (
                    subjects.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name} ({s.teacher?.name ?? 'Not Assigned'})
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              {conflictWarning && (
                <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-400">
                  ⚠️ {conflictWarning}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Day of Week</Label>
              <Select
                value={form.dayOfWeek}
                onValueChange={(v) => setForm((f) => ({ ...f, dayOfWeek: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DAY_LABELS.map((label, i) => (
                    <SelectItem key={i} value={String(i)}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="slot-start">Start Time</Label>
                <Input
                  id="slot-start"
                  type="time"
                  required
                  value={form.startTime}
                  onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="slot-end">End Time</Label>
                <Input
                  id="slot-end"
                  type="time"
                  required
                  value={form.endTime}
                  onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="slot-room">Room (optional)</Label>
              <Input
                id="slot-room"
                value={form.room}
                onChange={(e) => setForm((f) => ({ ...f, room: e.target.value }))}
              />
            </div>

            {formError && (
              <p className="text-sm text-destructive" role="alert">
                {formError}
              </p>
            )}

            <DialogFooter>
              <Button type="submit" disabled={submitting || checkingConflict || Boolean(conflictWarning)}>
                {submitting ? 'Saving...' : editingSlot ? 'Save Changes' : 'Add Slot'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={autoGenDialogOpen} onOpenChange={setAutoGenDialogOpen}>
        <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Auto-Generate Timetable
              {(() => {
                const c = classes.find((cl) => cl.id === selectedClassId);
                return c ? ` for ${classLabel(c)}` : '';
              })()}
            </DialogTitle>
          </DialogHeader>

          {autoGenConfirmed ? (
            <div className="space-y-3">
              <p className="text-sm text-green-600">
                ✅ Timetable saved and published! ({autoGenConfirmed.slotCount} slots) Students and
                teachers can now see it.
              </p>
              <DialogFooter>
                <Button onClick={() => setAutoGenDialogOpen(false)}>Close</Button>
              </DialogFooter>
            </div>
          ) : autoGenResult ? (
            <div className="space-y-3">
              <p className="text-sm font-medium text-yellow-700 dark:text-yellow-400">
                📋 Preview — this timetable has NOT been saved yet.
              </p>
              <p className="text-sm text-muted-foreground">
                Generated {autoGenResult.generated} slot{autoGenResult.generated === 1 ? '' : 's'}.
                {autoGenResult.skipped > 0 && (
                  <> ⚠️ {autoGenResult.skipped} subject{autoGenResult.skipped === 1 ? '' : 's'} skipped.</>
                )}
              </p>

              {autoGenResult.warnings.length > 0 && (
                <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 dark:border-red-900 dark:bg-red-950">
                  <p className="text-xs font-medium text-red-800 dark:text-red-400">Teachers needed:</p>
                  <ul className="list-disc space-y-1 pl-4 text-sm text-red-700 dark:text-red-400">
                    {autoGenResult.warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}

              {autoGenResult.conflicts.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Skipped:</p>
                  <ul className="list-disc space-y-1 pl-4 text-sm text-muted-foreground">
                    {autoGenResult.conflicts.map((c, i) => (
                      <li key={i}>
                        {c.subject}: {c.reason}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {autoGenResult.schedule.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Generated schedule:</p>
                  <div className="max-h-52 overflow-y-auto rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="h-8 text-xs">Day</TableHead>
                          <TableHead className="h-8 text-xs">Period</TableHead>
                          <TableHead className="h-8 text-xs">Time</TableHead>
                          <TableHead className="h-8 text-xs">Subject</TableHead>
                          <TableHead className="h-8 text-xs">Teacher</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {autoGenResult.schedule.map((s, i) => (
                          <TableRow key={i}>
                            <TableCell className="py-1 text-xs">{s.day}</TableCell>
                            <TableCell className="py-1 text-xs">{s.period}</TableCell>
                            <TableCell className="py-1 text-xs">{s.time}</TableCell>
                            <TableCell className="py-1 text-xs">{s.subject}</TableCell>
                            <TableCell className="py-1 text-xs">
                              {s.teacher === 'Not Assigned' ? (
                                <Badge variant="destructive" className="text-[10px]">
                                  Not Assigned
                                </Badge>
                              ) : (
                                s.teacher
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}

              {Object.keys(autoGenResult.teacherLoad).length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Teacher load (school-wide periods/week):</p>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(autoGenResult.teacherLoad).map(([name, load]) => (
                      <Badge key={name} variant="outline" className="text-xs">
                        {name}: {load}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {autoGenError && (
                <p className="text-sm text-destructive" role="alert">
                  {autoGenError}
                </p>
              )}

              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={handleAutoGenerate} disabled={autoGenSubmitting || autoGenConfirming}>
                  {autoGenSubmitting ? 'Regenerating...' : 'Regenerate'}
                </Button>
                <Button onClick={handleApproveAndSave} disabled={autoGenConfirming || autoGenSubmitting}>
                  {autoGenConfirming ? 'Saving...' : 'Approve & Save'}
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-4">
              <ul className="space-y-1 text-sm text-muted-foreground">
                <li>✓ Use your school timing settings</li>
                <li>✓ Distribute subjects across the week</li>
                <li>✓ Check for teacher conflicts</li>
                <li>✓ Replace existing timetable for this class</li>
              </ul>
              <p className="rounded-md border border-yellow-200 bg-yellow-50 px-3 py-2 text-sm text-yellow-800 dark:border-yellow-900 dark:bg-yellow-950 dark:text-yellow-400">
                Warning: This will clear existing slots for this class.
              </p>
              {autoGenError && (
                <p className="text-sm text-destructive" role="alert">
                  {autoGenError}
                </p>
              )}
              <DialogFooter>
                <Button variant="outline" onClick={() => setAutoGenDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleAutoGenerate} disabled={autoGenSubmitting}>
                  {autoGenSubmitting ? 'Generating...' : 'Generate Timetable'}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

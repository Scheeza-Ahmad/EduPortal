'use client';

import { FormEvent, useEffect, useState } from 'react';
import { AxiosError } from 'axios';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
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

interface SubjectOption {
  id: string;
  name: string;
  classId: string;
  class?: { name: string; section: string };
}

interface Teacher {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
  teachingSubjects: { id: string; name: string; classId: string }[];
}

interface TeacherForm {
  name: string;
  email: string;
  password: string;
  subjectIds: string[];
}

const EMPTY_FORM: TeacherForm = { name: '', email: '', password: '', subjectIds: [] };

export default function TeachersPage() {
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [subjects, setSubjects] = useState<SubjectOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTeacher, setEditingTeacher] = useState<Teacher | null>(null);
  const [form, setForm] = useState<TeacherForm>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  async function loadSubjects() {
    try {
      const res = await api.get<{ success: boolean; data: { subjects: SubjectOption[] } }>(
        '/api/admin/subjects'
      );
      setSubjects(res.data.data.subjects);
    } catch {
      // Non-fatal — the subject checklist will just be empty.
    }
  }

  async function loadTeachers() {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<{ success: boolean; data: { teachers: Teacher[] } }>(
        '/api/admin/teachers'
      );
      setTeachers(res.data.data.teachers);
    } catch {
      setError('Failed to load teachers.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSubjects();
    loadTeachers();
  }, []);

  function openAddDialog() {
    setEditingTeacher(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setDialogOpen(true);
  }

  function openEditDialog(teacher: Teacher) {
    setEditingTeacher(teacher);
    setForm({
      name: teacher.name,
      email: teacher.email,
      password: '',
      subjectIds: teacher.teachingSubjects.map((s) => s.id),
    });
    setFormError(null);
    setDialogOpen(true);
  }

  function toggleSubject(subjectId: string, checked: boolean) {
    setForm((f) => ({
      ...f,
      subjectIds: checked
        ? [...f.subjectIds, subjectId]
        : f.subjectIds.filter((id) => id !== subjectId),
    }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);

    try {
      if (editingTeacher) {
        await api.patch(`/api/admin/teachers/${editingTeacher.id}`, {
          name: form.name,
          email: form.email,
          subjectIds: form.subjectIds,
        });
      } else {
        await api.post('/api/admin/teachers', {
          name: form.name,
          email: form.email,
          password: form.password,
          subjectIds: form.subjectIds,
        });
      }
      setDialogOpen(false);
      await Promise.all([loadTeachers(), loadSubjects()]);
    } catch (err) {
      const axiosErr = err as AxiosError<{ error?: string }>;
      setFormError(axiosErr.response?.data?.error ?? 'Failed to save teacher.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeactivate(teacher: Teacher) {
    setTogglingId(teacher.id);
    try {
      await api.delete(`/api/admin/teachers/${teacher.id}`);
      await loadTeachers();
    } catch {
      setError('Failed to update teacher status.');
    } finally {
      setTogglingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Teachers</h1>
        <Button onClick={openAddDialog}>Add Teacher</Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">All Teachers</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading teachers...</p>
          ) : error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Subjects</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {teachers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground">
                      No teachers yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  teachers.map((teacher) => (
                    <TableRow key={teacher.id}>
                      <TableCell className="font-medium">{teacher.name}</TableCell>
                      <TableCell className="text-muted-foreground">{teacher.email}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {teacher.teachingSubjects.length === 0 ? (
                            <span className="text-xs text-muted-foreground">None</span>
                          ) : (
                            teacher.teachingSubjects.map((s) => (
                              <Badge key={s.id} variant="outline" className="text-xs">
                                {s.name}
                              </Badge>
                            ))
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={teacher.isActive ? 'default' : 'secondary'}>
                          {teacher.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right space-x-2">
                        <Button variant="outline" size="sm" onClick={() => openEditDialog(teacher)}>
                          Edit
                        </Button>
                        {teacher.isActive && (
                          <Button
                            variant="destructive"
                            size="sm"
                            disabled={togglingId === teacher.id}
                            onClick={() => handleDeactivate(teacher)}
                          >
                            {togglingId === teacher.id ? '...' : 'Deactivate'}
                          </Button>
                        )}
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
            <DialogTitle>{editingTeacher ? 'Edit Teacher' : 'Add Teacher'}</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="teacher-name">Name</Label>
              <Input
                id="teacher-name"
                required
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="teacher-email">Email</Label>
              <Input
                id="teacher-email"
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              />
            </div>

            {!editingTeacher && (
              <div className="space-y-2">
                <Label htmlFor="teacher-password">Password</Label>
                <Input
                  id="teacher-password"
                  type="password"
                  required
                  minLength={8}
                  value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                />
              </div>
            )}

            <div className="space-y-2">
              <Label>Assigned Subjects</Label>
              {editingTeacher && (
                <p className="text-xs text-muted-foreground">
                  Unchecking a subject here won&apos;t remove it — a subject always needs a
                  teacher, so reassign it to someone else instead.
                </p>
              )}
              <div className="max-h-40 space-y-2 overflow-y-auto rounded-md border p-3">
                {subjects.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No subjects yet — create one on the Subjects page first.
                  </p>
                ) : (
                  subjects.map((subject) => (
                    <div key={subject.id} className="flex items-center gap-2">
                      <Checkbox
                        id={`subject-${subject.id}`}
                        checked={form.subjectIds.includes(subject.id)}
                        onCheckedChange={(checked) =>
                          toggleSubject(subject.id, checked === true)
                        }
                      />
                      <Label htmlFor={`subject-${subject.id}`} className="font-normal">
                        {subject.name}
                        {subject.class ? ` (${subject.class.name} ${subject.class.section})` : ''}
                      </Label>
                    </div>
                  ))
                )}
              </div>
            </div>

            {formError && (
              <p className="text-sm text-destructive" role="alert">
                {formError}
              </p>
            )}

            <DialogFooter>
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Saving...' : editingTeacher ? 'Save Changes' : 'Create Teacher'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

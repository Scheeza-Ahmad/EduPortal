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

interface ClassOption {
  id: string;
  number: number;
  section: string;
}

function classLabel(c: { number: number; section: string }): string {
  return `Class ${c.number} - ${c.section}`;
}

interface TeacherOption {
  id: string;
  name: string;
  email: string;
}

interface Subject {
  id: string;
  name: string;
  classId: string;
  teacherId: string;
  creditHours: number;
  isActive: boolean;
  class: ClassOption;
  teacher: TeacherOption;
}

interface SubjectForm {
  name: string;
  classId: string;
  teacherId: string;
  creditHours: string;
}

const EMPTY_FORM: SubjectForm = { name: '', classId: '', teacherId: '', creditHours: '' };

export default function SubjectsPage() {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [teachers, setTeachers] = useState<TeacherOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [classFilter, setClassFilter] = useState('all');

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSubject, setEditingSubject] = useState<Subject | null>(null);
  const [form, setForm] = useState<SubjectForm>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function loadOptions() {
    try {
      const [classesRes, teachersRes] = await Promise.all([
        api.get<{ success: boolean; data: { classes: ClassOption[] } }>('/api/admin/classes'),
        api.get<{ success: boolean; data: { teachers: TeacherOption[] } }>('/api/admin/teachers'),
      ]);
      setClasses(classesRes.data.data.classes);
      setTeachers(teachersRes.data.data.teachers);
    } catch {
      // Non-fatal — the dropdowns will just be empty.
    }
  }

  async function loadSubjects() {
    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    if (classFilter !== 'all') params.set('classId', classFilter);

    try {
      const res = await api.get<{ success: boolean; data: { subjects: Subject[] } }>(
        `/api/admin/subjects?${params.toString()}`
      );
      setSubjects(res.data.data.subjects);
    } catch {
      setError('Failed to load subjects.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadOptions();
  }, []);

  useEffect(() => {
    loadSubjects();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classFilter]);

  function openAddDialog() {
    setEditingSubject(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setDialogOpen(true);
  }

  function openEditDialog(subject: Subject) {
    setEditingSubject(subject);
    setForm({
      name: subject.name,
      classId: subject.classId,
      teacherId: subject.teacherId,
      creditHours: String(subject.creditHours),
    });
    setFormError(null);
    setDialogOpen(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);

    const payload = {
      name: form.name,
      classId: form.classId,
      teacherId: form.teacherId,
      creditHours: form.creditHours ? Number(form.creditHours) : undefined,
    };

    try {
      if (editingSubject) {
        await api.patch(`/api/admin/subjects/${editingSubject.id}`, payload);
      } else {
        await api.post('/api/admin/subjects', payload);
      }
      setDialogOpen(false);
      await Promise.all([loadSubjects(), loadOptions()]);
    } catch (err) {
      const axiosErr = err as AxiosError<{ error?: string }>;
      setFormError(axiosErr.response?.data?.error ?? 'Failed to save subject.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(subject: Subject) {
    setDeletingId(subject.id);
    try {
      await api.delete(`/api/admin/subjects/${subject.id}`);
      await loadSubjects();
    } catch {
      setError('Failed to delete subject.');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Subjects</h1>
        <Button onClick={openAddDialog}>Add Subject</Button>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">All Subjects</CardTitle>
          <Select value={classFilter} onValueChange={setClassFilter}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Filter by class" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All classes</SelectItem>
              {classes.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {classLabel(c)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading subjects...</p>
          ) : error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Class</TableHead>
                  <TableHead>Teacher</TableHead>
                  <TableHead>Credit Hours</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {subjects.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground">
                      No subjects yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  subjects.map((subject) => (
                    <TableRow key={subject.id}>
                      <TableCell className="font-medium">{subject.name}</TableCell>
                      <TableCell>{classLabel(subject.class)}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {subject.teacher.name}
                      </TableCell>
                      <TableCell>{subject.creditHours}</TableCell>
                      <TableCell>
                        <Badge variant={subject.isActive ? 'default' : 'secondary'}>
                          {subject.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right space-x-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openEditDialog(subject)}
                        >
                          Edit
                        </Button>
                        {subject.isActive && (
                          <Button
                            variant="destructive"
                            size="sm"
                            disabled={deletingId === subject.id}
                            onClick={() => handleDelete(subject)}
                          >
                            {deletingId === subject.id ? '...' : 'Delete'}
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
            <DialogTitle>{editingSubject ? 'Edit Subject' : 'Add Subject'}</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="subject-name">Name</Label>
              <Input
                id="subject-name"
                required
                placeholder="e.g. Mathematics"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Class</Label>
                <Select
                  value={form.classId}
                  onValueChange={(v) => setForm((f) => ({ ...f, classId: v }))}
                >
                  <SelectTrigger>
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
                <Label>Teacher</Label>
                <Select
                  value={form.teacherId}
                  onValueChange={(v) => setForm((f) => ({ ...f, teacherId: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a teacher" />
                  </SelectTrigger>
                  <SelectContent>
                    {teachers.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="subject-credit-hours">Credit Hours</Label>
              <Input
                id="subject-credit-hours"
                type="number"
                min={1}
                required
                value={form.creditHours}
                onChange={(e) => setForm((f) => ({ ...f, creditHours: e.target.value }))}
              />
            </div>

            {formError && (
              <p className="text-sm text-destructive" role="alert">
                {formError}
              </p>
            )}

            <DialogFooter>
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Saving...' : editingSubject ? 'Save Changes' : 'Create Subject'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

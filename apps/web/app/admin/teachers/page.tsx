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
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type Wing = 'junior' | 'senior' | 'both';

interface SubjectOption {
  id: string;
  name: string;
  classId: string;
  class?: { number: number; section: string };
}

interface Teacher {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
  role: string;
  teachingSubjects: { id: string; name: string; classId: string }[];
  teacherProfile: {
    wing: Wing;
    isClassTeacher: boolean;
    isCoordinator: boolean;
    coordinatorWing: 'junior' | 'senior' | null;
  } | null;
}

interface TeacherForm {
  name: string;
  email: string;
  password: string;
  wing: Wing | '';
  subjectIds: string[];
}

const EMPTY_FORM: TeacherForm = { name: '', email: '', password: '', wing: '', subjectIds: [] };

const WING_LABELS: Record<Wing, string> = {
  junior: 'Junior Wing (Class 1-5)',
  senior: 'Senior Wing (Class 6-10)',
  both: 'Both Wings',
};

export default function TeachersPage() {
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [subjects, setSubjects] = useState<SubjectOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<Wing>('junior');

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTeacher, setEditingTeacher] = useState<Teacher | null>(null);
  const [form, setForm] = useState<TeacherForm>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const [coordinatorTarget, setCoordinatorTarget] = useState<Teacher | null>(null);
  const [coordinatorWing, setCoordinatorWing] = useState<'junior' | 'senior' | ''>('');
  const [coordinatorError, setCoordinatorError] = useState<string | null>(null);
  const [coordinatorSubmitting, setCoordinatorSubmitting] = useState(false);
  const [removeCoordinatorTarget, setRemoveCoordinatorTarget] = useState<Teacher | null>(null);

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
      wing: teacher.teacherProfile?.wing ?? '',
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

    if (!editingTeacher && !form.wing) {
      setFormError('Please select a wing.');
      return;
    }

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
          wing: form.wing,
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

  function openCoordinatorDialog(teacher: Teacher) {
    setCoordinatorTarget(teacher);
    setCoordinatorWing('');
    setCoordinatorError(null);
  }

  async function handleAssignCoordinator(e: FormEvent) {
    e.preventDefault();
    if (!coordinatorTarget || !coordinatorWing) return;
    setCoordinatorError(null);
    setCoordinatorSubmitting(true);
    try {
      await api.patch(`/api/admin/teachers/${coordinatorTarget.id}/coordinator`, {
        isCoordinator: true,
        coordinatorWing,
      });
      setCoordinatorTarget(null);
      await loadTeachers();
    } catch (err) {
      const axiosErr = err as AxiosError<{ error?: string }>;
      setCoordinatorError(axiosErr.response?.data?.error ?? 'Failed to assign coordinator.');
    } finally {
      setCoordinatorSubmitting(false);
    }
  }

  async function handleRemoveCoordinator() {
    if (!removeCoordinatorTarget) return;
    setCoordinatorSubmitting(true);
    try {
      await api.patch(`/api/admin/teachers/${removeCoordinatorTarget.id}/coordinator`, {
        isCoordinator: false,
        coordinatorWing: null,
      });
      setRemoveCoordinatorTarget(null);
      await loadTeachers();
    } catch {
      setError('Failed to remove coordinator role.');
    } finally {
      setCoordinatorSubmitting(false);
    }
  }

  function teachersInWing(wing: Wing): Teacher[] {
    return teachers.filter((t) => t.teacherProfile?.wing === wing);
  }

  function renderTeacherTable(list: Teacher[]) {
    return (
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
          {list.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground">
                No teachers in this wing yet.
              </TableCell>
            </TableRow>
          ) : (
            list.map((teacher) => (
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
                  <div className="flex flex-wrap gap-1">
                    <Badge variant={teacher.isActive ? 'default' : 'secondary'}>
                      {teacher.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                    {teacher.teacherProfile?.isCoordinator && (
                      <Badge variant="outline" className="bg-indigo-100 text-indigo-800">
                        Coordinator ({teacher.teacherProfile.coordinatorWing})
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex flex-wrap justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={() => openEditDialog(teacher)}>
                      Edit
                    </Button>
                    {teacher.teacherProfile?.isCoordinator ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setRemoveCoordinatorTarget(teacher)}
                      >
                        Remove Coordinator
                      </Button>
                    ) : (
                      <Button variant="outline" size="sm" onClick={() => openCoordinatorDialog(teacher)}>
                        Make Coordinator
                      </Button>
                    )}
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
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Teachers</h1>
        <Button onClick={openAddDialog}>Add Teacher</Button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading teachers...</p>
      ) : error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : (
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as Wing)}>
          <TabsList>
            <TabsTrigger value="junior">Junior</TabsTrigger>
            <TabsTrigger value="senior">Senior</TabsTrigger>
            <TabsTrigger value="both">Both</TabsTrigger>
          </TabsList>
          <TabsContent value="junior" className="pt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Junior Wing Teachers</CardTitle>
              </CardHeader>
              <CardContent>{renderTeacherTable(teachersInWing('junior'))}</CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="senior" className="pt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Senior Wing Teachers</CardTitle>
              </CardHeader>
              <CardContent>{renderTeacherTable(teachersInWing('senior'))}</CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="both" className="pt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Both-Wing Teachers</CardTitle>
              </CardHeader>
              <CardContent>{renderTeacherTable(teachersInWing('both'))}</CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}

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
              <Label>Wing</Label>
              {editingTeacher ? (
                <p className="text-sm text-muted-foreground">
                  {form.wing ? WING_LABELS[form.wing] : '—'} (wing can&apos;t be changed after
                  creation)
                </p>
              ) : (
                <Select
                  value={form.wing}
                  onValueChange={(v) => setForm((f) => ({ ...f, wing: v as Wing }))}
                  required
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a wing" />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.entries(WING_LABELS) as [Wing, string][]).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

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
                        {subject.class
                          ? ` (Class ${subject.class.number}${subject.class.section})`
                          : ''}
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

      <Dialog open={Boolean(coordinatorTarget)} onOpenChange={(open) => !open && setCoordinatorTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign as Wing Coordinator</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAssignCoordinator} className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {coordinatorTarget?.name} will be given coordinator access for the selected wing.
            </p>
            <div className="space-y-2">
              <Label>Wing</Label>
              <Select value={coordinatorWing} onValueChange={(v) => setCoordinatorWing(v as 'junior' | 'senior')}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a wing" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="junior">Junior Wing (1-5)</SelectItem>
                  <SelectItem value="senior">Senior Wing (6-10)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {coordinatorError && (
              <p className="text-sm text-destructive" role="alert">
                {coordinatorError}
              </p>
            )}
            <DialogFooter>
              <Button type="submit" disabled={!coordinatorWing || coordinatorSubmitting}>
                {coordinatorSubmitting ? 'Assigning...' : 'Assign as Coordinator'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(removeCoordinatorTarget)}
        onOpenChange={(open) => !open && setRemoveCoordinatorTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove Coordinator Role</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {removeCoordinatorTarget?.name} will lose coordinator access and return to a regular teacher
            role. This can&apos;t be undone automatically — you&apos;ll need to reassign them if needed.
          </p>
          <DialogFooter>
            <Button variant="destructive" disabled={coordinatorSubmitting} onClick={handleRemoveCoordinator}>
              {coordinatorSubmitting ? 'Removing...' : 'Remove Coordinator'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

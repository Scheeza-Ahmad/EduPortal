'use client';

import { FormEvent, useEffect, useState } from 'react';
import { AxiosError } from 'axios';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
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
  name: string;
  section: string;
}

interface Student {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
  studentProfile: {
    id: string;
    classId: string;
    rollNo: string;
    dob: string | null;
    phone: string | null;
    address: string | null;
    class: ClassOption;
  } | null;
}

interface StudentForm {
  name: string;
  email: string;
  password: string;
  classId: string;
  rollNo: string;
  dob: string;
  phone: string;
  address: string;
}

const EMPTY_FORM: StudentForm = {
  name: '',
  email: '',
  password: '',
  classId: '',
  rollNo: '',
  dob: '',
  phone: '',
  address: '',
};

const PAGE_LIMIT = 20;

export default function StudentsPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [classFilter, setClassFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [form, setForm] = useState<StudentForm>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
  const [csvText, setCsvText] = useState('');
  const [bulkSubmitting, setBulkSubmitting] = useState(false);
  const [bulkResult, setBulkResult] = useState<{
    createdCount: number;
    errors: { row: number; email: string; error: string }[];
  } | null>(null);
  const [bulkError, setBulkError] = useState<string | null>(null);

  async function loadClasses() {
    try {
      const res = await api.get<{ success: boolean; data: { classes: ClassOption[] } }>(
        '/api/admin/classes'
      );
      setClasses(res.data.data.classes);
    } catch {
      // Non-fatal — the class filter/select will just be empty.
    }
  }

  async function loadStudents() {
    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('limit', String(PAGE_LIMIT));
    if (classFilter !== 'all') params.set('classId', classFilter);

    try {
      const res = await api.get<{
        success: boolean;
        data: { students: Student[]; totalPages: number };
      }>(`/api/admin/students?${params.toString()}`);
      setStudents(res.data.data.students);
      setTotalPages(res.data.data.totalPages || 1);
    } catch {
      setError('Failed to load students.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadClasses();
  }, []);

  useEffect(() => {
    loadStudents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, classFilter]);

  function openAddDialog() {
    setEditingStudent(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setDialogOpen(true);
  }

  function openEditDialog(student: Student) {
    setEditingStudent(student);
    setForm({
      name: student.name,
      email: student.email,
      password: '',
      classId: student.studentProfile?.classId ?? '',
      rollNo: student.studentProfile?.rollNo ?? '',
      dob: student.studentProfile?.dob ? student.studentProfile.dob.slice(0, 10) : '',
      phone: student.studentProfile?.phone ?? '',
      address: student.studentProfile?.address ?? '',
    });
    setFormError(null);
    setDialogOpen(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);

    try {
      if (editingStudent) {
        await api.patch(`/api/admin/students/${editingStudent.id}`, {
          name: form.name,
          email: form.email,
          classId: form.classId || undefined,
          rollNo: form.rollNo || undefined,
          dob: form.dob || undefined,
          phone: form.phone || undefined,
          address: form.address || undefined,
        });
      } else {
        await api.post('/api/admin/students', {
          name: form.name,
          email: form.email,
          password: form.password,
          classId: form.classId,
          rollNo: form.rollNo,
          dob: form.dob || undefined,
          phone: form.phone || undefined,
          address: form.address || undefined,
        });
      }
      setDialogOpen(false);
      await loadStudents();
    } catch (err) {
      const axiosErr = err as AxiosError<{ error?: string }>;
      setFormError(axiosErr.response?.data?.error ?? 'Failed to save student.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleToggleActive(student: Student) {
    setTogglingId(student.id);
    try {
      await api.delete(`/api/admin/students/${student.id}`);
      await loadStudents();
    } catch {
      setError('Failed to update student status.');
    } finally {
      setTogglingId(null);
    }
  }

  function openBulkDialog() {
    setCsvText('');
    setBulkResult(null);
    setBulkError(null);
    setBulkDialogOpen(true);
  }

  async function handleBulkImport(e: FormEvent) {
    e.preventDefault();
    setBulkError(null);
    setBulkSubmitting(true);

    try {
      const res = await api.post<{
        success: boolean;
        data: { createdCount: number; errors: { row: number; email: string; error: string }[] };
      }>('/api/admin/students/bulk-import', { csv: csvText });
      setBulkResult(res.data.data);
      await loadStudents();
    } catch (err) {
      const axiosErr = err as AxiosError<{ error?: string }>;
      setBulkError(axiosErr.response?.data?.error ?? 'Failed to import CSV.');
    } finally {
      setBulkSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Students</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={openBulkDialog}>
            Bulk Import
          </Button>
          <Button onClick={openAddDialog}>Add Student</Button>
        </div>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">All Students</CardTitle>
          <Select
            value={classFilter}
            onValueChange={(v) => {
              setClassFilter(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Filter by class" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All classes</SelectItem>
              {classes.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name} {c.section}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading students...</p>
          ) : error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Class</TableHead>
                    <TableHead>Roll No</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {students.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground">
                        No students yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    students.map((student) => (
                      <TableRow key={student.id}>
                        <TableCell className="font-medium">{student.name}</TableCell>
                        <TableCell className="text-muted-foreground">{student.email}</TableCell>
                        <TableCell>
                          {student.studentProfile
                            ? `${student.studentProfile.class.name} ${student.studentProfile.class.section}`
                            : '—'}
                        </TableCell>
                        <TableCell>{student.studentProfile?.rollNo ?? '—'}</TableCell>
                        <TableCell>
                          <Badge variant={student.isActive ? 'default' : 'secondary'}>
                            {student.isActive ? 'Active' : 'Inactive'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right space-x-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openEditDialog(student)}
                          >
                            Edit
                          </Button>
                          {student.isActive && (
                            <Button
                              variant="destructive"
                              size="sm"
                              disabled={togglingId === student.id}
                              onClick={() => handleToggleActive(student)}
                            >
                              {togglingId === student.id ? '...' : 'Deactivate'}
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>

              <div className="mt-4 flex items-center justify-between">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </Button>
                <span className="text-sm text-muted-foreground">
                  Page {page} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Next
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingStudent ? 'Edit Student' : 'Add Student'}</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="student-name">Name</Label>
                <Input
                  id="student-name"
                  required
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="student-email">Email</Label>
                <Input
                  id="student-email"
                  type="email"
                  required
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                />
              </div>
            </div>

            {!editingStudent && (
              <div className="space-y-2">
                <Label htmlFor="student-password">Password</Label>
                <Input
                  id="student-password"
                  type="password"
                  required
                  minLength={8}
                  value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                />
              </div>
            )}

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
                        {c.name} {c.section}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="student-rollno">Roll No</Label>
                <Input
                  id="student-rollno"
                  required
                  value={form.rollNo}
                  onChange={(e) => setForm((f) => ({ ...f, rollNo: e.target.value }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="student-dob">Date of Birth (optional)</Label>
                <Input
                  id="student-dob"
                  type="date"
                  value={form.dob}
                  onChange={(e) => setForm((f) => ({ ...f, dob: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="student-phone">Phone (optional)</Label>
                <Input
                  id="student-phone"
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="student-address">Address (optional)</Label>
              <Input
                id="student-address"
                value={form.address}
                onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
              />
            </div>

            {formError && (
              <p className="text-sm text-destructive" role="alert">
                {formError}
              </p>
            )}

            <DialogFooter>
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Saving...' : editingStudent ? 'Save Changes' : 'Create Student'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={bulkDialogOpen} onOpenChange={setBulkDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bulk Import Students</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleBulkImport} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="csv-text">
                CSV text (header row required: name,email,password,classId,rollNo,dob,phone,address)
              </Label>
              <Textarea
                id="csv-text"
                required
                rows={8}
                className="font-mono text-xs"
                placeholder={
                  'name,email,password,classId,rollNo\nAli Khan,ali@example.com,password123,clx123,101'
                }
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                classId must match an existing class id — see the Classes page.
              </p>
            </div>

            {bulkError && (
              <p className="text-sm text-destructive" role="alert">
                {bulkError}
              </p>
            )}

            {bulkResult && (
              <div className="rounded-md border p-3 text-sm">
                <p className="font-medium text-green-600">
                  {bulkResult.createdCount} student(s) created successfully.
                </p>
                {bulkResult.errors.length > 0 && (
                  <div className="mt-2 space-y-1">
                    <p className="font-medium text-destructive">
                      {bulkResult.errors.length} row(s) failed:
                    </p>
                    <ul className="list-disc pl-4 text-xs text-muted-foreground">
                      {bulkResult.errors.map((e, i) => (
                        <li key={i}>
                          Row {e.row} ({e.email || 'no email'}): {e.error}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            <DialogFooter>
              <Button type="submit" disabled={bulkSubmitting}>
                {bulkSubmitting ? 'Importing...' : 'Import'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

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

interface ClassItem {
  id: string;
  name: string;
  section: string;
  isActive: boolean;
  _count: { studentProfiles: number; subjects: number };
}

interface ClassForm {
  name: string;
  section: string;
}

const EMPTY_FORM: ClassForm = { name: '', section: '' };

export default function ClassesPage() {
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingClass, setEditingClass] = useState<ClassItem | null>(null);
  const [form, setForm] = useState<ClassForm>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function loadClasses() {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<{ success: boolean; data: { classes: ClassItem[] } }>(
        '/api/admin/classes'
      );
      setClasses(res.data.data.classes);
    } catch {
      setError('Failed to load classes.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadClasses();
  }, []);

  function openAddDialog() {
    setEditingClass(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setDialogOpen(true);
  }

  function openEditDialog(classItem: ClassItem) {
    setEditingClass(classItem);
    setForm({ name: classItem.name, section: classItem.section });
    setFormError(null);
    setDialogOpen(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);

    try {
      if (editingClass) {
        await api.patch(`/api/admin/classes/${editingClass.id}`, form);
      } else {
        await api.post('/api/admin/classes', form);
      }
      setDialogOpen(false);
      await loadClasses();
    } catch (err) {
      const axiosErr = err as AxiosError<{ error?: string }>;
      setFormError(axiosErr.response?.data?.error ?? 'Failed to save class.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(classItem: ClassItem) {
    setDeletingId(classItem.id);
    try {
      await api.delete(`/api/admin/classes/${classItem.id}`);
      await loadClasses();
    } catch {
      setError('Failed to delete class.');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Classes</h1>
        <Button onClick={openAddDialog}>Add Class</Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">All Classes</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading classes...</p>
          ) : error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Section</TableHead>
                  <TableHead>Students</TableHead>
                  <TableHead>Subjects</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {classes.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground">
                      No classes yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  classes.map((classItem) => (
                    <TableRow key={classItem.id}>
                      <TableCell className="font-medium">{classItem.name}</TableCell>
                      <TableCell>{classItem.section}</TableCell>
                      <TableCell>{classItem._count.studentProfiles}</TableCell>
                      <TableCell>{classItem._count.subjects}</TableCell>
                      <TableCell>
                        <Badge variant={classItem.isActive ? 'default' : 'secondary'}>
                          {classItem.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right space-x-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openEditDialog(classItem)}
                        >
                          Edit
                        </Button>
                        {classItem.isActive && (
                          <Button
                            variant="destructive"
                            size="sm"
                            disabled={deletingId === classItem.id}
                            onClick={() => handleDelete(classItem)}
                          >
                            {deletingId === classItem.id ? '...' : 'Delete'}
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
            <DialogTitle>{editingClass ? 'Edit Class' : 'Add Class'}</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="class-name">Name</Label>
              <Input
                id="class-name"
                required
                placeholder="e.g. Class 9"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="class-section">Section</Label>
              <Input
                id="class-section"
                required
                placeholder="e.g. A"
                value={form.section}
                onChange={(e) => setForm((f) => ({ ...f, section: e.target.value }))}
              />
            </div>

            {formError && (
              <p className="text-sm text-destructive" role="alert">
                {formError}
              </p>
            )}

            <DialogFooter>
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Saving...' : editingClass ? 'Save Changes' : 'Create Class'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

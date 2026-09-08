'use client';

import { FormEvent, useEffect, useState } from 'react';
import { AxiosError } from 'axios';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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

// Admin defines a class NUMBER's subjects once (no teacher picked here) —
// every section of that number shares the same subject list. Teachers get
// auto-assigned when the timetable is generated, based on availability.

interface ClassSubjectTemplate {
  id: string;
  classNumber: number;
  name: string;
  creditHours: number;
  isActive: boolean;
}

interface TemplateForm {
  name: string;
  creditHours: string;
}

const EMPTY_FORM: TemplateForm = { name: '', creditHours: '3' };

const JUNIOR_NUMBERS = [1, 2, 3, 4, 5];
const SENIOR_NUMBERS = [6, 7, 8, 9, 10];

function getErrorMessage(err: unknown, fallback: string): string {
  const axiosErr = err as AxiosError<{ error?: string }>;
  return axiosErr.response?.data?.error ?? fallback;
}

export default function SubjectsPage() {
  const [classNumber, setClassNumber] = useState<number>(1);
  const [templates, setTemplates] = useState<ClassSubjectTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<ClassSubjectTemplate | null>(null);
  const [form, setForm] = useState<TemplateForm>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function loadTemplates() {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<{ success: boolean; data: { templates: ClassSubjectTemplate[] } }>(
        `/api/admin/class-subjects?classNumber=${classNumber}`
      );
      setTemplates(res.data.data.templates);
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load subjects.'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTemplates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classNumber]);

  function openAddDialog() {
    setEditingTemplate(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setDialogOpen(true);
  }

  function openEditDialog(template: ClassSubjectTemplate) {
    setEditingTemplate(template);
    setForm({ name: template.name, creditHours: String(template.creditHours) });
    setFormError(null);
    setDialogOpen(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);

    try {
      if (editingTemplate) {
        await api.patch(`/api/admin/class-subjects/${editingTemplate.id}`, {
          name: form.name,
          creditHours: Number(form.creditHours),
        });
      } else {
        await api.post('/api/admin/class-subjects', {
          classNumber,
          name: form.name,
          creditHours: Number(form.creditHours),
        });
      }
      setDialogOpen(false);
      await loadTemplates();
    } catch (err) {
      setFormError(getErrorMessage(err, 'Failed to save subject.'));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(template: ClassSubjectTemplate) {
    setDeletingId(template.id);
    try {
      await api.delete(`/api/admin/class-subjects/${template.id}`);
      await loadTemplates();
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
          <CardTitle className="text-base">Class Subjects</CardTitle>
          <Select value={String(classNumber)} onValueChange={(v) => setClassNumber(Number(v))}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Select a class" />
            </SelectTrigger>
            <SelectContent>
              {JUNIOR_NUMBERS.map((n) => (
                <SelectItem key={n} value={String(n)}>
                  Class {n} (Junior)
                </SelectItem>
              ))}
              {SENIOR_NUMBERS.map((n) => (
                <SelectItem key={n} value={String(n)}>
                  Class {n} (Senior)
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          <p className="mb-3 text-xs text-muted-foreground">
            Subjects added here apply to every section of Class {classNumber} (A, B, C...). No
            teacher is picked here — teachers are auto-assigned when the timetable is generated,
            based on availability.
          </p>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading subjects...</p>
          ) : error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Periods / Week</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {templates.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-muted-foreground">
                      No subjects added for Class {classNumber} yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  templates.map((template) => (
                    <TableRow key={template.id}>
                      <TableCell className="font-medium">{template.name}</TableCell>
                      <TableCell>{template.creditHours}</TableCell>
                      <TableCell className="text-right space-x-2">
                        <Button variant="outline" size="sm" onClick={() => openEditDialog(template)}>
                          Edit
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          disabled={deletingId === template.id}
                          onClick={() => handleDelete(template)}
                        >
                          {deletingId === template.id ? '...' : 'Delete'}
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
            <DialogTitle>
              {editingTemplate ? 'Edit Subject' : `Add Subject to Class ${classNumber}`}
            </DialogTitle>
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

            <div className="space-y-2">
              <Label htmlFor="subject-credit-hours">Number of Periods per Week</Label>
              <Input
                id="subject-credit-hours"
                type="number"
                min={1}
                max={10}
                required
                value={form.creditHours}
                onChange={(e) => setForm((f) => ({ ...f, creditHours: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">
                How many periods this subject gets scheduled for each week — used when the timetable
                is auto-generated.
              </p>
            </div>

            {formError && (
              <p className="text-sm text-destructive" role="alert">
                {formError}
              </p>
            )}

            <DialogFooter>
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Saving...' : editingTemplate ? 'Save Changes' : 'Add Subject'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

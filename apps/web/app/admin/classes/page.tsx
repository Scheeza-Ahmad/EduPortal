'use client';

import { FormEvent, useEffect, useState } from 'react';
import { AxiosError } from 'axios';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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

interface ClassSection {
  id: string;
  number: number;
  section: string;
  wing: Wing;
  classTeacherId: string | null;
  isActive: boolean;
  _count: { studentProfiles: number; subjects: number };
}

interface TeacherOption {
  id: string;
  name: string;
  teacherProfile: { wing: Wing } | null;
}

interface SectionForm {
  number: string;
  section: 'A' | 'B' | 'C';
  classTeacherId: string;
}

const JUNIOR_NUMBERS = [1, 2, 3, 4, 5];
const SENIOR_NUMBERS = [6, 7, 8, 9, 10];
const SECTION_LETTERS = ['A', 'B', 'C'] as const;

export default function ClassesPage() {
  const [classes, setClasses] = useState<ClassSection[]>([]);
  const [teachers, setTeachers] = useState<TeacherOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [activeWing, setActiveWing] = useState<'junior' | 'senior'>('junior');

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSection, setEditingSection] = useState<ClassSection | null>(null);
  const [form, setForm] = useState<SectionForm>({ number: '', section: 'A', classTeacherId: '' });
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function loadClasses() {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<{ success: boolean; data: { classes: ClassSection[] } }>(
        '/api/admin/classes'
      );
      setClasses(res.data.data.classes);
    } catch {
      setError('Failed to load classes.');
    } finally {
      setLoading(false);
    }
  }

  async function loadTeachers() {
    try {
      const res = await api.get<{ success: boolean; data: { teachers: TeacherOption[] } }>(
        '/api/admin/teachers'
      );
      setTeachers(res.data.data.teachers);
    } catch {
      // Non-fatal — the class teacher dropdown will just be empty.
    }
  }

  useEffect(() => {
    loadClasses();
    loadTeachers();
  }, []);

  function teacherName(id: string | null): string {
    if (!id) return '—';
    return teachers.find((t) => t.id === id)?.name ?? '—';
  }

  function teachersForWing(wing: 'junior' | 'senior'): TeacherOption[] {
    return teachers.filter((t) => t.teacherProfile?.wing === wing || t.teacherProfile?.wing === 'both');
  }

  function sectionsFor(number: number): ClassSection[] {
    return classes
      .filter((c) => c.number === number && c.isActive)
      .sort((a, b) => a.section.localeCompare(b.section));
  }

  function openAddDialog(number: number) {
    setEditingSection(null);
    setForm({ number: String(number), section: 'A', classTeacherId: '' });
    setFormError(null);
    setDialogOpen(true);
  }

  function openEditDialog(section: ClassSection) {
    setEditingSection(section);
    setForm({
      number: String(section.number),
      section: section.section as 'A' | 'B' | 'C',
      classTeacherId: section.classTeacherId ?? '',
    });
    setFormError(null);
    setDialogOpen(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);

    try {
      if (editingSection) {
        // Section letter and class number don't change after creation —
        // only the class teacher can be updated here.
        await api.patch(`/api/admin/classes/${editingSection.id}`, {
          classTeacherId: form.classTeacherId || null,
        });
      } else {
        await api.post('/api/admin/classes', {
          number: Number(form.number),
          section: form.section,
          classTeacherId: form.classTeacherId || undefined,
        });
      }
      setDialogOpen(false);
      await loadClasses();
    } catch (err) {
      const axiosErr = err as AxiosError<{ error?: string }>;
      setFormError(axiosErr.response?.data?.error ?? 'Failed to save section.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(section: ClassSection) {
    setDeletingId(section.id);
    try {
      await api.delete(`/api/admin/classes/${section.id}`);
      await loadClasses();
    } catch {
      setError('Failed to delete section.');
    } finally {
      setDeletingId(null);
    }
  }

  function renderWingTab(wing: 'junior' | 'senior', numbers: number[]) {
    return (
      <div className="space-y-4">
        {numbers.map((number) => (
          <Card key={number}>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">Class {number}</CardTitle>
              <Button size="sm" onClick={() => openAddDialog(number)}>
                + Add Section
              </Button>
            </CardHeader>
            <CardContent>
              {sectionsFor(number).length === 0 ? (
                <p className="text-sm text-muted-foreground">No sections yet.</p>
              ) : (
                <div className="space-y-2">
                  {sectionsFor(number).map((section) => (
                    <div
                      key={section.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3"
                    >
                      <div className="flex flex-wrap items-center gap-3">
                        <Badge variant="outline">Section {section.section}</Badge>
                        <span className="text-sm text-muted-foreground">
                          Class Teacher: {teacherName(section.classTeacherId)}
                        </span>
                        <span className="text-sm text-muted-foreground">
                          {section._count.studentProfiles} students
                        </span>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openEditDialog(section)}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          disabled={deletingId === section.id}
                          onClick={() => handleDelete(section)}
                        >
                          {deletingId === section.id ? '...' : 'Delete'}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Classes</h1>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading classes...</p>
      ) : error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : (
        <Tabs value={activeWing} onValueChange={(v) => setActiveWing(v as 'junior' | 'senior')}>
          <TabsList>
            <TabsTrigger value="junior">Junior Wing (1-5)</TabsTrigger>
            <TabsTrigger value="senior">Senior Wing (6-10)</TabsTrigger>
          </TabsList>
          <TabsContent value="junior" className="pt-4">
            {renderWingTab('junior', JUNIOR_NUMBERS)}
          </TabsContent>
          <TabsContent value="senior" className="pt-4">
            {renderWingTab('senior', SENIOR_NUMBERS)}
          </TabsContent>
        </Tabs>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingSection ? 'Edit Section' : 'Add Section'}</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Class Number</Label>
                <Select
                  value={form.number}
                  onValueChange={(v) => setForm((f) => ({ ...f, number: v }))}
                  disabled={Boolean(editingSection)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Number" />
                  </SelectTrigger>
                  <SelectContent>
                    {(activeWing === 'junior' ? JUNIOR_NUMBERS : SENIOR_NUMBERS).map((n) => (
                      <SelectItem key={n} value={String(n)}>
                        {n}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Section</Label>
                <Select
                  value={form.section}
                  onValueChange={(v) => setForm((f) => ({ ...f, section: v as 'A' | 'B' | 'C' }))}
                  disabled={Boolean(editingSection)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SECTION_LETTERS.map((letter) => (
                      <SelectItem key={letter} value={letter}>
                        {letter}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Class Teacher (optional)</Label>
              <Select
                value={form.classTeacherId || 'none'}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, classTeacherId: v === 'none' ? '' : v }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a teacher" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {teachersForWing(activeWing).map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {teachersForWing(activeWing).length === 0 && (
                <p className="text-xs text-muted-foreground">
                  No teachers assigned to this wing yet.
                </p>
              )}
            </div>

            {formError && (
              <p className="text-sm text-destructive" role="alert">
                {formError}
              </p>
            )}

            <DialogFooter>
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Saving...' : editingSection ? 'Save Changes' : 'Create Section'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

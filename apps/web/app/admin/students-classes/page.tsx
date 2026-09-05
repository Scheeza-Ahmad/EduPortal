'use client';

import { FormEvent, useEffect, useState } from 'react';
import { AxiosError } from 'axios';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ErrorState } from '@/components/shared/ErrorState';

type Wing = 'junior' | 'senior' | 'both';

interface ClassSection {
  id: string;
  number: number;
  section: string;
  wing: Wing;
  classTeacherId: string | null;
  maxStudents: number;
  isActive: boolean;
  _count: { studentProfiles: number; subjects: number };
}

interface TeacherOption {
  id: string;
  name: string;
  teacherProfile: { wing: Wing } | null;
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
  } | null;
}

interface SectionForm {
  number: string;
  section: 'A' | 'B' | 'C';
  classTeacherId: string;
  maxStudents: string;
}

interface SubjectRow {
  name: string;
  teacherId: string;
  creditHours: string;
}

const JUNIOR_SUBJECT_SUGGESTIONS = ['Urdu', 'English', 'Mathematics', 'Islamiat', 'General Knowledge'];
const SENIOR_SUBJECT_SUGGESTIONS = [
  'Urdu',
  'English',
  'Mathematics',
  'Physics',
  'Chemistry',
  'Biology',
  'Computer Science',
  'Islamiat',
];

function emptySubjectRows(wing: 'junior' | 'senior'): SubjectRow[] {
  const suggestions = wing === 'junior' ? JUNIOR_SUBJECT_SUGGESTIONS : SENIOR_SUBJECT_SUGGESTIONS;
  return suggestions.map((name) => ({ name, teacherId: '', creditHours: '3' }));
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
  parentName: string;
  parentEmail: string;
}

const EMPTY_STUDENT_FORM: StudentForm = {
  name: '',
  email: '',
  password: '',
  classId: '',
  rollNo: '',
  dob: '',
  phone: '',
  address: '',
  parentName: '',
  parentEmail: '',
};

const JUNIOR_NUMBERS = [1, 2, 3, 4, 5];
const SENIOR_NUMBERS = [6, 7, 8, 9, 10];
const SECTION_LETTERS = ['A', 'B', 'C'] as const;

function classLabel(c: { number: number; section: string }): string {
  return `Class ${c.number} - ${c.section}`;
}

function getErrorMessage(err: unknown, fallback: string): string {
  const axiosErr = err as AxiosError<{ error?: string }>;
  return axiosErr.response?.data?.error ?? fallback;
}

/** Capacity bar + FULL/Almost Full badge for one section card. */
function CapacityBadge({ filled, max }: { filled: number; max: number }) {
  const pct = max > 0 ? Math.min(100, Math.round((filled / max) * 100)) : 0;
  const isFull = filled >= max;
  const isAlmostFull = !isFull && filled >= max * 0.9;
  const barColor = isFull ? 'bg-red-500' : isAlmostFull ? 'bg-yellow-500' : 'bg-green-500';

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          👥 {filled} / {max} students
        </span>
        {isFull ? (
          <Badge variant="destructive" className="text-[10px]">
            FULL
          </Badge>
        ) : isAlmostFull ? (
          <Badge variant="outline" className="border-yellow-500 text-[10px] text-yellow-700">
            Almost Full
          </Badge>
        ) : null}
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div className={cn('h-full rounded-full transition-all', barColor)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function StudentsClassesPage() {
  const [classes, setClasses] = useState<ClassSection[]>([]);
  const [teachers, setTeachers] = useState<TeacherOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [activeWing, setActiveWing] = useState<'junior' | 'senior'>('junior');

  // Section create/edit dialog
  const [sectionDialogOpen, setSectionDialogOpen] = useState(false);
  const [editingSection, setEditingSection] = useState<ClassSection | null>(null);
  const [sectionForm, setSectionForm] = useState<SectionForm>({
    number: '',
    section: 'A',
    classTeacherId: '',
    maxStudents: '30',
  });
  const [sectionFormError, setSectionFormError] = useState<string | null>(null);
  const [sectionSubmitting, setSectionSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Add-section wizard (3 steps) — editing an existing section stays a
  // single simple form, only creation goes through the wizard.
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3>(1);
  const [subjectRows, setSubjectRows] = useState<SubjectRow[]>([]);

  // Inline student roster per expanded section
  const [expandedSectionId, setExpandedSectionId] = useState<string | null>(null);
  const [studentsBySection, setStudentsBySection] = useState<Record<string, Student[]>>({});
  const [studentsLoading, setStudentsLoading] = useState<string | null>(null);
  const [studentsError, setStudentsError] = useState<Record<string, string>>({});

  // Student create/edit dialog
  const [studentDialogOpen, setStudentDialogOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [studentForm, setStudentForm] = useState<StudentForm>(EMPTY_STUDENT_FORM);
  const [studentFormError, setStudentFormError] = useState<string | null>(null);
  const [studentSubmitting, setStudentSubmitting] = useState(false);
  const [togglingStudentId, setTogglingStudentId] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Bulk import
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
  const [csvText, setCsvText] = useState('');
  const [bulkSubmitting, setBulkSubmitting] = useState(false);
  const [bulkResult, setBulkResult] = useState<{
    createdCount: number;
    errors: { row: number; email: string; error: string }[];
  } | null>(null);
  const [bulkError, setBulkError] = useState<string | null>(null);

  async function loadClasses() {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<{ success: boolean; data: { classes: ClassSection[] } }>(
        '/api/admin/classes'
      );
      setClasses(res.data.data.classes);
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load classes.'));
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

  async function loadStudentsForSection(classId: string) {
    setStudentsLoading(classId);
    setStudentsError((prev) => ({ ...prev, [classId]: '' }));
    try {
      const res = await api.get<{ success: boolean; data: { students: Student[] } }>(
        `/api/admin/students?classId=${classId}&limit=100`
      );
      setStudentsBySection((prev) => ({ ...prev, [classId]: res.data.data.students }));
    } catch (err) {
      setStudentsError((prev) => ({
        ...prev,
        [classId]: getErrorMessage(err, 'Failed to load students for this section.'),
      }));
    } finally {
      setStudentsLoading(null);
    }
  }

  function toggleSection(classId: string) {
    if (expandedSectionId === classId) {
      setExpandedSectionId(null);
      return;
    }
    setExpandedSectionId(classId);
    if (!studentsBySection[classId]) {
      loadStudentsForSection(classId);
    }
  }

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

  // ---- Section dialog ----

  function openAddSectionDialog(number: number) {
    setEditingSection(null);
    setSectionForm({ number: String(number), section: 'A', classTeacherId: '', maxStudents: '30' });
    setSectionFormError(null);
    setWizardStep(1);
    setSubjectRows(emptySubjectRows(activeWing));
    setSectionDialogOpen(true);
  }

  function openEditSectionDialog(section: ClassSection) {
    setEditingSection(section);
    setSectionForm({
      number: String(section.number),
      section: section.section as 'A' | 'B' | 'C',
      classTeacherId: section.classTeacherId ?? '',
      maxStudents: String(section.maxStudents),
    });
    setSectionFormError(null);
    setSectionDialogOpen(true);
  }

  async function handleSectionSubmit(e: FormEvent) {
    e.preventDefault();
    setSectionFormError(null);
    setSectionSubmitting(true);

    try {
      if (editingSection) {
        await api.patch(`/api/admin/classes/${editingSection.id}`, {
          classTeacherId: sectionForm.classTeacherId || null,
          maxStudents: Number(sectionForm.maxStudents),
        });
      } else {
        const usableSubjects = subjectRows.filter((r) => r.name.trim() && r.teacherId);
        await api.post('/api/admin/classes/section', {
          number: Number(sectionForm.number),
          section: sectionForm.section,
          classTeacherId: sectionForm.classTeacherId || undefined,
          maxStudents: Number(sectionForm.maxStudents) || 30,
          subjects: usableSubjects.map((r) => ({
            name: r.name.trim(),
            teacherId: r.teacherId,
            creditHours: Number(r.creditHours) || 1,
          })),
        });
      }
      setSectionDialogOpen(false);
      await loadClasses();
    } catch (err) {
      setSectionFormError(getErrorMessage(err, 'Failed to save section.'));
    } finally {
      setSectionSubmitting(false);
    }
  }

  function addSubjectRow() {
    setSubjectRows((rows) => [...rows, { name: '', teacherId: '', creditHours: '3' }]);
  }

  function updateSubjectRow(index: number, patch: Partial<SubjectRow>) {
    setSubjectRows((rows) => rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  function removeSubjectRow(index: number) {
    setSubjectRows((rows) => rows.filter((_, i) => i !== index));
  }

  async function handleDeleteSection(section: ClassSection) {
    setDeletingId(section.id);
    try {
      await api.delete(`/api/admin/classes/${section.id}`);
      await loadClasses();
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to delete section.'));
    } finally {
      setDeletingId(null);
    }
  }

  // ---- Student dialog ----

  function openAddStudentDialog(classId: string) {
    setEditingStudent(null);
    setStudentForm({ ...EMPTY_STUDENT_FORM, classId });
    setStudentFormError(null);
    setSuccessMsg(null);
    setStudentDialogOpen(true);
  }

  function openEditStudentDialog(student: Student) {
    setEditingStudent(student);
    setStudentForm({
      name: student.name,
      email: student.email,
      password: '',
      classId: student.studentProfile?.classId ?? '',
      rollNo: student.studentProfile?.rollNo ?? '',
      dob: student.studentProfile?.dob ? student.studentProfile.dob.slice(0, 10) : '',
      phone: student.studentProfile?.phone ?? '',
      address: student.studentProfile?.address ?? '',
      parentName: '',
      parentEmail: '',
    });
    setStudentFormError(null);
    setStudentDialogOpen(true);
  }

  async function refreshAfterStudentChange(classId: string) {
    await loadClasses();
    if (studentsBySection[classId]) {
      await loadStudentsForSection(classId);
    }
  }

  async function handleStudentSubmit(e: FormEvent) {
    e.preventDefault();
    setStudentFormError(null);
    setStudentSubmitting(true);

    try {
      if (editingStudent) {
        await api.patch(`/api/admin/students/${editingStudent.id}`, {
          name: studentForm.name,
          email: studentForm.email,
          classId: studentForm.classId || undefined,
          rollNo: studentForm.rollNo || undefined,
          dob: studentForm.dob || undefined,
          phone: studentForm.phone || undefined,
          address: studentForm.address || undefined,
        });
      } else {
        const res = await api.post<{
          success: boolean;
          data: { parentAutoCreated: boolean; parentEmail?: string };
        }>('/api/admin/students', {
          name: studentForm.name,
          email: studentForm.email,
          password: studentForm.password,
          classId: studentForm.classId,
          rollNo: studentForm.rollNo,
          dob: studentForm.dob || undefined,
          phone: studentForm.phone || undefined,
          address: studentForm.address || undefined,
          parentName: studentForm.parentName || undefined,
          parentEmail: studentForm.parentEmail || undefined,
        });
        if (res.data.data.parentAutoCreated) {
          setSuccessMsg(
            `Student created — a new parent account was auto-created for ${res.data.data.parentEmail} and emailed their login details.`
          );
        } else if (studentForm.parentEmail) {
          setSuccessMsg('Student created and linked to the existing parent account.');
        }
      }
      setStudentDialogOpen(false);
      await refreshAfterStudentChange(studentForm.classId);
    } catch (err) {
      setStudentFormError(getErrorMessage(err, 'Failed to save student.'));
    } finally {
      setStudentSubmitting(false);
    }
  }

  async function handleToggleStudentActive(student: Student) {
    setTogglingStudentId(student.id);
    try {
      await api.delete(`/api/admin/students/${student.id}`);
      if (student.studentProfile) {
        await refreshAfterStudentChange(student.studentProfile.classId);
      }
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to update student status.'));
    } finally {
      setTogglingStudentId(null);
    }
  }

  // ---- Bulk import ----

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
      await loadClasses();
      if (expandedSectionId) await loadStudentsForSection(expandedSectionId);
    } catch (err) {
      setBulkError(getErrorMessage(err, 'Failed to import CSV.'));
    } finally {
      setBulkSubmitting(false);
    }
  }

  function renderWingTab(wing: 'junior' | 'senior', numbers: number[]) {
    return (
      <div className="space-y-4">
        {numbers.map((number) => (
          <Card key={number}>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">Class {number}</CardTitle>
              <Button size="sm" onClick={() => openAddSectionDialog(number)}>
                + Add Section
              </Button>
            </CardHeader>
            <CardContent>
              {sectionsFor(number).length === 0 ? (
                <p className="text-sm text-muted-foreground">No sections yet.</p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {sectionsFor(number).map((section) => {
                    const filled = section._count.studentProfiles;
                    const isFull = filled >= section.maxStudents;
                    const isExpanded = expandedSectionId === section.id;

                    return (
                      <div key={section.id} className="space-y-3 rounded-md border p-3">
                        <div className="flex items-center justify-between">
                          <Badge variant="outline">Section {section.section}</Badge>
                          <span className="text-xs text-muted-foreground">
                            {section._count.subjects} subjects
                          </span>
                        </div>

                        <p className="text-xs text-muted-foreground">
                          Class Teacher: <span className="text-foreground">{teacherName(section.classTeacherId)}</span>
                        </p>

                        <CapacityBadge filled={filled} max={section.maxStudents} />

                        <div className="flex flex-wrap gap-2">
                          <Button variant="outline" size="sm" onClick={() => toggleSection(section.id)}>
                            {isExpanded ? 'Hide Students' : 'View Students'}
                          </Button>
                          <span title={isFull ? `Section full (${filled}/${section.maxStudents})` : undefined}>
                            <Button
                              size="sm"
                              disabled={isFull}
                              onClick={() => openAddStudentDialog(section.id)}
                            >
                              + Add Student
                            </Button>
                          </span>
                          <Button variant="outline" size="sm" onClick={() => openEditSectionDialog(section)}>
                            Edit
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            disabled={deletingId === section.id}
                            onClick={() => handleDeleteSection(section)}
                          >
                            {deletingId === section.id ? '...' : 'Delete'}
                          </Button>
                        </div>

                        {isExpanded && (
                          <div className="rounded-md border bg-muted/30 p-2">
                            {studentsLoading === section.id ? (
                              <p className="p-2 text-xs text-muted-foreground">Loading students...</p>
                            ) : studentsError[section.id] ? (
                              <div className="space-y-2 p-2">
                                <p className="text-xs text-destructive">{studentsError[section.id]}</p>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => loadStudentsForSection(section.id)}
                                >
                                  Retry
                                </Button>
                              </div>
                            ) : (studentsBySection[section.id]?.length ?? 0) === 0 ? (
                              <p className="p-2 text-xs text-muted-foreground">No students in this section yet.</p>
                            ) : (
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead className="h-8 text-xs">Roll No</TableHead>
                                    <TableHead className="h-8 text-xs">Name</TableHead>
                                    <TableHead className="h-8 text-xs">Status</TableHead>
                                    <TableHead className="h-8 text-right text-xs">Actions</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {studentsBySection[section.id]!.map((student) => (
                                    <TableRow key={student.id}>
                                      <TableCell className="py-1.5 text-xs">
                                        {student.studentProfile?.rollNo ?? '—'}
                                      </TableCell>
                                      <TableCell className="py-1.5 text-xs">{student.name}</TableCell>
                                      <TableCell className="py-1.5 text-xs">
                                        <Badge
                                          variant={student.isActive ? 'default' : 'secondary'}
                                          className="text-[10px]"
                                        >
                                          {student.isActive ? 'Active' : 'Inactive'}
                                        </Badge>
                                      </TableCell>
                                      <TableCell className="py-1.5 text-right text-xs">
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          className="h-6 px-2 text-xs"
                                          onClick={() => openEditStudentDialog(student)}
                                        >
                                          Edit
                                        </Button>{' '}
                                        {student.isActive && (
                                          <Button
                                            variant="destructive"
                                            size="sm"
                                            className="h-6 px-2 text-xs"
                                            disabled={togglingStudentId === student.id}
                                            onClick={() => handleToggleStudentActive(student)}
                                          >
                                            {togglingStudentId === student.id ? '...' : 'Deactivate'}
                                          </Button>
                                        )}
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
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
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Students & Classes</h1>
        <Button variant="outline" onClick={openBulkDialog}>
          Bulk Import Students
        </Button>
      </div>

      {successMsg && (
        <div className="rounded-md border border-green-300 bg-green-50 px-4 py-2 text-sm text-green-800">
          {successMsg}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading classes...</p>
      ) : error ? (
        <ErrorState message={error} onRetry={loadClasses} />
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

      {/* Edit Section — unchanged simple single-step form */}
      {editingSection && (
        <Dialog open={sectionDialogOpen} onOpenChange={setSectionDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Section</DialogTitle>
            </DialogHeader>

            <form onSubmit={handleSectionSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Class Number</Label>
                  <Select value={sectionForm.number} disabled>
                    <SelectTrigger>
                      <SelectValue placeholder="Number" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={sectionForm.number}>{sectionForm.number}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Section</Label>
                  <Select value={sectionForm.section} disabled>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={sectionForm.section}>{sectionForm.section}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Class Teacher (optional)</Label>
                <Select
                  value={sectionForm.classTeacherId || 'none'}
                  onValueChange={(v) =>
                    setSectionForm((f) => ({ ...f, classTeacherId: v === 'none' ? '' : v }))
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
                  <p className="text-xs text-muted-foreground">No teachers assigned to this wing yet.</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="max-students">Maximum students allowed in this section</Label>
                <Input
                  id="max-students"
                  type="number"
                  min={editingSection._count.studentProfiles}
                  max={60}
                  required
                  value={sectionForm.maxStudents}
                  onChange={(e) => setSectionForm((f) => ({ ...f, maxStudents: e.target.value }))}
                />
                <p className="text-xs text-muted-foreground">
                  Current enrollment: {editingSection._count.studentProfiles} students. Cannot go below
                  this number.
                </p>
              </div>

              {sectionFormError && (
                <p className="text-sm text-destructive" role="alert">
                  {sectionFormError}
                </p>
              )}

              <DialogFooter>
                <Button type="submit" disabled={sectionSubmitting}>
                  {sectionSubmitting ? 'Saving...' : 'Save Changes'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}

      {/* Add Section — 3-step wizard: Basic Info -> Subjects -> Review */}
      {!editingSection && (
        <Dialog open={sectionDialogOpen} onOpenChange={setSectionDialogOpen}>
          <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                Add Section — Step {wizardStep} of 3:{' '}
                {wizardStep === 1 ? 'Basic Info' : wizardStep === 2 ? 'Subjects' : 'Review & Create'}
              </DialogTitle>
            </DialogHeader>

            {wizardStep === 1 && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Class Number</Label>
                    <Select
                      value={sectionForm.number}
                      onValueChange={(v) => setSectionForm((f) => ({ ...f, number: v }))}
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
                      value={sectionForm.section}
                      onValueChange={(v) => setSectionForm((f) => ({ ...f, section: v as 'A' | 'B' | 'C' }))}
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
                    value={sectionForm.classTeacherId || 'none'}
                    onValueChange={(v) =>
                      setSectionForm((f) => ({ ...f, classTeacherId: v === 'none' ? '' : v }))
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
                    <p className="text-xs text-muted-foreground">No teachers assigned to this wing yet.</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="new-max-students">Max Students</Label>
                  <Input
                    id="new-max-students"
                    type="number"
                    min={1}
                    max={60}
                    value={sectionForm.maxStudents}
                    onChange={(e) => setSectionForm((f) => ({ ...f, maxStudents: e.target.value }))}
                  />
                </div>

                <DialogFooter>
                  <Button type="button" onClick={() => setWizardStep(2)}>
                    Next →
                  </Button>
                </DialogFooter>
              </div>
            )}

            {wizardStep === 2 && (
              <div className="space-y-4">
                <div>
                  <p className="text-sm font-medium">
                    Add subjects for Class {sectionForm.number} - {sectionForm.section}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    These subjects will be created for this section. All sections of Class{' '}
                    {sectionForm.number} will share these subject names — you can assign different
                    teachers per section.
                  </p>
                </div>

                <div className="space-y-2">
                  {subjectRows.map((row, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Input
                        placeholder="Subject Name"
                        value={row.name}
                        onChange={(e) => updateSubjectRow(i, { name: e.target.value })}
                        className="flex-1"
                      />
                      <Select
                        value={row.teacherId || 'none'}
                        onValueChange={(v) => updateSubjectRow(i, { teacherId: v === 'none' ? '' : v })}
                      >
                        <SelectTrigger className="w-[160px] shrink-0">
                          <SelectValue placeholder="Teacher" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Select teacher</SelectItem>
                          {teachersForWing(activeWing).map((t) => (
                            <SelectItem key={t.id} value={t.id}>
                              {t.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        type="number"
                        min={1}
                        max={10}
                        value={row.creditHours}
                        onChange={(e) => updateSubjectRow(i, { creditHours: e.target.value })}
                        className="w-16 shrink-0"
                        title="Credit hours"
                      />
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        onClick={() => removeSubjectRow(i)}
                      >
                        Remove
                      </Button>
                    </div>
                  ))}
                </div>

                <Button type="button" variant="outline" size="sm" onClick={addSubjectRow}>
                  + Add Subject
                </Button>

                <DialogFooter className="gap-2">
                  <Button type="button" variant="outline" onClick={() => setWizardStep(1)}>
                    ← Back
                  </Button>
                  <Button type="button" onClick={() => setWizardStep(3)}>
                    Next →
                  </Button>
                </DialogFooter>
              </div>
            )}

            {wizardStep === 3 && (
              <form onSubmit={handleSectionSubmit} className="space-y-4">
                <div className="space-y-2 rounded-md border p-3 text-sm">
                  <p>
                    <span className="text-muted-foreground">Section: </span>
                    Class {sectionForm.number} - {sectionForm.section}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Class Teacher: </span>
                    {sectionForm.classTeacherId ? teacherName(sectionForm.classTeacherId) : 'None'}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Max Students: </span>
                    {sectionForm.maxStudents || 30}
                  </p>
                  <div>
                    <span className="text-muted-foreground">Subjects: </span>
                    {subjectRows.filter((r) => r.name.trim() && r.teacherId).length === 0 ? (
                      <span>None</span>
                    ) : (
                      <span>
                        {subjectRows
                          .filter((r) => r.name.trim() && r.teacherId)
                          .map((r) => `${r.name} (${teacherName(r.teacherId)})`)
                          .join(', ')}
                      </span>
                    )}
                  </div>
                </div>

                {sectionFormError && (
                  <p className="text-sm text-destructive" role="alert">
                    {sectionFormError}
                  </p>
                )}

                <DialogFooter className="gap-2">
                  <Button type="button" variant="outline" onClick={() => setWizardStep(2)}>
                    ← Back
                  </Button>
                  <Button type="submit" disabled={sectionSubmitting}>
                    {sectionSubmitting ? 'Creating...' : 'Create Section & Subjects'}
                  </Button>
                </DialogFooter>
              </form>
            )}
          </DialogContent>
        </Dialog>
      )}

      {/* Add / Edit Student */}
      <Dialog open={studentDialogOpen} onOpenChange={setStudentDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingStudent ? 'Edit Student' : 'Add Student'}</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleStudentSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="student-name">Name</Label>
                <Input
                  id="student-name"
                  required
                  value={studentForm.name}
                  onChange={(e) => setStudentForm((f) => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="student-email">Email</Label>
                <Input
                  id="student-email"
                  type="email"
                  required
                  value={studentForm.email}
                  onChange={(e) => setStudentForm((f) => ({ ...f, email: e.target.value }))}
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
                  value={studentForm.password}
                  onChange={(e) => setStudentForm((f) => ({ ...f, password: e.target.value }))}
                />
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Class</Label>
                <Select
                  value={studentForm.classId}
                  onValueChange={(v) => setStudentForm((f) => ({ ...f, classId: v }))}
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
                <Label htmlFor="student-rollno">Roll No</Label>
                <Input
                  id="student-rollno"
                  required
                  value={studentForm.rollNo}
                  onChange={(e) => setStudentForm((f) => ({ ...f, rollNo: e.target.value }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="student-dob">Date of Birth (optional)</Label>
                <Input
                  id="student-dob"
                  type="date"
                  value={studentForm.dob}
                  onChange={(e) => setStudentForm((f) => ({ ...f, dob: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="student-phone">Phone (optional)</Label>
                <Input
                  id="student-phone"
                  value={studentForm.phone}
                  onChange={(e) => setStudentForm((f) => ({ ...f, phone: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="student-address">Address (optional)</Label>
              <Input
                id="student-address"
                value={studentForm.address}
                onChange={(e) => setStudentForm((f) => ({ ...f, address: e.target.value }))}
              />
            </div>

            {!editingStudent && (
              <div className="space-y-2 rounded-md border border-dashed p-3">
                <p className="text-xs font-medium text-muted-foreground">
                  Parent account (optional) — leave blank to link one later
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="parent-name">Parent Name</Label>
                    <Input
                      id="parent-name"
                      value={studentForm.parentName}
                      onChange={(e) => setStudentForm((f) => ({ ...f, parentName: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="parent-email">Parent Email</Label>
                    <Input
                      id="parent-email"
                      type="email"
                      value={studentForm.parentEmail}
                      onChange={(e) => setStudentForm((f) => ({ ...f, parentEmail: e.target.value }))}
                    />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  If this email already belongs to a parent at this school, the student is linked to
                  that account (siblings share one login). Otherwise a new parent account is
                  auto-created and emailed their credentials.
                </p>
              </div>
            )}

            {studentFormError && (
              <p className="text-sm text-destructive" role="alert">
                {studentFormError}
              </p>
            )}

            <DialogFooter>
              <Button type="submit" disabled={studentSubmitting}>
                {studentSubmitting ? 'Saving...' : editingStudent ? 'Save Changes' : 'Create Student'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Bulk Import */}
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
                classId must match an existing section id shown above.
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

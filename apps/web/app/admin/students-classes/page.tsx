'use client';

import { FormEvent, useEffect, useState } from 'react';
import useSWR from 'swr';
import { AxiosError } from 'axios';
import { api, fetcher } from '@/lib/api';
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
  teachingSubjects: { id: string }[];
}

interface ClassSubjectTemplate {
  id: string;
  classNumber: number;
  name: string;
  creditHours: number;
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

const EMPTY_STUDENT_FORM: StudentForm = {
  name: '',
  email: '',
  password: '',
  classId: '',
  rollNo: '',
  dob: '',
  phone: '',
  address: '',
};

/** Random 4-digit suffix used when there's no roll number yet to derive a
 * password from (e.g. the name/roll fields haven't been filled in). */
function randomDigits(n: number): string {
  return String(Math.floor(Math.random() * 10 ** n)).padStart(n, '0');
}

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

/** Mirrors the backend's splitNameForEmail — used to build the client-side
 * preview before the actual import call. */
function splitNameForEmail(name: string): { first: string; slug: string } {
  const clean = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z\s]/g, '')
    .split(/\s+/)
    .filter(Boolean);
  const first = clean[0] ?? 'student';
  const last = clean.length > 1 ? clean[clean.length - 1] : '';
  return { first, slug: last ? `${first}.${last}` : first };
}

function trailingRollNumber(rollNo: string): number {
  const match = rollNo.match(/(\d+)$/);
  return match ? parseInt(match[1], 10) : 0;
}

function padRollNo(n: number): string {
  return String(n).padStart(3, '0');
}

interface BulkPreviewRow {
  name: string;
  email: string;
  password: string;
  rollNo: string;
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
  // Fix 3 — SWR for the two main list loads. `loadClasses` keeps its
  // original name and signature (it's called from ~10 places after
  // mutations elsewhere on this page) but now just triggers an SWR
  // revalidation instead of a manual setState, so the same data is
  // shared/cached instead of being re-fetched from scratch every time.
  const {
    data: classesData,
    error: classesError,
    isLoading: loading,
    mutate: mutateClasses,
  } = useSWR<{ classes: ClassSection[] }>('/api/admin/classes', fetcher);
  const { data: teachersData } = useSWR<{ teachers: TeacherOption[] }>('/api/admin/teachers', fetcher);
  const classes = classesData?.classes ?? [];
  const teachers = teachersData?.teachers ?? [];
  const error = classesError ? getErrorMessage(classesError, 'Failed to load classes.') : null;

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

  // Read-only preview of the class-number's subject templates, shown in the
  // Add Section form so admin knows what will be auto-created — subjects
  // themselves are managed on the Subjects page, not asked for here.
  const [sectionTemplatePreview, setSectionTemplatePreview] = useState<ClassSubjectTemplate[]>([]);

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
  // Surfaces a failed mutation (delete/deactivate) — separate from `error`
  // above, which is specifically the SWR-driven "classes failed to load" state.
  const [actionError, setActionError] = useState<string | null>(null);

  // Fix 6 — which auto-generated fields the admin has manually overridden;
  // an untouched field keeps re-deriving itself as name/roll no change.
  const [studentAutoTouched, setStudentAutoTouched] = useState({
    email: false,
    password: false,
  });

  // Bulk import — redesigned per Fix 5: a newline-separated name list per
  // section, previewed (auto roll numbers + emails + passwords) before import.
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
  const [bulkClassId, setBulkClassId] = useState('');
  const [bulkNamesText, setBulkNamesText] = useState('');
  const [bulkPreview, setBulkPreview] = useState<BulkPreviewRow[] | null>(null);
  const [bulkPreviewing, setBulkPreviewing] = useState(false);
  const [bulkSubmitting, setBulkSubmitting] = useState(false);
  const [bulkResult, setBulkResult] = useState<{
    created: { name: string; email: string; password: string; rollNo: string }[];
    failed: { name: string; error: string }[];
  } | null>(null);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [schoolDomain, setSchoolDomain] = useState('school');

  async function loadClasses() {
    await mutateClasses();
  }

  useEffect(() => {
    api
      .get<{ success: boolean; data: { schoolDomain?: string } }>('/api/admin/school-settings/branding')
      .then((res) => setSchoolDomain(res.data.data.schoolDomain || 'school'))
      .catch(() => {});
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

  async function loadSectionTemplatePreview(number: number) {
    try {
      const res = await api.get<{ success: boolean; data: { templates: ClassSubjectTemplate[] } }>(
        `/api/admin/class-subjects?classNumber=${number}`
      );
      setSectionTemplatePreview(res.data.data.templates);
    } catch {
      setSectionTemplatePreview([]);
    }
  }

  function openAddSectionDialog(number: number) {
    setEditingSection(null);
    setSectionForm({ number: String(number), section: 'A', classTeacherId: '', maxStudents: '30' });
    setSectionFormError(null);
    loadSectionTemplatePreview(number);
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
        await api.post('/api/admin/classes/section', {
          number: Number(sectionForm.number),
          section: sectionForm.section,
          classTeacherId: sectionForm.classTeacherId || undefined,
          maxStudents: Number(sectionForm.maxStudents) || 30,
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

  async function handleDeleteSection(section: ClassSection) {
    setDeletingId(section.id);
    try {
      await api.delete(`/api/admin/classes/${section.id}`);
      await loadClasses();
    } catch (err) {
      setActionError(getErrorMessage(err, 'Failed to delete section.'));
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
    setStudentAutoTouched({ email: false, password: false });
    setStudentDialogOpen(true);
  }

  /** Auto-fills the student's own email/password from their name as it's
   * typed, without clobbering anything the admin has already edited by hand. */
  useEffect(() => {
    if (editingStudent || !studentDialogOpen) return;
    const { slug } = splitNameForEmail(studentForm.name);
    if (!studentForm.name.trim()) return;

    setStudentForm((f) => {
      const next = { ...f };
      if (!studentAutoTouched.email) {
        next.email = `${slug}@${schoolDomain}.edu`;
      }
      if (!studentAutoTouched.password) {
        next.password = f.rollNo ? `Student@${f.rollNo}` : `Stu@${randomDigits(4)}`;
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentForm.name, studentForm.rollNo, editingStudent, studentDialogOpen, schoolDomain]);

  function copyToClipboard(text: string) {
    navigator.clipboard?.writeText(text).catch(() => {});
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
        await api.post('/api/admin/students', {
          name: studentForm.name,
          email: studentForm.email,
          password: studentForm.password,
          classId: studentForm.classId,
          rollNo: studentForm.rollNo,
          dob: studentForm.dob || undefined,
          phone: studentForm.phone || undefined,
          address: studentForm.address || undefined,
        });
        setSuccessMsg('Student created.');
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
      setActionError(getErrorMessage(err, 'Failed to update student status.'));
    } finally {
      setTogglingStudentId(null);
    }
  }

  // ---- Bulk import (Fix 5 — name list, not CSV) ----

  function openBulkDialog(classId?: string) {
    setBulkClassId(classId ?? '');
    setBulkNamesText('');
    setBulkPreview(null);
    setBulkResult(null);
    setBulkError(null);
    setBulkDialogOpen(true);
  }

  function parseBulkNames(): string[] {
    return bulkNamesText
      .split(/\r?\n/)
      .map((n) => n.trim())
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));
  }

  async function handleBulkPreview() {
    setBulkError(null);
    if (!bulkClassId) {
      setBulkError('Select a section first.');
      return;
    }
    const names = parseBulkNames();
    if (names.length === 0) {
      setBulkError('Enter at least one name.');
      return;
    }

    setBulkPreviewing(true);
    try {
      if (!studentsBySection[bulkClassId]) {
        await loadStudentsForSection(bulkClassId);
      }
      const existingRollNos = (studentsBySection[bulkClassId] ?? [])
        .map((s) => s.studentProfile?.rollNo)
        .filter((r): r is string => Boolean(r));
      let nextRollNo = Math.max(0, ...existingRollNos.map(trailingRollNumber)) + 1;

      const preview: BulkPreviewRow[] = names.map((name) => {
        const rollNo = padRollNo(nextRollNo);
        const { slug } = splitNameForEmail(name);
        nextRollNo += 1;
        return {
          name,
          email: `${slug}@${schoolDomain}.edu`,
          password: `Student@${rollNo}`,
          rollNo,
        };
      });
      setBulkPreview(preview);
    } finally {
      setBulkPreviewing(false);
    }
  }

  async function handleBulkImport(e: FormEvent) {
    e.preventDefault();
    setBulkError(null);
    setBulkSubmitting(true);

    try {
      const res = await api.post<{
        success: boolean;
        data: {
          created: { name: string; email: string; password: string; rollNo: string }[];
          failed: { name: string; error: string }[];
        };
      }>('/api/admin/students/bulk-import-names', {
        classId: bulkClassId,
        names: parseBulkNames(),
        schoolDomain,
      });
      setBulkResult(res.data.data);
      setBulkPreview(null);
      await loadClasses();
      if (expandedSectionId) await loadStudentsForSection(expandedSectionId);
    } catch (err) {
      setBulkError(getErrorMessage(err, 'Failed to import students.'));
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
        <Button variant="outline" onClick={() => openBulkDialog()}>
          Bulk Import Students
        </Button>
      </div>

      {successMsg && (
        <div className="rounded-md border border-green-300 bg-green-50 px-4 py-2 text-sm text-green-800">
          {successMsg}
        </div>
      )}

      {actionError && (
        <p className="text-sm text-destructive" role="alert">
          {actionError}
        </p>
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

      {/* Add Section — only max students + class teacher are asked here.
          Subjects come from that class number's template (Subjects page) and
          teachers are auto-assigned when the timetable is generated. */}
      {!editingSection && (
        <Dialog open={sectionDialogOpen} onOpenChange={setSectionDialogOpen}>
          <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Add Section</DialogTitle>
            </DialogHeader>

            <form onSubmit={handleSectionSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Class Number</Label>
                  <Select
                    value={sectionForm.number}
                    onValueChange={(v) => {
                      setSectionForm((f) => ({ ...f, number: v }));
                      loadSectionTemplatePreview(Number(v));
                    }}
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

              <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
                {sectionTemplatePreview.length === 0 ? (
                  <>
                    No subjects have been defined for Class {sectionForm.number} yet — add them on the{' '}
                    <span className="font-medium text-foreground">Subjects</span> page first.
                  </>
                ) : (
                  <>
                    This section will automatically get:{' '}
                    <span className="font-medium text-foreground">
                      {sectionTemplatePreview.map((t) => t.name).join(', ')}
                    </span>
                    . Teachers are auto-assigned when the timetable is generated.
                  </>
                )}
              </div>

              {sectionFormError && (
                <p className="text-sm text-destructive" role="alert">
                  {sectionFormError}
                </p>
              )}

              <DialogFooter>
                <Button type="submit" disabled={sectionSubmitting}>
                  {sectionSubmitting ? 'Creating...' : 'Create Section'}
                </Button>
              </DialogFooter>
            </form>
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
                <Label htmlFor="student-email">Email {!editingStudent && '(auto-generated, editable)'}</Label>
                <Input
                  id="student-email"
                  type="email"
                  required
                  value={studentForm.email}
                  onChange={(e) => {
                    setStudentForm((f) => ({ ...f, email: e.target.value }));
                    setStudentAutoTouched((t) => ({ ...t, email: true }));
                  }}
                />
              </div>
            </div>

            {!editingStudent && (
              <div className="space-y-2">
                <Label htmlFor="student-password">Password (auto-generated, editable)</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="student-password"
                    required
                    minLength={8}
                    value={studentForm.password}
                    onChange={(e) => {
                      setStudentForm((f) => ({ ...f, password: e.target.value }));
                      setStudentAutoTouched((t) => ({ ...t, password: true }));
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => copyToClipboard(studentForm.password)}
                  >
                    Copy
                  </Button>
                </div>
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

      {/* Bulk Import — Fix 5: newline-separated name list, previewed first */}
      <Dialog open={bulkDialogOpen} onOpenChange={setBulkDialogOpen}>
        <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Bulk Import Students</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleBulkImport} className="space-y-4">
            <div className="space-y-2">
              <Label>Section</Label>
              <Select value={bulkClassId} onValueChange={(v) => { setBulkClassId(v); setBulkPreview(null); }}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a section" />
                </SelectTrigger>
                <SelectContent>
                  {classes.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {classLabel(c)} ({c._count.studentProfiles}/{c.maxStudents})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="bulk-names">Student names (one per line)</Label>
              <Textarea
                id="bulk-names"
                rows={8}
                placeholder={'Ahmed Khan\nFatima Ali\nZainab Malik'}
                value={bulkNamesText}
                onChange={(e) => { setBulkNamesText(e.target.value); setBulkPreview(null); }}
              />
              <p className="text-xs text-muted-foreground">
                Names are sorted alphabetically and given roll numbers continuing from the last one
                already used in this section. Email is {'{firstname.lastname}'}@{schoolDomain}.edu and
                password is Student@{'{rollNo}'} — both editable after import.
              </p>
            </div>

            {bulkError && (
              <p className="text-sm text-destructive" role="alert">
                {bulkError}
              </p>
            )}

            {!bulkResult && (
              <Button type="button" variant="outline" onClick={handleBulkPreview} disabled={bulkPreviewing}>
                {bulkPreviewing ? 'Loading...' : 'Preview'}
              </Button>
            )}

            {bulkPreview && !bulkResult && (
              <div className="max-h-64 overflow-y-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="h-8 text-xs">Roll No</TableHead>
                      <TableHead className="h-8 text-xs">Name</TableHead>
                      <TableHead className="h-8 text-xs">Email</TableHead>
                      <TableHead className="h-8 text-xs">Password</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {bulkPreview.map((row) => (
                      <TableRow key={row.rollNo}>
                        <TableCell className="py-1 text-xs">{row.rollNo}</TableCell>
                        <TableCell className="py-1 text-xs">{row.name}</TableCell>
                        <TableCell className="py-1 text-xs">{row.email}</TableCell>
                        <TableCell className="py-1 text-xs">{row.password}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {bulkResult && (
              <div className="rounded-md border p-3 text-sm">
                <p className="font-medium text-green-600">
                  {bulkResult.created.length} student(s) created successfully.
                </p>
                {bulkResult.failed.length > 0 && (
                  <div className="mt-2 space-y-1">
                    <p className="font-medium text-destructive">
                      {bulkResult.failed.length} name(s) failed:
                    </p>
                    <ul className="list-disc pl-4 text-xs text-muted-foreground">
                      {bulkResult.failed.map((e, i) => (
                        <li key={i}>
                          {e.name}: {e.error}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            <DialogFooter>
              {bulkResult ? (
                <Button type="button" onClick={() => setBulkDialogOpen(false)}>
                  Close
                </Button>
              ) : (
                <Button type="submit" disabled={bulkSubmitting || !bulkPreview}>
                  {bulkSubmitting ? 'Importing...' : `Import ${bulkPreview?.length ?? ''} Student(s)`}
                </Button>
              )}
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

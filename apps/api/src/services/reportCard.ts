import { prisma } from '../utils/prisma';

export function calculateGrade(percentage: number): string {
  if (percentage >= 90) return 'A+';
  if (percentage >= 80) return 'A';
  if (percentage >= 70) return 'B+';
  if (percentage >= 60) return 'B';
  if (percentage >= 50) return 'C';
  return 'F';
}

export interface ReportCardData {
  student: {
    name: string;
    rollNo: string;
    class: number;
    section: string;
    photoUrl: string | null;
  };
  school: {
    name: string;
    address: string | null;
    principalName: string | null;
  };
  subjects: {
    subjectName: string;
    teacherName: string;
    activities: { title: string; type: string; marks: number; totalMarks: number }[];
    totalMarks: number;
    obtainedMarks: number;
    percentage: number;
    grade: string;
  }[];
  attendance: {
    totalDays: number;
    presentDays: number;
    percentage: number;
  };
  overallPercentage: number;
  overallGrade: string;
  generatedAt: string;
}

/** Shared by admin's report-card endpoints and the student's own grade-card
 * fetch, so both render from an identical structure in reportCardPdf.tsx. */
export async function buildReportCard(schoolId: string, studentUserId: string): Promise<ReportCardData | null> {
  const student = await prisma.user.findFirst({
    where: { id: studentUserId, schoolId, role: 'student' },
    include: { studentProfile: { include: { class: true } } },
  });
  if (!student || !student.studentProfile) return null;
  const profile = student.studentProfile;

  const [settings, school, grades, attendanceRecords] = await Promise.all([
    prisma.schoolSettings.findUnique({ where: { schoolId } }),
    prisma.school.findUnique({ where: { id: schoolId }, select: { name: true } }),
    prisma.grade.findMany({
      where: { studentId: profile.id },
      include: {
        submission: {
          include: {
            activity: {
              include: { subject: { select: { id: true, name: true, teacher: { select: { name: true } } } } },
            },
          },
        },
      },
    }),
    prisma.attendance.findMany({ where: { studentId: studentUserId } }),
  ]);

  const bySubject = new Map<
    string,
    { subjectName: string; teacherName: string; activities: ReportCardData['subjects'][number]['activities'] }
  >();
  for (const g of grades) {
    const subject = g.submission.activity.subject;
    const entry = bySubject.get(subject.id) ?? {
      subjectName: subject.name,
      teacherName: subject.teacher?.name ?? 'Not Assigned',
      activities: [],
    };
    entry.activities.push({
      title: g.submission.activity.title,
      type: g.submission.activity.type,
      marks: g.marks,
      totalMarks: g.submission.activity.totalMarks,
    });
    bySubject.set(subject.id, entry);
  }

  const subjects = Array.from(bySubject.values()).map((s) => {
    const totalMarks = s.activities.reduce((sum, a) => sum + a.totalMarks, 0);
    const obtainedMarks = s.activities.reduce((sum, a) => sum + a.marks, 0);
    const percentage = totalMarks > 0 ? Math.round((obtainedMarks / totalMarks) * 1000) / 10 : 0;
    return {
      subjectName: s.subjectName,
      teacherName: s.teacherName,
      activities: s.activities,
      totalMarks,
      obtainedMarks,
      percentage,
      grade: calculateGrade(percentage),
    };
  });

  const overallPercentage =
    subjects.length > 0
      ? Math.round((subjects.reduce((sum, s) => sum + s.percentage, 0) / subjects.length) * 10) / 10
      : 0;

  const totalDays = attendanceRecords.length;
  const presentDays = attendanceRecords.filter((a) => a.status === 'present').length;

  return {
    student: {
      name: student.name,
      rollNo: profile.rollNo,
      class: profile.class.number,
      section: profile.class.section,
      photoUrl: profile.photoUrl,
    },
    school: {
      name: school?.name ?? '',
      address: settings?.address ?? null,
      principalName: settings?.principalName ?? null,
    },
    subjects,
    attendance: {
      totalDays,
      presentDays,
      percentage: totalDays > 0 ? Math.round((presentDays / totalDays) * 1000) / 10 : 0,
    },
    overallPercentage,
    overallGrade: calculateGrade(overallPercentage),
    generatedAt: new Date().toISOString(),
  };
}

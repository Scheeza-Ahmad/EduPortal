import { prisma } from './prisma';

/**
 * Approving a student leave request auto-creates matching Attendance rows
 * for every subject in their class across the requested date range — a
 * full leave or half-day, once granted, shouldn't also need a separate
 * manual attendance mark for those days. Shared by both the teacher and
 * admin leave-review endpoints.
 */
export async function applyLeaveAttendance(leaveRequest: {
  id: string;
  requesterId: string;
  startDate: Date;
  endDate: Date;
  type: string;
}): Promise<void> {
  try {
    const requesterProfile = await prisma.studentProfile.findUnique({
      where: { userId: leaveRequest.requesterId },
      select: { classId: true },
    });
    if (!requesterProfile) return;

    const subjectsInClass = await prisma.subject.findMany({
      where: { classId: requesterProfile.classId, isActive: true },
      select: { id: true },
    });

    const attendanceStatus = leaveRequest.type === 'half_day' ? 'half_day' : 'leave';

    const dates: Date[] = [];
    const cursor = new Date(leaveRequest.startDate);
    cursor.setHours(0, 0, 0, 0);
    const end = new Date(leaveRequest.endDate);
    end.setHours(0, 0, 0, 0);
    while (cursor <= end) {
      dates.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }

    for (const subj of subjectsInClass) {
      for (const d of dates) {
        await prisma.attendance.upsert({
          where: {
            studentId_subjectId_date: { studentId: leaveRequest.requesterId, subjectId: subj.id, date: d },
          },
          create: { studentId: leaveRequest.requesterId, subjectId: subj.id, date: d, status: attendanceStatus },
          update: { status: attendanceStatus },
        });
      }
    }
  } catch (err) {
    console.error('[applyLeaveAttendance] Failed to auto-create attendance', { leaveRequestId: leaveRequest.id, err });
  }
}

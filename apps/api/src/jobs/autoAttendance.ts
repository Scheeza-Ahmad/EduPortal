import cron from 'node-cron';
import { prisma } from '../utils/prisma';

/**
 * Safety net for a class teacher who forgets to mark attendance — rather
 * than leaving a class with zero attendance records for the day, everyone
 * is marked present by default and the class teacher is notified so they
 * can correct any exceptions after the fact.
 */
export function startAutoAttendance(): void {
  // 11:59 PM every day
  cron.schedule('59 23 * * *', async () => {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const classes = await prisma.class.findMany({
        where: { isActive: true, classTeacherId: { not: null } },
        select: {
          id: true,
          number: true,
          section: true,
          classTeacherId: true,
          subjects: { where: { isActive: true }, select: { id: true } },
          studentProfiles: { select: { userId: true } },
        },
      });

      let classesAffected = 0;

      for (const cls of classes) {
        if (cls.subjects.length === 0 || cls.studentProfiles.length === 0 || !cls.classTeacherId) continue;

        const subjectIds = cls.subjects.map((s) => s.id);
        const alreadyMarked = await prisma.attendance.findFirst({
          where: { subjectId: { in: subjectIds }, date: { gte: today, lt: tomorrow } },
        });
        if (alreadyMarked) continue;

        // Mark every student present for every subject in the class, so
        // per-subject attendance % calculations stay consistent with a
        // normal manually-marked day.
        await prisma.attendance.createMany({
          data: cls.studentProfiles.flatMap((sp) =>
            subjectIds.map((subjectId) => ({
              studentId: sp.userId,
              subjectId,
              date: today,
              status: 'present' as const,
            }))
          ),
          skipDuplicates: true,
        });

        await prisma.notification.create({
          data: {
            userId: cls.classTeacherId,
            type: 'ATTENDANCE_AUTO_MARKED',
            message: `Attendance was auto-marked as present for Class ${cls.number}-${cls.section} on ${today.toLocaleDateString()}. Please review if needed.`,
          },
        });

        classesAffected += 1;
      }

      if (classesAffected > 0) {
        console.log(`[autoAttendance] Auto-marked attendance for ${classesAffected} class(es).`);
      }
    } catch (err) {
      console.error('autoAttendance job failed:', err);
    }
  });
}

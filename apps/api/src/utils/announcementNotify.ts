import { prisma } from './prisma';

export type AnnouncementAudience =
  | 'my_class'
  | 'my_subject_students'
  | 'wing_teachers'
  | 'wing_students'
  | 'all_teachers'
  | 'all_students'
  | 'class_teachers_only'
  | 'subject_teachers_only'
  | 'all_staff'
  | 'school_wide'
  | 'specific_class';

/** Resolves an audience selection to the concrete list of userIds to notify.
 * Kept separate from the Announcement row's own `classId` (which only
 * controls where the announcement itself is *displayed*) — audience only
 * decides who gets pinged about it. */
export async function resolveAudienceRecipients(params: {
  schoolId: string;
  authorId: string;
  audience: AnnouncementAudience;
  classId?: string | null;
  subjectId?: string | null;
  wing?: 'junior' | 'senior' | null;
}): Promise<string[]> {
  const { schoolId, authorId, audience, classId, subjectId, wing } = params;

  switch (audience) {
    case 'my_class':
    case 'specific_class': {
      if (!classId) return [];
      const students = await prisma.studentProfile.findMany({
        where: { classId, user: { isActive: true } },
        select: { userId: true },
      });
      return students.map((s) => s.userId);
    }
    case 'my_subject_students': {
      if (!subjectId) return [];
      const subject = await prisma.subject.findUnique({ where: { id: subjectId }, select: { classId: true } });
      if (!subject) return [];
      const students = await prisma.studentProfile.findMany({
        where: { classId: subject.classId, user: { isActive: true } },
        select: { userId: true },
      });
      return students.map((s) => s.userId);
    }
    case 'wing_teachers': {
      const wingNumbers = wing === 'senior' ? [6, 7, 8, 9, 10] : [1, 2, 3, 4, 5];
      const teachers = await prisma.user.findMany({
        where: {
          schoolId,
          isActive: true,
          role: { in: ['teacher', 'coordinator'] },
          OR: [
            { teachingSubjects: { some: { class: { number: { in: wingNumbers } } } } },
            { classTeacherOf: { some: { number: { in: wingNumbers } } } },
          ],
        },
        select: { id: true },
      });
      return teachers.map((t) => t.id);
    }
    case 'wing_students': {
      const wingNumbers = wing === 'senior' ? [6, 7, 8, 9, 10] : [1, 2, 3, 4, 5];
      const students = await prisma.studentProfile.findMany({
        where: { class: { schoolId, number: { in: wingNumbers } }, user: { isActive: true } },
        select: { userId: true },
      });
      return students.map((s) => s.userId);
    }
    case 'all_teachers': {
      const teachers = await prisma.user.findMany({
        where: { schoolId, isActive: true, role: { in: ['teacher', 'coordinator'] } },
        select: { id: true },
      });
      return teachers.map((t) => t.id);
    }
    case 'class_teachers_only': {
      const classes = await prisma.class.findMany({
        where: { schoolId, isActive: true, classTeacherId: { not: null } },
        select: { classTeacherId: true },
      });
      return [...new Set(classes.map((c) => c.classTeacherId).filter((id): id is string => Boolean(id)))];
    }
    case 'subject_teachers_only': {
      const teachers = await prisma.user.findMany({
        where: {
          schoolId,
          isActive: true,
          role: 'teacher',
          teachingSubjects: { some: {} },
          classTeacherOf: { none: {} },
        },
        select: { id: true },
      });
      return teachers.map((t) => t.id);
    }
    case 'all_staff': {
      const staff = await prisma.user.findMany({
        where: { schoolId, isActive: true, role: { in: ['teacher', 'coordinator', 'finance'] } },
        select: { id: true },
      });
      return staff.map((s) => s.id);
    }
    case 'all_students': {
      const students = await prisma.studentProfile.findMany({
        where: { class: { schoolId }, user: { isActive: true } },
        select: { userId: true },
      });
      return students.map((s) => s.userId);
    }
    case 'school_wide':
    default: {
      const users = await prisma.user.findMany({
        where: { schoolId, isActive: true, id: { not: authorId } },
        select: { id: true },
      });
      return users.map((u) => u.id);
    }
  }
}

/** Sends the actual notifications once an audience has been resolved to userIds. */
async function sendAnnouncementNotifications(userIds: string[], title: string, body: string): Promise<void> {
  if (userIds.length === 0) return;
  const preview = body.length > 100 ? `${body.slice(0, 100)}...` : body;
  await prisma.notification.createMany({
    data: userIds.map((userId) => ({
      userId,
      type: 'announcement',
      message: `${title}: ${preview}`,
    })),
  });
}

/** Audience-aware variant of notifyAnnouncementRecipients — used wherever the
 * creation form lets the author pick a specific audience instead of just
 * "this class" vs "school-wide". */
export async function notifyAnnouncementAudience(params: {
  schoolId: string;
  authorId: string;
  title: string;
  body: string;
  audience: AnnouncementAudience;
  classId?: string | null;
  subjectId?: string | null;
  wing?: 'junior' | 'senior' | null;
}): Promise<void> {
  try {
    const userIds = await resolveAudienceRecipients(params);
    await sendAnnouncementNotifications(userIds, params.title, params.body);
  } catch (err) {
    console.error('[notifyAnnouncementAudience] Failed to create notifications', {
      schoolId: params.schoolId,
      audience: params.audience,
      err,
    });
  }
}

/**
 * Creates a Notification for everyone an announcement reaches — class
 * students when it's scoped to one class, or every active user in the
 * school (minus the author) when it's school-wide. Best-effort: the
 * announcement itself is already saved by the time this runs, so a
 * notification failure here shouldn't be treated as the request failing.
 */
export async function notifyAnnouncementRecipients(params: {
  schoolId: string;
  authorId: string;
  title: string;
  body: string;
  classId: string | null;
}): Promise<void> {
  const { schoolId, authorId, title, body, classId } = params;

  try {
    const recipientIds: string[] = classId
      ? (
          await prisma.studentProfile.findMany({
            where: { classId, user: { isActive: true } },
            select: { userId: true },
          })
        ).map((s) => s.userId)
      : (
          await prisma.user.findMany({
            where: { schoolId, isActive: true, id: { not: authorId } },
            select: { id: true },
          })
        ).map((u) => u.id);

    if (recipientIds.length === 0) return;

    const preview = body.length > 100 ? `${body.slice(0, 100)}...` : body;

    await prisma.notification.createMany({
      data: recipientIds.map((userId) => ({
        userId,
        type: 'announcement',
        message: `${title}: ${preview}`,
      })),
    });
  } catch (err) {
    console.error('[notifyAnnouncementRecipients] Failed to create notifications', { schoolId, classId, err });
  }
}

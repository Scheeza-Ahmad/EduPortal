import { startWeeklyBackup } from './weeklyBackup';
import { startMonthlyReport } from './monthlyReport';
import { startStorageWarning } from './storageWarning';
import { startDueDateLock } from './dueDateLock';
import { startUngradedReminder } from './ungradedReminder';
import { startPerformanceSnapshot } from './performanceSnapshot';
import { startDueDateReminder } from './dueDateReminder';
import { startWeeklyDigest } from './weeklyDigest';
import { startMonthlyProgress } from './monthlyProgress';
import { startWeeklyPlatformSummary } from './weeklyPlatformSummary';
import { startInactiveTeacherAlert } from './inactiveTeacherAlert';
import { startSchoolHealthScore } from './schoolHealthScore';
import { startSystemHealthCheck } from './systemHealthCheck';
import { startInactiveSchoolAlert } from './inactiveSchoolAlert';
import { startReportSubmissionReminder } from './reportSubmissionReminder';
import { startCoordinatorWeeklyAlert } from './coordinatorWeeklyAlert';
import { startWingPerformanceEmail } from './wingPerformanceEmail';
import { startAutoAttendance } from './autoAttendance';
import { registerJob } from './registry';

// suspiciousLogin and welcomeEmail are NOT cron jobs — they're called
// directly from controllers (auth.controller.ts and the various
// admin/super create-account endpoints), so they have no start*() here.

export function startJobs(): void {
  const jobs: [string, () => void][] = [
    ['weeklyBackup', startWeeklyBackup],
    ['monthlyReport', startMonthlyReport],
    ['storageWarning', startStorageWarning],
    ['dueDateLock', startDueDateLock],
    ['ungradedReminder', startUngradedReminder],
    ['performanceSnapshot', startPerformanceSnapshot],
    ['dueDateReminder', startDueDateReminder],
    ['weeklyDigest', startWeeklyDigest],
    ['monthlyProgress', startMonthlyProgress],
    ['weeklyPlatformSummary', startWeeklyPlatformSummary],
    ['inactiveTeacherAlert', startInactiveTeacherAlert],
    ['schoolHealthScore', startSchoolHealthScore],
    ['systemHealthCheck', startSystemHealthCheck],
    ['inactiveSchoolAlert', startInactiveSchoolAlert],
    ['reportSubmissionReminder', startReportSubmissionReminder],
    ['coordinatorWeeklyAlert', startCoordinatorWeeklyAlert],
    ['wingPerformanceEmail', startWingPerformanceEmail],
    ['autoAttendance', startAutoAttendance],
  ];

  for (const [name, start] of jobs) {
    start();
    registerJob(name);
  }

  console.log(`Cron jobs registered: ${jobs.map(([name]) => name).join(', ')}`);
}

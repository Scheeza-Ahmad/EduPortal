import { startWeeklyBackup } from './weeklyBackup';
import { startMonthlyReport } from './monthlyReport';
import { startStorageWarning } from './storageWarning';
import { startDueDateLock } from './dueDateLock';
import { startUngradedReminder } from './ungradedReminder';
import { startPerformanceSnapshot } from './performanceSnapshot';
import { startDueDateReminder } from './dueDateReminder';
import { startWeeklyDigest } from './weeklyDigest';
import { startMonthlyProgress } from './monthlyProgress';

export function startJobs(): void {
  startWeeklyBackup();
  startMonthlyReport();
  startStorageWarning();
  startDueDateLock();
  startUngradedReminder();
  startPerformanceSnapshot();
  startDueDateReminder();
  startWeeklyDigest();
  startMonthlyProgress();
  console.log(
    'Cron jobs registered: weeklyBackup, monthlyReport, storageWarning, dueDateLock, ungradedReminder, performanceSnapshot, dueDateReminder, weeklyDigest, monthlyProgress'
  );
}

import { startWeeklyBackup } from './weeklyBackup';
import { startMonthlyReport } from './monthlyReport';
import { startStorageWarning } from './storageWarning';
import { startDueDateLock } from './dueDateLock';
import { startUngradedReminder } from './ungradedReminder';
import { startPerformanceSnapshot } from './performanceSnapshot';

export function startJobs(): void {
  startWeeklyBackup();
  startMonthlyReport();
  startStorageWarning();
  startDueDateLock();
  startUngradedReminder();
  startPerformanceSnapshot();
  console.log(
    'Cron jobs registered: weeklyBackup, monthlyReport, storageWarning, dueDateLock, ungradedReminder, performanceSnapshot'
  );
}

import { startWeeklyBackup } from './weeklyBackup';
import { startMonthlyReport } from './monthlyReport';
import { startStorageWarning } from './storageWarning';

export function startJobs(): void {
  startWeeklyBackup();
  startMonthlyReport();
  startStorageWarning();
  console.log('Cron jobs registered: weeklyBackup, monthlyReport, storageWarning');
}

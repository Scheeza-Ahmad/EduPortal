// Tracks which cron jobs actually got registered when startJobs() ran, so
// systemHealthCheck can detect a real regression (e.g. someone comments a
// job out of startJobs() later) rather than just asserting a static list.
export const EXPECTED_JOBS = [
  'weeklyBackup',
  'monthlyReport',
  'storageWarning',
  'dueDateLock',
  'ungradedReminder',
  'performanceSnapshot',
  'dueDateReminder',
  'weeklyDigest',
  'monthlyProgress',
  'weeklyPlatformSummary',
  'inactiveTeacherAlert',
  'schoolHealthScore',
  'systemHealthCheck',
  'inactiveSchoolAlert',
];

const registered = new Set<string>();

export function registerJob(name: string): void {
  registered.add(name);
}

export function getMissingJobs(): string[] {
  return EXPECTED_JOBS.filter((j) => !registered.has(j));
}

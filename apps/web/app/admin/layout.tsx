'use client';

import { ReactNode, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Loader2, Menu, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api';
import { useAuthStore } from '@/lib/store';
import { useLanguage } from '@/lib/LanguageContext';
import { t } from '@/lib/translations';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PortalToggles } from '@/components/portal-toggles';
import { AdminSearchBar } from '@/components/admin-search-bar';

const NAV_ITEMS = [
  { href: '/admin', key: 'dashboard' as const },
  { href: '/admin/students', key: 'students' as const },
  { href: '/admin/teachers', key: 'teachers' as const },
  { href: '/admin/coordinators', key: 'coordinators' as const },
  { href: '/admin/classes', key: 'classes' as const },
  { href: '/admin/subjects', key: 'subjects' as const },
  { href: '/admin/timetable', key: 'timetable' as const },
  { href: '/admin/announcements', key: 'announcements' as const },
  { href: '/admin/report-cards', key: 'reportCards' as const },
  { href: '/admin/calendar', key: 'calendar' as const },
  { href: '/admin/leave-requests', key: 'leaveRequests' as const },
  { href: '/admin/consent-forms', key: 'consentForms' as const },
  { href: '/admin/at-risk', key: 'atRiskStudents' as const, icon: '⚠️' },
  { href: '/admin/finance-officer', key: 'financeOfficer' as const },
];

export default function AdminLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { accessToken, user, setAuth, clearAuth } = useAuthStore();
  const { language } = useLanguage();
  const [checkingSession, setCheckingSession] = useState(true);
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [highRiskCount, setHighRiskCount] = useState(0);

  // Clear the pending indicator once the route has actually changed.
  useEffect(() => {
    setPendingHref(null);
    setMobileNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    // Access token lives in memory only, so it's gone after a page refresh.
    // Try a silent refresh using the httpOnly cookie before giving up and
    // sending the user back to /login.
    if (accessToken) {
      setCheckingSession(false);
      return;
    }

    let cancelled = false;

    api
      .post('/api/auth/refresh')
      .then((res) => {
        if (cancelled) return;
        const token = res.data?.data?.accessToken;
        if (token) {
          setAuth(token, user ?? { id: '', name: '', role: 'school_admin' });
          setCheckingSession(false);
        } else {
          router.replace('/login');
        }
      })
      .catch(() => {
        if (!cancelled) router.replace('/login');
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  useEffect(() => {
    if (checkingSession) return;
    api
      .get<{ success: boolean; data: { riskLevel: string }[] }>('/api/admin/at-risk-students')
      .then((res) => setHighRiskCount(res.data.data.filter((s) => s.riskLevel === 'high').length))
      .catch(() => {});
  }, [checkingSession]);

  async function handleLogout() {
    try {
      await api.post('/api/auth/logout');
    } finally {
      clearAuth();
      router.push('/login');
    }
  }

  if (checkingSession) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Loading...
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      {mobileNavOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setMobileNavOpen(false)}
        />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-64 shrink-0 -translate-x-full border-r border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900 transition-transform duration-200 lg:static lg:w-56 lg:translate-x-0',
          mobileNavOpen && 'translate-x-0'
        )}
      >
        <div className="mb-6 flex items-center justify-between px-2">
          <span className="text-lg font-semibold">EduPortal</span>
          <button className="lg:hidden" onClick={() => setMobileNavOpen(false)} aria-label="Close menu">
            <X className="h-5 w-5" />
          </button>
        </div>
        <nav className="space-y-1">
          {NAV_ITEMS.map((item) => {
            // Highlight optimistically on the clicked link so the active
            // state updates the instant a user clicks, without waiting for
            // the route transition to finish.
            const isActive = pendingHref
              ? pendingHref === item.href
              : item.href === '/admin'
                ? pathname === item.href
                : pathname.startsWith(item.href);

            const isPending = pendingHref === item.href && pendingHref !== pathname;

            return (
              <Link
                key={item.href}
                href={item.href}
                prefetch
                onClick={() => setPendingHref(item.href)}
                className={cn(
                  'flex items-center justify-between rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                <span>
                  {item.icon ? `${item.icon} ` : ''}
                  {t(item.key, language)}
                </span>
                {isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : item.key === 'atRiskStudents' && highRiskCount > 0 ? (
                  <Badge variant="destructive" className="h-5 px-1.5 text-[10px]">
                    {highRiskCount}
                  </Badge>
                ) : null}
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="flex min-h-screen flex-1 flex-col">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <button className="lg:hidden" onClick={() => setMobileNavOpen(true)} aria-label="Open menu">
              <Menu className="h-5 w-5" />
            </button>
            <span className="text-sm font-medium">{user?.name ?? 'School Admin'}</span>
          </div>

          <AdminSearchBar />

          <div className="flex items-center gap-2">
            <PortalToggles />
            <Button variant="outline" size="sm" onClick={handleLogout}>
              {t('logout', language)}
            </Button>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6" dir={language === 'ur' ? 'rtl' : 'ltr'}>
          {children}
        </main>
      </div>
    </div>
  );
}

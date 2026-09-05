'use client';

import { ReactNode, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Loader2, Menu, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api';
import { useAuthStore } from '@/lib/store';
import { useLanguage } from '@/lib/LanguageContext';
import { t, TranslationKey } from '@/lib/translations';
import { LogoutButton } from '@/components/logout-button';
import { defaultBranding, useBranding } from '@/lib/BrandingContext';
import { WrongPortalAccess } from '@/components/wrong-portal';
import { useFeatures } from '@/lib/FeaturesContext';
import type { SchoolFeatures } from '@/lib/FeaturesContext';
import { Badge } from '@/components/ui/badge';
import { PortalToggles } from '@/components/portal-toggles';
import { AdminSearchBar } from '@/components/admin-search-bar';

const NAV_ITEMS: { href: string; key: TranslationKey; icon?: string; feature?: keyof SchoolFeatures }[] = [
  { href: '/admin', key: 'dashboard' },
  { href: '/admin/teachers', key: 'teachers' },
  { href: '/admin/students-classes', key: 'studentsAndClasses' },
  { href: '/admin/coordinators', key: 'coordinators', feature: 'featureCoordinator' },
  { href: '/admin/subjects', key: 'subjects' },
  { href: '/admin/timetable', key: 'timetable', feature: 'featureTimetable' },
  { href: '/admin/announcements', key: 'announcements', feature: 'featureAnnouncements' },
  { href: '/admin/report-cards', key: 'reportCards', feature: 'featureReportCards' },
  { href: '/admin/calendar', key: 'calendar', feature: 'featureCalendar' },
  { href: '/admin/leave-requests', key: 'leaveRequests', feature: 'featureLeaveRequests' },
  { href: '/admin/consent-forms', key: 'consentForms', feature: 'featureConsentForms' },
  { href: '/admin/staff-leaves', key: 'staffLeaves' },
  { href: '/admin/at-risk', key: 'atRiskStudents', icon: '⚠️', feature: 'featureAiInsights' },
  { href: '/admin/finance-officer', key: 'financeOfficer', feature: 'featureFinance' },
  { href: '/admin/school-settings', key: 'schoolSettings' },
];

export default function AdminLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { accessToken, user, setAuth, clearAuth } = useAuthStore();
  const { language } = useLanguage();
  const { branding } = useBranding();
  const hasCustomBranding = branding.primaryColor !== defaultBranding.primaryColor;
  const { hasFeature } = useFeatures();
  const [checkingSession, setCheckingSession] = useState(true);
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [highRiskCount, setHighRiskCount] = useState(0);

  const visibleNavItems = NAV_ITEMS.filter((item) => !item.feature || hasFeature(item.feature));

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

  if (user && !['school_admin'].includes(user.role)) {
    return <WrongPortalAccess role={user.role} />;
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
          'fixed inset-y-0 left-0 z-50 w-64 shrink-0 -translate-x-full border-r border-gray-200 p-4 dark:border-gray-700 transition-transform duration-200 lg:static lg:w-56 lg:translate-x-0',
          !hasCustomBranding && 'bg-white dark:bg-gray-900',
          mobileNavOpen && 'translate-x-0'
        )}
        style={hasCustomBranding && branding.sidebarColor ? { backgroundColor: branding.sidebarColor } : undefined}
      >
        <div className="mb-6 flex items-center justify-between px-2">
          {hasCustomBranding && branding.logoUrl ? (
            <img src={branding.logoUrl} alt={branding.portalName} className="h-8 w-auto object-contain" />
          ) : (
            <span className="text-lg font-semibold">{branding.portalName}</span>
          )}
          <button className="lg:hidden" onClick={() => setMobileNavOpen(false)} aria-label="Close menu">
            <X className="h-5 w-5" />
          </button>
        </div>
        <nav className="space-y-1">
          {visibleNavItems.map((item) => {
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
                    ? hasCustomBranding
                      ? 'text-white'
                      : 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
                style={isActive && hasCustomBranding ? { backgroundColor: branding.primaryColor } : undefined}
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
            <LogoutButton onConfirm={handleLogout} label={t('logout', language)} />
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6" dir={language === 'ur' ? 'rtl' : 'ltr'}>
          {children}
        </main>
      </div>
    </div>
  );
}

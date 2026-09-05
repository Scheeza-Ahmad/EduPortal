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
import { LogoutButton } from '@/components/logout-button';
import { useBranding } from '@/lib/BrandingContext';
import { WrongPortalAccess } from '@/components/wrong-portal';
import { PortalToggles } from '@/components/portal-toggles';

const NAV_ITEMS = [
  { href: '/finance', key: 'dashboard' as const },
  { href: '/finance/setup', key: 'setup' as const },
  { href: '/finance/fee-structure', key: 'feeStructure' as const },
  { href: '/finance/student-fees', key: 'studentFees' as const },
  { href: '/finance/reports', key: 'reports' as const },
];

// The Finance portal is now exclusively for the 'finance' role — school_admin
// only creates finance-officer accounts from /admin/finance-officer and has
// no access to finance data itself. The backend enforces the same on every
// /api/finance endpoint.
const ALLOWED_ROLES = ['finance'];

export default function FinanceLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { accessToken, user, setAuth, clearAuth } = useAuthStore();
  const { language } = useLanguage();
  const { branding } = useBranding();
  const [checkingSession, setCheckingSession] = useState(true);
  const [checkingSetup, setCheckingSetup] = useState(true);
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

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
          setAuth(token, user ?? { id: '', name: '', role: 'finance' });
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

  // First-time setup gate: if this school hasn't configured SchoolSettings
  // yet, force the wizard before anything else in the portal is reachable.
  // Skipped entirely for a wrong-role user — no point probing an endpoint
  // they can't use before showing them the wrong-portal screen.
  useEffect(() => {
    if (checkingSession) return;
    if (user && !ALLOWED_ROLES.includes(user.role)) {
      setCheckingSetup(false);
      return;
    }

    if (pathname === '/finance/wizard') {
      setCheckingSetup(false);
      return;
    }

    setCheckingSetup(true);
    let cancelled = false;
    api
      .get('/api/finance/setup/settings')
      .then((res) => {
        if (cancelled) return;
        if (!res.data?.data) {
          router.replace('/finance/wizard');
        } else {
          setCheckingSetup(false);
        }
      })
      .catch(() => {
        if (!cancelled) setCheckingSetup(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkingSession, pathname, user]);

  async function handleLogout() {
    try {
      await api.post('/api/auth/logout');
    } finally {
      clearAuth();
      router.push('/login');
    }
  }

  if (checkingSession || checkingSetup) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Loading...
      </div>
    );
  }

  if (user && !ALLOWED_ROLES.includes(user.role)) {
    return <WrongPortalAccess role={user.role} />;
  }

  const isWizard = pathname === '/finance/wizard';

  if (isWizard) {
    // Full-width — no sidebar/header chrome while onboarding is in progress.
    return <div className="min-h-screen p-6">{children}</div>;
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
          !branding.sidebarColor && 'bg-white dark:bg-gray-900',
          mobileNavOpen && 'translate-x-0'
        )}
        style={branding.sidebarColor ? { backgroundColor: branding.sidebarColor } : undefined}
      >
        <div className="mb-6 flex items-center justify-between px-2">
          {branding.logoUrl ? (
            <img src={branding.logoUrl} alt={branding.portalName} className="h-8 w-auto object-contain" />
          ) : (
            <span className="text-lg font-semibold">{branding.portalName} Finance</span>
          )}
          <button className="lg:hidden" onClick={() => setMobileNavOpen(false)} aria-label="Close menu">
            <X className="h-5 w-5" />
          </button>
        </div>
        <nav className="space-y-1">
          {NAV_ITEMS.map((item) => {
            const isActive = pendingHref
              ? pendingHref === item.href
              : item.href === '/finance'
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
                    ? 'text-white'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
                style={isActive ? { backgroundColor: branding.primaryColor } : undefined}
              >
                <span>{t(item.key, language)}</span>
                {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
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
            <span className="text-sm font-medium">{user?.name ?? 'Finance'}</span>
          </div>
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

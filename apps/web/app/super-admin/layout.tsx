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
import { useIsDarkMode } from '@/lib/useIsDarkMode';
import { WrongPortalAccess } from '@/components/wrong-portal';
import { PortalToggles } from '@/components/portal-toggles';

// Super Admin is the platform operator, not any one school — this portal
// never shows a school's branding, regardless of what's saved in
// localStorage from a previous login on this browser.

const NAV_ITEMS = [
  { href: '/super-admin', key: 'dashboard' as const },
  { href: '/super-admin/schools', key: 'schools' as const },
  { href: '/super-admin/audit', key: 'auditLog' as const },
  { href: '/super-admin/backup', key: 'backup' as const },
];

export default function SuperAdminLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { accessToken, user, setAuth, clearAuth } = useAuthStore();
  const { language } = useLanguage();
  const { resetToDefaultBranding } = useBranding();
  const isDark = useIsDarkMode();
  const [checkingSession, setCheckingSession] = useState(true);
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Belt-and-suspenders: BrandingProvider already resets to default on the
  // login page, but if a school's branding was ever saved while this same
  // browser tab stayed on /super-admin (e.g. via "View Portal" from the
  // schools list), clear it immediately so it never leaks in here.
  useEffect(() => {
    resetToDefaultBranding();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
          setAuth(token, user ?? { id: '', name: '', role: 'super_admin' });
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

  if (user && !['super_admin'].includes(user.role)) {
    return <WrongPortalAccess role={user.role} />;
  }

  return (
    <div className="flex min-h-screen">
      {mobileNavOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 lg:hidden"
          onClick={() => setMobileNavOpen(false)}
        />
      )}

      {/* Fix 6 — background is an INLINE style, not a Tailwind class, so no
          CSS specificity or override elsewhere can leave this transparent. */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-64 shrink-0 -translate-x-full border-r border-gray-200 p-4 text-gray-900 shadow-xl transition-transform duration-200 dark:border-gray-800 dark:text-gray-100 lg:static lg:w-56 lg:translate-x-0 lg:shadow-none',
          mobileNavOpen && 'translate-x-0'
        )}
        style={{ backgroundColor: isDark ? '#030712' : '#ffffff' }}
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
              : item.href === '/super-admin'
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
                    ? 'bg-green-600 text-white font-medium'
                    : 'text-muted-foreground hover:bg-gray-100 dark:hover:bg-gray-800'
                )}
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
            <span className="text-sm font-medium">{user?.name ?? 'Super Admin'}</span>
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

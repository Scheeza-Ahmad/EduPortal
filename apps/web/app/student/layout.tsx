'use client';

import { ReactNode, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Bell, Loader2, Menu, X } from 'lucide-react';
import { toast } from 'sonner';
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
import { PortalToggles } from '@/components/portal-toggles';

const NAV_ITEMS: { href: string; key: TranslationKey; icon?: string; feature?: keyof SchoolFeatures }[] = [
  { href: '/student', key: 'dashboard' },
  { href: '/student/activities', key: 'activities' },
  { href: '/student/grades', key: 'grades' },
  { href: '/student/attendance', key: 'attendance', feature: 'featureAttendance' },
  { href: '/student/fees', key: 'fees', feature: 'featureFinance' },
  { href: '/student/badges', key: 'badges', feature: 'featureBadges' },
  { href: '/student/insights', key: 'insights', icon: '🤖', feature: 'featureAiInsights' },
  { href: '/student/notifications', key: 'notifications' },
];

export default function StudentLayout({ children }: { children: ReactNode }) {
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
  const [unreadCount, setUnreadCount] = useState(0);

  const visibleNavItems = NAV_ITEMS.filter((item) => !item.feature || hasFeature(item.feature));

  // Clear the pending indicator once the route has actually changed.
  useEffect(() => {
    setPendingHref(null);
    setMobileNavOpen(false);
  }, [pathname]);

  // Refresh the unread count on every route change — cheap, and keeps the
  // bell accurate right after the student reads/marks notifications.
  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    api
      .get<{ success: boolean; data: { notifications: { isRead: boolean }[] } }>(
        '/api/student/notifications'
      )
      .then((res) => {
        if (!cancelled) setUnreadCount(res.data.data.notifications.filter((n) => !n.isRead).length);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [accessToken, pathname]);

  // New-activity popups — checked on mount and every 5 minutes. Marking a
  // notification read the moment its toast is shown (rather than waiting for
  // dismiss) keeps this idempotent: the next poll's `unread=true` filter
  // naturally excludes it, so it's never shown twice.
  useEffect(() => {
    if (!accessToken) return;

    async function checkNewActivityToasts() {
      try {
        const res = await api.get<{
          success: boolean;
          data: { notifications: { id: string; type: string; message: string }[] };
        }>('/api/student/notifications', { params: { unread: 'true' } });

        const activityNotifications = res.data.data.notifications.filter(
          (n) => n.type === 'ACTIVITY_PUBLISHED'
        );

        for (const n of activityNotifications) {
          toast('📝 New Activity Posted', {
            description: n.message,
            duration: 8000,
            action: {
              label: 'View Activity',
              onClick: () => router.push('/student/activities'),
            },
          });
          api.patch(`/api/student/notifications/${n.id}/read`).catch(() => {});
        }

        if (activityNotifications.length > 0) {
          setUnreadCount((c) => Math.max(0, c - activityNotifications.length));
        }
      } catch {
        // ignore — the notification bell/page still show these if this poll fails
      }
    }

    checkNewActivityToasts();
    const interval = setInterval(checkNewActivityToasts, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [accessToken, router]);

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
          setAuth(token, user ?? { id: '', name: '', role: 'student' });
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

  if (user && !['student'].includes(user.role)) {
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

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-64 shrink-0 -translate-x-full border-r border-gray-200 p-4 shadow-xl dark:border-gray-800 transition-transform duration-200 lg:static lg:w-56 lg:translate-x-0 lg:shadow-none',
          !hasCustomBranding && 'bg-white dark:bg-gray-950',
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
              : item.href === '/student'
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
                <span>
                  {item.icon ? `${item.icon} ` : ''}
                  {t(item.key, language)}
                </span>
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
            <span className="text-sm font-medium">{user?.name ?? 'Student'}</span>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/student/notifications"
              className="relative flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Notifications"
            >
              <Bell className="h-4 w-4" />
              {unreadCount > 0 && (
                <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-medium leading-none text-destructive-foreground">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </Link>
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

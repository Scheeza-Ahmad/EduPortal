'use client';

import { ReactNode, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api';
import { useAuthStore } from '@/lib/store';
import { Button } from '@/components/ui/button';

const NAV_ITEMS = [
  { href: '/finance', label: 'Dashboard' },
  { href: '/finance/setup', label: 'Setup' },
  { href: '/finance/fee-structure', label: 'Fee Structure' },
  { href: '/finance/student-fees', label: 'Student Fees' },
  { href: '/finance/reports', label: 'Reports' },
];

// Shared by both the 'finance' role (their home) and 'school_admin' (reached
// via the "Finance" link in the admin panel) — the backend enforces this
// same pairing on every /api/finance endpoint.
const ALLOWED_ROLES = ['finance', 'school_admin'];

export default function FinanceLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { accessToken, user, setAuth, clearAuth } = useAuthStore();
  const [checkingSession, setCheckingSession] = useState(true);
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  useEffect(() => {
    setPendingHref(null);
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

  useEffect(() => {
    if (!checkingSession && user && !ALLOWED_ROLES.includes(user.role)) {
      router.replace('/login');
    }
  }, [checkingSession, user, router]);

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
      <aside className="w-56 shrink-0 border-r bg-muted/20 p-4">
        <div className="mb-6 px-2 text-lg font-semibold">EduPortal Finance</div>
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
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                <span>{item.label}</span>
                {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              </Link>
            );
          })}
        </nav>

        {user?.role === 'school_admin' && (
          <div className="mt-6 border-t pt-4">
            <Link
              href="/admin"
              className="flex items-center rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              ← Back to Admin Panel
            </Link>
          </div>
        )}
      </aside>

      <div className="flex min-h-screen flex-1 flex-col">
        <header className="flex items-center justify-between border-b px-6 py-3">
          <span className="text-sm font-medium">{user?.name ?? 'Finance'}</span>
          <Button variant="outline" size="sm" onClick={handleLogout}>
            Logout
          </Button>
        </header>

        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}

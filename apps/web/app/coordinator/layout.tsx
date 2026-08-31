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
  { href: '/coordinator', label: 'Dashboard' },
  { href: '/coordinator/teachers', label: 'Teachers' },
  { href: '/coordinator/reports', label: 'Reports' },
  { href: '/coordinator/students', label: 'Students' },
  { href: '/coordinator/announcements', label: 'Announcements' },
  { href: '/coordinator/wing-report', label: 'Wing Report' },
];

export default function CoordinatorLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { accessToken, user, setAuth, clearAuth } = useAuthStore();
  const [checkingSession, setCheckingSession] = useState(true);
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  useEffect(() => {
    setPendingHref(null);
  }, [pathname]);

  useEffect(() => {
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
          setAuth(token, user ?? { id: '', name: '', role: 'coordinator' });
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
    if (!checkingSession && user && user.role !== 'coordinator') {
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
    <div className="flex min-h-screen bg-indigo-50/30">
      <aside className="w-56 shrink-0 border-r bg-indigo-950 p-4 text-white">
        <div className="mb-6 px-2 text-lg font-semibold">EduPortal Coordinator</div>
        <nav className="space-y-1">
          {NAV_ITEMS.map((item) => {
            const isActive = pendingHref
              ? pendingHref === item.href
              : item.href === '/coordinator'
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
                  isActive ? 'bg-indigo-600 text-white' : 'text-indigo-200 hover:bg-indigo-900 hover:text-white'
                )}
              >
                <span>{item.label}</span>
                {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="flex min-h-screen flex-1 flex-col">
        <header className="flex items-center justify-between border-b bg-white px-6 py-3">
          <span className="text-sm font-medium text-indigo-950">{user?.name ?? 'Coordinator'}</span>
          <Button variant="outline" size="sm" onClick={handleLogout}>
            Logout
          </Button>
        </header>

        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}

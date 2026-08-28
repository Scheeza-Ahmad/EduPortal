'use client';

import { ReactNode, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api';
import { useAuthStore } from '@/lib/store';
import { Button } from '@/components/ui/button';

const NAV_ITEMS = [
  { href: '/super-admin', label: 'Dashboard' },
  { href: '/super-admin/schools', label: 'Schools' },
  { href: '/super-admin/audit', label: 'Audit Log' },
  { href: '/super-admin/backup', label: 'Backup' },
];

export default function SuperAdminLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { accessToken, user, setAuth, clearAuth } = useAuthStore();
  const [checkingSession, setCheckingSession] = useState(true);

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

  return (
    <div className="flex min-h-screen">
      <aside className="w-56 shrink-0 border-r bg-muted/20 p-4">
        <div className="mb-6 px-2 text-lg font-semibold">EduPortal</div>
        <nav className="space-y-1">
          {NAV_ITEMS.map((item) => {
            const isActive =
              item.href === '/super-admin'
                ? pathname === item.href
                : pathname.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'block rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="flex min-h-screen flex-1 flex-col">
        <header className="flex items-center justify-between border-b px-6 py-3">
          <span className="text-sm font-medium">{user?.name ?? 'Super Admin'}</span>
          <Button variant="outline" size="sm" onClick={handleLogout}>
            Logout
          </Button>
        </header>

        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}

'use client';

import { ReactNode, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api';
import { useAuthStore } from '@/lib/store';
import { useParentStore, Child } from '@/lib/parentStore';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const NAV_ITEMS = [
  { href: '/parent', label: 'Dashboard' },
  { href: '/parent/grades', label: 'Grades' },
  { href: '/parent/attendance', label: 'Attendance' },
  { href: '/parent/timetable', label: 'Timetable' },
  { href: '/parent/announcements', label: 'Announcements' },
  { href: '/parent/report-card', label: 'Report Card' },
];

export default function ParentLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { accessToken, user, setAuth, clearAuth } = useAuthStore();
  const { children: kids, selectedChildId, setChildren, selectChild } = useParentStore();
  const [checkingSession, setCheckingSession] = useState(true);
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  // Clear the pending indicator once the route has actually changed.
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
          setAuth(token, user ?? { id: '', name: '', role: 'parent' });
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
      .get<{ success: boolean; data: { children: Child[] } }>('/api/parent/children')
      .then((res) => setChildren(res.data.data.children))
      .catch(() => setChildren([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      <aside className="w-56 shrink-0 border-r bg-muted/20 p-4">
        <div className="mb-6 px-2 text-lg font-semibold">EduPortal</div>
        <nav className="space-y-1">
          {NAV_ITEMS.map((item) => {
            // Highlight optimistically on the clicked link so the active
            // state updates the instant a user clicks, without waiting for
            // the route transition to finish.
            const isActive = pendingHref
              ? pendingHref === item.href
              : item.href === '/parent'
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
      </aside>

      <div className="flex min-h-screen flex-1 flex-col">
        <header className="flex items-center justify-between border-b px-6 py-3">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium">{user?.name ?? 'Parent'}</span>
            {kids.length > 0 && (
              <Select value={selectedChildId ?? undefined} onValueChange={selectChild}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Select a child" />
                </SelectTrigger>
                <SelectContent>
                  {kids.map((child) => (
                    <SelectItem key={child.id} value={child.id}>
                      {child.name} (Class {child.class.number}
                      {child.class.section})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <Button variant="outline" size="sm" onClick={handleLogout}>
            Logout
          </Button>
        </header>

        <main className="flex-1 p-6">
          {kids.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No children are linked to your account yet. Contact your school admin.
            </p>
          ) : (
            children
          )}
        </main>
      </div>
    </div>
  );
}

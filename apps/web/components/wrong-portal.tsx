'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getRoleHome } from '@/lib/roleHome';

/** Shown when a signed-in user's role doesn't match the portal they're on
 * (e.g. a teacher's token loaded into /admin). Auto-redirects to their own
 * portal shortly, with an immediate link for anyone who doesn't want to wait. */
export function WrongPortalAccess({ role }: { role: string }) {
  const router = useRouter();
  const destination = getRoleHome(role);

  useEffect(() => {
    const timer = setTimeout(() => router.replace(destination), 2500);
    return () => clearTimeout(timer);
  }, [destination, router]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <ShieldAlert className="h-10 w-10 text-muted-foreground" />
      <div>
        <p className="text-lg font-semibold">You don&apos;t have access to this portal.</p>
        <p className="mt-1 text-sm text-muted-foreground">Redirecting you to your portal...</p>
      </div>
      <Button asChild>
        <Link href={destination}>Go to your portal →</Link>
      </Button>
    </div>
  );
}

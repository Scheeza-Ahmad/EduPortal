'use client';

import { useEffect, useState } from 'react';

/** Tracks whether the `dark` class is currently on <html> (how next-themes
 * marks dark mode) — used where an element needs an INLINE style background
 * color instead of a Tailwind class, e.g. Fix 6's mobile sidebar, which
 * needs certainty that no CSS specificity/override elsewhere can make it
 * transparent. */
export function useIsDarkMode(): boolean {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    const update = () => setIsDark(root.classList.contains('dark'));
    update();

    const observer = new MutationObserver(update);
    observer.observe(root, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  return isDark;
}

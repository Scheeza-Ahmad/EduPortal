'use client';

import { createContext, ReactNode, useContext, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

export interface Branding {
  portalName: string;
  logoUrl: string | null;
  primaryColor: string;
  sidebarColor: string | null;
  accentColor: string;
  fontFamily: string;
  loginBgColor: string;
  loginMessage: string | null;
}

export const defaultBranding: Branding = {
  portalName: 'EduPortal',
  logoUrl: null,
  primaryColor: '#1a56db',
  sidebarColor: null,
  accentColor: '#f97316',
  fontFamily: 'Inter',
  loginBgColor: '#ffffff',
  loginMessage: null,
};

const STORAGE_KEY = 'school_branding';

interface BrandingContextValue {
  branding: Branding;
  setBranding: (b: Branding) => void;
}

export const BrandingContext = createContext<BrandingContextValue>({
  branding: defaultBranding,
  setBranding: () => {},
});

/** Darkens a hex color by a fixed amount — used as the sidebar fallback when
 * no explicit sidebar color is set. */
export function darkenColor(hex: string, amount = 40): string {
  const clean = /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : '#1a56db';
  const r = Math.max(0, parseInt(clean.slice(1, 3), 16) - amount);
  const g = Math.max(0, parseInt(clean.slice(3, 5), 16) - amount);
  const b = Math.max(0, parseInt(clean.slice(5, 7), 16) - amount);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

/** Applies branding as CSS custom properties + body font, so plain CSS
 * (`bg-primary`, `var(--brand-*)`) picks it up without a React re-render.
 *
 * This project's `--primary` (see globals.css / tailwind.config.ts:
 * `primary: { DEFAULT: 'var(--primary)' }`) holds a complete, ready-to-use
 * CSS color value (an `oklch(...)` by default) — nothing wraps it in
 * `hsl()`/`oklch()` at the point of use. A plain hex string is just as valid
 * a CSS color there, so it's set directly with no color-space conversion. */
export function applyBrandingToDOM(branding: Branding): void {
  if (typeof document === 'undefined') return;

  const root = document.documentElement;
  const sidebarColor = branding.sidebarColor || darkenColor(branding.primaryColor);

  root.style.setProperty('--primary', branding.primaryColor);
  root.style.setProperty('--brand-primary', branding.primaryColor);
  root.style.setProperty('--brand-sidebar', sidebarColor);
  root.style.setProperty('--brand-accent', branding.accentColor);
  root.style.setProperty('--brand-font', branding.fontFamily);

  document.body.style.fontFamily = `${branding.fontFamily}, sans-serif`;
}

export function BrandingProvider({ children }: { children: ReactNode }) {
  // Start from the default on every render (server included) and only read
  // localStorage after mount — reading it inside the useState initializer
  // would render different markup on the server vs. the client's first
  // paint and trigger a hydration mismatch.
  const [branding, setBrandingState] = useState<Branding>(defaultBranding);
  const pathname = usePathname();
  // The login page always shows plain default EduPortal branding — a
  // school's look only applies once you're inside its portal. `/` also
  // redirects straight to /login, so it never needs a real value either.
  const isLoginPage = pathname === null || pathname === '/' || pathname.startsWith('/login');

  useEffect(() => {
    if (isLoginPage) {
      applyBrandingToDOM(defaultBranding);
      return;
    }
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as Branding;
        setBrandingState(parsed);
        applyBrandingToDOM(parsed);
        return;
      }
    } catch {
      // ignore — localStorage may be unavailable or hold invalid JSON
    }
    applyBrandingToDOM(defaultBranding);
  }, [isLoginPage]);

  function setBranding(b: Branding) {
    setBrandingState(b);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(b));
    } catch {
      // ignore
    }
    // Written to localStorage either way (the next portal page picks it up
    // on mount), but only painted to the DOM once we're actually off the
    // login page — logging in shouldn't flash the new colors before the
    // redirect even happens.
    if (!isLoginPage) applyBrandingToDOM(b);
  }

  return (
    <BrandingContext.Provider value={{ branding, setBranding }}>{children}</BrandingContext.Provider>
  );
}

export function useBranding(): BrandingContextValue {
  return useContext(BrandingContext);
}

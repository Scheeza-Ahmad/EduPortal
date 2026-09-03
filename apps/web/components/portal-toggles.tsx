'use client';

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { Moon, Sun } from 'lucide-react';
import { useLanguage } from '@/lib/LanguageContext';
import { Button } from '@/components/ui/button';

/** Dark-mode + Urdu/English toggle buttons, shared by every portal's top bar. */
export function PortalToggles() {
  const { theme, setTheme } = useTheme();
  const { language, toggleLanguage } = useLanguage();
  const [mounted, setMounted] = useState(false);

  // Avoid a server/client mismatch on the icon — next-themes' resolved theme
  // is only known after mount.
  useEffect(() => setMounted(true), []);

  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="sm" onClick={toggleLanguage}>
        {language === 'en' ? 'اردو' : 'English'}
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        aria-label="Toggle dark mode"
      >
        {mounted && theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </Button>
    </div>
  );
}

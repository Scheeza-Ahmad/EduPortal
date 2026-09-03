'use client';

import { createContext, ReactNode, useContext, useEffect, useState } from 'react';
import { Language } from './translations';

interface LanguageContextValue {
  language: Language;
  toggleLanguage: () => void;
}

const LanguageContext = createContext<LanguageContextValue>({
  language: 'en',
  toggleLanguage: () => {},
});

const STORAGE_KEY = 'eduportal-language';

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>('en');

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === 'en' || stored === 'ur') setLanguage(stored);
    } catch {
      // ignore — localStorage may be unavailable
    }
  }, []);

  function toggleLanguage() {
    setLanguage((prev) => {
      const next = prev === 'en' ? 'ur' : 'en';
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // ignore
      }
      return next;
    });
  }

  return <LanguageContext.Provider value={{ language, toggleLanguage }}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageContextValue {
  return useContext(LanguageContext);
}

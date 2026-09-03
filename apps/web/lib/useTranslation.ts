'use client';

import { useLanguage } from './LanguageContext';
import { translations } from './translations';

type TranslationKey = keyof typeof translations;

export function useTranslation() {
  const { language } = useLanguage();

  function t(key: TranslationKey | (string & {})): string {
    const entry = translations[key as TranslationKey];
    if (!entry) return key;
    return entry[language] ?? entry.en ?? key;
  }

  return { t, language };
}

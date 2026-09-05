'use client';

import { createContext, ReactNode, useContext, useEffect, useState } from 'react';

export interface SchoolFeatures {
  featureParentPortal: boolean;
  featureAi: boolean;
  featureSms: boolean;
  featureUrdu: boolean;
  featureCoordinator: boolean;
  featureLeaveRequests: boolean;
  featureConsentForms: boolean;
  featureFinance: boolean;
  featureAiInsights: boolean;
  featureAttendance: boolean;
  featureTimetable: boolean;
  featureAnnouncements: boolean;
  featureCalendar: boolean;
  featureReportCards: boolean;
  featureBadges: boolean;
  featureMonthlyReports: boolean;
}

// All true by default except the two features that need extra setup
// (SMS needs a provider, AI Insights is opt-in) — matches the School model's
// own column defaults, so a school with no row yet behaves the same as one
// that explicitly has everything on.
export const defaultFeatures: SchoolFeatures = {
  featureParentPortal: true,
  featureAi: false,
  featureSms: false,
  featureUrdu: true,
  featureCoordinator: true,
  featureLeaveRequests: true,
  featureConsentForms: true,
  featureFinance: true,
  featureAiInsights: false,
  featureAttendance: true,
  featureTimetable: true,
  featureAnnouncements: true,
  featureCalendar: true,
  featureReportCards: true,
  featureBadges: true,
  featureMonthlyReports: true,
};

const STORAGE_KEY = 'school_features';

interface FeaturesContextValue {
  features: SchoolFeatures;
  setFeatures: (f: SchoolFeatures) => void;
  hasFeature: (key: keyof SchoolFeatures) => boolean;
}

export const FeaturesContext = createContext<FeaturesContextValue>({
  features: defaultFeatures,
  setFeatures: () => {},
  hasFeature: () => true,
});

export function FeaturesProvider({ children }: { children: ReactNode }) {
  // Same hydration-safety rule as BrandingProvider: start from the default
  // on every render (server included), only read localStorage after mount.
  const [features, setFeaturesState] = useState<SchoolFeatures>(defaultFeatures);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        setFeaturesState({ ...defaultFeatures, ...(JSON.parse(saved) as Partial<SchoolFeatures>) });
      }
    } catch {
      // ignore — localStorage may be unavailable or hold invalid JSON
    }
  }, []);

  function setFeatures(f: SchoolFeatures) {
    setFeaturesState(f);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(f));
    } catch {
      // ignore
    }
  }

  function hasFeature(key: keyof SchoolFeatures): boolean {
    return features[key] ?? true;
  }

  return (
    <FeaturesContext.Provider value={{ features, setFeatures, hasFeature }}>
      {children}
    </FeaturesContext.Provider>
  );
}

export function useFeatures(): FeaturesContextValue {
  return useContext(FeaturesContext);
}

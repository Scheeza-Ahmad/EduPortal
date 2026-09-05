import { create } from 'zustand';
import type { Branding } from './BrandingContext';

export interface AuthUser {
  id: string;
  name: string;
  role: string;
  schoolId?: string | null;
}

interface AuthState {
  accessToken: string | null;
  user: AuthUser | null;
  branding: Branding | null;
  setAuth: (token: string, user: AuthUser) => void;
  setAccessToken: (token: string) => void;
  setBranding: (b: Branding | null) => void;
  clearAuth: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  user: null,
  branding: null,
  setAuth: (accessToken, user) => set({ accessToken, user }),
  setAccessToken: (accessToken) => set({ accessToken }),
  setBranding: (branding) => set({ branding }),
  clearAuth: () => set({ accessToken: null, user: null }),
}));

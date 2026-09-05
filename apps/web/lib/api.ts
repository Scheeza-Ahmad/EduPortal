import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { useAuthStore } from './store';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true, // send the httpOnly refresh-token cookie
  timeout: 30000, // generous enough to ride out a Supabase/Railway cold start
});

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

interface RetriableConfig extends InternalAxiosRequestConfig {
  _retry?: boolean;
  _networkRetry?: boolean;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let refreshPromise: Promise<string | null> | null = null;

function refreshAccessToken(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = axios
      .post(`${API_BASE_URL}/api/auth/refresh`, {}, { withCredentials: true, timeout: 10000 })
      .then((res) => res.data?.data?.accessToken as string | undefined)
      .then((token) => token ?? null)
      .catch(() => null)
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as RetriableConfig | undefined;

    // Rate-limited (429) — retrying immediately just spends the same limit
    // faster, so this deliberately skips the retry paths below. The backend
    // already sends a friendly `{ error: '...' }` message for this status;
    // normalize it here too in case a response ever slips through without
    // one, so no caller ever shows the raw "Request failed with status code
    // 429" AxiosError text.
    if (error.response?.status === 429) {
      const data = error.response.data as { error?: string } | undefined;
      if (!data?.error) {
        error.response.data = { success: false, error: 'Too many requests. Please wait a moment.' };
      }
      return Promise.reject(error);
    }

    // Transient failures (cold-start timeouts, connection resets, 5xx) — retry
    // once after a short delay before giving up, so a slow Supabase/Railway
    // wake-up doesn't surface as a hard error on the first request.
    const isNetworkOrServerError =
      error.code === 'ECONNABORTED' || error.message === 'Network Error' || (error.response?.status ?? 0) >= 500;
    if (isNetworkOrServerError && originalRequest && !originalRequest._networkRetry) {
      originalRequest._networkRetry = true;
      await delay(1000);
      return api(originalRequest);
    }

    if (error.response?.status === 401 && originalRequest && !originalRequest._retry) {
      originalRequest._retry = true;

      const newToken = await refreshAccessToken();

      if (newToken) {
        useAuthStore.getState().setAccessToken(newToken);
        originalRequest.headers = originalRequest.headers ?? {};
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return api(originalRequest);
      }

      useAuthStore.getState().clearAuth();
      if (typeof window !== 'undefined') {
        window.location.href = '/login';
      }
    }

    return Promise.reject(error);
  }
);

/** Uploads a file to Cloudinary via the backend and returns its URL. */
export async function uploadFile(file: File): Promise<string> {
  const formData = new FormData();
  formData.append('file', file);
  const res = await api.post<{ success: boolean; data: { url: string } }>('/api/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data.data.url;
}

export default api;

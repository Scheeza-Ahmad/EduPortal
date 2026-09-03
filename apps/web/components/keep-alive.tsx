'use client';

import { useEffect } from 'react';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const PING_INTERVAL_MS = 5 * 60 * 1000;

/** Pings the backend every 5 minutes so a quiet session doesn't hit a
 * Railway/Supabase cold start on the next real request. Renders nothing. */
export function KeepAlive() {
  useEffect(() => {
    const ping = () => {
      fetch(`${API_BASE_URL}/ping`).catch(() => {
        // Non-fatal — just a warm-up ping.
      });
    };
    ping();
    const interval = setInterval(ping, PING_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  return null;
}

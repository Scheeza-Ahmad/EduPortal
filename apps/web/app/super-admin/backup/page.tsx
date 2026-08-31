'use client';

import { useEffect, useState } from 'react';
import { AxiosError } from 'axios';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface BackupEntry {
  id: string;
  userId: string;
  createdAt: string;
  user: { name: string } | null;
}

export default function BackupPage() {
  const [history, setHistory] = useState<BackupEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadHistory() {
    setLoading(true);
    try {
      const res = await api.get<{
        success: boolean;
        data: { logs: BackupEntry[] };
      }>('/api/super/audit-logs?action=BACKUP&limit=20');
      setHistory(res.data.data.logs);
    } catch {
      setError('Failed to load backup history.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadHistory();
  }, []);

  async function handleTriggerBackup() {
    setTriggering(true);
    setMessage(null);
    setError(null);

    try {
      await api.post('/api/super/backup');
      setMessage('Backup triggered successfully.');
      await loadHistory();
    } catch (err) {
      const axiosErr = err as AxiosError<{ error?: string }>;
      setError(axiosErr.response?.data?.error ?? 'Failed to trigger backup.');
    } finally {
      setTriggering(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Backup</h1>
        <Button onClick={handleTriggerBackup} disabled={triggering}>
          {triggering ? 'Triggering...' : 'Trigger Backup Now'}
        </Button>
      </div>

      {message && <p className="text-sm text-green-600">{message}</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Backup History</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Triggered By</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={2} className="text-center text-muted-foreground">
                      No backups have run yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  history.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell className="text-muted-foreground">
                        {entry.user?.name ?? 'Unknown'}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(entry.createdAt).toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

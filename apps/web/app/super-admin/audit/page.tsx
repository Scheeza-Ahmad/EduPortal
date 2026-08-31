'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface AuditLogEntry {
  id: string;
  userId: string;
  action: string;
  targetTable: string | null;
  targetId: string | null;
  targetName: string | null;
  targetDisplay: string;
  createdAt: string;
  user: { name: string } | null;
}

const ACTIONS = [
  'SCHOOL_CREATE',
  'SCHOOL_UPDATE',
  'SCHOOL_DELETE',
  'ASSIGN_ADMIN',
  'SCHOOL_TOGGLE_FEATURES',
  'BACKUP',
  'IMPERSONATE',
];

const PAGE_LIMIT = 20;

export default function AuditLogPage() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [action, setAction] = useState<string>('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  async function loadLogs() {
    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('limit', String(PAGE_LIMIT));
    if (action !== 'all') params.set('action', action);
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);

    try {
      const res = await api.get<{
        success: boolean;
        data: { logs: AuditLogEntry[]; totalPages: number };
      }>(`/api/super/audit-logs?${params.toString()}`);
      setLogs(res.data.data.logs);
      setTotalPages(res.data.data.totalPages || 1);
    } catch {
      setError('Failed to load audit logs.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  function applyFilters() {
    setPage(1);
    loadLogs();
  }

  function clearFilters() {
    setAction('all');
    setStartDate('');
    setEndDate('');
    setPage(1);
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Audit Log</h1>

      <Card>
        <CardContent className="flex flex-wrap items-end gap-4 pt-6">
          <div className="space-y-2">
            <Label>Action</Label>
            <Select value={action} onValueChange={setAction}>
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder="All actions" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All actions</SelectItem>
                {ACTIONS.map((a) => (
                  <SelectItem key={a} value={a}>
                    {a}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="start-date">Start date</Label>
            <Input
              id="start-date"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="end-date">End date</Label>
            <Input
              id="end-date"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>

          <div className="flex gap-2">
            <Button onClick={applyFilters}>Apply</Button>
            <Button variant="outline" onClick={clearFilters}>
              Clear
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            All Entries {totalPages > 1 && `(page ${page} of ${totalPages})`}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Action</TableHead>
                    <TableHead>Target</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground">
                        No audit log entries match these filters.
                      </TableCell>
                    </TableRow>
                  ) : (
                    logs.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell className="font-medium">{log.action}</TableCell>
                        <TableCell>{log.targetDisplay}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {log.user?.name ?? log.userId.slice(0, 8)}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {new Date(log.createdAt).toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>

              <div className="mt-4 flex items-center justify-between">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </Button>
                <span className="text-sm text-muted-foreground">
                  Page {page} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Next
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

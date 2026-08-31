'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
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

interface ClassStat {
  classNumber: number;
  totalDue: number;
  collected: number;
  pending: number;
}

interface FinanceStats {
  totalDue: number;
  totalCollected: number;
  totalPending: number;
  overdueCount: number;
  collectionRate: number;
  totalLateFine: number;
  byClass: ClassStat[];
}

function defaultMonthYear(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export default function FinanceDashboardPage() {
  const [monthYear, setMonthYear] = useState(defaultMonthYear());
  const [stats, setStats] = useState<FinanceStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!monthYear) return;
    setLoading(true);
    setError(null);
    api
      .get<{ success: boolean; data: FinanceStats }>('/api/finance/stats', { params: { monthYear } })
      .then((res) => setStats(res.data.data))
      .catch(() => setError('Failed to load finance stats.'))
      .finally(() => setLoading(false));
  }, [monthYear]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-xl font-semibold">Finance Dashboard</h1>
        <div className="space-y-2">
          <Label>Month/Year</Label>
          <Input value={monthYear} onChange={(e) => setMonthYear(e.target.value)} placeholder="2024-09" />
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : !stats ? (
        <p className="text-sm text-muted-foreground">No data for this month yet.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
            <StatCard label="Total Due" value={`PKR ${stats.totalDue.toLocaleString()}`} />
            <StatCard label="Collected" value={`PKR ${stats.totalCollected.toLocaleString()}`} />
            <StatCard label="Pending" value={`PKR ${stats.totalPending.toLocaleString()}`} />
            <StatCard label="Collection Rate" value={`${stats.collectionRate.toFixed(1)}%`} />
            <StatCard label="Overdue Students" value={String(stats.overdueCount)} />
            <StatCard label="Late Fines" value={`PKR ${stats.totalLateFine.toLocaleString()}`} />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">By Class</CardTitle>
            </CardHeader>
            <CardContent>
              {stats.byClass.length === 0 ? (
                <p className="text-sm text-muted-foreground">No fee structures for this month.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Class</TableHead>
                      <TableHead>Total Due</TableHead>
                      <TableHead>Collected</TableHead>
                      <TableHead>Pending</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {stats.byClass.map((c) => (
                      <TableRow key={c.classNumber}>
                        <TableCell className="font-medium">Class {c.classNumber}</TableCell>
                        <TableCell>PKR {c.totalDue.toLocaleString()}</TableCell>
                        <TableCell>PKR {c.collected.toLocaleString()}</TableCell>
                        <TableCell>PKR {c.pending.toLocaleString()}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="mt-1 text-lg font-semibold">{value}</div>
      </CardContent>
    </Card>
  );
}

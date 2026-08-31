'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

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
  statusCounts: { paid: number; partial: number; unpaid: number; overdue: number };
}

interface TrendPoint {
  month: string;
  monthLabel: string;
  totalDue: number;
  totalCollected: number;
  totalPending: number;
}

interface ActivityPoint {
  date: string;
  dayLabel: string;
  count: number;
}

interface OverdueStudent {
  studentName: string;
  className: number | null;
  section: string | null;
  totalDue: number;
  paidAmount: number;
  dueDate: string;
  daysOverdue: number;
}

interface RecentPayment {
  studentName: string;
  amount: number;
  paymentDate: string;
  receiptNumber: string;
}

const DONUT_COLORS: Record<string, string> = {
  Paid: '#22c55e',
  Partial: '#eab308',
  Overdue: '#ef4444',
  Unpaid: '#94a3b8',
};

function defaultMonthYear(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function monthYearLabel(monthYear: string): string {
  const [y, m] = monthYear.split('-').map(Number);
  if (!y || !m) return monthYear;
  return new Date(y, m - 1, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' });
}

function money(n: number): string {
  return `PKR ${n.toLocaleString()}`;
}

export default function FinanceDashboardPage() {
  const [monthYear, setMonthYear] = useState(defaultMonthYear());
  const [stats, setStats] = useState<FinanceStats | null>(null);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [activity, setActivity] = useState<ActivityPoint[]>([]);
  const [overdue, setOverdue] = useState<OverdueStudent[]>([]);
  const [recentPayments, setRecentPayments] = useState<RecentPayment[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Month-dependent (KPI cards + donut).
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

  // Independent of the selected month — fetched once.
  useEffect(() => {
    api
      .get<{ success: boolean; data: { trend: TrendPoint[] } }>('/api/finance/stats/trend', {
        params: { months: 6 },
      })
      .then((res) => setTrend(res.data.data.trend))
      .catch(() => {});

    api
      .get<{ success: boolean; data: { activity: ActivityPoint[] } }>('/api/finance/stats/payment-activity', {
        params: { days: 7 },
      })
      .then((res) => setActivity(res.data.data.activity))
      .catch(() => {});

    api
      .get<{ success: boolean; data: { overdue: OverdueStudent[] } }>('/api/finance/stats/overdue')
      .then((res) => setOverdue(res.data.data.overdue))
      .catch(() => {});

    api
      .get<{ success: boolean; data: { payments: RecentPayment[] } }>('/api/finance/stats/recent-payments', {
        params: { limit: 10 },
      })
      .then((res) => setRecentPayments(res.data.data.payments))
      .catch(() => {});
  }, []);

  const donutData = stats
    ? [
        { name: 'Paid', value: stats.statusCounts.paid },
        { name: 'Partial', value: stats.statusCounts.partial },
        { name: 'Overdue', value: stats.statusCounts.overdue },
        { name: 'Unpaid', value: stats.statusCounts.unpaid },
      ].filter((d) => d.value > 0)
    : [];

  const classChartData = (stats?.byClass ?? []).map((c) => ({
    classLabel: `Class ${c.classNumber}`,
    Collected: c.collected,
    Pending: c.pending,
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-xl font-semibold">Finance Dashboard</h1>
        <div className="space-y-2">
          <Label>Month/Year</Label>
          <Input value={monthYear} onChange={(e) => setMonthYear(e.target.value)} placeholder="2026-09" />
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
          {/* Row 1 — KPI Cards */}
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
            <KpiCard icon="💰" label="Total Due" value={money(stats.totalDue)} bg="#3b82f6" />
            <KpiCard icon="✅" label="Collected" value={money(stats.totalCollected)} bg="#22c55e" />
            <KpiCard icon="⏳" label="Pending" value={money(stats.totalPending)} bg="#f97316" />
            <KpiCard
              icon="📊"
              label="Collection Rate"
              value={`${stats.collectionRate.toFixed(1)}%`}
              bg="#8b5cf6"
              big
            />
            <KpiCard icon="⚠️" label="Overdue Students" value={String(stats.overdueCount)} bg="#ef4444" />
            <KpiCard icon="🕐" label="Late Fines" value={money(stats.totalLateFine)} bg="#eab308" />
          </div>

          {/* Row 2 — Trend + Donut */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
            <Card className="lg:col-span-3">
              <CardHeader>
                <CardTitle className="text-base">Collection Trend (Last 6 Months)</CardTitle>
              </CardHeader>
              <CardContent className="h-72">
                {trend.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No trend data yet.</p>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={trend}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                      <XAxis dataKey="monthLabel" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                      <Tooltip formatter={(v: number) => money(v)} />
                      <Legend />
                      <Area
                        type="monotone"
                        dataKey="totalCollected"
                        name="Collected"
                        stroke="#22c55e"
                        fill="#22c55e"
                        fillOpacity={0.35}
                      />
                      <Area
                        type="monotone"
                        dataKey="totalPending"
                        name="Pending"
                        stroke="#f97316"
                        fill="#f97316"
                        fillOpacity={0.35}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">Fee Status — {monthYearLabel(monthYear)}</CardTitle>
              </CardHeader>
              <CardContent className="h-72">
                {donutData.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No fee records for this month.</p>
                ) : (
                  <div className="relative h-full w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={donutData}
                          dataKey="value"
                          nameKey="name"
                          innerRadius="55%"
                          outerRadius="80%"
                          paddingAngle={2}
                        >
                          {donutData.map((entry) => (
                            <Cell key={entry.name} fill={DONUT_COLORS[entry.name]} />
                          ))}
                        </Pie>
                        <Tooltip />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center pb-8">
                      <span className="text-2xl font-bold">{stats.collectionRate.toFixed(0)}%</span>
                      <span className="text-xs text-muted-foreground">Collected</span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Row 3 — Class-wise + Payment Activity */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Collection by Class</CardTitle>
              </CardHeader>
              <CardContent className="h-72">
                {classChartData.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No fee structures for this month.</p>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={classChartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                      <XAxis dataKey="classLabel" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                      <Tooltip formatter={(v: number) => money(v)} />
                      <Legend />
                      <Bar dataKey="Collected" fill="#22c55e" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="Pending" fill="#f97316" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Payment Activity (Last 7 Days)</CardTitle>
              </CardHeader>
              <CardContent className="h-72">
                {activity.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No payment activity yet.</p>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={activity}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                      <XAxis dataKey="dayLabel" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                      <Tooltip />
                      <Bar dataKey="count" name="Payments" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Row 4 — Overdue + Recent Payments */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="bg-red-50">
                <CardTitle className="text-base text-red-700">⚠️ Overdue Students</CardTitle>
              </CardHeader>
              <CardContent className="pt-4">
                {overdue.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No overdue students 🎉</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left text-xs text-muted-foreground">
                          <th className="py-1 pr-2">Student</th>
                          <th className="py-1 pr-2">Class</th>
                          <th className="py-1 pr-2">Amount Due</th>
                          <th className="py-1 pr-2">Days Overdue</th>
                        </tr>
                      </thead>
                      <tbody>
                        {overdue.map((s, i) => (
                          <tr
                            key={i}
                            className={`border-b last:border-0 ${s.daysOverdue > 30 ? 'bg-red-50' : ''}`}
                          >
                            <td className="py-1.5 pr-2 font-medium">{s.studentName}</td>
                            <td className="py-1.5 pr-2 text-muted-foreground">
                              {s.className != null ? `Class ${s.className}${s.section ? ` - ${s.section}` : ''}` : '—'}
                            </td>
                            <td className="py-1.5 pr-2">{money(s.totalDue - s.paidAmount)}</td>
                            <td className={`py-1.5 pr-2 ${s.daysOverdue > 30 ? 'font-semibold text-red-700' : ''}`}>
                              {s.daysOverdue}d
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="bg-green-50">
                <CardTitle className="text-base text-green-700">✅ Recent Payments</CardTitle>
              </CardHeader>
              <CardContent className="pt-4">
                {recentPayments.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No payments recorded yet.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left text-xs text-muted-foreground">
                          <th className="py-1 pr-2">Student</th>
                          <th className="py-1 pr-2">Amount</th>
                          <th className="py-1 pr-2">Date</th>
                          <th className="py-1 pr-2">Receipt</th>
                        </tr>
                      </thead>
                      <tbody>
                        {recentPayments.map((p, i) => (
                          <tr key={i} className="border-b last:border-0">
                            <td className="py-1.5 pr-2 font-medium">{p.studentName}</td>
                            <td className="py-1.5 pr-2 font-medium text-green-700">{money(p.amount)}</td>
                            <td className="py-1.5 pr-2 text-muted-foreground">
                              {new Date(p.paymentDate).toLocaleDateString()}
                            </td>
                            <td className="py-1.5 pr-2 text-muted-foreground">{p.receiptNumber}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  bg,
  big,
}: {
  icon: string;
  label: string;
  value: string;
  bg: string;
  big?: boolean;
}) {
  return (
    <div className="rounded-lg p-4 text-white shadow-sm" style={{ backgroundColor: bg }}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium opacity-90">{label}</span>
        <span className="text-lg">{icon}</span>
      </div>
      <div className={big ? 'mt-2 text-3xl font-bold' : 'mt-2 text-lg font-semibold'}>{value}</div>
    </div>
  );
}

'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface Teacher {
  teacherId: string;
  teacherName: string;
  email: string;
  lastLoginAt: string | null;
  classesCount: number;
  activitiesThisMonth: number;
  lastActiveDate: string | null;
  activityStatus: 'active' | 'low' | 'inactive';
  reportStatus: string;
}

function StatusPill({ status }: { status: 'active' | 'low' | 'inactive' }) {
  const style =
    status === 'active'
      ? 'bg-green-100 text-green-800'
      : status === 'low'
        ? 'bg-yellow-100 text-yellow-800'
        : 'bg-red-100 text-red-800';
  return <Badge variant="outline" className={style}>{status.toUpperCase()}</Badge>;
}

export default function CoordinatorTeachersPage() {
  const router = useRouter();
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [reportFilter, setReportFilter] = useState('all');
  const [remindingId, setRemindingId] = useState<string | null>(null);
  const [reminded, setReminded] = useState<Set<string>>(new Set());

  useEffect(() => {
    api
      .get<{ success: boolean; data: { teachers: Teacher[] } }>('/api/coordinator/teachers')
      .then((res) => setTeachers(res.data.data.teachers))
      .catch(() => setError('Failed to load teachers.'))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(
    () =>
      teachers.filter((t) => {
        if (statusFilter !== 'all' && t.activityStatus !== statusFilter) return false;
        if (reportFilter !== 'all' && t.reportStatus !== reportFilter) return false;
        return true;
      }),
    [teachers, statusFilter, reportFilter]
  );

  async function handleRemind(teacherId: string) {
    setRemindingId(teacherId);
    try {
      await api.post(`/api/coordinator/teachers/${teacherId}/remind`);
      setReminded((prev) => new Set(prev).add(teacherId));
    } catch {
      setError('Failed to send reminder.');
    } finally {
      setRemindingId(null);
    }
  }

  if (loading) return <p className="text-sm text-muted-foreground">Loading teachers...</p>;
  if (error) return <p className="text-sm text-destructive">{error}</p>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">Wing Teachers</h1>
        <div className="flex gap-3">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
          <Select value={reportFilter} onValueChange={setReportFilter}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Report Statuses</SelectItem>
              <SelectItem value="none">Not Started</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="submitted">Submitted</SelectItem>
              <SelectItem value="reviewed">Reviewed</SelectItem>
              <SelectItem value="forwarded">Forwarded</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-center text-sm text-muted-foreground">
            No teachers match these filters.
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Classes</TableHead>
                <TableHead>Activities</TableHead>
                <TableHead>Last Login</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Report Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((t) => (
                <TableRow key={t.teacherId}>
                  <TableCell className="font-medium">{t.teacherName}</TableCell>
                  <TableCell className="text-muted-foreground">{t.email}</TableCell>
                  <TableCell>{t.classesCount}</TableCell>
                  <TableCell>{t.activitiesThisMonth}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {t.lastLoginAt ? new Date(t.lastLoginAt).toLocaleDateString() : '—'}
                  </TableCell>
                  <TableCell>
                    <StatusPill status={t.activityStatus} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">{t.reportStatus}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => router.push(`/coordinator/teachers/${t.teacherId}`)}>
                        View Details
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={remindingId === t.teacherId || reminded.has(t.teacherId)}
                        onClick={() => handleRemind(t.teacherId)}
                      >
                        {reminded.has(t.teacherId)
                          ? 'Reminded'
                          : remindingId === t.teacherId
                            ? 'Sending...'
                            : 'Send Reminder'}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

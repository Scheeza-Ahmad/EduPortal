'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

interface AtRiskStudent {
  studentId: string;
  studentName: string;
  className: number;
  section: string;
  attendanceRate: number;
  avgGrade: number;
  submissionRate: number;
  riskScore: number;
  riskLevel: 'high' | 'medium' | 'low';
  primaryReason: string;
}

const RISK_BADGE_STYLE: Record<string, string> = {
  high: 'bg-red-100 text-red-800',
  medium: 'bg-yellow-100 text-yellow-800',
};

function riskBarColor(score: number): string {
  if (score >= 70) return '#ef4444';
  if (score >= 40) return '#eab308';
  return '#22c55e';
}

const RECOMMENDATION_BY_REASON: Record<string, string> = {
  'Low attendance': 'Schedule a parent meeting to discuss attendance and identify barriers.',
  'Poor grades': 'Arrange extra academic support or tutoring sessions with the subject teacher.',
  'Not submitting': "Check in with the student directly — work with the teacher on submission reminders.",
};

export default function AtRiskStudentsPage() {
  const [students, setStudents] = useState<AtRiskStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('all');
  const [selected, setSelected] = useState<AtRiskStudent | null>(null);

  useEffect(() => {
    api
      .get<{ success: boolean; data: AtRiskStudent[] }>('/api/admin/at-risk-students')
      .then((res) => setStudents(res.data.data))
      .catch(() => setError('Failed to load at-risk students.'))
      .finally(() => setLoading(false));
  }, []);

  const highCount = students.filter((s) => s.riskLevel === 'high').length;
  const mediumCount = students.filter((s) => s.riskLevel === 'medium').length;
  const filtered = filter === 'all' ? students : students.filter((s) => s.riskLevel === filter);

  if (loading) return <p className="text-sm text-muted-foreground">Loading...</p>;
  if (error) return <p className="text-sm text-destructive">{error}</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">⚠️ At-Risk Students</h1>
        <p className="text-sm text-muted-foreground">Students who may need additional support</p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:w-96">
        <Card>
          <CardContent className="pt-6">
            <div className="text-xs text-muted-foreground">🔴 High Risk</div>
            <div className="mt-1 text-2xl font-bold text-red-600">{highCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-xs text-muted-foreground">🟡 Medium Risk</div>
            <div className="mt-1 text-2xl font-bold text-yellow-600">{mediumCount}</div>
          </CardContent>
        </Card>
      </div>

      <Select value={filter} onValueChange={setFilter}>
        <SelectTrigger className="w-48">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Risk Levels</SelectItem>
          <SelectItem value="high">High Risk</SelectItem>
          <SelectItem value="medium">Medium Risk</SelectItem>
        </SelectContent>
      </Select>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-center text-sm text-muted-foreground">
            No students match this filter 🎉
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Student</TableHead>
                <TableHead>Class</TableHead>
                <TableHead>Attendance</TableHead>
                <TableHead>Avg Grade</TableHead>
                <TableHead>Submission Rate</TableHead>
                <TableHead>Risk Score</TableHead>
                <TableHead>Risk Level</TableHead>
                <TableHead>Primary Reason</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((s) => (
                <TableRow key={s.studentId} className="cursor-pointer" onClick={() => setSelected(s)}>
                  <TableCell className="font-medium">{s.studentName}</TableCell>
                  <TableCell>
                    {s.className}-{s.section}
                  </TableCell>
                  <TableCell>{s.attendanceRate}%</TableCell>
                  <TableCell>{s.avgGrade}%</TableCell>
                  <TableCell>{s.submissionRate}%</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-16 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full"
                          style={{ width: `${s.riskScore}%`, backgroundColor: riskBarColor(s.riskScore) }}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground">{s.riskScore}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={RISK_BADGE_STYLE[s.riskLevel]}>
                      {s.riskLevel === 'high' ? 'HIGH RISK' : 'MEDIUM RISK'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{s.primaryReason}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {selected?.studentName} — Class {selected?.className}-{selected?.section}
            </DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4 text-sm">
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={[
                      { factor: 'Attendance', value: selected.attendanceRate },
                      { factor: 'Grades', value: selected.avgGrade },
                      { factor: 'Submissions', value: selected.submissionRate },
                    ]}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                    <XAxis dataKey="factor" tick={{ fontSize: 12 }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} />
                    <Tooltip formatter={(v: number) => `${v}%`} />
                    <Bar dataKey="value" fill={riskBarColor(selected.riskScore)} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="rounded-md border p-3">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Risk Score</span>
                  <span className="font-semibold">{selected.riskScore} / 100</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Primary Reason</span>
                  <span className="font-semibold">{selected.primaryReason}</span>
                </div>
              </div>
              <div className="rounded-md border bg-muted/30 p-3">
                <div className="mb-1 font-medium">Recommendation</div>
                <p className="text-muted-foreground">
                  {RECOMMENDATION_BY_REASON[selected.primaryReason] ?? 'Monitor closely and check in regularly.'}
                </p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
